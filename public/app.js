'use strict';

// ============================================================
//  Trạng thái ứng dụng
// ============================================================
const State = {
  user: null,
  adAccounts: [],
  selectedAccount: null,
  rows: [],          // dữ liệu từ file (đã chuẩn hoá khoá)
  filter: 'all',
  search: '',
  creativeMode: 'EXISTING_POST_STRICT',
  editing: new Set(),   // các dòng đang ở chế độ nhập (sửa được nhiều dòng cùng lúc)
};
window.State = State;

// Ánh xạ class ô input ↔ trường dữ liệu của dòng (dùng để live-bind khi nhập)
const EDIT_FIELD_MAP = {
  '.page-link-input': 'pageLink', '.post-link-input': 'postLink',
  '.content-mode-input': 'contentMode', '.cta-handling-input': 'ctaHandling',
  '.campaign-name-input': 'campaignName', '.campaign-type-input': 'campaignType',
  '.adset-name-input': 'adsetName', '.ad-name-input': 'adName',
  '.cta-input': 'cta', '.cta-link-input': 'ctaLink', '.source-url-input': 'sourceUrl',
  '.budget-val-input': 'budget', '.budget-level-input': 'budgetLevel', '.budget-mode-input': 'budgetMode',
  '.start-date-input': 'startDate', '.start-time-input': 'startTimeRaw',
  '.end-date-input': 'endDate', '.end-time-input': 'endTimeRaw',
  '.country-input': 'country', '.status-input': 'statusRaw', '.notes-input': 'notes',
};

const STATUS_LABEL = {
  pending: 'Chưa kiểm tra',
  verifying: 'Đang xác minh Post ID',
  verified: 'Đã xác minh bài viết',
  checking_cta: 'Đang kiểm tra CTA',
  has_cta: 'Bài đã có CTA',
  no_cta: 'Bài chưa có CTA',
  updating_cta: 'Đang cập nhật CTA',
  updated_cta: 'Đã cập nhật CTA',
  creating_ad: 'Đang tạo quảng cáo',
  created: 'Thành công',
  need_verify: 'Cần kiểm tra lại',
  missing: 'Lỗi',
  permission: 'Lỗi',
  post_error: 'Lỗi',
  create_error: 'Lỗi',
  error: 'Lỗi'
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ============================================================
//  Nhật ký hoạt động (logs)
// ============================================================
const Logger = {
  errCount: 0,
  add(msg, kind = 'info') {
    const body = $('#logBody');
    if (!body) return;
    const empty = body.querySelector('.log-empty');
    if (empty) empty.remove();
    const line = document.createElement('div');
    line.className = 'log-line ' + kind;
    const t = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    line.innerHTML = `<span class="log-time">${t}</span><span class="log-msg">${esc(msg)}</span>`;
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
    setDockStatus(msg);
    if (kind === 'err') {
      this.errCount++;
      const b = $('#logErrBadge');
      if (b) { b.textContent = this.errCount; b.classList.remove('hidden'); }
    }
  },
  info(m) { this.add(m, 'info'); },
  ok(m) { this.add(m, 'ok'); },
  warn(m) { this.add(m, 'warn'); },
  err(m) { this.add(m, 'err'); },
  clear() {
    const body = $('#logBody');
    if (body) body.innerHTML = '<div class="log-line log-empty"><span class="log-msg">— Nhật ký trống —</span></div>';
    this.errCount = 0;
    const b = $('#logErrBadge');
    if (b) b.classList.add('hidden');
  },
};
window.Logger = Logger;

// ============================================================
//  Thanh loading dưới cùng (đổi đỏ khi có lỗi)
// ============================================================
const topLoader = {
  busy: 0,
  el() { return $('#dockLoader'); },
  bar() { return $('#dockLoader .bar'); },
  start() {
    this.busy++;
    const el = this.el(); if (!el) return;
    el.classList.remove('error');
    el.classList.add('active');
    const bar = this.bar();
    bar.style.transition = 'none'; bar.style.width = '8%';
    requestAnimationFrame(() => { bar.style.transition = 'width 8s ease-out'; bar.style.width = '88%'; });
    setLogBusy(true);
  },
  done() {
    this.busy = Math.max(0, this.busy - 1);
    if (this.busy > 0) return;
    const el = this.el(); if (!el) return;
    const bar = this.bar();
    bar.style.transition = 'width .3s ease'; bar.style.width = '100%';
    setTimeout(() => { el.classList.remove('active'); bar.style.width = '0%'; }, 350);
    setLogBusy(false);
  },
  error() {
    this.busy = Math.max(0, this.busy - 1);
    const el = this.el(); if (!el) return;
    el.classList.add('error');
    const bar = this.bar();
    bar.style.transition = 'width .3s ease'; bar.style.width = '100%';
    setTimeout(() => {
      el.classList.remove('active'); bar.style.width = '0%';
      setTimeout(() => el.classList.remove('error'), 250);
    }, 800);
    if (this.busy <= 0) setLogBusy(false);
  },
};

function setLogBusy(on) {
  const dot = $('#logDot');
  if (dot) dot.classList.toggle('busy', on);
}
function setDockStatus(msg) {
  const el = $('#dockStatus');
  if (el && msg && !/^[→←]/.test(msg)) el.textContent = msg;
}
function setDockCollapsed(collapsed) {
  document.body.classList.toggle('dock-collapsed', collapsed);
  document.body.classList.toggle('dock-open', !collapsed);
  $('#dock').classList.toggle('collapsed', collapsed);
  $('#dockToggle').textContent = collapsed ? '▴' : '▾';
}
function toggleDock(forceOpen) {
  setDockCollapsed(forceOpen ? false : !$('#dock').classList.contains('collapsed'));
}
function showDockTab(tab) {
  $$('.dock-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#logBody').classList.toggle('hidden', tab !== 'log');
  $('#histBody').classList.toggle('hidden', tab !== 'history');
  if (tab === 'history') History.render();
}
function activeDockTab() {
  return $('.dock-tab.active')?.dataset.tab || 'log';
}

// ============================================================
//  Nhận biết nút CTA (đồng bộ với campaign-mapper.js)
//  - Nếu sheet điền cột "Nút CTA": dùng giá trị đó (custom).
//  - Nếu để trống: suy theo loại chiến dịch (mặc định).
// ============================================================
const CTA_LABELS = {
  LEARN_MORE: 'Tìm hiểu thêm', SHOP_NOW: 'Mua ngay', ORDER_NOW: 'Đặt hàng',
  SIGN_UP: 'Đăng ký', SUBSCRIBE: 'Đăng ký nhận', MESSAGE_PAGE: 'Gửi tin nhắn',
  LIKE_PAGE: 'Thích Trang', BOOK_TRAVEL: 'Đặt ngay', DOWNLOAD: 'Tải xuống',
  GET_OFFER: 'Nhận ưu đãi', CONTACT_US: 'Liên hệ', CALL_NOW: 'Gọi ngay',
  APPLY_NOW: 'Đăng ký ngay', GET_QUOTE: 'Nhận báo giá', WHATSAPP_MESSAGE: 'Nhắn WhatsApp',
  NO_BUTTON: 'Không có nút',
};
const CTA_CLASS = {
  MESSAGE_PAGE: 'cta-message', WHATSAPP_MESSAGE: 'cta-message',
  LIKE_PAGE: 'cta-like', LEARN_MORE: 'cta-learn',
  SIGN_UP: 'cta-signup', SUBSCRIBE: 'cta-signup', APPLY_NOW: 'cta-signup',
  SHOP_NOW: 'cta-shop', ORDER_NOW: 'cta-shop', GET_OFFER: 'cta-shop',
  CALL_NOW: 'cta-call', CONTACT_US: 'cta-call', NO_BUTTON: 'cta-none',
};
const TYPE_DEFAULT_CTA = {
  tin_nhan: 'MESSAGE_PAGE', tuong_tac: 'LIKE_PAGE', traffic: 'LEARN_MORE', lead: 'SIGN_UP', doanh_so: 'SHOP_NOW',
};
const TYPE_KEYS = [
  ['tin_nhan',  ['tin nhan', 'messages', 'message', 'nhan tin', 'messenger']],
  ['tuong_tac', ['tuong tac', 'engagement', 'post engagement']],
  ['traffic',   ['traffic', 'luu luong', 'truy cap']],
  ['lead',      ['lead', 'khach hang tiem nang', 'tiem nang']],
  ['doanh_so',  ['doanh so', 'sales', 'conversion', 'chuyen doi', 'ban hang']],
];
function resolveTypeId(input) {
  const n = removeAccents(input);
  if (!n) return null;
  for (const [id, keys] of TYPE_KEYS) {
    if (id === n) return id;
    if (keys.some((k) => { const kk = removeAccents(k); return n === kk || n.includes(kk); })) return id;
  }
  return null;
}
const CTA_BY_NORM = (() => {
  const m = {};
  for (const [code, label] of Object.entries(CTA_LABELS)) {
    m[code.toLowerCase()] = code;
    m[removeAccents(label)] = code;
  }
  Object.assign(m, {
    'learn more': 'LEARN_MORE', 'shop now': 'SHOP_NOW', 'sign up': 'SIGN_UP', 'order now': 'ORDER_NOW',
    message: 'MESSAGE_PAGE', messenger: 'MESSAGE_PAGE', 'nhan tin': 'MESSAGE_PAGE',
    like: 'LIKE_PAGE', call: 'CALL_NOW', goi: 'CALL_NOW', none: 'NO_BUTTON', khong: 'NO_BUTTON',
  });
  return m;
})();
function resolveCtaCode(input) {
  const n = removeAccents(input);
  if (!n) return null;
  const up = n.replace(/\s+/g, '_').toUpperCase();
  if (CTA_LABELS[up]) return up;
  return CTA_BY_NORM[n] || null;
}
function ctaForRow(row) {
  const override = resolveCtaCode(row?.cta);
  if (override) return { code: override, label: CTA_LABELS[override] || override, custom: true };
  if ((row?.ctaLink && String(row.ctaLink).trim()) || (row?.sourceUrl && String(row.sourceUrl).trim())) return { code: 'SHOP_NOW', label: CTA_LABELS.SHOP_NOW || 'Mua ngay', custom: true };
  return null;
}
// Nhãn ngân sách (hiển thị trong ngăn chi tiết)
function budgetModeLabel(row) {
  const n = removeAccents(row?.budgetMode);
  if (/(tron doi|lifetime|tron|toan bo)/.test(n)) return 'trọn đời';
  return 'hàng ngày';
}
function budgetLevelLabel(row) {
  const n = removeAccents(row?.budgetLevel);
  if (/(chien dich|campaign|cbo)/.test(n)) return 'cấp chiến dịch (CBO)';
  return 'cấp nhóm';
}

function ctaPillHtml(row, withCode = false) {
  const c = ctaForRow(row);
  if (!c) return '<span class="cta-pill cta-none">Không CTA</span>';
  const cls = CTA_CLASS[c.code] || 'cta-other';
  const dot = c.custom ? '<span class="custom-dot"></span>' : '';
  const hasLink = !!((row?.ctaLink && String(row.ctaLink).trim()) || (row?.sourceUrl && String(row.sourceUrl).trim()));
  const linkState = hasLink ? 'Có link' : 'Chưa có link';
  const tip = hasLink ? 'Nút CTA có link đích trong file' : 'Nút CTA chưa có link đích trong file';
  return `<span class="cta-pill ${cls}" title="${tip}">${dot}${esc(c.label)} + ${linkState}</span>` +
    (withCode ? ` <span class="cta-code">${esc(c.code)}</span>` : '');
}

// ============================================================
//  Lịch sử camp đã lên (lưu localStorage, gồm cả camp lỗi)
// ============================================================
const History = {
  KEY: 'fbbulk_history_v1',
  items: [],
  filter: 'all',
  load() {
    try { this.items = JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
    catch { this.items = []; }
    if (!Array.isArray(this.items)) this.items = [];
    this.updateCount();
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.items.slice(0, 500))); } catch { /* hết dung lượng */ }
  },
  add(entry) {
    this.items.unshift(entry);
    if (this.items.length > 500) this.items.length = 500;
    this.save();
    this.updateCount();
    if (activeDockTab() === 'history') this.render();
  },
  clear() {
    if (!this.items.length) return;
    if (!confirm('Xoá toàn bộ lịch sử camp đã lưu?')) return;
    this.items = [];
    this.save();
    this.updateCount();
    this.render();
    Logger.info('Đã xoá lịch sử camp.');
  },
  updateCount() {
    const el = $('#histCount');
    if (el) el.textContent = this.items.length;
  },
  render() {
    const body = $('#histBody');
    if (!body) return;
    const errCount = this.items.filter((x) => x.status !== 'created').length;
    const list = this.items.filter((x) => this.filter === 'all' || x.status !== 'created');
    const rows = list.map((x) => {
      const time = new Date(x.ts).toLocaleString('vi-VN', { hour12: false });
      const tail = x.status === 'created'
        ? `<span class="mono">camp ${esc(x.ids?.campaignId || '—')}</span>`
        : `<span class="hist-err">${esc(x.error || 'Lỗi')}</span>`;
      return `
        <div class="hist-item">
          <span class="badge ${esc(x.status)} sm">${esc(STATUS_LABEL[x.status] || x.status)}</span>
          <span class="hist-main">
            <div class="hist-name">${esc(x.campaignName || '—')}</div>
            <div class="hist-sub">${esc(x.type || '—')}${x.account ? ' · ' + esc(x.account) : ''} · ${tail}</div>
          </span>
          <span class="hist-right"><div class="hist-time">${esc(time)}</div></span>
        </div>`;
    }).join('');
    body.innerHTML = `
      <div class="hist-toolbar">
        <button class="hist-filter ${this.filter === 'all' ? 'active' : ''}" data-f="all">Tất cả (${this.items.length})</button>
        <button class="hist-filter ${this.filter === 'error' ? 'active' : ''}" data-f="error">Chỉ camp lỗi (${errCount})</button>
      </div>
      <div class="hist-list">${rows || '<div class="hist-empty">Chưa có lịch sử. Sau khi “Tạo hàng loạt”, mọi camp (kể cả camp lỗi) sẽ được lưu lại đây — vẫn còn khi tải lại trang.</div>'}</div>`;
    body.querySelectorAll('.hist-filter').forEach((b) => {
      b.addEventListener('click', () => { this.filter = b.dataset.f; this.render(); });
    });
  },
};

