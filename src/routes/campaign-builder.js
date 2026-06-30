import express from 'express';
import { requireAuth } from './auth.js';
import {
  getCampaigns,
  getCampaignAdSets,
  getPages,
  graphGet,
  createAdSet,
  createAdCreative,
  createAd,
  MetaApiError,
} from '../meta-api.js';
import { resolveAdStatus, resolveBudgetMode, resolveCountries } from '../validators.js';

const router = express.Router();
const ZERO_DECIMAL = new Set(['VND', 'JPY', 'KRW', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'VUV', 'XAF', 'XOF', 'PYG']);
const VALID_OPTIMIZATION = new Set(['LINK_CLICKS', 'THRUPLAY', 'POST_ENGAGEMENT']);

function minorToMajor(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return null;
  const factor = ZERO_DECIMAL.has(String(currency || '').toUpperCase()) ? 1 : 100;
  return Number(amount) / factor;
}

function budgetToMinor(amount, currency) {
  const raw = String(amount || '').replace(/[^\d.]/g, '');
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  const factor = ZERO_DECIMAL.has(String(currency || '').toUpperCase()) ? 1 : 100;
  return Math.round(value * factor);
}

function parseDateTime(date, time, endOfDay = false) {
  if (!date) return null;
  const raw = String(date).trim();
  let dt = null;
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) dt = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1], 0, 0, 0));
  else dt = new Date(raw);
  if (!dt || Number.isNaN(dt.getTime())) return null;
  const m = String(time || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) dt.setUTCHours(+m[1], +m[2], +(m[3] || 0), 0);
  else if (endOfDay) dt.setUTCHours(23, 59, 0, 0);
  return dt;
}

function metaDetails(err) {
  return err instanceof MetaApiError
    ? { metaErrorCode: err.code ?? null, metaErrorSubcode: err.subcode ?? null, fbtraceId: err.fbtrace ?? null }
    : {};
}

function handle(err, res, status = 500) {
  if (err instanceof MetaApiError) {
    const tokenExpired = err.code === 190;
    return res.status(err.status || 400).json({
      error: tokenExpired ? 'Access Token đã hết hạn, vui lòng nhập token mới.' : err.message,
      code: err.code,
      ...metaDetails(err),
    });
  }
  res.status(err.status || status).json({ error: err.message || 'Lỗi máy chủ.', ...metaDetails(err) });
}

function shapeCampaign(c, currency) {
  return {
    campaign_id: c.id,
    id: c.id,
    name: c.name || '',
    objective: c.objective || '',
    status: c.status || c.effective_status || '',
    effective_status: c.effective_status || c.status || '',
    daily_budget: minorToMajor(c.daily_budget, currency),
    lifetime_budget: minorToMajor(c.lifetime_budget, currency),
    created_time: c.created_time || '',
    updated_time: c.updated_time || '',
  };
}

function shapeAdSet(a, currency) {
  return {
    adset_id: a.id,
    id: a.id,
    name: a.name || '',
    status: a.status || a.effective_status || '',
    effective_status: a.effective_status || a.status || '',
    campaign_id: a.campaign_id || '',
    optimization_goal: a.optimization_goal || '',
    billing_event: a.billing_event || '',
    daily_budget: minorToMajor(a.daily_budget, currency),
    lifetime_budget: minorToMajor(a.lifetime_budget, currency),
    targeting: a.targeting || null,
    start_time: a.start_time || '',
    end_time: a.end_time || '',
  };
}

function pageToken(pages, pageId, userToken) {
  return pages.find((p) => String(p.id) === String(pageId))?.access_token || userToken;
}

function assertPage(pages, pageId) {
  const page = pages.find((p) => String(p.id) === String(pageId));
  if (!page) {
    const err = new Error('Page không thuộc tài khoản đang đăng nhập.');
    err.status = 403;
    throw err;
  }
  return page;
}

function isVideoAttachment(att) {
  if (!att) return false;
  const type = String(att.type || '').toLowerCase();
  if (type.includes('video') || type.includes('reel')) return true;
  return (att.subattachments?.data || []).some(isVideoAttachment);
}

function findVideoId(attachments = []) {
  for (const att of attachments) {
    const type = String(att.type || '').toLowerCase();
    if (type.includes('video') || type.includes('reel')) return att.target?.id || att.media?.id || null;
    const nested = findVideoId(att.subattachments?.data || []);
    if (nested) return nested;
  }
  return null;
}

function isVideoPost(post) {
  const type = String(post.type || post.status_type || '').toLowerCase();
  return type.includes('video') || type.includes('reel') || !!post.object_id || (post.attachments?.data || []).some(isVideoAttachment);
}

function postType(post, fallback = 'Post') {
  const raw = String(post.type || post.status_type || fallback || '').toLowerCase();
  if (raw.includes('reel')) return 'Reel';
  if (raw.includes('video') || post.object_id || (post.attachments?.data || []).some(isVideoAttachment)) return 'Video';
  return 'Post';
}

