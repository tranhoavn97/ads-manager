'use strict';

(function () {
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  }

  function adjustLoginUi() {
    const fb = document.querySelector('a[href="/api/auth/login"]');
    if (fb) fb.style.display = 'none';
    const toggle = document.querySelector('#tokenToggle');
    if (toggle) toggle.style.display = 'none';
    const box = document.querySelector('#tokenBox');
    if (box) box.classList.remove('hidden');
    const hint = document.querySelector('.login-hint');
    if (hint) hint.textContent = 'Đăng nhập bằng mã truy cập:';
  }

  function patchSheetParser() {
    if (!window.XLSX?.utils?.sheet_to_json || window.XLSX.utils._mpPatched) return;
    const original = window.XLSX.utils.sheet_to_json;
    window.XLSX.utils.sheet_to_json = function patchedSheetToJson(ws, opts) {
      const out = original.call(this, ws, opts);
      if (!opts || opts.header !== 1 || !Array.isArray(out) || !Array.isArray(out[0])) return out;
      const headers = out[0].map((h) => norm(h));
      const idx = (patterns) => headers.findIndex((h) => patterns.some((p) => h === p || h.includes(p)));
      const campaignTypeCol = idx(['loai chien dich', 'muc tieu chien dich', 'muc tieu', 'objective']);
      const budgetLevelCol = idx(['cap ngan sach', 'ngan sach cap', 'cbo abo']);
      const budgetModeCol = idx(['loai ngan sach', 'kieu ngan sach', 'hang ngay tron doi']);
      for (let r = 1; r < out.length; r++) {
        const row = out[r];
        if (!Array.isArray(row)) continue;
        if (campaignTypeCol >= 0) {
          const v = norm(row[campaignTypeCol]);
          if (v.includes('luu luong') || v.includes('traffic') || v.includes('truy cap')) row[campaignTypeCol] = 'Traffic';
        }
        if (budgetLevelCol >= 0) {
          const v = norm(row[budgetLevelCol]);
          if (v.includes('chien dich') || v.includes('campaign') || v.includes('cbo')) row[budgetLevelCol] = 'campaign';
          else if (v.includes('nhom') || v.includes('adset') || v.includes('abo')) row[budgetLevelCol] = 'adset';
        }
        if (budgetModeCol >= 0) {
          const v = norm(row[budgetModeCol]);
          if (v.includes('tron doi') || v.includes('lifetime') || v.includes('toan bo')) row[budgetModeCol] = 'lifetime';
          else if (v.includes('hang ngay') || v.includes('daily')) row[budgetModeCol] = 'daily';
        }
      }
      return out;
    };
    window.XLSX.utils._mpPatched = true;
  }

  function setCols(ws, widths) { ws['!cols'] = widths.map((wch) => ({ wch })); }

  function downloadStandardTemplate() {
    const headers = [
      'Tên Page',
      'Link bài viết',
      'Chế độ nội dung',
      'Tên chiến dịch',
      'Loại chiến dịch',
      'Tên nhóm quảng cáo',
      'Tên quảng cáo',
      'Quốc gia',
      'Ngân sách',
      'Cấp ngân sách',
      'Loại ngân sách',
      'Ngày bắt đầu',
      'Giờ bắt đầu',
      'Ngày kết thúc',
      'Giờ kết thúc',
      'Trạng thái',
      'Nút CTA (tuỳ chọn)',
      'Link CTA (tuỳ chọn)',
      'Ghi chú',
    ];
    const rows = [
      headers,
      [
        '123456789',
        '123456789_987654321',
        'Bài viết có sẵn',
        'Traffic Existing Post 01',
        'Traffic',
        'Adset VN 01',
        'Ad Existing Post 01',
        'VN',
        200000,
        'Cấp nhóm',
        'Hàng ngày',
        '01/07/2026',
        '08:00',
        '',
        '',
        'Tạm dừng',
        '',
        '',
        'Không CTA/link vẫn hợp lệ.',
      ],
      [
        '123456789',
        'https://www.facebook.com/page/posts/987654321',
        'Bài viết có sẵn',
        'Traffic Existing Post CBO Lifetime',
        'Lưu lượng truy cập',
        'Adset VN Lifetime',
        'Ad Existing Post CTA',
        'Việt Nam',
        500000,
        'Cấp chiến dịch',
        'Trọn đời',
        '01/07/2026',
        '08:00',
        '07/07/2026',
        '23:59',
        'Tạm dừng',
        'SHOP_NOW',
        'https://example.com',
        'CTA/link là tuỳ chọn; nếu Meta bỏ qua app vẫn tạo existing post ad.',
      ],
    ];
    const guide = [
      ['Cột', 'Cách nhập'],
      ['Tên Page', 'Nhập Page ID, link Page hoặc tên Page. Khuyến nghị Page ID.'],
      ['Link bài viết', 'Nhập link post/photo/video/reel hoặc object_story_id dạng PAGE_ID_POST_ID.'],
      ['Chế độ nội dung', 'Dùng Bài viết có sẵn. App không tạo dark post và không tạo bài mới.'],
      ['Loại chiến dịch', 'Traffic hoặc Lưu lượng truy cập.'],
      ['Cấp ngân sách', 'Cấp chiến dịch/campaign/CBO hoặc Cấp nhóm/adset/ABO.'],
      ['Loại ngân sách', 'Hàng ngày/daily hoặc Trọn đời/lifetime. Trọn đời cần ngày kết thúc.'],
      ['Nút CTA / Link CTA', 'Tuỳ chọn. Nếu Meta không nhận CTA/link, app retry bằng object_story_id không CTA.'],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    setCols(ws, [18, 42, 20, 34, 22, 30, 30, 14, 14, 18, 18, 16, 14, 16, 14, 14, 18, 36, 58]);
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Quảng cáo');

    const hd = XLSX.utils.aoa_to_sheet(guide);
    setCols(hd, [28, 100]);
    XLSX.utils.book_append_sheet(wb, hd, 'Hướng dẫn');

    XLSX.writeFile(wb, 'mau_existing_post_traffic.xlsx');
  }

  adjustLoginUi();
  patchSheetParser();
  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest && e.target.closest('#templateBtn');
    if (!btn || typeof XLSX === 'undefined') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    downloadStandardTemplate();
  }, true);
})();