// ============================================================
//  Khởi tạo
// ============================================================
init();

function renderLegalPage(path) {
  let title = '';
  let contentHtml = '';

  if (path === '/privacy-policy') {
    title = 'Chính sách quyền riêng tư';
    contentHtml = `
      <p>Ứng dụng Ads hỗ trợ người dùng quản lý Fanpage và tạo quảng cáo Facebook theo yêu cầu.</p>
      <p>Ứng dụng có thể sử dụng Facebook Login để truy cập các quyền cần thiết như danh sách Trang, bài viết Trang và tài khoản quảng cáo.</p>
      <p>Dữ liệu chỉ được sử dụng để vận hành chức năng mà người dùng yêu cầu.</p>
      <p>Chúng tôi không bán, chia sẻ hoặc cho thuê dữ liệu cá nhân của người dùng cho bên thứ ba.</p>
      <p>Người dùng có thể yêu cầu xóa dữ liệu bất kỳ lúc nào bằng cách liên hệ qua email: <a href="mailto:hoatranvn997@gmail.com">hoatranvn997@gmail.com</a>.</p>
    `;
  } else if (path === '/terms') {
    title = 'Điều khoản sử dụng';
    contentHtml = `
      <p>Người dùng chịu trách nhiệm với nội dung, ngân sách và chiến dịch quảng cáo được tạo thông qua ứng dụng.</p>
      <p>Ứng dụng chỉ là công cụ hỗ trợ thao tác với Meta Marketing API.</p>
      <p>Người dùng cần đảm bảo có quyền hợp lệ với Fanpage, bài viết và tài khoản quảng cáo trước khi sử dụng.</p>
      <p>Chúng tôi không chịu trách nhiệm với lỗi phát sinh từ chính sách quảng cáo của Meta, lỗi quyền truy cập hoặc dữ liệu nhập sai.</p>
      <p>Liên hệ hỗ trợ: <a href="mailto:hoatranvn997@gmail.com">hoatranvn997@gmail.com</a>.</p>
    `;
  } else if (path === '/delete-data') {
    title = 'Hướng dẫn xóa dữ liệu người dùng';
    contentHtml = `
      <p>Người dùng có thể yêu cầu xóa dữ liệu liên quan đến ứng dụng Ads bằng cách gửi email tới: <a href="mailto:hoatranvn997@gmail.com">hoatranvn997@gmail.com</a>.</p>
      <p>Email yêu cầu nên bao gồm: tên Facebook, email liên hệ và nội dung yêu cầu xóa dữ liệu.</p>
      <p>Sau khi nhận yêu cầu, chúng tôi sẽ xử lý trong thời gian sớm nhất.</p>
      <p>Ngoài ra, người dùng có thể gỡ quyền ứng dụng trong Facebook tại: Cài đặt Facebook > Ứng dụng và trang web.</p>
    `;
  }

  document.title = title + ' - Trình tạo quảng cáo Facebook';

  // Inject CSS Styles for clean responsive design
  const style = document.createElement('style');
  style.textContent = `
    body {
      background-color: #f8fafc !important;
      color: #1e293b !important;
      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      justify-content: center !important;
      align-items: flex-start !important;
      min-height: 100vh !important;
    }
    .legal-container {
      width: 100%;
      max-width: 800px;
      margin: 40px 20px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      border: 1px solid #e2e8f0;
      box-sizing: border-box;
    }
    .legal-card {
      padding: 40px;
    }
    .legal-back-link {
      display: inline-flex;
      align-items: center;
      color: #2563eb;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 24px;
      transition: color 0.15s ease;
      font-family: inherit;
    }
    .legal-back-link:hover {
      color: #1d4ed8;
    }
    .legal-title {
      font-size: 32px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 24px;
      line-height: 1.25;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 16px;
    }
    .legal-content {
      font-size: 16px;
      line-height: 1.8;
      color: #334155;
    }
    .legal-content p {
      margin-top: 0;
      margin-bottom: 18px;
    }
    .legal-content a {
      color: #2563eb;
      text-decoration: none;
      border-bottom: 1px dotted #2563eb;
      font-weight: 500;
    }
    .legal-content a:hover {
      color: #1d4ed8;
      border-bottom-style: solid;
    }
    .legal-footer {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid #f1f5f9;
      font-size: 14px;
      color: #64748b;
      text-align: center;
    }
    @media (max-width: 640px) {
      .legal-container {
        margin: 20px 10px;
      }
      .legal-card {
        padding: 24px 16px;
      }
      .legal-title {
        font-size: 24px;
      }
    }
  `;
  document.head.appendChild(style);

  // Replace document body with legal template
  document.body.className = 'legal-page';
  document.body.innerHTML = `
    <div class="legal-container">
      <div class="legal-card">
        <a href="/" class="legal-back-link">← Quay lại trang chủ</a>
        <h1 class="legal-title">${title}</h1>
        <div class="legal-content">
          ${contentHtml}
        </div>
        <div class="legal-footer">
          &copy; 2026 Ads App. Bản quyền được bảo lưu.
        </div>
      </div>
    </div>
  `;
}

async function init() {
  const path = window.location.pathname;
  if (['/privacy-policy', '/terms', '/delete-data'].includes(path)) {
    renderLegalPage(path);
    return;
  }

  // Hiển thị lỗi đăng nhập nếu có trong URL
  const params = new URLSearchParams(location.search);
  if (params.get('auth_error')) {
    const box = $('#authError');
    box.textContent = 'Đăng nhập thất bại: ' + params.get('auth_error');
    box.classList.remove('hidden');
    history.replaceState({}, '', location.pathname);
  }

  bindEvents();
  History.load();
  Logger.info('Khởi động ứng dụng.');
  if (History.items.length) Logger.info(`Đã nạp ${History.items.length} camp trong lịch sử (localStorage).`);

  const status = await api('/api/auth/status');
  if (status.loggedIn) {
    State.user = status.user;
    onLoggedIn();
  } else {
    showView('login');
    setStep(1);
  }
}

