const db = require('../config/db_para'); // ปรับ path ให้ตรงกับไฟล์ db ของคุณกรนะครับ

// =========================================================================
// 1. [GET] ฟังก์ชันเปิดหน้าเว็บ (ดึงข้อมูลแยกตามสาขาและ Level)
// =========================================================================
exports.getParasalesList = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        // 🚀 1. กำหนดเงื่อนไขการค้นหาสาขาตามสิทธิ์ (เขียนแยกกันชัดเจน ป้องกันบั๊กทับซ้อน)
        let branchCond = '';
        let custCond = '';
        let txCond = '';
        let params = [];
        
        if (accessLevel === 3) {
            branchCond = 'id = ?';
            custCond = 'branch_id = ?';
            txCond = 'it.branch_id = ?';
            params.push(userBranchId);

        } else if (accessLevel === 2) {
            branchCond = '(id = ? OR id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))';
            custCond = '(branch_id = ? OR branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))';
            txCond = '(it.branch_id = ? OR it.branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))';
            params.push(userBranchId, userId);

        } else {
            branchCond = '1=1'; // Level 1 เห็นหมด
            custCond = '1=1';
            txCond = '1=1';
        }

        // ดึงรายชื่อสาขาที่เข้าถึงได้
        const [branches] = await db.query(`SELECT id, branch_name FROM branches WHERE is_active = 1 AND ${branchCond}`, params);

        // 🚀 2. หาสาขาล่าสุดที่พนักงานคนนี้เพิ่งคีย์บิลไป
        let lastUsedBranchId = userBranchId; 
        if (accessLevel < 3) {
            const [lastTx] = await db.query(`SELECT branch_id FROM inbound_transactions WHERE staff_id = ? ORDER BY id DESC LIMIT 1`, [userId]);
            if (lastTx.length > 0) {
                lastUsedBranchId = lastTx[0].branch_id;
            }
        }

        // 🚀 3. ดึงราคารับซื้อ "ล่าสุด" ของทุกๆ สาขาที่เข้าถึงได้
        const [prices] = await db.query(`
            SELECT branch_id, buy_price_per_kg FROM daily_prices 
            WHERE (branch_id, effective_date) IN (SELECT branch_id, MAX(effective_date) FROM daily_prices GROUP BY branch_id)
        `);
        let branchPrices = {};
        prices.forEach(p => branchPrices[p.branch_id] = p.buy_price_per_kg);
        const dailyPrice = branchPrices[lastUsedBranchId] || 0;

        // 🚀 4. ดึงรายชื่อลูกค้าของสาขาที่เข้าถึงได้ทั้งหมด (ใช้ custCond ที่เตรียมไว้)
        const [customers] = await db.query(`
            SELECT id, customer_code, customer_name, branch_id 
            FROM customers WHERE is_active = 1 AND ${custCond}
        `, params);

        // 🚀 5. ดึงประวัติบิล โชว์เฉพาะสาขาที่เข้าถึงได้ (ใช้ txCond ที่เตรียมไว้)
        const [transactions] = await db.query(`
            SELECT it.*, c.customer_name, b.branch_name,
                   DATE_FORMAT(it.transaction_datetime, '%d/%m/%Y %H:%i') as formatted_date
            FROM inbound_transactions it
            LEFT JOIN customers c ON it.customer_id = c.id
            LEFT JOIN branches b ON it.branch_id = b.id
            WHERE ${txCond}
            ORDER BY it.transaction_datetime DESC LIMIT 50
        `, params);

        res.render('parasales_list', {
            title: 'รับซื้อน้ำยางหน้าร้าน',
            accessLevel,
            branches,
            lastUsedBranchId,
            branchPrices: JSON.stringify(branchPrices), // ส่งไปให้ JS เปลี่ยนราคา Real-time
            customersData: JSON.stringify(customers),   // ส่งไปให้ JS กรองรายชื่อลูกค้า Real-time
            dailyPrice,
            transactions
        });

    } catch (error) {
        console.error("❌ Error getParasalesList:", error);
        res.status(500).send("ระบบขัดข้อง ไม่สามารถดึงข้อมูลได้");
    }
};

