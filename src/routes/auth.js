import express from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import { exchangeCodeForToken, getLongLivedToken, getMe, MetaApiError, getTokenPermissions } from '../meta-api.js';

const router = express.Router();

// Bắt đầu đăng nhập: chuyển hướng tới hộp thoại OAuth của Facebook
router.get('/login', (req, res) => {
  if (!config.appId || config.appId.startsWith('your_')) {
    return res.status(500).send('Chưa cấu hình FB_APP_ID trong file .env');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state,
    response_type: 'code',
  });

  // Login for Business dùng config_id; nếu không có thì xin theo scope
  if (config.configId) {
    params.set('config_id', config.configId);
  } else {
    params.set('scope', config.scopes);
  }

  const dialogUrl = `https://www.facebook.com/${config.apiVersion}/dialog/oauth?${params.toString()}`;
  res.redirect(dialogUrl);
});

// Facebook gọi lại sau khi người dùng đồng ý
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.redirect('/?auth_error=' + encodeURIComponent(error_description || error));
  }
  if (!code || !state || state !== req.session.oauthState) {
    return res.redirect('/?auth_error=' + encodeURIComponent('Phiên đăng nhập không hợp lệ (state không khớp)'));
  }
  delete req.session.oauthState;

  try {
    const short = await exchangeCodeForToken({
      code,
      appId: config.appId,
      appSecret: config.appSecret,
      redirectUri: config.redirectUri,
    });

    let accessToken = short.access_token;
    // Đổi sang token dài hạn (~60 ngày)
    try {
      const long = await getLongLivedToken({
        appId: config.appId,
        appSecret: config.appSecret,
        shortToken: accessToken,
      });
      if (long.access_token) accessToken = long.access_token;
    } catch {
      /* nếu lỗi vẫn dùng token ngắn hạn */
    }

    const me = await getMe(accessToken);

    // Token chỉ lưu trong phiên phía máy chủ, KHÔNG gửi cho trình duyệt
    req.session.fbToken = accessToken;
    req.session.user = { id: me.id, name: me.name, picture: me.picture?.data?.url || '' };

    res.redirect('/');
  } catch (err) {
    const msg = err instanceof MetaApiError ? err.message : 'Đăng nhập thất bại';
    res.redirect('/?auth_error=' + encodeURIComponent(msg));
  }
});

// Đăng nhập trực tiếp bằng access token (khỏi cần OAuth)
router.post('/token', async (req, res) => {
  const raw = (req.body?.token ?? '').toString().trim();
  if (!raw) {
    return res.status(400).json({ error: 'Vui lòng nhập access token.' });
  }
  try {
    const me = await getMe(raw); // xác thực token bằng cách gọi /me
    
    // Kiểm tra danh sách quyền được cấp
    let missingPermissions = [];
    try {
      const perms = await getTokenPermissions(raw);
      const granted = new Set(perms.filter(p => p.status === 'granted').map(p => p.permission));
      const required = config.scopes.split(',').map(s => s.trim()).filter(Boolean);
      missingPermissions = required.filter(p => !granted.has(p));
    } catch (e) {
      console.warn('Không thể kiểm tra danh sách quyền:', e.message);
    }

    req.session.fbToken = raw;
    req.session.user = { id: me.id, name: me.name, picture: me.picture?.data?.url || '' };
    res.json({ ok: true, user: req.session.user, missingPermissions });
  } catch (err) {
    const msg = err instanceof MetaApiError ? err.message : 'Token không hợp lệ hoặc đã hết hạn.';
    res.status(401).json({ error: msg });
  }
});

router.get('/status', async (req, res) => {
  const user = req.session.user || null;
  // Bổ sung avatar cho phiên cũ (đăng nhập trước khi có trường picture)
  if (req.session.fbToken && user && !user.picture) {
    try {
      const me = await getMe(req.session.fbToken);
      user.picture = me.picture?.data?.url || '';
      req.session.user = user;
    } catch { /* bỏ qua nếu lỗi */ }
  }
  res.json({ loggedIn: Boolean(req.session.fbToken), user });
});

router.post('/logout', (req, res) => {
  req.session = null; // cookie-session: gán null để xoá cookie phiên
  res.json({ ok: true });
});

// Middleware bắt buộc đăng nhập cho các route cần token
export function requireAuth(req, res, next) {
  if (!req.session.fbToken) {
    return res.status(401).json({ error: 'Chưa đăng nhập Facebook. Vui lòng đăng nhập lại.' });
  }
  next();
}

export default router;
