// 🟢 1. ชี้เป้าหมายไปที่โฟลเดอร์ config แทนของเดิม
const db = require('../config/db'); 
const bcrypt = require('bcryptjs');

const login = async (req, res) => {
    // รับค่าที่ส่งมาจากฟอร์ม Login
    const { username, password } = req.body;

    try {
        // 2. ค้นหา Username ในฐานข้อมูล MariaDB 
        // (ตรวจสอบชื่อตาราง users ให้ตรงกับระบบจริงของคุณกรนะครับ)
        // const sql = "SELECT * FROM users WHERE username = ?";

        const sql = `
            SELECT 
				u.id ,u.username ,u.password,u.fullname ,u.group_id ,ug.group_name ,d.dept_name
				,br.id as branch_id ,br.branch_name
			FROM users u
			LEFT JOIN user_groups ug ON ug.id = u.group_id
			LEFT JOIN departments d ON d.id = u.dept_id
			LEFT JOIN branches br ON br.id = u.branch_id
            WHERE u.username = ?
        `;

        const [rows] = await db.query(sql, [username]);

        if (rows.length > 0) {
            const user = rows[0];

            // 3. นำรหัสที่พิมพ์มา เทียบกับรหัส Hash ในฐานข้อมูล
            const match = await bcrypt.compare(password, user.password);

            // 💡 ทริคสำหรับการทดสอบ: ถ้าใน DB ยังไม่ได้เข้ารหัส (เป็น text ธรรมดา) 
            // ให้คอมเมนต์บรรทัดบน แล้วใช้บรรทัดล่างนี้แทนไปก่อนครับ:
            // const match = (password === user.password);

            if (match) {
                // รหัสถูกต้อง -> สร้าง Session จำผู้ใช้งาน
                req.session.user = { 
                    id: user.id, 
                    username: user.username,
					group_id: user.group_id,
                    fullname: user.fullname,
                    group_name: user.group_name,
                    dept_name: user.dept_name,
					branch_id: user.branch_id,
					branch_name: user.branch_name
                };

                // สั่ง Redirect ไปหน้า Dashboard 
                // (ต้องมี /myproject_nodejs/ นำหน้า เพื่อให้ผ่าน Nginx แบบสวยๆ)
                return res.redirect('/myproject_nodejs/dashboard');
            }
        }

        // กรณีไม่เจอ Username หรือ รหัสผิด -> ส่ง Error กลับไปแสดงที่หน้าเดิม
        res.render('login', { error: 'ชื่อผู้ใช้งาน หรือ รหัสผ่าน ไม่ถูกต้อง!' });

    } catch (error) {
        console.error("Database Error:", error);
        res.render('login', { error: 'ระบบฐานข้อมูลขัดข้อง กรุณาติดต่อทีมซัพพอร์ต' });
    }
};

module.exports = { login };

// ... ฟังก์ชัน const login = async (req, res) => { ... } โค้ดเดิมด้านบน ...

// 🟢 ฟังก์ชันสำหรับออกจากระบบ
const logout = (req, res) => {
    // สั่งทำลาย Session ทั้งหมดของผู้ใช้นี้
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout Error:", err);
            return res.redirect('/myproject_nodejs/dashboard');
        }
        
        // ล้าง Cookie (เพื่อความปลอดภัยระดับสูงสุด สไตล์ IT Support)
        res.clearCookie('connect.sid'); 
        
        // เด้งผู้ใช้กลับไปที่หน้า Login
        res.redirect('/myproject_nodejs/');
    });
};

// 🟢 อย่าลืมเพิ่ม logout เข้าไปใน module.exports ด้วยนะครับ
module.exports = { login, logout };