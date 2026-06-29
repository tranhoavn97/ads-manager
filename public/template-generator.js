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
    const headers = ['Tên Page', 'Link bài viết', 'Chế độ nội dung', 'Tên chiến dịch', 'Loại chiến dịch', 'Tên nhóm quảng cáo', 'Tên quảng cáo', 'Quốc gia', 'Ngân sách', 'Cấp ngân sách', 'Loại ngân sách', 'Ngày bắt đầu', 'Giờ bắt đầu', 'Ngày kết thúc', 'Giờ kết thúc', 'Trạng thái', 'Ghi chú'];
    const rows = [
      headers,
      ['Tún TV', 'https://www.facebook.com/reel/1528947745259708', 'Bài viết có sẵn', '17387640570_SHPAAR27_campaign01', 'Traffic', '17387640570_SHPAAR27_adgroup01', '17387640570_SHPAAR27_ad01', 'Việt Nam', 200000, 'campaign', 'lifetime', '26/06/2026', '08:00', '30/06/2026', '23:59', 'Tạm dừng', 'Mẫu: dùng bài viết có sẵn'],
      ['', '', 'Bài viết có sẵn', '', 'Traffic', '', '', 'Việt Nam', 200000, 'adset', 'daily', '', '08:00', '', '23:59', 'Tạm dừng', 'Mẫu: không nhập nút/link']
    ];
    const guide = [['Nhóm', 'Giá trị', 'Ghi chú'], ['Loại chiến dịch', 'Traffic', 'Lưu lượng truy cập'], ['Cấp ngân sách', 'campaign', 'Cấp chiến dịch'], ['Cấp ngân sách', 'adset', 'Cấp nhóm'], ['Loại ngân sách', 'lifetime', 'Trọn đời'], ['Loại ngân sách', 'daily', 'Hàng ngày'], ['Trạng thái', 'Tạm dừng', 'An toàn khi test'], ['Trạng thái', 'Bật', 'Chạy ngay']];
    const help = [['Cột', 'Cách nhập'], ['Link bài viết', 'Dán link post/reel/photo/video Facebook.'], ['Loại chiến dịch', 'Nhập Traffic hoặc Lưu lượng truy cập.'], ['Cấp ngân sách', 'campaign hoặc adset.'], ['Loại ngân sách', 'lifetime hoặc daily.'], ['Ngày kết thúc', 'Bắt buộc khi dùng lifetime.']];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    setCols(ws, [20, 48, 20, 36, 18, 36, 34, 16, 14, 16, 16, 16, 14, 16, 14, 14, 36]);
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Quảng cáo');
    const opt = XLSX.utils.aoa_to_sheet(guide);
    setCols(opt, [22, 26, 28]);
    XLSX.utils.book_append_sheet(wb, opt, 'Danh sách chọn');
    const hd = XLSX.utils.aoa_to_sheet(help);
    setCols(hd, [24, 96]);
    XLSX.utils.book_append_sheet(wb, hd, 'Hướng dẫn');
    XLSX.writeFile(wb, 'mau_quang_cao_hang_loat_chuan_hoa.xlsx');
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
