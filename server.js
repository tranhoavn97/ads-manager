import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './src/config.js';
import authRouter from './src/routes/auth.js';
import accountsRouter from './src/routes/accounts.js';
import adsRouter from './src/routes/ads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '10mb' }));

app.use(
  session({
    name: 'fb_bulk_ads.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      maxAge: 1000 * 60 * 60 * 8, // 8 giờ
    },
  })
);

// API
app.use('/api/auth', authRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/ads', adsRouter);

// Frontend tĩnh
app.use(express.static(path.join(__dirname, 'public')));

// Bắt lỗi chung
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ nội bộ: ' + err.message });
});

app.listen(config.port, () => {
  console.log('==================================================');
  console.log('  Trình tạo quảng cáo Facebook hàng loạt');
  console.log(`  Đang chạy tại: http://localhost:${config.port}`);
  console.log('==================================================');
  if (!config.appId || config.appId.startsWith('your_')) {
    console.log('  [!] Chưa cấu hình FB_APP_ID / FB_APP_SECRET trong .env');
  }
});