function bindEvents() {
  $('#logoutBtn').addEventListener('click', logout);

  // Sidebar trái: điều hướng + accordion nhóm + thu gọn
  $$('.sb-item').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.view)));
  $$('.mp-account-select').forEach((sel) => sel.addEventListener('change', onAccChange));
  $$('.sb-group-head').forEach((h) => h.addEventListener('click', () => {
    if ($('#sidebar').classList.contains('collapsed')) return; // thu gọn thì không gập nhóm
    h.closest('.sb-group').classList.toggle('expanded');
  }));
  $('#sbBrand')?.addEventListener('click', toggleSidebar);
  $('#accSelect')?.addEventListener('change', onAccChange);
  $('#accStatus')?.addEventListener('click', () => { if (!State.adAccounts.length) loadAdAccounts(0); });
  $('#templateBtn').addEventListener('click', downloadTemplate);
  $('#manualStartBtn')?.addEventListener('click', startManualTable);
  $('#addRowBtn')?.addEventListener('click', () => addBlankRow(true));
  $('#fileInput').addEventListener('change', (e) => handleFile(e.target.files[0]));
  $('#validateBtn').addEventListener('click', validateRows);
  $('#createBtn').addEventListener('click', confirmCreate);
  $('#searchInput').addEventListener('input', (e) => { State.search = e.target.value.trim().toLowerCase(); renderTable(); });
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerScrim').addEventListener('click', closeDrawer);

  $('#creativeMode')?.addEventListener('change', (e) => {
    State.creativeMode = e.target.value;
    clientPreCheck();
    renderTable();
  });

  // Đăng nhập bằng access token
  $('#tokenToggle')?.addEventListener('click', () => {
    const box = $('#tokenBox');
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) $('#tokenInput').focus();
  });
  $('#tokenBtn')?.addEventListener('click', loginWithToken);
  $('#tokenInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginWithToken(); });

  // Dock dưới cùng: tab, thu gọn, xoá
  setDockCollapsed($('#dock')?.classList.contains('collapsed') !== false);
  $('#dockToggle').addEventListener('click', () => toggleDock());
  $$('.dock-tab').forEach((btn) => {
    btn.addEventListener('click', () => { showDockTab(btn.dataset.tab); toggleDock(true); });
  });
  $('#dockClear').addEventListener('click', () => {
    if (activeDockTab() === 'history') History.clear();
    else { Logger.clear(); Logger.info('Đã xoá nhật ký.'); }
  });

  const dz = $('#dropzone');
  ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('drag')));
  dz.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
}

// ============================================================
//  Điều hướng view + stepper
// ============================================================
function showView(name) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $('#view-' + name).classList.remove('hidden');
}
function setStep(n) {
  $$('.step').forEach((s) => {
    const k = +s.dataset.step;
    s.classList.toggle('active', k === n);
    s.classList.toggle('done', k < n);
  });
}

async function onLoggedIn() {
  const u = State.user || {};
  $('#userName').textContent = u.name || 'Đã đăng nhập';
  const av = $('#userAvatar');
  if (av) {
    if (u.picture) { av.src = u.picture; av.classList.remove('hidden'); }
    else av.classList.add('hidden');
  }
  enterDashboard();          // vào dashboard ngay
  loadAdAccounts();          // tải tài khoản (tự thử lại nếu bị giới hạn)
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
}

// Vào bảng điều khiển ngay sau khi đăng nhập (không cần màn chọn tài khoản)
function enterDashboard() {
  $('#sidebar').classList.remove('hidden');
  populateAccSelect();
  if (localStorage.getItem('mp_sidebar_collapsed') === '1') $('#sidebar').classList.add('collapsed');
  switchTab('manage');
}

// Thu gọn / mở rộng sidebar (nhớ trạng thái)
function toggleSidebar() {
  const sb = $('#sidebar');
  const collapsed = sb.classList.toggle('collapsed');
  try { localStorage.setItem('mp_sidebar_collapsed', collapsed ? '1' : '0'); } catch { /* hết dung lượng */ }
}

// Đổ danh sách tài khoản vào dropdown trên thanh tab + đồng bộ nhãn
function populateAccSelect() {
  const sel = $('#accSelect');
  const selects = [sel, ...$$('.mp-account-select')].filter(Boolean);
  if (!selects.length) return;
  const options = State.adAccounts
    .map((a) => `<option value="${esc(a.id)}" data-dot="${a.usable ? 'ok' : 'bad'}">${esc(a.name)} · ${esc(a.currency)}</option>`)
    .join('');
  selects.forEach((accountSelect) => {
    accountSelect.innerHTML = options || '<option value="">Chưa có tài khoản quảng cáo</option>';
    if (State.selectedAccount) accountSelect.value = State.selectedAccount.id;
  });
  if (window.NiceSelect && sel) NiceSelect.refresh(sel);
  updateAccStatus();
  if (window.ThruPlay) ThruPlay.updateAccountInfo();
  if (window.CampaignBuilder) CampaignBuilder.refreshAccount();
}

// Chấm xanh/đỏ + nhãn tình trạng tài khoản đang chọn
function updateAccStatus() {
  const a = State.selectedAccount;
  const dot = $('#accDot'); const txt = $('#accStatusText');
  if (!dot || !txt) return;
  if (!a) { dot.className = 'acc-dot'; txt.textContent = '—'; return; }
  dot.className = 'acc-dot ' + (a.usable ? 'ok' : 'bad');
  txt.textContent = a.statusLabel || (a.usable ? 'Đang hoạt động' : 'Không khả dụng');
  $$('.mp-account-select').forEach((sel) => { sel.value = a.id; });
}

// Đổi tài khoản ngay từ dropdown (không cần quay lại màn chọn)
function onAccChange(e) {
  const id = e.target.value;
  const acc = State.adAccounts.find((a) => a.id === id);
  if (!acc) return;
  if (State.selectedAccount && acc.id === State.selectedAccount.id) return;
  State.selectedAccount = acc;
  populateAccSelect();
  updateAccStatus();
  if (window.ThruPlay) ThruPlay.refreshAccount();
  if (window.CampaignBuilder) CampaignBuilder.refreshAccount();
  Logger.info(`Đổi tài khoản: ${acc.name} (${acc.id} · ${acc.currency}).`);
  toast(`Đã chọn ${acc.name}`, 'ok');
  // Đổi tài khoản: xoá dữ liệu cũ, KHÔNG tự tải (tránh rate-limit). Người dùng bấm "Làm mới".
  _manageLoadedFor = null;
  if (typeof Manage !== 'undefined') {
    Manage.campaigns = []; Manage.adsets = []; Manage.ads = [];
    if (!$('#view-manage').classList.contains('hidden')) {
      const body = $('#treeBody');
      if (body) body.innerHTML = '<tr><td colspan="12" class="loading">Đã đổi tài khoản — bấm “Làm mới” để tải chiến dịch.</td></tr>';
      const sum = $('#manageSummary'); if (sum) sum.innerHTML = '';
    }
  }
}

