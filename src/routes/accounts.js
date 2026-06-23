import express from 'express';
import { requireAuth } from './auth.js';
import { getAdAccounts, getPages, MetaApiError } from '../meta-api.js';
import { CAMPAIGN_TYPE_OPTIONS } from '../campaign-mapper.js';

const router = express.Router();

const ACCOUNT_STATUS_VI = {
  1: 'Đang hoạt động',
  2: 'Bị vô hiệu hoá',
  3: 'Chưa thanh toán',
  7: 'Đang chờ duyệt rủi ro',
  8: 'Chờ đóng',
  9: 'Trong thời gian gia hạn',
  100: 'Chờ kết thúc',
  101: 'Đã đóng',
};

// Danh sách loại chiến dịch (cho dropdown)
router.get('/campaign-types', (req, res) => {
  res.json(CAMPAIGN_TYPE_OPTIONS);
});

router.get('/adaccounts', requireAuth, async (req, res) => {
  try {
    const accounts = await getAdAccounts(req.session.fbToken);
    res.json(
      accounts.map((a) => ({
        id: a.id,
        accountId: a.account_id,
        name: a.name,
        currency: a.currency,
        timezone: a.timezone_name,
        status: a.account_status,
        statusLabel: ACCOUNT_STATUS_VI[a.account_status] || 'Không rõ',
        usable: a.account_status === 1,
      }))
    );
  } catch (err) {
    handle(err, res);
  }
});

router.get('/pages', requireAuth, async (req, res) => {
  try {
    const pages = await getPages(req.session.fbToken);
    // Lưu danh sách Page id vào phiên để bước kiểm tra quyền dùng lại
    req.session.pageIds = pages.map((p) => p.id);
    res.json(
      pages.map((p) => ({
        id: p.id,
        name: p.name,
        canAdvertise: Array.isArray(p.tasks) ? p.tasks.includes('ADVERTISE') : true,
      }))
    );
  } catch (err) {
    handle(err, res);
  }
});

function handle(err, res) {
  if (err instanceof MetaApiError) {
    return res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
  res.status(500).json({ error: 'Lỗi máy chủ: ' + err.message });
}

export default router;
