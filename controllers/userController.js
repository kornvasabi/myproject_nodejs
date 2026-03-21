// ไฟล์: controllers/userController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');

const showUserList = async (req, res) => {
    try {
        // 🟢 1. วิ่งไปดึงข้อมูลผู้ใช้ พร้อมชื่อกลุ่ม สาขา และแผนก จาก MariaDB
        const sqlUsers = `
            SELECT 
                u.id, u.username, u.fullname, u.force_logout, u.last_activity,
                g.group_name, 
                b.branch_name, 
                d.dept_name
            FROM users u
            LEFT JOIN user_groups g ON u.group_id = g.id
            LEFT JOIN branches b ON u.branch_id = b.id
            LEFT JOIN departments d ON u.dept_id = d.id
            ORDER BY u.id ASC
        `;
        const [users] = await db.query(sqlUsers);
		
		// console.log("\n🕵️‍♂️ [ด่านตรวจ Data]: พบข้อมูลผู้ใช้จำนวน", users.length, "รายการ");
        // console.log("ตัวอย่างข้อมูลบรรทัดแรก:", users[0]);
		
        // 🟢 2. ดึง Master Data เผื่อเอาไปทำ Dropdown ในฟอร์มเพิ่มข้อมูล
        const [groups] = await db.query("SELECT * FROM user_groups");
        const [branches] = await db.query("SELECT * FROM branches");
        const [departments] = await db.query("SELECT * FROM departments");

        // 🟢 3. แพ็คของทั้งหมดใส่กล่อง แล้วโยนไปให้หน้า user_list.ejs
        res.render('user_list', { 
            title: 'จัดการผู้ใช้งาน - Myproject_ww',
            users: users,           // <--- ตัวนี้แหละครับที่ EJS ถามหา!
            groups: groups,
            branches: branches,
            departments: departments
        });

    } catch (error) {
        console.error("Fetch Users Error:", error);
        // ถ้า DB พัง ก็ต้องส่งกล่องเปล่าๆ ไปให้ EJS ด้วย หน้าเว็บจะได้ไม่ Error พังทลายครับ
        res.render('user_list', { 
            title: 'จัดการผู้ใช้งาน - Myproject_ww',
            users: [], 
            groups: [], 
            branches: [], 
            departments: []
        });
    }
};

// ... โค้ด showUserList เดิม ...

