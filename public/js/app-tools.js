// ไฟล์: public/myproject_nodejs/js/app-tools.js

const AppTools = {
    // 1. ฟังก์ชันเรียกใช้งาน Modal แจ้งเตือน (รองรับประเภท info, success, danger, warning)
    showModal: function(title, message, type = 'info') {
        // เปลี่ยนสี Header ตามประเภทของ Error/Alert
        let headerClass = 'bg-primary text-white';
        if (type === 'danger' || type === 'error') headerClass = 'bg-danger text-white';
        if (type === 'success') headerClass = 'bg-success text-white';
        if (type === 'warning') headerClass = 'bg-warning text-dark';

        // ยัดข้อมูลลงไปใน Modal
        $('#appGlobalModalHeader').removeClass().addClass(`modal-header ${headerClass}`);
        $('#appGlobalModalTitle').text(title);
        $('#appGlobalModalBody').html(message);
        
        // สั่งเปิด Modal
        $('#appGlobalModal').modal('show');
    },

    // 2. ฟังก์ชันแปลงตารางธรรมดา ให้เป็น DataTables แบบภาษาไทย
    initDataTable: function(tableSelector) {
        // ตรวจสอบว่ามีตารางนี้อยู่จริงไหมก่อนเรียกใช้
        if ($(tableSelector).length > 0) {
            return $(tableSelector).DataTable({
                "language": {
                    "url": "//cdn.datatables.net/plug-ins/1.10.24/i18n/Thai.json"
                },
                "pageLength": 10,
                "responsive": true
            });
        } else {
            console.warn(`AppTools: ไม่พบตารางชื่อ ${tableSelector} ในหน้านี้`);
        }
    },

    // 3. ฟังก์ชันตรวจสอบการกรอกข้อมูล (Form Validation แบบ Manual)
    checkEmpty: function(inputId, fieldName) {
        const val = $(inputId).val().trim();
        if (!val) {
            this.showModal('ข้อมูลไม่ครบถ้วน!', `กรุณากรอก <b>${fieldName}</b> ด้วยครับ`, 'warning');
            $(inputId).focus();
            return false;
        }
        return true;
    }
};