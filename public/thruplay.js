'use strict';

(function () {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])));

  const tp = {
    pages: [],
    posts: [],
    selectedPageId: '',
    selectedPosts: new Map(),
    loaded: false,
  };

  function api(url, opts = {}) {
    return fetch(url, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(async (res) => {
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data.error || `Lỗi máy chủ (${res.status})`);
      return data;
    });
  }

  function logInfo(message) {
    if (window.Logger?.info) window.Logger.info(message);
  }
  function logOk(message) {
    if (window.Logger?.ok) window.Logger.ok(message);
  }
  function logErr(message) {
    if (window.Logger?.err) window.Logger.err(message);
  }

  function selectedAccount() {
    return window.State?.selectedAccount || null;
  }

  function selectedPage() {
    return tp.pages.find((p) => String(p.id) === String(tp.selectedPageId)) || null;
  }

  function accountLabel() {
    const acc = selectedAccount();
    if (!acc) return 'Chọn tài khoản quảng cáo ở thanh bên trái.';
    return `<strong>${esc(acc.name)}</strong><div class="tp-page-id">${esc(acc.id)} · ${esc(acc.currency || '')}</div>`;
  }

  function updateAccountInfo() {
    const box = $('#tpAccountInfo');
    if (box) box.innerHTML = accountLabel();
  }

  async function loadPages(force = false) {
    if (tp.loaded && !force) return;
    const wrap = $('#tpPages');
    if (!wrap) return;
    wrap.innerHTML = '<div class="loading">Đang tải Page...</div>';
    try {
      const data = await api('/api/thruplay/pages');
      tp.pages = data.pages || [];
      tp.loaded = true;
      renderPages();
      logOk(`ThruPlay: đã tải ${tp.pages.length} Page.`);
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
      logErr('ThruPlay tải Page lỗi: ' + err.message);
    }
  }

  function renderPages() {
    const wrap = $('#tpPages');
    if (!wrap) return;
    const q = ($('#tpPageSearch')?.value || '').toLowerCase().trim();
    const pages = tp.pages.filter((p) => !q || `${p.name} ${p.id}`.toLowerCase().includes(q));
    if (!pages.length) {
      wrap.innerHTML = '<div class="loading">Không có Page phù hợp.</div>';
      return;
    }
    wrap.innerHTML = pages.map((p) => `
      <button class="tp-page ${String(p.id) === String(tp.selectedPageId) ? 'selected' : ''}" type="button" data-id="${esc(p.id)}">
        <span class="tp-page-main">
          <strong>${esc(p.name)}</strong>
          <span class="tp-badge ${p.canAdvertise ? '' : 'bad'}">${p.canAdvertise ? 'ADVERTISE' : 'Thiếu quyền'}</span>
        </span>
        <span class="tp-page-id">${esc(p.id)}</span>
      </button>
    `).join('');
    $$('.tp-page', wrap).forEach((btn) => {
      btn.addEventListener('click', () => {
        tp.selectedPageId = btn.dataset.id;
        tp.posts = [];
        tp.selectedPosts.clear();
        syncAutoNames();
        renderPages();
        renderPosts();
        updateSelectedCount();
      });
    });
  }

  async function loadPosts() {
    if (!tp.selectedPageId) {
      $('#tpPosts').innerHTML = '<div class="alert alert-error">Hãy chọn Page trước.</div>';
      return;
    }
    const wrap = $('#tpPosts');
    wrap.innerHTML = '<div class="loading">Đang tải video/reel...</div>';
    try {
      const data = await api(`/api/thruplay/pages/${encodeURIComponent(tp.selectedPageId)}/posts`);
      tp.posts = data.posts || [];
      tp.selectedPosts.clear();
      renderPosts();
      updateSelectedCount();
      syncAutoNames();
      logOk(`ThruPlay: đã tải ${tp.posts.length} video/reel.`);
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
      logErr('ThruPlay tải bài lỗi: ' + err.message);
    }
  }

  function renderPosts() {
    const wrap = $('#tpPosts');
    if (!wrap) return;
    if (!tp.selectedPageId) {
      wrap.innerHTML = '<div class="loading">Chọn Page rồi bấm tải bài.</div>';
      return;
    }
    if (!tp.posts.length) {
      wrap.innerHTML = '<div class="loading">Chưa có video/reel hoặc chưa tải bài.</div>';
      return;
    }
    wrap.innerHTML = tp.posts.map((p) => {
      const checked = tp.selectedPosts.has(p.object_story_id);
      return `
        <article class="tp-post ${checked ? 'selected' : ''}" data-id="${esc(p.object_story_id)}">
          <div class="tp-thumb">${p.thumbnail ? `<img src="${esc(p.thumbnail)}" alt="" />` : '<span>Video/Reel</span>'}</div>
          <div class="tp-post-body">
            <div class="tp-post-top">
              <label class="chk"><input type="checkbox" ${checked ? 'checked' : ''} /> <span>Chọn</span></label>
              <span class="tp-badge">Existing Post · ${esc(p.type || 'Video')}</span>
            </div>
            <div class="tp-post-msg">${esc(p.message || 'Không có nội dung')}</div>
            <div class="tp-post-meta">
              <span>${esc(formatDate(p.created_time))}</span>
              <span title="${esc(p.object_story_id || '')}">${shortId(p.object_story_id)}</span>
              ${p.permalink_url ? `<a href="${esc(p.permalink_url)}" target="_blank">Mở bài</a>` : '<span></span>'}
            </div>
          </div>
        </article>
      `;
    }).join('');
    $$('.tp-post', wrap).forEach((card) => {
      const input = $('input[type="checkbox"]', card);
      const setSelected = (checked) => {
        const post = tp.posts.find((p) => p.object_story_id === card.dataset.id);
        if (!post) return;
        input.checked = checked;
        if (checked) tp.selectedPosts.set(post.object_story_id, post);
        else tp.selectedPosts.delete(post.object_story_id);
        card.classList.toggle('selected', checked);
        updateSelectedCount();
        syncAutoNames();
      };
      input.addEventListener('change', () => setSelected(input.checked));
      card.addEventListener('click', (ev) => {
        if (ev.target.closest('a')) return;
        if (ev.target.closest('.chk')) return;
        setSelected(!input.checked);
      });
    });
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  }

  function updateSelectedCount() {
    const el = $('#tpSelectedCount');
    if (el) el.textContent = `Đã chọn ${tp.selectedPosts.size} bài`;
    const btn = $('#tpSelectAllPosts');
    if (btn) btn.textContent = tp.posts.length && tp.selectedPosts.size === tp.posts.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
  }

  function toggleSelectAllPosts() {
    if (!tp.posts.length) return;
    const shouldSelect = tp.selectedPosts.size !== tp.posts.length;
    tp.selectedPosts.clear();
    if (shouldSelect) tp.posts.forEach((post) => tp.selectedPosts.set(post.object_story_id, post));
    renderPosts();
    updateSelectedCount();
    syncAutoNames();
  }

  function autoPostName(post) {
    const raw = String(post?.message || post?.permalink_url || post?.object_story_id || '').replace(/\s+/g, ' ').trim();
    return (raw || 'ThruPlay Video').slice(0, 50);
  }

  function syncAutoNames() {
    const campaignInput = $('#tpCampaignName');
    const adsetInput = $('#tpAdsetName');
    const page = selectedPage();
    if (campaignInput) campaignInput.value = page?.name || '';
    if (!adsetInput) return;
    const posts = Array.from(tp.selectedPosts.values());
    if (posts.length === 1) adsetInput.value = autoPostName(posts[0]);
    else if (posts.length > 1) adsetInput.value = 'Tự động theo từng bài đã chọn';
    else adsetInput.value = '';
  }

  function bodyConfig() {
    const acc = selectedAccount();
    const page = selectedPage();
    return {
      adAccountId: acc?.id,
      currency: acc?.currency,
      pageName: page?.name || '',
      campaignName: page?.name || $('#tpCampaignName')?.value || '',
      pageId: tp.selectedPageId,
      posts: Array.from(tp.selectedPosts.values()).map((p) => ({
        objectStoryId: p.object_story_id,
        postId: p.id,
        videoId: p.video_id,
        type: p.type,
        permalinkUrl: p.permalink_url,
        message: p.message,
        adsetName: autoPostName(p),
        adName: autoPostName(p),
      })),
      country: $('#tpCountry')?.value || 'Việt Nam',
      budget: cleanBudgetValue($('#tpBudget')?.value || ''),
      budgetMode: $('#tpBudgetMode')?.value || 'daily',
      budgetLevel: $('#tpBudgetLevel')?.value || 'adset',
      startDate: $('#tpStartDate')?.value || '',
      startTime: $('#tpStartTime')?.value || '',
      endDate: $('#tpEndDate')?.value || '',
      endTime: $('#tpEndTime')?.value || '',
      status: $('#tpStatus')?.value || 'PAUSED',
    };
  }

  async function createAds() {
    const btn = $('#tpCreateBtn');
    const cfg = bodyConfig();
    if (!cfg.adAccountId) return showResults([{ status: 'failed', errors: ['Hãy chọn tài khoản quảng cáo.'] }]);
    if (!cfg.pageId) return showResults([{ status: 'failed', errors: ['Hãy chọn Page.'] }]);
    if (!cfg.posts.length) return showResults([{ status: 'failed', errors: ['Hãy chọn ít nhất 1 video/reel.'] }]);

    btn.disabled = true;
    btn.textContent = 'Đang tạo...';
    showResults(cfg.posts.map((p) => ({ objectStoryId: p.objectStoryId, status: 'pending', errors: [], ids: {} })));
    logInfo(`ThruPlay: bắt đầu tạo ${cfg.posts.length} quảng cáo.`);

    try {
      const data = await api('/api/thruplay/create', { method: 'POST', body: cfg });
      showResults(data.results || []);
      const ok = (data.results || []).filter((r) => r.status === 'created').length;
      const fail = (data.results || []).length - ok;
      logOk(`ThruPlay: tạo xong ${ok} thành công, ${fail} lỗi.`);
    } catch (err) {
      showResults([{ status: 'failed', errors: [err.message] }]);
      logErr('ThruPlay tạo lỗi: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Tạo ThruPlay Ads';
    }
  }

  function showResults(results) {
    const panel = $('#tpResultPanel');
    const wrap = $('#tpResults');
    if (!panel || !wrap) return;
    panel.classList.remove('hidden');
    wrap.innerHTML = (results || []).map((r, i) => `
      <div class="tp-result ${r.status === 'created' ? 'ok' : r.status === 'failed' ? 'err' : ''}">
        <div class="tp-result-head">
          <strong>${r.status === 'created' ? 'SUCCESS' : r.status === 'failed' ? 'FAILED' : 'Đang chờ'} · Bài ${i + 1}</strong>
          <span title="${esc(r.objectStoryId || '')}">${shortId(r.objectStoryId)}</span>
        </div>
        <div class="tp-result-ids">
          Campaign: ${esc(r.ids?.campaignId || '—')} · AdSet: ${esc(r.ids?.adsetId || '—')} · Creative: ${esc(r.ids?.creativeId || '—')} · Ad: ${esc(r.ids?.adId || '—')}
        </div>
        ${(r.errors || []).map((e) => `<div class="tp-result-error" title="${esc(e)}">${esc(e)}</div>`).join('')}
      </div>
    `).join('');
  }

  function shortId(value) {
    const s = value ? String(value) : '—';
    if (s.length <= 24) return esc(s);
    return esc(`${s.slice(0, 12)}...${s.slice(-8)}`);
  }

  function cleanBudgetValue(value) {
    return String(value || '').replace(/[^\d]/g, '');
  }

  function formatBudgetValue(value) {
    const raw = cleanBudgetValue(value);
    if (!raw) return '';
    return raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function setupBudgetInput() {
    const input = $('#tpBudget');
    if (!input) return;
    const apply = () => { input.value = formatBudgetValue(input.value); };
    input.addEventListener('input', apply);
    input.addEventListener('blur', apply);
    apply();
  }

  function dateValue(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function timeValue(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function setDefaultDates() {
    const start = new Date();
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    if ($('#tpStartDate') && !$('#tpStartDate').value) $('#tpStartDate').value = dateValue(start);
    if ($('#tpStartTime') && !$('#tpStartTime').value) $('#tpStartTime').value = timeValue(start);
    if ($('#tpEndDate') && !$('#tpEndDate').value) $('#tpEndDate').value = dateValue(end);
    if ($('#tpEndTime') && !$('#tpEndTime').value) $('#tpEndTime').value = timeValue(end);
  }

  function init() {
    $('#tpRefreshPages')?.addEventListener('click', () => loadPages(true));
    $('#tpLoadPosts')?.addEventListener('click', loadPosts);
    $('#tpSelectAllPosts')?.addEventListener('click', toggleSelectAllPosts);
    $('#tpPageSearch')?.addEventListener('input', renderPages);
    $('#tpCreateBtn')?.addEventListener('click', createAds);
    setupBudgetInput();
    setDefaultDates();
    syncAutoNames();
    updateAccountInfo();
  }

  window.ThruPlay = {
    init,
    loadPages,
    updateAccountInfo,
    refreshAccount: updateAccountInfo,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