function thumbnail(post) {
  const att = post.attachments?.data?.[0];
  return post.full_picture || post.picture || att?.media?.image?.src || att?.media?.source || '';
}

function shapePost(pageId, post, fallbackType = 'Post') {
  const objectStoryId = String(post.id || '').includes('_') ? post.id : `${pageId}_${post.id}`;
  const videoId = post.video_id || post.object_id || findVideoId(post.attachments?.data || []);
  const type = postType(post, fallbackType);
  return {
    post_id: post.id || '',
    id: post.id || '',
    object_story_id: objectStoryId,
    video_id: videoId || null,
    permalink_url: post.permalink_url || post.permalink || '',
    message: post.message || post.story || post.description || post.title || '',
    created_time: post.created_time || '',
    type,
    thumbnail: thumbnail(post),
    is_video: type === 'Video',
    is_reel: type === 'Reel',
    can_use_for_ads: !!objectStoryId,
  };
}

async function fetchPagePosts(token, pageId, type = 'all') {
  const postFields = 'id,message,story,created_time,permalink_url,status_type,type,object_id,full_picture,attachments{media,type,target,url,subattachments{media,type,target,url}}';
  const videoFields = 'id,title,description,created_time,permalink_url,permalink,picture,post_id,from{id,name}';
  const out = new Map();
  const wanted = String(type || 'all').toLowerCase();

  const add = (item, fallbackType) => {
    const shaped = shapePost(pageId, item, fallbackType);
    if (wanted === 'video' && !shaped.is_video && !shaped.is_reel) return;
    if (wanted === 'reel' && !shaped.is_reel) return;
    if (wanted === 'post' && (shaped.is_video || shaped.is_reel)) return;
    out.set(shaped.object_story_id, shaped);
  };

  const addEdge = async (edge, fields, fallbackType) => {
    try {
      const res = await graphGet(token, `${pageId}/${edge}`, { fields, limit: 100 });
      for (const item of (res.data || [])) {
        if (edge === 'videos' || edge === 'video_reels') {
          if (!item.post_id) continue;
          add({ ...item, id: item.post_id, video_id: item.id }, edge === 'video_reels' ? 'Reel' : 'Video');
        } else {
          add(item, fallbackType);
        }
      }
    } catch (err) {
      console.warn(`Bỏ qua edge ${edge}: ${err.message}`);
    }
  };

  await Promise.all([
    addEdge('posts', postFields, 'Post'),
    addEdge('feed', postFields, 'Post'),
    addEdge('videos', videoFields, 'Video'),
    addEdge('video_reels', videoFields, 'Reel'),
  ]);

  return Array.from(out.values()).sort((a, b) => String(b.created_time).localeCompare(String(a.created_time)));
}

async function assertCampaign(token, campaignId) {
  if (!campaignId) throw new Error('Chưa chọn chiến dịch.');
  return graphGet(token, campaignId, { fields: 'id,name,objective,status,effective_status' });
}

async function assertAdsetBelongs(token, adsetId, campaignId) {
  if (!adsetId) throw new Error('Chưa chọn nhóm quảng cáo.');
  const adset = await graphGet(token, adsetId, { fields: 'id,name,campaign_id,status,optimization_goal' });
  if (String(adset.campaign_id) !== String(campaignId)) {
    const err = new Error('Nhóm quảng cáo không thuộc chiến dịch đã chọn.');
    err.status = 400;
    throw err;
  }
  return adset;
}

function postAdName(post, fallback = 'Quảng cáo từ bài viết') {
  const raw = String(post.adName || post.message || post.permalinkUrl || post.objectStoryId || fallback).replace(/\s+/g, ' ').trim();
  return (raw || fallback).slice(0, 80);
}

function buildAdsetPayload(body, campaignId, currency) {
  const cfg = body.newAdset || {};
  const { codes: countries } = resolveCountries(cfg.country || 'VN');
  if (!countries.length) throw new Error('Quốc gia không hợp lệ.');
  const budget = budgetToMinor(cfg.budget, currency);
  if (!budget) throw new Error('Ngân sách không hợp lệ.');
  const budgetMode = resolveBudgetMode(cfg.budgetMode || 'daily');
  const budgetField = budgetMode === 'lifetime' ? 'lifetime_budget' : 'daily_budget';
  const start = parseDateTime(cfg.startDate, cfg.startTime, false);
  const end = parseDateTime(cfg.endDate, cfg.endTime, true);
  if (budgetMode === 'lifetime' && !end) throw new Error('Ngân sách trọn đời cần ngày kết thúc.');
  if (start && end && end <= start) throw new Error('Ngày kết thúc phải sau ngày bắt đầu.');
  const optimizationGoal = VALID_OPTIMIZATION.has(cfg.optimizationGoal) ? cfg.optimizationGoal : 'LINK_CLICKS';
  return {
    name: String(cfg.name || 'Nhóm quảng cáo mới').trim(),
    campaign_id: campaignId,
    billing_event: cfg.billingEvent || 'IMPRESSIONS',
    optimization_goal: optimizationGoal,
    status: resolveAdStatus(cfg.status || body.status || 'PAUSED', false),
    targeting: { geo_locations: { countries }, age_min: 18, age_max: 65 },
    [budgetField]: budget,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    ...(optimizationGoal === 'LINK_CLICKS' ? { destination_type: 'WEBSITE' } : {}),
    ...(optimizationGoal === 'THRUPLAY' ? { destination_type: 'ON_VIDEO' } : {}),
    ...((optimizationGoal === 'THRUPLAY' || optimizationGoal === 'POST_ENGAGEMENT') && body.pageId ? { promoted_object: { page_id: body.pageId } } : {}),
    ...(start ? { start_time: start.toISOString() } : {}),
    ...(end ? { end_time: end.toISOString() } : {}),
  };
}

