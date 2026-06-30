import express from 'express';
import cookieSession from 'cookie-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './src/config.js';
import authRouter from './src/routes/auth.js';
import accountsRouter from './src/routes/accounts.js';
import existingPostShopeeRouter from './src/routes/existing-post-shopee.js';
import adsRouter from './src/routes/ads.js';
import manageRouter from './src/routes/manage.js';
import postsRouter from './src/routes/posts.js';
import campaignBuilderRouter from './src/routes/campaign-builder.js';
import webhooksRouter from './src/routes/webhooks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cookieSession({
  name: 'fb_bulk_ads',
  keys: [config.sessionSecret],
  maxAge: 1000 * 60 * 60 * 8,
  httpOnly: true,
  sameSite: 'lax',
  secure: config.secureCookies,
}));

app.use('/api/auth', authRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/ads', existingPostShopeeRouter);
app.use('/api/ads', adsRouter);
app.use('/api/manage', manageRouter);
app.use('/api/posts', postsRouter);
app.use('/api', campaignBuilderRouter);
app.use('/api/webhooks', webhooksRouter);
app.use(express.static(path.join(__dirname, 'public')));
app.get(['/privacy-policy', '/terms', '/delete-data'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ nội bộ: ' + err.message });
});

export default app;
