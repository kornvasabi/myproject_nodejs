// ไฟล์: middleware/menuMiddleware.js
const db = require('../config/db');

const loadMenus = async (req, res, next) => {
    if (!req.session || !req.session.user) return next();

    try {
        const groupId = req.session.user.group_id || '1';

        const sql = `
            SELECT m.* FROM menus m
            INNER JOIN permissions p ON m.id = p.menu_id
            WHERE p.group_id = ?
            ORDER BY m.sort_order ASC;
        `;
        const [rows] = await db.query(sql, [groupId]);

        // 🟢 1. สร้าง Array เก็บเฉพาะ URL ที่ User คนนี้มีสิทธิ์เข้าถึง
        // แปลงจาก user_list.php เป็น /user_list
        const allowedUrls = rows
            .filter(item => item.link !== '#') // ตัดพวกเมนูแม่ที่เป็น # ออก
            .map(item => '/' + item.link.replace('.php', ''));

        // แอบเก็บรายชื่อ URL ที่อนุญาตไว้ใน res.locals
        res.locals.allowedUrls = allowedUrls;

        // --- โค้ดจัดกลุ่มยัดลูกใส่ไส้แม่เหมือนเดิม ---
        const menuTree = [];
        const parents = rows.filter(item => item.parent_id === 0);
        parents.forEach(parent => {
            parent.children = rows.filter(item => item.parent_id === parent.id);
            menuTree.push(parent);
        });

        res.locals.dynamicMenus = menuTree;
        next(); 
    } catch (error) {
        console.error("Menu Load Error:", error);
        res.locals.dynamicMenus = []; 
        res.locals.allowedUrls = []; 
        next();
    }
};

// 🟢 2. ด่านตรวจสิทธิ์ระดับ Route (ห้ามคนพิมพ์ URL เข้าตรงๆ)
const checkPermission = (req, res, next) => {
    const currentPath = req.path; // เช่น '/user_list'

    // อนุญาตให้เข้าหน้า Dashboard ได้เสมอ (เพราะเป็นหน้าแรกหลัง Login)
    if (currentPath === '/dashboard') {
        return next();
    }

    // เช็คว่า URL ที่กำลังจะเข้า มีอยู่ในรายชื่อที่อนุญาตหรือไม่?
    if (res.locals.allowedUrls && res.locals.allowedUrls.includes(currentPath)) {
        return next(); // มีสิทธิ์ -> ปล่อยผ่าน
    }

    // ไม่มีสิทธิ์ -> เด้งกลับไป Dashboard พร้อมแจ้งเตือน (หรือจะสร้างหน้า 403 ก็ได้ครับ)
    console.log(`❌ บล็อกการเข้าถึง! ไม่มีสิทธิ์เข้า URL: ${currentPath}`);
    res.send(`
        <script>
            alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้ครับ!');
            window.location.href = '/myproject_nodejs/dashboard';
        </script>
    `);
};

// 🟢 ส่งออก checkPermission ไปใช้ด้วย
module.exports = { loadMenus, checkPermission };