// Chuyển tab Quản lý <-> Tạo hàng loạt
let _manageLoadedFor = null;
function switchTab(view) {
  $$('.sb-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  showView(view);
  // KHÔNG tự tải tab Quản lý: tài khoản lớn dễ bị Meta rate-limit.
  // Người dùng bấm "Làm mới" để tải khi cần.
  if (view === 'posts' && typeof Posts !== 'undefined') Posts.activate();
  if (view === 'thruplay' && window.ThruPlay) {
    ThruPlay.updateAccountInfo();
    ThruPlay.loadPages();
  }
  if (view === 'builder' && window.CampaignBuilder) {
    CampaignBuilder.activate();
  }
}

// Đăng nhập trực tiếp bằng access token (không qua OAuth)
async function loginWithToken() {
  const token = $('#tokenInput').value.trim();
  if (!token) return toast('Vui lòng nhập access token', 'err');
  const btn = $('#tokenBtn');
  btn.disabled = true; btn.textContent = 'Đang kiểm tra…';
  Logger.info('Đăng nhập bằng access token…');
  try {
    const { user } = await api('/api/auth/token', { method: 'POST', body: { token } });
    State.user = user;
    $('#tokenInput').value = '';
    Logger.ok(`Đăng nhập thành công: ${user?.name || 'token'}.`);
    onLoggedIn();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Dùng token';
  }
}

// ============================================================
//  Bước 2: tài khoản quảng cáo
// ============================================================
// Backoff THƯA (rate-limit của Meta hồi theo thời gian — gọi dồn sẽ kéo dài giới hạn)
const ACCT_RETRY_WAITS = [60000, 120000];
async function loadAdAccounts(retry = 0) {
  try {
    State.adAccounts = (await api('/api/accounts/adaccounts')) || [];
    if (State.adAccounts.length) {
      if (!State.selectedAccount || !State.adAccounts.some((a) => a.id === State.selectedAccount.id)) {
        const usable = State.adAccounts.filter((a) => a.usable);
        State.selectedAccount = usable[0] || State.adAccounts[0];
      }
      populateAccSelect();
      Logger.ok(`Đã tải ${State.adAccounts.length} tài khoản quảng cáo.`);
    } else {
      setAccLoadingMsg('Không có tài khoản');
      Logger.warn('Không tìm thấy tài khoản quảng cáo (kiểm tra quyền ads_management).');
    }
  } catch (err) {
    State.adAccounts = [];
    const limited = /too many calls|rate limit|#17|#80004|#4\b/i.test(err.message);
    if (limited && retry < ACCT_RETRY_WAITS.length) {
      const wait = ACCT_RETRY_WAITS[retry];
      setAccLoadingMsg(`Bị giới hạn — tự thử lại sau ${Math.round(wait / 1000)}s…`);
      Logger.warn(`Tài khoản bị Meta giới hạn tần suất — tự thử lại sau ${Math.round(wait / 1000)}s (lần ${retry + 1}/${ACCT_RETRY_WAITS.length}).`);
      setTimeout(() => loadAdAccounts(retry + 1), wait);
    } else {
      setAccLoadingMsg(limited ? 'Bị giới hạn — bấm để thử lại' : 'Lỗi tải — bấm để thử lại');
      Logger.err('Không tải được tài khoản quảng cáo: ' + err.message);
    }
  }
}

// Hiển thị trạng thái khi đang/không tải được tài khoản
function setAccLoadingMsg(msg) {
  const dot = $('#accDot'); const txt = $('#accStatusText');
  if (dot) dot.className = 'acc-dot';
  if (txt) txt.textContent = msg;
  if (!State.adAccounts.length) {
    $$('.mp-account-select').forEach((sel) => {
      sel.innerHTML = `<option value="">${esc(msg || 'Đang tải tài khoản...')}</option>`;
    });
  }
}

function selectAccount(acc, card) {
  State.selectedAccount = acc;
  $$('.account-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  $('#toUploadBtn').disabled = false;
  Logger.info(`Chọn tài khoản: ${acc.name} (${acc.id} · ${acc.currency}).`);
}

// ============================================================
//  Bước 3: đọc file Excel/CSV
// ============================================================
const HEADER_KEYS = [
  ['adAccountId', ['tai khoan quang cao', 'tai khoan', 'ad account', 'ad_account', 'account_id', 'account']],
  ['pageLink', ['ten page', 'ten fanpage', 'page name', 'page id', 'id page', 'link page', 'link trang', 'trang fanpage', 'fanpage', 'page']],
  ['postLink', ['link bai viet', 'id bai viet', 'post id', 'object story id', 'bai viet', 'reel', 'anh', 'post', 'link bai', 'bai/reel']],
  ['contentMode', ['che do noi dung', 'che do', 'noidung', 'content mode']],
  ['ctaHandling', ['xu ly cta', 'xu ly', 'cta handling', 'handle cta']],
  ['ctaLink', ['link cta', 'link cta tuy chon', 'website', 'link dich', 'link den', 'cta link']],
  ['sourceUrl', ['url nguon', 'source url', 'source_url', 'url source', 'destination url', 'url']],
  ['cta', ['nut cta', 'nut cta tuy chon', 'nut keu goi', 'keu goi', 'call to action', 'cta button', 'nut hanh dong']],
  ['campaignType', ['loai chien dich', 'loai', 'muc tieu', 'objective', 'type']],
  ['campaignName', ['ten chien dich', 'chien dich', 'campaign']],
  ['adsetName', ['ten nhom quang cao', 'nhom quang cao', 'ad set', 'adset', 'nhom']],
  ['adName', ['ten quang cao', 'quang cao', 'ad name']],
  ['country', ['quoc gia', 'nuoc', 'country', 'location']],
  ['budgetMode', ['loai ngan sach', 'kieu ngan sach', 'ngan sach loai', 'hang ngay tron doi']],
  ['budgetLevel', ['cap ngan sach', 'ngan sach cap', 'cbo']],
  ['budget', ['ngan sach', 'budget', 'chi phi']],
  ['startDate', ['ngay bat dau', 'bat dau', 'start date', 'start']],
  ['startTimeRaw', ['gio bat dau', 'start time', 'time start']],
  ['endDate', ['ngay ket thuc', 'ket thuc', 'end date', 'end']],
  ['endTimeRaw', ['gio ket thuc', 'end time', 'time end']],
  ['statusRaw', ['trang thai', 'status']],
  ['notes', ['ghi chu', 'notes', 'note']],
];

function removeAccents(s) {
  return (s ?? '').toString().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

function matchHeader(header) {
  const h = removeAccents(header).trim();
  if (!h) return null;
  
  // 1. Khớp chính xác hoàn toàn (Exact match) trước
  for (const [key, tokens] of HEADER_KEYS) {
    if (tokens.some((t) => t === h)) return key;
  }
  
  // 2. Khớp một phần (Substring match) sau
  for (const [key, tokens] of HEADER_KEYS) {
    if (tokens.some((t) => h.includes(t))) return key;
  }
  return null;
}

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
      if (aoa.length < 2) return toast('File không có dữ liệu', 'err');

      const headers = aoa[0].map(matchHeader);
      const unknownCols = headers.filter((x) => x === null).length;

      State.rows = aoa.slice(1).map((arr, i) => {
        const row = { index: i, status: 'pending', errors: [], warnings: [], parsed: {}, normalized: {} };
        headers.forEach((key, c) => { if (key) row[key] = (arr[c] ?? '').toString().trim(); });
        return row;
      }).filter((r) => Object.keys(r).some((k) => !['index', 'status', 'errors', 'warnings', 'parsed', 'normalized'].includes(k) && r[k]));

      clientPreCheck();

      $('#fileMeta').classList.remove('hidden');
      $('#fileMeta').innerHTML =
        `<strong>${esc(file.name)}</strong> · ${State.rows.length} dòng` +
        (unknownCols ? ` · <span class="muted">${unknownCols} cột không nhận dạng (đã bỏ qua)</span>` : '');

      $('#tableZone').classList.remove('hidden');
      buildFilters();
      renderTable();
      setStep(3);
      Logger.ok(`Đọc file "${file.name}": ${State.rows.length} dòng${unknownCols ? `, ${unknownCols} cột bị bỏ qua` : ''}.`);
      const missing = State.rows.filter((r) => r.status === 'missing').length;
      if (missing) Logger.warn(`${missing} dòng thiếu dữ liệu bắt buộc (kiểm tra sơ bộ phía trình duyệt).`);
      toast(`Đã đọc ${State.rows.length} dòng`, 'ok');
    } catch (err) {
      Logger.err(`Không đọc được file: ${err.message}`);
      toast('Không đọc được file: ' + err.message, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ============================================================
//  Nhập tay trong bảng (thêm/nhân đôi/xoá dòng — không cần file)
// ============================================================
const ROW_FIELDS = [
  'adAccountId', 'pageLink', 'postLink', 'contentMode', 'ctaHandling', 'ctaLink', 'sourceUrl', 'cta',
  'campaignType', 'campaignName', 'adsetName', 'adName', 'country',
  'budgetMode', 'budgetLevel', 'budget', 'startDate', 'startTimeRaw',
  'endDate', 'endTimeRaw', 'statusRaw', 'notes',
];

function nextRowIndex() {
  return State.rows.length ? Math.max(...State.rows.map((r) => r.index)) + 1 : 0;
}

function blankRow() {
  return {
    index: nextRowIndex(),
    status: 'missing', errors: [], warnings: [], parsed: {}, normalized: {},
    pageLink: '', postLink: '', ctaLink: '', sourceUrl: '', cta: '',
    contentMode: 'Sử dụng bài viết có sẵn', ctaHandling: 'Giữ CTA hiện tại',
    campaignType: 'Traffic', campaignName: '', adsetName: '', adName: '',
    country: 'Việt Nam', budget: '', budgetMode: 'daily', budgetLevel: 'adset',
    startDate: '', startTimeRaw: '', endDate: '', endTimeRaw: '',
    statusRaw: 'Tạm dừng', notes: '',
  };
}

function ensureTableReady() {
  $('#tableZone').classList.remove('hidden');
  buildFilters();
}

function updateRowMeta() {
  const meta = $('#fileMeta');
  meta.classList.remove('hidden');
  meta.innerHTML = `<strong>${State.rows.length} dòng</strong> trong bảng · nhập tay hoặc tải file đều được. Sửa trực tiếp từng ô rồi bấm <strong>Kiểm tra với Facebook</strong>.`;
}

function addBlankRow(editImmediately) {
  const row = blankRow();
  State.rows.push(row);
  ensureTableReady();
  if (editImmediately) State.editing.add(row.index);
  renderTable();
  updateRowMeta();
  // Cuộn tới dòng mới + focus ô đầu tiên để gõ liền
  const sc = $('.table-scroll');
  if (sc) sc.scrollTop = sc.scrollHeight;
  const firstInput = $(`#tableBody tr:last-child .post-link-input`);
  if (firstInput) firstInput.focus();
  Logger.info(`Thêm 1 dòng trống (#${row.index + 1}).`);
}

function duplicateRow(index) {
  const src = State.rows.find((r) => r.index === index);
  if (!src) return;
  const copy = blankRow();
  ROW_FIELDS.forEach((f) => { copy[f] = src[f] ?? copy[f]; });
  copy.campaignName = src.campaignName ? src.campaignName + ' (sao chép)' : '';
  // chèn ngay sau dòng gốc, mở luôn chế độ nhập để chỉnh
  const pos = State.rows.findIndex((r) => r.index === index);
  State.rows.splice(pos + 1, 0, copy);
  State.editing.add(copy.index);
  clientPreCheck([copy]);
  buildFilters();
  renderTable();
  updateRowMeta();
  toast('Đã nhân đôi dòng', 'ok');
}

function deleteRow(index) {
  const r = State.rows.find((x) => x.index === index);
  if (!r) return;
  // Dòng đã có dữ liệu thì hỏi xác nhận; dòng trống thì xoá luôn
  const hasData = [r.pageLink, r.campaignName, r.adName, r.adsetName, r.postLink, r.budget].some((v) => v && v.toString().trim());
  if (hasData && !confirm(`Xoá dòng "${r.campaignName || 'chưa đặt tên'}"?`)) return;
  State.rows = State.rows.filter((x) => x.index !== index);
  State.editing.delete(index);
  buildFilters();
  renderTable();
  updateRowMeta();
  toast('Đã xoá dòng', 'ok');
}

// Chốt toàn bộ dòng đang nhập: thoát chế độ nhập + tính lại trạng thái sơ bộ
function finalizeEditing() {
  if (!State.editing.size) return;
  const edited = [...State.editing].map((i) => State.rows.find((r) => r.index === i)).filter(Boolean);
  State.editing.clear();
  clientPreCheck(edited);
  buildFilters();
  renderTable();
}

function startManualTable() {
  if (!State.rows.length) {
    addBlankRow(true);
  } else {
    ensureTableReady();
    renderTable();
    $('#tableZone').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Kiểm tra nhanh phía client (chưa gọi Facebook)
// ----- Tách Page ID / Post ID ngay phía trình duyệt (xem trước, không cần đăng nhập) -----
const FB_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com',
  'web.facebook.com', 'fb.com', 'www.fb.com', 'business.facebook.com', 'fb.watch']);

function tryUrl(raw) {
  let s = (raw ?? '').toString().trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s); } catch { return null; }
}
function isFbHost(url) {
  return !!url && FB_HOSTS.has(url.hostname.toLowerCase());
}

// { id, slug, vanity, error }
function clientParsePageId(input) {
  const raw = (input ?? '').toString().trim();
  if (!raw) return { id: null };
  if (/^\d+$/.test(raw)) return { id: raw };

  if (!raw.includes('/') && !raw.includes('\\') && !/^https?:/i.test(raw) && !raw.toLowerCase().includes('facebook') && !raw.toLowerCase().includes('fb.com')) {
    return { id: null, slug: raw, vanity: true };
  }

  const url = tryUrl(raw);
  if (!url || !isFbHost(url)) return { id: null, error: 'Tên/Link Page không phải domain Facebook hợp lệ' };
  const pid = url.searchParams.get('id');
  if (pid && /^\d+$/.test(pid)) return { id: pid };
  const segs = url.pathname.split('/').filter(Boolean);
  
  if (segs[0] === 'pages' && segs.length >= 3 && /^\d+$/.test(segs[segs.length - 1])) return { id: segs[segs.length - 1] };
  if (segs[0] === 'people' && segs.length >= 3 && /^\d+$/.test(segs[segs.length - 1])) return { id: segs[segs.length - 1] };
  
  const last = segs[segs.length - 1] || '';
  const dash = last.match(/-(\d{6,})$/);
  if (dash) return { id: dash[1] };
  if (segs.length === 1 && /^\d+$/.test(segs[0])) return { id: segs[0] };
  if (segs[0] === 'profile.php') return { id: null, error: 'Link profile thiếu id' };
  
  const ignoredPaths = new Set(['groups', 'events', 'marketplace', 'gaming', 'watch', 'live', 'photos', 'videos', 'reels', 'reel', 'stories', 'ads']);
  if (ignoredPaths.has(segs[0]?.toLowerCase())) {
    return { id: null, error: `Tên/Link Page không hợp lệ (đường dẫn ${segs[0]} là của hệ thống)` };
  }
  
  if (segs[0]) return { id: null, slug: segs[0], vanity: true };
  return { id: null };
}

// { postId, pageIdFromLink, opaque, error }
function clientParsePostId(input) {
  const raw = (input ?? '').toString().trim();
  if (!raw) return { postId: null };
  const comp = raw.match(/^(\d+)_(\d+)$/);
  if (comp) return { postId: comp[2], pageIdFromLink: comp[1] };
  if (/^\d+$/.test(raw)) return { postId: raw };
  const url = tryUrl(raw);
  if (!url || !isFbHost(url)) return { postId: null, error: 'Link bài viết không phải domain Facebook hợp lệ' };
  const segs = url.pathname.split('/').filter(Boolean);
  const qp = url.searchParams;
  const numOr = (cand, pid) => {
    if (/^\d+$/.test(cand)) return { postId: cand, pageIdFromLink: pid && /^\d+$/.test(pid) ? pid : null };
    if (/^pfbid/i.test(cand)) return { postId: null, opaque: true, error: 'Link pfbid… không chứa ID số. Dùng ID dạng số hoặc {pageId}_{postId}.' };
    return { postId: null, error: 'ID bài viết không hợp lệ' };
  };
  const story = qp.get('story_fbid'); if (story) return numOr(story, qp.get('id'));
  const fbid = qp.get('fbid'); if (fbid) return numOr(fbid, qp.get('id'));
  const v = qp.get('v'); if (v) return numOr(v, null);
  for (const k of ['reel', 'reels']) { const i = segs.indexOf(k); if (i !== -1 && segs[i + 1]) return numOr(segs[i + 1], null); }
  const pi = segs.indexOf('posts'); if (pi !== -1 && segs[pi + 1]) return numOr(segs[pi + 1], null);
  const vi = segs.indexOf('videos'); if (vi !== -1 && segs[segs.length - 1]) return numOr(segs[segs.length - 1], null);
  const lastNum = [...segs].reverse().find((s) => /^\d{5,}$/.test(s));
  if (lastNum) return numOr(lastNum, null);
  if (segs.some((s) => /^pfbid/i.test(s))) return { postId: null, opaque: true, error: 'Link pfbid… không chứa ID số. Dùng ID dạng số hoặc {pageId}_{postId}.' };
  return { postId: null, error: 'Không nhận dạng được bài viết/reel/ảnh từ link' };
}

function clientParseRow(r) {
  const parsed = { pageId: null, pageName: null, postId: null, objectStoryId: null, pageVanity: null };
  
  r.contentMode = 'Sử dụng bài viết có sẵn';
  r.ctaHandling = 'Giữ CTA hiện tại';
  if (!r.sourceUrl && r.ctaLink) r.sourceUrl = r.ctaLink;

  const pg = clientParsePageId(r.pageLink);
  parsed.pageId = pg.id || null;
  if (pg.vanity) {
    parsed.pageVanity = pg.slug;
    parsed.pageName = pg.slug;
  }
  if (pg.error) r.warnings.push(pg.error);

  if (r.postLink && r.postLink.toString().trim()) {
    const ps = clientParsePostId(r.postLink);
    parsed.postId = ps.postId || null;
    const owner = ps.pageIdFromLink || parsed.pageId;
    if (owner && ps.postId) parsed.objectStoryId = owner + '_' + ps.postId;
    if (ps.error) r.warnings.push(ps.error);
  }
  // Cảnh báo ID dạng số dài dễ bị Excel làm tròn sai (Facebook ID thường 16+ chữ số)
  if (/^\d{16,}$/.test((r.pageLink || '').toString().trim())) {
    r.warnings.push('Page ID nhập dạng số dài (≥16 chữ số) có thể bị Excel làm tròn sai (đuôi thành 0). Nên nhập dạng link facebook.com/<id>, hoặc định dạng ô thành Text trước khi nhập.');
  }
  r.parsed = parsed;
}

function getStatusIconHtml(r) {
  const isErr = r.status === 'error' || r.status === 'missing' || r.status === 'permission' || r.status === 'post_error' || r.status === 'create_error' || r.status === 'need_verify' || (r.errors && r.errors.length > 0);
  if (isErr) {
    const title = esc((r.errors || []).join('\n') || STATUS_LABEL[r.status] || 'Lỗi');
    return `<div class="status-icon status-error" title="${title}">!</div>`;
  }
  if (r.status === 'created') {
    return `<div class="status-icon status-success" title="Thành công">✓</div>`;
  }
  if (['verifying', 'checking_cta', 'updating_cta', 'creating_ad'].includes(r.status)) {
    const title = esc(STATUS_LABEL[r.status] || 'Đang xử lý');
    return `<div class="status-icon status-active" title="${title}" style="border: 1.5px solid #eab308; color: #eab308; background-color: #fef9c3; animation: pulse 1.5s infinite; text-align: center; vertical-align: middle;">...</div>`;
  }
  if (['verified', 'has_cta', 'updated_cta', 'valid'].includes(r.status)) {
    const title = esc(STATUS_LABEL[r.status] || 'Hợp lệ');
    return `<div class="status-icon status-success" title="${title}">✓</div>`;
  }
  const title = esc(STATUS_LABEL[r.status] || 'Chưa kiểm tra');
  return `<div class="status-icon status-pending" title="${title}">?</div>`;
}

function clientPreCheck(rows) {
  const otherRequired = [
    ['campaignName', 'tên chiến dịch'],
    ['adsetName', 'tên nhóm quảng cáo'],
    ['adName', 'tên quảng cáo'],
    ['campaignType', 'loại chiến dịch'],
    ['country', 'quốc gia'],
    ['budget', 'ngân sách'],
    ['budgetMode', 'loại ngân sách'],
    ['budgetLevel', 'cấp ngân sách'],
    ['startDate', 'ngày bắt đầu']
  ];
  (rows || State.rows).forEach((r) => {
    r.errors = [];
    r.warnings = [];
    
    r.contentMode = 'Sử dụng bài viết có sẵn';
    r.ctaHandling = 'Giữ CTA hiện tại';
    if (!r.sourceUrl && r.ctaLink) r.sourceUrl = r.ctaLink;
    if (!r.campaignType) r.campaignType = 'Traffic';
    if (!r.country) r.country = 'Việt Nam';
    if (!r.budgetMode) r.budgetMode = 'daily';
    if (!r.budgetLevel) r.budgetLevel = 'adset';
    if (!r.statusRaw) r.statusRaw = 'Tạm dừng';

    clientParseRow(r); // tách Page ID / Post ID ngay để xem trước
    
    const missing = [];
    if (!r.postLink || r.postLink.toString().trim() === '') {
      missing.push('link bài viết');
    }
    
    otherRequired.forEach(([k, l]) => {
      if (!r[k]) missing.push(l);
    });

    if (missing.length) {
      r.status = 'missing';
      r.errors = missing.map((m) => 'Thiếu ' + m);
    } else {
      r.status = 'pending';
    }

    if (r.parsed.pageVanity && !r.parsed.pageId) {
      r.warnings.push(`Page "${r.parsed.pageVanity}" sẽ được đối chiếu với các Page bạn quản lý khi kiểm tra Facebook.`);
    }
  });
}

// ============================================================
//  Bộ lọc trạng thái
// ============================================================
function buildFilters() {
  const order = ['all', 'valid', 'missing', 'permission', 'post_error', 'created'];
  const labels = { all: 'Tất cả', valid: 'Hợp lệ', missing: 'Thiếu dữ liệu', permission: 'Lỗi quyền', post_error: 'Lỗi post', created: 'Đã tạo' };
  const wrap = $('#statusFilters');
  wrap.innerHTML = '';
  order.forEach((k) => {
    const btn = document.createElement('button');
    btn.className = 'fchip' + (State.filter === k ? ' active' : '');
    btn.dataset.k = k;
    btn.innerHTML = `${labels[k]} <span class="cnt" data-cnt="${k}">0</span>`;
    btn.addEventListener('click', () => { State.filter = k; buildFilters(); renderTable(); });
    wrap.appendChild(btn);
  });
  updateCounts();
}

function updateCounts() {
  const counts = { all: State.rows.length };
  State.rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  $$('[data-cnt]').forEach((el) => { el.textContent = counts[el.dataset.cnt] || 0; });
}

// ============================================================
//  Bảng dữ liệu
// ============================================================
function pageDisplay(r) {
  const label = r.parsed?.pageName || r.pageName || r.pageLink || (r.postLink ? 'Tự nhận diện' : '—');
  const title = [
    r.parsed?.pageName ? `Tên: ${r.parsed.pageName}` : '',
    r.parsed?.pageId ? `ID: ${r.parsed.pageId}` : '',
    r.pageLink ? `Gợi ý: ${r.pageLink}` : '',
  ].filter(Boolean).join('\n') || label;
  return { label, title };
}

function oneLineCell(value, fallback = '—') {
  const text = value == null || String(value).trim() === '' ? fallback : String(value);
  return `<span class="cell-one-line" title="${esc(text)}">${esc(text)}</span>`;
}

function tableBudgetLevelLabel(value) {
  return value === 'campaign' ? 'CBO' : 'ABO';
}

function tableBudgetModeLabel(value) {
  return value === 'lifetime' ? 'Trọn đời' : 'Hàng ngày';
}

function renderTable() {
  const body = $('#tableBody');
  body.innerHTML = '';
  const rows = State.rows.filter((r) => {
    if (State.filter !== 'all' && r.status !== State.filter) return false;
    if (State.search) {
      const hay = `${r.campaignName} ${r.adsetName} ${r.adName}`.toLowerCase();
      if (!hay.includes(State.search)) return false;
    }
    return true;
  });

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="22" class="loading">Không có dòng nào khớp bộ lọc.</td></tr>';
  }

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    const hasErr = r.errors?.length;
    const page = pageDisplay(r);
    
    if (State.editing.has(r.index)) {
      tr.innerHTML = `
        <td class="status-cell">${getStatusIconHtml(r)}</td>
        <td><input type="text" class="input-inline page-link-input" value="${esc(r.pageLink || '')}" placeholder="Tên Page"></td>
        <td><input type="text" class="input-inline post-link-input" value="${esc(r.postLink || '')}" placeholder="Link bài viết"></td>
        <td>
          <select class="select-inline content-mode-input">
            <option value="Sử dụng bài viết có sẵn" selected>Bài viết có sẵn</option>
          </select>
        </td>
        <td><input type="text" class="input-inline campaign-name-input" value="${esc(r.campaignName || '')}"></td>
        <td>
          <select class="select-inline campaign-type-input">
            <option value="Traffic" selected>Traffic</option>
          </select>
        </td>
        <td><input type="text" class="input-inline adset-name-input" value="${esc(r.adsetName || '')}"></td>
        <td><input type="text" class="input-inline ad-name-input" value="${esc(r.adName || '')}"></td>
        <td><input type="text" class="input-inline country-input" value="${esc(r.country || '')}"></td>
        <td><input type="text" class="input-inline budget-val-input" value="${esc(r.budget || '')}"></td>
        <td>
          <select class="select-inline budget-level-input" title="ABO = ngân sách ở Nhóm · CBO = ngân sách ở Chiến dịch">
            <option value="adset" ${r.budgetLevel === 'adset' ? 'selected' : ''}>ABO</option>
            <option value="campaign" ${r.budgetLevel === 'campaign' ? 'selected' : ''}>CBO</option>
          </select>
        </td>
        <td>
          <select class="select-inline budget-mode-input">
            <option value="daily" ${r.budgetMode === 'daily' ? 'selected' : ''}>Hàng ngày</option>
            <option value="lifetime" ${r.budgetMode === 'lifetime' ? 'selected' : ''}>Trọn đời</option>
          </select>
        </td>
        <td><input type="text" class="input-inline start-date-input" value="${esc(r.startDate || '')}" placeholder="dd/mm/yyyy"></td>
        <td><input type="text" class="input-inline start-time-input" value="${esc(r.startTimeRaw || '')}" placeholder="hh:mm"></td>
        <td><input type="text" class="input-inline end-date-input" value="${esc(r.endDate || '')}" placeholder="dd/mm/yyyy"></td>
        <td><input type="text" class="input-inline end-time-input" value="${esc(r.endTimeRaw || '')}" placeholder="hh:mm"></td>
        <td>
          <select class="select-inline status-input">
            <option value="Bật" ${r.statusRaw === 'Bật' || r.statusRaw === 'ACTIVE' || r.statusRaw === 'active' || r.statusRaw === '1' ? 'selected' : ''}>Bật</option>
            <option value="Tạm dừng" ${r.statusRaw === 'Tạm dừng' || r.statusRaw === 'PAUSED' || r.statusRaw === 'paused' || r.statusRaw === '0' || !r.statusRaw ? 'selected' : ''}>Tạm dừng</option>
          </select>
        </td>
        <td>
          <select class="select-inline cta-input">
            <option value="" ${!r.cta ? 'selected' : ''}>Không CTA</option>
            <option value="SHOP_NOW" ${r.cta === 'SHOP_NOW' ? 'selected' : ''}>SHOP_NOW</option>
            <option value="LEARN_MORE" ${r.cta === 'LEARN_MORE' ? 'selected' : ''}>LEARN_MORE</option>
          </select>
        </td>
        <td><input type="text" class="input-inline cta-link-input" value="${esc(r.ctaLink || '')}" placeholder="Link CTA"></td>
        <td><input type="text" class="input-inline source-url-input" value="${esc(r.sourceUrl || r.ctaLink || '')}" placeholder="URL nguồn"></td>
        <td><input type="text" class="input-inline notes-input" value="${esc(r.notes || '')}"></td>
        <td>
          <div class="action-btn-group">
            <button class="done-row-btn" title="Xong dòng này">✓ Xong</button>
            <button class="del-row-btn" data-i="${r.index}" title="Xoá dòng">🗑</button>
          </div>
        </td>`;

      // Live-bind: gõ tới đâu lưu vào dòng tới đó → thêm dòng mới không mất dữ liệu
      for (const [sel, field] of Object.entries(EDIT_FIELD_MAP)) {
        const el = tr.querySelector(sel);
        if (!el) continue;
        const ev = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(ev, () => {
          r[field] = el.value;
          r.parsed = r.parsed || {};
          r.parsed.verifiedWithGraph = false; // sửa thì cần kiểm tra lại
        });
      }
      // Enter ở ô bất kỳ = thêm dòng mới ngay bên dưới (nhập liên tục)
      tr.querySelectorAll('input').forEach((el) => {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); addBlankRow(true); }
        });
      });

      tr.querySelector('.done-row-btn').addEventListener('click', () => {
        State.editing.delete(r.index);
        clientPreCheck([r]);
        buildFilters();
        renderTable();
      });
      tr.querySelector('.del-row-btn').addEventListener('click', () => deleteRow(r.index));

    } else {
      tr.innerHTML = `
        <td class="status-cell">${getStatusIconHtml(r)}</td>
        <td>${oneLineCell(page.label)}</td>
        <td>${oneLineCell(r.postLink)}</td>
        <td>${oneLineCell(r.contentMode || 'Bài viết có sẵn')}</td>
        <td>${oneLineCell(r.campaignName)}</td>
        <td>${oneLineCell(r.campaignType || 'Traffic')}</td>
        <td>${oneLineCell(r.adsetName)}</td>
        <td>${oneLineCell(r.adName)}</td>
        <td>${oneLineCell(r.country || 'VN')}</td>
        <td>${oneLineCell(r.budget)}</td>
        <td>${oneLineCell(tableBudgetLevelLabel(r.budgetLevel))}</td>
        <td>${oneLineCell(tableBudgetModeLabel(r.budgetMode))}</td>
        <td>${oneLineCell(r.startDate)}</td>
        <td>${oneLineCell(r.startTimeRaw)}</td>
        <td>${oneLineCell(r.endDate)}</td>
        <td>${oneLineCell(r.endTimeRaw)}</td>
        <td><span class="chip-sm ${r.statusRaw === 'Bật' || r.statusRaw === 'ACTIVE' || r.statusRaw === 'active' || r.statusRaw === '1' ? 'ok' : 'bad'}">${esc(r.statusRaw || 'Tạm dừng')}</span></td>
        <td>${ctaPillHtml(r)}</td>
        <td>${r.ctaLink ? `<a class="cell-one-line" href="${esc(r.ctaLink)}" target="_blank" title="${esc(r.ctaLink)}">${esc(r.ctaLink)}</a>` : oneLineCell('', '—')}</td>
        <td>${(r.sourceUrl || r.ctaLink) ? `<a class="cell-one-line" href="${esc(r.sourceUrl || r.ctaLink)}" target="_blank" title="${esc(r.sourceUrl || r.ctaLink)}">${esc(r.sourceUrl || r.ctaLink)}</a>` : oneLineCell('', '—')}</td>
        <td>${oneLineCell(r.notes)}</td>
        <td>
          <div class="action-btn-group">
            <button class="edit-btn" data-i="${r.index}">Sửa</button>
            <button class="detail-btn ${hasErr ? 'has-err' : ''}" data-i="${r.index}">Chi tiết</button>
            <button class="dup-row-btn" data-i="${r.index}" title="Nhân đôi dòng">⧉</button>
            <button class="del-row-btn" data-i="${r.index}" title="Xoá dòng">🗑</button>
          </div>
        </td>`;

      tr.querySelector('.edit-btn').addEventListener('click', () => {
        State.editing.add(r.index);
        renderTable();
      });

      tr.querySelector('.detail-btn').addEventListener('click', () => openDrawer(r.index));
      tr.querySelector('.dup-row-btn').addEventListener('click', () => duplicateRow(r.index));
      tr.querySelector('.del-row-btn').addEventListener('click', () => deleteRow(r.index));
    }
    body.appendChild(tr);
  });

  updateCounts();
  updateReady();
}

