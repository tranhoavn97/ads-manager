import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '../../logs');
const WEBHOOK_LOG = path.join(LOG_DIR, 'webhooks.log');

// GET: Xác thực webhook từ Facebook (Verification Challenge)
router.get('/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.FB_WEBHOOK_VERIFY_TOKEN || 'my_secure_verify_token_123';

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[Webhook] Facebook webhook verified successfully.');
      return res.status(200).send(challenge);
    } else {
      console.error('[Webhook] Facebook webhook verification failed. Token mismatch.');
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

// POST: Nhận sự kiện thay đổi từ Facebook (e.g. trạng thái quảng cáo)
router.post('/facebook', async (req, res) => {
  const body = req.body;

  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      headers: req.headers,
      payload: body
    };

    // Ghi sự kiện vào file logs/webhooks.log
    await fs.promises.appendFile(WEBHOOK_LOG, JSON.stringify(logEntry) + '\n', 'utf8');
    console.log('[Webhook] Received Facebook event callback. Logged to logs/webhooks.log');

    // Phản hồi 200 OK ngay lập tức cho Facebook để tránh lặp lại request
    res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    console.error('[Webhook] Error handling Facebook callback:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