// 🟢 ฟังก์ชันสำหรับรับข้อมูลและ Insert ลง MariaDB
const addUser = async (req, res) => {
    try {
        // แกะกล่องข้อมูลที่ AJAX ส่งมา (ชื่อตัวแปรต้องตรงกับ name ในฟอร์ม)
        const { username, password, fullname, group_id, branch_id, dept_id } = req.body;

        // ด่านตรวจ 1: เช็คค่าว่างที่จำเป็น (Backend Validation)
        if (!username || !password || !fullname) {
            return res.json({ status: 'error', message: 'กรุณากรอก Username, Password และชื่อ-นามสกุลให้ครบถ้วนครับ' });
        }

        // 💡 ทริคจัดการ Foreign Key: ถ้าไม่ได้เลือก Dropdown มันจะส่งค่าว่าง ('') มา 
        // เราต้องแปลงให้เป็น null ไม่งั้น MariaDB จะด่าว่า Foreign Key fail ครับ
        const g_id = group_id ? group_id : null;
        const b_id = branch_id ? branch_id : null;
        const d_id = dept_id ? dept_id : null;
		
		// สร้างเกลือ (Salt) มาคลุกเคล้าให้รหัสผ่านเดายากขึ้น (ระดับความซับซ้อน = 10)
        const salt = await bcrypt.genSalt(10);
        // เอา Password ดิบๆ มาสับรวมกับเกลือ จะได้ตัวอักษรยึกยือยาวๆ
        const hashedPassword = await bcrypt.hash(password, salt);

        // คำสั่ง SQL Insert (รหัสผ่านเราบันทึกตรงๆ ไปก่อน ค่อยมาทำระบบเข้ารหัส Hash ทีหลังได้ครับ)
        const sqlInsert = `
            INSERT INTO users (username, password, fullname, group_id, branch_id, dept_id) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        // 🟢 1. รับค่าผลลัพธ์การ Insert เพื่อเอา ID ใหม่ล่าสุดมาใช้
        const [result] = await db.query(sqlInsert, [username, hashedPassword, fullname, g_id, b_id, d_id]);

        // 🟢 2. วิ่งไปดึงข้อมูล User คนใหม่ พร้อม JOIN ชื่อกลุ่ม/สาขา/แผนก เพื่อส่งกลับไปแสดงผล
        const sqlNewUser = `
            SELECT u.id, u.username, u.fullname, u.force_logout, u.last_activity,
                   g.group_name, b.branch_name, d.dept_name
            FROM users u
            LEFT JOIN user_groups g ON u.group_id = g.id
            LEFT JOIN branches b ON u.branch_id = b.id
            LEFT JOIN departments d ON u.dept_id = d.id
            WHERE u.id = ?
        `;
        const [newUser] = await db.query(sqlNewUser, [result.insertId]);

        // 🟢 3. แนบก้อนข้อมูล data: newUser[0] กลับไปให้ AJAX ด้วย
        res.json({ 
            status: 'success', 
            message: 'เพิ่มผู้ใช้งานใหม่เรียบร้อยแล้ว!',
            data: newUser[0] 
        });

    } catch (error) {
        console.error("Add User Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลครับ' });
    }
};

// ... โค้ด addUser เดิม ...

// ==========================================
// 🟢 1. API ดึงข้อมูลเดิมมาโชว์ในฟอร์มแก้ไข
// ==========================================
const getUser = async (req, res) => {
    try {
        const userId = req.params.id; // รับค่า ID ที่ส่งมากับ URL
        const sql = "SELECT * FROM users WHERE id = ?";
        const [users] = await db.query(sql, [userId]);

        if (users.length > 0) {
            res.json({ status: 'success', data: users[0] });
        } else {
            res.json({ status: 'error', message: 'ไม่พบข้อมูลผู้ใช้งานในระบบ' });
        }
    } catch (error) {
        console.error("Get User Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
};

// ==========================================
// 🟢 2. API รับข้อมูลใหม่ไปอัปเดตทับใน MariaDB
// ==========================================
const updateUser = async (req, res) => {
    try {
        const { id, password, fullname, group_id, branch_id, dept_id, force_logout } = req.body;

        const g_id = group_id ? group_id : null;
        const b_id = branch_id ? branch_id : null;
        const d_id = dept_id ? dept_id : null;

        let sqlUpdate;
        let queryParams;

        // 💡 ลอจิกสำคัญ: เช็คว่ามีการพิมพ์รหัสผ่านใหม่มาไหม?
        if (password) {
            // ถ้าพิมพ์มา แปลว่า "ขอเปลี่ยนรหัสผ่านด้วย" -> ต้อง Hash รหัสใหม่ก่อน
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            
            sqlUpdate = `UPDATE users SET password = ?, fullname = ?, group_id = ?, branch_id = ?, dept_id = ?, force_logout = ? WHERE id = ?`;
            queryParams = [hashedPassword, fullname, g_id, b_id, d_id, force_logout, id];
        } else {
            // ถ้าว่างเปล่า แปลว่า "ใช้รหัสผ่านเดิม" -> ข้ามคอลัมน์ password ไปเลย
            sqlUpdate = `UPDATE users SET fullname = ?, group_id = ?, branch_id = ?, dept_id = ?, force_logout = ? WHERE id = ?`;
            queryParams = [fullname, g_id, b_id, d_id, force_logout, id];
        }

        // สั่งอัปเดตข้อมูล
        await db.query(sqlUpdate, queryParams);

        // 🚀 ดึงข้อมูลที่เพิ่งอัปเดตเสร็จ พร้อมชื่อกลุ่ม/สาขา/แผนก ส่งกลับไปให้หน้าเว็บวาดตารางใหม่
        const sqlUpdatedUser = `
            SELECT u.id, u.username, u.fullname, u.force_logout, u.last_activity,
                   g.group_name, b.branch_name, d.dept_name
            FROM users u
            LEFT JOIN user_groups g ON u.group_id = g.id
            LEFT JOIN branches b ON u.branch_id = b.id
            LEFT JOIN departments d ON u.dept_id = d.id
            WHERE u.id = ?
        `;
        const [updatedUser] = await db.query(sqlUpdatedUser, [id]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลเรียบร้อยแล้ว!', data: updatedUser[0] });

    } catch (error) {
        console.error("Update User Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล' });
    }
};
// ==========================================
// 🟢 3. API สำหรับลบข้อมูลผู้ใช้งาน
// ==========================================
const deleteUser = async (req, res) => {
    try {
        const { id } = req.body;

        // 💡 Defensive Programming: ดักไว้ไม่ให้ลบ Super Admin (ID 1) เด็ดขาด
        if (id == 1) {
            return res.json({ status: 'error', message: 'ไม่อนุญาตให้ลบ Super Admin ออกจากระบบครับ!' });
        }

        const sql = "DELETE FROM users WHERE id = ?";
        await db.query(sql, [id]);

        res.json({ status: 'success', message: 'ลบข้อมูลผู้ใช้งานออกจากระบบเรียบร้อยแล้ว!' });

    } catch (error) {
        console.error("Delete User Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาด ไม่สามารถลบข้อมูลได้' });
    }
};

// 🟢 อย่าลืมอัปเดตบรรทัดล่างสุดให้มี deleteUser ด้วยนะครับ
module.exports = { showUserList, addUser, getUser, updateUser, deleteUser };