function updateReady() {
  const ready = State.rows.filter((r) => ['verified', 'has_cta', 'updated_cta', 'valid'].includes(r.status)).length;
  $('#readyCount').textContent = `${ready} dòng sẵn sàng`;
  $('#createBtn').disabled = ready === 0;
}

// ============================================================
//  Ngăn chi tiết
// ============================================================
function openDrawer(index) {
  const r = State.rows.find((x) => x.index === index);
  if (!r) return;
  $('#drawerTitle').textContent = `Dòng ${index + 1} · ${STATUS_LABEL[r.status]}`;
  const ids = r.ids || {};
  const hasPost = !!(r?.postLink && r?.postLink.toString().trim());
  const body = $('#drawerBody');

  let ctaHtml = '';
  if (r.ctaLink) {
    ctaHtml = `<dt>Nút CTA & Liên kết</dt><dd>${ctaPillHtml(r, true)} → <a href="${esc(r.ctaLink)}" target="_blank">${esc(r.ctaLink)}</a></dd>`;
  } else {
    ctaHtml = `<dt>Nút CTA</dt><dd>${ctaPillHtml(r, true)}</dd>`;
  }

  let noteHtml = '';
  const mode = r.contentMode || 'Sử dụng bài viết có sẵn';
  const isExisting = mode === 'Sử dụng bài viết có sẵn' || r.parsed?.contentMode === 'EXISTING_POST_STRICT';
  const ctaHand = r.ctaHandling || 'Tự động';

  if (hasPost) {
    if (isExisting) {
      if (ctaHand === 'Tự động') {
        if (r.parsed?.hasOldCta) {
          if (r.ctaLink) {
            noteHtml = `
              <dt>Ghi chú tạo QC</dt>
              <dd style="color: #ea580c; font-weight: 600;">
                Bài viết gốc đã có sẵn nút CTA. Hệ thống sẽ thử gán link theo sheet; nếu Meta không nhận CTA/link thì vẫn tạo quảng cáo bằng bài viết có sẵn và ghi cảnh báo.
              </dd>
            `;
          } else {
            noteHtml = `
              <dt>Ghi chú tạo QC</dt>
              <dd style="color: #2563eb; font-weight: 600;">
                Bài viết đã có sẵn nút và link CTA. Giữ nguyên bài gốc không chỉnh sửa.
              </dd>
            `;
          }
        } else {
          noteHtml = `
            <dt>Ghi chú tạo QC</dt>
            <dd style="color: #ea580c; font-weight: 600;">
              Bài gốc chưa có CTA. Hệ thống sẽ thử cập nhật CTA qua Ad Creative, nếu thất bại sẽ báo lỗi (không tạo dark post).
            </dd>
          `;
        }
      } else {
        noteHtml = `
          <dt>Ghi chú tạo QC</dt>
          <dd style="color: #2563eb; font-weight: 600;">
            Đã chọn giữ CTA hiện tại hoặc không dùng CTA. Giữ nguyên bài gốc.
          </dd>
        `;
      }
    } else {
      noteHtml = `
        <dt>Ghi chú tạo QC</dt>
        <dd style="color: #16a34a; font-weight: 600;">
          Dùng bài gốc để tạo dark post quảng cáo, không đăng bài mới công khai.
        </dd>
      `;
    }
  }

  body.innerHTML = `
    <div class="section-label">Dữ liệu</div>
    <dl class="dl">
      ${hasPost ? `<dt>Chế độ</dt><dd>${esc(mode)} · Xử lý CTA: ${esc(ctaHand)}</dd>` : ''}
      <dt>Chiến dịch</dt><dd>${esc(r.campaignName || '—')}</dd>
      <dt>Nhóm QC</dt><dd>${esc(r.adsetName || '—')}</dd>
      <dt>Quảng cáo</dt><dd>${esc(r.adName || '—')}</dd>
      <dt>Loại</dt><dd>${esc(r.campaignType || '—')}</dd>
      ${ctaHtml}
      <dt>URL nguồn</dt><dd>${(r.sourceUrl || r.ctaLink) ? `<a href="${esc(r.sourceUrl || r.ctaLink)}" target="_blank">${esc(r.sourceUrl || r.ctaLink)}</a>` : '—'}</dd>
      <dt>Quốc gia</dt><dd>${esc(r.country || '—')}</dd>
      <dt>Ngân sách</dt><dd>${esc(r.budget || '—')} · ${budgetModeLabel(r)} · ${budgetLevelLabel(r)}</dd>
      <dt>Thời gian</dt><dd>${esc(r.startDate || '—')} ${r.startTimeRaw ? esc(r.startTimeRaw) : '00:00'} ${r.endDate ? `→ ${esc(r.endDate)} ${r.endTimeRaw ? esc(r.endTimeRaw) : '23:59'}` : ''}</dd>
      ${hasPost ? `
        <dt>Page</dt><dd>${esc(r.parsed?.pageName || r.pageLink || '—')}</dd>
        <dt>Page ID</dt><dd class="mono">${esc(r.parsed?.pageId || '—')}</dd>
        <dt>Post ID thật</dt><dd class="mono">${esc(r.parsed?.postId || '—')}</dd>
        <dt>Video/Media ID</dt><dd class="mono">${esc(r.parsed?.videoId || '—')}</dd>
        <dt>Object Story ID đã xác minh</dt><dd class="mono">${esc(r.parsed?.objectStoryId || '—')}</dd>
        <dt>URL bài viết Meta trả về</dt><dd class="mono">${r.parsed?.permalinkUrl ? `<a href="${esc(r.parsed.permalinkUrl)}" target="_blank">${esc(r.parsed.permalinkUrl)}</a>` : '—'}</dd>
        <dt>Trạng thái</dt><dd style="color: ${r.parsed?.verifiedWithGraph || r.parsed?.fastResolved ? '#16a34a' : '#dc2626'}; font-weight: 600;">
          ${r.parsed?.verifiedWithGraph ? 'Đã xác minh với Graph API' : (r.parsed?.fastResolved ? 'Đã lấy ID nhanh từ Page ID + Post ID' : 'Chưa xác minh')}
        </dd>
        ${noteHtml}
      ` : `
        <dt>Page</dt><dd>${esc(r.parsed?.pageName || r.pageLink || '—')}</dd>
        <dt>Page ID</dt><dd class="mono">${esc(r.parsed?.pageId || '—')}</dd>
        <dt>Object ID</dt><dd class="mono">${esc(r.parsed?.objectStoryId || r.parsed?.postId || '—')}</dd>
      `}
      ${ids.campaignId ? `<dt>Campaign</dt><dd class="mono">${esc(ids.campaignId)}</dd>` : ''}
      ${ids.adsetId ? `<dt>Ad Set</dt><dd class="mono">${esc(ids.adsetId)}</dd>` : ''}
      ${ids.adId ? `<dt>Ad</dt><dd class="mono">${esc(ids.adId)}</dd>` : ''}
    </dl>
    ${renderIssues(r)}`;
  $('#detailDrawer').classList.remove('hidden');
  $('#drawerScrim').classList.remove('hidden');
}

