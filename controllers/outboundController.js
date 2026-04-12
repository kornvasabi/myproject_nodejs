const db = require('../config/db_para');

// 🟢 1. เปิดหน้าจอจัดการส่งออก
exports.outboundPage = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        // ดึงข้อมูลสาขา และ โรงงาน ที่ยังใช้งานอยู่ มาแสดงใน Dropdown
        let branchSql = 'SELECT id, branch_name FROM branches WHERE is_active = 1';
        let branchParams = [];

        let factoriesSql = 'SELECT id, factory_name, branch_id FROM factories WHERE is_active = 1';
        let factoriesParams = [];
        
        // 🚀 กรองรายชื่อสาขาใน Dropdown (ทั้งในหน้าค้นหาและใน Modal)
        if (accessLevel === 3) {
            branchSql += ' AND id = ?';
            factoriesSql += ' AND branch_id = ?';

            branchParams.push(userBranchId);
            factoriesParams.push(userBranchId);
        } else if (accessLevel === 2) {
            branchSql += ' AND (id = ? OR id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))';
            factoriesSql += ' AND (branch_id = ? OR branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))';
            
            branchParams.push(userBranchId, userId);
            factoriesParams.push(userBranchId, userId);
        }

        const [branches] = await db.query(branchSql, branchParams);
        const [factories] = await db.query(factoriesSql, factoriesParams);
        
        res.render('outbounds', { 
            title: 'ส่งน้ำยางเข้าโรงงาน', 
            branches: branches, 
            factories: factories,
            accessLevel: accessLevel
        });
    } catch (error) {
        console.error("Outbound Page Error:", error);
        res.status(500).send('Server Error');
    }
};

