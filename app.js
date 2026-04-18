// 1. 🟢 โหลด dotenv เป็นบรรทัดแรกสุดของไฟล์เลยครับ (สำคัญมาก!)
require('dotenv').config();
// โหลดเครื่องมือที่ติดตั้งไว้
const express = require('express');
const session = require('express-session');
const favicon = require('serve-favicon');
const path = require('path');
const app = express();
const { requireAuth } = require('./middleware/authMiddleware');
const { loadMenus, checkPermission } = require('./middleware/menuMiddleware');
const userController = require('./controllers/userController');
const reportController = require('./controllers/reportController');
const multer = require('multer');
const importController = require('./controllers/importController');
const customerController = require('./controllers/customerController'); // ปรับ path ให้ตรงกับโปรเจกต์
const branchController = require('./controllers/branchController'); // สาขา
const priceController = require('./controllers/priceController'); //กำหนดราคา
const factoryController = require('./controllers/factoryController'); //ตั้งค่าโรงงานปลายทาง
const outboundController = require('./controllers/outboundController'); //บันทึกข้อมูลส่งน้ำยางโรงงาน

app.locals.baseUrl = process.env.BASE_URL || '';

// ลอง console.log ดูว่าค่ามาไหม
// console.log('🚀 Base URL is set to:', app.locals.baseUrl);

// 🚀 นำโค้ดนี้ไปวางไว้บนๆ (ก่อนถึงพวก app.use(express.static...))
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

// 🟢 เพิ่มระบบรับซื้อน้ำยาง: ดึง Controller มารอไว้
const parasalesController = require('./controllers/parasalesController');

// const checkPermission = require('./middleware/checkPermission');
// 🟢 เพิ่มส่วนนี้เข้าไป: เรียกใช้งาน Route Authentication


// สาเหตุที่ใช้ '/auth' เพราะฟอร์มส่งมาที่ /myproject_nodejs/auth/login
// และ Nginx ของคุณกร rewrite ตัด /myproject_nodejs ออกให้แล้ว

// 1. ตั้งค่าหน้าตาเว็บ (View Engine)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 🚀 สั่งให้ Express.js ไว้ใจ Proxy (Nginx) และยอมรับ IP ที่ถูกส่งต่อมา
app.set('trust proxy', true);

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
    cookie: { 
        maxAge:1000 * 60 * 30  // ตัวอย่างนี้คือตั้งไว้ 30 นาทีครับ
    }
}));

// ใส่ไว้ใต้โค้ดตั้งค่า session (...)
app.use((req, res, next) => {
    // 🚀 โยนข้อมูล user ใน session เข้า res.locals
    // ทำให้ไฟล์ EJS ทุกไฟล์ สามารถเรียกใช้ตัวแปร <%= user.fullname %> ได้เลย
    res.locals.user = req.session.user || null; 
    next();
});

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

app.use((req, res, next) => {
    res.locals.session = req.session; 
    next();
});

const i18n = require('i18n');
// const path = require('path');

// 🟢 1. ตั้งค่า i18n
i18n.configure({
    locales: ['th', 'en'], // ภาษาที่รองรับ
    directory: path.join(__dirname, 'locales'), // ชี้ไปที่โฟลเดอร์ที่เราสร้างไว้
    defaultLocale: 'th', // ภาษาเริ่มต้น
    objectNotation: true, // 💡 เปิดโหมดนี้เพื่อให้เรียกใช้แบบ menu.dashboard ได้
    autoReload: true // ถ้าเราแอบแก้ไฟล์ json มันจะอัปเดตเว็บให้ทันที!
});

// 🟢 2. ให้ Express รู้จัก i18n
app.use(i18n.init);

// 🟢 3. ดักจับ Session เพื่อให้ระบบจำได้ว่า User คนนี้เลือกภาษาอะไรไว้
app.use((req, res, next) => {
    // 1. ดึงภาษาจาก Session (ถ้าไม่มีให้ใช้ 'th' เป็นค่าเริ่มต้น)
    const currentLang = (req.session && req.session.lang) ? req.session.lang : 'th';
    
    // 2. สั่งเปลี่ยนภาษาให้กระเป๋า res (เพื่อให้ EJS ทุกหน้าเอาไปใช้)
    res.setLocale(currentLang); 
    
    // 3. ฝากตัวแปรให้ EJS ใช้ตรวจสอบว่าตอนนี้ภาษาอะไร (เช่น เอาไปทำปุ่ม Active)
    res.locals.currentLang = currentLang; 

    // (เปิด Console.log ดูได้ครับ ถ้าไม่ใช้แล้วค่อยลบทิ้ง)
    // console.log(`[DEBUG] เรนเดอร์หน้าเว็บด้วยภาษา: ${res.getLocale()}`);
    
    next();
});

