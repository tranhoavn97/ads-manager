import express from 'express';
import { requireAuth } from './auth.js';
import { getPages, checkPostExists, createCampaign, createAdSet, createAdCreative, createAd, MetaApiError } from '../meta-api.js';
import { resolveCountries, resolveAdStatus, resolveBudgetMode, resolveBudgetLevel, ROW_STATUS } from '../validators.js';
import { resolveCta } from '../campaign-mapper.js';

const router = express.Router();
const ZERO = new Set(['VND','JPY','KRW','CLP','ISK','HUF','TWD','UGX','VUV','XAF','XOF','PYG']);
const minor = (v, c) => Math.round(Number(v) * (ZERO.has(String(c || '').toUpperCase()) ? 1 : 100));
const metaDetails = (e) => e instanceof MetaApiError ? { metaErrorCode: e.code ?? null, metaErrorSubcode: e.subcode ?? null, fbtraceId: e.fbtrace ?? null } : {};

class RowError extends Error {
  constructor(message, status = ROW_STATUS.CREATE_ERROR, details = {}) {
    super(message); this.status = status; this.details = details;
  }
}

router.post('/create', requireAuth, async (req, res, next) => {
  const { row, adAccountId, currency, draftMode } = req.body || {};
  if (!row || !adAccountId || !row.ctaLink) return next();

  const result = { index: row.index, status: ROW_STATUS.CREATED, errors: [], ids: {}, mode: 'EXISTING_POST_SHOPEE' };
  try {
    const token = req.session.fbToken;
    const pageId = row.parsed?.pageId;
    const postId = row.parsed?.objectStoryId;
    const accountId = row.adAccountId || adAccountId;
    const link = String(row.ctaLink).trim();
    if (!pageId || !postId) throw new RowError('Thiếu Page ID hoặc Post ID đã xác minh.');
    if (!/^https?:\/\//i.test(link)) throw new RowError('Link Shopee phải bắt đầu bằng http:// hoặc https://.');

    const { codes: countries } = resolveCountries(row.country);
    if (!countries.length) throw new RowError('Thiếu quốc gia hợp lệ.');

    const pages = await getPages(token);
    const page = pages.find(p => String(p.id) === String(pageId));
    if (!page) throw new RowError('Page không thuộc tài khoản đang đăng nhập.', ROW_STATUS.PERMISSION);
    if (Array.isArray(page.tasks) && !page.tasks.includes('ADVERTISE')) throw new RowError('Không có quyền ADVERTISE trên Page.', ROW_STATUS.PERMISSION);
    const post = await checkPostExists(page.access_token || token, postId);
    if (!post?.id) throw new RowError('Không tìm thấy bài viết gốc.');

    const requested = resolveCta(row.cta)?.code || 'SHOP_NOW';
    const cta = ['SHOP_NOW','LEARN_MORE'].includes(requested) ? requested : 'SHOP_NOW';

    let creative;
    try {
      creative = await createAdCreative(token, accountId, {
        name: `${row.adName || 'Ad'} - existing post Shopee`,
        object_story_id: postId,
        call_to_action: { type: cta, value: { link } },
      });
      result.ids.creativeId = creative.id;
    } catch (e) {
      const status = e instanceof MetaApiError && [10,200,294].includes(e.code) ? ROW_STATUS.PERMISSION : ROW_STATUS.CREATE_ERROR;
      throw new RowError(`Meta không cho phép gắn CTA/link Shopee vào bài viết có sẵn: ${e.message}`, status, metaDetails(e));
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

    const adsetData = {
      name: row.adsetName, campaign_id: campaign.id, billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS', destination_type: 'WEBSITE', status: adStatus,
      targeting: { geo_locations: { countries }, age_min: 18, age_max: 65 },
    };
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
