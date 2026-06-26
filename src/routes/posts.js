import express from 'express';
import { requireAuth } from './auth.js';
import { config } from '../config.js';

// ============================================================
//  Quản lý & dọn dẹp bài viết Page (port từ module "Meta Page Manager")
//  - Dùng access token trong session (req.session.fbToken)
//  - Token của Page resolve phía server, KHÔNG gửi cho trình duyệt
//  - Có đọc rate-limit để frontend tự cooldown khi bị Meta chặn
// ============================================================

const router = express.Router();
const GBASE = `https://graph.facebook.com/${config.apiVersion}`;

// fetch + bắt rate-limit (port backendFetchJson)
async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const ct = response.headers.get('content-type') || '';
  const text = await response.text();

  const rl = {
    appUsage: response.headers.get('x-app-usage'),
    pageUsage: response.headers.get('x-page-usage'),
    businessUsage: response.headers.get('x-business-use-case-usage'),
    retryAfter: response.headers.get('retry-after'),
    cooldownMs: 0,
    retryAfterSeconds: null,
  };
  if (rl.retryAfter) {
    const s = parseInt(rl.retryAfter, 10);
    if (!isNaN(s) && s > 0) { rl.cooldownMs = s * 1000; rl.retryAfterSeconds = s; }
  } else if (rl.businessUsage) {
    try {
      const obj = JSON.parse(rl.businessUsage);
      let maxMin = 0;
      for (const k of Object.keys(obj)) {
        const items = obj[k];
        if (Array.isArray(items)) {
          for (const it of items) {
            if (it.estimated_time_to_regain_access && it.estimated_time_to_regain_access > maxMin) {
              maxMin = it.estimated_time_to_regain_access;
            }
          }
        }
      }
      if (maxMin > 0) { rl.cooldownMs = maxMin * 60 * 1000; rl.retryAfterSeconds = maxMin * 60; }
    } catch { /* ignore */ }
  }

  let data = null;
  if (ct.includes('application/json')) { try { data = JSON.parse(text); } catch { /* not json */ } }
  if (data === true) return { success: true, _rl: rl };
  if (data && typeof data === 'object') { data._rl = rl; return data; }
  if (text.trim() === 'true') return { success: true, _rl: rl };
  if (!response.ok) return { error: { message: `API Error ${response.status}: ${text.slice(0, 300)}` }, _rl: rl };
  return { _raw: text, _rl: rl };
}

// ---------- Cache token của Page theo user token ----------
const pageCache = new Map(); // userToken -> { pages, map, ts }
const TTL = 10 * 60 * 1000;

async function loadPages(userToken) {
  const cached = pageCache.get(userToken);
  if (cached && Date.now() - cached.ts < TTL) return cached;

  let url = `${GBASE}/me/accounts?fields=id,name,access_token,category,picture{url},tasks&access_token=${userToken}&limit=100`;
  let pages = [];
  while (url && pages.length < 500) {
    const data = await fetchJson(url);
    if (data.error) { if (pages.length === 0) throw new Error(data.error.message || 'Lỗi tải danh sách Page'); break; }
    pages = pages.concat(data.data || []);
    url = data.paging?.next || null;
    if (url) await new Promise((r) => setTimeout(r, 250));
  }
  const map = new Map();
  for (const p of pages) map.set(p.id, p);
  const entry = { pages, map, ts: Date.now() };
  pageCache.set(userToken, entry);
  return entry;
}

function pageToken(entry, pageId, userToken) {
  const p = entry.map.get(pageId);
  return p?.access_token || userToken;
}

