// ============================================================
//  Bộ phân tích link Facebook -> Page ID và Post/Object ID
// ============================================================

const FB_HOSTS = new Set([
  'facebook.com', 'www.facebook.com', 'm.facebook.com',
  'web.facebook.com', 'fb.com', 'www.fb.com', 'business.facebook.com',
]);

function tryParseUrl(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

function isFacebookHost(url) {
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^m\./, 'www.');
  return FB_HOSTS.has(url.hostname.toLowerCase()) || FB_HOSTS.has(host);
}

/**
 * Phân tích Page ID từ link Page.
 * Trả về: { id, slug, needsResolve, error }
 *  - id: Page ID dạng số nếu lấy được trực tiếp
 *  - slug: tên vanity (vd "highlandscoffee") cần gọi Graph API để lấy ID số
 *  - needsResolve: true nếu phải gọi API mới ra ID số
 */
export function parsePageId(input) {
  const raw = (input ?? '').toString().trim();
  if (!raw) return { id: null, slug: null, needsResolve: false, error: 'Thiếu link/ID Page' };

  // Đã là ID số thuần
  if (/^\d+$/.test(raw)) {
    return { id: raw, slug: null, needsResolve: false, error: null };
  }

  const url = tryParseUrl(raw);
  if (!url || !isFacebookHost(url)) {
    return { id: null, slug: null, needsResolve: false, error: 'Link Page không phải domain Facebook hợp lệ' };
  }

  // profile.php?id=NUM
  const profileId = url.searchParams.get('id');
  if (profileId && /^\d+$/.test(profileId)) {
    return { id: profileId, slug: null, needsResolve: false, error: null };
  }

  const segments = url.pathname.split('/').filter(Boolean);

  // /pages/<name>/<id>
  if (segments[0] === 'pages' && segments.length >= 3 && /^\d+$/.test(segments[segments.length - 1])) {
    return { id: segments[segments.length - 1], slug: null, needsResolve: false, error: null };
  }

  // /<name>-<id>  (vanity có hậu tố ID số)
  if (segments.length >= 1) {
    const last = segments[segments.length - 1];
    const dashMatch = last.match(/-(\d{6,})$/);
    if (dashMatch) {
      return { id: dashMatch[1], slug: null, needsResolve: false, error: null };
    }
  }

  // /<id> là số
  if (segments.length === 1 && /^\d+$/.test(segments[0])) {
    return { id: segments[0], slug: null, needsResolve: false, error: null };
  }

  // /profile.php không có id -> không xác định
  if (segments[0] === 'profile.php') {
    return { id: null, slug: null, needsResolve: false, error: 'Không tìm thấy id trong link profile' };
  }

  // Vanity name -> cần resolve qua Graph API
  const slug = segments[0];
  if (slug) {
    return { id: null, slug, needsResolve: true, error: null };
  }

  return { id: null, slug: null, needsResolve: false, error: 'Không nhận dạng được Page từ link' };
}

/**
 * Phân tích Post/Object ID từ link bài viết, reel, ảnh hoặc video.
 * Trả về: { postId, pageIdFromLink, kind, opaque, error }
 *  - kind: 'post' | 'photo' | 'video' | 'reel' | 'story'
 *  - opaque: true nếu là pfbid... (token mã hoá, không phải ID số) -> cần ID số
 */
