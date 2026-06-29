import express from 'express';
import { requireAuth } from './auth.js';
import { getPages, checkPostExists, createCampaign, createAdSet, createAdCreative, createAd, MetaApiError, resolvePostFromGraph } from '../meta-api.js';
import { resolveCountries, resolveAdStatus, resolveBudgetMode, resolveBudgetLevel, validateRow, ROW_STATUS } from '../validators.js';
import { parsePageId, parsePostId, parsePageSlugFromPostLink } from '../parsers.js';

const router = express.Router();
const ZERO = new Set(['VND','JPY','KRW','CLP','ISK','HUF','TWD','UGX','VUV','XAF','XOF','PYG']);
const minor = (v, c) => Math.round(Number(v) * (ZERO.has(String(c || '').toUpperCase()) ? 1 : 100));
const metaDetails = (e) => e instanceof MetaApiError ? { metaErrorCode: e.code ?? null, metaErrorSubcode: e.subcode ?? null, fbtraceId: e.fbtrace ?? null } : {};

function normPageKey(s) {
  return (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
}
function makeOwnedMaps(pages) {
  const idMap = new Map(pages.map((p) => [String(p.id), p]));
  const usernameMap = new Map();
  for (const p of pages) {
    if (p.username) usernameMap.set(p.username.toLowerCase(), String(p.id));
    const m = (p.link || '').match(/facebook\.com\/([^/?#]+)/i);
    if (m?.[1] && !/^profile\.php$/i.test(m[1])) usernameMap.set(m[1].toLowerCase(), String(p.id));
    if (p.name && normPageKey(p.name)) usernameMap.set(normPageKey(p.name), String(p.id));
  }
  return { idMap, usernameMap };
}
function setPage(parsed, maps, pageId) {
  if (!pageId) return;
  const id = String(pageId);
  parsed.pageId = id;
  parsed.pageName = maps.idMap.get(id)?.name || parsed.pageName || null;
}
class RowError extends Error {
  constructor(message, status = ROW_STATUS.CREATE_ERROR, details = {}) {
    super(message); this.status = status; this.details = details;
  }
}

router.post('/validate', requireAuth, async (req, res, next) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows)) return next();
  const token = req.session.fbToken;
  const pages = await getPages(token);
  const maps = makeOwnedMaps(pages);
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const base = validateRow({ ...row, campaignType: 'Traffic', contentMode: 'Bài viết có sẵn', ctaHandling: 'Bỏ CTA', ctaLink: 'existing-post-only' });
    const errors = [...base.errors].filter((err) => !/link CTA|link Shopee|CTA/i.test(err));
    const warnings = [...base.warnings];
    const parsed = { pageId: null, pageName: null, postId: null, videoId: null, objectStoryId: null, sourceObjectId: null, permalinkUrl: null, verifiedWithGraph: false };

    if (row.pageLink) {
      const pageRes = parsePageId(row.pageLink);
      if (pageRes.id) setPage(parsed, maps, pageRes.id);
      else if (pageRes.slug) {
        const key = pageRes.slug.toLowerCase();
        const id = maps.usernameMap.get(key) || maps.usernameMap.get(normPageKey(key));
        if (id) setPage(parsed, maps, id);
      }
    }

    const postRes = parsePostId(row.postLink);
    if (postRes.error) errors.push(postRes.error);
    else {
      if (!parsed.pageId && postRes.pageIdFromLink) setPage(parsed, maps, postRes.pageIdFromLink);
      if (!parsed.pageId) {
        const slug = parsePageSlugFromPostLink(row.postLink);
        const id = slug ? (maps.usernameMap.get(slug.toLowerCase()) || maps.usernameMap.get(normPageKey(slug))) : null;
        if (id) setPage(parsed, maps, id);
      }
      if (!parsed.pageId) errors.push('Không tự nhận diện được Page từ link này. Hãy nhập Page ID hoặc link Page ở cột Page.');
      else {
        const page = maps.idMap.get(parsed.pageId);
        if (!page) errors.push('Page không thuộc tài khoản Facebook đang đăng nhập.');
        else if (Array.isArray(page.tasks) && !page.tasks.includes('ADVERTISE')) errors.push('Tài khoản không có quyền ADVERTISE trên Page này.');
        else if (postRes.postId) {
          parsed.postId = postRes.postId;
          parsed.videoId = (postRes.kind === 'reel' || postRes.kind === 'video') ? postRes.postId : null;
          parsed.objectStoryId = postRes.pageIdFromLink ? `${postRes.pageIdFromLink}_${postRes.postId}` : `${parsed.pageId}_${postRes.postId}`;
          parsed.sourceObjectId = postRes.postId;
          parsed.verifiedWithGraph = false;
          warnings.push('Đã tạo object_story_id dự phòng. Khi tạo quảng cáo, Meta sẽ xác minh lại bài viết thật.');
        } else errors.push('Không xác định được Post ID thật từ link này.');
      }
    }
    results.push({ index: i, status: errors.length ? ROW_STATUS.POST_ERROR : ROW_STATUS.VALID, errors, warnings, parsed, normalized: base.normalized });
  }
  res.json({ results });
});