// =========================================================================
// 2. [POST] บันทึกบิลรับซื้อ
// =========================================================================
exports.addTransaction = async (req, res) => {
    // 🚀 เพิ่มการรับค่า branch_id จากหน้าเว็บ
    let { branch_id, customer_id, gross_weight, tare_weight, net_weight, drc_percent, dry_rubber_weight, unit_price, total_amount, payment_method, payment_status } = req.body;

    const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;
    const staffId = req.session.user.id;
    
    // บังคับสาขาถ้าเป็น Level 3
    if (accessLevel === 3) {
        branch_id = req.session.user.branch_id; 
    }

    let ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    if (ipAddress.includes(',')) ipAddress = ipAddress.split(',')[0].trim();

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const now = new Date();
        const dateStr = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const branchStr = String(branch_id).padStart(3, '0'); // ใช้ branch_id ที่รับมา
        const searchPrefix = `REC-${dateStr}-${branchStr}-`;

        const [lastReceiptRow] = await connection.query(`
            SELECT receipt_no FROM inbound_transactions WHERE receipt_no LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE
        `, [`${searchPrefix}%`]);

        let nextSeq = 1;
        if (lastReceiptRow.length > 0) {
            nextSeq = parseInt(lastReceiptRow[0].receipt_no.split('-').pop(), 10) + 1;
        }
        const receiptNo = `${searchPrefix}${String(nextSeq).padStart(3, '0')}`;

        const [insertResult] = await connection.query(`
            INSERT INTO inbound_transactions 
            (branch_id, receipt_no, transaction_datetime, customer_id, staff_id, gross_weight, tare_weight, net_weight, drc_percent, dry_rubber_weight, unit_price, total_amount, payment_status, payment_method) 
            VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [branch_id, receiptNo, customer_id, staffId, gross_weight, tare_weight, net_weight, drc_percent, dry_rubber_weight, unit_price, total_amount, payment_status, payment_method]);
        
        const newTransactionId = insertResult.insertId;

        const [lastLedger] = await connection.query(`SELECT balance FROM inventory_ledgers WHERE branch_id = ? ORDER BY id DESC LIMIT 1`, [branch_id]);
        let newBalance = (lastLedger.length > 0 ? parseFloat(lastLedger[0].balance) : 0) + parseFloat(net_weight);

        await connection.query(`
            INSERT INTO inventory_ledgers (branch_id, transaction_type, reference_id, movement_date, volume_in, balance) 
            VALUES (?, 'inbound', ?, NOW(), ?, ?)
        `, [branch_id, newTransactionId, net_weight, newBalance]);

        await connection.query(`
            INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values, ip_address) 
            VALUES (?, 'INSERT', 'inbound_transactions', ?, ?, ?)
        `, [staffId, newTransactionId, JSON.stringify({ receipt_no: receiptNo, net_weight, total_amount }), ipAddress]);

        // ดึงข้อมูลเพื่อโชว์กลับหน้าจอ (JOIN branches ด้วย)
        const [newRecord] = await connection.query(`
            SELECT it.id, it.receipt_no, DATE_FORMAT(it.transaction_datetime, '%d/%m/%Y %H:%i') as formatted_date,
                   c.customer_name, b.branch_name, it.net_weight, it.drc_percent, it.total_amount, it.payment_status
            FROM inbound_transactions it
            LEFT JOIN customers c ON it.customer_id = c.id
            LEFT JOIN branches b ON it.branch_id = b.id
            WHERE it.id = ?
        `, [newTransactionId]);

        await connection.commit();
        res.json({ status: 'success', message: `บันทึกบิล ${receiptNo} สำเร็จ!`, data: newRecord[0] });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    } finally {
        if (connection) connection.release();
    }
};

// 🟢 [GET] ดึงประวัติการขาย 5 ครั้งล่าสุดของลูกค้า (API)
exports.getCustomerHistory = async (req, res) => {
    try {
        const customerId = req.params.id;
        const [history] = await db.query(`
            SELECT 
                DATE_FORMAT(transaction_datetime, '%d/%m/%Y') as date,
                net_weight,
                drc_percent
            FROM inbound_transactions 
            WHERE customer_id = ? 
            ORDER BY transaction_datetime DESC 
            LIMIT 5
        `, [customerId]);

        res.json({ status: 'success', data: history });
    } catch (error) {
        console.error("Error getCustomerHistory:", error);
        res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงประวัติลูกค้าได้' });
    }
};

// 🟢 [GET] API ดึงรายละเอียดบิล 1 รายการเพื่อโชว์ใน Modal
exports.getTransactionDetail = async (req, res) => {
    try {
        const txId = req.params.id;
        const [details] = await db.query(`
            SELECT it.*,b.branch_name,
                   DATE_FORMAT(it.transaction_datetime, '%d/%m/%Y %H:%i') as formatted_date,
                   c.customer_name, c.customer_code,
                   u.fullname as staff_name
            FROM inbound_transactions it
            LEFT JOIN branches b on it.branch_id = b.id
            LEFT JOIN customers c ON it.customer_id = c.id
            LEFT JOIN users u ON it.staff_id = u.id
            WHERE it.id = ?
        `, [txId]);

        if (details.length > 0) {
            res.json({ status: 'success', data: details[0] });
        } else {
            res.status(404).json({ status: 'error', message: 'ไม่พบข้อมูลรายการนี้' });
        }
    } catch (error) {
        console.error("Error getTransactionDetail:", error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
};

// 🟢 [POST] API ยกเลิกบิลรับซื้อ
exports.cancelTransaction = async (req, res) => {
    // const txId = req.params.id;
	// const staffId = 1;
	const txId = req.params.id;
    const staffId = req.session.user.id; // 🚀 แก้ staffId ให้ดึงจากคนล็อกอินจริง
    // const staffId = req.session && req.session.user ? req.session.user.id : 1; 
    

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // 1. ตรวจสอบว่ามีบิลนี้อยู่จริง และยังไม่ได้ถูกยกเลิก (ใช้ FOR UPDATE ป้องกันคนกดเบิ้ล)
        const [txData] = await connection.query(`
            SELECT branch_id, net_weight, payment_status 
            FROM inbound_transactions 
            WHERE id = ? FOR UPDATE
        `, [txId]);

        if (txData.length === 0) throw new Error('ไม่พบข้อมูลบิลนี้ในระบบ');
        if (txData[0].payment_status === 'cancelled') throw new Error('บิลนี้ถูกยกเลิกไปแล้ว');

        const branchId = txData[0].branch_id;
        const netWeight = parseFloat(txData[0].net_weight);

        // 2. เปลี่ยนสถานะบิลเป็น 'cancelled'
        await connection.query(`
            UPDATE inbound_transactions 
            SET payment_status = 'cancelled' 
            WHERE id = ?
        `, [txId]);

        // 3. หักสต็อกกลับคืน (Reverse Inventory Ledger)
        // หาตัวเลขสต็อกล่าสุดของสาขานี้มาดูก่อน
        const [lastLedger] = await connection.query(`
            SELECT balance FROM inventory_ledgers WHERE branch_id = ? ORDER BY id DESC LIMIT 1
        `, [branchId]);
        
        let previousBalance = lastLedger.length > 0 ? parseFloat(lastLedger[0].balance) : 0;
        let newBalance = previousBalance - netWeight; // 🚀 หักน้ำยางที่เคยรับเข้ามา ออกไป

        await connection.query(`
            INSERT INTO inventory_ledgers 
            (branch_id, transaction_type, reference_id, movement_date, volume_out, balance) 
            VALUES (?, 'cancel_inbound', ?, NOW(), ?, ?)
        `, [branchId, txId, netWeight, newBalance]);

        // 4. บันทึกประวัติการทำงาน (Audit Log)
        await connection.query(`
            INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values) 
            VALUES (?, 'CANCEL', 'inbound_transactions', ?, ?)
        `, [staffId, txId, JSON.stringify({ action: 'ยกเลิกบิล', reversed_weight: netWeight })]);

        await connection.commit();
        res.json({ status: 'success', message: 'ยกเลิกบิล และหักสต็อกคืนเรียบร้อยแล้ว' });

    } catch (error) {
        await connection.rollback();
        console.error("Cancel Transaction Error:", error);
        res.status(500).json({ status: 'error', message: error.message || 'เกิดข้อผิดพลาดในการยกเลิกบิล' });
    } finally {
        if (connection) connection.release();
    }
};