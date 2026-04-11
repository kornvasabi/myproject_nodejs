const db = require('../config/db_para'); // หรือ db_para ตามที่คุณกรตั้งชื่อไฟล์ไว้ครับ

// 🟢 1. เปิดหน้าจอจัดการราคา (กรอง Dropdown สาขาตาม Level)
exports.pricePage = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        console.log(`🕵️‍♂️ [Price Page] User: ${userId}, Level: ${accessLevel}`);

        let branchSql = 'SELECT id, branch_name FROM branches WHERE is_active = 1';
        let branchParams = [];

        // 🚀 กรองรายชื่อสาขาใน Dropdown (ทั้งในหน้าค้นหาและใน Modal)
        if (accessLevel === 3) {
            branchSql += ' AND id = ?';
            branchParams.push(userBranchId);
        } else if (accessLevel === 2) {
            branchSql += ' AND (id = ? OR id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))';
            branchParams.push(userBranchId, userId);
        }

        const [branches] = await db.query(branchSql, branchParams);

        res.render('daily_prices', { 
            title: 'จัดการราคารับซื้อประจำวัน', 
            branches: branches,
            accessLevel: accessLevel 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// 🟢 2. ดึงข้อมูลราคา (กรองตารางตาม Level)
exports.getPrices = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        let sql = `
            SELECT dp.*, b.branch_name, u.fullname AS created_by_name,
                   DATE_FORMAT(dp.effective_date, '%Y-%m-%d') AS raw_date,
                   DATE_FORMAT(dp.effective_date, '%d/%m/%Y') AS display_date
            FROM daily_prices dp
            LEFT JOIN branches b ON dp.branch_id = b.id
            LEFT JOIN users u ON dp.created_by = u.id
            WHERE dp.is_active = 1 
        `;
        let params = [];

        if (accessLevel === 3) {
            sql += ` AND dp.branch_id = ? `;
            params.push(userBranchId);
        } else if (accessLevel === 2) {
            sql += ` AND (dp.branch_id = ? OR dp.branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = ?)) `;
            params.push(userBranchId, userId);
        }

        sql += ` ORDER BY dp.effective_date DESC, dp.id DESC `;
        
        const [prices] = await db.query(sql, params);
        res.json({ status: 'success', data: prices });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. บันทึกราคาใหม่ (บังคับสาขาถ้าเป็น Level 3)
exports.addPrice = async (req, res) => {
    try {
        let { branch_id, effective_date, buy_price_per_kg, sell_price_per_kg } = req.body;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;
        const created_by = req.session.user.id;

        if (accessLevel === 3) {
            branch_id = req.session.user.branch_id;
        }

        // เช็คซ้ำ
        const [duplicate] = await db.query(
            'SELECT id FROM daily_prices WHERE branch_id = ? AND effective_date = ? AND is_active = 1', 
            [branch_id, effective_date]
        );
        if (duplicate.length > 0) {
            return res.json({ status: 'error', message: 'สาขานี้มีการตั้งราคาของวันนี้ไว้แล้ว' });
        }

        await db.query(`
            INSERT INTO daily_prices (branch_id, effective_date, buy_price_per_kg, sell_price_per_kg, created_by, created_at, is_active) 
            VALUES (?, ?, ?, ?, ?, NOW(), 1)
        `, [branch_id, effective_date, buy_price_per_kg, sell_price_per_kg || null, created_by]);

        res.json({ status: 'success', message: 'บันทึกราคาสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึก' });
    }
};

// 🟢 4. แก้ไขราคา (บังคับสาขาถ้าเป็น Level 3)
exports.updatePrice = async (req, res) => {
    try {
        const id = req.params.id;
        let { branch_id, effective_date, buy_price_per_kg, sell_price_per_kg } = req.body;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        if (accessLevel === 3) {
            branch_id = req.session.user.branch_id;
        }

        await db.query(`
            UPDATE daily_prices 
            SET branch_id = ?, effective_date = ?, buy_price_per_kg = ?, sell_price_per_kg = ?
            WHERE id = ?
        `, [branch_id, effective_date, buy_price_per_kg, sell_price_per_kg || null, id]);

        res.json({ status: 'success', message: 'อัปเดตราคาสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'อัปเดตไม่สำเร็จ' });
    }
};

// 🟢 5. ยกเลิกรายการราคา (เปลี่ยนจาก DELETE เป็น Soft Delete)
exports.deletePrice = async (req, res) => {
    try {
        const id = req.params.id;
        // 🚀 เปลี่ยนสถานะเป็น 0 แทนการลบ
        await db.query('UPDATE daily_prices SET is_active = 0 WHERE id = ?', [id]);
        
        res.json({ status: 'success', message: 'ยกเลิกรายการราคานี้เรียบร้อยแล้ว' });
    } catch (error) {
        console.error("Delete Price Error:", error);
        res.status(500).json({ status: 'error', message: 'ไม่สามารถยกเลิกข้อมูลได้' });
    }
};