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
 * Phân tích Page ID từ tên/link Page.
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

  // Nếu chỉ là vanity/name trực tiếp (không phải URL).
  // Cho phép cả tên Page có dấu/khoảng trắng để map với Page đang quản lý.
  if (!raw.includes('/') && !raw.includes('\\') && !/^https?:/i.test(raw) && !raw.toLowerCase().includes('facebook') && !raw.toLowerCase().includes('fb.com')) {
    return { id: null, slug: raw, needsResolve: true, error: null };
  }

  const url = tryParseUrl(raw);
  if (!url || !isFacebookHost(url)) {
    return { id: null, slug: null, needsResolve: false, error: 'Tên/Link Page không phải domain Facebook hợp lệ' };
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

  // /people/<name>/<id>
  if (segments[0] === 'people' && segments.length >= 3 && /^\d+$/.test(segments[segments.length - 1])) {
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

  // Các path hệ thống của FB không phải page
  const ignoredPaths = new Set(['groups', 'events', 'marketplace', 'gaming', 'watch', 'live', 'photos', 'videos', 'reels', 'reel', 'stories', 'ads']);
  if (ignoredPaths.has(segments[0]?.toLowerCase())) {
    return { id: null, slug: null, needsResolve: false, error: `Tên/Link Page không hợp lệ (đường dẫn ${segments[0]} là của hệ thống)` };
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

  // /video/<id>
  const videoIdx = segments.indexOf('video');
  if (videoIdx !== -1 && segments[videoIdx + 1]) {
    return numericOrOpaque(segments[videoIdx + 1], null, 'video');
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

/**
 * Lấy vanity/slug Page từ các link bài viết có dạng /<page>/posts|videos|photos/...
 * Không xử lý các link hệ thống như /reel/<id> vì URL không chứa Page.
 */
export function parsePageSlugFromPostLink(input) {
  const raw = (input ?? '').toString().trim();
  if (!raw || /^\d+$/.test(raw) || /^(\d+)_(\d+)$/.test(raw)) return null;

  const url = tryParseUrl(raw);
  if (!url || !isFacebookHost(url)) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const first = segments[0]?.toLowerCase();
  const second = segments[1]?.toLowerCase();
  const ignoredFirst = new Set([
    'groups', 'events', 'marketplace', 'gaming', 'watch', 'live',
    'photo.php', 'permalink.php', 'story.php', 'reel', 'reels',
    'video', 'videos', 'photos', 'stories', 'ads', 'share', 'shares'
  ]);
  if (!first || ignoredFirst.has(first)) return null;

  if (['posts', 'videos', 'photos'].includes(second)) return segments[0];
  return null;
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

/**
 * Chuẩn hoá URL Facebook để so sánh lỏng (bỏ protocol, www, m., mobile, web, query param không cần thiết).
 */
export function normalizeFbUrl(urlStr) {
  if (!urlStr) return '';
  let clean = urlStr.trim().toLowerCase();
  
  // Xóa protocol
  clean = clean.replace(/^https?:\/\//, '');
  
  // Chuẩn hoá subdomains về facebook.com
  clean = clean.replace(/^(www|m|mobile|web|business)\.facebook\.com/, 'facebook.com');
  clean = clean.replace(/^fb\.com/, 'facebook.com');
  clean = clean.replace(/^www\.fb\.com/, 'facebook.com');
  
  try {
    const url = new URL('https://' + clean);
    const pathname = url.pathname.replace(/\/$/, '');
    
    // Check if it's a query-based Facebook post URL
    const isQueryBased = pathname.includes('permalink.php') || 
                         pathname.includes('story.php') || 
                         pathname.includes('photo.php') || 
                         pathname.includes('watch') ||
                         pathname.includes('photo');
    
    if (isQueryBased) {
      const allowedParams = ['story_fbid', 'fbid', 'id', 'v'];
      const searchParams = new URLSearchParams();
      for (const param of allowedParams) {
        if (url.searchParams.has(param)) {
          searchParams.set(param, url.searchParams.get(param));
        }
      }
      const search = searchParams.toString();
      return `facebook.com${pathname}${search ? '?' + search : ''}`;
    } else {
      // For path-based URLs, discard query params entirely
      return `facebook.com${pathname}`;
    }
  } catch (e) {
    // Fallback simple clean if URL parsing fails
    return clean.split('?')[0].replace(/\/$/, '');
  }
}
