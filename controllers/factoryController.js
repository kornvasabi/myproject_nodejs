const db = require('../config/db_para');

// 🟢 1. เปิดหน้าจอจัดการโรงงาน
exports.factoryPage = async (req, res) => {
    res.render('factories', { title: 'ข้อมูลโรงงานรับซื้อปลายทาง' });
};

// 🟢 2. ดึงข้อมูลโรงงานทั้งหมด (API)
exports.getFactories = async (req, res) => {
    try {
        const [factories] = await db.query(`
            SELECT * FROM factories 
            WHERE is_active = 1 
            ORDER BY id DESC
        `);
        res.json({ status: 'success', data: factories });
    } catch (error) {
        console.error("Get Factories Error:", error);
        res.status(500).json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. บันทึกโรงงานใหม่ (API)
exports.addFactory = async (req, res) => {
    try {
        const { factory_name, contact_info } = req.body;

        if (!factory_name || factory_name.trim() === '') {
            return res.json({ status: 'error', message: 'กรุณากรอกชื่อโรงงาน' });
        }

        // แปลงค่าว่างเป็น null
        const p_contact = contact_info && contact_info.trim() !== '' ? contact_info : null;

        await db.query(`
            INSERT INTO factories (factory_name, contact_info) 
            VALUES (?, ?)
        `, [factory_name, p_contact]);

        res.json({ status: 'success', message: 'บันทึกข้อมูลโรงงานสำเร็จ!' });
    } catch (error) {
        console.error("Add Factory Error:", error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
};

// 🟢 4. แก้ไขข้อมูลโรงงาน (API)
exports.updateFactory = async (req, res) => {
    try {
        const id = req.params.id;
        const { factory_name, contact_info } = req.body;

        if (!factory_name || factory_name.trim() === '') {
            return res.json({ status: 'error', message: 'กรุณากรอกชื่อโรงงาน' });
        }

        const p_contact = contact_info && contact_info.trim() !== '' ? contact_info : null;

        await db.query(`
            UPDATE factories 
            SET factory_name = ?, contact_info = ?
            WHERE id = ?
        `, [factory_name, p_contact, id]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลสำเร็จ!' });
    } catch (error) {
        console.error("Update Factory Error:", error);
        res.status(500).json({ status: 'error', message: 'อัปเดตไม่สำเร็จ กรุณาตรวจสอบข้อมูล' });
    }
};

// 🟢 5. ยกเลิกการใช้งานโรงงาน (Soft Delete) (API)
exports.deleteFactory = async (req, res) => {
    try {
        const id = req.params.id;
        // เปลี่ยนสถานะ is_active เป็น 0 แทนการลบ
        await db.query('UPDATE factories SET is_active = 0 WHERE id = ?', [id]);
        
        res.json({ status: 'success', message: 'ยกเลิกข้อมูลโรงงานนี้เรียบร้อยแล้ว' });
    } catch (error) {
        console.error("Delete Factory Error:", error);
        res.status(500).json({ status: 'error', message: 'ไม่สามารถยกเลิกข้อมูลได้' });
    }
};