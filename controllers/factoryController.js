const db = require('../config/db_para'); // ปรับชื่อไฟล์ db ให้ตรงนะครับ

// 🟢 1. เปิดหน้าจอจัดการโรงงาน (ดึงสาขาตามสิทธิ์)
exports.factoryPage = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        let branchSql = 'SELECT id, branch_name FROM branches WHERE is_active = 1';
        let branchParams = [];

        if (accessLevel === 3) {
            branchSql += ' AND id = ?';
            branchParams.push(userBranchId);
        } else if (accessLevel === 2) {
            branchSql += ' AND (id = ? OR id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))';
            branchParams.push(userBranchId, userId);
        }

        const [branches] = await db.query(branchSql, branchParams);

        res.render('factories', { 
            title: 'ข้อมูลโรงงานรับซื้อปลายทาง',
            branches: branches,
            accessLevel: accessLevel
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// 🟢 2. ดึงข้อมูลโรงงานทั้งหมด (กรองตาม Level)
exports.getFactories = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        let sql = `
            SELECT f.*, b.branch_name 
            FROM factories f
            LEFT JOIN branches b ON f.branch_id = b.id
            WHERE f.is_active = 1 
        `;
        let params = [];

        if (accessLevel === 3) {
            sql += ` AND f.branch_id = ? `;
            params.push(userBranchId);
        } else if (accessLevel === 2) {
            sql += ` AND (f.branch_id = ? OR f.branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = ?)) `;
            params.push(userBranchId, userId);
        }

        sql += ` ORDER BY f.id DESC `;

        const [factories] = await db.query(sql, params);
        res.json({ status: 'success', data: factories });
    } catch (error) {
        console.error("Get Factories Error:", error);
        res.status(500).json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. บันทึกโรงงานใหม่ (บังคับสาขาถ้าเป็น Level 3)
exports.addFactory = async (req, res) => {
    try {
        let { branch_id, factory_name, contact_info } = req.body;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        if (accessLevel === 3) {
            branch_id = req.session.user.branch_id;
        }

        if (!branch_id || !factory_name || factory_name.trim() === '') {
            return res.json({ status: 'error', message: 'กรุณาเลือกสาขาและระบุชื่อโรงงาน' });
        }

        const p_contact = contact_info && contact_info.trim() !== '' ? contact_info : null;

        await db.query(`
            INSERT INTO factories (branch_id, factory_name, contact_info) 
            VALUES (?, ?, ?)
        `, [branch_id, factory_name, p_contact]);

        res.json({ status: 'success', message: 'บันทึกข้อมูลโรงงานสำเร็จ!' });
    } catch (error) {
        console.error("Add Factory Error:", error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
};

// 🟢 4. แก้ไขข้อมูลโรงงาน
exports.updateFactory = async (req, res) => {
    try {
        const id = req.params.id;
        let { branch_id, factory_name, contact_info } = req.body;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        if (accessLevel === 3) {
            branch_id = req.session.user.branch_id;
        }

        if (!branch_id || !factory_name || factory_name.trim() === '') {
            return res.json({ status: 'error', message: 'กรุณาเลือกสาขาและระบุชื่อโรงงาน' });
        }

        const p_contact = contact_info && contact_info.trim() !== '' ? contact_info : null;

        await db.query(`
            UPDATE factories 
            SET branch_id = ?, factory_name = ?, contact_info = ?
            WHERE id = ?
        `, [branch_id, factory_name, p_contact, id]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลสำเร็จ!' });
    } catch (error) {
        console.error("Update Factory Error:", error);
        res.status(500).json({ status: 'error', message: 'อัปเดตไม่สำเร็จ กรุณาตรวจสอบข้อมูล' });
    }
};

// 🟢 5. ยกเลิกการใช้งานโรงงาน
exports.deleteFactory = async (req, res) => {
    try {
        const id = req.params.id;
        await db.query('UPDATE factories SET is_active = 0 WHERE id = ?', [id]);
        res.json({ status: 'success', message: 'ยกเลิกข้อมูลโรงงานนี้เรียบร้อยแล้ว' });
    } catch (error) {
        console.error("Delete Factory Error:", error);
        res.status(500).json({ status: 'error', message: 'ไม่สามารถยกเลิกข้อมูลได้' });
    }
};