'use strict';
/* ============================================================
   select.js — Component Dropdown dùng CHUNG cho toàn app.
   Nâng cấp MỌI <select> (kể cả select sinh động trong bảng) thành
   dropdown hiện đại mà KHÔNG đổi logic: vẫn dùng <select> gốc cho
   value/event. Khi chọn → set value gốc + dispatch 'change'/'input'
   nên mọi listener/đọc .value hiện có vẫn chạy y nguyên.
   Hỗ trợ: bàn phím (↑/↓/Enter/Esc/Home/End/Tab), search khi dài,
   click item, sticky search, animation mở/đóng, định vị fixed (không
   bị cắt bởi overflow của bảng/modal).
   ============================================================ */
(function () {
  const CHEVRON = '<svg class="ns-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  const CHECK = '<svg class="ns-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const SEARCH_THRESHOLD = 8; // > 8 lựa chọn thì hiện ô tìm
  let openInst = null;

  const isCompact = (sel) => sel.classList.contains('select-inline');

  function enhance(sel) {
    if (!(sel instanceof HTMLSelectElement)) return;
    if (sel.multiple || sel.dataset.nsDone) return;
    sel.dataset.nsDone = '1';

    const wrap = document.createElement('div');
    wrap.className = 'ns' + (isCompact(sel) ? ' ns-sm' : '');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('ns-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ns-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    if (sel.getAttribute('aria-label')) trigger.setAttribute('aria-label', sel.getAttribute('aria-label'));
    if (sel.title) trigger.title = sel.title;
    trigger.disabled = sel.disabled;
    trigger.innerHTML = '<span class="ns-label"></span>' + CHEVRON;
    wrap.appendChild(trigger);

    const inst = { sel, wrap, trigger, popup: null, list: null, search: null, opts: [], active: -1 };
    sel._ns = inst;
    syncLabel(inst);

    trigger.addEventListener('click', (e) => { e.preventDefault(); toggle(inst); });
    trigger.addEventListener('keydown', (e) => onTriggerKey(inst, e));
    sel.addEventListener('change', () => { if (openInst !== inst) syncLabel(inst); });
  }

  const currentOption = (sel) => sel.options[sel.selectedIndex] || null;

  function syncLabel(inst) {
    const opt = currentOption(inst.sel);
    const label = inst.trigger.querySelector('.ns-label');
    label.textContent = (opt ? opt.textContent.trim() : '') || '—';
    const placeholder = opt && (opt.disabled || opt.value === '');
    label.classList.toggle('ns-placeholder', !!placeholder);
  }

  const toggle = (inst) => (openInst === inst ? close() : open(inst));

  function open(inst) {
    if (openInst) close();
    if (inst.trigger.disabled) return;
    openInst = inst;
    inst.wrap.classList.add('ns-open');
    inst.trigger.setAttribute('aria-expanded', 'true');

    const popup = document.createElement('div');
    popup.className = 'ns-popup';
    popup.setAttribute('role', 'listbox');
    inst.popup = popup;

    if (inst.sel.options.length > SEARCH_THRESHOLD) {
      const sw = document.createElement('div');
      sw.className = 'ns-search-wrap';
      const si = document.createElement('input');
      si.type = 'text'; si.className = 'ns-search'; si.placeholder = 'Tìm…';
      si.setAttribute('aria-label', 'Tìm lựa chọn');
      sw.appendChild(si);
      popup.appendChild(sw);
      si.addEventListener('input', () => renderList(inst, si.value));
      si.addEventListener('keydown', (e) => handleListKey(inst, e));
      inst.search = si;
    }
    const list = document.createElement('div');
    list.className = 'ns-list';
    popup.appendChild(list);
    inst.list = list;

    document.body.appendChild(popup);
    renderList(inst, '');
    position(inst);
    requestAnimationFrame(() => popup.classList.add('ns-show'));
    if (inst.search) setTimeout(() => inst.search.focus(), 30);

    setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
  }

  function renderList(inst, filter) {
    const f = (filter || '').toLowerCase();
    const opts = [...inst.sel.options].filter((o) => !f || o.textContent.toLowerCase().includes(f));
    inst.opts = opts;
    const list = inst.list;
    list.innerHTML = '';
    if (!opts.length) { list.innerHTML = '<div class="ns-empty">Không có lựa chọn</div>'; return; }
    const selIdx = inst.sel.selectedIndex;
    opts.forEach((o, i) => {
      const el = document.createElement('div');
      el.className = 'ns-option' + (o.disabled ? ' ns-disabled' : '');
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', o.index === selIdx && !o.disabled ? 'true' : 'false');
      el.innerHTML = CHECK + '<span class="ns-otext"></span>';
      el.querySelector('.ns-otext').textContent = o.textContent.trim();
      if (!o.disabled) {
        el.addEventListener('mouseenter', () => setActive(inst, i));
        el.addEventListener('click', () => choose(inst, o.index));
      }
      list.appendChild(el);
    });
    let act = opts.findIndex((o) => o.index === selIdx && !o.disabled);
    if (act < 0) act = opts.findIndex((o) => !o.disabled);
    setActive(inst, act, false);
  }

  const optionEls = (inst) => [...inst.list.querySelectorAll('.ns-option')];

  function setActive(inst, i, scroll = true) {
    optionEls(inst).forEach((e) => e.classList.remove('ns-active'));
    if (i < 0 || i >= inst.opts.length) { inst.active = -1; return; }
    inst.active = i;
    const el = optionEls(inst)[i];
    if (el) { el.classList.add('ns-active'); if (scroll) el.scrollIntoView({ block: 'nearest' }); }
  }

  function moveActive(inst, dir) {
    if (!inst.opts.length) return;
    let i = inst.active;
    for (let n = 0; n < inst.opts.length; n++) {
      i += dir;
      if (i < 0) i = inst.opts.length - 1;
      if (i >= inst.opts.length) i = 0;
      if (!inst.opts[i].disabled) { setActive(inst, i); return; }
    }
  }

  function choose(inst, optIndex) {
    const o = inst.sel.options[optIndex];
    if (!o || o.disabled) return;
    if (inst.sel.selectedIndex !== optIndex) {
      inst.sel.selectedIndex = optIndex;
      inst.sel.dispatchEvent(new Event('change', { bubbles: true }));
      inst.sel.dispatchEvent(new Event('input', { bubbles: true }));
    }
    syncLabel(inst);
    close();
    inst.trigger.focus();
  }

  function close() {
    const inst = openInst;
    if (!inst) return;
    openInst = null;
    inst.wrap.classList.remove('ns-open');
    inst.trigger.setAttribute('aria-expanded', 'false');
    const popup = inst.popup;
    inst.popup = inst.list = inst.search = null;
    document.removeEventListener('mousedown', onDocDown, true);
    window.removeEventListener('scroll', onReposition, true);
    window.removeEventListener('resize', onReposition);
    if (popup) { popup.classList.remove('ns-show'); setTimeout(() => popup.remove(), 180); }
  }

  function position(inst) {
    const r = inst.trigger.getBoundingClientRect();
    const popup = inst.popup;
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.max(r.width, 184);
    popup.style.width = width + 'px';
    popup.style.left = Math.max(8, Math.min(r.left, vw - width - 8)) + 'px';
    const ph = popup.offsetHeight;
    const below = vh - r.bottom - 8;
    if (below < ph && r.top > below) {
      popup.classList.add('ns-up');
      const h = Math.min(300, r.top - 16);
      popup.style.maxHeight = h + 'px';
      popup.style.top = (r.top - Math.min(ph, h) - 6) + 'px';
    } else {
      popup.classList.remove('ns-up');
      popup.style.maxHeight = Math.min(300, below) + 'px';
      popup.style.top = (r.bottom + 6) + 'px';
    }
  }

  const onReposition = () => { if (openInst) position(openInst); };

  function onDocDown(e) {
    if (!openInst) return;
    if (openInst.popup && openInst.popup.contains(e.target)) return;
    if (openInst.wrap.contains(e.target)) return;
    close();
  }

  function onTriggerKey(inst, e) {
    if (openInst !== inst) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Spacebar'].includes(e.key)) { e.preventDefault(); open(inst); }
      return;
    }
    handleListKey(inst, e);
  }

  function handleListKey(inst, e) {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveActive(inst, 1); break;
      case 'ArrowUp': e.preventDefault(); moveActive(inst, -1); break;
      case 'Home': e.preventDefault(); setActive(inst, inst.opts.findIndex((o) => !o.disabled)); break;
      case 'End': e.preventDefault(); for (let i = inst.opts.length - 1; i >= 0; i--) { if (!inst.opts[i].disabled) { setActive(inst, i); break; } } break;
      case 'Enter': { e.preventDefault(); const o = inst.opts[inst.active]; if (o && !o.disabled) choose(inst, o.index); break; }
      case 'Escape': e.preventDefault(); close(); inst.trigger.focus(); break;
      case 'Tab': close(); break;
    }
  }

  // ---- Nâng cấp tất cả + theo dõi DOM cho select sinh động ----
  const enhanceAll = (root) => (root || document).querySelectorAll('select:not([data-ns-done])').forEach(enhance);

  function init() {
    enhanceAll(document);
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'SELECT') enhance(n);
          else if (n.querySelectorAll) n.querySelectorAll('select:not([data-ns-done])').forEach(enhance);
        }
        if (openInst) {
          for (const n of m.removedNodes) {
            if (n.nodeType === 1 && (n === openInst.sel || (n.contains && n.contains(openInst.sel)))) { close(); break; }
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // API công khai: nâng cấp & đồng bộ lại nhãn khi options đổi động
  window.NiceSelect = {
    enhance,
    enhanceAll,
    refresh(sel) { if (sel && sel._ns) syncLabel(sel._ns); else if (sel) enhance(sel); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
