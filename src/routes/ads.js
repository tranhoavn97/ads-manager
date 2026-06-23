import express from 'express';
import { requireAuth } from './auth.js';
import {
  getPages, resolvePageSlug, scrapePageId, checkPostExists,
  createCampaign, createAdSet, createAdCreative, createAd,
  MetaApiError,
} from '../meta-api.js';
import { parsePageId, parsePostId, buildObjectStoryId } from '../parsers.js';
import { validateRow, resolveCountries, resolveAdStatus, resolveBudgetMode, resolveBudgetLevel, ROW_STATUS } from '../validators.js';
import { resolveCampaignType, resolveCta } from '../campaign-mapper.js';

const router = express.Router();

// Các loại tiền tệ không có phần thập phân (truyền nguyên số tiền)
const ZERO_DECIMAL = new Set(['VND', 'JPY', 'KRW', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'VUV', 'XAF', 'XOF', 'PYG']);

function budgetToMinorUnit(amount, currency) {
  const factor = ZERO_DECIMAL.has((currency || '').toUpperCase()) ? 1 : 100;
  return Math.round(Number(amount) * factor);
}

// Lấy danh sách Page sở hữu + map slug->id (cache trong 1 request)
async function loadOwnedPages(token) {
  const pages = await getPages(token);
  const idSet = new Set(pages.map((p) => p.id));
  const advertiseSet = new Set(
    pages.filter((p) => !Array.isArray(p.tasks) || p.tasks.includes('ADVERTISE')).map((p) => p.id)
  );
  // Map tên vanity (username / slug trong link / tên đã bỏ dấu) -> ID số
  const usernameMap = new Map();
  const norm = (s) => (s ?? '').toString().toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
  for (const p of pages) {
    if (p.username) usernameMap.set(p.username.toLowerCase(), p.id);
    // Tách slug từ trường link (vd https://facebook.com/HaiDangReviewtaphoa)
    const m = (p.link || '').match(/facebook\.com\/([^/?#]+)/i);
    if (m && m[1] && !/^profile\.php$/i.test(m[1])) usernameMap.set(m[1].toLowerCase(), p.id);
    // Khớp theo tên Page đã bỏ dấu/khoảng trắng (vd "Hải Đăng Review tạp hóa" -> haidangreviewtaphoa)
    if (p.name && norm(p.name)) usernameMap.set(norm(p.name), p.id);
  }
  return { pages, idSet, advertiseSet, usernameMap };
}

// ---------- BƯỚC KIỂM TRA (PREVIEW) ----------
router.post('/validate', requireAuth, async (req, res) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'Dữ liệu rows không hợp lệ' });
  }

  let owned;
  try {
    owned = await loadOwnedPages(req.session.fbToken);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err instanceof MetaApiError ? err.message : err.message });
  }

  const slugCache = new Map();
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const base = validateRow(row);
    const errors = [...base.errors];
    const warnings = [...base.warnings];
    const parsed = { pageId: null, postId: null, objectStoryId: null };
    let status = base.status;

    // 0) Nút CTA: cảnh báo nhẹ nếu nhập nhưng không nhận dạng được
    if (row.cta && row.cta.toString().trim() && !resolveCta(row.cta)) {
      warnings.push(`Nút CTA "${row.cta}" không nhận dạng — sẽ dùng nút mặc định theo loại chiến dịch.`);
    }

    // 1) Page ID
    const pageRes = parsePageId(row.pageLink);
    if (pageRes.error) {
      errors.push(pageRes.error);
    } else if (pageRes.needsResolve) {
      const key = pageRes.slug.toLowerCase();
      const normKey = key.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
      if (slugCache.has(key)) {
        parsed.pageId = slugCache.get(key);
      } else if (owned.usernameMap.has(key) || owned.usernameMap.has(normKey)) {
        // Khớp với Page bạn quản lý (đáng tin cậy nhất)
        parsed.pageId = owned.usernameMap.get(key) || owned.usernameMap.get(normKey);
        slugCache.set(key, parsed.pageId);
      } else {
        // Thử Graph API, nếu bị chặn thì dò ID từ trang công khai
        let resolvedId = null;
        try {
          const r = await resolvePageSlug(req.session.fbToken, pageRes.slug);
          resolvedId = r.id;
        } catch { /* Graph API thường chặn tra theo tên */ }
        if (!resolvedId) resolvedId = await scrapePageId(pageRes.slug);
        if (resolvedId) {
          parsed.pageId = resolvedId;
          slugCache.set(key, resolvedId);
        } else {
          errors.push(`Không lấy được Page ID từ tên "${pageRes.slug}". Hãy thay cột Link Page bằng ID Page dạng số (hoặc link có ID số).`);
        }
      }
    } else {
      parsed.pageId = pageRes.id;
    }

    // 2) Kiểm tra Page thuộc tài khoản đang đăng nhập
    if (parsed.pageId) {
      if (!owned.idSet.has(parsed.pageId)) {
        errors.push('Page không thuộc tài khoản Facebook đang đăng nhập (không quản lý Page này).');
        if (status === ROW_STATUS.VALID) status = ROW_STATUS.PERMISSION;
      } else if (!owned.advertiseSet.has(parsed.pageId)) {
        errors.push('Tài khoản không có quyền ADVERTISE trên Page này.');
        if (status === ROW_STATUS.VALID) status = ROW_STATUS.PERMISSION;
      }
    }

    // 3) Post / Object ID (nếu có link bài viết)
    if (row.postLink && row.postLink.toString().trim()) {
      const ctype = resolveCampaignType(row.campaignType);
      const isTraffic = ctype && ctype.id === 'traffic';
      const willUseLink = !!(ctype && ctype.needsLink && !isTraffic && row.ctaLink && row.ctaLink.toString().trim());
      const postRes = parsePostId(row.postLink);
      if (postRes.error) {
        if (willUseLink) {
          warnings.push(`Bỏ qua reel/bài viết (dùng quảng cáo link website cho loại "${ctype.label}"). ${postRes.error}`);
        } else {
          errors.push(postRes.error);
          if (status === ROW_STATUS.VALID) status = ROW_STATUS.POST_ERROR;
        }
      } else {
        parsed.postId = postRes.postId;
        const ownerPageId = postRes.pageIdFromLink || parsed.pageId;
        parsed.objectStoryId = buildObjectStoryId(ownerPageId, postRes.postId);
        
        // Loại Traffic: dùng bài viết có sẵn cần kiểm tra và bắt buộc có link CTA
        if (isTraffic) {
          if (!row.ctaLink || !row.ctaLink.toString().trim()) {
            errors.push('Thiếu link CTA để gắn nút Mua ngay');
            if (status === ROW_STATUS.VALID) status = ROW_STATUS.MISSING;
          }
        }

        if (willUseLink) {
          warnings.push(`Loại "${ctype.label}" sẽ tạo quảng cáo LINK tới website (${row.ctaLink}); reel/bài viết được bỏ qua.`);
        } else if (parsed.objectStoryId) {
          const ownerPage = owned.pages.find((p) => p.id === ownerPageId);
          const postToken = ownerPage?.access_token || req.session.fbToken;
          try {
            const postInfo = await checkPostExists(postToken, parsed.objectStoryId);
            if (postInfo && postInfo.call_to_action && postInfo.call_to_action.type && postInfo.call_to_action.type !== 'NO_BUTTON') {
              parsed.hasOldCta = true;
            }
          } catch (err) {
            const code = err instanceof MetaApiError ? err.code : null;
            // Lỗi quyền đọc bài: chỉ cảnh báo (không chặn) để vẫn cho tạo
            const permCodes = [10, 200, 190, 3, 102, 458, 459, 463, 467, 1349125];
            if (permCodes.includes(code)) {
              warnings.push('Chưa kiểm tra trước được bài viết do token thiếu quyền "pages_read_engagement". Vẫn cho phép tạo — nếu reel/bài viết thuộc Page bạn quản lý thì thường vẫn tạo được. Nên dùng token có quyền pages_read_engagement để chắc chắn.');
            } else {
              errors.push(err instanceof MetaApiError ? `Lỗi bài viết: ${err.message}` : 'Không truy cập được bài viết');
              if (status === ROW_STATUS.VALID) status = ROW_STATUS.POST_ERROR;
            }
          }
        }
      }
    }

    if (errors.length && status === ROW_STATUS.VALID) status = ROW_STATUS.MISSING;

    results.push({
      index: i,
      status,
      errors,
      warnings,
      parsed,
      normalized: base.normalized,
    });
  }

  res.json({ results });
});

