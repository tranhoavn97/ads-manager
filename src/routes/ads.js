import express from 'express';
import axios from 'axios';
import { requireAuth } from './auth.js';
import {
  getPages, resolvePageSlug, scrapePageId, checkPostExists,
  createCampaign, createAdSet, createAdCreative, createAd,
  MetaApiError, resolvePostFromGraph, verifyPostDetails, isPermalinkMatch,
  getAdCreative, uploadAdImageFromUrl, getTokenPermissions
} from '../meta-api.js';
import { config } from '../config.js';
import { parsePageId, parsePostId, parsePageSlugFromPostLink, normalizeFbUrl } from '../parsers.js';
import { validateRow, resolveCountries, resolveAdStatus, resolveBudgetMode, resolveBudgetLevel, resolveContentMode, ROW_STATUS } from '../validators.js';
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
  const idMap = new Map(pages.map((p) => [p.id, p]));
  const idSet = new Set(pages.map((p) => p.id));
  const advertiseSet = new Set(
    pages.filter((p) => !Array.isArray(p.tasks) || p.tasks.includes('ADVERTISE')).map((p) => p.id)
  );
  // Map tên vanity (username / slug trong link / tên đã bỏ dấu) -> ID số
  const usernameMap = new Map();
  for (const p of pages) {
    if (p.username) usernameMap.set(p.username.toLowerCase(), p.id);
    // Tách slug từ trường link (vd https://facebook.com/HaiDangReviewtaphoa)
    const m = (p.link || '').match(/facebook\.com\/([^/?#]+)/i);
    if (m && m[1] && !/^profile\.php$/i.test(m[1])) usernameMap.set(m[1].toLowerCase(), p.id);
    // Khớp theo tên Page đã bỏ dấu/khoảng trắng (vd "Hải Đăng Review tạp hóa" -> haidangreviewtaphoa)
    if (p.name && normPageKey(p.name)) usernameMap.set(normPageKey(p.name), p.id);
  }
  return { pages, idMap, idSet, advertiseSet, usernameMap };
}

function normPageKey(s) {
  return (s ?? '').toString().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
}

function setParsedPage(parsed, owned, pageId, pageName = null) {
  if (!pageId) return;
  const id = String(pageId);
  parsed.pageId = id;
  parsed.pageName = pageName || owned.idMap.get(id)?.name || parsed.pageName || null;
}

// Hàm kiểm tra khả năng truy cập của URL CTA
async function checkUrlAccessibility(url) {
  if (!url) return { valid: false, error: 'URL trống' };
  let formattedUrl = url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = 'https://' + formattedUrl;
  }
  try {
    const res = await axios.head(formattedUrl, {
      timeout: 5000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (res.status >= 400) {
      return { valid: false, error: `URL phản hồi mã lỗi HTTP ${res.status}`, code: res.status };
    }
    return { valid: true };
  } catch (err) {
    if (err.response && err.response.status) {
      if (err.response.status < 400) {
        return { valid: true };
      }
      return { valid: false, error: `URL phản hồi mã lỗi HTTP ${err.response.status}`, code: err.response.status };
    }
    return { valid: false, error: `Không thể kết nối đến URL: ${err.message}` };
  }
}

// ---------- BƯỚC KIỂM TRA (PREVIEW) ----------
router.post('/validate', requireAuth, async (req, res) => {
  const { rows, creativeMode } = req.body || {};
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'Dữ liệu rows không hợp lệ' });
  }

  const fbToken = req.session.fbToken;
  let owned;
  try {
    owned = await loadOwnedPages(fbToken);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err instanceof MetaApiError ? err.message : err.message });
  }

  // Kiểm tra quyền từ token
  let missingPermissions = [];
  try {
    const perms = await getTokenPermissions(fbToken);
    const granted = new Set(perms.filter(p => p.status === 'granted').map(p => p.permission));
    const required = config.scopes.split(',').map(s => s.trim()).filter(Boolean);
    missingPermissions = required.filter(p => !granted.has(p));
  } catch (err) {
    console.warn('Lỗi kiểm tra quyền hạn của token:', err.message);
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
      pageName: null,
      postId: null,
      videoId: null,
      objectStoryId: null,
      sourceObjectId: null,
      permalinkUrl: null,
      verifiedWithGraph: false
    };
    let status = base.status;

    // 0) Kiểm tra quyền token
    if (missingPermissions.length > 0) {
      warnings.push(`Token thiếu các quyền đề xuất: ${missingPermissions.join(', ')}. Việc tạo quảng cáo có thể thất bại.`);
    }

    // 0.1) Kiểm tra khả năng truy cập của link CTA
    if (row.ctaLink && row.ctaLink.toString().trim()) {
      const urlCheck = await checkUrlAccessibility(row.ctaLink);
      if (!urlCheck.valid) {
        if (urlCheck.error.includes('HTTP')) {
          warnings.push(`Cảnh báo link CTA: ${urlCheck.error}`);
        } else {
          errors.push(`Lỗi link CTA không tồn tại/không truy cập được: ${urlCheck.error}`);
          if (status === ROW_STATUS.VALID) status = ROW_STATUS.MISSING;
        }
      }
    }

    // 0.2) Nút CTA: cảnh báo nhẹ nếu nhập nhưng không nhận dạng được
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
        const normKey = normPageKey(key);
        if (slugCache.has(key)) {
          const cached = slugCache.get(key);
          setParsedPage(parsed, owned, cached.id, cached.name);
        } else if (owned.usernameMap.has(key) || owned.usernameMap.has(normKey)) {
          const ownedPageId = owned.usernameMap.get(key) || owned.usernameMap.get(normKey);
          const ownedPage = owned.idMap.get(ownedPageId);
          setParsedPage(parsed, owned, ownedPageId, ownedPage?.name);
          slugCache.set(key, { id: ownedPageId, name: ownedPage?.name || null });
        } else {
          let resolvedId = null;
          let resolvedName = null;
          try {
            const r = await resolvePageSlug(req.session.fbToken, pageRes.slug);
            resolvedId = r.id;
            resolvedName = r.name || null;
          } catch {}
          if (!resolvedId) resolvedId = await scrapePageId(pageRes.slug);
          if (resolvedId) {
            setParsedPage(parsed, owned, resolvedId, resolvedName);
            slugCache.set(key, { id: resolvedId, name: resolvedName });
          } else {
            errors.push(`Không lấy được Page ID từ tên "${pageRes.slug}". Có thể để trống ô Page để hệ thống tự nhận diện từ link bài viết, hoặc nhập ID/link Page dạng số.`);
          }
        }
      } else {
        setParsedPage(parsed, owned, pageRes.id);
      }
    }

    // 3) Post / Object ID (nếu có link bài viết)
    if (row.postLink && row.postLink.toString().trim()) {
      const ctype = resolveCampaignType(row.campaignType);
      const isTraffic = ctype && ctype.id === 'traffic';
      const mode = base.normalized?.contentMode || creativeMode || 'NEW_CTA_CREATIVE';
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
          let tokenToUse = postToken;
          let resolved = null;
          let resolveErrorMsg = null;
          
          if (pageId) {
            setParsedPage(parsed, owned, pageId);
          }

          if (!pageId) {
            const pageSlugFromPost = parsePageSlugFromPostLink(row.postLink);
            if (pageSlugFromPost) {
              const key = pageSlugFromPost.toLowerCase();
              const normKey = normPageKey(key);
              if (slugCache.has(key)) {
                const cached = slugCache.get(key);
                setParsedPage(parsed, owned, cached.id, cached.name);
                pageId = parsed.pageId;
              } else if (owned.usernameMap.has(key) || owned.usernameMap.has(normKey)) {
                const ownedPageId = owned.usernameMap.get(key) || owned.usernameMap.get(normKey);
                const ownedPage = owned.idMap.get(ownedPageId);
                setParsedPage(parsed, owned, ownedPageId, ownedPage?.name);
                slugCache.set(key, { id: ownedPageId, name: ownedPage?.name || null });
                pageId = parsed.pageId;
              } else {
                try {
                  const r = await resolvePageSlug(postToken, pageSlugFromPost);
                  if (r?.id) {
                    setParsedPage(parsed, owned, r.id, r.name || null);
                    slugCache.set(key, { id: r.id, name: r.name || null });
                    pageId = parsed.pageId;
                  }
                } catch {}
              }
            }
          }

          if (!pageId && postRes.postId) {
            try {
              const postObj = await verifyPostDetails(postToken, postRes.postId);
              if (postObj && postObj.from?.id) {
                setParsedPage(parsed, owned, postObj.from.id, postObj.from.name);
                pageId = parsed.pageId;
              }
            } catch (e) {}
          }
          
          if (pageId) {
            const ownerPage = owned.pages.find((p) => p.id === parsed.pageId);
            tokenToUse = ownerPage?.access_token || postToken;
            
            try {
              resolved = await resolvePostFromGraph(tokenToUse, parsed.pageId, row.postLink, postRes.postId, postRes.kind);
            } catch (err) {
              resolveErrorMsg = err.message;
            }
          }

          if (!resolved && !pageId && postRes.postId) {
            for (const candidatePage of owned.pages) {
              try {
                const candidateToken = candidatePage.access_token || postToken;
                const found = await resolvePostFromGraph(candidateToken, candidatePage.id, row.postLink, postRes.postId, postRes.kind);
                if (found) {
                  resolved = found;
                  tokenToUse = candidateToken;
                  setParsedPage(parsed, owned, found.fromPageId || candidatePage.id, found.post?.from?.name || candidatePage.name);
                  pageId = parsed.pageId;
                  warnings.push(`Đã tự nhận diện Page "${parsed.pageName || parsed.pageId}" từ link bài viết.`);
                  break;
                }
              } catch (err) {
                resolveErrorMsg = err.message;
              }
            }
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
                
                // Nới lỏng: chỉ cần trùng ID và Page là đủ để xác nhận. Trùng URL là điểm cộng (ghi log/cảnh báo nhẹ nếu không khớp)
                if (isIdMatch && isPageMatch) {
                  if (!isUrlMatch) {
                    warnings.push(`Cảnh báo link bài viết: Đường dẫn trả về từ Facebook (${verified.permalink_url}) không trùng khớp hoàn toàn với link bạn nhập, nhưng ID và Page đã được xác thực.`);
                  }
                  parsed.postId = resolved.postId;
                  parsed.videoId = resolved.videoId;
                  parsed.objectStoryId = resolved.objectStoryId;
                  parsed.sourceObjectId = resolved.sourceObjectId;
                  parsed.permalinkUrl = verified.permalink_url;
                  parsed.verifiedWithGraph = true;
                  if (verified.from?.id || verified.from?.name) {
                    setParsedPage(parsed, owned, verified.from?.id || parsed.pageId, verified.from?.name);
                  }
                  
                  console.log(`[VERIFIED POST ID RESOLUTION] SUCCESS
- URL đầu vào: ${row.postLink}
- Page ID: ${parsed.pageId}
- Page Name: ${parsed.pageName || 'Không có'}
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
                  resolveErrorMsg = `Xác minh thất bại: ${reasons.join(', ')}`;
                }
              }
          }
            
          if (!parsed.verifiedWithGraph) {
            if (!parsed.pageId) {
              errors.push('Không tự nhận diện được Page từ link bài viết này. Hãy dùng link bài viết có chứa Page/ID, hoặc nhập Tên/Link Page để làm gợi ý.');
            } else {
              errors.push("Không xác định được Post ID thật từ link này. Tool sẽ không tự ghép Page ID với Video ID.");
            }
            if (status === ROW_STATUS.VALID) status = ROW_STATUS.POST_ERROR;
            
            console.log(`[VERIFIED POST ID RESOLUTION] FAILED
- URL đầu vào: ${row.postLink}
- Page ID: ${parsed.pageId}
- Page Name: ${parsed.pageName || 'Không có'}
- ID parse từ URL: ${postRes.postId || 'Không có'}
- Video ID tìm thấy: Không có
- Post ID Meta trả về: Không có
- Object Story ID cuối cùng: Không có
- Kết quả xác minh: Thất bại (${resolveErrorMsg || 'Không tìm thấy bài viết trùng khớp trên Page'})`);
          } else {
            if (mode === 'EXISTING_POST_STRICT') {
              if (!parsed.hasOldCta) {
                errors.push('Bài viết chưa có CTA. Chế độ dùng đúng bài viết gốc không thể tự thêm CTA. Hãy tự thêm CTA trong Ads Manager hoặc chọn chế độ Tạo quảng cáo mới.');
                if (status === ROW_STATUS.VALID) status = ROW_STATUS.MISSING;
              } else {
                const hasCtaInput = (row.ctaLink && row.ctaLink.toString().trim()) || (row.cta && row.cta.toString().trim());
                if (hasCtaInput) {
                  warnings.push('Bài viết gốc đã có sẵn CTA. Link CTA và Nút CTA trong Excel sẽ được bỏ qua.');
                }
              }
            } else if (mode === 'NEW_CTA_CREATIVE') {
              if (!row.ctaLink || !row.ctaLink.toString().trim()) {
                errors.push('Thiếu link CTA để tạo quảng cáo mới có CTA (dark post)');
                if (status === ROW_STATUS.VALID) status = ROW_STATUS.MISSING;
              }
              warnings.push('Chế độ tạo quảng cáo mới (dark post) sao chép từ bài viết gốc. Post ID của quảng cáo sẽ khác bài viết gốc.');
            }
          }
        }
      }
    }

    // 2) Kiểm tra Page thuộc tài khoản đang đăng nhập (chạy sau khi đã resolve qua pageLink hoặc postLink)
    if (parsed.pageId) {
      const ownedPage = owned.idMap.get(parsed.pageId);
      if (ownedPage?.name) parsed.pageName = parsed.pageName || ownedPage.name;
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

// ---------- BƯỚC TẠO QUẢNG CÁO ĐƠN LẺ ----------
router.post('/create', requireAuth, async (req, res) => {
  const { row, adAccountId, currency, draftMode } = req.body || {};
  if (!row || !adAccountId) {
    return res.status(400).json({ error: 'Thiếu dữ liệu tạo quảng cáo (row hoặc adAccountId)' });
  }

  const token = req.session.fbToken;
  const result = { index: row.index, status: ROW_STATUS.CREATED, errors: [], ids: {} };

  try {
    const ctype = resolveCampaignType(row.campaignType);
    if (!ctype) throw new RowError('Loại chiến dịch không hợp lệ', ROW_STATUS.CREATE_ERROR);

    const { codes: countries } = resolveCountries(row.country);
    if (!countries.length) throw new RowError('Thiếu quốc gia hợp lệ', ROW_STATUS.CREATE_ERROR);

    const pageId = row.parsed?.pageId;
    if (!pageId) throw new RowError('Thiếu Page ID', ROW_STATUS.CREATE_ERROR);

    const objectStoryId = row.parsed?.objectStoryId;
    if (!objectStoryId) {
      throw new RowError('Không có Post ID thật để tạo quảng cáo bằng bài viết gốc', ROW_STATUS.CREATE_ERROR);
    }

    const targetAdAccountId = row.adAccountId || adAccountId;

    // 0) XÁC MINH BÀI VIẾT VÀ CTA TRƯỚC KHI TẠO CHIẾN DỊCH
    // Lấy token của Page sở hữu bài viết
    const ownerPageId = pageId;
    const pagesData = await getPages(token);
    const ownerPage = pagesData.find((p) => p.id === ownerPageId);
    const pageToken = ownerPage?.access_token || token;

    let postInfo;
    try {
      postInfo = await checkPostExists(pageToken, objectStoryId);
    } catch (postErr) {
      throw new RowError(`Không tìm thấy bài viết gốc hoặc lỗi truy cập: ${postErr.message}`, ROW_STATUS.CREATE_ERROR);
    }

    if (!postInfo) {
      throw new RowError('Không tìm thấy bài viết gốc trên Facebook Page.', ROW_STATUS.CREATE_ERROR);
    }

    const hasCta = !!(postInfo.call_to_action && postInfo.call_to_action.type && postInfo.call_to_action.type !== 'NO_BUTTON');
    const resolvedMode = resolveContentMode(row.contentMode);

    if (resolvedMode === 'EXISTING_POST_STRICT') {
      if (!hasCta) {
        throw new RowError('Bài viết chưa có CTA. Chế độ dùng đúng bài viết gốc không thể tự thêm CTA. Hãy tự thêm CTA trong Ads Manager hoặc chuyển sang NEW_CTA_CREATIVE.', ROW_STATUS.CREATE_ERROR);
      }
    } else if (resolvedMode === 'NEW_CTA_CREATIVE') {
      if (!row.ctaLink || !row.ctaLink.toString().trim()) {
        throw new RowError('Thiếu link CTA để tạo quảng cáo mới có CTA (dark post)', ROW_STATUS.CREATE_ERROR);
      }
    }

    // 1) CAMPAIGN
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
      campaignPayload.is_adset_budget_sharing_enabled = false;
    }
    const campaign = await createCampaign(token, targetAdAccountId, campaignPayload);
    result.ids.campaignId = campaign.id;

    // 2) AD SET
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
    if (ctype.id === 'tin_nhan' || ctype.id === 'lead') {
      adsetPayload.promoted_object = { page_id: pageId };
    }

    const adset = await createAdSet(token, targetAdAccountId, adsetPayload);
    result.ids.adsetId = adset.id;

    // 3) AD CREATIVE
    let creativePayload;
    if (resolvedMode === 'EXISTING_POST_STRICT') {
      creativePayload = {
        name: `${row.adName} - creative`,
        object_story_id: objectStoryId
      };
    } else { // NEW_CTA_CREATIVE
      const message = postInfo.message || '';
      let isVideo = postInfo.type === 'video';
      let videoId = row.parsed?.videoId || postInfo.object_id;

      if (!videoId && postInfo.attachments?.data) {
        for (const att of postInfo.attachments.data) {
          if (att.type === 'video' || att.type === 'video_autoplay' || att.type === 'reel') {
            if (att.target?.id) {
              videoId = att.target.id;
              isVideo = true;
              break;
            }
          }
        }
      }

      if (isVideo && videoId) {
        creativePayload = {
          name: `${row.adName} - creative`,
          object_story_spec: {
            page_id: pageId,
            video_data: {
              video_id: videoId,
              message: message,
              call_to_action: {
                type: 'SHOP_NOW',
                value: {
                  link: row.ctaLink
                }
              }
            }
          }
        };
      } else {
        let imageUrl = postInfo.picture || null;
        if (postInfo.attachments?.data) {
          for (const att of postInfo.attachments.data) {
            if (att.media?.image?.src) {
              imageUrl = att.media.image.src;
              break;
            }
          }
        }

        if (imageUrl) {
          const imageHash = await uploadAdImageFromUrl(token, targetAdAccountId, imageUrl);
          creativePayload = {
            name: `${row.adName} - creative`,
            object_story_spec: {
              page_id: pageId,
              link_data: {
                link: row.ctaLink,
                image_hash: imageHash,
                message: message,
                call_to_action: {
                  type: 'SHOP_NOW',
                  value: {
                    link: row.ctaLink
                  }
                }
              }
            }
          };
        } else {
          creativePayload = {
            name: `${row.adName} - creative`,
            object_story_spec: {
              page_id: pageId,
              link_data: {
                link: row.ctaLink,
                message: message,
                call_to_action: {
                  type: 'SHOP_NOW',
                  value: {
                    link: row.ctaLink
                  }
                }
              }
            }
          };
        }
      }
    }

    let creative;
    try {
      creative = await createAdCreative(token, targetAdAccountId, creativePayload);
      result.ids.creativeId = creative.id;
    } catch (err) {
      throw new RowError('Không thể tạo creative: ' + err.message, ROW_STATUS.CREATE_ERROR);
    }

    // 4) AD
    const ad = await createAd(token, targetAdAccountId, {
      name: row.adName,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: adStatus,
    });
    result.ids.adId = ad.id;

    // 5) KIỂM TRA KẾT QUẢ
    try {
      const creativeInfo = await getAdCreative(token, creative.id);
      
      const effectiveId = creativeInfo.effective_object_story_id || creativeInfo.object_story_id;
      
      if (resolvedMode === 'EXISTING_POST_STRICT') {
        const isIdMatch = effectiveId === objectStoryId || 
                          (effectiveId.includes('_') && objectStoryId.includes('_') && effectiveId.split('_')[1] === objectStoryId.split('_')[1]);
        if (!isIdMatch) {
          throw new Error(`effective_object_story_id (${effectiveId}) không khớp với bài gốc (${objectStoryId})`);
        }
      } else {
        const ctaType = creativeInfo.call_to_action?.type;
        const ctaLink = creativeInfo.call_to_action?.value?.link;
        if (ctaType !== 'SHOP_NOW') {
          throw new Error(`Nút CTA hiển thị (${ctaType}) không khớp với SHOP_NOW`);
        }
        if (row.ctaLink && row.ctaLink.toString().trim() && ctaLink) {
          const normCtaLink = normalizeFbUrl(ctaLink);
          const normRowLink = normalizeFbUrl(row.ctaLink);
          if (normCtaLink !== normRowLink && !ctaLink.includes(row.ctaLink) && !row.ctaLink.includes(ctaLink)) {
            throw new Error(`Link CTA hiển thị (${ctaLink}) không khớp với link yêu cầu (${row.ctaLink})`);
          }
        }
      }
    } catch (verErr) {
      throw new RowError(`Xác thực creative sau khi tạo thất bại: ${verErr.message}`, ROW_STATUS.CREATE_ERROR);
    }

    result.status = ROW_STATUS.CREATED;
  } catch (err) {
    if (err instanceof RowError) {
      result.status = err.rowStatus;
      result.errors.push(err.message);
    } else if (err instanceof MetaApiError) {
      result.status = err.code === 200 || err.code === 10 || err.code === 294
        ? ROW_STATUS.PERMISSION
        : ROW_STATUS.CREATE_ERROR;
      result.errors.push(err.message);
    } else {
      result.status = ROW_STATUS.CREATE_ERROR;
      result.errors.push('Lỗi khi tạo: ' + err.message);
    }
  }

  res.json({ result });
});

class RowError extends Error {
  constructor(message, rowStatus) {
    super(message);
    this.rowStatus = rowStatus;
  }
}

export default router;
