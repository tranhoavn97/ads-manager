'use strict';

(function () {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])));

  const state = {
    campaigns: [],
    adsets: [],
    pages: [],
    posts: [],
    selectedCampaignId: '',
    selectedPageId: '',
    selectedPosts: new Map(),
    loadedPages: false,
  };

  async function apiJson(url, opts = {}) {
    const method = opts.method || 'GET';
    logInfo(`${method} ${url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 45000);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data.error || `Lỗi máy chủ (${res.status})`);
      logOk(`${res.status} ${url}`);
      return data;
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Request quá lâu, vui lòng thử lại ít dữ liệu hơn.' : err.message;
      logErr(msg);
      throw new Error(msg);
    } finally {
      clearTimeout(timer);
    }
  }

  function logInfo(msg) { window.Logger?.info?.(`Tạo từ chiến dịch: ${msg}`); }
  function logOk(msg) { window.Logger?.ok?.(`Tạo từ chiến dịch: ${msg}`); }
  function logWarn(msg) { window.Logger?.warn?.(`Tạo từ chiến dịch: ${msg}`); }
  function logErr(msg) { window.Logger?.err?.(`Tạo từ chiến dịch: ${msg}`); }

  function account() {
    return window.State?.selectedAccount || null;
  }

  function selectedCampaign() {
    return state.campaigns.find((c) => String(c.id) === String(state.selectedCampaignId));
  }

  function selectedPage() {
    return state.pages.find((p) => String(p.id) === String(state.selectedPageId));
  }

  function accountInfo() {
    const acc = account();
    const box = $('#cbAccountInfo');
    if (!box) return;
    box.innerHTML = acc
      ? `<strong>${esc(acc.name)}</strong><div class="cb-meta">${esc(acc.id)} · ${esc(acc.currency || '')} · ${esc(acc.statusLabel || '')}</div>`
      : 'Chọn tài khoản quảng cáo ở thanh bên trái.';
  }

  async function loadAll() {
    await Promise.all([loadCampaigns(), loadPages(false)]);
  }

  async function loadCampaigns() {
    const acc = account();
    const wrap = $('#cbCampaigns');
    if (!wrap) return;
    if (!acc) {
      wrap.innerHTML = '<div class="loading">Hãy chọn tài khoản quảng cáo.</div>';
      return;
    }
    wrap.innerHTML = '<div class="loading">Đang tải chiến dịch...</div>';
    state.selectedCampaignId = '';
    state.adsets = [];
    try {
      const data = await apiJson(`/api/campaigns?adAccountId=${encodeURIComponent(acc.id)}&currency=${encodeURIComponent(acc.currency || '')}`);
      state.campaigns = data.campaigns || [];
      renderCampaigns();
      renderSummary();
      renderPreview();
      logOk(`đã tải ${state.campaigns.length} chiến dịch.`);
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
    }
  }

  function campaignMatches(c) {
    const q = norm($('#cbCampaignSearch')?.value || '');
    const f = $('#cbCampaignFilter')?.value || 'all';
    const status = String(c.effective_status || c.status || '').toUpperCase();
    const objective = String(c.objective || '').toUpperCase();
    const kind = campaignKind(c);
    const text = norm([
      c.name,
      c.id,
      c.campaign_id,
      c.objective,
      objectiveText(c.objective),
      c.status,
      c.effective_status,
      statusText(c.status),
      kind,
    ].join(' '));
    if (q && !text.includes(q)) return false;
    if (f === 'active') return status === 'ACTIVE';
    if (f === 'paused') return status === 'PAUSED';
    if (f === 'traffic') return kind === 'traffic';
    if (f === 'engagement') return kind === 'engagement';
    if (f === 'video') return kind === 'video';
    return true;
  }

  function renderCampaigns() {
    const wrap = $('#cbCampaigns');
    if (!wrap) return;
    const list = state.campaigns.filter(campaignMatches);
    if (!list.length) {
      wrap.innerHTML = `<div class="loading">${state.campaigns.length ? 'Không có chiến dịch phù hợp với bộ lọc.' : 'Chưa có chiến dịch.'}</div>`;
      return;
    }
    wrap.innerHTML = `<div class="cb-filter-note">Đang hiển thị ${list.length}/${state.campaigns.length} chiến dịch</div>` + list.map((c) => `
      <button class="cb-item ${String(c.id) === String(state.selectedCampaignId) ? 'selected' : ''}" type="button" data-id="${esc(c.id)}">
        <div class="cb-row-main">
          <strong title="${esc(c.name)}">${esc(c.name || 'Không tên')}</strong>
          <span class="cb-badge ${c.status === 'PAUSED' ? 'paused' : ''}">${esc(statusText(c.status))}</span>
        </div>
        <div class="cb-meta">${esc(c.id)} · ${esc(objectiveText(c.objective))}</div>
      </button>
    `).join('');
    $$('.cb-item', wrap).forEach((btn) => btn.addEventListener('click', () => selectCampaign(btn.dataset.id)));
  }

  async function selectCampaign(id) {
    state.selectedCampaignId = id;
    renderCampaigns();
    renderSummary();
    renderPreview();
  }

  function renderSummary() {
    const box = $('#cbCampaignSummary');
    const c = selectedCampaign();
    if (!box) return;
    if (!c) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    const budget = c.daily_budget ? `Hàng ngày ${formatMoney(c.daily_budget)}` : c.lifetime_budget ? `Trọn đời ${formatMoney(c.lifetime_budget)}` : 'Không có ngân sách ở campaign';
    box.innerHTML = `<strong>${esc(c.name)}</strong><div>${esc(objectiveText(c.objective))} · ${esc(statusText(c.status))} · ${esc(budget)}</div>`;
  }

  async function loadPages(force = false) {
    const wrap = $('#cbPages');
    if (!wrap) return;
    if (state.loadedPages && !force) {
      renderPages();
      return;
    }
    wrap.innerHTML = '<div class="loading">Đang tải Page...</div>';
    try {
      const data = await apiJson('/api/pages');
      state.pages = data.pages || [];
      state.loadedPages = true;
      renderPages();
      logOk(`đã tải ${state.pages.length} Page.`);
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
    }
  }

  function renderPages() {
    const wrap = $('#cbPages');
    if (!wrap) return;
    const q = ($('#cbPageSearch')?.value || '').toLowerCase().trim();
    const list = state.pages.filter((p) => !q || `${p.name} ${p.id}`.toLowerCase().includes(q));
    if (!list.length) {
      wrap.innerHTML = '<div class="loading">Không có Page phù hợp.</div>';
      return;
    }
    wrap.innerHTML = list.map((p) => `
      <button class="cb-page ${String(p.id) === String(state.selectedPageId) ? 'selected' : ''}" type="button" data-id="${esc(p.id)}">
        <div class="cb-row-main">
          <strong title="${esc(p.name)}">${esc(p.name || 'Không tên')}</strong>
          <span class="cb-badge ${p.canAdvertise ? '' : 'bad'}">${p.canAdvertise ? 'Có quyền' : 'Thiếu quyền'}</span>
        </div>
        <div class="cb-meta">${esc(p.id)}</div>
      </button>
    `).join('');
    $$('.cb-page', wrap).forEach((btn) => btn.addEventListener('click', () => {
      state.selectedPageId = btn.dataset.id;
      state.posts = [];
      state.selectedPosts.clear();
      renderPages();
      renderPosts();
      renderPreview();
      updateSelectedCount();
    }));
  }

  async function loadPosts() {
    const wrap = $('#cbPosts');
    if (!wrap) return;
    if (!state.selectedPageId) {
      wrap.innerHTML = '<div class="alert alert-error">Hãy chọn Page trước.</div>';
      return;
    }
    const type = $('#cbPostType')?.value || 'all';
    wrap.innerHTML = '<div class="loading">Đang tải bài viết...</div>';
    try {
      const data = await apiJson(`/api/pages/${encodeURIComponent(state.selectedPageId)}/posts?type=${encodeURIComponent(type)}`);
      state.posts = (data.posts || []).slice().sort((a, b) => dateMs(b.created_time) - dateMs(a.created_time));
      state.selectedPosts.clear();
      renderPosts();
      renderPreview();
      updateSelectedCount();
      logOk(`đã tải ${state.posts.length} bài.`);
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
    }
  }

  function renderPosts() {
    const wrap = $('#cbPosts');
    if (!wrap) return;
    if (!state.selectedPageId) {
      wrap.innerHTML = '<div class="loading">Chọn Page rồi tải bài.</div>';
      return;
    }
    const q = ($('#cbPostSearch')?.value || '').toLowerCase().trim();
    const list = state.posts.filter((p) => !q || `${p.message} ${postObjectId(p)} ${p.type}`.toLowerCase().includes(q));
    if (!list.length) {
      wrap.innerHTML = `<div class="loading">${state.posts.length ? 'Không có bài phù hợp.' : 'Chưa tải bài.'}</div>`;
      return;
    }
    wrap.innerHTML = list.map((p) => {
      const oid = postObjectId(p);
      const checked = state.selectedPosts.has(oid);
      return `
        <article class="cb-post ${checked ? 'selected' : ''}" data-id="${esc(oid)}">
          <div class="cb-thumb">${p.thumbnail ? `<img src="${esc(p.thumbnail)}" alt="" />` : `<span>${esc(p.type || 'Post')}</span>`}</div>
          <div class="cb-post-body">
            <div class="cb-post-top">
              <label class="chk"><input type="checkbox" ${checked ? 'checked' : ''} /> <span>Chọn</span></label>
              <span class="cb-badge">${esc(typeText(p.type))}</span>
            </div>
            <div class="cb-post-msg" title="${esc(p.message || '')}">${esc(p.message || 'Không có nội dung')}</div>
            <div class="cb-meta">${esc(formatDate(p.created_time))} · ${esc(shortId(oid))}</div>
            ${p.permalink_url ? `<a class="cb-post-link" href="${esc(p.permalink_url)}" target="_blank">Mở bài gốc</a>` : ''}
          </div>
        </article>
      `;
    }).join('');
    $$('.cb-post', wrap).forEach((card) => {
      const input = $('input[type="checkbox"]', card);
      const set = (checked) => {
        const post = findPostByObjectId(card.dataset.id);
        if (!post) return;
        const oid = postObjectId(post);
        input.checked = checked;
        if (checked) state.selectedPosts.set(oid, post);
        else state.selectedPosts.delete(oid);
        card.classList.toggle('selected', checked);
        updateSelectedCount();
        renderPreview();
      };
      input.addEventListener('change', () => set(input.checked));
      card.addEventListener('click', (ev) => {
        if (ev.target.closest('a') || ev.target.closest('.chk')) return;
        set(!input.checked);
      });
    });
  }

  function updateSelectedCount() {
    syncSelectedPostsFromDom(false);
    const el = $('#cbSelectedCount');
    if (el) el.textContent = `Đã chọn ${state.selectedPosts.size} bài`;
    const btn = $('#cbSelectAllPosts');
    if (btn) btn.textContent = state.posts.length && state.selectedPosts.size === state.posts.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
  }

  function toggleSelectAll() {
    if (!state.posts.length) return;
    const shouldSelect = state.selectedPosts.size !== state.posts.length;
    state.selectedPosts.clear();
    if (shouldSelect) state.posts.forEach((p) => {
      const oid = postObjectId(p);
      if (oid) state.selectedPosts.set(oid, p);
    });
    renderPosts();
    updateSelectedCount();
    renderPreview();
  }

  function postObjectId(post) {
    return String(post?.object_story_id || post?.objectStoryId || post?.objectStoryID || '').trim();
  }

  function findPostByObjectId(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    return state.posts.find((p) => postObjectId(p) === key) || null;
  }

  function syncSelectedPostsFromDom(clearAll = false) {
    const cards = $$('#cbPosts .cb-post');
    if (!cards.length) return;
    if (clearAll) state.selectedPosts.clear();
    cards.forEach((card) => {
      const checked = $('input[type="checkbox"]', card)?.checked;
      const post = findPostByObjectId(card.dataset.id);
      if (!post) return;
      const oid = postObjectId(post);
      if (checked) state.selectedPosts.set(oid, post);
      else state.selectedPosts.delete(oid);
    });
  }

  function renderPreview() {
    const wrap = $('#cbPreview');
    if (!wrap) return;
    const campaign = selectedCampaign();
    syncSelectedPostsFromDom();
    const posts = Array.from(state.selectedPosts.values());
    if (!campaign || !posts.length) {
      wrap.innerHTML = '<div class="loading">Chọn chiến dịch và bài viết để xem trước.</div>';
      return;
    }
    wrap.innerHTML = posts.map((p, i) => `
      <div class="cb-preview-row">
        <strong>${i + 1}. ${esc(adName(p))}</strong>
        <div class="cb-meta">Tạo 1 nhóm quảng cáo + 1 quảng cáo trong ${esc(campaign.name)} · ${esc(postObjectId(p))}</div>
      </div>
    `).join('');
  }

  function adName(post) {
    const raw = String(post.message || post.permalink_url || postObjectId(post) || 'Quảng cáo từ bài viết').replace(/\s+/g, ' ').trim();
    return (raw || 'Quảng cáo từ bài viết').slice(0, 100);
  }

  function payload() {
    const acc = account();
    syncSelectedPostsFromDom();
    return {
      adAccountId: acc?.id,
      currency: acc?.currency || '',
      timezone: acc?.timezone || 'Asia/Ho_Chi_Minh',
      campaignId: state.selectedCampaignId,
      adsetMode: 'create_new',
      newAdset: {
        country: $('#cbCountry')?.value || 'VN',
        budget: cleanBudget($('#cbBudget')?.value || ''),
        budgetMode: $('#cbBudgetMode')?.value || 'daily',
        startDate: $('#cbStartDate')?.value || '',
        startTime: $('#cbStartTime')?.value || '',
        endDate: $('#cbEndDate')?.value || '',
        endTime: $('#cbEndTime')?.value || '',
        optimizationGoal: $('#cbOptimization')?.value || 'LINK_CLICKS',
        billingEvent: 'IMPRESSIONS',
        status: 'PAUSED',
      },
      pageId: state.selectedPageId,
      posts: Array.from(state.selectedPosts.values()).map((p) => ({
        postId: p.post_id || p.id,
        objectStoryId: postObjectId(p),
        videoId: p.video_id,
        permalinkUrl: p.permalink_url,
        message: p.message,
        adName: adName(p),
      })).filter((p) => p.objectStoryId),
      status: $('#cbStatus')?.value || 'PAUSED',
    };
  }

  async function createAds() {
    const cfg = payload();
    const errors = [];
    if (!cfg.adAccountId) errors.push('Hãy chọn tài khoản quảng cáo.');
    if (!cfg.campaignId) errors.push('Hãy chọn chiến dịch.');
    if (!cfg.pageId) errors.push('Hãy chọn Page.');
    if (!cfg.posts.length) errors.push('Hãy chọn ít nhất 1 bài.');
    if (errors.length) {
      renderResults(errors.map((e) => ({ status: 'failed', errors: [e], ids: {} })));
      return;
    }

    const btn = $('#cbCreateAds');
    btn.disabled = true;
    btn.textContent = 'Đang tạo...';
    renderResults(cfg.posts.map((p) => ({ status: 'pending', objectStoryId: p.objectStoryId, errors: [], ids: {} })));
    logInfo(`Đang tạo 1/${cfg.posts.length}`);
    try {
      const data = await apiJson('/api/campaign-builder/create-ads', { method: 'POST', body: cfg, timeoutMs: 90000 });
      renderResults(data.results || []);
      const ok = (data.results || []).filter((r) => r.status === 'created').length;
      const fail = (data.results || []).length - ok;
      (data.results || []).forEach((r, i) => {
        if (r.status === 'created') logOk(`THÀNH CÔNG bài ${i + 1}: quảng cáo ${r.ids?.adId || '—'}`);
        else logErr(`THẤT BẠI bài ${i + 1}: ${r.errors?.[0] || 'Không rõ lỗi'}`);
      });
      if (fail) logWarn(`Hoàn tất: ${ok} thành công, ${fail} lỗi.`);
      else logOk(`Hoàn tất: ${ok} cấu trúc đã tạo.`);
    } catch (err) {
      renderResults([{ status: 'failed', errors: [err.message], ids: {} }]);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Tạo cấu trúc quảng cáo';
    }
  }

  function renderResults(results) {
    const wrap = $('#cbResults');
    if (!wrap) return;
    wrap.innerHTML = (results || []).map((r, i) => `
      <div class="cb-result ${r.status === 'created' ? 'ok' : r.status === 'failed' ? 'err' : ''}">
        <strong>${r.status === 'created' ? 'THÀNH CÔNG' : r.status === 'failed' ? 'THẤT BẠI' : 'Đang chờ'} · Bài ${i + 1}</strong>
        <div class="cb-meta">Chiến dịch: ${esc(r.ids?.campaignId || state.selectedCampaignId || '—')} · Nhóm: ${esc(r.ids?.adsetId || '—')} · Nội dung: ${esc(r.ids?.creativeId || '—')} · Quảng cáo: ${esc(r.ids?.adId || '—')}</div>
        ${(r.errors || []).map((e) => `<div class="cb-meta">${esc(e)}</div>`).join('')}
      </div>
    `).join('');
  }

  function statusText(s) {
    return s === 'ACTIVE' ? 'Đang chạy' : s === 'PAUSED' ? 'Đang tắt' : (s || '—');
  }
  function objectiveText(s) {
    const map = { OUTCOME_TRAFFIC: 'Traffic', TRAFFIC: 'Traffic', OUTCOME_ENGAGEMENT: 'Engagement', POST_ENGAGEMENT: 'Tương tác', VIDEO_VIEWS: 'Video views' };
    return map[s] || s || '—';
  }
  function campaignKind(c) {
    const objective = String(c?.objective || '').toUpperCase();
    const name = norm(c?.name || '');
    if (objective.includes('TRAFFIC') || objective.includes('LINK_CLICKS') || /\btraffic\b|luu luong|truy cap|click/.test(name)) return 'traffic';
    if (objective.includes('VIDEO') || objective.includes('THRUPLAY') || objective.includes('VIEWS') || /video|thruplay|luot xem/.test(name)) return 'video';
    if (objective.includes('ENGAGEMENT') || objective.includes('POST_ENGAGEMENT') || objective.includes('PAGE_LIKES') || /tuong tac|engagement/.test(name)) return 'engagement';
    return 'other';
  }
  function norm(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }
  function goalText(s) {
    const map = { LINK_CLICKS: 'Click liên kết', THRUPLAY: 'ThruPlay', POST_ENGAGEMENT: 'Tương tác bài viết' };
    return map[s] || s || '—';
  }
  function typeText(s) {
    return s === 'Reel' ? 'Reel' : s === 'Video' ? 'Video' : 'Bài viết';
  }
  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  }
  function dateMs(value) {
    const n = new Date(value || 0).getTime();
    return Number.isNaN(n) ? 0 : n;
  }
  function shortId(value) {
    const s = value ? String(value) : '—';
    return s.length > 24 ? `${s.slice(0, 12)}...${s.slice(-8)}` : s;
  }
  function cleanBudget(value) {
    return String(value || '').replace(/[^\d]/g, '');
  }
  function formatBudget(value) {
    const raw = cleanBudget(value);
    return raw ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
  }
  function formatMoney(value) {
    if (value == null || value === '') return '—';
    return Number(value).toLocaleString('vi-VN');
  }
  function dateValue(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function timeValue(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function setDefaults() {
    const start = new Date();
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    if ($('#cbStartDate') && !$('#cbStartDate').value) $('#cbStartDate').value = dateValue(start);
    if ($('#cbStartTime') && !$('#cbStartTime').value) $('#cbStartTime').value = timeValue(start);
    if ($('#cbEndDate') && !$('#cbEndDate').value) $('#cbEndDate').value = dateValue(end);
    if ($('#cbEndTime') && !$('#cbEndTime').value) $('#cbEndTime').value = timeValue(end);
    const budget = $('#cbBudget');
    if (budget) {
      const apply = () => { budget.value = formatBudget(budget.value); };
      budget.addEventListener('input', apply);
      budget.addEventListener('blur', apply);
      apply();
    }
  }

  function bind() {
    $('#cbReloadAll')?.addEventListener('click', loadAll);
    $('#cbCampaignSearch')?.addEventListener('input', renderCampaigns);
    $('#cbCampaignFilter')?.addEventListener('change', renderCampaigns);
    $('#cbLoadPages')?.addEventListener('click', () => loadPages(true));
    $('#cbPageSearch')?.addEventListener('input', renderPages);
    $('#cbLoadPosts')?.addEventListener('click', loadPosts);
    $('#cbPostSearch')?.addEventListener('input', renderPosts);
    $('#cbPostType')?.addEventListener('change', loadPosts);
    $('#cbSelectAllPosts')?.addEventListener('click', toggleSelectAll);
    $('#cbCreateAds')?.addEventListener('click', createAds);
  }

  function activate() {
    accountInfo();
    if (!state.campaigns.length) renderCampaigns();
    if (!state.loadedPages) loadPages(false);
  }

  function refreshAccount() {
    accountInfo();
    state.campaigns = [];
    state.adsets = [];
    state.selectedCampaignId = '';
    renderCampaigns();
    renderPreview();
  }

  function init() {
    bind();
    setDefaults();
    accountInfo();
  }

  window.CampaignBuilder = { init, activate, refreshAccount, loadAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