function renderIssues(r) {
  const items = [];
  (r.errors || []).forEach((e) => items.push(`<li class="issue err">${esc(e)}</li>`));
  (r.warnings || []).forEach((w) => items.push(`<li class="issue warn">${esc(w)}</li>`));
  if (!items.length) return '<div class="section-label">Vấn đề</div><p class="muted">Không có lỗi hay cảnh báo.</p>';
  return `<div class="section-label">Lỗi & cảnh báo</div><ul class="issue-list">${items.join('')}</ul>`;
}

function closeDrawer() {
  $('#detailDrawer').classList.add('hidden');
  $('#drawerScrim').classList.add('hidden');
}

// ============================================================
//  Kiểm tra với Facebook (preview)
// ============================================================
async function validateRows() {
  finalizeEditing(); // chốt mọi dòng đang nhập tay trước khi kiểm tra
  const targetRows = State.rows.filter((r) => r.status !== 'missing');
  if (!targetRows.length) return toast('Chưa có dòng hợp lệ nào để kiểm tra', 'err');
  
  const btn = $('#validateBtn');
  btn.disabled = true; btn.textContent = 'Đang kiểm tra…';
  Logger.info(`Đang kiểm tra ${targetRows.length} dòng với Facebook…`);

  try {
    const chunks = [];
    const batchSize = 20;
    for (let i = 0; i < targetRows.length; i += batchSize) {
      chunks.push(targetRows.slice(i, i + batchSize));
    }

    targetRows.forEach((r) => {
      r.status = 'verifying';
      r.errors = [];
      r.warnings = [];
    });
    renderTable();

    for (const chunk of chunks) {
      try {
        const payload = { rows: chunk.map(stripForSend), creativeMode: State.creativeMode };
        const { results } = await api('/api/ads/validate', { method: 'POST', body: payload, timeoutMs: 45000 });
        chunk.forEach((r, idx) => {
          const res = results?.[idx];
          if (res) {
            r.status = res.status === 'valid' ? 'verified' : res.status;
            r.errors = res.errors || [];
            r.warnings = res.warnings || [];
            r.parsed = res.parsed || {};
            r.normalized = res.normalized || {};
          } else {
            r.status = 'error';
            r.errors = ['Không có kết quả xác minh từ API'];
          }
        });
      } catch (err) {
        if (/access token/i.test(err.message || '')) {
          chunk.forEach((r) => {
            r.status = 'permission';
            r.errors = ['Access Token đã hết hạn, vui lòng nhập token mới.'];
          });
          Logger.err('Access Token đã hết hạn, vui lòng nhập token mới.');
          break;
        }
        chunk.forEach((r) => {
          r.status = 'error';
          r.errors = [err.message || 'Lỗi kết nối API'];
        });
      } finally {
        renderTable();
        const checked = targetRows.filter((r) => r.status !== 'verifying').length;
        if (checked < targetRows.length) {
          Logger.info(`Đã kiểm tra ${checked}/${targetRows.length} dòng…`);
        }
      }
    }

    targetRows.forEach((r) => {
      if (r.status === 'verified') {
        if (r.warnings?.length) Logger.warn(`Dòng ${r.index + 1}: hợp lệ — ${r.warnings[0]}`);
      } else {
        Logger.add(`Dòng ${r.index + 1}: ${STATUS_LABEL[r.status] || r.status}${r.errors?.[0] ? ' — ' + r.errors[0] : ''}`,
          r.status === 'missing' ? 'warn' : 'err');
      }
    });

    const ok = State.rows.filter((r) => r.status === 'verified').length;
    Logger.add(`Kiểm tra xong: ${ok}/${State.rows.length} dòng hợp lệ.`, ok ? 'ok' : 'warn');
    toast(`Kiểm tra xong: ${ok}/${State.rows.length} dòng hợp lệ`, ok ? 'ok' : 'err');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Kiểm tra với Facebook';
    renderTable();
  }
}

