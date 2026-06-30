import express from 'express';
import cookieSession from 'cookie-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './src/config.js';
import authRouter from './src/routes/auth.js';
import accountsRouter from './src/routes/accounts.js';
import existingPostRouter from './src/routes/existing-post-shopee.js';
import adsRouter from './src/routes/ads.js';
import manageRouter from './src/routes/manage.js';
import postsRouter from './src/routes/posts.js';
import thruplayRouter from './src/routes/thruplay.js';
import webhooksRouter from './src/routes/webhooks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '10mb' }));

// Phiên lưu trong cookie đã ký (stateless) — chạy được trên serverless (Vercel)
// vì không phụ thuộc bộ nhớ của một instance cụ thể.
app.use(
  cookieSession({
    name: 'fb_bulk_ads',
    keys: [config.sessionSecret],
    maxAge: 1000 * 60 * 60 * 8, // 8 giờ
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
  })
);

// API
app.use('/api/auth', authRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/ads', existingPostRouter);
app.use('/api/ads', adsRouter);
app.use('/api/manage', manageRouter);
app.use('/api/posts', postsRouter);
app.use('/api/thruplay', thruplayRouter);
app.use('/api/webhooks', webhooksRouter);

// Frontend tĩnh (dùng khi chạy server thường; trên Vercel do static routes phục vụ)
app.use(express.static(path.join(__dirname, 'public')));

// Fallback cho các trang điều khoản để tránh lỗi 404 khi F5 ở local
app.get(['/privacy-policy', '/terms', '/delete-data'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Bắt lỗi chung
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ nội bộ: ' + err.message });
});

// Chỉ tự lắng nghe khi chạy như server thường (local/Render…).
// Trên Vercel, app được nạp qua api/index.js nên KHÔNG gọi listen.
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log('==================================================');
    console.log('  Trình tạo quảng cáo Facebook hàng loạt');
    console.log(`  Đang chạy tại: http://localhost:${config.port}`);
    console.log('==================================================');
    if (!config.appId || config.appId.startsWith('your_')) {
      console.log('  [!] Chưa cấu hình FB_APP_ID / FB_APP_SECRET trong .env');
    }
  });
}

export default app;
