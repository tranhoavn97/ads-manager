'use strict';
/* ============================================================
   posts.js — Tab "Dọn dẹp bài viết Page" (native, dùng chung
   tiện ích từ app.js: $, $$, State, api, esc, toast, Logger).
   Quét bài/video/reel đa Page → lọc → xoá hàng loạt có kiểm soát
   (tạm dừng / chế độ an toàn / tự cooldown khi Meta giới hạn).
   ============================================================ */
const Posts = {
  pages: [],
  selPages: new Set(),
  items: [],            // bài đã quét (sau lọc)
  sel: new Set(),       // postId đã chọn để xoá
  search: '',
  safeMode: true,
  loaded: false,
  // hàng đợi xoá
  running: false, paused: false, stop: false,

  async activate() {
    if (!this.loaded) await this.loadPages();
  },

  async loadPages() {
    const box = $('#postsPages');
    box.innerHTML = '<div class="loading">Đang tải danh sách Page…</div>';
    try {
      const { pages } = await api('/api/posts/pages');
      this.pages = pages || [];
      this.loaded = true;
      this.renderPages();
      Logger.ok(`Tải ${this.pages.length} Page để dọn dẹp bài viết.`);
    } catch (err) {
      box.innerHTML = `<div class="alert alert-error" style="margin:0">${esc(err.message)}</div>`;
    }
  },

  renderPages() {
    const box = $('#postsPages');
    if (!this.pages.length) { box.innerHTML = '<div class="muted">Không có Page nào bạn quản lý.</div>'; return; }
    box.innerHTML = this.pages.map((p) => {
      const on = this.selPages.has(p.id);
      const av = p.picture
        ? `<img class="pp-av" src="${esc(p.picture)}" alt="" loading="lazy">`
        : `<span class="pp-av pp-av-ph">${esc((p.name || '?')[0])}</span>`;
      const warn = p.canManage ? '' : '<span class="pp-warn" title="Thiếu quyền MANAGE — có thể không xoá được">!</span>';
      return `<button type="button" class="pp-chip ${on ? 'on' : ''}" data-id="${esc(p.id)}">
        ${av}<span class="pp-name">${esc(p.name)}</span>${warn}
        <span class="pp-check">✓</span>
      </button>`;
    }).join('');
    box.querySelectorAll('.pp-chip').forEach((el) => {
      el.addEventListener('click', () => { this.togglePage(el.dataset.id); });
    });
    $('#postsPagesCount').textContent = `${this.selPages.size}/${this.pages.length} Page được chọn`;
    const all = $('#postsSelectAllPages');
    if (all) all.checked = this.selPages.size === this.pages.length && this.pages.length > 0;
  },

  togglePage(id) {
    if (this.selPages.has(id)) this.selPages.delete(id); else this.selPages.add(id);
    this.renderPages();
  },
  toggleAllPages(on) {
    this.selPages = on ? new Set(this.pages.map((p) => p.id)) : new Set();
    this.renderPages();
  },

  // ---------- Quét ----------
  filterCfg() {
    return {
      type: $('#pfType').value,
      preset: $('#pfPreset').value,
      from: $('#pfFrom').value,
      to: $('#pfTo').value,
      older: parseInt($('#pfOlder').value, 10) || 0,
      keyword: $('#pfKeyword').value.trim().toLowerCase(),
      max: Math.max(1, parseInt($('#pfMax').value, 10) || 100),
    };
  },

  passFilter(post, cfg) {
    const t = new Date(post.created_time).getTime();
    const now = Date.now();
    const DAY = 86400000;
    if (cfg.preset === 'today' && t < now - DAY) return false;
    if (cfg.preset === 'week' && t < now - 7 * DAY) return false;
    if (cfg.preset === 'month' && t < now - 30 * DAY) return false;
    if (cfg.preset === 'year' && t < now - 365 * DAY) return false;
    if (cfg.preset === 'custom') {
      if (cfg.from && t < new Date(cfg.from).getTime()) return false;
      if (cfg.to && t > new Date(cfg.to).getTime() + DAY) return false;
    }
    if (cfg.older > 0 && t > now - cfg.older * DAY) return false;
    if (cfg.keyword && !(post.message || '').toLowerCase().includes(cfg.keyword)) return false;
    return true;
  },

  async scan() {
    if (!this.selPages.size) return toast('Hãy chọn ít nhất 1 Page', 'err');
    const cfg = this.filterCfg();
    const ids = [...this.selPages];
    const prog = $('#postsScanProgress');
    prog.classList.remove('hidden');
    const btn = $('#postsScanBtn');
    btn.disabled = true; btn.textContent = 'Đang quét…';
    this.items = []; this.sel = new Set();

    let scanned = 0, total = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const pid = ids[i];
        const pname = this.pages.find((p) => p.id === pid)?.name || pid;
        prog.innerHTML = `<span class="spin"></span> Đang quét <strong>${esc(pname)}</strong> (${i + 1}/${ids.length})… đã thấy ${total} bài`;
        try {
          const { posts, rateLimit } = await api('/api/posts/scan', { method: 'POST', body: { pageId: pid, contentType: cfg.type, limit: cfg.max } });
          const kept = (posts || []).filter((p) => this.passFilter(p, cfg));
          this.items.push(...kept);
          total += kept.length; scanned++;
          if (rateLimit?.cooldownMs > 0) await this.cooldown(rateLimit.cooldownMs, prog);
          else await sleep(300);
        } catch (err) {
          Logger.err(`Quét ${pname} lỗi: ${err.message}`);
        }
      }
      // sắp xếp mới→cũ
      this.items.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
      Logger.ok(`Quét xong ${scanned}/${ids.length} Page · ${this.items.length} bài khớp bộ lọc.`);
      toast(`Tìm thấy ${this.items.length} bài`, this.items.length ? 'ok' : 'err');
      prog.classList.add('hidden');
      $('#postsResultPanel').classList.remove('hidden');
      this.renderResults();
    } finally {
      btn.disabled = false; btn.textContent = 'Quét bài viết';
    }
  },

  // ---------- Bảng kết quả ----------
  visible() {
    const q = this.search;
    return this.items.filter((p) => !q || (p.message || '').toLowerCase().includes(q) || (p.pageName || '').toLowerCase().includes(q));
  },

  renderResults() {
    const body = $('#postsBody');
    const list = this.visible();
    if (!list.length) { body.innerHTML = '<tr><td colspan="8" class="loading">Không có bài nào khớp.</td></tr>'; this.updateSelInfo(); return; }
    body.innerHTML = list.map((p) => {
      const checked = this.sel.has(p.id) ? 'checked' : '';
      const thumb = p.full_picture
        ? `<img class="pt-thumb" src="${esc(p.full_picture)}" alt="" loading="lazy">`
        : '<span class="pt-thumb pt-thumb-ph"></span>';
      const msg = (p.message || '(không có nội dung)').slice(0, 120);
      const date = new Date(p.created_time).toLocaleString('vi-VN', { hour12: false });
      const typeLabel = p.itemType === 'video' ? 'Video/Reel' : 'Bài viết';
      const st = p._status || '';
      return `<tr data-id="${esc(p.id)}" class="${st ? 'pst-' + st : ''}">
        <td><input type="checkbox" class="pt-chk" data-id="${esc(p.id)}" ${checked}></td>
        <td>${p.permalink_url ? `<a href="${esc(p.permalink_url)}" target="_blank" rel="noopener">${thumb}</a>` : thumb}</td>
        <td><div class="pt-msg">${esc(msg)}</div></td>
        <td><div class="pt-page">${esc(p.pageName)}</div></td>
        <td><span class="pt-type ${p.itemType}">${typeLabel}</span></td>
        <td class="num pt-date">${esc(date)}</td>
        <td class="num pt-eng">${p.likes} / ${p.comments} / ${p.shares}</td>
        <td>${this.statusCell(p)}</td>
      </tr>`;
    }).join('');
    body.querySelectorAll('.pt-chk').forEach((el) => el.addEventListener('change', () => this.toggle(el.dataset.id, el.checked)));
    this.updateSelInfo();
  },

  statusCell(p) {
    const map = {
      processing: ['Đang xoá…', 'warn'], success: ['Đã xoá', 'ok'],
      failed: ['Lỗi', 'bad'], skipped: ['Bỏ qua', 'muted'], pending: ['Chờ', 'muted'],
    };
    if (!p._status) return '<span class="muted">—</span>';
    const [label, cls] = map[p._status] || [p._status, 'muted'];
    return `<span class="pt-status ${cls}" title="${esc(p._error || '')}">${label}</span>`;
  },

  toggle(id, on) { if (on) this.sel.add(id); else this.sel.delete(id); this.updateSelInfo(); },
  toggleAll(on) {
    const vis = this.visible();
    if (on) vis.forEach((p) => this.sel.add(p.id)); else vis.forEach((p) => this.sel.delete(p.id));
    this.renderResults();
  },
  updateSelInfo() {
    $('#postsSelCount').textContent = `Đã chọn ${this.sel.size} / ${this.items.length}`;
    $('#postsDeleteBtn').disabled = this.sel.size === 0 || this.running;
    const all = $('#postsSelectAll');
    const vis = this.visible();
    if (all) all.checked = vis.length > 0 && vis.every((p) => this.sel.has(p.id));
  },

  // ---------- Xoá hàng loạt ----------
  deleteSelected() {
    if (this.running || !this.sel.size) return;
    const queue = this.items.filter((p) => this.sel.has(p.id));
    const run = () => { closeModal(); this.runQueue(queue); };
    if (this.safeMode) {
      mModal('Xác nhận xoá hàng loạt', `
        <p>Bạn sắp <strong>xoá vĩnh viễn ${queue.length}</strong> bài viết/video khỏi Facebook.</p>
        <p class="muted" style="font-size:12.5px">Hành động <strong>không thể hoàn tác</strong>. Hệ thống sẽ xoá tuần tự, tự dừng & cooldown nếu Meta giới hạn. Bạn có thể Tạm dừng/Dừng bất cứ lúc nào.</p>`,
        run, `Xoá ${queue.length} bài`, true);
    } else run();
  },

  async runQueue(queue) {
    this.running = true; this.paused = false; this.stop = false;
    queue.forEach((p) => { p._status = 'pending'; p._error = ''; });
    this.renderResults();
    $('#postsQueueBar').classList.remove('hidden');
    $('#postsDeleteBtn').disabled = true;
    this.setPauseLabel();
    Logger.info(`Bắt đầu xoá ${queue.length} bài viết…`);

    let done = 0, ok = 0, fail = 0;
    for (const p of queue) {
      if (this.stop) { p._status === 'pending' && (p._status = 'skipped'); continue; }
      while (this.paused && !this.stop) { this.queueStatus(`⏸ Đã tạm dừng — ${done}/${queue.length}`); await sleep(400); }
      if (this.stop) { p._status = 'skipped'; continue; }

      p._status = 'processing'; this.renderResults();
      this.queueStatus(`Đang xoá ${done + 1}/${queue.length}…`);
      try {
        const r = await api('/api/posts/delete', {
          method: 'POST',
          body: { postId: p.postId || p.id, pageId: p.pageId, itemType: p.itemType, sourceObjectId: p.sourceObjectId, deleteSource: p.itemType !== 'post' },
        });
        if (r.success) { p._status = 'success'; ok++; this.sel.delete(p.id); }
        else { p._status = 'failed'; p._error = r.error || 'Lỗi'; fail++; }
        if (r.rateLimit?.cooldownMs > 0) await this.cooldown(r.rateLimit.cooldownMs);
      } catch (err) {
        p._status = 'failed'; p._error = err.message; fail++;
        // Lỗi mạng/giới hạn → nghỉ ngắn
        await sleep(1500);
      }
      done++;
      this.bar(done / queue.length);
      this.renderResults();
      await sleep(this.safeMode ? 800 : 450); // nhịp xoá nhẹ nhàng
    }

    this.running = false;
    this.bar(1);
    this.queueStatus(`Hoàn tất: ${ok} đã xoá, ${fail} lỗi${this.stop ? ' (đã dừng)' : ''}.`);
    Logger.add(`Xoá xong: ${ok} thành công, ${fail} lỗi.`, fail ? 'warn' : 'ok');
    toast(`Đã xoá ${ok} bài${fail ? `, ${fail} lỗi` : ''}`, fail ? 'err' : 'ok');
    // gỡ các bài đã xoá khỏi danh sách sau ít giây
    setTimeout(() => { this.items = this.items.filter((p) => p._status !== 'success'); this.renderResults(); }, 1500);
    this.updateSelInfo();
  },

  async cooldown(ms, progEl) {
    const until = Date.now() + ms;
    while (Date.now() < until && !this.stop) {
      const left = Math.ceil((until - Date.now()) / 1000);
      const msg = `⏳ Meta giới hạn tần suất — chờ ${left}s rồi tiếp tục…`;
      if (progEl) progEl.innerHTML = msg; else this.queueStatus(msg);
      await sleep(1000);
    }
  },

  togglePause() { if (!this.running) return; this.paused = !this.paused; this.setPauseLabel(); },
  setPauseLabel() { const b = $('#postsPauseBtn'); if (b) b.textContent = this.paused ? 'Chạy tiếp' : 'Tạm dừng'; },
  stopQueue() { if (this.running) { this.stop = true; this.paused = false; } },
  queueStatus(t) { const el = $('#postsQueueStatus'); if (el) el.textContent = t; },
  bar(frac) { const el = $('#postsQueueBarFill'); if (el) el.style.width = Math.round(frac * 100) + '%'; },
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------- Sự kiện ----------
(function bindPosts() {
  $('#postsRefreshPages')?.addEventListener('click', () => { Posts.loaded = false; Posts.loadPages(); });
  $('#postsSelectAllPages')?.addEventListener('change', (e) => Posts.toggleAllPages(e.target.checked));
  $('#postsScanBtn')?.addEventListener('click', () => Posts.scan());
  $('#postsSearch')?.addEventListener('input', (e) => { Posts.search = e.target.value.trim().toLowerCase(); Posts.renderResults(); });
  $('#postsSelectAll')?.addEventListener('change', (e) => Posts.toggleAll(e.target.checked));
  $('#postsSafeMode')?.addEventListener('change', (e) => { Posts.safeMode = e.target.checked; });
  $('#postsDeleteBtn')?.addEventListener('click', () => Posts.deleteSelected());
  $('#postsPauseBtn')?.addEventListener('click', () => Posts.togglePause());
  $('#postsStopBtn')?.addEventListener('click', () => Posts.stopQueue());
  // hiện ô ngày khi chọn "Tuỳ chọn"
  $('#pfPreset')?.addEventListener('change', (e) => {
    const custom = e.target.value === 'custom';
    $('#pfFromWrap').style.display = custom ? '' : 'none';
    $('#pfToWrap').style.display = custom ? '' : 'none';
  });
})();
