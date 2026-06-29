import express from 'express';
import { requireAuth } from './auth.js';
import {
  getPages,
  checkPostExists,
  createCampaign,
  createAdSet,
  createAdCreative,
  createAd,
  getAdCreative,
  MetaApiError,
  resolvePostFromGraph,
} from '../meta-api.js';
import {
  resolveCountries,
  resolveAdStatus,
  resolveBudgetMode,
  resolveBudgetLevel,
  validateRow,
  ROW_STATUS,
} from '../validators.js';
import { parsePageId, parsePostId, parsePageSlugFromPostLink, buildObjectStoryId } from '../parsers.js';
import { resolveCta } from '../campaign-mapper.js';

const router = express.Router();
const ZERO_DECIMAL = new Set(['VND', 'JPY', 'KRW', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'VUV', 'XAF', 'XOF', 'PYG']);

function budgetToMinor(amount, currency) {
  const factor = ZERO_DECIMAL.has(String(currency || '').toUpperCase()) ? 1 : 100;
  return Math.round(Number(amount) * factor);
}

function normPageKey(s) {
  return (s ?? '').toString().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
}

function makePageMaps(pages) {
  const idMap = new Map(pages.map((p) => [String(p.id), p]));
  const usernameMap = new Map();
  for (const p of pages) {
    if (p.username) usernameMap.set(p.username.toLowerCase(), String(p.id));
    const m = (p.link || '').match(/facebook\.com\/([^/?#]+)/i);
    if (m?.[1] && !/^profile\.php$/i.test(m[1])) usernameMap.set(m[1].toLowerCase(), String(p.id));
    if (p.name) usernameMap.set(normPageKey(p.name), String(p.id));
  }
  return { idMap, usernameMap };
}

function setPage(parsed, maps, pageId) {
  if (!pageId) return;
  const id = String(pageId);
  parsed.pageId = id;
  parsed.pageName = maps.idMap.get(id)?.name || parsed.pageName || null;
}

function required(row, errors) {
  const fields = [
    ['pageLink', 'Page'],
    ['postLink', 'Post/Reel link hoặc object_story_id'],
    ['campaignName', 'tên chiến dịch'],
    ['adsetName', 'tên nhóm quảng cáo'],
    ['adName', 'tên quảng cáo'],
    ['country', 'quốc gia'],
    ['budget', 'ngân sách'],
    ['budgetMode', 'loại ngân sách'],
    ['budgetLevel', 'cấp ngân sách'],
    ['startDate', 'ngày bắt đầu'],
    ['statusRaw', 'trạng thái'],
  ];
  for (const [key, label] of fields) {
    if (row[key] == null || String(row[key]).trim() === '') errors.push(`Thiếu ${label}`);
  }
}

function metaDetails(err) {
  return err instanceof MetaApiError
    ? { metaErrorCode: err.code ?? null, metaErrorSubcode: err.subcode ?? null, fbtraceId: err.fbtrace ?? null }
    : {};
}

function isAuthExpired(err) {
  const msg = String(err?.message || '').toLowerCase();
  return err instanceof MetaApiError && (err.code === 190 || msg.includes('session') || msg.includes('token'));
}

function ctaCode(row) {
  const resolved = resolveCta(row.cta)?.code;
  if (!resolved) return null;
  return ['SHOP_NOW', 'LEARN_MORE'].includes(resolved) ? resolved : 'SHOP_NOW';
}

class RowError extends Error {
  constructor(message, status = ROW_STATUS.CREATE_ERROR, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function resolveExistingPostFast({ row, maps, errors, warnings }) {
  const parsed = {
    pageId: null,
    pageName: null,
    postId: null,
    videoId: null,
    objectStoryId: null,
    sourceObjectId: null,
    permalinkUrl: null,
    verifiedWithGraph: false,
  };

  if (row.pageLink) {
    const pageRes = parsePageId(row.pageLink);
    if (pageRes.id) setPage(parsed, maps, pageRes.id);
    else if (pageRes.slug) {
      const id = maps.usernameMap.get(pageRes.slug.toLowerCase()) || maps.usernameMap.get(normPageKey(pageRes.slug));
      if (id) setPage(parsed, maps, id);
    } else if (pageRes.error) {
      errors.push(pageRes.error);
    }
  }

  const postRes = parsePostId(row.postLink);
  if (postRes.error) {
    errors.push(postRes.error);
    return parsed;
  }

  if (!parsed.pageId && postRes.pageIdFromLink) setPage(parsed, maps, postRes.pageIdFromLink);
  if (!parsed.pageId) {
    const slug = parsePageSlugFromPostLink(row.postLink);
    const id = slug ? (maps.usernameMap.get(slug.toLowerCase()) || maps.usernameMap.get(normPageKey(slug))) : null;
    if (id) setPage(parsed, maps, id);
  }
  if (!parsed.pageId) {
    errors.push('Không tự nhận diện được Page. Hãy nhập Page ID hoặc link Page ở cột Page.');
    return parsed;
  }

  const page = maps.idMap.get(String(parsed.pageId));
  if (!page) {
    errors.push('Page không thuộc tài khoản Facebook đang đăng nhập.');
    return parsed;
  }
  if (Array.isArray(page.tasks) && !page.tasks.includes('ADVERTISE')) {
    errors.push('Tài khoản không có quyền ADVERTISE trên Page này.');
    return parsed;
  }

  if (postRes.postId) {
    parsed.postId = postRes.postId;
    parsed.videoId = (postRes.kind === 'video' || postRes.kind === 'reel') ? postRes.postId : null;
    parsed.sourceObjectId = postRes.postId;
    parsed.objectStoryId = postRes.pageIdFromLink
      ? buildObjectStoryId(postRes.pageIdFromLink, postRes.postId)
      : buildObjectStoryId(parsed.pageId, postRes.postId);
    warnings.push('Đã tạo object_story_id dự phòng. Khi tạo quảng cáo, Meta sẽ xác minh lại bài viết thật.');
  } else {
    errors.push('Không xác định được ID bài viết từ dữ liệu nhập.');
  }

  return parsed;
}

router.post('/validate', requireAuth, async (req, res, next) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows)) return next();

  try {
    const token = req.session.fbToken;
    const pages = await getPages(token);
    const maps = makePageMaps(pages);
    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = {
        ...rows[i],
        campaignType: 'Traffic',
        contentMode: 'Bài viết có sẵn',
        ctaHandling: 'Giữ CTA hiện tại',
      };
      const errors = [];
      const warnings = [];
      required(row, errors);

      const base = validateRow(row);
      errors.push(...base.errors.filter((e) => !/link CTA|link Shopee|CTA/i.test(e)));
      warnings.push(...base.warnings);

      const parsed = resolveExistingPostFast({ row, maps, errors, warnings });
      const status = errors.length ? ROW_STATUS.POST_ERROR : ROW_STATUS.VALID;
      results.push({ index: row.index ?? i, status, errors, warnings, parsed, normalized: base.normalized });
    }

    res.json({ results });
  } catch (err) {
    if (isAuthExpired(err)) {
      return res.status(401).json({ error: 'Access Token đã hết hạn, vui lòng nhập token mới.' });
    }
    next(err);
  }
});

router.post('/create', requireAuth, async (req, res, next) => {
  const { row, adAccountId, currency, draftMode } = req.body || {};
  if (!row || !adAccountId) return next();

  const result = { index: row.index, status: ROW_STATUS.CREATED, errors: [], warnings: [], ids: {}, mode: 'EXISTING_POST_TRAFFIC' };

  try {
    const token = req.session.fbToken;
    const accountId = row.adAccountId || adAccountId;
    const pageId = row.parsed?.pageId;
    let objectStoryId = row.parsed?.objectStoryId;
    if (!pageId || !objectStoryId) throw new RowError('Thiếu Page ID hoặc Object Story ID.');

    const pages = await getPages(token);
    const page = pages.find((p) => String(p.id) === String(pageId));
    if (!page) throw new RowError('Page không thuộc tài khoản đang đăng nhập.', ROW_STATUS.PERMISSION);
    if (Array.isArray(page.tasks) && !page.tasks.includes('ADVERTISE')) throw new RowError('Không có quyền ADVERTISE trên Page.', ROW_STATUS.PERMISSION);
    const pageToken = page.access_token || token;

    if (row.parsed?.videoId) {
      try {
        const fresh = await resolvePostFromGraph(pageToken, pageId, row.postLink, row.parsed.videoId, 'reel');
        if (fresh?.objectStoryId) objectStoryId = fresh.objectStoryId;
      } catch {}
    }

    const post = await checkPostExists(pageToken, objectStoryId);
    if (!post?.id) throw new RowError('Không tìm thấy bài viết gốc. Nếu đây là Reel, Meta chưa map Video ID sang Post ID cho Page này.');

    const code = ctaCode(row);
    const link = row.ctaLink ? String(row.ctaLink).trim() : '';
    let creativePayload = { name: `${row.adName || 'Ad'} - existing post`, object_story_id: objectStoryId };
    if (code && link) {
      creativePayload = {
        ...creativePayload,
        call_to_action: { type: code, value: { link } },
      };
    }

    let creative;
    try {
      creative = await createAdCreative(token, accountId, creativePayload);
    } catch (err) {
      if (code && link) {
        result.warnings.push('Meta không nhận CTA/link, đã tạo quảng cáo bằng bài viết có sẵn.');
        creativePayload = { name: `${row.adName || 'Ad'} - existing post`, object_story_id: objectStoryId };
        creative = await createAdCreative(token, accountId, creativePayload);
      } else {
        const status = err instanceof MetaApiError && [10, 200, 294].includes(err.code) ? ROW_STATUS.PERMISSION : ROW_STATUS.CREATE_ERROR;
        throw new RowError(`Meta không cho phép tạo quảng cáo từ bài viết có sẵn này: ${err.message}`, status, metaDetails(err));
      }
    }
    result.ids.creativeId = creative.id;

    if (code && link) {
      try {
        const info = await getAdCreative(token, creative.id, 'id,call_to_action,object_story_spec');
        const returnedCta = info.call_to_action?.type || info.object_story_spec?.link_data?.call_to_action?.type || info.object_story_spec?.video_data?.call_to_action?.type;
        const returnedLink = info.call_to_action?.value?.link || info.object_story_spec?.link_data?.call_to_action?.value?.link || info.object_story_spec?.video_data?.call_to_action?.value?.link;
        if (returnedCta !== code || !returnedLink) {
          result.warnings.push('Meta bỏ qua CTA/link trên creative, nhưng vẫn tạo ads bằng bài viết có sẵn.');
        }
      } catch {
        result.warnings.push('Không đọc lại được CTA/link sau khi tạo creative; tiếp tục tạo ads bằng bài viết có sẵn.');
      }
    }

    const { codes: countries } = resolveCountries(row.country || 'VN');
    if (!countries.length) throw new RowError('Thiếu quốc gia hợp lệ.');

    const budgetMode = row.normalized?.budgetMode || resolveBudgetMode(row.budgetMode);
    const budgetLevel = row.normalized?.budgetLevel || resolveBudgetLevel(row.budgetLevel);
    const budgetField = budgetMode === 'lifetime' ? 'lifetime_budget' : 'daily_budget';
    if (budgetMode === 'lifetime' && !row.normalized?.endTime) throw new RowError('Ngân sách trọn đời cần ngày kết thúc.');
    const budget = budgetToMinor(row.normalized?.budget ?? row.budget, currency);
    if (!Number.isFinite(budget) || budget <= 0) throw new RowError('Ngân sách không hợp lệ.');

    const adStatus = resolveAdStatus(row.statusRaw, draftMode);
    const campaign = await createCampaign(token, accountId, {
      name: row.campaignName,
      objective: 'OUTCOME_TRAFFIC',
      status: draftMode ? 'PAUSED' : adStatus,
      special_ad_categories: [],
      ...(budgetLevel === 'campaign' ? { [budgetField]: budget, bid_strategy: 'LOWEST_COST_WITHOUT_CAP' } : { is_adset_budget_sharing_enabled: false }),
    });
    result.ids.campaignId = campaign.id;

    const adset = await createAdSet(token, accountId, {
      name: row.adsetName,
      campaign_id: campaign.id,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      destination_type: 'WEBSITE',
      status: adStatus,
      targeting: { geo_locations: { countries }, age_min: 18, age_max: 65 },
      ...(budgetLevel === 'adset' ? { [budgetField]: budget, bid_strategy: 'LOWEST_COST_WITHOUT_CAP' } : {}),
      ...(row.normalized?.startTime ? { start_time: row.normalized.startTime } : {}),
      ...(row.normalized?.endTime ? { end_time: row.normalized.endTime } : {}),
    });
    result.ids.adsetId = adset.id;

    const ad = await createAd(token, accountId, {
      name: row.adName,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: adStatus,
    });
    result.ids.adId = ad.id;
  } catch (err) {
    result.status = err instanceof RowError ? err.status : ROW_STATUS.CREATE_ERROR;
    result.errors.push(err.message || 'Không thể tạo quảng cáo.');
    Object.assign(result, err.details || metaDetails(err));
  }

  res.json({ result });
});

export default router;
