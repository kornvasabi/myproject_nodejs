const db = require('../config/db_para'); // หรือ db_para ตามที่คุณกรตั้งชื่อไฟล์ไว้ครับ

// 🟢 1. เปิดหน้าจอจัดการราคา (ดึงสาขาไปโชว์ใน Dropdown)
exports.pricePage = async (req, res) => {
    try {
        const [branches] = await db.query('SELECT id, branch_name FROM branches WHERE is_active = 1');
        res.render('daily_prices', { title: 'จัดการราคารับซื้อประจำวัน', branches: branches });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// 🟢 2. ดึงข้อมูลราคาทั้งหมด (เพิ่มเงื่อนไข is_active = 1)
exports.getPrices = async (req, res) => {
    try {
        const [prices] = await db.query(`
            SELECT dp.id, dp.branch_id, dp.buy_price_per_kg, dp.sell_price_per_kg, 
                   DATE_FORMAT(dp.effective_date, '%Y-%m-%d') AS raw_date,
                   DATE_FORMAT(dp.effective_date, '%d/%m/%Y') AS display_date,
                   b.branch_name, u.fullname AS created_by_name
            FROM daily_prices dp
            LEFT JOIN branches b ON dp.branch_id = b.id
            LEFT JOIN users u ON dp.created_by = u.id
            WHERE dp.is_active = 1 
            ORDER BY dp.effective_date DESC, dp.id DESC
        `);
        res.json({ status: 'success', data: prices });
    } catch (error) {
        console.error("Get Prices Error:", error);
        res.status(500).json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. บันทึกราคาใหม่ (ใส่ is_active = 1 เผื่อไว้)
exports.addPrice = async (req, res) => {
    try {
        const { branch_id, effective_date, buy_price_per_kg, sell_price_per_kg } = req.body;
        const created_by = req.session && req.session.user ? req.session.user.id : 1; 

        // เช็คราคาซ้ำเฉพาะรายการที่ยัง Active อยู่
        const [duplicate] = await db.query(
            'SELECT id FROM daily_prices WHERE branch_id = ? AND effective_date = ? AND is_active = 1', 
            [branch_id, effective_date]
        );
        if (duplicate.length > 0) {
            return res.json({ status: 'error', message: 'สาขานี้มีการตั้งราคาของวันนี้ไว้แล้ว' });
        }

        const sell_price = sell_price_per_kg && sell_price_per_kg !== '' ? sell_price_per_kg : null;

        await db.query(`
            INSERT INTO daily_prices (branch_id, effective_date, buy_price_per_kg, sell_price_per_kg, created_by, created_at, is_active) 
            VALUES (?, ?, ?, ?, ?, NOW(), 1)
        `, [branch_id, effective_date, buy_price_per_kg, sell_price, created_by]);

        res.json({ status: 'success', message: 'บันทึกราคาประจำวันสำเร็จ!' });
    } catch (error) {
        console.error("Add Price Error:", error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
};

// 🟢 4. แก้ไขข้อมูลราคา (API)
exports.updatePrice = async (req, res) => {
    try {
        const id = req.params.id;
        const { branch_id, effective_date, buy_price_per_kg, sell_price_per_kg } = req.body;

        if (!branch_id || !effective_date || !buy_price_per_kg) {
            return res.json({ status: 'error', message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        // เช็คซ้ำอีกรอบเผื่อแก้ไขไปชนกับวันอื่นที่มีอยู่แล้ว (ยกเว้นตัวเอง)
        const [duplicate] = await db.query(
            'SELECT id FROM daily_prices WHERE branch_id = ? AND effective_date = ? AND id != ?', 
            [branch_id, effective_date, id]
        );
        if (duplicate.length > 0) {
            return res.json({ status: 'error', message: 'สาขานี้มีการตั้งราคาของวันนี้ไว้แล้ว' });
        }

        const sell_price = sell_price_per_kg && sell_price_per_kg !== '' ? sell_price_per_kg : null;

        await db.query(`
            UPDATE daily_prices 
            SET branch_id = ?, effective_date = ?, buy_price_per_kg = ?, sell_price_per_kg = ?
            WHERE id = ?
        `, [branch_id, effective_date, buy_price_per_kg, sell_price, id]);

        res.json({ status: 'success', message: 'อัปเดตราคาสำเร็จ!' });
    } catch (error) {
        console.error("Update Price Error:", error);
        res.status(500).json({ status: 'error', message: 'อัปเดตไม่สำเร็จ กรุณาตรวจสอบข้อมูล' });
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