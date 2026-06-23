import axios from 'axios';
import { graphBase } from './config.js';

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
  try {
    const res = await axios({
      method,
      url,
      params: { access_token: token, ...params },
      data,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
    return res.data;
  } catch (err) {
    if (err.response?.data?.error) {
      throw translateError(err.response.data.error, err.response.status);
    }
    if (err.code === 'ECONNABORTED') {
      throw new MetaApiError('Hết thời gian chờ phản hồi từ Meta API. Vui lòng thử lại.', { status: 408 });
    }
    throw new MetaApiError(`Lỗi kết nối tới Meta API: ${err.message}`, { status: 502 });
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
  return call('GET', 'me', { token, params: { fields: 'id,name' } });
}

// --------- Tài khoản quảng cáo & Page ---------

export async function getAdAccounts(token) {
  const data = await call('GET', 'me/adaccounts', {
    token,
    params: { fields: 'id,account_id,name,account_status,currency,timezone_name,amount_spent', limit: 200 },
  });
  return data.data || [];
}

export async function getPages(token) {
  const data = await call('GET', 'me/accounts', {
    token,
    params: { fields: 'id,name,access_token,tasks', limit: 200 },
  });
  return data.data || [];
}

// Lấy ID số của Page từ tên vanity (slug)
export async function resolvePageSlug(token, slug) {
  const data = await call('GET', encodeURIComponent(slug), {
    token,
    params: { fields: 'id,name' },
  });
  return data; // { id, name }
}

// Kiểm tra bài viết có tồn tại / dùng được không
export async function checkPostExists(token, objectStoryId) {
  return call('GET', objectStoryId, { token, params: { fields: 'id' } });
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
