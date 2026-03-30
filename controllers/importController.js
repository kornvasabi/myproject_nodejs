const db = require('../config/db'); // ไฟล์เชื่อมต่อ DB (ใช้ mysql2/promise)
const ExcelJS = require('exceljs');
const moment = require('moment'); // (ออปชันเสริม) ถ้ามี moment.js จะจัดการวันที่ง่ายมาก หรือจะเขียน manual ก็ได้ครับ

// 🟢 ฟังก์ชันหลักสำหรับรับไฟล์และบันทึก
exports.importPriceExcel = async (req, res) => {
    // 1. เช็คว่ามีไฟล์ส่งมาไหม
    if (!req.file) {
        return res.send('<script>alert("กรุณาเลือกไฟล์ Excel ก่อนนำเข้า"); window.history.back();</script>');
    }

    let connection; // เตรียมตัวแปรสำหรับ Transaction

    try {
        // 2. ใช้ ExcelJS อ่านไฟล์จาก Memory (Buffer) โดยตรง ไม่ต้องเซฟลง Temp ให้รกเครื่อง
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        
        // เลือกชีทแรก
        const worksheet = workbook.getWorksheet(1);
        let allData = [];

        // 3. วนลูปอ่านข้อมูลทีละบรรทัดเก็บใส่ Array (ข้าม Header)
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // ข้ามบรรทัดแรก

            let wood_code = row.getCell(1).value ? row.getCell(1).value.toString().trim() : '';
            let unit_price = parseFloat(row.getCell(2).value) || 0;
            let raw_date = row.getCell(3).value;

            if (wood_code) {
                // จัดการเรื่องวันที่ (ExcelJS มักจะคืนค่ามาเป็น Date Object)
                let start_date = '';
                if (raw_date instanceof Date) {
                    start_date = raw_date.toISOString().split('T')[0]; // แปลงเป็น YYYY-MM-DD
                } else {
                    // ถ้ามาเป็นข้อความ '30/01/2025'
                    let parts = raw_date.toString().split('/');
                    if(parts.length === 3) {
                        start_date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    } else {
                        start_date = raw_date.toString();
                    }
                }

                allData.push({ wood_code, unit_price, start_date });
            }
        });

        // =========================================================
        // STEP 1: ตรวจสอบหา "รหัสซ้ำกันเองในไฟล์"
        // =========================================================
        const codeCounts = {};
        const duplicateCodes = [];

        allData.forEach(item => {
            codeCounts[item.wood_code] = (codeCounts[item.wood_code] || 0) + 1;
        });

        for (const [code, count] of Object.entries(codeCounts)) {
            if (count > 1) duplicateCodes.push(code);
        }

        if (duplicateCodes.length > 0) {
            // 🟢 เปลี่ยนจาก res.send เป็น res.json
            return res.json({ status: 'error', message: `พบรหัสสินค้าซ้ำในไฟล์: ${duplicateCodes.join(', ')}` });
        }

        // =========================================================
        // STEP 1.5: ตรวจสอบข้อมูลซ้ำซ้อนกับ Database (Overlap Check)
        // =========================================================
        const dbConflictErrors = [];
        
        for (const item of allData) {
            const [rows] = await db.query(
                "SELECT start_date FROM product_prices WHERE wood_code = ? AND start_date >= ? LIMIT 1", 
                [item.wood_code, item.start_date]
            );
            if (rows.length > 0) {
                dbConflictErrors.push(`${item.wood_code} (วันที่ ${item.start_date})`);
            }
        }

        if (dbConflictErrors.length > 0) {
            const showLimit = dbConflictErrors.slice(0, 5).join(', ');
            const moreText = dbConflictErrors.length > 5 ? ' และอื่นๆ...' : '';
            return res.json({ status: 'error', message: `นำเข้าล้มเหลว! พบวันที่ซ้ำซ้อนหรือย้อนหลัง: ${showLimit}${moreText}` });
        }

        // =========================================================
        // STEP 2: บันทึกข้อมูลลงฐานข้อมูล (Transaction)
        // =========================================================
        connection = await db.getConnection(); // ขอ Connection แยกเพื่อทำ Transaction
        await connection.beginTransaction(); // เริ่ม Transaction!

        let successCount = 0;
        const userId = req.session.user ? req.session.user.id : 1; // ดึง User ID ปัจจุบัน

        for (const item of allData) {
            // คำนวณวันปิดราคาเก่า (start_date ลบ 1 วัน)
            // ทริค: แปลงกลับเป็น Date เพื่อลบ 1 วัน แล้วแปลงกลับเป็น String
            let dateObj = new Date(item.start_date);
            dateObj.setDate(dateObj.getDate() - 1);
            let close_date = dateObj.toISOString().split('T')[0];

            // Query 1: อัปเดตราคาเก่าให้ปิดตัวลง
            await connection.query(
                "UPDATE product_prices SET end_date = ? WHERE wood_code = ? AND end_date = '9999-12-31'",
                [close_date, item.wood_code]
            );

            // Query 2: เพิ่มราคาใหม่
            await connection.query(
                "INSERT INTO product_prices (wood_code, unit_price, start_date, end_date, created_by) VALUES (?, ?, ?, '9999-12-31', ?)",
                [item.wood_code, item.unit_price, item.start_date, userId]
            );

            successCount++;
        }

        // 🟢 ถ้าถึงบรรทัดนี้แสดงว่าไม่พัง ยืนยันข้อมูลลง Database
        await connection.commit();
        connection.release(); // คืน Connection กลับสู่ Pool

        res.json({ status: 'success', message: `นำเข้าสำเร็จ! อัปเดตราคา ${successCount} รายการ` });

    } catch (error) {
        // 🔴 ถ้า Error กลางทาง ให้ Rollback ยกเลิกสิ่งที่ทำไปทั้งหมด
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error("Import Error:", error);
        // 🟢 เปลี่ยนข้อความตอน Error เป็น JSON
        res.json({ status: 'error', message: `เกิดข้อผิดพลาด: ${error.message}` });
    }
};