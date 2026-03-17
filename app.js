// โหลดเครื่องมือที่ติดตั้งไว้
const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();
const { requireAuth } = require('./middleware/authMiddleware');
const { loadMenus, checkPermission } = require('./middleware/menuMiddleware');
const userController = require('./controllers/userController');

// 🟢 เพิ่มส่วนนี้เข้าไป: เรียกใช้งาน Route Authentication


// สาเหตุที่ใช้ '/auth' เพราะฟอร์มส่งมาที่ /myproject_nodejs/auth/login
// และ Nginx ของคุณกร rewrite ตัด /myproject_nodejs ออกให้แล้ว

// 1. ตั้งค่าหน้าตาเว็บ (View Engine)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. บอกให้ Node รู้ว่าไฟล์นิ่งๆ (Static) อยู่ในโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));

// 🟢 เพิ่มบรรทัดนี้: รองรับการเข้าผ่าน Node.js ตรงๆ (พอร์ต 7000)
app.use('/myproject_nodejs', express.static(path.join(__dirname, 'public')));

// 🟢 ท่าที่ 3 (พระเอกของเรา): อนุญาตให้เข้าพอร์ต 7000 ตรงๆ แบบมีคำว่า /public ติดมาด้วย!
app.use('/myproject_nodejs/public', express.static(path.join(__dirname, 'public')));

// 3. ตั้งค่าให้รับข้อมูลจากฟอร์ม Login ได้ (POST body)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 4. ตั้งค่าระบบ Session สำหรับจดจำการล็อกอิน
app.use(session({
    secret: 'my_secret_key_1234',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 ชั่วโมง
}));

app.use((req, res, next) => {
    // แอบแนบข้อมูล user ไปให้เผื่อใช้แสดงชื่อมุมขวาบน
    res.locals.user = req.session ? req.session.user : null;
	
	// ทริคสำคัญ: ตัด /myproject_nodejs ออกจาก URL เสมอ (ถ้ามี) 
    // เพื่อให้ Sidebar เช็ค Active ได้เป๊ะ ไม่ว่าจะเข้าจากพอร์ต 9090 หรือ 7000
    let normalizedPath = req.path.replace('/myproject_nodejs', '');
    if (normalizedPath === '') normalizedPath = '/';
    
    // แอบแนบ URL ปัจจุบัน (เช่น '/user_list') ไปให้ Sidebar เช็ค Active
    res.locals.currentPath = normalizedPath; 
    
    next(); // สำคัญมาก! ต้องมี next() เพื่อให้โค้ดทำงานต่อ
});

const appRouter = express.Router();

const authRoutes = require('./routes/authRoutes');
appRouter.use('/auth', authRoutes);

// 5. ตัวอย่าง Route หน้า Login (เดี๋ยวเราจะย้ายไป MVC ทีหลัง)
appRouter.get('/', (req, res) => {
    // 🟢 เช็คว่า "มี" Session ผู้ใช้งานค้างอยู่ไหม?
    if (req.session && req.session.user) {
        // ถ้าล็อกอินอยู่แล้ว ให้เด้งไปหน้า Dashboard ทันที
        return res.redirect('/myproject_nodejs/dashboard');
    }

    res.render('login', { error: null }); // จะไปโหลดไฟล์ views/login.ejs
});

// หน้า Dashboard ชั่วคราว (เดี๋ยวเราค่อยมาใส่ Middleware ดักสิทธิ์ทีหลังครับ)
appRouter.get('/dashboard', requireAuth, loadMenus, (req, res) => {
    res.render('dashboard' , { title: 'หน้าหลัก - Myproject_ww' });
});

// 🟢 หน้าตั้งค่ากลุ่มผู้ใช้ (ดัก 3 ชั้น: ล็อกอินยัง? -> โหลดเมนูมาดูสิ -> มีสิทธิ์เข้าหน้านี้ไหม?)
appRouter.get('/user_list', requireAuth, loadMenus, checkPermission, userController.showUserList);

app.use('/', appRouter);               // ประตูที่ 1: สำหรับ Nginx (9090) ที่โดนตัด URL ไปแล้ว
app.use('/myproject_nodejs', appRouter); // ประตูที่ 2: สำหรับเข้าพอร์ต 7000 ตรงๆ

// 6. รันที่พอร์ต 7000 ตามที่คุณกรต้องการ
const PORT = 7000;
app.listen(PORT, () => {
    console.log(`-------------------------------------------`);
    console.log(`🚀 Myproject_nodejs start at ${PORT}`);
    console.log(`-------------------------------------------`);
});