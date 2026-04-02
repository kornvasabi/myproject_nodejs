const db = require('../config/db_para'); // ปรับ path ให้ตรงกับไฟล์ db ของคุณกรนะครับ

// =========================================================================
// 1. [GET] ฟังก์ชันเปิดหน้าเว็บ (ดึงข้อมูลลูกค้า, ราคาวันนี้, ประวัติบิล)
// =========================================================================
exports.getParasalesList = async (req, res) => {
    try {
        // จำลองว่าคุณกรล็อกอินของลานที่ 1 (ถ้ามีระบบ Session เต็มรูปแบบ ค่อยเปลี่ยนเป็น req.session.user.branch_id)
        const currentBranchId = 1; 

        // 1.1 ดึงราคารับซื้อล่าสุดของวันนี้
        const [prices] = await db.query(`
            SELECT buy_price_per_kg FROM daily_prices 
            WHERE branch_id = ? ORDER BY effective_date DESC LIMIT 1
        `, [currentBranchId]);
        const dailyPrice = prices.length > 0 ? prices[0].buy_price_per_kg : 0;

        // 1.2 ดึงรายชื่อลูกค้าที่ Active อยู่ของสาขานี้
        const [customers] = await db.query(`
            SELECT id, customer_code, customer_name 
            FROM customers WHERE branch_id = ? AND is_active = 1
        `, [currentBranchId]);

        // 1.3 ดึงประวัติการรับซื้อล่าสุดมาโชว์ในตาราง
        const [transactions] = await db.query(`
            SELECT it.*, c.customer_name,
                   DATE_FORMAT(it.transaction_datetime, '%d/%m/%Y %H:%i') as formatted_date
            FROM inbound_transactions it
            LEFT JOIN customers c ON it.customer_id = c.id
            WHERE it.branch_id = ?
            ORDER BY it.transaction_datetime DESC LIMIT 50
        `, [currentBranchId]);

        // โยนข้อมูลไปให้ EJS เรนเดอร์หน้าจอ
        res.render('parasales_list', {
            title: 'รับซื้อน้ำยางหน้าร้าน',
            dailyPrice: dailyPrice,
            customers: customers,
            transactions: transactions
        });

    } catch (error) {
        console.error("❌ Error getParasalesList:", error);
        res.status(500).send("ระบบขัดข้อง ไม่สามารถดึงข้อมูลได้");
    }
};

