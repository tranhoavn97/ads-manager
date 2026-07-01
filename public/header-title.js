/* header-title.js — Hiển thị tiêu đề trang hiện tại ở thanh header (.sb-foot).
   Độc lập với app.js: đọc mục đang active ở sidebar và mirror sang header.
   Nạp sau cùng trong index.html. */
(function () {
  function init() {
    var foot = document.querySelector('.sb-foot');
    if (!foot) { return setTimeout(init, 150); }

    // Tạo phần tử tiêu đề nếu chưa có, đặt làm phần tử ĐẦU của header (bên trái)
    var title = document.getElementById('appHeaderTitle');
    if (!title) {
      title = document.createElement('h1');
      title.id = 'appHeaderTitle';
      title.className = 'app-header-title';
      foot.insertBefore(title, foot.firstChild);
    }

    function currentLabel() {
      var active = document.querySelector('.sb-item.active');
      if (!active) return '';
      var lbl = active.querySelector('.sb-label');
      return (lbl ? lbl.textContent : active.textContent).trim();
    }

    function update() {
      var text = currentLabel();
      title.textContent = text;
      // Ẩn tiêu đề khi ở màn đăng nhập (sidebar ẩn) hoặc không có mục nào
      var sb = document.getElementById('sidebar');
      var hidden = !text || (sb && sb.classList.contains('hidden'));
      title.style.display = hidden ? 'none' : '';
    }

    update();

    // ── Badge trạng thái trên avatar (thay cho chữ "Đang hoạt động") ──
    setupAvatarStatus();

    // Theo dõi đổi mục (class 'active') và đổi trạng thái sidebar
    var nav = document.querySelector('.sb-nav') || document.body;
    new MutationObserver(update).observe(nav, {
      subtree: true, attributes: true, attributeFilter: ['class']
    });
    var sb = document.getElementById('sidebar');
    if (sb) {
      new MutationObserver(update).observe(sb, {
        attributes: true, attributeFilter: ['class']
      });
    }
    // Cập nhật lại sau khi app.js khởi tạo xong
    setTimeout(update, 300);
    setTimeout(update, 900);
  }

  // Bọc avatar trong 1 wrapper có chấm trạng thái ở góc dưới-phải,
  // đồng bộ màu (xanh = hoạt động / xám = không khả dụng) từ #accDot.
  function setupAvatarStatus() {
    var user = document.getElementById('userBadge');
    var avatar = document.getElementById('userAvatar');
    if (!user || !avatar) return;

    if (!avatar.parentElement || !avatar.parentElement.classList.contains('av-wrap')) {
      var wrap = document.createElement('span');
      wrap.className = 'av-wrap';
      avatar.parentNode.insertBefore(wrap, avatar);
      wrap.appendChild(avatar);
      var dot = document.createElement('span');
      dot.className = 'av-status';
      wrap.appendChild(dot);
    }

    function syncStatus() {
      var accDot = document.getElementById('accDot');
      var bad = accDot ? accDot.classList.contains('bad') : false;
      user.classList.toggle('acc-bad', bad);
    }
    syncStatus();

    var accDot = document.getElementById('accDot');
    if (accDot) {
      new MutationObserver(syncStatus).observe(accDot, {
        attributes: true, attributeFilter: ['class']
      });
    }
    setTimeout(syncStatus, 300);
    setTimeout(syncStatus, 900);
  }

  // Tìm kiếm Page trong cột trái của "Dọn dẹp bài viết".
  // Lọc client-side theo tên; tự áp lại sau mỗi lần posts.js render lại chip.
  function setupPostsPageSearch() {
    var input = document.getElementById('postsPageSearch');
    var box = document.getElementById('postsPages');
    if (!input || !box) return setTimeout(setupPostsPageSearch, 200);
    if (input.dataset.wired) return;
    input.dataset.wired = '1';

    function apply() {
      var q = (input.value || '').trim().toLowerCase();
      box.querySelectorAll('.pp-chip').forEach(function (chip) {
        var name = (chip.querySelector('.pp-name') || chip).textContent.toLowerCase();
        chip.style.display = (!q || name.indexOf(q) !== -1) ? '' : 'none';
      });
    }
    input.addEventListener('input', apply);
    // posts.js render lại #postsPages khi chọn/tải Page → áp lại bộ lọc
    new MutationObserver(apply).observe(box, { childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); setupPostsPageSearch(); });
  } else {
    init();
    setupPostsPageSearch();
  }
})();
