import express from 'express';
import { requireAuth } from './auth.js';
import {
  getPages,
  graphGet,
  checkPostExists,
  createCampaign,
  createAdSet,
  createAdCreative,
  createAd,
  MetaApiError,
} from '../meta-api.js';
import { resolveAdStatus, resolveBudgetLevel, resolveBudgetMode, resolveCountries } from '../validators.js';

const router = express.Router();
const ZERO_DECIMAL = new Set(['VND', 'JPY', 'KRW', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'VUV', 'XAF', 'XOF', 'PYG']);
const THRUPLAY_VIDEO_ERROR = 'Bài này không phù hợp chạy ThruPlay. Meta không xác nhận đây là bài video/reel có thể dùng làm Existing Post; hãy chọn video/reel gốc trên Page.';

function budgetToMinor(amount, currency) {
  const factor = ZERO_DECIMAL.has(String(currency || '').toUpperCase()) ? 1 : 100;
  return Math.round(Number(amount) * factor);
}

function cleanName(value, fallback) {
  const s = String(value || '').trim();
  return s || fallback;
}

function postName(value, fallback) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  return (s || fallback).slice(0, 50);
}

function metaDetails(err) {
  return err instanceof MetaApiError
    ? { metaErrorCode: err.code ?? null, metaErrorSubcode: err.subcode ?? null, fbtraceId: err.fbtrace ?? null }
    : {};
}

function isVideoAttachment(att) {
  if (!att) return false;
  const type = String(att.type || '').toLowerCase();
  if (type.includes('video') || type.includes('reel')) return true;
  return (att.subattachments?.data || []).some(isVideoAttachment);
}

function findVideoIdFromAttachments(attachments = []) {
  for (const att of attachments) {
    const type = String(att.type || '').toLowerCase();
    if (type.includes('video') || type.includes('reel')) {
      return att.target?.id || att.media?.id || null;
    }
    const nested = findVideoIdFromAttachments(att.subattachments?.data || []);
    if (nested) return nested;
  }
  return null;
}

function isVideoPost(post) {
  const type = String(post.type || post.status_type || '').toLowerCase();
  return type.includes('video')
    || type.includes('reel')
    || !!post.object_id
    || (post.attachments?.data || []).some(isVideoAttachment);
}

function postThumbnail(post) {
  const att = post.attachments?.data?.[0];
  return post.full_picture || att?.media?.image?.src || att?.media?.source || post.picture || '';
}

function shapePost(pageId, post, fallbackType = 'Video') {
  const videoId = post.object_id || post.video_id || findVideoIdFromAttachments(post.attachments?.data || []);
  const objectStoryId = String(post.id || '').includes('_') ? post.id : `${pageId}_${post.id}`;
  const rawType = String(post.type || post.status_type || fallbackType || '').toLowerCase();
  const type = rawType.includes('reel') ? 'Reel' : 'Video';
  return {
    id: post.id,
    object_story_id: objectStoryId,
    message: post.message || post.story || post.description || post.title || '',
    permalink_url: post.permalink_url || post.permalink || '',
    created_time: post.created_time || '',
    type,
    video_id: videoId || null,
    thumbnail: postThumbnail(post),
  };
}

function pageToken(pages, pageId, userToken) {
  return pages.find((p) => String(p.id) === String(pageId))?.access_token || userToken;
}

function assertPageAccess(pages, pageId) {
  const page = pages.find((p) => String(p.id) === String(pageId));
  if (!page) throw new Error('Page không thuộc tài khoản đang đăng nhập.');
  if (Array.isArray(page.tasks) && !page.tasks.includes('ADVERTISE')) {
    const err = new Error('Tài khoản không có quyền ADVERTISE trên Page này.');
    err.status = 403;
    throw err;
  }
  return page;
}

function parseDateTime(date, time, endOfDay = false) {
  if (!date) return null;
  const raw = String(date).trim();
  let dt = null;
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) {
    dt = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1], 0, 0, 0));
  } else {
    dt = new Date(raw);
  }
  if (!dt || Number.isNaN(dt.getTime())) return null;
  const tm = String(time || '').trim();
  const m = tm.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) dt.setUTCHours(+m[1], +m[2], +(m[3] || 0), 0);
  else if (endOfDay) dt.setUTCHours(23, 59, 0, 0);
  return dt;
}

