// ประกาศตัวแปร Object กลางเพื่อให้เรียกใช้งานง่ายๆ
const App = {
    
    // 1. ฟังก์ชันเปิด Modal สารพัดประโยชน์
    showModal: function(title, message, type = 'info') {
        $('#globalModalTitle').text(title);
        $('#globalModalBody').html(message);
        
        // ถ้าอยากเปลี่ยนสีหัว Modal ตามประเภท (info, warning, danger) ก็เขียนเพิ่มตรงนี้ได้
        
        $('#globalModal').modal('show');
    },

    // 2. ฟังก์ชันแปลงตารางเป็น DataTable พร้อมตั้งค่าภาษาไทย
    initDataTable: function(tableId) {
        $(tableId).DataTable({
            "language": {
                "url": "//cdn.datatables.net/plug-ins/1.10.24/i18n/Thai.json"
            },
            "pageLength": 10
        });
    }
};