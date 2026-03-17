// ไฟล์: controllers/userController.js

const showUserList = (req, res) => {
    // โยนไปหาไฟล์ views/user_list.ejs
    res.render('user_list', { title: 'ตั้งค่ากลุ่มผู้ใช้ - Myproject_ww' });
};

module.exports = { showUserList };