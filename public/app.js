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
  const override = resolveCtaCode(row?.cta);
  if (override) return { code: override, label: CTA_LABELS[override] || override, custom: true };
  const id = resolveTypeId(row?.campaignType);
  if (id) { const code = TYPE_DEFAULT_CTA[id]; return { code, label: CTA_LABELS[code] || code, custom: false }; }
  return null;
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
  $('#fileInput').addEventListener('change', (e) => handleFile(e.target.files[0]));
  $('#validateBtn').addEventListener('click', validateRows);
  $('#createBtn').addEventListener('click', confirmCreate);
  $('#searchInput').addEventListener('input', (e) => { State.search = e.target.value.trim().toLowerCase(); renderTable(); });
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerScrim').addEventListener('click', closeDrawer);

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
  ['pageLink', ['link page', 'page', 'trang', 'link trang']],
  ['postLink', ['link bai viet', 'bai viet', 'reel', 'anh', 'post', 'link bai', 'bai/reel']],
  ['cta', ['nut cta', 'nut keu goi', 'keu goi', 'call to action', 'cta button', 'nut hanh dong']],
  ['ctaLink', ['cta', 'website', 'link dich', 'url', 'link den', 'link cta']],
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
function clientPreCheck() {
  const required = [['pageLink', 'link Page'], ['campaignName', 'tên chiến dịch'], ['adsetName', 'tên nhóm quảng cáo'],
    ['adName', 'tên quảng cáo'], ['campaignType', 'loại chiến dịch'], ['country', 'quốc gia'], ['budget', 'ngân sách']];
  State.rows.forEach((r) => {
    r.errors = [];
    const missing = required.filter(([k]) => !r[k]).map(([, l]) => l);
    if (missing.length) { r.status = 'missing'; r.errors = missing.map((m) => 'Thiếu ' + m); }
    else r.status = 'pending';
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
    const pageId = r.parsed?.pageId;
    const objId = r.parsed?.objectStoryId || r.parsed?.postId;
    const hasErr = r.errors?.length;
    tr.innerHTML = `
      <td><span class="badge ${r.status}">${STATUS_LABEL[r.status]}</span></td>
      <td><div class="cell-strong">${esc(r.campaignName || '—')}</div></td>
      <td><div class="cell-strong">${esc(r.adsetName || '—')}</div><div class="cell-sub">${esc(r.adName || '')}</div></td>
      <td>${esc(r.campaignType || '—')}</td>
      <td>${ctaPillHtml(r)}</td>
      <td><span class="cell-mono ${pageId ? '' : 'empty'}">${esc(pageId || 'chưa có')}</span></td>
      <td><span class="cell-mono ${objId ? '' : 'empty'}">${esc(objId || 'chưa có')}</span></td>
      <td>${esc(r.country || '—')}</td>
      <td>${esc(r.budget || '—')}</td>
      <td><button class="detail-btn ${hasErr ? 'has-err' : ''}" data-i="${r.index}">${hasErr ? 'Xem lỗi' : 'Chi tiết'}</button></td>`;
    tr.querySelector('.detail-btn').addEventListener('click', () => openDrawer(r.index));
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
  const body = $('#drawerBody');
  body.innerHTML = `
    <div class="section-label">Dữ liệu</div>
    <dl class="dl">
      <dt>Chiến dịch</dt><dd>${esc(r.campaignName || '—')}</dd>
      <dt>Nhóm QC</dt><dd>${esc(r.adsetName || '—')}</dd>
      <dt>Quảng cáo</dt><dd>${esc(r.adName || '—')}</dd>
      <dt>Loại</dt><dd>${esc(r.campaignType || '—')}</dd>
      <dt>Nút CTA</dt><dd>${ctaPillHtml(r, true)}</dd>
      <dt>Quốc gia</dt><dd>${esc(r.country || '—')}</dd>
      <dt>Ngân sách</dt><dd>${esc(r.budget || '—')}</dd>
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
    'Tên quảng cáo', 'Loại chiến dịch', 'Nút CTA', 'Quốc gia', 'Ngân sách', 'Ngày bắt đầu', 'Ngày kết thúc', 'Trạng thái'];
  // Cột "Nút CTA": để trống = tự suy theo loại; hoặc điền nhãn/mã (vd: Mua ngay, Tìm hiểu thêm, LEARN_MORE).
  const sample = [
    'https://www.facebook.com/61550000000000', 'https://www.facebook.com/61550000000000/posts/1234567890', '',
    'CD Tương tác T6', 'Nhóm VN 25-45', 'QC Bài viết A', 'Tương tác', '', 'Việt Nam', '200000', '24/06/2026', '30/06/2026', 'Tạm dừng'];
  const sample2 = [
    'https://www.facebook.com/61550000000000', '', 'https://shop.example.com/sale', 'CD Traffic Sale',
    'Nhóm Web VN', 'QC Web Sale', 'Traffic', 'Mua ngay', 'VN', '500000', '24/06/2026', '', 'Bật'];
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