router.get('/campaigns', requireAuth, async (req, res) => {
  const { adAccountId, currency = '' } = req.query;
  if (!adAccountId) return res.status(400).json({ error: 'Thiếu tài khoản quảng cáo.' });
  try {
    const campaigns = await getCampaigns(req.session.fbToken, adAccountId);
    res.json({ campaigns: campaigns.map((c) => shapeCampaign(c, currency)) });
  } catch (err) {
    handle(err, res);
  }
});

router.get('/campaigns/:campaignId/adsets', requireAuth, async (req, res) => {
  const { currency = '' } = req.query;
  try {
    await assertCampaign(req.session.fbToken, req.params.campaignId);
    const adsets = await getCampaignAdSets(req.session.fbToken, req.params.campaignId);
    res.json({ adsets: adsets.map((a) => shapeAdSet(a, currency)) });
  } catch (err) {
    handle(err, res);
  }
});

router.get('/pages', requireAuth, async (req, res) => {
  try {
    const pages = await getPages(req.session.fbToken);
    res.json({
      pages: pages.map((p) => ({
        page_id: p.id,
        id: p.id,
        name: p.name,
        tasks: p.tasks || [],
        picture: p.picture?.data?.url || '',
        canAdvertise: Array.isArray(p.tasks) ? p.tasks.includes('ADVERTISE') : true,
      })),
    });
  } catch (err) {
    handle(err, res);
  }
});

router.get('/pages/:pageId/posts', requireAuth, async (req, res) => {
  try {
    const pages = await getPages(req.session.fbToken);
    const page = assertPage(pages, req.params.pageId);
    const posts = await fetchPagePosts(page.access_token || req.session.fbToken, page.id, req.query.type || 'all');
    res.json({ posts });
  } catch (err) {
    handle(err, res);
  }
});

router.post('/campaign-builder/create-ads', requireAuth, async (req, res) => {
  const body = req.body || {};
  const token = req.session.fbToken;
  const results = [];
  try {
    if (!body.adAccountId) throw new Error('Thiếu tài khoản quảng cáo.');
    if (!body.pageId) throw new Error('Chưa chọn Page.');
    if (!Array.isArray(body.posts) || body.posts.length === 0) throw new Error('Chưa chọn bài viết.');
    await assertCampaign(token, body.campaignId);

    let adsetId = body.existingAdsetId;
    let newAdsetId = null;
    if (body.adsetMode === 'create_new') {
      const payload = buildAdsetPayload(body, body.campaignId, body.currency || '');
      const adset = await createAdSet(token, body.adAccountId, payload);
      adsetId = adset.id;
      newAdsetId = adset.id;
    } else {
      await assertAdsetBelongs(token, body.existingAdsetId, body.campaignId);
    }

    for (let i = 0; i < body.posts.length; i++) {
      const post = body.posts[i] || {};
      const objectStoryId = post.objectStoryId || post.object_story_id;
      const adName = postAdName(post, `Quảng cáo ${i + 1}`);
      const row = { index: i, objectStoryId, status: 'created', ids: { campaignId: body.campaignId, adsetId }, errors: [] };
      try {
        if (!objectStoryId) throw new Error('Bài này không có object_story_id.');
        const creative = await createAdCreative(token, body.adAccountId, {
          name: `Creative - ${adName}`,
          object_story_id: objectStoryId,
        });
        row.ids.creativeId = creative.id;
        const ad = await createAd(token, body.adAccountId, {
          name: adName,
          adset_id: adsetId,
          creative: { creative_id: creative.id },
          status: resolveAdStatus(body.status || 'PAUSED', false),
        });
        row.ids.adId = ad.id;
      } catch (err) {
        row.status = 'failed';
        row.errors.push(err.message || 'Không tạo được quảng cáo.');
        Object.assign(row, metaDetails(err));
      }
      results.push(row);
    }

    res.json({ ok: true, adsetId, newAdsetId, results });
  } catch (err) {
    handle(err, res, 400);
  }
});

export default router;