// ---------- BƯỚC TẠO HÀNG LOẠT ----------
router.post('/create', requireAuth, async (req, res) => {
  const { rows, adAccountId, currency, draftMode } = req.body || {};
  if (!Array.isArray(rows) || !adAccountId) {
    return res.status(400).json({ error: 'Thiếu rows hoặc adAccountId' });
  }

  const token = req.session.fbToken;
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const result = { index: row.index ?? i, status: ROW_STATUS.CREATED, errors: [], ids: {} };

    try {
      const ctype = resolveCampaignType(row.campaignType);
      if (!ctype) throw new RowError('Loại chiến dịch không hợp lệ', ROW_STATUS.CREATE_ERROR);

      const { codes: countries } = resolveCountries(row.country);
      if (!countries.length) throw new RowError('Thiếu quốc gia hợp lệ', ROW_STATUS.CREATE_ERROR);

      const pageId = row.parsed?.pageId;
      if (!pageId) throw new RowError('Thiếu Page ID', ROW_STATUS.CREATE_ERROR);

      const adStatus = resolveAdStatus(row.statusRaw, draftMode);
      const campaignStatus = draftMode ? 'PAUSED' : adStatus;

      // Ngân sách: hàng ngày/trọn đời + cấp chiến dịch (CBO)/nhóm
      const budgetMinor = budgetToMinorUnit(row.normalized?.budget ?? row.budget, currency);
      const budgetMode = row.normalized?.budgetMode || resolveBudgetMode(row.budgetMode);
      const budgetLevel = row.normalized?.budgetLevel || resolveBudgetLevel(row.budgetLevel);
      const budgetField = budgetMode === 'lifetime' ? 'lifetime_budget' : 'daily_budget';
      if (budgetMode === 'lifetime' && !row.normalized?.endTime) {
        throw new RowError('Ngân sách trọn đời cần Ngày kết thúc', ROW_STATUS.CREATE_ERROR);
      }

      // 1) CAMPAIGN (đặt ngân sách ở đây nếu chọn cấp chiến dịch — CBO)
      const campaignPayload = {
        name: row.campaignName,
        objective: ctype.objective,
        status: campaignStatus,
        special_ad_categories: [],
      };
      if (budgetLevel === 'campaign') {
        campaignPayload[budgetField] = budgetMinor;
        campaignPayload.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
      } else {
        // Ngân sách ở cấp nhóm: Meta (API mới) bắt buộc khai báo trường này
        campaignPayload.is_adset_budget_sharing_enabled = false;
      }
      const campaign = await createCampaign(token, adAccountId, campaignPayload);
      result.ids.campaignId = campaign.id;

      // 2) AD SET (đặt ngân sách ở đây nếu chọn cấp nhóm)
      const adsetPayload = {
        name: row.adsetName,
        campaign_id: campaign.id,
        billing_event: ctype.billing_event,
        optimization_goal: ctype.optimization_goal,
        status: adStatus,
        targeting: {
          geo_locations: { countries },
          age_min: 18,
          age_max: 65,
        },
      };
      if (budgetLevel === 'adset') {
        adsetPayload[budgetField] = budgetMinor;
        adsetPayload.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
      }
      if (row.normalized?.startTime) adsetPayload.start_time = row.normalized.startTime;
      if (row.normalized?.endTime) adsetPayload.end_time = row.normalized.endTime;
      if (ctype.destination_type) adsetPayload.destination_type = ctype.destination_type;
      // promoted_object cho tin nhắn / lead
      if (ctype.id === 'tin_nhan' || ctype.id === 'lead') {
        adsetPayload.promoted_object = { page_id: pageId };
      }

      const adset = await createAdSet(token, adAccountId, adsetPayload);
      result.ids.adsetId = adset.id;

      // 3) AD CREATIVE
      const isTraffic = ctype && ctype.id === 'traffic';
      const hasPost = !!row.parsed?.objectStoryId;
      const useLink = row.ctaLink && (ctype.needsLink && !isTraffic || !hasPost);
      let creative;
      let creativePayload;

      if (useLink) {
        // Quảng cáo link tới website — CTA lấy từ sheet nếu có, không thì mặc định theo loại
        const ctaOverride = resolveCta(row.cta);
        const ctaType = ctaOverride && ctaOverride.code !== 'NO_BUTTON' ? ctaOverride.code : ctype.default_cta;
        const link_data = { link: row.ctaLink, message: row.adName };
        if (!(ctaOverride && ctaOverride.code === 'NO_BUTTON')) {
          link_data.call_to_action = { type: ctaType, value: { link: row.ctaLink } };
        }
        creativePayload = {
          name: `${row.adName} - creative`,
          object_story_spec: { page_id: pageId, link_data },
        };
        creative = await createAdCreative(token, adAccountId, creativePayload);
      } else if (row.parsed?.objectStoryId) {
        if (isTraffic) {
          if (!row.ctaLink || !row.ctaLink.toString().trim()) {
            throw new RowError('Thiếu link CTA để gắn nút Mua ngay', ROW_STATUS.POST_ERROR);
          }
          // 5. Thử tạo creative bằng cách dùng object_story_id và truyền call_to_action trực tiếp
          creativePayload = {
            name: `${row.adName} - creative`,
            object_story_id: row.parsed.objectStoryId,
            call_to_action: {
              type: 'SHOP_NOW',
              value: {
                link: row.ctaLink,
              }
            }
          };
          try {
            creative = await createAdCreative(token, adAccountId, creativePayload);
          } catch (err) {
            console.log("Không thể override CTA trên object_story_id trực tiếp. Chi tiết lỗi:", err.message);
            throw new RowError('Meta không cho gắn CTA mới trực tiếp vào bài viết có sẵn này. Vui lòng dùng bài viết hỗ trợ CTA hoặc tạo creative dark post riêng.', ROW_STATUS.POST_ERROR);
          }
        } else {
          // Quảng cáo từ bài viết/reel có sẵn (boost) cho các mục tiêu khác
          creativePayload = { name: `${row.adName} - creative`, object_story_id: row.parsed.objectStoryId };
          creative = await createAdCreative(token, adAccountId, creativePayload);
        }
      } else {
        throw new RowError('Thiếu cả bài viết lẫn link CTA để tạo nội dung quảng cáo', ROW_STATUS.POST_ERROR);
      }
      result.ids.creativeId = creative.id;

      // 4) AD
      const ad = await createAd(token, adAccountId, {
        name: row.adName,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: adStatus,
      });
      result.ids.adId = ad.id;

      result.status = ROW_STATUS.CREATED;
    } catch (err) {
      if (err instanceof RowError) {
        result.status = err.rowStatus;
        result.errors.push(err.message);
      } else if (err instanceof MetaApiError) {
        // Phân loại lỗi quyền vs lỗi tạo
        result.status = err.code === 200 || err.code === 10 || err.code === 294
          ? ROW_STATUS.PERMISSION
          : ROW_STATUS.CREATE_ERROR;
        result.errors.push(err.message);
      } else {
        result.status = ROW_STATUS.CREATE_ERROR;
        result.errors.push('Lỗi không xác định: ' + err.message);
      }
    }

    results.push(result);
  }

  res.json({ results, draftMode: Boolean(draftMode) });
});

class RowError extends Error {
  constructor(message, rowStatus) {
    super(message);
    this.rowStatus = rowStatus;
  }
}

export default router;
