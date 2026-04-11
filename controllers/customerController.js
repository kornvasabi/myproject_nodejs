const db = require('../config/db_para'); 
// ==========================================
// 🟢 1. หน้าจอจัดการลูกค้า (Render Page)
// ==========================================
exports.customerPage = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        
        // 🚀 แปลงค่า Level เป็นตัวเลข ป้องกันบั๊ก String ('2' vs 2)
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        let branchSql = 'SELECT id, branch_name FROM branches WHERE is_active = 1';
        let branchParams = [];

        // 🚀 กรองรายชื่อสาขาใน Dropdown ตามสิทธิ์ (Data Isolation)
        if (accessLevel === 3) {
            // Level 3 (พนักงานลาน): เห็นแค่สาขาตัวเอง
            branchSql += ' AND id = ?';
            branchParams.push(userBranchId);
        } else if (accessLevel === 2) {
            // Level 2 (ผจก.โซน): เห็นสาขาตัวเอง + สาขารองที่ Map ไว้
            branchSql += ' AND (id = ? OR id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))';
            branchParams.push(userBranchId, userId);
        }
        // Level 1 (Admin): ไม่เติม WHERE จึงเห็นทุกสาขา

        const [branches] = await db.query(branchSql, branchParams);

        res.render('customers', { 
            title: 'จัดการข้อมูลลูกค้า', 
            branches: branches,
            accessLevel: accessLevel // ส่งให้ EJS ใช้ล็อคหน้าจอ
        });
    } catch (error) {
        console.error("Customer Page Error:", error);
        res.status(500).send('Server Error');
    }
};

// ==========================================
// 🟢 2. ดึงข้อมูลลูกค้าทั้งหมด (API สำหรับ DataTable)
// ==========================================
exports.getCustomers = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        let sql = `
            SELECT c.*, b.branch_name 
            FROM customers c
            LEFT JOIN branches b ON c.branch_id = b.id
            WHERE c.is_active = 1 
        `;
        let params = [];

        // 🚀 กรองตารางลูกค้าตามสิทธิ์ (Data Isolation)
        if (accessLevel === 3) {
            sql += ` AND c.branch_id = ? `;
            params.push(userBranchId);
        } else if (accessLevel === 2) {
            sql += ` AND (c.branch_id = ? OR c.branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = ?)) `;
            params.push(userBranchId, userId);
        }

        sql += ` ORDER BY c.id DESC `;
        
        const [customers] = await db.query(sql, params);
        res.json({ status: 'success', data: customers });
    } catch (error) {
        console.error("Get Customers Error:", error);
        res.status(500).json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// ==========================================
// 🟢 3. บันทึกลูกค้าใหม่ (API Add)
// ==========================================
exports.addCustomer = async (req, res) => {
    try {
        let { branch_id, customer_name, customer_type, phone_number, bank_name, bank_account_no } = req.body;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        // 🚀 บังคับสาขาเฉพาะ Level 3 ป้องกันการแฮกเปลี่ยน ID ผ่านหน้าเว็บ
        if (accessLevel === 3) {
            branch_id = req.session.user.branch_id;
        }

        if (!branch_id || !customer_name || customer_name.trim() === '') {
            return res.json({ status: 'error', message: 'กรุณากรอกข้อมูลสาขาและชื่อลูกค้าให้ครบถ้วน' });
        }

        const p_phone = phone_number && phone_number.trim() !== '' ? phone_number : null;
        const p_bank = bank_name && bank_name.trim() !== '' ? bank_name : null;
        const p_account = bank_account_no && bank_account_no.trim() !== '' ? bank_account_no : null;

        // รันเลขรหัสลูกค้าอัตโนมัติ เช่น CUS-0001
        const [maxIdResult] = await db.query('SELECT MAX(id) as maxId FROM customers');
        let nextId = (maxIdResult[0].maxId || 0) + 1;
        let customerCode = `CUS-${String(nextId).padStart(4, '0')}`;

        await db.query(`
            INSERT INTO customers (branch_id, customer_code, customer_name, customer_type, phone_number, bank_name, bank_account_no, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [branch_id, customerCode, customer_name, customer_type, p_phone, p_bank, p_account]);

        res.json({ status: 'success', message: 'บันทึกข้อมูลลูกค้าสำเร็จ!' });
    } catch (error) {
        console.error("Add Customer Error:", error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
};

// ==========================================
// 🟢 4. แก้ไขข้อมูลลูกค้า (API Update)
// ==========================================
exports.updateCustomer = async (req, res) => {
    try {
        const id = req.params.id;
        let { branch_id, customer_name, customer_type, phone_number, bank_name, bank_account_no } = req.body;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        // 🚀 บังคับสาขาเฉพาะ Level 3 (พนักงานระดับล่างจะแก้ไขย้ายลูกค้าระหว่างสาขาไม่ได้)
        if (accessLevel === 3) {
            branch_id = req.session.user.branch_id;
        }

        if (!branch_id || !customer_name || customer_name.trim() === '') {
            return res.json({ status: 'error', message: 'กรุณากรอกข้อมูลสาขาและชื่อลูกค้าให้ครบถ้วน' });
        }

        const p_phone = phone_number && phone_number.trim() !== '' ? phone_number : null;
        const p_bank = bank_name && bank_name.trim() !== '' ? bank_name : null;
        const p_account = bank_account_no && bank_account_no.trim() !== '' ? bank_account_no : null;

        await db.query(`
            UPDATE customers 
            SET branch_id = ?, customer_name = ?, customer_type = ?, phone_number = ?, bank_name = ?, bank_account_no = ?, updated_at = NOW()
            WHERE id = ?
        `, [branch_id, customer_name, customer_type, p_phone, p_bank, p_account, id]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลลูกค้าสำเร็จ!' });
    } catch (error) {
        console.error("Update Customer Error:", error);
        res.status(500).json({ status: 'error', message: 'อัปเดตไม่สำเร็จ กรุณาตรวจสอบข้อมูล' });
    }
};

// ==========================================
// 🟢 5. ยกเลิกการใช้งานลูกค้า (API Delete - Soft Delete)
// ==========================================
exports.deleteCustomer = async (req, res) => {
    try {
        const id = req.params.id;
        // ปรับ is_active = 0 แทนการลบจริง เพื่อให้ประวัติการซื้อขายเก่าๆ ไม่พัง
        await db.query('UPDATE customers SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
        
        res.json({ status: 'success', message: 'ยกเลิกข้อมูลลูกค้ารายนี้เรียบร้อยแล้ว' });
    } catch (error) {
        console.error("Delete Customer Error:", error);
        res.status(500).json({ status: 'error', message: 'ยกเลิกข้อมูลไม่สำเร็จ' });
    }
};