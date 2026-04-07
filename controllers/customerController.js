const db = require('../config/db_para'); 

// 🟢 1. เปิดหน้าจอจัดการลูกค้า
exports.customerPage = async (req, res) => {
    res.render('customers', { title: 'จัดการข้อมูลลูกค้า' });
};

// 🟢 2. ดึงข้อมูลลูกค้าทั้งหมด (API)
exports.getCustomers = async (req, res) => {
    try {
        const [customers] = await db.query(`
            SELECT * FROM customers 
            WHERE is_active = 1 
            ORDER BY id DESC
        `);
        res.json({ status: 'success', data: customers });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. บันทึกลูกค้าใหม่ (API)
exports.addCustomer = async (req, res) => {
    try {
        const { customer_name, customer_type, phone_number, bank_name, bank_account_no } = req.body;
        const branchId = 1; // สมมติว่าสาขาที่ 1 (ปรับให้ดึงจาก Session พนักงานได้ครับ)

        // 🚀 สร้างรหัสลูกค้าอัตโนมัติ (เช่น CUS-0001)
        const [maxIdResult] = await db.query('SELECT MAX(id) as maxId FROM customers');
        let nextId = (maxIdResult[0].maxId || 0) + 1;
        let customerCode = `CUS-${String(nextId).padStart(4, '0')}`;

        await db.query(`
            INSERT INTO customers (branch_id, customer_code, customer_name, customer_type, phone_number, bank_name, bank_account_no) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [branchId, customerCode, customer_name, customer_type, phone_number, bank_name, bank_account_no]);

        res.json({ status: 'success', message: 'บันทึกข้อมูลลูกค้าสำเร็จ!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึก' });
    }
};

// 🟢 4. แก้ไขข้อมูลลูกค้า (API)
exports.updateCustomer = async (req, res) => {
    try {
        const id = req.params.id;
        const { customer_name, customer_type, phone_number, bank_name, bank_account_no } = req.body;

        await db.query(`
            UPDATE customers 
            SET customer_name = ?, customer_type = ?, phone_number = ?, bank_name = ?, bank_account_no = ?
            WHERE id = ?
        `, [customer_name, customer_type, phone_number, bank_name, bank_account_no, id]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลสำเร็จ!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'อัปเดตไม่สำเร็จ' });
    }
};

// 🟢 5. ยกเลิกการใช้งานลูกค้า (Soft Delete) (API)
exports.deleteCustomer = async (req, res) => {
    try {
        const id = req.params.id;
        // เปลี่ยนสถานะ is_active เป็น 0 แทนการลบข้อมูลจริง
        await db.query('UPDATE customers SET is_active = 0 WHERE id = ?', [id]);
        
        res.json({ status: 'success', message: 'ยกเลิกลูกค้ารายนี้แล้ว' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'ยกเลิกข้อมูลไม่สำเร็จ' });
    }
};