// ---------- Danh sách Page (kèm ảnh, quyền) ----------
router.get('/pages', requireAuth, async (req, res) => {
  try {
    const { pages } = await loadPages(req.session.fbToken);
    res.json({
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category || '',
        picture: p.picture?.data?.url || '',
        tasks: p.tasks || [],
        canManage: Array.isArray(p.tasks) ? (p.tasks.includes('MANAGE') || p.tasks.includes('CREATE_CONTENT')) : true,
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- Quét bài viết 1 Page (post + video, gộp & khử trùng) ----------
router.post('/scan', requireAuth, async (req, res) => {
  const { pageId, contentType = 'all', limit = 100 } = req.body || {};
  if (!pageId) return res.status(400).json({ error: 'Thiếu pageId' });

  try {
    const entry = await loadPages(req.session.fbToken);
    const token = pageToken(entry, pageId, req.session.fbToken);
    const pageName = entry.map.get(pageId)?.name || 'Page';
    const want = Math.max(1, Math.min(parseInt(limit, 10) || 100, 500));
    const per = Math.min(want, 100);
    let rateLimit = null;

    let posts = [];
    let videos = [];

    const fetchPosts = async () => {
      if (contentType === 'video') return;
      let url = `${GBASE}/${pageId}/posts?fields=id,message,story,created_time,permalink_url,status_type,full_picture,attachments{media,type,url,target},likes.summary(true),comments.summary(true),shares&access_token=${token}&limit=${per}`;
      while (url && posts.length < want) {
        const data = await fetchJson(url);
        if (data._rl) rateLimit = data._rl;
        if (data.error) { if (posts.length === 0) throw Object.assign(new Error(data.error.message), { rl: data._rl }); break; }
        posts = posts.concat(data.data || []);
        if (!(data.data || []).length || posts.length >= want) break;
        url = data.paging?.next || null;
      }
    };
    const fetchVideos = async () => {
      if (contentType === 'post') return;
      let url = `${GBASE}/${pageId}/videos?fields=id,title,description,created_time,permalink_url,picture&access_token=${token}&limit=${per}`;
      while (url && videos.length < want) {
        const data = await fetchJson(url);
        if (data._rl) rateLimit = data._rl;
        if (data.error) break;
        videos = videos.concat(data.data || []);
        if (!(data.data || []).length || videos.length >= want) break;
        url = data.paging?.next || null;
      }
    };

    await Promise.all([fetchPosts().catch((e) => { throw e; }), fetchVideos()]);

    const postsMapped = posts.map((item) => {
      const src = item.attachments?.data?.[0]?.target?.id;
      const isVideo = item.status_type === 'added_video'
        || item.attachments?.data?.[0]?.type === 'video'
        || (item.status_type === 'shared_story' && item.attachments?.data?.[0]?.type === 'video');
      return {
        id: item.id, postId: item.id, sourceObjectId: src || null,
        pageId, pageName,
        message: item.message || item.story || '',
        created_time: item.created_time,
        permalink_url: item.permalink_url || '',
        full_picture: item.full_picture || '',
        itemType: isVideo ? 'video' : 'post',
        likes: item.likes?.summary?.total_count || 0,
        comments: item.comments?.summary?.total_count || 0,
        shares: item.shares?.count || 0,
      };
    });
    const videosMapped = videos.map((v) => ({
      id: `${pageId}_${v.id}`, postId: `${pageId}_${v.id}`, sourceObjectId: v.id,
      pageId, pageName,
      message: v.title || v.description || '',
      created_time: v.created_time,
      permalink_url: v.permalink_url || '',
      full_picture: v.picture || '',
      itemType: 'video', likes: 0, comments: 0, shares: 0,
    }));

    // Gộp & khử trùng theo sourceObjectId / id
    const uniq = new Map();
    for (const p of postsMapped) uniq.set(p.id, p);
    for (const v of videosMapped) {
      let key = null;
      for (const [k, e] of uniq.entries()) {
        if ((e.sourceObjectId && e.sourceObjectId === v.sourceObjectId) || e.id === v.id) { key = k; break; }
      }
      if (key) {
        const e = uniq.get(key);
        e.sourceObjectId = v.sourceObjectId; e.itemType = 'video';
        if (!e.full_picture) e.full_picture = v.full_picture;
      } else uniq.set(v.id, v);
    }

    res.json({ posts: Array.from(uniq.values()).slice(0, want), rateLimit });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Lỗi quét bài viết', rateLimit: err.rl || null });
  }
});

// ---------- Xoá 1 bài viết (có xác minh) ----------
router.post('/delete', requireAuth, async (req, res) => {
  const { postId, pageId: bodyPageId, itemType, sourceObjectId, deleteSource } = req.body || {};
  if (!postId) return res.status(400).json({ error: 'Thiếu postId' });
  const pageId = bodyPageId || (postId.includes('_') ? postId.split('_')[0] : null);
  if (!pageId) return res.status(400).json({ error: 'Không xác định được pageId' });

  let target = postId;
  if ((itemType === 'video' || itemType === 'reel') && deleteSource && sourceObjectId) target = sourceObjectId;

  try {
    const entry = await loadPages(req.session.fbToken);
    const token = pageToken(entry, pageId, req.session.fbToken);

    const del = await fetchJson(`${GBASE}/${target}?access_token=${token}`, { method: 'DELETE' });
    const rl = del._rl || null;

    if (del.error) {
      return res.status(400).json({ success: false, error: del.error.message || 'Meta API từ chối xoá', rateLimit: rl });
    }
    if (!(del === true || del.success === true)) {
      return res.status(400).json({ success: false, error: 'Meta không xác nhận xoá thành công.', rateLimit: rl });
    }

    // Xác minh: thử đọc lại object, nếu 404/100 ⇒ đã xoá
    try {
      const check = await fetchJson(`${GBASE}/${target}?fields=id&access_token=${token}`);
      const code = check.error?.code;
      const msg = check.error?.message || '';
      const gone = code === 100 || code === 803 || /does not exist|Unsupported get request/i.test(msg) || (!check.id && check.error);
      if (check.id && !gone) {
        return res.status(400).json({ success: false, verified: false, error: 'Xác minh thất bại: đối tượng vẫn tồn tại sau khi xoá.', rateLimit: rl });
      }
    } catch { /* coi như đã xoá nếu lỗi đọc lại */ }

    res.json({ success: true, verified: true, deletedObjectId: target, pageId, rateLimit: rl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Lỗi máy chủ khi xoá' });
  }
});

// ---------- Kiểm tra trạng thái Page ----------
router.post('/page-status', requireAuth, async (req, res) => {
  const { pageId } = req.body || {};
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId' });
  try {
    const entry = await loadPages(req.session.fbToken);
    const token = pageToken(entry, pageId, req.session.fbToken);

    let info = null, infoError = null, tasks = [];
    const data = await fetchJson(`${GBASE}/${pageId}?fields=id,name,category,tasks&access_token=${token}`);
    if (data.error) infoError = data.error.message || 'Lỗi không xác định';
    else { info = data; tasks = data.tasks || []; }

    let postsOk = false, postsError = null;
    if (!infoError || !/OAuth/i.test(infoError)) {
      const pd = await fetchJson(`${GBASE}/${pageId}/posts?fields=id&limit=1&access_token=${token}`);
      if (pd.error) postsError = pd.error.message; else postsOk = true;
    }

    const hasManage = tasks.includes('MANAGE') || tasks.includes('CREATE_CONTENT');
    let status = 'Bình thường', detail = '';
    if (infoError && /OAuth|expired|session/i.test(infoError)) { status = 'Token lỗi / hết hạn'; detail = infoError; }
    else if (infoError && /permission|tasks|privilege/i.test(infoError)) { status = 'Thiếu quyền'; detail = infoError; }
    else if (tasks.length && !hasManage) { status = 'Thiếu quyền MANAGE'; detail = 'Tài khoản thiếu quyền quản trị MANAGE/CREATE_CONTENT.'; }
    else if (postsError) { status = 'Không lấy được bài'; detail = postsError; }
    else if (!info) { status = 'Cần kiểm tra thủ công'; detail = infoError || ''; }
    if (infoError && /restricted|disabled/i.test(infoError)) { status = 'Nghi bị hạn chế'; detail = infoError; }

    res.json({ success: true, data: { pageId, name: info?.name || entry.map.get(pageId)?.name || '—', category: info?.category || '', tasks, status, detail, postsOk } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Business Manager ----------
router.get('/businesses', requireAuth, async (req, res) => {
  try {
    const data = await fetchJson(`${GBASE}/me/businesses?fields=id,name,primary_page&access_token=${req.session.fbToken}&limit=100`);
    if (data.error) {
      const miss = /OAuthException|permission|required/i.test(data.error.message || '');
      return res.json({ success: true, data: [], hasPermission: !miss, error: miss ? 'Chưa cấp quyền business_management' : data.error.message });
    }
    res.json({ success: true, data: data.data || [], hasPermission: true });
  } catch (err) {
    res.json({ success: true, data: [], hasPermission: false, error: err.message });
  }
});

router.post('/business-map', requireAuth, async (req, res) => {
  const { businessId } = req.body || {};
  if (!businessId) return res.status(400).json({ success: false, error: 'Thiếu businessId' });
  try {
    const t = req.session.fbToken;
    const [owned, client] = await Promise.all([
      fetchJson(`${GBASE}/${businessId}/owned_pages?fields=id,name&access_token=${t}&limit=100`),
      fetchJson(`${GBASE}/${businessId}/client_pages?fields=id,name&access_token=${t}&limit=100`),
    ]);
    res.json({
      success: true,
      data: {
        businessId,
        ownedPages: owned.error ? [] : (owned.data || []),
        clientPages: client.error ? [] : (client.data || []),
        errors: { ownedError: owned.error?.message || null, clientError: client.error?.message || null },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