async function fetchPageVideoPosts(token, pageId) {
  const postFields = 'id,message,story,created_time,permalink_url,status_type,type,object_id,full_picture,attachments{media,type,target,url,subattachments{media,type,target,url}}';
  const videoFields = 'id,title,description,created_time,permalink_url,permalink,picture,post_id,from{id,name}';
  const out = new Map();

  const addEdge = async (edge, fields, fallbackType) => {
    try {
      const res = await graphGet(token, `${pageId}/${edge}`, { fields, limit: 100 });
      for (const item of (res.data || [])) {
        if (edge === 'videos' || edge === 'video_reels') {
          if (!item.post_id) continue;
          const id = item.post_id;
          out.set(id, shapePost(pageId, { ...item, id, video_id: item.id }, edge === 'video_reels' ? 'Reel' : 'Video'));
        } else if (isVideoPost(item)) {
          const shaped = shapePost(pageId, item, fallbackType);
          out.set(shaped.object_story_id, shaped);
        }
      }
    } catch (err) {
      console.warn(`Bỏ qua edge ${edge}: ${err.message}`);
    }
  };

  await Promise.all([
    addEdge('posts', postFields, 'Video'),
    addEdge('feed', postFields, 'Video'),
    addEdge('videos', videoFields, 'Video'),
    addEdge('video_reels', videoFields, 'Reel'),
  ]);

  return Array.from(out.values()).sort((a, b) => String(b.created_time).localeCompare(String(a.created_time)));
}

async function getPostForThruplay(token, objectStoryId) {
  try {
    return await graphGet(token, objectStoryId, {
      fields: 'id,from{id,name},message,story,object_id,type,status_type,permalink_url,attachments{media,type,target,url,subattachments{media,type,target,url}}',
    });
  } catch {
    return checkPostExists(token, objectStoryId);
  }
}

async function getVideoForThruplay(token, videoId) {
  if (!videoId) return null;
  try {
    return await graphGet(token, videoId, {
      fields: 'id,post_id,from{id,name},title,description,permalink_url,permalink,source,created_time,picture',
    });
  } catch {
    return null;
  }
}

function normalizeObjectStoryId(pageId, id) {
  if (!id) return '';
  const s = String(id);
  return s.includes('_') ? s : `${pageId}_${s}`;
}

function isSelectedVideoCandidate(post) {
  const type = String(post?.type || '').toLowerCase();
  return !!(post?.videoId || post?.video_id || type.includes('video') || type.includes('reel'));
}

async function resolveThruplayExistingPost(token, pageId, post) {
  const inputObjectStoryId = post.objectStoryId || post.object_story_id;
  const objectStoryId = normalizeObjectStoryId(pageId, inputObjectStoryId || post.postId || post.id);
  const videoId = post.videoId || post.video_id || null;
  let detail = null;

  if (objectStoryId) {
    try {
      detail = await getPostForThruplay(token, objectStoryId);
      if (isVideoPost(detail)) return { objectStoryId, detail, video: null };
    } catch {
      detail = null;
    }
  }

  const video = await getVideoForThruplay(token, videoId || detail?.object_id);
  if (video?.post_id) {
    const resolvedObjectStoryId = normalizeObjectStoryId(pageId, video.post_id);
    let resolvedDetail = null;
    try {
      resolvedDetail = await getPostForThruplay(token, resolvedObjectStoryId);
    } catch {}
    return { objectStoryId: resolvedObjectStoryId, detail: resolvedDetail, video };
  }

  if (video?.id && String(video.id) === String(videoId)) {
    return { objectStoryId, detail, video };
  }

  if (objectStoryId && isSelectedVideoCandidate(post)) {
    return { objectStoryId, detail, video: null, assumed: true };
  }

  throw new Error(THRUPLAY_VIDEO_ERROR);
}

router.get('/pages', requireAuth, async (req, res) => {
  try {
    const pages = await getPages(req.session.fbToken);
    res.json({
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        picture: p.picture?.data?.url || '',
        tasks: p.tasks || [],
        canAdvertise: Array.isArray(p.tasks) ? p.tasks.includes('ADVERTISE') : true,
      })),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, ...metaDetails(err) });
  }
});

router.get('/pages/:pageId/posts', requireAuth, async (req, res) => {
  try {
    const pages = await getPages(req.session.fbToken);
    const page = assertPageAccess(pages, req.params.pageId);
    const posts = await fetchPageVideoPosts(page.access_token || req.session.fbToken, page.id);
    res.json({ posts });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, ...metaDetails(err) });
  }
});

router.post('/validate', requireAuth, async (req, res) => {
  const { pageId, posts = [] } = req.body || {};
  try {
    const pages = await getPages(req.session.fbToken);
    const page = assertPageAccess(pages, pageId);
    const token = page.access_token || req.session.fbToken;
    const results = [];
    for (const post of posts) {
      const objectStoryId = post.objectStoryId || post.object_story_id;
      const row = { objectStoryId, valid: false, errors: [], post };
      try {
        const resolved = await resolveThruplayExistingPost(token, page.id, post);
        row.objectStoryId = resolved.objectStoryId;
        row.valid = true;
      } catch (err) {
        row.errors.push(err.message || 'Không kiểm tra được bài viết.');
      }
      results.push(row);
    }
    res.json({ results });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, ...metaDetails(err) });
  }
});

