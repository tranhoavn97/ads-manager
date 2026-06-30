import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { graphBase } from './config.js';
import { normalizeFbUrl } from './parsers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, 'api_calls.log');

async function logApiCall(method, pathStr, params, statusCode, duration, errorMsg, headers) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const logEntry = {
      timestamp: new Date().toISOString(),
      method,
      path: pathStr,
      params: params ? { ...params, access_token: '***' } : null,
      statusCode,
      durationMs: duration,
      error: errorMsg || null,
      rateLimit: {
        appUsage: headers?.['x-app-usage'] || null,
        adAccountUsage: headers?.['x-ad-account-usage'] || null,
        bizUsage: headers?.['x-business-use-case-usage'] || null,
      },
    };
    await fs.promises.appendFile(LOG_FILE, JSON.stringify(logEntry) + '\n', 'utf8');
    console.log(`[API Call] ${method} ${pathStr} - Status: ${statusCode} - ${duration}ms`);
  } catch (err) {
    console.error('Lỗi khi ghi log API:', err.message);
  }
}

export class MetaApiError extends Error {
  constructor(message, { code, subcode, type, fbtrace, status } = {}) {
    super(message);
    this.name = 'MetaApiError';
    this.code = code;
    this.subcode = subcode;
    this.type = type;
    this.fbtrace = fbtrace;
    this.status = status;
  }
}

const ERROR_VI = {
  190: 'Token đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại Facebook.',
  10: 'Ứng dụng chưa được cấp quyền cần thiết. Hãy duyệt app hoặc thêm vai trò cho tài khoản.',
  100: 'Tham số gửi lên không hợp lệ (sai ID, sai định dạng hoặc thiếu trường bắt buộc).',
  200: 'Tài khoản đăng nhập không đủ quyền thực hiện thao tác này trên tài nguyên đó.',
  294: 'Cần quyền ads_management để tạo/sửa quảng cáo.',
  2635: 'API này đã ngừng hỗ trợ phiên bản hiện tại. Hãy cập nhật cấu hình objective.',
  1487390: 'Tài khoản quảng cáo chưa thiết lập phương thức thanh toán hợp lệ.',
  1885183: 'Bài viết không tồn tại hoặc Page không có quyền dùng bài viết này để quảng cáo.',
};

function translateError(fbError, httpStatus) {
  const code = fbError?.code;
  const subcode = fbError?.error_subcode;
  const base = ERROR_VI[code];
  const original = fbError?.error_user_msg || fbError?.message || 'Lỗi không xác định từ Meta API';
  return new MetaApiError(base ? `${base} (Chi tiết: ${original})` : original, {
    code,
    subcode,
    type: fbError?.type,
    fbtrace: fbError?.fbtrace_id,
    status: httpStatus,
  });
}

async function call(method, path, { token, params = {}, data = null } = {}) {
  const url = `${graphBase}/${path.replace(/^\//, '')}`;
  const start = Date.now();
  try {
    const res = await axios({ method, url, params: { access_token: token, ...params }, data, timeout: 30000, headers: { 'Content-Type': 'application/json' } });
    await logApiCall(method, path, params, res.status, Date.now() - start, null, res.headers);
    return res.data;
  } catch (err) {
    let finalError = err;
    let statusCode = 502;
    if (err.response?.data?.error) {
      finalError = translateError(err.response.data.error, err.response.status);
      statusCode = err.response.status;
    } else if (err.code === 'ECONNABORTED') {
      finalError = new MetaApiError('Hết thời gian chờ phản hồi từ Meta API. Vui lòng thử lại.', { status: 408 });
      statusCode = 408;
    } else {
      finalError = new MetaApiError(`Lỗi kết nối tới Meta API: ${err.message}`, { status: 502 });
    }
    await logApiCall(method, path, params, statusCode, Date.now() - start, finalError.message, err.response?.headers);
    throw finalError;
  }
}