const appRouter = express.Router();

// ==========================================
// 🟢 API สำหรับกดสลับภาษา (เปลี่ยนภาษาเสร็จแล้วรีเฟรชหน้าเดิม)
// ==========================================
appRouter.get('/change-lang/:lang', (req, res) => {
    const lang = req.params.lang;
    
    // 1. เช็คว่าภาษาที่ส่งมา มีในระบบไหม
    if (['th', 'en'].includes(lang)) {
        // 2. บันทึกภาษาลง Session
        req.session.lang = lang; 
        
        // 3. บังคับเซฟ Session ให้เสร็จชัวร์ๆ ก่อนสั่งรีเฟรชหน้าเว็บ
        req.session.save((err) => {
            if (err) console.error("Session Save Error:", err);
            // res.redirect('back'); // วาร์ปกลับไปหน้าล่าสุดที่ User เปิดอยู่
			res.json({ status: 'success' });
        });
    } else {
        // ถ้าส่งภาษาแปลกๆ มา ก็แค่รีเฟรชกลับหน้าเดิม
        res.redirect('back');
    }
});
// ==========================================

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

// ... โค้ด Route อื่นๆ ...
// appRouter.get('/user_list', requireAuth, loadMenus, checkPermission, userController.showUserList);

// 🟢 เพิ่มเส้นทางสำหรับรับข้อมูล POST จาก AJAX
appRouter.post('/api/add_user', requireAuth, userController.addUser);

// 🟢 เพิ่ม 2 เส้นทางนี้ สำหรับดึงข้อมูลและอัปเดตข้อมูล
appRouter.get('/api/get_user/:id', requireAuth, userController.getUser);
appRouter.post('/api/update_user', requireAuth, userController.updateUser);
// 🟢 เพิ่มเส้นทางสำหรับรับคำสั่งลบข้อมูล
appRouter.post('/api/delete_user', requireAuth, userController.deleteUser);

// 1. Route เปิดหน้าจอเลือกวันที่ (ต้องมีสิทธิ์ถึงจะเข้าได้)
appRouter.get('/report_issues', requireAuth, loadMenus, checkPermission, reportController.showReportPage);

// 2. Route รับคำสั่งโหลด Excel (ไม่ต้องเช็ค loadMenus ก็ได้ เพราะมันไม่ได้โชว์หน้าเว็บ)
appRouter.get('/export/issues/excel', requireAuth, reportController.exportIssueExcel);

appRouter.get('/export/issues/pdf', requireAuth, reportController.exportIssuePdf);

// 🟢 ตั้งค่า Multer ให้รับไฟล์มาเก็บไว้ใน RAM ชั่วคราว (ไม่ต้องสร้างไฟล์ขยะในเครื่อง)
const upload = multer({ storage: multer.memoryStorage() });

// 🟢 แก้เป็นแบบนี้ครับ (เพิ่ม loadMenus และ checkPermission)
/*appRouter.get('/price_import', requireAuth, loadMenus, checkPermission, (req, res) => {
    res.render('price_import', { title: 'นำเข้าข้อมูลราคา' });
});*/

appRouter.get('/price_import', requireAuth, loadMenus, checkPermission, (req, res) => {
    res.render('price_import', { title: 'นำเข้าข้อมูลราคา' });
});

// 🟢 API รับไฟล์ Excel (ต้องใช้ upload.single() เพื่อดักจับไฟล์ชื่อ 'price_file')
appRouter.post('/api/import/excel', requireAuth, upload.single('price_file'), importController.importPriceExcel);

// 1. เปิดหน้าจอ (ดักเช็คสิทธิ์และโหลดเมนูเหมือนหน้าอื่นๆ)
appRouter.get('/parasales_list', requireAuth, loadMenus, checkPermission, parasalesController.getParasalesList);

appRouter.post('/api/parasales_list/add', requireAuth, checkPermission, parasalesController.addTransaction);

appRouter.get('/api/parasales_list/history/:id', requireAuth, checkPermission, parasalesController.getCustomerHistory);

// 🟢 ดึงรายละเอียดรายการรับซื้อ 1 รายการ
appRouter.get('/api/parasales_list/detail/:id', requireAuth, checkPermission, parasalesController.getTransactionDetail);

// 🟢 ยกเลิกรายการรับซื้อ
appRouter.post('/api/parasales_list/cancel/:id', requireAuth, checkPermission, parasalesController.cancelTransaction);

// ==========================================
// 🟢 ระบบจัดการลูกค้า (Customer)
// ==========================================
// 1. หน้า View (ต้องล็อคอิน + โหลดเมนู + เช็คสิทธิ์)
appRouter.get('/customers', requireAuth, loadMenus, checkPermission, customerController.customerPage);

