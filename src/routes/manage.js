import express from 'express';
import { requireAuth } from './auth.js';
import {
  getCampaigns, getAdSets, getAds, getInsights,
  updateNode, deleteNode, duplicateNode, MetaApiError,
} from '../meta-api.js';

const router = express.Router();

// Các loại tiền không có phần thập phân
const ZERO_DECIMAL = new Set(['VND', 'JPY', 'KRW', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'VUV', 'XAF', 'XOF', 'PYG']);

function minorToMajor(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return null;
  const factor = ZERO_DECIMAL.has((currency || '').toUpperCase()) ? 1 : 100;
  return Number(amount) / factor;
}
function majorToMinor(amount, currency) {
  const factor = ZERO_DECIMAL.has((currency || '').toUpperCase()) ? 1 : 100;
  return Math.round(Number(amount) * factor);
}

// Rút gọn 1 hàng insights (đã gắn vào node) về dạng phẳng dễ render
function flattenInsights(node) {
  const ins = node.insights;
  if (!ins) return null;
  let results = 0;
  if (Array.isArray(ins.actions)) {
    // Ưu tiên các action có ý nghĩa "kết quả"
    const priority = [
      'onsite_conversion.messaging_conversation_started_7d',
      'onsite_conversion.purchase',
      'offsite_conversion.fb_pixel_purchase',
      'lead', 'onsite_conversion.lead_grouped',
      'link_click', 'post_engagement',
    ];
    for (const key of priority) {
      const hit = ins.actions.find((a) => a.action_type === key);
      if (hit) { results = Number(hit.value) || 0; break; }
    }
  }
  return {
    spend: Number(ins.spend) || 0,
    impressions: Number(ins.impressions) || 0,
    reach: Number(ins.reach) || 0,
    clicks: Number(ins.clicks) || 0,
    ctr: ins.ctr != null ? Number(ins.ctr) : null,
    cpm: ins.cpm != null ? Number(ins.cpm) : null,
    cpc: ins.cpc != null ? Number(ins.cpc) : null,
    frequency: ins.frequency != null ? Number(ins.frequency) : null,
    results,
  };
}

function shapeCampaign(c, currency) {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    effectiveStatus: c.effective_status,
    objective: c.objective,
    dailyBudget: minorToMajor(c.daily_budget, currency),
    lifetimeBudget: minorToMajor(c.lifetime_budget, currency),
    budgetRemaining: minorToMajor(c.budget_remaining, currency),
    startTime: c.start_time || null,
    stopTime: c.stop_time || null,
    insights: flattenInsights(c),
  };
}
function shapeAdSet(a, currency) {
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    effectiveStatus: a.effective_status,
    campaignId: a.campaign_id,
    optimizationGoal: a.optimization_goal,
    dailyBudget: minorToMajor(a.daily_budget, currency),
    lifetimeBudget: minorToMajor(a.lifetime_budget, currency),
    startTime: a.start_time || null,
    endTime: a.end_time || null,
    insights: flattenInsights(a),
  };
}
function shapeAd(a, currency) {
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    effectiveStatus: a.effective_status,
    adsetId: a.adset_id,
    campaignId: a.campaign_id,
    thumbnail: a.creative?.thumbnail_url || null,
    insights: flattenInsights(a),
  };
}

// ---------- Toàn cảnh: campaign + adset + ad kèm insights ----------
router.get('/overview', requireAuth, async (req, res) => {
  const { adAccountId, datePreset = 'last_30d', currency = '' } = req.query;
  if (!adAccountId) return res.status(400).json({ error: 'Thiếu adAccountId' });
  try {
    const token = req.session.fbToken;
    // Lấy thực thể (nhẹ) + insights phẳng theo cấp song song, rồi gắn insights vào từng node
    const [campaigns, adsets, ads, ci, si, ai] = await Promise.all([
      getCampaigns(token, adAccountId),
      getAdSets(token, adAccountId),
      getAds(token, adAccountId),
      getInsights(token, adAccountId, 'campaign', datePreset).catch(() => ({})),
      getInsights(token, adAccountId, 'adset', datePreset).catch(() => ({})),
      getInsights(token, adAccountId, 'ad', datePreset).catch(() => ({})),
    ]);
    campaigns.forEach((c) => { c.insights = ci[c.id] || null; });
    adsets.forEach((a) => { a.insights = si[a.id] || null; });
    ads.forEach((a) => { a.insights = ai[a.id] || null; });
    res.json({
      campaigns: campaigns.map((c) => shapeCampaign(c, currency)),
      adsets: adsets.map((a) => shapeAdSet(a, currency)),
      ads: ads.map((a) => shapeAd(a, currency)),
    });
  } catch (err) {
    handle(err, res);
  }
});

// ---------- Bật / tắt (ACTIVE | PAUSED) ----------
router.post('/status', requireAuth, async (req, res) => {
  const { id, status } = req.body || {};
  if (!id || !['ACTIVE', 'PAUSED'].includes(status)) {
    return res.status(400).json({ error: 'Thiếu id hoặc trạng thái không hợp lệ' });
  }
  try {
    await updateNode(req.session.fbToken, id, { status });
    res.json({ ok: true, id, status });
  } catch (err) {
    handle(err, res);
  }
});

// ---------- Đổi tên ----------
router.post('/rename', requireAuth, async (req, res) => {
  const { id, name } = req.body || {};
  if (!id || !name || !name.trim()) {
    return res.status(400).json({ error: 'Thiếu id hoặc tên mới' });
  }
  try {
    await updateNode(req.session.fbToken, id, { name: name.trim() });
    res.json({ ok: true, id, name: name.trim() });
  } catch (err) {
    handle(err, res);
  }
});

// ---------- Đổi ngân sách (daily | lifetime) ----------
router.post('/budget', requireAuth, async (req, res) => {
  const { id, budgetType, amount, currency = '' } = req.body || {};
  if (!id || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Thiếu id hoặc ngân sách không hợp lệ' });
  }
  const field = budgetType === 'lifetime' ? 'lifetime_budget' : 'daily_budget';
  try {
    await updateNode(req.session.fbToken, id, { [field]: majorToMinor(amount, currency) });
    res.json({ ok: true, id });
  } catch (err) {
    handle(err, res);
  }
});

// ---------- Nhân bản ----------
router.post('/duplicate', requireAuth, async (req, res) => {
  const { id, level } = req.body || {};
  if (!id || !['campaign', 'adset', 'ad'].includes(level)) {
    return res.status(400).json({ error: 'Thiếu id hoặc cấp không hợp lệ' });
  }
  try {
    const result = await duplicateNode(req.session.fbToken, id, level);
    res.json({ ok: true, result });
  } catch (err) {
    handle(err, res);
  }
});

// ---------- Xoá ----------
router.post('/delete', requireAuth, async (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Thiếu id' });
  try {
    await deleteNode(req.session.fbToken, id);
    res.json({ ok: true, id });
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