router.post('/create', requireAuth, async (req, res) => {
  const body = req.body || {};
  const results = [];
  try {
    const pages = await getPages(req.session.fbToken);
    const page = assertPageAccess(pages, body.pageId);
    const pageAccessToken = pageToken(pages, body.pageId, req.session.fbToken);
    const accountId = body.adAccountId;
    if (!accountId) throw new Error('Thiếu tài khoản quảng cáo.');
    if (!Array.isArray(body.posts) || body.posts.length === 0) throw new Error('Chưa chọn bài video/reel.');

    const { codes: countries } = resolveCountries(body.country || 'VN');
    if (!countries.length) throw new Error('Quốc gia không hợp lệ.');
    const budget = budgetToMinor(body.budget, body.currency);
    if (!Number.isFinite(budget) || budget <= 0) throw new Error('Ngân sách không hợp lệ.');

    const budgetMode = resolveBudgetMode(body.budgetMode);
    const budgetLevel = resolveBudgetLevel(body.budgetLevel);
    const budgetField = budgetMode === 'lifetime' ? 'lifetime_budget' : 'daily_budget';
    const start = parseDateTime(body.startDate, body.startTime, false);
    const end = parseDateTime(body.endDate, body.endTime, true);
    if (!start) throw new Error('Ngày bắt đầu không hợp lệ.');
    if (budgetMode === 'lifetime' && !end) throw new Error('Ngân sách trọn đời cần ngày kết thúc.');
    if (start && end && end <= start) throw new Error('Ngày kết thúc phải sau ngày bắt đầu.');

    const adStatus = resolveAdStatus(body.status, false);

    for (const post of body.posts) {
      let objectStoryId = post.objectStoryId || post.object_story_id;
      const label = (post.message || post.permalinkUrl || objectStoryId || '').slice(0, 60);
      const autoPostName = postName(post.adsetName || post.adName || post.message || post.permalinkUrl || objectStoryId, objectStoryId);
      const campaignName = cleanName(body.pageName || body.campaignName, `ThruPlay - ${label || objectStoryId}`);
      const adsetName = autoPostName;
      const adName = autoPostName;
      const result = { objectStoryId, status: 'created', errors: [], ids: {} };
      try {
        const resolvedPost = await resolveThruplayExistingPost(pageAccessToken, page.id, post);
        objectStoryId = resolvedPost.objectStoryId;
        result.objectStoryId = objectStoryId;

        const campaign = await createCampaign(req.session.fbToken, accountId, {
          name: campaignName,
          objective: 'OUTCOME_ENGAGEMENT',
          status: 'PAUSED',
          special_ad_categories: [],
          ...(budgetLevel === 'campaign' ? { [budgetField]: budget, bid_strategy: 'LOWEST_COST_WITHOUT_CAP' } : { is_adset_budget_sharing_enabled: false }),
        });
        result.ids.campaignId = campaign.id;

        const adset = await createAdSet(req.session.fbToken, accountId, {
          name: adsetName,
          campaign_id: campaign.id,
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'THRUPLAY',
          status: adStatus,
          promoted_object: { page_id: page.id },
          targeting: { geo_locations: { countries }, age_min: 18, age_max: 65 },
          ...(budgetLevel === 'adset' ? { [budgetField]: budget, bid_strategy: 'LOWEST_COST_WITHOUT_CAP' } : {}),
          ...(start ? { start_time: start.toISOString() } : {}),
          ...(end ? { end_time: end.toISOString() } : {}),
        });
        result.ids.adsetId = adset.id;

        const creative = await createAdCreative(req.session.fbToken, accountId, {
          name: `ThruPlay Creative - ${label || objectStoryId}`,
          object_story_id: objectStoryId,
        });
        result.ids.creativeId = creative.id;

        const ad = await createAd(req.session.fbToken, accountId, {
          name: adName,
          adset_id: adset.id,
          creative: { creative_id: creative.id },
          status: adStatus,
        });
        result.ids.adId = ad.id;
      } catch (err) {
        result.status = 'failed';
        result.errors.push(err.message || 'Không tạo được quảng cáo ThruPlay.');
        Object.assign(result, metaDetails(err));
      }
      results.push(result);
    }
    res.json({ results });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, ...metaDetails(err), results });
  }
});

export default router;