// 2. API (🚀 ต้องเติม checkPermission ตรงกลางด้วยนะครับ!)
appRouter.get('/api/customers', requireAuth, checkPermission, customerController.getCustomers);
appRouter.post('/api/customers/add', requireAuth, checkPermission, customerController.addCustomer);
appRouter.post('/api/customers/update/:id', requireAuth, checkPermission, customerController.updateCustomer);
appRouter.post('/api/customers/delete/:id', requireAuth, checkPermission, customerController.deleteCustomer);

// ==========================================
// 🟢 ระบบจัดการสาขา (Branches)
// ==========================================
appRouter.get('/branches', requireAuth, loadMenus, checkPermission, branchController.branchPage);
appRouter.get('/api/branches', requireAuth, branchController.getBranches);
appRouter.post('/api/branches/add', requireAuth, branchController.addBranch);
appRouter.post('/api/branches/update/:id', requireAuth, branchController.updateBranch);
appRouter.post('/api/branches/delete/:id', requireAuth, branchController.deleteBranch);

// ==========================================
// 🟢 ระบบกำหนดราคารับซื้อ (Daily Prices)
// ==========================================
appRouter.get('/daily_prices', requireAuth, loadMenus, checkPermission, priceController.pricePage);
appRouter.get('/api/daily_prices', requireAuth, checkPermission, priceController.getPrices);
appRouter.post('/api/daily_prices/add', requireAuth, checkPermission, priceController.addPrice);
appRouter.post('/api/daily_prices/update/:id', checkPermission, requireAuth, priceController.updatePrice);
appRouter.post('/api/daily_prices/delete/:id', checkPermission, requireAuth, priceController.deletePrice);

// ==========================================
// 🟢 ระบบจัดการโรงงานปลายทาง (Factories)
// ==========================================
appRouter.get('/factories', requireAuth, loadMenus, checkPermission, factoryController.factoryPage);
appRouter.get('/api/factories', requireAuth, checkPermission, factoryController.getFactories);
appRouter.post('/api/factories/add', requireAuth, checkPermission, factoryController.addFactory);
appRouter.post('/api/factories/update/:id', requireAuth, factoryController.updateFactory);
appRouter.post('/api/factories/delete/:id', requireAuth, factoryController.deleteFactory);

// ==========================================
// 🟢 ระบบส่งออกน้ำยาง (Outbounds)
// ==========================================
appRouter.get('/outbounds', requireAuth, loadMenus, checkPermission, outboundController.outboundPage);
appRouter.get('/api/outbounds', requireAuth, checkPermission, outboundController.getOutbounds);
appRouter.post('/api/outbounds/add', requireAuth,checkPermission, outboundController.addOutbound);
appRouter.post('/api/outbounds/close/:id', requireAuth, outboundController.closeOutbound);
appRouter.post('/api/outbounds/cancel/:id', requireAuth, outboundController.cancelOutbound);

app.use('/', appRouter);               // ประตูที่ 1: สำหรับ Nginx (9090) ที่โดนตัด URL ไปแล้ว
app.use('/myproject_nodejs', appRouter); // ประตูที่ 2: สำหรับเข้าพอร์ต 7000 ตรงๆ

// =========================================================================
// 🟢 Middleware ดักจับ 404 Not Found (หน้าเว็บที่ยังไม่ได้สร้าง หรือพิมพ์ URL ผิด)
// ⚠️ กฎเหล็ก: ต้องวางไว้ล่างสุดของ Route ทั้งหมดเสมอ! 
// =========================================================================
app.use((req, res, next) => {
    // ส่งหน้า HTML พร้อม SweetAlert2 แจ้งเตือนว่า "กำลังพัฒนา"
    res.status(404).send(`
        <!DOCTYPE html>
        <html lang="th">
        <head>
            <meta charset="utf-8">
            <title>Under Development</title>
            <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
            <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
            <style>
                body { background-color: #f8f9fc; font-family: 'Kanit', sans-serif; }
            </style>
        </head>
        <body>
            <script>
                Swal.fire({
                    title: 'กำลังพัฒนา 🚧',
                    text: 'ฟังก์ชันนี้กำลังอยู่ระหว่างการพัฒนาครับ อดใจรออีกนิดนะครับ!',
                    icon: 'info',
                    confirmButtonText: 'กลับสู่หน้าหลัก',
                    confirmButtonColor: '#f6c23e', // สีเหลืองสไตล์ Warning/Construction
                    allowOutsideClick: false
                }).then((result) => {
                    if (result.isConfirmed) {
                        window.location.href = '/myproject_nodejs/dashboard';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// 6. รันที่พอร์ต 7000 ตามที่คุณกรต้องการ
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`-------------------------------------------`);
    console.log(`🚀 Myproject_nodejs start at ${PORT}`);
    console.log(`-------------------------------------------`);
});