// 🟢 2. ดึงข้อมูลรายการส่งออก (API)
exports.getOutbounds = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        let sql = `
            SELECT o.*, 
                   DATE_FORMAT(o.delivery_datetime, '%d/%m/%Y %H:%i') AS formatted_date,
                   b.branch_name, f.factory_name
            FROM outbound_transactions o
            LEFT JOIN branches b ON o.branch_id = b.id
            LEFT JOIN factories f ON o.factory_id = f.id
            where 1 = 1
        `;

        let params = [];

        if (accessLevel === 3){
            sql += ` AND o.branch_id = ? `;
            params.push(userBranchId); 
        }else if(accessLevel === 2){
            sql += ` AND (o.branch_id = ? OR o.branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = ?)) `;
            params.push(userBranchId, userId);
        }
        
        sql += `order by o.delivery_datetime desc, o.id desc`;

        // console.log("SQL:", sql);
        //console.log("accessLevel:", accessLevel);
        //console.log("userId:", userId);
        //console.log("userBranchId:", userBranchId);

        const [outbounds] = await db.query(sql, params);

        res.json({ status: 'success', data: outbounds });
    } catch (error) {
        console.error("Get Outbounds Error:", error);
        res.status(500).json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. สร้างบิลส่งออกใหม่ (เปิดบิลรถออกจากลาน)
exports.addOutbound = async (req, res) => {
    const { branch_id, factory_id, yard_net_weight, yard_drc_percent, transport_cost } = req.body;
    const staffId = req.session && req.session.user ? req.session.user.id : 1; 

    if (!branch_id || !factory_id || !yard_net_weight || !yard_drc_percent) {
        return res.json({ status: 'error', message: 'กรุณากรอกข้อมูลสำคัญให้ครบถ้วน' });
    }

    const weightToDeduct = parseFloat(yard_net_weight);

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // 🚀 1. เช็คสต็อกปัจจุบันก่อนว่ามีของพอให้ส่งไหม (เพื่อป้องกันติดลบ)
        const [lastLedger] = await connection.query(`
            SELECT balance FROM inventory_ledgers WHERE branch_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE
        `, [branch_id]);

        let currentBalance = lastLedger.length > 0 ? parseFloat(lastLedger[0].balance) : 0;

        if (currentBalance < weightToDeduct) {
            throw new Error(`สต็อกน้ำยางของสาขานี้ไม่เพียงพอ (มีอยู่ ${currentBalance.toFixed(2)} กก. แต่พยายามส่ง ${weightToDeduct.toFixed(2)} กก.)`);
        }

        // 🚀 2. สร้างเลขที่บิล OUT-YYMMDD-BBB-SSS
        const now = new Date();
        const dateStr = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const branchStr = String(branch_id).padStart(3, '0');
        const searchPrefix = `OUT-${dateStr}-${branchStr}-`;

        const [lastReceiptRow] = await connection.query(
            `SELECT delivery_no FROM outbound_transactions WHERE delivery_no LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE`, 
            [`${searchPrefix}%`]
        );

        let nextSeq = 1;
        if (lastReceiptRow.length > 0) {
            const parts = lastReceiptRow[0].delivery_no.split('-');
            nextSeq = parseInt(parts[parts.length - 1], 10) + 1;
        }
        const deliveryNo = `${searchPrefix}${String(nextSeq).padStart(3, '0')}`;

        // 🚀 3. บันทึกใบส่งออก
        const [insertResult] = await connection.query(`
            INSERT INTO outbound_transactions 
            (branch_id, factory_id, staff_id, delivery_no, delivery_datetime, yard_net_weight, yard_drc_percent, transport_cost, status) 
            VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 'processing')
        `, [branch_id, factory_id, staffId, deliveryNo, weightToDeduct, yard_drc_percent, transport_cost || 0]);

        // 🚀 4. ตัดสต็อกออกจากสมุดบัญชี (Inventory Ledger)
        let newBalance = currentBalance - weightToDeduct;
        await connection.query(`
            INSERT INTO inventory_ledgers 
            (branch_id, transaction_type, reference_id, movement_date, volume_out, balance) 
            VALUES (?, 'outbound', ?, NOW(), ?, ?)
        `, [branch_id, insertResult.insertId, weightToDeduct, newBalance]);

        await connection.commit();
        res.json({ status: 'success', message: `สร้างเอกสารส่งออกเลขที่ ${deliveryNo} และตัดสต็อกเรียบร้อยแล้ว` });

    } catch (error) {
        await connection.rollback();
        console.error("Add Outbound Error:", error);
        res.status(500).json({ status: 'error', message: error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    } finally {
        connection.release();
    }
};

// 🟢 4. อัปเดตข้อมูลและปิดบิล (เมื่อได้บิลกลับมาจากโรงงาน)
exports.closeOutbound = async (req, res) => {
    try {
        const id = req.params.id;
        const { factory_net_weight, factory_drc_percent, factory_unit_price, total_revenue, total_cost, net_profit } = req.body;

        // เช็คว่าถ้ามีการส่งค่าน้ำหนักโรงงานมา แปลว่ากำลังจะปิดบิล
        if (!factory_net_weight || !factory_drc_percent || !factory_unit_price) {
            return res.json({ status: 'error', message: 'กรุณากรอกข้อมูลที่ได้จากโรงงานให้ครบถ้วนเพื่อปิดบิล' });
        }

        await db.query(`
            UPDATE outbound_transactions 
            SET factory_net_weight = ?, factory_drc_percent = ?, factory_unit_price = ?, 
                total_revenue = ?, total_cost = ?, net_profit = ?, status = 'completed'
            WHERE id = ? AND status = 'processing'
        `, [factory_net_weight, factory_drc_percent, factory_unit_price, total_revenue, total_cost, net_profit, id]);

        res.json({ status: 'success', message: 'บันทึกข้อมูลโรงงานและปิดบิลสำเร็จ!' });
    } catch (error) {
        console.error("Close Outbound Error:", error);
        res.status(500).json({ status: 'error', message: 'อัปเดตบิลไม่สำเร็จ' });
    }
};

// 🟢 5. ยกเลิกบิล (กรณีรถไม่ได้ไป หรือคีย์ผิด) -> ต้องคืนสต็อกด้วย!
exports.cancelOutbound = async (req, res) => {
    const id = req.params.id;
    
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // หาข้อมูลบิลเดิมเพื่อเตรียมคืนของ
        const [txData] = await connection.query(`
            SELECT branch_id, yard_net_weight, status FROM outbound_transactions WHERE id = ? FOR UPDATE
        `, [id]);

        if (txData.length === 0) throw new Error('ไม่พบบิลนี้ในระบบ');
        if (txData[0].status !== 'processing') throw new Error('ไม่สามารถยกเลิกบิลที่ปิดยอดหรือยกเลิกไปแล้วได้');

        const branchId = txData[0].branch_id;
        const weightToReturn = parseFloat(txData[0].yard_net_weight);

        // เปลี่ยนสถานะบิล
        await connection.query(`UPDATE outbound_transactions SET status = 'cancelled' WHERE id = ?`, [id]);

        // คืนสต็อก
        const [lastLedger] = await connection.query(`
            SELECT balance FROM inventory_ledgers WHERE branch_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE
        `, [branchId]);
        
        let currentBalance = lastLedger.length > 0 ? parseFloat(lastLedger[0].balance) : 0;
        let newBalance = currentBalance + weightToReturn; // เอาของมาบวกคืน

        await connection.query(`
            INSERT INTO inventory_ledgers 
            (branch_id, transaction_type, reference_id, movement_date, volume_in, balance) 
            VALUES (?, 'cancel_outbound', ?, NOW(), ?, ?)
        `, [branchId, id, weightToReturn, newBalance]);

        await connection.commit();
        res.json({ status: 'success', message: 'ยกเลิกบิลส่งออก และคืนสต็อกน้ำยางเรียบร้อยแล้ว' });

    } catch (error) {
        await connection.rollback();
        console.error("Cancel Outbound Error:", error);
        res.status(500).json({ status: 'error', message: error.message || 'เกิดข้อผิดพลาดในการยกเลิก' });
    } finally {
        connection.release();
    }
};