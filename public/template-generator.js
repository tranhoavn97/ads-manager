'use strict';

// Template generator chuẩn hoá cho nút "Tải file mẫu".
// File này có thể được load sau app.js để chặn handler cũ bằng capture listener.
(function () {
  function aoa(ws, data) {
    XLSX.utils.sheet_add_aoa(ws, data, { origin: -1 });
  }

  function setCols(ws, widths) {
    ws['!cols'] = widths.map((wch) => ({ wch }));
  }

  function downloadStandardTemplate() {
    const headers = [
      'Tên Page', 'Link bài viết', 'Chế độ nội dung', 'Xử lý CTA', 'Link CTA', 'Nút CTA',
      'Tên chiến dịch', 'Tên nhóm quảng cáo', 'Tên quảng cáo', 'Loại chiến dịch',
      'Quốc gia', 'Ngân sách', 'Cấp ngân sách', 'Loại ngân sách',
      'Ngày bắt đầu', 'Giờ bắt đầu', 'Ngày kết thúc', 'Giờ kết thúc', 'Trạng thái', 'Ghi chú'
    ];

    const rows = [
      headers,
      [
        'Tún TV',
        'https://www.facebook.com/reel/1528947745259708',
        'Bài viết có sẵn',
        'CTA tự động',
        'https://s.shopee.vn/7AbSPiczTW',
        'Mua ngay',
        '17387640570_SHPAAR27_campaign01',
        '17387640570_SHPAAR27_adgroup01',
        '17387640570_SHPAAR27_ad01',
        'Lưu lượng truy cập',
        'Việt Nam',
        200000,
        'Cấp nhóm',
        'Hàng ngày',
        '26/06/2026',
        '08:00',
        '30/06/2026',
        '23:59',
        'Tạm dừng',
        'Mẫu: Existing Post + CTA Shopee'
      ],
      ['', '', 'Bài viết có sẵn', 'CTA tự động', 'https://s.shopee.vn/xxxxx', 'Mua ngay', '', '', '', 'Lưu lượng truy cập', 'Việt Nam', 200000, 'Cấp nhóm', 'Hàng ngày', '', '08:00', '', '23:59', 'Tạm dừng', '']
    ];

    const guide = [
      ['Nhóm', 'Giá trị'],
      ['Chế độ nội dung', 'Bài viết có sẵn'],
      ['Xử lý CTA', 'CTA tự động'],
      ['Xử lý CTA', 'Giữ CTA'],
      ['Xử lý CTA', 'Bỏ CTA'],
      ['Nút CTA', 'Mua ngay'],
      ['Nút CTA', 'Tìm hiểu thêm'],
      ['Loại chiến dịch', 'Lưu lượng truy cập'],
      ['Quốc gia', 'Việt Nam'],
      ['Quốc gia', 'Thái Lan'],
      ['Quốc gia', 'Singapore'],
      ['Cấp ngân sách', 'Cấp nhóm'],
      ['Cấp ngân sách', 'Cấp chiến dịch'],
      ['Loại ngân sách', 'Hàng ngày'],
      ['Loại ngân sách', 'Trọn đời'],
      ['Trạng thái', 'Tạm dừng'],
      ['Trạng thái', 'Bật']
    ];

    const help = [
      ['Cột', 'Cách nhập'],
      ['Tên Page', 'Nhập tên Page, link Page hoặc Page ID. Khuyến nghị nhập Page ID để chính xác nhất.'],
      ['Link bài viết', 'Dán link post/reel/photo/video Facebook. Với Reel, tool sẽ cố lấy object_story_id từ Video ID.'],
      ['Chế độ nội dung', 'Chỉ dùng: Bài viết có sẵn.'],
      ['Xử lý CTA', 'Dùng: CTA tự động để gắn Mua ngay + link Shopee.'],
      ['Link CTA', 'Dán link Shopee đầy đủ, bắt đầu bằng https://'],
      ['Nút CTA', 'Khuyến nghị: Mua ngay.'],
      ['Loại chiến dịch', 'Chỉ dùng: Lưu lượng truy cập.'],
      ['Ngân sách', 'Nhập số, ví dụ 200000.'],
      ['Trạng thái', 'Khuyến nghị Tạm dừng để kiểm tra trước khi bật.']
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    setCols(ws, [20, 48, 20, 18, 36, 16, 36, 36, 34, 22, 16, 14, 16, 16, 16, 14, 16, 14, 14, 32]);
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Quảng cáo');

    const opt = XLSX.utils.aoa_to_sheet(guide);
    setCols(opt, [22, 28]);
    XLSX.utils.book_append_sheet(wb, opt, 'Danh sách chọn');

    const hd = XLSX.utils.aoa_to_sheet(help);
    setCols(hd, [24, 90]);
    XLSX.utils.book_append_sheet(wb, hd, 'Hướng dẫn');

    XLSX.writeFile(wb, 'mau_quang_cao_hang_loat_chuan_hoa.xlsx');
  }

  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest && e.target.closest('#templateBtn');
    if (!btn || typeof XLSX === 'undefined') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    downloadStandardTemplate();
  }, true);
})();
