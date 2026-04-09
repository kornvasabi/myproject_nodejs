const db = require('../config/db_para'); 

// 🟢 1. เปิดหน้าจอจัดการลูกค้า (เพิ่มดึงรายชื่อสาขาไปโชว์ใน Dropdown)
exports.customerPage = async (req, res) => {
    try {
        // ดึงเฉพาะสาขาที่เปิดใช้งานอยู่
        const [branches] = await db.query('SELECT id, branch_name FROM branches WHERE is_active = 1');
        res.render('customers', { title: 'จัดการข้อมูลลูกค้า', branches: branches });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// 🟢 2. ดึงข้อมูลลูกค้าทั้งหมด (JOIN เอาชื่อสาขามาด้วย)
exports.getCustomers = async (req, res) => {
    try {
        const [customers] = await db.query(`
            SELECT c.*, b.branch_name 
            FROM customers c
            LEFT JOIN branches b ON c.branch_id = b.id
            WHERE c.is_active = 1 
            ORDER BY c.id DESC
        `);
        res.json({ status: 'success', data: customers });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. บันทึกลูกค้าใหม่ (รับค่า branch_id จากหน้าเว็บ)
exports.addCustomer = async (req, res) => {
    try {
        // 🚀 รับค่า branch_id มาจากฟอร์มแล้ว
        const { branch_id, customer_name, customer_type, phone_number, bank_name, bank_account_no } = req.body;

        const [maxIdResult] = await db.query('SELECT MAX(id) as maxId FROM customers');
        let nextId = (maxIdResult[0].maxId || 0) + 1;
        let customerCode = `CUS-${String(nextId).padStart(4, '0')}`;

        await db.query(`
            INSERT INTO customers (branch_id, customer_code, customer_name, customer_type, phone_number, bank_name, bank_account_no, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [branch_id, customerCode, customer_name, customer_type, phone_number, bank_name, bank_account_no]);

        res.json({ status: 'success', message: 'บันทึกข้อมูลลูกค้าสำเร็จ!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึก' });
    }
};

// 🟢 4. แก้ไขข้อมูลลูกค้า
exports.updateCustomer = async (req, res) => {
    try {
        const id = req.params.id;
        const { branch_id, customer_name, customer_type, phone_number, bank_name, bank_account_no } = req.body;

        await db.query(`
            UPDATE customers 
            SET branch_id = ?, customer_name = ?, customer_type = ?, phone_number = ?, bank_name = ?, bank_account_no = ?, updated_at = NOW()
            WHERE id = ?
        `, [branch_id, customer_name, customer_type, phone_number, bank_name, bank_account_no, id]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลสำเร็จ!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'อัปเดตไม่สำเร็จ' });
    }
};

// 🟢 5. ยกเลิกการใช้งานลูกค้า (Soft Delete)
exports.deleteCustomer = async (req, res) => {
    try {
        const id = req.params.id;
        await db.query('UPDATE customers SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
        res.json({ status: 'success', message: 'ยกเลิกลูกค้ารายนี้แล้ว' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'ยกเลิกข้อมูลไม่สำเร็จ' });
    }
};