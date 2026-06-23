import express from 'express';
import { requireAuth } from './auth.js';
import {
  getPages, resolvePageSlug, scrapePageId, checkPostExists,
  createCampaign, createAdSet, createAdCreative, createAd,
  MetaApiError, resolvePostFromGraph, verifyPostDetails, isPermalinkMatch,
} from '../meta-api.js';
import { parsePageId, parsePostId, buildObjectStoryId, normalizeFbUrl } from '../parsers.js';
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
  const { rows, creativeMode } = req.body || {};
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
    const parsed = {
      pageId: null,
      postId: null,
      videoId: null,
      objectStoryId: null,
      sourceObjectId: null,
      permalinkUrl: null,
      verifiedWithGraph: false
    };
    let status = base.status;

    // 0) Nút CTA: cảnh báo nhẹ nếu nhập nhưng không nhận dạng được
    if (row.cta && row.cta.toString().trim() && !resolveCta(row.cta)) {
      warnings.push(`Nút CTA "${row.cta}" không nhận dạng — sẽ dùng nút mặc định theo loại chiến dịch.`);
    }

    // 1) Page ID
    if (row.pageLink && row.pageLink.toString().trim()) {
      const pageRes = parsePageId(row.pageLink);
      if (pageRes.error) {
        errors.push(pageRes.error);
      } else if (pageRes.needsResolve) {
        const key = pageRes.slug.toLowerCase();
        const normKey = key.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
        if (slugCache.has(key)) {
          parsed.pageId = slugCache.get(key);
        } else if (owned.usernameMap.has(key) || owned.usernameMap.has(normKey)) {
          parsed.pageId = owned.usernameMap.get(key) || owned.usernameMap.get(normKey);
          slugCache.set(key, parsed.pageId);
        } else {
          let resolvedId = null;
          try {
            const r = await resolvePageSlug(req.session.fbToken, pageRes.slug);
            resolvedId = r.id;
          } catch {}
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
    }

    // 3) Post / Object ID (nếu có link bài viết)
    if (row.postLink && row.postLink.toString().trim()) {
      const ctype = resolveCampaignType(row.campaignType);
      const isTraffic = ctype && ctype.id === 'traffic';
      const mode = creativeMode || 'NEW_CTA_CREATIVE';
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
        if (willUseLink) {
          warnings.push(`Loại "${ctype.label}" sẽ tạo quảng cáo LINK tới website (${row.ctaLink}); reel/bài viết được bỏ qua.`);
        } else {
          let pageId = parsed.pageId || postRes.pageIdFromLink;
          const postToken = req.session.fbToken;
          
          if (!pageId && postRes.postId) {
            try {
              const postObj = await verifyPostDetails(postToken, postRes.postId);
              if (postObj && postObj.from?.id) {
                pageId = postObj.from.id;
              }
            } catch (e) {}
          }
          
          if (pageId) {
            parsed.pageId = pageId;
            const ownerPage = owned.pages.find((p) => p.id === parsed.pageId);
            const tokenToUse = ownerPage?.access_token || postToken;
            
            let resolved = null;
            let resolveErrorMsg = null;
            
            try {
              resolved = await resolvePostFromGraph(tokenToUse, parsed.pageId, row.postLink, postRes.postId, postRes.kind);
            } catch (err) {
              resolveErrorMsg = err.message;
            }
            
            if (resolved) {
              let verified = null;
              try {
                verified = await verifyPostDetails(tokenToUse, resolved.objectStoryId);
              } catch (err) {
                resolveErrorMsg = `Lỗi gọi API xác thực: ${err.message}`;
              }
              
              if (verified) {
                const isIdMatch = verified.id === resolved.objectStoryId;
                const isPageMatch = verified.from?.id === parsed.pageId;
                const isUrlMatch = isPermalinkMatch(verified.permalink_url, row.postLink, postRes.postId);
                
                if (isIdMatch && isPageMatch && isUrlMatch) {
                  parsed.postId = resolved.postId;
                  parsed.videoId = resolved.videoId;
                  parsed.objectStoryId = resolved.objectStoryId;
                  parsed.sourceObjectId = resolved.sourceObjectId;
                  parsed.permalinkUrl = verified.permalink_url;
                  parsed.verifiedWithGraph = true;
                  
                  console.log(`[VERIFIED POST ID RESOLUTION] SUCCESS
- URL đầu vào: ${row.postLink}
- Page ID: ${parsed.pageId}
- ID parse từ URL: ${postRes.postId}
- Video ID tìm thấy: ${resolved.videoId || 'Không có'}
- Post ID Meta trả về: ${resolved.postId}
- Object Story ID cuối cùng: ${resolved.objectStoryId}
- Kết quả xác minh: Hợp lệ (Đã khớp với Graph API)`);
                  
                  parsed.hasOldCta = !!(verified.call_to_action && verified.call_to_action.type && verified.call_to_action.type !== 'NO_BUTTON');
                } else {
                  let reasons = [];
                  if (!isIdMatch) reasons.push(`ID (${verified.id}) khác với ${resolved.objectStoryId}`);
                  if (!isPageMatch) reasons.push(`Page (${verified.from?.id}) khác với ${parsed.pageId}`);
                  if (!isUrlMatch) reasons.push(`URL (${verified.permalink_url}) không khớp đầu vào`);
                  resolveErrorMsg = `Xác minh thất bại: ${reasons.join(', ')}`;
                }
              }
            }
            
            if (!parsed.verifiedWithGraph) {
              errors.push("Không xác định được Post ID thật từ link này. Tool sẽ không tự ghép Page ID với Video ID.");
              if (status === ROW_STATUS.VALID) status = ROW_STATUS.POST_ERROR;
              
              console.log(`[VERIFIED POST ID RESOLUTION] FAILED
- URL đầu vào: ${row.postLink}
- Page ID: ${parsed.pageId}
- ID parse từ URL: ${postRes.postId || 'Không có'}
- Video ID tìm thấy: Không có
- Post ID Meta trả về: Không có
- Object Story ID cuối cùng: Không có
- Kết quả xác minh: Thất bại (${resolveErrorMsg || 'Không tìm thấy bài viết trùng khớp trên Page'})`);
            } else {
              if (mode === 'EXISTING_POST') {
                const hasCtaInput = (row.ctaLink && row.ctaLink.toString().trim()) || (row.cta && row.cta.toString().trim());
                if (hasCtaInput) {
                  warnings.push('Không thể ghi đè CTA mới khi sử dụng đúng bài viết có sẵn. Tool sẽ giữ nguyên CTA của bài gốc.');
                }
              } else {
                if (!row.ctaLink || !row.ctaLink.toString().trim()) {
                  errors.push('Thiếu link CTA để gắn nút Mua ngay');
                  if (status === ROW_STATUS.VALID) status = ROW_STATUS.MISSING;
                }
              }
            }
          } else {
            errors.push('Thiếu Page ID để thực hiện xác thực bài viết.');
            if (status === ROW_STATUS.VALID) status = ROW_STATUS.POST_ERROR;
          }
        }
      }
    }

    // 2) Kiểm tra Page thuộc tài khoản đang đăng nhập (chạy sau khi đã resolve qua pageLink hoặc postLink)
    if (parsed.pageId) {
      if (!owned.idSet.has(parsed.pageId)) {
        errors.push('Page không thuộc tài khoản Facebook đang đăng nhập (không quản lý Page này).');
        if (status === ROW_STATUS.VALID) status = ROW_STATUS.PERMISSION;
      } else if (!owned.advertiseSet.has(parsed.pageId)) {
        errors.push('Tài khoản không có quyền ADVERTISE trên Page này.');
        if (status === ROW_STATUS.VALID) status = ROW_STATUS.PERMISSION;
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
  const { rows, adAccountId, currency, draftMode, creativeMode } = req.body || {};
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
      const targetAdAccountId = row.adAccountId || adAccountId;
      const campaign = await createCampaign(token, targetAdAccountId, campaignPayload);
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

      const adset = await createAdSet(token, targetAdAccountId, adsetPayload);
      result.ids.adsetId = adset.id;
      // 3) AD CREATIVE
      const hasPost = !!row.parsed?.objectStoryId;
      let creative;
      let creativePayload;

      if (hasPost) {
        // Smart CTA logic:
        // - Lấy trạng thái đã có CTA từ validate route
        // - Nếu chưa được validate hoặc không rõ, tự fetch nhanh để xác định
        let hasOldCta = row.parsed?.hasOldCta;
        if (hasOldCta === undefined) {
          try {
            const ownerPageId = row.parsed.objectStoryId.split('_')[0];
            const pagesData = await getPages(token);
            const ownerPage = pagesData.find((p) => p.id === ownerPageId);
            const postToken = ownerPage?.access_token || token;
            const postInfo = await checkPostExists(postToken, row.parsed.objectStoryId);
            hasOldCta = !!(postInfo && postInfo.call_to_action && postInfo.call_to_action.type && postInfo.call_to_action.type !== 'NO_BUTTON');
          } catch {
            hasOldCta = false;
          }
        }

        const shouldAddCta = !hasOldCta && row.ctaLink && row.ctaLink.toString().trim();

        if (shouldAddCta) {
          // BÀI GỐC CHƯA CÓ CTA -> BẮT BUỘC TẠO DARK POST (OBJECT_STORY_SPEC) ĐỂ GẮN CTA VÀ LIÊN KẾT
          const targetCta = resolveCta(row.cta)?.code || 'SHOP_NOW'; // mặc định SHOP_NOW
          
          // Lấy thông tin media từ bài gốc
          let postInfo;
          try {
            const ownerPageId = row.parsed.objectStoryId.split('_')[0];
            const pagesData = await getPages(token);
            const ownerPage = pagesData.find((p) => p.id === ownerPageId);
            const postToken = ownerPage?.access_token || token;
            postInfo = await checkPostExists(postToken, row.parsed.objectStoryId);
          } catch (fetchErr) {
            console.log("Lấy thông tin bài viết thất bại:", fetchErr.message);
            throw new RowError('Không lấy được thông tin media từ bài viết gốc để tạo dark post: ' + fetchErr.message, ROW_STATUS.POST_ERROR);
          }

          if (!postInfo || (!postInfo.id && !postInfo.object_id)) {
            throw new RowError('Không lấy được thông tin media từ bài viết gốc để tạo dark post', ROW_STATUS.POST_ERROR);
          }

          const isVideo = postInfo.type === 'video' || 
                          postInfo.attachments?.data?.[0]?.type?.includes('video') ||
                          (postInfo.object_id && /^\d+$/.test(postInfo.object_id) && String(postInfo.object_id).length > 5);

          if (isVideo) {
            const videoId = postInfo.object_id || postInfo.attachments?.data?.[0]?.target?.id || postInfo.id;
            if (!videoId) {
              throw new RowError('Không lấy được video ID từ bài viết gốc để tạo dark post', ROW_STATUS.POST_ERROR);
            }
            creativePayload = {
              name: `${row.adName} - creative`,
              object_story_spec: {
                page_id: pageId,
                video_data: {
                  video_id: videoId,
                  message: postInfo.message || '',
                  call_to_action: {
                    type: targetCta,
                    value: {
                      link: row.ctaLink,
                    }
                  }
                }
              }
            };
          } else {
            const pictureUrl = postInfo.attachments?.data?.[0]?.media?.image?.src || undefined;
            creativePayload = {
              name: `${row.adName} - creative`,
              object_story_spec: {
                page_id: pageId,
                link_data: {
                  link: row.ctaLink,
                  message: postInfo.message || '',
                  picture: pictureUrl,
                  call_to_action: {
                    type: targetCta,
                    value: {
                      link: row.ctaLink,
                    }
                  }
                }
              }
            };
          }
          
          try {
            creative = await createAdCreative(token, targetAdAccountId, creativePayload);
          } catch (fallbackErr) {
            throw new RowError('Tạo dark post thất bại: ' + fallbackErr.message, ROW_STATUS.CREATE_ERROR);
          }
        } else {
          // CHẾ ĐỘ A: BÀI GỐC ĐÃ CÓ SẴN NÚT CTA HOẶC KHÔNG CÓ LINK CTA -> GIỮ NGUYÊN BÀI GỐC
          creativePayload = {
            name: `${row.adName} - creative`,
            object_story_id: row.parsed.objectStoryId
          };
          creative = await createAdCreative(token, targetAdAccountId, creativePayload);
        }
      } else {
        // BÀI VIẾT KHÔNG CÓ SẴN (QUẢNG CÁO LINK LÀM MỚI TỪ ĐẦU)
        const useLink = row.ctaLink || !hasPost;
        if (useLink) {
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
          creative = await createAdCreative(token, targetAdAccountId, creativePayload);
        } else {
          throw new RowError('Thiếu cả bài viết lẫn link CTA để tạo nội dung quảng cáo', ROW_STATUS.POST_ERROR);
        }
      }
      result.ids.creativeId = creative.id;

      // 4) AD
      const ad = await createAd(token, targetAdAccountId, {
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