export function parsePostId(input) {
  const raw = (input ?? '').toString().trim();
  if (!raw) return { postId: null, pageIdFromLink: null, kind: null, opaque: false, error: 'Thiếu link bài viết' };

  // Định dạng {pageId}_{postId} đã sẵn
  const composite = raw.match(/^(\d+)_(\d+)$/);
  if (composite) {
    return { postId: composite[2], pageIdFromLink: composite[1], kind: 'post', opaque: false, error: null };
  }

  // ID số thuần
  if (/^\d+$/.test(raw)) {
    return { postId: raw, pageIdFromLink: null, kind: 'post', opaque: false, error: null };
  }

  const url = tryParseUrl(raw);
  if (!url || !isFacebookHost(url)) {
    return { postId: null, pageIdFromLink: null, kind: null, opaque: false, error: 'Link bài viết không phải domain Facebook hợp lệ' };
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const qp = url.searchParams;

  // permalink.php?story_fbid=...&id=<pageId>
  const storyFbid = qp.get('story_fbid');
  if (storyFbid) {
    const pid = qp.get('id');
    return numericOrOpaque(storyFbid, pid, 'post');
  }

  // /photo/?fbid=...  hoặc ?fbid=...
  const fbid = qp.get('fbid');
  if (fbid) {
    return numericOrOpaque(fbid, qp.get('id'), 'photo');
  }

  // /watch/?v=<videoId>
  const v = qp.get('v');
  if (v) {
    return numericOrOpaque(v, null, 'video');
  }

  // /reel/<id>
  const reelIdx = segments.indexOf('reel');
  if (reelIdx !== -1 && segments[reelIdx + 1]) {
    return numericOrOpaque(segments[reelIdx + 1], null, 'reel');
  }
  // /reels/<id>
  const reelsIdx = segments.indexOf('reels');
  if (reelsIdx !== -1 && segments[reelsIdx + 1]) {
    return numericOrOpaque(segments[reelsIdx + 1], null, 'reel');
  }

  // /<page>/posts/<id>
  const postsIdx = segments.indexOf('posts');
  if (postsIdx !== -1 && segments[postsIdx + 1]) {
    return numericOrOpaque(segments[postsIdx + 1], null, 'post');
  }

  // /<page>/photos/.../<id>
  const photosIdx = segments.indexOf('photos');
  if (photosIdx !== -1) {
    const last = segments[segments.length - 1];
    return numericOrOpaque(last, null, 'photo');
  }

  // /<page>/videos/<id>
  const videosIdx = segments.indexOf('videos');
  if (videosIdx !== -1 && segments[segments.length - 1]) {
    return numericOrOpaque(segments[segments.length - 1], null, 'video');
  }

  // /story.php?story_fbid=...&id=...  (đã xử lý qua query phía trên)

  // Phần tử số cuối cùng trong path
  const lastNumeric = [...segments].reverse().find((s) => /^\d{5,}$/.test(s));
  if (lastNumeric) {
    return numericOrOpaque(lastNumeric, null, 'post');
  }

  // pfbid trong path
  const pfbid = segments.find((s) => /^pfbid/i.test(s));
  if (pfbid) {
    return { postId: null, pageIdFromLink: null, kind: 'post', opaque: true,
      error: 'Link dạng pfbid không chứa ID số. Hãy thay bằng ID bài viết dạng số hoặc {pageId}_{postId}.' };
  }

  return { postId: null, pageIdFromLink: null, kind: null, opaque: false, error: 'Không nhận dạng được bài viết/reel/ảnh từ link' };
}

function numericOrOpaque(idCandidate, pageIdFromLink, kind) {
  if (/^\d+$/.test(idCandidate)) {
    return { postId: idCandidate, pageIdFromLink: pageIdFromLink && /^\d+$/.test(pageIdFromLink) ? pageIdFromLink : null, kind, opaque: false, error: null };
  }
  if (/^pfbid/i.test(idCandidate)) {
    return { postId: null, pageIdFromLink: null, kind, opaque: true,
      error: 'Link dạng pfbid không chứa ID số. Hãy thay bằng ID bài viết dạng số hoặc {pageId}_{postId}.' };
  }
  return { postId: null, pageIdFromLink: null, kind, opaque: false, error: 'ID bài viết không hợp lệ' };
}

/**
 * Dựng object_story_id = {pageId}_{postId} để boost bài viết có sẵn.
 */
export function buildObjectStoryId(pageId, postId) {
  if (!pageId || !postId) return null;
  return `${pageId}_${postId}`;
}
