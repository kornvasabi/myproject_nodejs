// ไฟล์: middleware/authMiddleware.js

const requireAuth = (req, res, next) => {
    // ตรวจสอบว่ามี Session และมีข้อมูล user อยู่ใน Session หรือไม่
    if (req.session && req.session.user) {
        // ถ้ามี แปลว่าล็อกอินแล้ว สั่ง next() เพื่อให้เดินทางต่อไปยังหน้าเว็บที่ร้องขอได้เลย
        return next(); 
    }
    
    // ถ้าไม่มี (ยังไม่ล็อกอิน หรือ Session หมดอายุ) ให้เตะกลับไปหน้า Login
    return res.redirect('/myproject_nodejs/');
};

// ส่งออกฟังก์ชันไปให้ไฟล์อื่นเรียกใช้
module.exports = { requireAuth };