router.post('/create', requireAuth, async (req, res, next) => {
  const { row, adAccountId, currency, draftMode } = req.body || {};
  if (!row || !adAccountId) return next();
  const result = { index: row.index, status: ROW_STATUS.CREATED, errors: [], ids: {}, mode: 'EXISTING_POST_ONLY' };

  try {
    const token = req.session.fbToken;
    const pageId = row.parsed?.pageId;
    const postId = row.parsed?.objectStoryId;
    const accountId = row.adAccountId || adAccountId;
    if (!pageId || !postId) throw new RowError('Thiếu Page ID hoặc Post ID đã xác minh.');

    const { codes: countries } = resolveCountries(row.country);
    if (!countries.length) throw new RowError('Thiếu quốc gia hợp lệ.');

    const pages = await getPages(token);
    const page = pages.find(p => String(p.id) === String(pageId));
    if (!page) throw new RowError('Page không thuộc tài khoản đang đăng nhập.', ROW_STATUS.PERMISSION);
    if (Array.isArray(page.tasks) && !page.tasks.includes('ADVERTISE')) throw new RowError('Không có quyền ADVERTISE trên Page.', ROW_STATUS.PERMISSION);

    let realPostId = postId;
    try {
      const fresh = row.parsed?.videoId ? await resolvePostFromGraph(page.access_token || token, pageId, row.postLink, row.parsed.videoId, 'reel') : null;
      if (fresh?.objectStoryId) realPostId = fresh.objectStoryId;
    } catch {}

    const post = await checkPostExists(page.access_token || token, realPostId);
    if (!post?.id) throw new RowError('Không tìm thấy bài viết gốc. Nếu đây là Reel, Meta chưa map Video ID sang Post ID cho Page này.');

    let creative;
    try {
      creative = await createAdCreative(token, accountId, {
        name: `${row.adName || 'Ad'} - existing post`,
        object_story_id: realPostId,
      });
      result.ids.creativeId = creative.id;
    } catch (e) {
      const status = e instanceof MetaApiError && [10,200,294].includes(e.code) ? ROW_STATUS.PERMISSION : ROW_STATUS.CREATE_ERROR;
      throw new RowError(`Meta không cho phép tạo quảng cáo từ bài viết có sẵn này: ${e.message}`, status, metaDetails(e));
    }

    const adStatus = resolveAdStatus(row.statusRaw, draftMode);
    const budgetMode = row.normalized?.budgetMode || resolveBudgetMode(row.budgetMode);
    const budgetLevel = row.normalized?.budgetLevel || resolveBudgetLevel(row.budgetLevel);
    const budgetField = budgetMode === 'lifetime' ? 'lifetime_budget' : 'daily_budget';
    const budget = minor(row.normalized?.budget ?? row.budget, currency);
    if (!Number.isFinite(budget) || budget <= 0) throw new RowError('Ngân sách không hợp lệ.');
    if (budgetMode === 'lifetime' && !row.normalized?.endTime) throw new RowError('Ngân sách trọn đời cần ngày kết thúc.');

    const campaignData = { name: row.campaignName, objective: 'OUTCOME_TRAFFIC', status: draftMode ? 'PAUSED' : adStatus, special_ad_categories: [] };
    if (budgetLevel === 'campaign') Object.assign(campaignData, { [budgetField]: budget, bid_strategy: 'LOWEST_COST_WITHOUT_CAP' });
    else campaignData.is_adset_budget_sharing_enabled = false;
    const campaign = await createCampaign(token, accountId, campaignData);
    result.ids.campaignId = campaign.id;

    const adsetData = { name: row.adsetName, campaign_id: campaign.id, billing_event: 'IMPRESSIONS', optimization_goal: 'POST_ENGAGEMENT', status: adStatus, targeting: { geo_locations: { countries }, age_min: 18, age_max: 65 } };
    if (budgetLevel === 'adset') Object.assign(adsetData, { [budgetField]: budget, bid_strategy: 'LOWEST_COST_WITHOUT_CAP' });
    if (row.normalized?.startTime) adsetData.start_time = row.normalized.startTime;
    if (row.normalized?.endTime) adsetData.end_time = row.normalized.endTime;
    const adset = await createAdSet(token, accountId, adsetData);
    result.ids.adsetId = adset.id;

    const ad = await createAd(token, accountId, { name: row.adName, adset_id: adset.id, creative: { creative_id: creative.id }, status: adStatus });
    result.ids.adId = ad.id;
  } catch (e) {
    result.status = e instanceof RowError ? e.status : ROW_STATUS.CREATE_ERROR;
    result.errors.push(e.message || 'Không thể tạo quảng cáo.');
    Object.assign(result, e.details || metaDetails(e));
  }
  res.json({ result });
});

export default router;