function stripForSend(r) {
  return {
    index: r.index,
    pageLink: r.pageLink, postLink: r.postLink, ctaLink: r.ctaLink, sourceUrl: r.sourceUrl || r.ctaLink, cta: r.cta,
    campaignName: r.campaignName, adsetName: r.adsetName, adName: r.adName,
    campaignType: r.campaignType, country: r.country, budget: r.budget,
    budgetMode: r.budgetMode, budgetLevel: r.budgetLevel,
    startDate: r.startDate, startTimeRaw: r.startTimeRaw,
    endDate: r.endDate, endTimeRaw: r.endTimeRaw,
    statusRaw: r.statusRaw, notes: r.notes,
    contentMode: r.contentMode, ctaHandling: r.ctaHandling,
    parsed: r.parsed, normalized: r.normalized,
  };
}

// ============================================================
//  Tạo hàng loạt
// ============================================================
function confirmCreate() {
  const ready = State.rows.filter((r) => ['verified', 'has_cta', 'updated_cta', 'valid'].includes(r.status));
  if (!ready.length) return;
  const draft = $('#draftMode').checked;
  const acc = State.selectedAccount;

  $('#modalTitle').textContent = 'Xác nhận tạo quảng cáo';
  $('#modalBody').innerHTML = `
    <p>Bạn sắp tạo <strong>${ready.length}</strong> quảng cáo trong tài khoản
       <strong>${esc(acc.name)}</strong> (${esc(acc.currency)}).</p>
    <div class="summary-grid">
      <div class="sum-card"><div class="n">${ready.length}</div><div class="l">Chiến dịch</div></div>
      <div class="sum-card"><div class="n">${ready.length}</div><div class="l">Nhóm QC</div></div>
      <div class="sum-card"><div class="n">${ready.length}</div><div class="l">Quảng cáo</div></div>
    </div>
    <p style="margin-top:14px">${draft
      ? '🟡 <strong>Chế độ nháp</strong>: quảng cáo sẽ được tạo ở trạng thái <strong>PAUSED</strong> (không tiêu tiền) để bạn kiểm tra trước.'
      : '🟢 <strong>Chế độ chạy</strong>: quảng cáo sẽ bật theo cột “trạng thái”. Có thể bắt đầu tiêu ngân sách ngay.'}</p>`;
  const foot = $('#modalFoot');
  foot.innerHTML = '';
  const cancel = mkBtn('Huỷ', 'btn-ghost', closeModal);
  const go = mkBtn(draft ? 'Tạo bản nháp' : 'Tạo & chạy', 'btn-primary', () => { closeModal(); runCreate(ready, draft); });
  foot.append(cancel, go);
  $('#modalScrim').classList.remove('hidden');
}

