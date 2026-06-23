import dotenv from 'dotenv';
dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || value.startsWith('your_')) {
    console.warn(`[CẢNH BÁO] Thiếu biến môi trường "${name}". Hãy điền vào file .env trước khi đăng nhập Facebook.`);
  }
  return value || '';
}

export const config = {
  appId: required('FB_APP_ID'),
  appSecret: required('FB_APP_SECRET'),
  apiVersion: process.env.FB_API_VERSION || 'v20.0',
  redirectUri: process.env.FB_REDIRECT_URI || 'http://localhost:3000/api/auth/callback',
  configId: process.env.FB_CONFIG_ID || '',
  scopes: process.env.FB_SCOPES ||
    'ads_management,ads_read,pages_show_list,pages_read_engagement,pages_manage_ads,business_management',
  sessionSecret: process.env.SESSION_SECRET || 'doi-secret-nay-trong-production',
  port: parseInt(process.env.PORT || '3000', 10),
  secureCookies: String(process.env.SECURE_COOKIES).toLowerCase() === 'true',
};

export const graphBase = `https://graph.facebook.com/${config.apiVersion}`;