// =========================================================================
// 2. [POST] ฟังก์ชันรับข้อมูลจาก AJAX เพื่อบันทึกบิลรับซื้อ (Transaction)
// =========================================================================
exports.addTransaction = async (req, res) => {
    // ดึงค่าทั้งหมดที่ส่งมาจาก Form
    const { 
        customer_id, gross_weight, tare_weight, net_weight, 
        drc_percent, dry_rubber_weight, unit_price, total_amount, 
        payment_method, payment_status 
    } = req.body;

    const branchId = 1; // ลานสาขา 1
    // const staffId = req.session && req.session.user ? req.session.user.id : 1; // ดึง ID พนักงานจาก Session
    
    const staffId = 1;
    // สร้างเลขที่บิลอัตโนมัติ (เช่น REC-260401-1234)
    const datePrefix = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const receiptNo = `REC-${datePrefix}-${randomSuffix}`;
	
	// 🚀 ดึง IP Address ของ Client (รองรับ Nginx แบบ 100%)
    let ipAddress = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || req.socket.remoteAddress || '';
    // ถ้าผ่าน Proxy หลายชั้น มันจะมาเป็นชุด (เช่น 192.168.0.18, 10.0.0.1) ให้เอาตัวแรกสุด
    if (ipAddress.includes(',')) {
        ipAddress = ipAddress.split(',')[0].trim();
    }
    // แปลง IPv6 ของ localhost เป็น IPv4 ให้อ่านง่าย
    if (ipAddress === '::1' || ipAddress === '::ffff:127.0.0.1') {
        ipAddress = '127.0.0.1';
    }

    // 🚀 เปิดโหมด Transaction (บันทึกหลายตารางพร้อมกัน)
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // 📌 2.1 บันทึกลงตารางบิลรับซื้อ (inbound_transactions)
        const [insertResult] = await connection.query(`
            INSERT INTO inbound_transactions 
            (branch_id, receipt_no, transaction_datetime, customer_id, staff_id, gross_weight, tare_weight, net_weight, drc_percent, dry_rubber_weight, unit_price, total_amount, payment_status, payment_method) 
            VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [branchId, receiptNo, customer_id, staffId, gross_weight, tare_weight, net_weight, drc_percent, dry_rubber_weight, unit_price, total_amount, payment_status, payment_method]);
        
        const newTransactionId = insertResult.insertId;

        // 📌 2.2 อัปเดตสมุดบัญชีสต็อกน้ำยาง (inventory_ledgers)
        const [lastLedger] = await connection.query(`
            SELECT balance FROM inventory_ledgers WHERE branch_id = ? ORDER BY id DESC LIMIT 1
        `, [branchId]);
        
        let previousBalance = lastLedger.length > 0 ? parseFloat(lastLedger[0].balance) : 0;
        let newBalance = previousBalance + parseFloat(net_weight);

        await connection.query(`
            INSERT INTO inventory_ledgers 
            (branch_id, transaction_type, reference_id, movement_date, volume_in, balance) 
            VALUES (?, 'inbound', ?, NOW(), ?, ?)
        `, [branchId, newTransactionId, net_weight, newBalance]);

        // 📌 2.3 บันทึกประวัติการทำงาน (audit_logs)
        const logData = JSON.stringify({ receipt_no: receiptNo, net_weight: net_weight, total_amount: total_amount });
        await connection.query(`
            INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values, ip_address) 
            VALUES (?, 'INSERT', 'inbound_transactions', ?, ? ,?)
        `, [staffId, newTransactionId, logData ,ipAddress]);

        // 🚀 [เพิ่มใหม่] 2.4 ดึงข้อมูลบิลที่เพิ่งบันทึกสำเร็จ เพื่อส่งกลับไปให้หน้าเว็บโชว์
        const [newRecord] = await connection.query(`
            SELECT it.id, it.receipt_no, 
                   DATE_FORMAT(it.transaction_datetime, '%d/%m/%Y %H:%i') as formatted_date,
                   c.customer_name, 
                   it.net_weight, it.drc_percent, it.total_amount, it.payment_status
            FROM inbound_transactions it
            LEFT JOIN customers c ON it.customer_id = c.id
            WHERE it.id = ?
        `, [newTransactionId]);

        // ยืนยันการบันทึกข้อมูลทุกตาราง
        await connection.commit();
        
        // 🚀 ส่ง JSON กลับไปบอก AJAX พร้อมแนบข้อมูล (data) ไปด้วย
        res.json({ 
            status: 'success', 
            message: 'บันทึกบิลรับซื้อน้ำยาง และอัปเดตสต็อกเรียบร้อยแล้ว!',
            data: newRecord[0]  // <--- ส่งข้อมูลก้อนนี้กลับไปหน้าบ้าน
        });

    } catch (error) {
        // ถ้ามีจุดไหนพัง ให้ยกเลิกการกระทำทั้งหมด (Rollback)
        await connection.rollback();
        console.error("❌ Transaction Failed, Rollback Executed:", error);
        
        // 🚀 ส่ง JSON กลับไปบอก AJAX ว่าพัง
        res.status(500).json({ 
            status: 'error', 
            message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่' 
        });
    } finally {
        // คืน connection ให้ระบบ (สำคัญมาก ไม่งั้นเว็บจะค้าง)
        connection.release();
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
            SELECT it.*,
                   DATE_FORMAT(it.transaction_datetime, '%d/%m/%Y %H:%i') as formatted_date,
                   c.customer_name, c.customer_code,
                   u.full_name as staff_name
            FROM inbound_transactions it
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