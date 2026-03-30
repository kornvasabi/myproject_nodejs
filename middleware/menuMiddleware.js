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

// 🟢 อัปเกรด checkPermission ตัวเดิมของคุณกร ให้รองรับสิทธิ์ เพิ่ม/แก้/ลบ
const checkPermission = async (req, res, next) => {
    const currentPath = req.path.substring(1); // เช่น '/user_list'

    // 1. อนุญาตให้เข้าหน้า Dashboard ได้เสมอ (ตามโค้ดเดิม)
    /*if (currentPath === '/dashboard') {
        // ให้สิทธิ์เต็มที่สำหรับหน้า Dashboard เผื่อต้องใช้
        res.locals.permission = { can_view: 1, can_add: 1, can_edit: 1, can_delete: 1 };
        return next();
    }*/
	if (currentPath === 'dashboard' || currentPath === 'myproject_nodejs/dashboard') {
        res.locals.permission = { can_view: 1, can_add: 1, can_edit: 1, can_delete: 1 };
        return next();
    }
	
    try {
        // ดึง Group ID ของคนที่ล็อกอินอยู่
        const groupId = req.session.user ? req.session.user.group_id : null;
        if (!groupId) {
            return res.redirect('/');
        }
		
        // 2. Query ดึงสิทธิ์ เพิ่ม/แก้/ลบ ของหน้านี้ จากฐานข้อมูล
        const sql = `
            SELECT p.can_view, p.can_add, p.can_edit, p.can_delete 
            FROM group_permissions p
            JOIN menus m ON p.menu_id = m.id
            WHERE p.group_id = ? AND m.link = ?
        `;
        const [perms] = await db.query(sql, [groupId, currentPath]);
		
        // 3. ตรวจสอบว่ามีสิทธิ์เข้าดู (can_view = 1) หรือไม่?
        if (perms.length > 0 && perms[0].can_view === 1) {
            
            // 🚀 มีสิทธิ์ผ่าน! -> ฝากตัวแปรสิทธิ์ทั้งหมดไปให้หน้า EJS ใช้โชว์/ซ่อนปุ่ม
            res.locals.permission = perms[0]; 
            return next(); 

        } else {
            // ⛔ ไม่มีสิทธิ์ -> เตะกลับ Dashboard พร้อมโชว์ SweetAlert2 แบบหล่อๆ
            console.log(`❌ บล็อกการเข้าถึง! ไม่มีสิทธิ์เข้า URL: ${currentPath}`);
            return res.send(`
                <!DOCTYPE html>
                <html lang="th">
                <head>
                    <meta charset="utf-8">
                    <title>Access Denied</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
                    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
                    <style>
                        body { background-color: #f8f9fc; font-family: 'Kanit', sans-serif; }
                    </style>
                </head>
                <body>
                    <script>
                        // 🚀 เรียกใช้ SweetAlert2
                        Swal.fire({
                            title: 'ปฏิเสธการเข้าถึง!',
                            text: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้ครับ กรุณาติดต่อผู้ดูแลระบบ',
                            icon: 'error',
                            confirmButtonText: 'กลับสู่หน้าหลัก',
                            confirmButtonColor: '#e74a3b', // สีแดงสไตล์ตระกูล Danger
                            allowOutsideClick: false // บังคับให้ต้องกดปุ่มเท่านั้น
                        }).then((result) => {
                            // 🟢 พอกดปุ่ม "กลับสู่หน้าหลัก" ปุ๊บ ค่อยสั่งเปลี่ยนหน้าต่าง (Redirect)
                            if (result.isConfirmed) {
                                window.location.href = '/myproject_nodejs/dashboard';
                            }
                        });
                    </script>
                </body>
                </html>
            `);
        }

    } catch (error) {
        console.error("Check Permission Error:", error);
        return res.status(500).send("ระบบตรวจสอบสิทธิ์ขัดข้อง");
    }
};

// 🟢 ส่งออก checkPermission ไปใช้ด้วย
module.exports = { loadMenus, checkPermission };