export async function exchangeCodeForToken({ code, appId, appSecret, redirectUri }) {
  return call('GET', 'oauth/access_token', { params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }, token: undefined });
}
export async function getLongLivedToken({ appId, appSecret, shortToken }) {
  return call('GET', 'oauth/access_token', { params: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken } });
}
export async function getMe(token) {
  try { return await call('GET', 'me', { token, params: { fields: 'id,name,picture.width(72).height(72)' } }); }
  catch { return call('GET', 'me', { token, params: { fields: 'id,name' } }); }
}
export async function getAdAccounts(token) {
  const data = await call('GET', 'me/adaccounts', { token, params: { fields: 'id,account_id,name,account_status,currency,timezone_name', limit: 200 } });
  return data.data || [];
}
export async function getPages(token) {
  const data = await call('GET', 'me/accounts', { token, params: { fields: 'id,name,username,link,access_token,tasks,picture.width(72).height(72)', limit: 200 } });
  return data.data || [];
}
export async function graphGet(token, path, params = {}) {
  return call('GET', path, { token, params });
}
export async function resolvePageSlug(token, slug) {
  return call('GET', encodeURIComponent(slug), { token, params: { fields: 'id,name' } });
}
export async function scrapePageId(slug) {
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
  try {
    const res = await axios.get(`https://m.facebook.com/${encodeURIComponent(slug)}`, { headers: { 'User-Agent': ua, 'Accept-Language': 'vi-VN,vi;q=0.9', Accept: 'text/html' }, timeout: 15000, maxRedirects: 5 });
    const html = String(res.data || '');
    const m = html.match(/"pageID":"?(\d{6,})"?/) || html.match(/"delegate_page":\s*\{\s*"id":\s*"(\d{6,})"/) || html.match(/"entity_id":"(\d{6,})"/) || html.match(/fb:\/\/page\/\?id=(\d{6,})/) || html.match(/"pageID"\s*:\s*(\d{6,})/);
    return m ? m[1] : null;
  } catch { return null; }
}
export async function checkPostExists(token, objectStoryId) {
  try { return await call('GET', objectStoryId, { token, params: { fields: 'id,from{id,name},call_to_action,message,object_id,type,attachments{media,type,target}' } }); }
  catch (err) {
    if (err instanceof MetaApiError && (err.code === 100 || err.message.includes('fields') || err.message.includes('parameter'))) return call('GET', objectStoryId, { token, params: { fields: 'id' } });
    throw err;
  }
}

function actPath(adAccountId, suffix) {
  const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  return `${id}/${suffix}`;
}
export async function createCampaign(token, adAccountId, payload) { return call('POST', actPath(adAccountId, 'campaigns'), { token, data: payload }); }
export async function createAdSet(token, adAccountId, payload) { return call('POST', actPath(adAccountId, 'adsets'), { token, data: payload }); }
export async function createAdCreative(token, adAccountId, payload) { return call('POST', actPath(adAccountId, 'adcreatives'), { token, data: payload }); }
export async function createAd(token, adAccountId, payload) { return call('POST', actPath(adAccountId, 'ads'), { token, data: payload }); }

export function isPermalinkMatch(permalinkUrl, userInputUrl, parsedId) {
  if (!permalinkUrl || !userInputUrl) return false;
  const p = normalizeFbUrl(permalinkUrl);
  const u = normalizeFbUrl(userInputUrl);
  return p === u || !!(parsedId && (permalinkUrl.includes(parsedId) || userInputUrl.includes(parsedId)));
}

function cleanPostId(id, pageId) {
  if (!id) return null;
  const s = String(id);
  if (s.includes('_')) return s;
  return pageId ? `${pageId}_${s}` : s;
}

function buildResolved(post, pageId, videoId = null) {
  const objectStoryId = cleanPostId(post.id || post.post_id, pageId);
  if (!objectStoryId) return null;
  return {
    post,
    objectStoryId,
    postId: objectStoryId.includes('_') ? objectStoryId.split('_')[1] : objectStoryId,
    videoId: videoId || post.object_id || null,
    sourceObjectId: videoId || post.object_id || null,
    permalinkUrl: post.permalink_url || post.permalink || post.link || null,
    fromPageId: post.from?.id || pageId,
  };
}

async function tryGetObject(token, id, fields) {
  try { return await call('GET', id, { token, params: { fields } }); }
  catch (err) { console.error(`Bỏ qua object ${id}:`, err.message); return null; }
}

async function directResolveVideoOrPost(token, pageId, parsedId, kind) {
  if (!parsedId) return null;
  const ids = [...new Set([parsedId, `${pageId}_${parsedId}`])];
  const postFields = 'id,post_id,permalink_url,from{id,name},created_time,type,object_id,attachments{media,type,target,url,subattachments{media,type,target,url}}';
  const videoFields = 'id,post_id,permalink_url,permalink,from{id,name},created_time,source,description,title';

  for (const id of ids) {
    const post = await tryGetObject(token, id, postFields);
    if (post?.id && (!post.from?.id || String(post.from.id) === String(pageId))) return buildResolved(post, pageId, kind === 'video' || kind === 'reel' ? parsedId : null);
  }

  if (kind === 'video' || kind === 'reel') {
    const video = await tryGetObject(token, parsedId, videoFields);
    if (video?.post_id) {
      const post = await tryGetObject(token, video.post_id, postFields);
      if (post?.id && (!post.from?.id || String(post.from.id) === String(pageId))) return buildResolved(post, pageId, video.id || parsedId);
      return buildResolved({ id: video.post_id, permalink_url: video.permalink_url || video.permalink, from: video.from }, pageId, video.id || parsedId);
    }
  }
  return null;
}

export async function resolvePostFromGraph(token, pageId, postLink, parsedId, kind) {
  const normalizedInputUrl = normalizeFbUrl(postLink);

  // Ưu tiên resolve trực tiếp Reel/Video ID trước. Nhiều link /reel/{id} chỉ chứa video_id,
  // Graph object video đôi khi trả post_id nhanh hơn việc quét feed.
  const direct = await directResolveVideoOrPost(token, pageId, parsedId, kind);
  if (direct) return direct;

  const postFields = 'id,permalink_url,from{id,name},created_time,type,object_id,attachments{media,type,target,url,subattachments{media,type,target,url}}';
  const posts = [];
  const seen = new Set();
  const addPostsFromEdge = async (edge, limit = 100) => {
    try {
      const res = await call('GET', `${pageId}/${edge}`, { token, params: { fields: postFields, limit } });
      for (const p of (Array.isArray(res?.data) ? res.data : [])) {
        if (p.id && !seen.has(p.id)) { seen.add(p.id); posts.push(p); }
      }
    } catch (err) { console.error(`Lỗi khi gọi /${pageId}/${edge}:`, err.message); }
  };

  await addPostsFromEdge('posts', 100);
  await addPostsFromEdge('published_posts', 100);
  await addPostsFromEdge('feed', 100);
  await addPostsFromEdge('promotable_posts', 100);

  const valueHasId = (value, id) => !!value && !!id && String(value).includes(String(id));
  const attachmentHasId = (att, id) => {
    if (!att || !id) return false;
    if (String(att.target?.id || '') === String(id) || String(att.media?.id || '') === String(id)) return true;
    if (valueHasId(att.url, id) || valueHasId(att.target?.url, id) || valueHasId(att.media?.source, id)) return true;
    return (att.subattachments?.data || []).some((child) => attachmentHasId(child, id));
  };
  const containsVideoId = (post, videoId) => {
    if (!videoId) return false;
    if (String(post.object_id || '') === String(videoId)) return true;
    if (valueHasId(post.permalink_url, videoId)) return true;
    return (post.attachments?.data || []).some((att) => attachmentHasId(att, videoId));
  };

  for (const post of posts) {
    const isUrlMatch = normalizeFbUrl(post.permalink_url) === normalizedInputUrl;
    const isVideoMatch = (kind === 'reel' || kind === 'video') && containsVideoId(post, parsedId);
    const isIdMatch = post.id === parsedId || post.id === `${pageId}_${parsedId}`;
    if (isUrlMatch || isVideoMatch || isIdMatch) return buildResolved(post, pageId, (kind === 'reel' || kind === 'video') ? parsedId : findAttachmentVideoId(post.attachments?.data || []));
  }

  const video = parsedId && (kind === 'reel' || kind === 'video') ? await findPageVideoById(token, pageId, parsedId) : null;
  if (video?.post_id) {
    const post = await tryGetObject(token, video.post_id, postFields);
    if (post?.id && (!post.from?.id || String(post.from.id) === String(pageId))) return buildResolved(post, pageId, video.id || parsedId);
    return buildResolved({ id: video.post_id, permalink_url: video.permalink_url, from: video.from }, pageId, video.id || parsedId);
  }

  return null;
}

function findAttachmentVideoId(attachments) {
  for (const att of attachments || []) {
    if (att.target?.id) return att.target.id;
    if (att.media?.id) return att.media.id;
    const nested = findAttachmentVideoId(att.subattachments?.data || []);
    if (nested) return nested;
  }
  return null;
}

async function findPageVideoById(token, pageId, videoId) {
  const fields = 'id,post_id,permalink_url,from{id,name},created_time,source,description,title';
  for (const edge of ['videos', 'video_reels']) {
    try {
      const res = await call('GET', `${pageId}/${edge}`, { token, params: { fields, limit: 100 } });
      const found = (Array.isArray(res?.data) ? res.data : []).find((v) => String(v.id) === String(videoId) || String(v.post_id || '').includes(videoId) || String(v.permalink_url || '').includes(videoId));
      if (found) return found;
    } catch (err) { console.error(`Lỗi khi gọi /${pageId}/${edge}:`, err.message); }
  }
  return null;
}

export async function verifyPostDetails(token, objectStoryId) {
  return call('GET', objectStoryId, { token, params: { fields: 'id,permalink_url,from{id,name},created_time,call_to_action,message,object_id,type,attachments{media,type,target}' } });
}
export async function updatePostCta(token, objectStoryId, ctaType, ctaLink) {
  const payload = { call_to_action: { type: ctaType } };
  if (ctaLink) payload.call_to_action.value = { link: ctaLink };
  return call('POST', objectStoryId, { token, data: payload });
}
export async function getAdCreative(token, creativeId, fields = 'id,object_story_id,effective_object_story_id,call_to_action') {
  return call('GET', creativeId, { token, params: { fields } });
}
export async function uploadAdImageFromUrl(token, adAccountId, imageUrl) {
  const data = await call('POST', actPath(adAccountId, 'adimages'), { token, data: { url: imageUrl } });
  const keys = Object.keys(data?.images || {});
  if (keys.length > 0) return data.images[keys[0]].hash;
  throw new Error('Không lấy được hash ảnh từ Meta API.');
}

async function getAllPages(token, path, params, maxItems = 5000) {
  let out = [];
  let data = await call('GET', path, { token, params });
  while (data) {
    if (Array.isArray(data.data)) out = out.concat(data.data);
    if (out.length >= maxItems) break;
    const next = data.paging?.cursors?.after;
    if (!next || !data.paging?.next) break;
    await new Promise((r) => setTimeout(r, 120));
    data = await call('GET', path, { token, params: { ...params, after: next } });
  }
  return out;
}

const INSIGHTS_FIELDS = 'spend,impressions,reach,clicks,ctr,cpm,actions';
export async function getInsights(token, adAccountId, level, datePreset) {
  const idField = level === 'campaign' ? 'campaign_id' : level === 'adset' ? 'adset_id' : 'ad_id';
  const rows = await getAllPages(token, actPath(adAccountId, 'insights'), { level, date_preset: datePreset || 'last_30d', fields: `${idField},${INSIGHTS_FIELDS}`, limit: 200 }, 4000);
  const map = {};
  for (const r of rows) if (r[idField]) map[r[idField]] = r;
  return map;
}
export async function getCampaigns(token, adAccountId) {
  return getAllPages(token, actPath(adAccountId, 'campaigns'), { fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,bid_strategy,start_time,stop_time,created_time,updated_time', limit: 100 });
}
export async function getCampaignAdSets(token, campaignId) {
  return getAllPages(token, `${campaignId}/adsets`, { fields: 'id,name,status,effective_status,campaign_id,optimization_goal,billing_event,daily_budget,lifetime_budget,budget_remaining,bid_strategy,targeting,start_time,end_time', limit: 100 });
}
export async function getAdSets(token, adAccountId) {
  return getAllPages(token, actPath(adAccountId, 'adsets'), { fields: 'id,name,status,effective_status,campaign_id,optimization_goal,billing_event,daily_budget,lifetime_budget,budget_remaining,bid_strategy,start_time,end_time', limit: 100 });
}
export async function getAds(token, adAccountId) {
  return getAllPages(token, actPath(adAccountId, 'ads'), { fields: 'id,name,status,effective_status,adset_id,campaign_id,creative{id,thumbnail_url,object_story_id,effective_object_story_id}', limit: 100 });
}
export async function updateNode(token, id, payload) { return call('POST', String(id), { token, data: payload }); }
export async function deleteNode(token, id) { return call('DELETE', String(id), { token }); }
export async function duplicateNode(token, id, level) {
  const data = { status_option: 'PAUSED' };
  if (level === 'campaign') data.deep_copy = true;
  return call('POST', `${id}/copies`, { token, data });
}
export async function getTokenPermissions(token) {
  const res = await call('GET', 'me/permissions', { token });
  return res.data || [];
}
