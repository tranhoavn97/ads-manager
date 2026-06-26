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
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const appUsage = headers?.['x-app-usage'] || null;
    const adAccountUsage = headers?.['x-ad-account-usage'] || null;
    const bizUsage = headers?.['x-business-use-case-usage'] || null;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      method,
      path: pathStr,
      params: params ? { ...params, access_token: '***' } : null,
      statusCode,
      durationMs: duration,
      error: errorMsg || null,
      rateLimit: {
        appUsage,
        adAccountUsage,
        bizUsage
      }
    };
    
    await fs.promises.appendFile(LOG_FILE, JSON.stringify(logEntry) + '\n', 'utf8');
    console.log(`[API Call] ${method} ${pathStr} - Status: ${statusCode} - ${duration}ms${appUsage ? ` (App: ${appUsage})` : ''}`);
  } catch (err) {
    console.error('Lỗi khi ghi log API:', err.message);
  }
}

// ============================================================
//  Lớp bọc Meta Marketing API (Graph API)
//  - Tất cả lời gọi đều dùng access token của phiên đăng nhập
//  - Lỗi Graph API được chuẩn hoá và dịch sang tiếng Việt
// ============================================================

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

// Bản đồ mã lỗi phổ biến của Meta -> thông điệp tiếng Việt
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
  const message = base ? `${base} (Chi tiết: ${original})` : original;
  return new MetaApiError(message, {
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
    const res = await axios({
      method,
      url,
      params: { access_token: token, ...params },
      data,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
    const duration = Date.now() - start;
    await logApiCall(method, path, params, res.status, duration, null, res.headers);
    return res.data;
  } catch (err) {
    const duration = Date.now() - start;
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
    await logApiCall(method, path, params, statusCode, duration, finalError.message, err.response?.headers);
    throw finalError;
  }
}

// --------- Đăng nhập / thông tin người dùng ---------

export async function exchangeCodeForToken({ code, appId, appSecret, redirectUri }) {
  const data = await call('GET', 'oauth/access_token', {
    params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
    token: undefined,
  });
  return data; // { access_token, token_type, expires_in }
}

export async function getLongLivedToken({ appId, appSecret, shortToken }) {
  const data = await call('GET', 'oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    },
  });
  return data; // { access_token, expires_in }
}

export async function getMe(token) {
  // Thử lấy kèm ảnh đại diện; nếu token thiếu quyền ảnh thì lùi về id,name
  // để KHÔNG làm hỏng đăng nhập.
  try {
    return await call('GET', 'me', { token, params: { fields: 'id,name,picture.width(72).height(72)' } });
  } catch (err) {
    return call('GET', 'me', { token, params: { fields: 'id,name' } });
  }
}

// --------- Tài khoản quảng cáo & Page ---------

export async function getAdAccounts(token) {
  const data = await call('GET', 'me/adaccounts', {
    token,
    params: { fields: 'id,account_id,name,account_status,currency,timezone_name', limit: 200 },
  });
  return data.data || [];
}

export async function getPages(token) {
  const data = await call('GET', 'me/accounts', {
    token,
    params: { fields: 'id,name,username,link,access_token,tasks', limit: 200 },
  });
  return data.data || [];
}

// Lấy ID số của Page từ tên vanity (slug) qua Graph API
export async function resolvePageSlug(token, slug) {
  const data = await call('GET', encodeURIComponent(slug), {
    token,
    params: { fields: 'id,name' },
  });
  return data; // { id, name }
}

// Dò Page ID số từ trang công khai (m.facebook.com) khi Graph API bị chặn.
// Trả về chuỗi ID hoặc null.
export async function scrapePageId(slug) {
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
  const url = `https://m.facebook.com/${encodeURIComponent(slug)}`;
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': ua, 'Accept-Language': 'vi-VN,vi;q=0.9', Accept: 'text/html' },
      timeout: 15000,
      maxRedirects: 5,
    });
    const html = String(res.data || '');
    const m =
      html.match(/"pageID":"?(\d{6,})"?/) ||
      html.match(/"delegate_page":\s*\{\s*"id":\s*"(\d{6,})"/) ||
      html.match(/"entity_id":"(\d{6,})"/) ||
      html.match(/fb:\/\/page\/\?id=(\d{6,})/) ||
      html.match(/"pageID"\s*:\s*(\d{6,})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Kiểm tra bài viết có tồn tại / dùng được không
export async function checkPostExists(token, objectStoryId) {
  try {
    return await call('GET', objectStoryId, {
      token,
      params: { fields: 'id,from{id,name},call_to_action,message,object_id,type,attachments{media,type,target}' }
    });
  } catch (err) {
    if (err instanceof MetaApiError && (err.code === 100 || err.message.includes('fields') || err.message.includes('parameter'))) {
      return await call('GET', objectStoryId, { token, params: { fields: 'id' } });
    }
    throw err;
  }
}

// --------- Tạo Campaign / Ad Set / Creative / Ad ---------

function actPath(adAccountId, suffix) {
  const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  return `${id}/${suffix}`;
}

export async function createCampaign(token, adAccountId, payload) {
  return call('POST', actPath(adAccountId, 'campaigns'), { token, data: payload });
}

export async function createAdSet(token, adAccountId, payload) {
  return call('POST', actPath(adAccountId, 'adsets'), { token, data: payload });
}

export async function createAdCreative(token, adAccountId, payload) {
  return call('POST', actPath(adAccountId, 'adcreatives'), { token, data: payload });
}

export async function createAd(token, adAccountId, payload) {
  return call('POST', actPath(adAccountId, 'ads'), { token, data: payload });
}

/**
 * So sánh lỏng trùng khớp URL bài viết
 */
export function isPermalinkMatch(permalinkUrl, userInputUrl, parsedId) {
  if (!permalinkUrl || !userInputUrl) return false;
  
  const normPermalink = normalizeFbUrl(permalinkUrl);
  const normInput = normalizeFbUrl(userInputUrl);
  
  if (normPermalink === normInput) return true;
  
  if (parsedId && (permalinkUrl.includes(parsedId) || userInputUrl.includes(parsedId))) {
    return true;
  }
  
  return false;
}

/**
 * Dò tìm bài đăng chứa video/Reel hoặc khớp URL từ Graph API
 */
export async function resolvePostFromGraph(token, pageId, postLink, parsedId, kind) {
  const normalizedInputUrl = normalizeFbUrl(postLink);
  
  let posts = [];
  
  // 1. Lấy danh sách posts
  try {
    const res = await call('GET', `${pageId}/posts`, {
      token,
      params: {
        fields: 'id,permalink_url,from{id,name},created_time,attachments{media,type,target}',
        limit: 100
      }
    });
    if (res && Array.isArray(res.data)) {
      posts = posts.concat(res.data);
    }
  } catch (err) {
    console.error(`Lỗi khi gọi /${pageId}/posts:`, err.message);
  }

  // 2. Lấy danh sách published_posts để tránh bỏ sót
  try {
    const res = await call('GET', `${pageId}/published_posts`, {
      token,
      params: {
        fields: 'id,permalink_url,from{id,name},created_time,attachments{media,type,target}',
        limit: 100
      }
    });
    if (res && Array.isArray(res.data)) {
      const existingIds = new Set(posts.map(p => p.id));
      for (const p of res.data) {
        if (!existingIds.has(p.id)) {
          posts.push(p);
        }
      }
    }
  } catch (err) {
    console.error(`Lỗi khi gọi /${pageId}/published_posts:`, err.message);
  }

  const containsVideoId = (post, videoId) => {
    if (!videoId) return false;
    const attachments = post.attachments?.data || [];
    for (const att of attachments) {
      if (att.target?.id === videoId || att.media?.id === videoId) {
        return true;
      }
    }
    return false;
  };

  // Tìm trong danh sách posts thu thập được
  for (const post of posts) {
    const normPostUrl = normalizeFbUrl(post.permalink_url);
    const isUrlMatch = normPostUrl && normalizedInputUrl && (normPostUrl === normalizedInputUrl);
    
    let isVideoMatch = false;
    if (kind === 'reel' || kind === 'video') {
      isVideoMatch = containsVideoId(post, parsedId);
    }
    
    const isIdMatch = post.id === parsedId || post.id === `${pageId}_${parsedId}`;

    if (isUrlMatch || isVideoMatch || isIdMatch) {
      let videoId = null;
      if (kind === 'reel' || kind === 'video') {
        videoId = parsedId;
      } else {
        const attachments = post.attachments?.data || [];
        for (const att of attachments) {
          if (att.target?.id) {
            videoId = att.target.id;
            break;
          }
        }
      }
      
      return {
        post,
        objectStoryId: post.id,
        postId: post.id.includes('_') ? post.id.split('_')[1] : post.id,
        videoId,
        sourceObjectId: videoId,
        permalinkUrl: post.permalink_url,
        fromPageId: post.from?.id || pageId,
      };
    }
  }

  // 3. Fallback tìm trực tiếp cho mọi loại bài viết/reel/video nếu có parsedId
  if (parsedId) {
    const candidates = [
      parsedId.includes('_') ? parsedId : `${pageId}_${parsedId}`,
      parsedId
    ];
    for (const candidateId of candidates) {
      try {
        const post = await call('GET', candidateId, {
          token,
          params: { fields: 'id,permalink_url,from{id,name},created_time,type,object_id' }
        });
        if (post && post.id) {
          const isPageMatch = post.from?.id === pageId;
          if (isPageMatch) {
            return {
              post,
              objectStoryId: post.id,
              postId: post.id.includes('_') ? post.id.split('_')[1] : post.id,
              videoId: post.type === 'video' ? post.object_id : (kind === 'video' || kind === 'reel' ? parsedId : null),
              sourceObjectId: post.type === 'video' ? post.object_id : (kind === 'video' || kind === 'reel' ? parsedId : null),
              permalinkUrl: post.permalink_url,
              fromPageId: post.from?.id || pageId,
            };
          }
        }
      } catch (err) {
        // Bỏ qua lỗi direct fetch
      }
    }
  }

  return null;
}

/**
 * Kiểm tra xác thực thông tin chi tiết của object_story_id
 */
export async function verifyPostDetails(token, objectStoryId) {
  return call('GET', objectStoryId, {
    token,
    params: { fields: 'id,permalink_url,from{id,name},created_time,call_to_action,message,object_id,type,attachments{media,type,target}' }
  });
}

/**
 * Cập nhật nút kêu gọi hành động (CTA) cho bài đăng hiện có trên trang
 */
export async function updatePostCta(token, objectStoryId, ctaType, ctaLink) {
  const payload = {
    call_to_action: {
      type: ctaType
    }
  };
  if (ctaLink) {
    payload.call_to_action.value = { link: ctaLink };
  }
  return call('POST', objectStoryId, { token, data: payload });
}

/**
 * Đọc thông tin ad creative từ Meta
 */
export async function getAdCreative(token, creativeId, fields = 'id,object_story_id,effective_object_story_id,call_to_action') {
  return call('GET', creativeId, { token, params: { fields } });
}

/**
 * Tải ảnh lên thư viện của tài khoản quảng cáo từ một URL từ xa
 */
export async function uploadAdImageFromUrl(token, adAccountId, imageUrl) {
  const data = await call('POST', actPath(adAccountId, 'adimages'), {
    token,
    data: { url: imageUrl }
  });
  const keys = Object.keys(data?.images || {});
  if (keys.length > 0) {
    return data.images[keys[0]].hash;
  }
  throw new Error('Không lấy được hash ảnh từ Meta API.');
}

// ============================================================
//  QUẢN LÝ (Ads Manager thu gọn): đọc cây + sửa/bật-tắt/xoá
// ============================================================

// Lấy toàn bộ các trang của một edge (tự theo paging.next)
async function getAllPages(token, path, params, maxItems = 5000) {
  let out = [];
  let data = await call('GET', path, { token, params });
  while (data) {
    if (Array.isArray(data.data)) out = out.concat(data.data);
    if (out.length >= maxItems) break;
    const next = data.paging?.cursors?.after;
    if (!next || !data.paging?.next) break;
    await new Promise((r) => setTimeout(r, 120)); // nhịp nhẹ tránh rate-limit
    data = await call('GET', path, { token, params: { ...params, after: next } });
  }
  return out;
}

const INSIGHTS_FIELDS = 'spend,impressions,reach,clicks,ctr,cpm,actions';

// Lấy insights PHẲNG theo cấp (campaign|adset|ad) — 1 truy vấn nhẹ, không lồng
// → tránh lỗi "reduce the amount of data" và giảm mạnh số lần gọi API.
export async function getInsights(token, adAccountId, level, datePreset) {
  const idField = level === 'campaign' ? 'campaign_id' : level === 'adset' ? 'adset_id' : 'ad_id';
  const rows = await getAllPages(token, actPath(adAccountId, 'insights'), {
    level,
    date_preset: datePreset || 'last_30d',
    fields: `${idField},${INSIGHTS_FIELDS}`,
    limit: 200,
  }, 4000);
  const map = {};
  for (const r of rows) if (r[idField]) map[r[idField]] = r;
  return map;
}

export async function getCampaigns(token, adAccountId) {
  const fields = 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,bid_strategy,start_time,stop_time,created_time,updated_time';
  return getAllPages(token, actPath(adAccountId, 'campaigns'), { fields, limit: 100 });
}

export async function getAdSets(token, adAccountId) {
  const fields = 'id,name,status,effective_status,campaign_id,optimization_goal,billing_event,daily_budget,lifetime_budget,budget_remaining,bid_strategy,start_time,end_time';
  return getAllPages(token, actPath(adAccountId, 'adsets'), { fields, limit: 100 });
}

export async function getAds(token, adAccountId) {
  const fields = 'id,name,status,effective_status,adset_id,campaign_id,creative{id,thumbnail_url,object_story_id,effective_object_story_id}';
  return getAllPages(token, actPath(adAccountId, 'ads'), { fields, limit: 100 });
}

// Cập nhật chung (đổi tên, đổi trạng thái, đổi ngân sách…)
export async function updateNode(token, id, payload) {
  return call('POST', String(id), { token, data: payload });
}

// Xoá một node (campaign/adset/ad)
export async function deleteNode(token, id) {
  return call('DELETE', String(id), { token });
}

// Nhân bản (campaign/adset/ad) qua endpoint /copies
export async function duplicateNode(token, id, level) {
  const data = { status_option: 'PAUSED' };
  if (level === 'campaign') data.deep_copy = true;
  return call('POST', `${id}/copies`, { token, data });
}

/**
 * Kiểm tra các quyền (scopes) đã được cấp của token
 */
export async function getTokenPermissions(token) {
  try {
    const res = await call('GET', 'me/permissions', { token });
    return res.data || [];
  } catch (err) {
    console.error('Lỗi lấy quyền từ token:', err.message);
    throw err;
  }
}
