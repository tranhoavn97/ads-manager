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
  selected: new Set(), // index các dòng đang được tick chọn (để sửa/xoá hàng loạt)
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
// Mục tiêu chiến dịch cho dropdown — nhãn theo đúng tên trong Trình quản lý QC (Ads Manager).
// (Các nhãn này vẫn resolve được về đúng loại ở campaign-mapper.js phía server nhờ từ khoá con.)
const TYPE_OPTIONS = [
  ['tin_nhan', 'Tin nhắn'],
  ['tuong_tac', 'Lượt tương tác'],
  ['traffic', 'Lưu lượng truy cập'],
  ['lead', 'Khách hàng tiềm năng'],
  ['doanh_so', 'Doanh số'],
];
const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS);
// Nhãn mục tiêu chuẩn của tool cho 1 dòng (chuẩn hoá text tự do từ file về đúng tên Ads Manager)
function typeLabel(r) {
  const id = resolveTypeId(r?.campaignType);
  return id ? TYPE_LABELS[id] : (r?.campaignType || '—');
}
// Nút CTA KHÔNG dùng link đích → ẩn ô Link (gửi tin nhắn, thích Trang, WhatsApp, gọi, không nút)
const NO_LINK_CTAS = new Set(['MESSAGE_PAGE', 'LIKE_PAGE', 'WHATSAPP_MESSAGE', 'CALL_NOW', 'NO_BUTTON']);
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
  const id = resolveTypeId(row?.campaignType);
  if (id) { const code = TYPE_DEFAULT_CTA[id]; return { code, label: CTA_LABELS[code] || code, custom: false }; }
  return null;
}
// Nút CTA hiện tại của dòng có dùng link đích không (để hiện/ẩn ô Link)
function ctaUsesLink(r) {
  const c = ctaForRow(r);
  if (!c) return true; // chưa rõ mục tiêu/nút → cứ cho nhập link
  return !NO_LINK_CTAS.has(c.code);
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
  const tip = c.custom ? 'Nút CTA tự chọn (khác mặc định)' : 'Nút CTA mặc định theo loại chiến dịch';
  return `<span class="cta-pill ${cls}" title="${tip}">${dot}${esc(c.label)}</span>` +
    (withCode ? ` <span class="cta-code">${esc(c.code)}</span>` : '');
}

// Ô chọn mục tiêu chiến dịch (Loại) ngay trong bảng.
function typeEditorHtml(r) {
  const cur = resolveTypeId(r.campaignType) || '';
  const opts = ['<option value="">— Chọn mục tiêu —</option>']
    .concat(TYPE_OPTIONS.map(([id, label]) =>
      `<option value="${id}"${cur === id ? ' selected' : ''}>${esc(label)}</option>`))
    .join('');
  return `<select class="type-select" title="Mục tiêu quảng cáo của chiến dịch">${opts}</select>`;
}