async function runCreate(rows, draft) {
  const btn = $('#createBtn');
  btn.disabled = true; btn.textContent = 'Đang tạo…';
  Logger.info(`Bắt đầu tạo ${rows.length} quảng cáo · chế độ ${draft ? 'NHÁP (PAUSED)' : 'CHẠY'}.`);

  const resultsForModal = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    
    try {
      r.status = 'creating_ad';
      r.errors = [];
      r.warnings = [];
      renderTable();

      const createRes = await api('/api/ads/create', {
        method: 'POST',
        body: {
          row: stripForSend(r),
          adAccountId: State.selectedAccount.id,
          currency: State.selectedAccount.currency,
          draftMode: draft
        }
      });

      const res = createRes.result;
      r.status = res.status;
      r.errors = res.errors || [];
      r.warnings = res.warnings || [];
      r.ids = res.ids || {};

      if (res.status === 'created') {
        ok++;
        Logger.ok(`SUCCESS Dòng ${r.index + 1}: đã tạo thành công (campaign ${res.ids?.campaignId || '—'}${res.ids?.adId ? ' · ad ' + res.ids.adId : ''}).`);
        (r.warnings || []).forEach((w) => Logger.warn(`WARNING Dòng ${r.index + 1}: ${w}`));
      } else {
        fail++;
        Logger.err(`FAILED Dòng ${r.index + 1}: ${res.errors?.[0] || 'lỗi không xác định'}`);
      }

      resultsForModal.push({ index: r.index, status: res.status, errors: res.errors, ids: res.ids });
    } catch (err) {
      fail++;
      r.status = 'error';
      r.errors = [err.message || 'Lỗi không xác định trong quá trình tạo'];
      Logger.err(`✗ Dòng ${r.index + 1}: ${r.errors[0]}`);
      resultsForModal.push({ index: r.index, status: 'error', errors: r.errors, ids: {} });
    }

    // Luôn lưu lịch sử camp (gồm cả camp lỗi)
    History.add({
      ts: Date.now(),
      campaignName: r.campaignName || '—',
      adsetName: r.adsetName || '',
      adName: r.adName || '',
      type: r.campaignType || '',
      cta: ctaForRow(r || {})?.code || '',
      account: State.selectedAccount?.name || '',
      draft,
      status: r.status,
      ids: r.ids || {},
      error: r.errors?.[0] || '',
    });

    renderTable();
  }

  Logger.add(`Kết quả tạo: ${ok} thành công, ${fail} lỗi.`, fail ? 'warn' : 'ok');
  setStep(4);
  showResults(resultsForModal, draft);
  btn.disabled = false; btn.textContent = 'Tạo hàng loạt';
}

function showResults(results, draft) {
  const ok = results.filter((r) => r.status === 'created').length;
  const fail = results.length - ok;
  $('#modalTitle').textContent = 'Kết quả tạo quảng cáo';
  $('#modalBody').innerHTML = `
    <div class="summary-grid">
      <div class="sum-card"><div class="n" style="color:var(--st-created)">${ok}</div><div class="l">Thành công</div></div>
      <div class="sum-card"><div class="n" style="color:var(--st-error)">${fail}</div><div class="l">Lỗi</div></div>
      <div class="sum-card"><div class="n">${results.length}</div><div class="l">Tổng</div></div>
    </div>
    <p style="margin-top:14px">${draft
      ? 'Các quảng cáo đang ở trạng thái <strong>tạm dừng (PAUSED)</strong>. Vào Trình quản lý quảng cáo để bật khi sẵn sàng.'
      : 'Các quảng cáo hợp lệ đã được tạo theo trạng thái trong file.'}
      ${fail ? ' Bấm “Xem lỗi” ở các dòng lỗi để biết chi tiết.' : ''}</p>`;
  const foot = $('#modalFoot');
  foot.innerHTML = '';
  foot.append(mkBtn('Đóng', 'btn-primary', closeModal));
  $('#modalScrim').classList.remove('hidden');
  toast(`Tạo xong: ${ok} thành công, ${fail} lỗi`, fail ? 'err' : 'ok');
}

// ============================================================
//  File mẫu
// ============================================================
function downloadTemplate() {
  const headers = [
    'Tên Page', 'Link bài viết', 'Chế độ nội dung', 'Tên chiến dịch', 'Loại chiến dịch',
    'Tên nhóm quảng cáo', 'Tên quảng cáo', 'Quốc gia', 'Ngân sách', 'Cấp ngân sách',
    'Loại ngân sách', 'Ngày bắt đầu', 'Giờ bắt đầu', 'Ngày kết thúc', 'Giờ kết thúc',
    'Trạng thái', 'Nút CTA (tuỳ chọn)', 'Link CTA (tuỳ chọn)', 'URL nguồn', 'Ghi chú'
  ];
  const sample = [
    '123456789',
    '123456789_987654321',
    'Bài viết có sẵn',
    'Traffic Existing Post 01',
    'Traffic',
    'Adset VN 01',
    'Ad Existing Post 01',
    'VN',
    '200000',
    'Cấp nhóm',
    'Hàng ngày',
    '01/07/2026',
    '08:00',
    '',
    '',
    'Tạm dừng',
    'SHOP_NOW',
    'https://example.com',
    'https://example.com',
    'URL nguồn sẽ được gắn vào creative'
  ];
  // Hàng ghi chú các nút CTA hợp lệ (đặt ở sheet thứ 2 cho gọn)
  const ctaGuide = [['Mã CTA', 'Nhãn hiển thị'], ...Object.entries(CTA_LABELS).map(([code, label]) => [code, label])];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Quảng cáo');
  const wsGuide = XLSX.utils.aoa_to_sheet(ctaGuide);
  wsGuide['!cols'] = [{ wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Danh sách nút CTA');
  XLSX.writeFile(wb, 'mau-quang-cao-hang-loat.xlsx');
}

// ============================================================
//  Tiện ích
// ============================================================
async function api(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  topLoader.start();
  Logger.info(`→ ${method} ${url}`);
  const controller = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    let data = {};
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) throw new Error(data.error || `Lỗi máy chủ (${res.status})`);
    Logger.ok(`← ${res.status} ${url}`);
    topLoader.done();
    return data;
  } catch (err) {
    const message = err.name === 'AbortError' ? 'Request quá lâu, vui lòng kiểm tra ít dòng hơn hoặc nhập token mới.' : err.message;
    Logger.err(`← LỖI ${url}: ${message}`);
    topLoader.error();
    throw new Error(message);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mkBtn(text, cls, onClick) {
  const b = document.createElement('button');
  b.className = 'btn ' + cls;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
function closeModal() { $('#modalScrim').classList.add('hidden'); }

let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function esc(s) {
  return (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
