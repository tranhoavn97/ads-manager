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
  creativeMode: 'NEW_CTA_CREATIVE',
  editingRowIndex: null,
};

const STATUS_LABEL = {
  pending: 'Chưa kiểm tra',
  valid: 'Hợp lệ',
  missing: 'Thiếu dữ liệu',
  permission: 'Lỗi quyền',
  post_error: 'Lỗi post',
  created: 'Đã tạo thành công',
  create_error: 'Lỗi khi tạo',
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
  const isTraffic = resolveTypeId(row?.campaignType) === 'traffic';
  const hasPost = !!(row?.postLink && row?.postLink.toString().trim());
  if (isTraffic && hasPost) {
    return { code: 'SHOP_NOW', label: CTA_LABELS['SHOP_NOW'] || 'Mua ngay', custom: true };
  }

  const override = resolveCtaCode(row?.cta);
  if (override) return { code: override, label: CTA_LABELS[override] || override, custom: true };
  const id = resolveTypeId(row?.campaignType);
  if (id) { const code = TYPE_DEFAULT_CTA[id]; return { code, label: CTA_LABELS[code] || code, custom: false }; }
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
  if (!c) return '<span class="cta-pill cta-none">CTA: —</span>';
  const cls = CTA_CLASS[c.code] || 'cta-other';
  const dot = c.custom ? '<span class="custom-dot"></span>' : '';
  const tip = c.custom ? 'Nút CTA tự điền trong file' : 'Nút CTA mặc định theo loại chiến dịch';
  return `<span class="cta-pill ${cls}" title="${tip}">${dot}${esc(c.label)}</span>` +
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
      font-family: 'Be Vietnam Pro', system-ui, -apple-system, sans-serif !important;
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
  $('#toUploadBtn').addEventListener('click', () => { showView('work'); setStep(3); });
  $('#templateBtn').addEventListener('click', downloadTemplate);
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
  $('#userBadge').classList.remove('hidden');
  $('#userName').textContent = State.user?.name || 'Đã đăng nhập';
  showView('account');
  setStep(2);
  await loadAdAccounts();
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
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
async function loadAdAccounts() {
  const list = $('#adAccountList');
  list.innerHTML = '<div class="loading">Đang tải danh sách tài khoản…</div>';
  try {
    const accounts = await api('/api/accounts/adaccounts');
    State.adAccounts = accounts;
    if (!accounts.length) {
      list.innerHTML = '<div class="loading">Không tìm thấy tài khoản quảng cáo nào. Kiểm tra quyền ads_management.</div>';
      return;
    }
    list.innerHTML = '';
    accounts.forEach((a) => {
      const card = document.createElement('div');
      card.className = 'account-card' + (a.usable ? '' : ' disabled');
      card.innerHTML = `
        <div class="ac-name">${esc(a.name)}</div>
        <div class="ac-id">${esc(a.id)}</div>
        <div class="ac-meta">
          <span class="chip">${esc(a.currency)}</span>
          <span class="chip ${a.usable ? 'ok' : 'bad'}">${esc(a.statusLabel)}</span>
        </div>`;
      if (a.usable) card.addEventListener('click', () => selectAccount(a, card));
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
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
  ['pageLink', ['link page', 'link trang', 'trang fanpage', 'fanpage', 'page']],
  ['postLink', ['link bai viet', 'bai viet', 'reel', 'anh', 'post', 'link bai', 'bai/reel']],
  ['cta', ['nut cta', 'nut keu goi', 'keu goi', 'call to action', 'cta button', 'nut hanh dong']],
  ['ctaLink', ['cta', 'website', 'link dich', 'url', 'link den', 'link cta']],
  ['budgetMode', ['loai ngan sach', 'kieu ngan sach', 'ngan sach loai', 'hang ngay tron doi']],
  ['budgetLevel', ['cap ngan sach', 'ngan sach cap', 'cbo']],
  ['campaignType', ['loai', 'muc tieu', 'objective', 'type']],
  ['campaignName', ['ten chien dich', 'chien dich', 'campaign']],
  ['adsetName', ['nhom quang cao', 'ad set', 'adset', 'nhom']],
  ['adName', ['ten quang cao', 'quang cao', 'ad name']],
  ['country', ['quoc gia', 'nuoc', 'country', 'location']],
  ['budget', ['ngan sach', 'budget', 'chi phi']],
  ['startDate', ['ngay bat dau', 'bat dau', 'start']],
  ['endDate', ['ngay ket thuc', 'ket thuc', 'end']],
  ['statusRaw', ['trang thai', 'status']],
];

function removeAccents(s) {
  return (s ?? '').toString().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

function matchHeader(header) {
  const h = removeAccents(header);
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

  if (/^[a-zA-Z0-9.]{5,}$/.test(raw) && !raw.includes('/') && !raw.toLowerCase().includes('facebook') && !raw.toLowerCase().includes('fb.com')) {
    return { id: null, slug: raw, vanity: true };
  }

  const url = tryUrl(raw);
  if (!url || !isFbHost(url)) return { id: null, error: 'Link Page không phải domain Facebook hợp lệ' };
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
    return { id: null, error: `Link Page không hợp lệ (đường dẫn ${segs[0]} là của hệ thống)` };
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
  const parsed = { pageId: null, postId: null, objectStoryId: null, pageVanity: null };
  const pg = clientParsePageId(r.pageLink);
  parsed.pageId = pg.id || null;
  if (pg.vanity) parsed.pageVanity = pg.slug;
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
  const hasErr = r.errors?.length || r.status === 'missing' || r.status === 'permission' || r.status === 'post_error' || r.status === 'create_error';
  if (hasErr) {
    const title = esc((r.errors || []).join('\n') || STATUS_LABEL[r.status] || 'Lỗi');
    return `<div class="status-icon status-error" title="${title}">!</div>`;
  }
  if (r.status === 'valid' || r.status === 'created') {
    const title = esc(STATUS_LABEL[r.status] || 'Hợp lệ');
    return `<div class="status-icon status-success" title="${title}">✓</div>`;
  }
  const title = esc(STATUS_LABEL[r.status] || 'Chưa kiểm tra');
  return `<div class="status-icon status-pending" title="${title}">?</div>`;
}

function clientPreCheck() {
  const otherRequired = [['campaignName', 'tên chiến dịch'], ['adsetName', 'tên nhóm quảng cáo'],
    ['adName', 'tên quảng cáo'], ['campaignType', 'loại chiến dịch'], ['country', 'quốc gia'], ['budget', 'ngân sách']];
  State.rows.forEach((r) => {
    r.errors = [];
    r.warnings = [];
    clientParseRow(r); // tách Page ID / Post ID ngay để xem trước
    
    const missing = [];
    if (!r.postLink || r.postLink.toString().trim() === '') {
      if (!r.pageLink) missing.push('link Page');
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

    // Cảnh báo nếu nhập CTA ở chế độ EXISTING_POST
    const hasPost = !!(r.postLink && r.postLink.toString().trim());
    if (hasPost && State.creativeMode === 'EXISTING_POST') {
      const hasCtaInput = (r.ctaLink && r.ctaLink.toString().trim()) || (r.cta && r.cta.toString().trim());
      if (hasCtaInput) {
        r.warnings.push('Không thể ghi đè CTA mới khi sử dụng đúng bài viết có sẵn. Tool sẽ giữ nguyên CTA của bài gốc.');
      }
    }

    if (r.parsed.pageVanity && !r.parsed.pageId) {
      r.warnings.push(`Page "@${r.parsed.pageVanity}" là tên (vanity) — cần đăng nhập bằng tài khoản quản lý Page để lấy ID số. Hoặc thay bằng link/ID dạng số.`);
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
    body.innerHTML = '<tr><td colspan="10" class="loading">Không có dòng nào khớp bộ lọc.</td></tr>';
  }

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    const hasErr = r.errors?.length;
    
    if (State.editingRowIndex === r.index) {
      tr.innerHTML = `
        <td style="text-align: center; vertical-align: middle;">${getStatusIconHtml(r)}</td>
        <td><input type="text" class="input-inline ad-account-input" value="${esc(r.adAccountId || '')}" placeholder="${esc(State.selectedAccount?.id || '')}"></td>
        <td><input type="text" class="input-inline campaign-name-input" value="${esc(r.campaignName || '')}"></td>
        <td><input type="text" class="input-inline adset-name-input" value="${esc(r.adsetName || '')}"></td>
        <td>
          <div class="budget-edit-group">
            <input type="text" class="input-inline budget-val-input" value="${esc(r.budget || '')}">
            <div class="budget-options-inline">
              <select class="select-inline budget-level-input">
                <option value="adset" ${r.budgetLevel === 'adset' ? 'selected' : ''}>ABO (Nhóm)</option>
                <option value="campaign" ${r.budgetLevel === 'campaign' ? 'selected' : ''}>CBO (Chiến dịch)</option>
              </select>
              <select class="select-inline budget-mode-input">
                <option value="daily" ${r.budgetMode === 'daily' ? 'selected' : ''}>Hàng ngày</option>
                <option value="lifetime" ${r.budgetMode === 'lifetime' ? 'selected' : ''}>Trọn đời</option>
              </select>
            </div>
          </div>
        </td>
        <td><input type="text" class="input-inline start-date-input" value="${esc(r.startDate || '')}" placeholder="dd/mm/yyyy"></td>
        <td><input type="text" class="input-inline post-link-input" value="${esc(r.postLink || '')}" placeholder="Link bài viết"></td>
        <td><input type="text" class="input-inline ad-name-input" value="${esc(r.adName || '')}"></td>
        <td>
          <div class="cta-edit-group">
            <select class="select-inline cta-input">
              <option value="NO_BUTTON" ${r.cta === 'NO_BUTTON' ? 'selected' : ''}>Không nút</option>
              <option value="SHOP_NOW" ${r.cta === 'SHOP_NOW' ? 'selected' : ''}>Mua ngay</option>
              <option value="SEND_MESSAGE" ${r.cta === 'SEND_MESSAGE' ? 'selected' : ''}>Gửi tin nhắn</option>
              <option value="LEARN_MORE" ${r.cta === 'LEARN_MORE' ? 'selected' : ''}>Tìm hiểu thêm</option>
              <option value="SIGN_UP" ${r.cta === 'SIGN_UP' ? 'selected' : ''}>Đăng ký</option>
              <option value="BOOK_NOW" ${r.cta === 'BOOK_NOW' ? 'selected' : ''}>Đặt ngay</option>
              <option value="APPLY_NOW" ${r.cta === 'APPLY_NOW' ? 'selected' : ''}>Nộp đơn</option>
            </select>
            <input type="text" class="input-inline cta-link-input" value="${esc(r.ctaLink || '')}" placeholder="Link CTA">
          </div>
        </td>
        <td>
          <div class="action-btn-group">
            <button class="save-btn" title="Lưu">✓</button>
            <button class="cancel-btn" title="Hủy">x</button>
          </div>
        </td>`;
        
      tr.querySelector('.save-btn').addEventListener('click', () => {
        r.adAccountId = tr.querySelector('.ad-account-input').value.trim() || null;
        r.campaignName = tr.querySelector('.campaign-name-input').value.trim();
        r.adsetName = tr.querySelector('.adset-name-input').value.trim();
        r.budget = tr.querySelector('.budget-val-input').value.trim();
        r.budgetLevel = tr.querySelector('.budget-level-input').value;
        r.budgetMode = tr.querySelector('.budget-mode-input').value;
        r.startDate = tr.querySelector('.start-date-input').value.trim();
        r.postLink = tr.querySelector('.post-link-input').value.trim();
        r.adName = tr.querySelector('.ad-name-input').value.trim();
        r.cta = tr.querySelector('.cta-input').value;
        r.ctaLink = tr.querySelector('.cta-link-input').value.trim();
        
        State.editingRowIndex = null;
        clientPreCheck();
        buildFilters();
        renderTable();
        toast('Đã lưu thay đổi', 'ok');
      });
      
      tr.querySelector('.cancel-btn').addEventListener('click', () => {
        State.editingRowIndex = null;
        renderTable();
      });
      
    } else {
      tr.innerHTML = `
        <td style="text-align: center; vertical-align: middle;">${getStatusIconHtml(r)}</td>
        <td><span class="cell-mono">${esc(r.adAccountId || State.selectedAccount?.id || '—')}</span></td>
        <td><div class="cell-strong">${esc(r.campaignName || '—')}</div></td>
        <td><div class="cell-strong">${esc(r.adsetName || '—')}</div></td>
        <td>
          <div class="cell-strong">${esc(r.budget || '—')}</div>
          <div class="cell-sub">${r.budgetLevel === 'campaign' ? 'CBO (Chiến dịch)' : 'ABO (Nhóm)'} · ${r.budgetMode === 'lifetime' ? 'Trọn đời' : 'Hàng ngày'}</div>
        </td>
        <td>${esc(r.startDate || '—')}</td>
        <td><div class="cell-sub" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${esc(r.postLink || '')}">${esc(r.postLink || '—')}</div></td>
        <td><div class="cell-strong">${esc(r.adName || '—')}</div></td>
        <td>
          <div>${ctaPillHtml(r)}</div>
          ${r.ctaLink ? `<div class="cell-sub" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${esc(r.ctaLink)}"><a href="${esc(r.ctaLink)}" target="_blank">${esc(r.ctaLink)}</a></div>` : ''}
        </td>
        <td>
          <div class="action-btn-group">
            <button class="edit-btn" data-i="${r.index}">Sửa</button>
            <button class="detail-btn ${hasErr ? 'has-err' : ''}" data-i="${r.index}">Chi tiết</button>
          </div>
        </td>`;
        
      tr.querySelector('.edit-btn').addEventListener('click', () => {
        State.editingRowIndex = r.index;
        renderTable();
      });
      
      tr.querySelector('.detail-btn').addEventListener('click', () => openDrawer(r.index));
    }
    body.appendChild(tr);
  });

  updateCounts();
  updateReady();
}

function updateReady() {
  const ready = State.rows.filter((r) => r.status === 'valid').length;
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
  let noteHtml = '';
  if (hasPost) {
    const hasOldCta = r.parsed?.hasOldCta;
    if (hasOldCta) {
      ctaHtml = `
        <dt>Nút CTA</dt><dd class="muted">Tự động giữ nguyên của bài gốc (đã có CTA)</dd>
        ${r.ctaLink ? `<dt>Link CTA nháp</dt><dd class="muted">${esc(r.ctaLink)} (Bỏ qua vì giữ nguyên bài gốc)</dd>` : ''}
      `;
      noteHtml = `<dt>Ghi chú</dt><dd style="color: #ea580c; font-weight: 600;">Bài viết gốc đã có sẵn nút CTA. Tool sẽ giữ nguyên bài gốc không chỉnh sửa.</dd>`;
    } else if (r.ctaLink && r.ctaLink.toString().trim()) {
      ctaHtml = `
        <dt>Nút CTA</dt><dd>${ctaPillHtml(r, true)}</dd>
        <dt>Link CTA</dt><dd class="mono"><a href="${esc(r.ctaLink)}" target="_blank">${esc(r.ctaLink)}</a></dd>
      `;
      noteHtml = `<dt>Ghi chú</dt><dd style="color: #2563eb; font-weight: 600;">Bài gốc chưa có CTA. Tool sẽ tự động gắn nút CTA và link website đích.</dd>`;
    } else {
      ctaHtml = `
        <dt>Nút CTA</dt><dd class="muted">Không đổi (không có link CTA trong sheet)</dd>
      `;
      noteHtml = `<dt>Ghi chú</dt><dd style="color: #64748b; font-weight: 600;">Bài viết gốc chưa có CTA và không có link CTA nào trong sheet. Tool sẽ dùng bài gốc làm ad creative giữ nguyên.</dd>`;
    }
  } else {
    ctaHtml = `
      <dt>Nút CTA</dt><dd>${ctaPillHtml(r, true)}</dd>
      ${r.ctaLink ? `<dt>Link CTA</dt><dd class="mono"><a href="${esc(r.ctaLink)}" target="_blank">${esc(r.ctaLink)}</a></dd>` : ''}
    `;
  }

  body.innerHTML = `
    <div class="section-label">Dữ liệu</div>
    <dl class="dl">
      ${hasPost ? `<dt>Chế độ</dt><dd>${State.creativeMode === 'EXISTING_POST' ? 'Sử dụng đúng bài viết có sẵn' : 'Tạo bản quảng cáo mới có CTA'}</dd>` : ''}
      <dt>Chiến dịch</dt><dd>${esc(r.campaignName || '—')}</dd>
      <dt>Nhóm QC</dt><dd>${esc(r.adsetName || '—')}</dd>
      <dt>Quảng cáo</dt><dd>${esc(r.adName || '—')}</dd>
      <dt>Loại</dt><dd>${esc(r.campaignType || '—')}</dd>
      ${ctaHtml}
      <dt>Quốc gia</dt><dd>${esc(r.country || '—')}</dd>
      <dt>Ngân sách</dt><dd>${esc(r.budget || '—')} · ${budgetModeLabel(r)} · ${budgetLevelLabel(r)}</dd>
      ${hasPost ? `
        <dt>Page ID</dt><dd class="mono">${esc(r.parsed?.pageId || '—')}</dd>
        <dt>Post ID thật</dt><dd class="mono">${esc(r.parsed?.postId || '—')}</dd>
        <dt>Video/Media ID</dt><dd class="mono">${esc(r.parsed?.videoId || '—')}</dd>
        <dt>Object Story ID đã xác minh</dt><dd class="mono">${esc(r.parsed?.objectStoryId || '—')}</dd>
        <dt>URL bài viết Meta trả về</dt><dd class="mono">${r.parsed?.permalinkUrl ? `<a href="${esc(r.parsed.permalinkUrl)}" target="_blank">${esc(r.parsed.permalinkUrl)}</a>` : '—'}</dd>
        <dt>Trạng thái</dt><dd style="color: ${r.parsed?.verifiedWithGraph ? '#16a34a' : '#dc2626'}; font-weight: 600;">
          ${r.parsed?.verifiedWithGraph ? 'Đã xác minh với Graph API' : 'Chưa xác minh'}
        </dd>
        ${noteHtml}
      ` : `
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
  if (!State.rows.length) return toast('Chưa có dữ liệu', 'err');
  const btn = $('#validateBtn');
  btn.disabled = true; btn.textContent = 'Đang kiểm tra…';
  Logger.info(`Đang kiểm tra ${State.rows.length} dòng với Facebook…`);
  try {
    const payload = { rows: State.rows.map(stripForSend), creativeMode: State.creativeMode };
    const { results } = await api('/api/ads/validate', { method: 'POST', body: payload });
    results.forEach((res) => {
      const r = State.rows.find((x) => x.index === res.index);
      if (!r) return;
      r.status = res.status;
      r.errors = res.errors;
      r.warnings = res.warnings;
      r.parsed = res.parsed;
      r.normalized = res.normalized;
    });
    results.forEach((res) => {
      if (res.status === 'valid') {
        if (res.warnings?.length) Logger.warn(`Dòng ${res.index + 1}: hợp lệ — ${res.warnings[0]}`);
        return;
      }
      Logger.add(`Dòng ${res.index + 1}: ${STATUS_LABEL[res.status]}${res.errors?.[0] ? ' — ' + res.errors[0] : ''}`,
        res.status === 'missing' ? 'warn' : 'err');
    });
    renderTable();
    const ok = State.rows.filter((r) => r.status === 'valid').length;
    Logger.add(`Kiểm tra xong: ${ok}/${State.rows.length} dòng hợp lệ.`, ok ? 'ok' : 'warn');
    toast(`Kiểm tra xong: ${ok}/${State.rows.length} dòng hợp lệ`, ok ? 'ok' : 'err');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Kiểm tra với Facebook';
  }
}

function stripForSend(r) {
  return {
    index: r.index,
    pageLink: r.pageLink, postLink: r.postLink, ctaLink: r.ctaLink, cta: r.cta,
    campaignName: r.campaignName, adsetName: r.adsetName, adName: r.adName,
    campaignType: r.campaignType, country: r.country, budget: r.budget,
    budgetMode: r.budgetMode, budgetLevel: r.budgetLevel,
    startDate: r.startDate, endDate: r.endDate, statusRaw: r.statusRaw,
    parsed: r.parsed, normalized: r.normalized,
  };
}

// ============================================================
//  Tạo hàng loạt
// ============================================================
function confirmCreate() {
  const ready = State.rows.filter((r) => r.status === 'valid');
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
  try {
    const payload = {
      adAccountId: State.selectedAccount.id,
      currency: State.selectedAccount.currency,
      draftMode: draft,
      creativeMode: State.creativeMode,
      rows: rows.map(stripForSend),
    };
    const { results } = await api('/api/ads/create', { method: 'POST', body: payload });
    let ok = 0, fail = 0;
    results.forEach((res) => {
      const r = State.rows.find((x) => x.index === res.index);
      if (r) {
        r.status = res.status;
        r.errors = res.errors?.length ? res.errors : r.errors;
        r.ids = res.ids;
      }
      if (res.status === 'created') {
        ok++;
        Logger.ok(`✓ Dòng ${res.index + 1}: đã tạo (campaign ${res.ids?.campaignId || '—'}${res.ids?.adId ? ' · ad ' + res.ids.adId : ''}).`);
      } else {
        fail++;
        Logger.err(`✗ Dòng ${res.index + 1}: ${res.errors?.[0] || 'lỗi không xác định'}`);
      }
      // Luôn lưu lịch sử camp (gồm cả camp lỗi)
      History.add({
        ts: Date.now(),
        campaignName: r?.campaignName || '—',
        adsetName: r?.adsetName || '',
        adName: r?.adName || '',
        type: r?.campaignType || '',
        cta: ctaForRow(r || {})?.code || '',
        account: State.selectedAccount?.name || '',
        draft,
        status: res.status,
        ids: res.ids || {},
        error: res.errors?.[0] || '',
      });
    });
    Logger.add(`Kết quả tạo: ${ok} thành công, ${fail} lỗi.`, fail ? 'warn' : 'ok');
    renderTable();
    setStep(4);
    showResults(results, draft);
  } catch (err) {
    Logger.err(`Tạo hàng loạt thất bại: ${err.message}`);
    toast(err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Tạo hàng loạt';
  }
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
  const headers = ['Link Page', 'Link bài viết/Reel/Ảnh', 'Link CTA', 'Tên chiến dịch', 'Tên nhóm quảng cáo',
    'Tên quảng cáo', 'Loại chiến dịch', 'Nút CTA', 'Quốc gia', 'Ngân sách', 'Loại ngân sách', 'Cấp ngân sách',
    'Ngày bắt đầu', 'Ngày kết thúc', 'Trạng thái'];
  // "Loại ngân sách": Hàng ngày | Trọn đời (mặc định Hàng ngày — Trọn đời cần Ngày kết thúc).
  // "Cấp ngân sách": Nhóm | Chiến dịch (CBO) — mặc định Nhóm.
  // Mẹo: Page ID nên nhập dạng LINK (facebook.com/...) để Excel không làm tròn số dài.
  const sample = [
    'https://www.facebook.com/61550000000000', 'https://www.facebook.com/61550000000000/posts/1234567890', '',
    'CD Tương tác T6', 'Nhóm VN 25-45', 'QC Bài viết A', 'Tương tác', '', 'Việt Nam', '200000', 'Hàng ngày', 'Nhóm', '24/06/2026', '30/06/2026', 'Tạm dừng'];
  const sample2 = [
    'https://www.facebook.com/61550000000000', '', 'https://shop.example.com/sale', 'CD Traffic Sale',
    'Nhóm Web VN', 'QC Web Sale', 'Traffic', 'Mua ngay', 'VN', '500000', 'Hàng ngày', 'Chiến dịch', '24/06/2026', '', 'Bật'];
  // Hàng ghi chú các nút CTA hợp lệ (đặt ở sheet thứ 2 cho gọn)
  const ctaGuide = [['Mã CTA', 'Nhãn hiển thị'], ...Object.entries(CTA_LABELS).map(([code, label]) => [code, label])];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample, sample2]);
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
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) throw new Error(data.error || `Lỗi máy chủ (${res.status})`);
    Logger.ok(`← ${res.status} ${url}`);
    topLoader.done();
    return data;
  } catch (err) {
    Logger.err(`← LỖI ${url}: ${err.message}`);
    topLoader.error();
    throw err;
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