// Ô sửa nút CTA + Link CTA ngay trong bảng (ghi đè giá trị từ file).
// - Chọn "Mặc định theo loại" => bỏ ghi đè, dùng nút mặc định theo mục tiêu.
// - Giá trị select là MÃ CTA (vd SHOP_NOW) — khớp với resolveCta() phía server.
// - Ô Link chỉ hiện với nút có dùng link (ẩn với Gửi tin nhắn, Không có nút, Thích Trang…).
function ctaEditorHtml(r) {
  const cur = resolveCtaCode(r.cta) || '';
  const opts = ['<option value="">Mặc định theo mục tiêu</option>']
    .concat(Object.entries(CTA_LABELS).map(([code, label]) =>
      `<option value="${code}"${cur === code ? ' selected' : ''}>${esc(label)}</option>`))
    .join('');
  return `<div class="cta-cell">
      <div class="cta-preview">${ctaPillHtml(r)}</div>
      <select class="cta-select" title="Đổi nút kêu gọi hành động cho dòng này">${opts}</select>
      <input class="cta-link-input${ctaUsesLink(r) ? '' : ' hidden'}" type="text" inputmode="url" spellcheck="false"
             placeholder="Link CTA (https://…)" value="${esc(r.ctaLink || '')}"
             title="Link đích khi bấm nút (dùng cho Traffic/Doanh số hoặc nút gắn link)" />
    </div>`;
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

async function init() {
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
  $('#sampleBtn')?.addEventListener('click', loadSampleData);
  $('#fileInput').addEventListener('change', (e) => handleFile(e.target.files[0]));
  $('#validateBtn').addEventListener('click', validateRows);
  $('#createBtn').addEventListener('click', confirmCreate);
  $('#searchInput').addEventListener('input', (e) => { State.search = e.target.value.trim().toLowerCase(); renderTable(); });
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerScrim').addEventListener('click', closeDrawer);

  // Chọn nhiều dòng → sửa / xoá hàng loạt
  $('#checkAll')?.addEventListener('change', (e) => toggleSelectAll(e.target.checked));
  $('#bulkEditBtn')?.addEventListener('click', () => openEditRows(selectedRows()));
  $('#bulkDelBtn')?.addEventListener('click', () => {
    const rows = selectedRows();
    if (!rows.length) return;
    if (!confirm(`Xoá ${rows.length} dòng đã chọn?`)) return;
    deleteRows(rows);
  });
  $('#bulkClearBtn')?.addEventListener('click', () => { State.selected.clear(); renderTable(); });

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
      const wb = XLSX.read(e.target.result, { type: 'array' });
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

      revealTable(`<strong>${esc(file.name)}</strong> · ${State.rows.length} dòng` +
        (unknownCols ? ` · <span class="muted">${unknownCols} cột không nhận dạng (đã bỏ qua)</span>` : ''));

      Logger.ok(`Đọc file "${file.name}": ${State.rows.length} dòng${unknownCols ? `, ${unknownCols} cột bị bỏ qua` : ''}.`);
      logPreCheck();
      toast(`Đã đọc ${State.rows.length} dòng`, 'ok');
    } catch (err) {
      Logger.err(`Không đọc được file: ${err.message}`);
      toast('Không đọc được file: ' + err.message, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
}

// Hiện bảng + bộ lọc sau khi đã có dữ liệu (dùng chung cho file upload & dữ liệu mẫu)
function revealTable(metaHtml) {
  State.selected.clear();
  $('#fileMeta').classList.remove('hidden');
  $('#fileMeta').innerHTML = metaHtml;
  $('#tableZone').classList.remove('hidden');
  buildFilters();
  renderTable();
  setStep(3);
}

// Ghi nhật ký kết quả kiểm tra sơ bộ phía trình duyệt
function logPreCheck() {
  const missing = State.rows.filter((r) => r.status === 'missing').length;
  if (missing) Logger.warn(`${missing} dòng thiếu dữ liệu bắt buộc (kiểm tra sơ bộ phía trình duyệt).`);
  Logger.info('Sẵn sàng — bấm “Kiểm tra với Facebook” để xác thực từng dòng.');
}

// Nạp thẳng dữ liệu mẫu để thử luồng giao diện mà không cần file Excel.
// (Page/Post ID giả lập — dùng để test bảng, bộ lọc, ngăn chi tiết, CTA, lịch sử.
//  Khi bấm “Kiểm tra với Facebook”, server sẽ xác thực thật bằng tài khoản đang đăng nhập.)
function loadSampleData() {
  State.rows = buildSampleRows();
  clientPreCheck();
  revealTable('<strong>du-lieu-mau.xlsx</strong> · ' + State.rows.length +
    ' dòng · <span class="muted">dữ liệu mẫu để thử giao diện</span>');
  Logger.ok(`Nạp dữ liệu mẫu: ${State.rows.length} dòng.`);
  logPreCheck();
  toast(`Đã nạp ${State.rows.length} dòng dữ liệu mẫu`, 'ok');
}

// Dữ liệu mẫu — mỗi dòng minh hoạ một tình huống/loại khác nhau,
// bao trùm: boost bài viết, Traffic + website, CBO (cấp chiến dịch),
// ngân sách trọn đời, nút CTA tự điền, link pfbid không tách được, Page vanity, thiếu dữ liệu.
function buildSampleRows() {
  const raw = [
    { // 1) Boost bài viết · Tương tác · ngân sách hàng ngày, cấp nhóm · CTA mặc định (Thích Trang)
      pageLink: 'https://www.facebook.com/61550000000000',
      postLink: 'https://www.facebook.com/61550000000000/posts/1234567890', ctaLink: '', cta: '',
      campaignName: 'CD Tương tác T6', adsetName: 'Nhóm VN 25-45', adName: 'QC Bài viết A',
      campaignType: 'Tương tác', country: 'Việt Nam', budget: '200000',
      budgetMode: 'Hàng ngày', budgetLevel: 'Nhóm', startDate: '24/06/2026', endDate: '30/06/2026', statusRaw: 'Tạm dừng',
    },
    { // 2) Traffic + website · CBO (cấp chiến dịch) · CTA tự điền "Mua ngay"
      pageLink: 'https://www.facebook.com/61550000000000',
      postLink: '', ctaLink: 'https://shop.example.com/sale', cta: 'Mua ngay',
      campaignName: 'CD Traffic Sale', adsetName: 'Nhóm Web VN', adName: 'QC Web Sale',
      campaignType: 'Traffic', country: 'VN', budget: '500000',
      budgetMode: 'Hàng ngày', budgetLevel: 'Chiến dịch', startDate: '24/06/2026', endDate: '', statusRaw: 'Bật',
    },
    { // 3) Doanh số · ngân sách TRỌN ĐỜI (cần ngày kết thúc) · CTA tự điền SHOP_NOW
      pageLink: 'https://www.facebook.com/61550000000000',
      postLink: 'https://www.facebook.com/61550000000000/posts/2223334445', ctaLink: 'https://shop.example.com/vip', cta: 'SHOP_NOW',
      campaignName: 'CD Doanh số Hè', adsetName: 'Nhóm Mua hàng', adName: 'QC Sản phẩm',
      campaignType: 'Doanh số', country: 'VN', budget: '3000000',
      budgetMode: 'Trọn đời', budgetLevel: 'Nhóm', startDate: '24/06/2026', endDate: '30/06/2026', statusRaw: 'Bật',
    },
    { // 4) Tin nhắn · không có bài viết · CTA mặc định (Gửi tin nhắn)
      pageLink: 'https://www.facebook.com/61550000000000',
      postLink: '', ctaLink: '', cta: '',
      campaignName: 'CD Tin nhắn', adsetName: 'Nhóm Inbox', adName: 'QC Inbox',
      campaignType: 'Tin nhắn', country: 'VN', budget: '150000',
      budgetMode: 'Hàng ngày', budgetLevel: 'Nhóm', startDate: '24/06/2026', endDate: '', statusRaw: 'Bật',
    },
    { // 5) Tương tác · link pfbid không tách được ID (cảnh báo) · Page dạng tên (vanity)
      pageLink: 'https://www.facebook.com/tenshop',
      postLink: 'https://www.facebook.com/share/p/pfbid0abcXYZ/', ctaLink: '', cta: '',
      campaignName: 'CD Reel', adsetName: 'Nhóm Reel', adName: 'QC Reel',
      campaignType: 'Tương tác', country: 'VN,US', budget: '100000',
      budgetMode: 'Hàng ngày', budgetLevel: 'Nhóm', startDate: '24/06/2026', endDate: '', statusRaw: 'Tạm dừng',
    },
    { // 6) Thiếu dữ liệu — bỏ trống ngân sách (sẽ báo "Thiếu dữ liệu")
      pageLink: 'https://www.facebook.com/61550000000000',
      postLink: '', ctaLink: 'https://landing.example.com', cta: '',
      campaignName: 'CD Lead', adsetName: 'Nhóm Form', adName: 'QC Đăng ký',
      campaignType: 'Lead', country: 'VN', budget: '',
      budgetMode: 'Hàng ngày', budgetLevel: 'Nhóm', startDate: '24/06/2026', endDate: '', statusRaw: 'Bật',
    },
  ];
  return raw.map((r, i) => ({ index: i, status: 'pending', errors: [], warnings: [], parsed: {}, normalized: {}, ...r }));
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
  const url = tryUrl(raw);
  if (!url || !isFbHost(url)) return { id: null, error: 'Link Page không phải domain Facebook hợp lệ' };
  const pid = url.searchParams.get('id');
  if (pid && /^\d+$/.test(pid)) return { id: pid };
  const segs = url.pathname.split('/').filter(Boolean);
  if (segs[0] === 'pages' && segs.length >= 3 && /^\d+$/.test(segs[segs.length - 1])) return { id: segs[segs.length - 1] };
  const last = segs[segs.length - 1] || '';
  const dash = last.match(/-(\d{6,})$/);
  if (dash) return { id: dash[1] };
  if (segs.length === 1 && /^\d+$/.test(segs[0])) return { id: segs[0] };
  if (segs[0] === 'profile.php') return { id: null, error: 'Link profile thiếu id' };
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

function clientPreCheck() {
  const required = [['pageLink', 'link Page'], ['campaignName', 'tên chiến dịch'], ['adsetName', 'tên nhóm quảng cáo'],
    ['adName', 'tên quảng cáo'], ['campaignType', 'loại chiến dịch'], ['country', 'quốc gia'], ['budget', 'ngân sách']];
  State.rows.forEach((r) => {
    r.errors = [];
    r.warnings = [];
    clientParseRow(r); // tách Page ID / Post ID ngay để xem trước
    const missing = required.filter(([k]) => !r[k]).map(([, l]) => l);
    if (missing.length) { r.status = 'missing'; r.errors = missing.map((m) => 'Thiếu ' + m); }
    else r.status = 'pending';
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
// Dòng có khớp bộ lọc trạng thái + ô tìm kiếm hiện tại không
function rowMatchesFilter(r) {
  if (State.filter !== 'all' && r.status !== State.filter) return false;
  if (State.search) {
    const hay = `${r.campaignName} ${r.adsetName} ${r.adName}`.toLowerCase();
    if (!hay.includes(State.search)) return false;
  }
  return true;
}
function visibleRows() { return State.rows.filter(rowMatchesFilter); }
function selectedRows() { return State.rows.filter((r) => State.selected.has(r.index)); }

function renderTable() {
  const body = $('#tableBody');
  body.innerHTML = '';
  const rows = visibleRows();

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="8" class="loading">Không có dòng nào khớp bộ lọc.</td></tr>';
  }

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    const pageId = r.parsed?.pageId;
    const objId = r.parsed?.objectStoryId || r.parsed?.postId;
    const vanity = r.parsed?.pageVanity;
    const pageCell = pageId
      ? `<span class="cell-mono">${esc(pageId)}</span>`
      : (vanity
        ? `<span class="cell-mono empty" title="Tên vanity — cần đăng nhập để lấy ID số">@${esc(vanity)} · cần đăng nhập</span>`
        : '<span class="cell-mono empty">chưa có</span>');
    const hasErr = r.errors?.length;
    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" class="row-check"${State.selected.has(r.index) ? ' checked' : ''} /></td>
      <td><span class="badge ${r.status}">${STATUS_LABEL[r.status]}</span></td>
      <td class="col-names">
        <div class="cell-strong">${esc(r.campaignName || '—')}</div>
        <div class="cell-sub"><span class="k">Nhóm</span>${esc(r.adsetName || '—')}</div>
        <div class="cell-sub"><span class="k">QC</span>${esc(r.adName || '—')}</div>
      </td>
      <td class="col-type">${typeEditorHtml(r)}</td>
      <td class="col-cta">${ctaEditorHtml(r)}</td>
      <td class="col-ids">
        <div class="idline"><span class="k">Trang</span>${pageCell}</div>
        <div class="idline"><span class="k">Bài</span><span class="cell-mono ${objId ? '' : 'empty'}">${esc(objId || 'chưa có')}</span></div>
      </td>
      <td class="col-meta">
        <div class="cell-strong">${esc(r.budget || '—')}</div>
        <div class="cell-sub">${esc(budgetModeLabel(r))}</div>
        <div class="cell-sub"><span class="k">QG</span>${esc(r.country || '—')}</div>
      </td>
      <td class="col-actions">
        <button class="detail-btn ${hasErr ? 'has-err' : ''}" data-i="${r.index}">${hasErr ? 'Xem lỗi' : 'Chi tiết'}</button>
        <button class="row-del" title="Xoá dòng này">✕</button>
      </td>`;
    tr.querySelector('.detail-btn').addEventListener('click', () => openDrawer(r.index));
    tr.querySelector('.row-del').addEventListener('click', () => deleteRows([r]));
    const chk = tr.querySelector('.row-check');
    chk.addEventListener('change', () => {
      if (chk.checked) State.selected.add(r.index); else State.selected.delete(r.index);
      updateBulkBar();
    });
    wireRowEditors(tr, r);
    body.appendChild(tr);
  });

  updateCounts();
  updateReady();
  updateBulkBar();
}

function updateReady() {
  const ready = State.rows.filter((r) => r.status === 'valid').length;
  $('#readyCount').textContent = `${ready} dòng sẵn sàng`;
  $('#createBtn').disabled = ready === 0;
}

// ============================================================
//  Chọn nhiều dòng → sửa / xoá hàng loạt
// ============================================================
function updateBulkBar() {
  const n = selectedRows().length;
  const bar = $('#bulkBar');
  if (bar) {
    bar.classList.toggle('hidden', n === 0);
    $('#bulkCount').textContent = n;
    $('#bulkEditBtn').textContent = n > 1 ? `Sửa ${n} dòng` : 'Sửa';
    $('#bulkDelBtn').textContent = n > 1 ? `Xoá ${n} dòng` : 'Xoá';
  }
  // Đồng bộ checkbox "chọn tất cả" theo các dòng đang hiển thị
  const all = $('#checkAll');
  if (all) {
    const visible = visibleRows();
    const selVisible = visible.filter((r) => State.selected.has(r.index)).length;
    all.checked = visible.length > 0 && selVisible === visible.length;
    all.indeterminate = selVisible > 0 && selVisible < visible.length;
  }
}

function toggleSelectAll(checked) {
  visibleRows().forEach((r) => { if (checked) State.selected.add(r.index); else State.selected.delete(r.index); });
  renderTable();
}

function deleteRows(rows) {
  if (!rows.length) return;
  const idxs = new Set(rows.map((r) => r.index));
  State.rows = State.rows.filter((r) => !idxs.has(r.index));
  idxs.forEach((i) => State.selected.delete(i));
  renderTable();
  Logger.warn(`Đã xoá ${idxs.size} dòng.`);
  toast(`Đã xoá ${idxs.size} dòng`, 'ok');
}

// Sửa 1 hoặc nhiều dòng bằng cùng một biểu mẫu.
// - 1 dòng: điền sẵn giá trị hiện tại, lưu = ghi đè (cho phép để trống).
// - nhiều dòng: để trống = giữ nguyên; chỉ áp dụng ô có nhập.
function openEditRows(rows) {
  if (!rows.length) return;
  const single = rows.length === 1;
  const r0 = rows[0];
  const val = (x) => (single ? esc(x || '') : '');
  const ph = single ? '' : 'placeholder="(giữ nguyên)"';
  const curMode = budgetModeLabel(r0); // 'hàng ngày' | 'trọn đời'
  const modeOpts = single
    ? `<option value="Hàng ngày"${curMode === 'hàng ngày' ? ' selected' : ''}>Hàng ngày</option>
       <option value="Trọn đời"${curMode === 'trọn đời' ? ' selected' : ''}>Trọn đời</option>`
    : `<option value="">(giữ nguyên)</option><option value="Hàng ngày">Hàng ngày</option><option value="Trọn đời">Trọn đời</option>`;

  $('#modalTitle').textContent = single ? `Sửa dòng ${r0.index + 1}` : `Sửa ${rows.length} dòng đã chọn`;
  $('#modalBody').innerHTML = `
    <div class="edit-form">
      <label>Tên chiến dịch<input id="edCamp" type="text" value="${val(r0.campaignName)}" ${ph}></label>
      <label>Tên nhóm quảng cáo<input id="edAdset" type="text" value="${val(r0.adsetName)}" ${ph}></label>
      <label>Tên quảng cáo<input id="edAd" type="text" value="${val(r0.adName)}" ${ph}></label>
      <div class="edit-row">
        <label>Ngân sách<input id="edBudget" type="text" inputmode="numeric" value="${val(r0.budget)}" ${ph}></label>
        <label>Loại ngân sách<select id="edMode">${modeOpts}</select></label>
      </div>
      <div class="edit-row">
        <label>Ngày bắt đầu<input id="edStart" type="text" value="${val(r0.startDate)}" placeholder="dd/mm/yyyy"></label>
        <label>Ngày kết thúc<input id="edEnd" type="text" value="${val(r0.endDate)}" placeholder="dd/mm/yyyy"></label>
      </div>
      ${single ? '' : '<label class="edit-check"><input type="checkbox" id="edNumber"> Thêm số thứ tự vào cuối tên (1, 2, …) để tránh trùng tên</label>'}
    </div>`;
  const foot = $('#modalFoot');
  foot.innerHTML = '';
  foot.append(mkBtn('Huỷ', 'btn-ghost', closeModal),
    mkBtn('Lưu', 'btn-primary', () => applyEditRows(rows, single)));
  $('#modalScrim').classList.remove('hidden');
}

function applyEditRows(rows, single) {
  const camp = $('#edCamp').value.trim();
  const adset = $('#edAdset').value.trim();
  const ad = $('#edAd').value.trim();
  const budget = $('#edBudget').value.trim();
  const mode = $('#edMode').value; // '' = giữ nguyên
  const start = $('#edStart').value.trim();
  const end = $('#edEnd').value.trim();
  const number = !single && $('#edNumber')?.checked;

  rows.forEach((r, i) => {
    const sfx = number ? ' ' + (i + 1) : '';
    if (single) {
      r.campaignName = camp; r.adsetName = adset; r.adName = ad;
      r.budget = budget; r.startDate = start; r.endDate = end;
      if (mode) r.budgetMode = mode;
    } else {
      if (camp) r.campaignName = camp + sfx;
      if (adset) r.adsetName = adset + sfx;
      if (ad) r.adName = ad + sfx;
      if (budget) r.budget = budget;
      if (mode) r.budgetMode = mode;
      if (start) r.startDate = start;
      if (end) r.endDate = end;
    }
  });
  closeModal();
  renderTable();
  Logger.ok(single ? `Đã sửa dòng ${rows[0].index + 1}.` : `Đã sửa ${rows.length} dòng.`);
  toast(single ? 'Đã lưu thay đổi' : `Đã sửa ${rows.length} dòng`, 'ok');
}

// Gắn sự kiện cho ô chọn Mục tiêu + sửa nút CTA + Link CTA trong một dòng.
// Sửa trực tiếp vào State.rows nên giá trị mới sẽ được gửi đi khi Kiểm tra / Tạo.
function wireRowEditors(tr, r) {
  const typeSel = tr.querySelector('.type-select');
  const cell = tr.querySelector('.cta-cell');
  const ctaSel = cell?.querySelector('.cta-select');
  const linkEl = cell?.querySelector('.cta-link-input');

  // Cập nhật pill xem trước + ẩn/hiện ô Link theo nút CTA hiện tại
  const refreshCta = () => {
    if (!cell) return;
    cell.querySelector('.cta-preview').innerHTML = ctaPillHtml(r);
    if (linkEl) linkEl.classList.toggle('hidden', !ctaUsesLink(r));
  };

  typeSel?.addEventListener('change', () => {
    r.campaignType = typeSel.value ? TYPE_LABELS[typeSel.value] : '';
    refreshCta(); // nút CTA mặc định + ô Link thay đổi theo mục tiêu
    Logger.info(`Dòng ${r.index + 1}: mục tiêu → ${r.campaignType || '—'}.`);
  });

  ctaSel?.addEventListener('change', () => {
    r.cta = ctaSel.value; // '' = mặc định theo mục tiêu; ngược lại là mã CTA
    refreshCta();
    const c = ctaForRow(r);
    Logger.info(`Dòng ${r.index + 1}: nút CTA → ${c ? c.label : 'mặc định theo mục tiêu'}.`);
  });

  linkEl?.addEventListener('change', () => {
    const v = linkEl.value.trim();
    if (v === (r.ctaLink || '')) return;
    r.ctaLink = v;
    Logger.info(`Dòng ${r.index + 1}: ${v ? 'cập nhật' : 'xoá'} Link CTA.`);
  });
}

// ============================================================
//  Ngăn chi tiết
// ============================================================
function openDrawer(index) {
  const r = State.rows.find((x) => x.index === index);
  if (!r) return;
  $('#drawerTitle').textContent = `Dòng ${index + 1} · ${STATUS_LABEL[r.status]}`;
  const ids = r.ids || {};
  const body = $('#drawerBody');
  body.innerHTML = `
    <div class="section-label">Dữ liệu</div>
    <dl class="dl">
      <dt>Chiến dịch</dt><dd>${esc(r.campaignName || '—')}</dd>
      <dt>Nhóm QC</dt><dd>${esc(r.adsetName || '—')}</dd>
      <dt>Quảng cáo</dt><dd>${esc(r.adName || '—')}</dd>
      <dt>Mục tiêu</dt><dd>${esc(typeLabel(r))}</dd>
      <dt>Nút CTA</dt><dd>${ctaPillHtml(r, true)}</dd>
      <dt>Link CTA</dt><dd>${r.ctaLink
        ? `<a href="${esc(r.ctaLink)}" target="_blank" rel="noopener noreferrer">${esc(r.ctaLink)}</a>`
        : '—'}</dd>
      <dt>Quốc gia</dt><dd>${esc(r.country || '—')}</dd>
      <dt>Ngân sách</dt><dd>${esc(r.budget || '—')} · ${budgetModeLabel(r)} · ${budgetLevelLabel(r)}</dd>
      <dt>Page ID</dt><dd class="mono">${esc(r.parsed?.pageId || '—')}</dd>
      <dt>Object ID</dt><dd class="mono">${esc(r.parsed?.objectStoryId || r.parsed?.postId || '—')}</dd>
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
    const payload = { rows: State.rows.map(stripForSend) };
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
  const go = mkBtn(draft ? 'Tạo bản nháp' : 'Tạo & chạy', 'btn-primary', () => runCreate(ready, draft));
  foot.append(cancel, go);
  $('#modalScrim').classList.remove('hidden');
}

async function runCreate(rows, draft) {
  const btn = $('#createBtn');
  btn.disabled = true; btn.textContent = 'Đang tạo…';
  const total = rows.length;
  showCreateProgress(total, draft);
  Logger.info(`Bắt đầu tạo ${total} quảng cáo · chế độ ${draft ? 'NHÁP (PAUSED)' : 'CHẠY'}.`);
  try {
    const payload = {
      adAccountId: State.selectedAccount.id,
      currency: State.selectedAccount.currency,
      draftMode: draft,
      rows: rows.map(stripForSend),
    };
    const { results } = await api('/api/ads/create', { method: 'POST', body: payload });

    // Backend tạo theo lô và trả kết quả một lần — tô từng đoạn theo kết quả để thấy được tiến trình.
    $('#cpTrack')?.classList.remove('indeterminate');
    const ordered = [...results].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    let ok = 0, fail = 0;
    for (let i = 0; i < ordered.length; i++) {
      const res = ordered[i];
      const r = State.rows.find((x) => x.index === res.index);
      if (r) {
        r.status = res.status;
        r.errors = res.errors?.length ? res.errors : r.errors;
        r.ids = res.ids;
      }
      const success = res.status === 'created';
      if (success) {
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
        type: typeLabel(r || {}),
        cta: ctaForRow(r || {})?.code || '',
        account: State.selectedAccount?.name || '',
        draft,
        status: res.status,
        ids: res.ids || {},
        error: res.errors?.[0] || '',
      });
      addProgressSeg(success, total);
      updateCreateMeta(i + 1, total, ok, fail);
      updateCreateCurrent(`${success ? '✓' : '✗'} Dòng ${res.index + 1}: ${r?.campaignName || '—'}`, !success);
      await delay(80);
    }
    Logger.add(`Kết quả tạo: ${ok} thành công, ${fail} lỗi.`, fail ? 'warn' : 'ok');
    renderTable();
    setStep(4);
    await delay(450);
    showResults(results, draft);
  } catch (err) {
    Logger.err(`Tạo hàng loạt thất bại: ${err.message}`);
    toast(err.message, 'err');
    closeModal();
  } finally {
    btn.disabled = false; btn.textContent = 'Tạo hàng loạt';
  }
}

// ---- Thanh tiến trình tạo hàng loạt (hiển thị trong modal) ----
function showCreateProgress(total, draft) {
  $('#modalTitle').textContent = 'Đang tạo quảng cáo…';
  $('#modalBody').innerHTML = `
    <p>Đang tạo <strong>${total}</strong> quảng cáo · chế độ
       <strong>${draft ? 'nháp (PAUSED)' : 'chạy'}</strong>. Vui lòng đợi…</p>
    <div class="progress-wrap">
      <div class="progress-track indeterminate" id="cpTrack"></div>
      <div class="progress-meta">
        <span id="cpCount">0/${total}</span>
        <span><span class="cp-ok" id="cpOk">0</span> ✓ &nbsp;·&nbsp; <span class="cp-fail" id="cpFail">0</span> ✗</span>
      </div>
      <div class="progress-current" id="cpCurrent">Đang gửi yêu cầu tạo tới Facebook…</div>
    </div>`;
  $('#modalFoot').innerHTML = '';
  $('#modalScrim').classList.remove('hidden');
}

function addProgressSeg(success, total) {
  const track = $('#cpTrack');
  if (!track) return;
  const seg = document.createElement('div');
  seg.className = 'progress-seg ' + (success ? 'ok' : 'err');
  seg.style.width = (100 / total) + '%';
  track.appendChild(seg);
}

function updateCreateMeta(done, total, ok, fail) {
  if ($('#cpCount')) $('#cpCount').textContent = `${done}/${total}`;
  if ($('#cpOk')) $('#cpOk').textContent = ok;
  if ($('#cpFail')) $('#cpFail').textContent = fail;
}

function updateCreateCurrent(text, isErr = false) {
  const el = $('#cpCurrent');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('err', isErr);
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

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
