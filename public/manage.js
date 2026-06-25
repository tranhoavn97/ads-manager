'use strict';

// ============================================================
//  Tab QUẢN LÝ — Ads Manager thu gọn
//  Dùng chung các tiện ích toàn cục từ app.js: $, $$, State, api, esc, toast, Logger
//  Đọc cây Campaign → Ad Set → Ad kèm insights, bật/tắt, sửa, nhân bản, xoá.
// ============================================================

const Manage = {
  campaigns: [],
  adsets: [],
  ads: [],
  expanded: new Set(),
  filter: 'all',
  search: '',
  datePreset: 'last_30d',
  loading: false,

  async load() {
    const acc = State.selectedAccount;
    if (!acc) return;
    this.loading = true;
    this.renderLoading();
    try {
      const data = await api(
        `/api/manage/overview?adAccountId=${encodeURIComponent(acc.id)}` +
        `&datePreset=${encodeURIComponent(this.datePreset)}&currency=${encodeURIComponent(acc.currency || '')}`
      );
      this.campaigns = data.campaigns || [];
      this.adsets = data.adsets || [];
      this.ads = data.ads || [];
      Logger.ok(`Tải dữ liệu quản lý: ${this.campaigns.length} chiến dịch, ${this.adsets.length} nhóm, ${this.ads.length} quảng cáo.`);
      this.render();
    } catch (err) {
      $('#treeBody').innerHTML = `<tr><td colspan="12"><div class="alert alert-error" style="margin:14px">${esc(err.message)}</div></td></tr>`;
      $('#manageSummary').innerHTML = '';
    } finally {
      this.loading = false;
    }
  },

  renderLoading() {
    $('#treeBody').innerHTML = '<tr><td colspan="12" class="loading">Đang tải dữ liệu từ Facebook…</td></tr>';
    $('#manageSummary').innerHTML = '';
  },

  // ---- Lọc + tìm kiếm ----
  childAdsets(campaignId) { return this.adsets.filter((a) => a.campaignId === campaignId); },
  childAds(adsetId) { return this.ads.filter((a) => a.adsetId === adsetId); },

  matchesSearch(c) {
    if (!this.search) return true;
    const q = this.search;
    if ((c.name || '').toLowerCase().includes(q)) return true;
    const sets = this.childAdsets(c.id);
    if (sets.some((s) => (s.name || '').toLowerCase().includes(q))) return true;
    const setIds = new Set(sets.map((s) => s.id));
    if (this.ads.some((a) => setIds.has(a.adsetId) && (a.name || '').toLowerCase().includes(q))) return true;
    return false;
  },

  matchesFilter(c) {
    if (this.filter === 'all') return true;
    if (this.filter === 'active') return c.status === 'ACTIVE';
    if (this.filter === 'paused') return c.status === 'PAUSED';
    if (this.filter === 'issues') return ISSUE_STATUSES.has(c.effectiveStatus);
    return true;
  },

  visibleCampaigns() {
    return this.campaigns.filter((c) => this.matchesFilter(c) && this.matchesSearch(c));
  },

  render() {
    this.renderFilters();
    this.renderSummary();
    const body = $('#treeBody');
    const list = this.visibleCampaigns();
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="12" class="loading">${this.campaigns.length ? 'Không có chiến dịch nào khớp bộ lọc.' : 'Tài khoản chưa có chiến dịch nào.'}</td></tr>`;
      return;
    }
    let html = '';
    for (const c of list) {
      html += rowCampaign(c, this.expanded.has(c.id));
      if (this.expanded.has(c.id)) {
        const sets = this.childAdsets(c.id);
        if (!sets.length) html += emptyChildRow('Chưa có nhóm quảng cáo.');
        for (const s of sets) {
          html += rowAdSet(s, this.expanded.has(s.id), c);
          if (this.expanded.has(s.id)) {
            const ads = this.childAds(s.id);
            if (!ads.length) html += emptyChildRow('Chưa có quảng cáo.');
            for (const a of ads) html += rowAd(a);
          }
        }
      }
    }
    body.innerHTML = html;
    this.bindRows();
  },

  renderFilters() {
    const counts = {
      all: this.campaigns.length,
      active: this.campaigns.filter((c) => c.status === 'ACTIVE').length,
      paused: this.campaigns.filter((c) => c.status === 'PAUSED').length,
      issues: this.campaigns.filter((c) => ISSUE_STATUSES.has(c.effectiveStatus)).length,
    };
    const labels = { all: 'Tất cả', active: 'Đang chạy', paused: 'Tạm dừng', issues: 'Có vấn đề' };
    const wrap = $('#manageFilters');
    wrap.innerHTML = '';
    ['all', 'active', 'paused', 'issues'].forEach((k) => {
      const btn = document.createElement('button');
      btn.className = 'fchip mg-' + k + (this.filter === k ? ' active' : '');
      btn.innerHTML = `${labels[k]} <span class="cnt">${counts[k]}</span>`;
      btn.addEventListener('click', () => { this.filter = k; this.render(); });
      wrap.appendChild(btn);
    });
  },

  renderSummary() {
    const acc = State.selectedAccount;
    const cur = acc?.currency || '';
    let spend = 0, impr = 0, clicks = 0, results = 0;
    for (const c of this.campaigns) {
      if (c.insights) { spend += c.insights.spend; impr += c.insights.impressions; clicks += c.insights.clicks; results += c.insights.results; }
    }
    const active = this.campaigns.filter((c) => c.status === 'ACTIVE').length;
    $('#manageSummary').innerHTML = `
      <div class="sum-pill"><span class="l">Tổng chi tiêu</span><span class="v">${fmtMoney(spend, cur)}</span></div>
      <div class="sum-pill"><span class="l">Hiển thị</span><span class="v">${fmtNum(impr)}</span></div>
      <div class="sum-pill"><span class="l">Lượt click</span><span class="v">${fmtNum(clicks)}</span></div>
      <div class="sum-pill"><span class="l">Kết quả</span><span class="v">${fmtNum(results)}</span></div>
      <div class="sum-pill"><span class="l">Đang chạy</span><span class="v">${active}/${this.campaigns.length}</span></div>`;
  },

  // ---- Gắn sự kiện cho các dòng vừa render ----
  bindRows() {
    const body = $('#treeBody');
    // Mở/đóng nhánh
    body.querySelectorAll('[data-caret]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.caret;
        if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
        this.render();
      });
    });
    // Bật/tắt
    body.querySelectorAll('.mg-toggle input').forEach((el) => {
      el.addEventListener('change', () => this.toggleStatus(el));
    });
    // Nút thao tác
    body.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', () => this.doAction(el.dataset.act, el.dataset.id, el.dataset.level));
    });
  },

  node(level, id) {
    const arr = level === 'campaign' ? this.campaigns : level === 'adset' ? this.adsets : this.ads;
    return arr.find((x) => x.id === id);
  },

  async toggleStatus(el) {
    const id = el.dataset.id, level = el.dataset.level;
    const node = this.node(level, id);
    const next = el.checked ? 'ACTIVE' : 'PAUSED';
    el.disabled = true;
    try {
      await api('/api/manage/status', { method: 'POST', body: { id, status: next } });
      if (node) { node.status = next; node.effectiveStatus = next; }
      Logger.ok(`${LEVEL_VI[level]} ${id}: ${next === 'ACTIVE' ? 'đã bật' : 'đã tạm dừng'}.`);
      toast(next === 'ACTIVE' ? 'Đã bật' : 'Đã tạm dừng', 'ok');
      this.render();
    } catch (err) {
      el.checked = !el.checked; // hoàn tác
      toast(err.message, 'err');
    } finally {
      el.disabled = false;
    }
  },

  doAction(act, id, level) {
    const node = this.node(level, id);
    if (!node) return;
    if (act === 'rename') return this.renameDialog(node, level);
    if (act === 'budget') return this.budgetDialog(node, level);
    if (act === 'duplicate') return this.duplicate(node, level);
    if (act === 'delete') return this.deleteNode(node, level);
  },

  renameDialog(node, level) {
    mModal(`Đổi tên ${LEVEL_VI[level]}`, `
      <label class="mfield">Tên mới
        <input type="text" id="mRename" class="input-inline" value="${esc(node.name || '')}" />
      </label>`, async () => {
      const name = $('#mRename').value.trim();
      if (!name) return toast('Tên không được trống', 'err');
      await api('/api/manage/rename', { method: 'POST', body: { id: node.id, name } });
      node.name = name;
      closeModal(); this.render();
      Logger.ok(`Đã đổi tên ${LEVEL_VI[level]} → ${name}`);
      toast('Đã đổi tên', 'ok');
    });
    setTimeout(() => $('#mRename')?.focus(), 50);
  },

  budgetDialog(node, level) {
    const cur = State.selectedAccount?.currency || '';
    const isLifetime = node.lifetimeBudget != null && node.dailyBudget == null;
    const current = node.dailyBudget ?? node.lifetimeBudget ?? '';
    mModal(`Sửa ngân sách ${LEVEL_VI[level]}`, `
      <label class="mfield">Loại ngân sách
        <select id="mBudgetType" class="ctrl-select" style="width:100%">
          <option value="daily" ${!isLifetime ? 'selected' : ''}>Hàng ngày</option>
          <option value="lifetime" ${isLifetime ? 'selected' : ''}>Trọn đời</option>
        </select>
      </label>
      <label class="mfield">Số tiền (${esc(cur)})
        <input type="number" id="mBudget" class="input-inline" min="0" step="1000" value="${esc(current)}" />
      </label>
      <p class="muted" style="font-size:12.5px">Lưu ý: chỉ sửa được cấp đang giữ ngân sách (CBO ở chiến dịch hoặc ABO ở nhóm).</p>`, async () => {
      const amount = Number($('#mBudget').value);
      const budgetType = $('#mBudgetType').value;
      if (!amount || amount <= 0) return toast('Ngân sách không hợp lệ', 'err');
      await api('/api/manage/budget', { method: 'POST', body: { id: node.id, budgetType, amount, currency: cur } });
      if (budgetType === 'lifetime') { node.lifetimeBudget = amount; node.dailyBudget = null; }
      else { node.dailyBudget = amount; node.lifetimeBudget = null; }
      closeModal(); this.render();
      Logger.ok(`Đã cập nhật ngân sách ${LEVEL_VI[level]} ${node.id}`);
      toast('Đã cập nhật ngân sách', 'ok');
    });
  },

  duplicate(node, level) {
    mModal(`Nhân bản ${LEVEL_VI[level]}`, `
      <p>Tạo một bản sao của <strong>${esc(node.name || '')}</strong>?</p>
      <p class="muted" style="font-size:12.5px">Bản sao sẽ được tạo ở trạng thái <strong>Tạm dừng</strong> để bạn kiểm tra trước.</p>`,
      async () => {
        await api('/api/manage/duplicate', { method: 'POST', body: { id: node.id, level } });
        closeModal();
        Logger.ok(`Đã nhân bản ${LEVEL_VI[level]} ${node.id}. Đang tải lại…`);
        toast('Đã nhân bản — đang tải lại', 'ok');
        this.load();
      }, 'Nhân bản');
  },

  deleteNode(node, level) {
    mModal(`Xoá ${LEVEL_VI[level]}`, `
      <p>Bạn chắc chắn muốn xoá <strong>${esc(node.name || '')}</strong>?</p>
      <p class="muted" style="font-size:12.5px">Hành động này không thể hoàn tác. Mọi mục con bên dưới cũng sẽ bị xoá.</p>`,
      async () => {
        await api('/api/manage/delete', { method: 'POST', body: { id: node.id } });
        closeModal();
        // Gỡ khỏi state cục bộ
        if (level === 'campaign') {
          this.campaigns = this.campaigns.filter((x) => x.id !== node.id);
          const setIds = new Set(this.adsets.filter((s) => s.campaignId === node.id).map((s) => s.id));
          this.adsets = this.adsets.filter((s) => s.campaignId !== node.id);
          this.ads = this.ads.filter((a) => !setIds.has(a.adsetId));
        } else if (level === 'adset') {
          this.adsets = this.adsets.filter((x) => x.id !== node.id);
          this.ads = this.ads.filter((a) => a.adsetId !== node.id);
        } else {
          this.ads = this.ads.filter((x) => x.id !== node.id);
        }
        this.render();
        Logger.warn(`Đã xoá ${LEVEL_VI[level]} ${node.id}`);
        toast('Đã xoá', 'ok');
      }, 'Xoá', true);
  },
};

// ============================================================
//  Hằng số & tiện ích hiển thị
// ============================================================
const LEVEL_VI = { campaign: 'chiến dịch', adset: 'nhóm quảng cáo', ad: 'quảng cáo' };
const ISSUE_STATUSES = new Set([
  'WITH_ISSUES', 'DISAPPROVED', 'PENDING_REVIEW', 'PENDING_BILLING_INFO',
  'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'AD_PAUSED', 'IN_PROCESS',
]);
const EFFECTIVE_VI = {
  ACTIVE: ['Đang chạy', 'ok'],
  PAUSED: ['Tạm dừng', 'paused'],
  DELETED: ['Đã xoá', 'bad'],
  ARCHIVED: ['Lưu trữ', 'paused'],
  IN_PROCESS: ['Đang xử lý', 'warn'],
  WITH_ISSUES: ['Có vấn đề', 'bad'],
  DISAPPROVED: ['Bị từ chối', 'bad'],
  PENDING_REVIEW: ['Chờ duyệt', 'warn'],
  PENDING_BILLING_INFO: ['Chờ thanh toán', 'warn'],
  CAMPAIGN_PAUSED: ['Chiến dịch tạm dừng', 'paused'],
  ADSET_PAUSED: ['Nhóm tạm dừng', 'paused'],
  AD_PAUSED: ['QC tạm dừng', 'paused'],
};

const _moneyFmt = {};
function fmtMoney(v, currency) {
  if (v == null) return '—';
  try {
    const key = currency || 'USD';
    _moneyFmt[key] = _moneyFmt[key] || new Intl.NumberFormat('vi-VN', { style: 'currency', currency: key, maximumFractionDigits: 0 });
    return _moneyFmt[key].format(v);
  } catch { return fmtNum(v) + ' ' + (currency || ''); }
}
function fmtNum(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v)));
}
function fmtPct(v) { return v == null ? '—' : Number(v).toFixed(2) + '%'; }

function statusBadge(node) {
  const [label, cls] = EFFECTIVE_VI[node.effectiveStatus] || [node.effectiveStatus || '—', 'paused'];
  return `<span class="mg-badge ${cls}">${esc(label)}</span>`;
}

function toggleHtml(node, level) {
  const on = node.status === 'ACTIVE';
  return `<label class="mg-toggle" title="${on ? 'Đang bật' : 'Đang tắt'}">
    <input type="checkbox" ${on ? 'checked' : ''} data-id="${esc(node.id)}" data-level="${level}">
    <span class="mtrack"><span class="mthumb"></span></span>
  </label>`;
}

function budgetCell(node) {
  if (node.dailyBudget != null) return `<div class="cell-strong">${fmtMoney(node.dailyBudget, State.selectedAccount?.currency)}</div><div class="cell-sub">/ ngày</div>`;
  if (node.lifetimeBudget != null) return `<div class="cell-strong">${fmtMoney(node.lifetimeBudget, State.selectedAccount?.currency)}</div><div class="cell-sub">trọn đời</div>`;
  return '<span class="muted">—</span>';
}

function insightCells(node) {
  const cur = State.selectedAccount?.currency;
  const i = node.insights;
  if (!i) return `<td class="num muted">—</td><td class="num muted">—</td><td class="num muted">—</td><td class="num muted">—</td><td class="num muted">—</td><td class="num muted">—</td><td class="num muted">—</td>`;
  return `
    <td class="num">${fmtMoney(i.spend, cur)}</td>
    <td class="num">${fmtNum(i.impressions)}</td>
    <td class="num">${fmtNum(i.reach)}</td>
    <td class="num">${fmtNum(i.clicks)}</td>
    <td class="num">${fmtPct(i.ctr)}</td>
    <td class="num">${i.cpm != null ? fmtMoney(i.cpm, cur) : '—'}</td>
    <td class="num">${fmtNum(i.results)}</td>`;
}

function actionBtns(node, level) {
  const b = (act, label, title) => `<button class="mg-actbtn" data-act="${act}" data-id="${esc(node.id)}" data-level="${level}" title="${title}">${label}</button>`;
  let html = b('rename', '✎', 'Đổi tên');
  if (level !== 'ad') html += b('budget', '₫', 'Sửa ngân sách');
  html += b('duplicate', '⧉', 'Nhân bản');
  html += b('delete', '🗑', 'Xoá');
  return `<div class="mg-acts">${html}</div>`;
}

function caret(id, expanded, has) {
  if (!has) return '<span class="mg-caret empty"></span>';
  return `<span class="mg-caret ${expanded ? 'open' : ''}" data-caret="${esc(id)}">▶</span>`;
}

function rowCampaign(c, expanded) {
  const has = Manage.childAdsets(c.id).length > 0;
  return `<tr class="mg-row lvl-campaign">
    <td class="col-toggle">${toggleHtml(c, 'campaign')}</td>
    <td class="col-name">
      <div class="mg-namewrap">
        ${caret(c.id, expanded, has)}
        <div>
          <div class="mg-name">${esc(c.name || '—')}</div>
          <div class="cell-sub">Chiến dịch · ${esc(c.objective || '')}</div>
        </div>
      </div>
    </td>
    <td>${statusBadge(c)}</td>
    <td class="num">${budgetCell(c)}</td>
    ${insightCells(c)}
    <td class="col-act">${actionBtns(c, 'campaign')}</td>
  </tr>`;
}

function rowAdSet(s, expanded, parent) {
  const has = Manage.childAds(s.id).length > 0;
  return `<tr class="mg-row lvl-adset">
    <td class="col-toggle">${toggleHtml(s, 'adset')}</td>
    <td class="col-name">
      <div class="mg-namewrap indent-1">
        ${caret(s.id, expanded, has)}
        <div>
          <div class="mg-name">${esc(s.name || '—')}</div>
          <div class="cell-sub">Nhóm QC · ${esc(s.optimizationGoal || '')}</div>
        </div>
      </div>
    </td>
    <td>${statusBadge(s)}</td>
    <td class="num">${budgetCell(s)}</td>
    ${insightCells(s)}
    <td class="col-act">${actionBtns(s, 'adset')}</td>
  </tr>`;
}

function rowAd(a) {
  const thumb = a.thumbnail ? `<img class="mg-thumb" src="${esc(a.thumbnail)}" alt="" loading="lazy">` : '<span class="mg-thumb empty"></span>';
  return `<tr class="mg-row lvl-ad">
    <td class="col-toggle">${toggleHtml(a, 'ad')}</td>
    <td class="col-name">
      <div class="mg-namewrap indent-2">
        <span class="mg-caret empty"></span>
        ${thumb}
        <div>
          <div class="mg-name">${esc(a.name || '—')}</div>
          <div class="cell-sub">Quảng cáo</div>
        </div>
      </div>
    </td>
    <td>${statusBadge(a)}</td>
    <td class="num"><span class="muted">—</span></td>
    ${insightCells(a)}
    <td class="col-act">${actionBtns(a, 'ad')}</td>
  </tr>`;
}

function emptyChildRow(text) {
  return `<tr class="mg-row mg-empty-child"><td></td><td colspan="11" class="cell-sub" style="padding-left:48px">${esc(text)}</td></tr>`;
}

// ---- Modal nhỏ dùng lại #modalScrim của app ----
function mModal(title, bodyHtml, onConfirm, confirmLabel = 'Lưu', danger = false) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  const foot = $('#modalFoot');
  foot.innerHTML = '';
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost'; cancel.textContent = 'Huỷ';
  cancel.addEventListener('click', closeModal);
  const ok = document.createElement('button');
  ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
  ok.textContent = confirmLabel;
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    try { await onConfirm(); }
    catch (err) { toast(err.message, 'err'); }
    finally { ok.disabled = false; }
  });
  foot.append(cancel, ok);
  $('#modalScrim').classList.remove('hidden');
}

// ============================================================
//  Sự kiện toolbar tab Quản lý
// ============================================================
(function bindManageToolbar() {
  $('#manageRefresh')?.addEventListener('click', () => Manage.load());
  $('#datePreset')?.addEventListener('change', (e) => { Manage.datePreset = e.target.value; Manage.load(); });
  $('#manageSearch')?.addEventListener('input', (e) => { Manage.search = e.target.value.trim().toLowerCase(); Manage.render(); });
})();
