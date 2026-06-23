// ============================================================
//  Ánh xạ loại chiến dịch (tiếng Việt) -> cấu hình Meta API
//  Dùng bộ objective ODAX mới (OUTCOME_*)
// ============================================================

function normalize(s) {
  return (s ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFC');
}

// Mỗi loại định nghĩa: objective, optimization_goal, billing_event,
// call_to_action mặc định và destination_type (nếu có).
const TYPES = {
  tin_nhan: {
    keys: ['tin nhắn', 'tin nhan', 'messages', 'message', 'nhắn tin', 'messenger'],
    label: 'Tin nhắn',
    objective: 'OUTCOME_ENGAGEMENT',
    optimization_goal: 'CONVERSATIONS',
    billing_event: 'IMPRESSIONS',
    destination_type: 'MESSENGER',
    default_cta: 'MESSAGE_PAGE',
    needsLink: false,
  },
  tuong_tac: {
    keys: ['tương tác', 'tuong tac', 'engagement', 'post engagement'],
    label: 'Tương tác',
    objective: 'OUTCOME_ENGAGEMENT',
    optimization_goal: 'POST_ENGAGEMENT',
    billing_event: 'IMPRESSIONS',
    destination_type: 'ON_POST',
    default_cta: 'LIKE_PAGE',
    needsLink: false,
  },
  traffic: {
    keys: ['traffic', 'lưu lượng', 'luu luong', 'truy cập', 'truy cap'],
    label: 'Traffic',
    objective: 'OUTCOME_TRAFFIC',
    optimization_goal: 'LINK_CLICKS',
    billing_event: 'IMPRESSIONS',
    destination_type: 'WEBSITE',
    default_cta: 'LEARN_MORE',
    needsLink: true,
  },
  lead: {
    keys: ['lead', 'leads', 'khách hàng tiềm năng', 'khach hang tiem nang', 'tiềm năng'],
    label: 'Lead',
    objective: 'OUTCOME_LEADS',
    optimization_goal: 'LEAD_GENERATION',
    billing_event: 'IMPRESSIONS',
    destination_type: 'ON_AD',
    default_cta: 'SIGN_UP',
    needsLink: false,
  },
  doanh_so: {
    keys: ['doanh số', 'doanh so', 'sales', 'conversion', 'chuyển đổi', 'chuyen doi', 'bán hàng', 'ban hang'],
    label: 'Doanh số',
    objective: 'OUTCOME_SALES',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    destination_type: 'WEBSITE',
    default_cta: 'SHOP_NOW',
    needsLink: true,
  },
};

// Danh sách hiển thị cho dropdown frontend
export const CAMPAIGN_TYPE_OPTIONS = Object.entries(TYPES).map(([id, t]) => ({
  id,
  label: t.label,
  objective: t.objective,
}));

// ============================================================
//  Thư viện nút CTA (call-to-action)
//  Cho phép sheet tự điền nút CTA; để trống thì lấy mặc định theo loại.
// ============================================================
export const CTA_LIBRARY = {
  LEARN_MORE:       { label: 'Tìm hiểu thêm',  aliases: ['tim hieu them', 'learn more', 'xem them', 'tim hieu'] },
  SHOP_NOW:         { label: 'Mua ngay',       aliases: ['mua ngay', 'shop now', 'mua hang', 'mua'] },
  ORDER_NOW:        { label: 'Đặt hàng',       aliases: ['dat hang', 'order now', 'dat mua'] },
  SIGN_UP:          { label: 'Đăng ký',        aliases: ['dang ky', 'sign up', 'dki'] },
  SUBSCRIBE:        { label: 'Đăng ký nhận',   aliases: ['dang ky nhan', 'subscribe'] },
  MESSAGE_PAGE:     { label: 'Gửi tin nhắn',   aliases: ['gui tin nhan', 'nhan tin', 'message', 'messenger', 'send message'] },
  LIKE_PAGE:        { label: 'Thích Trang',    aliases: ['thich trang', 'like page', 'like', 'theo doi'] },
  BOOK_TRAVEL:      { label: 'Đặt ngay',       aliases: ['dat ngay', 'book now', 'book travel', 'dat cho'] },
  DOWNLOAD:         { label: 'Tải xuống',      aliases: ['tai xuong', 'download', 'tai ve', 'tai app'] },
  GET_OFFER:        { label: 'Nhận ưu đãi',    aliases: ['nhan uu dai', 'get offer', 'uu dai', 'lay ma'] },
  CONTACT_US:       { label: 'Liên hệ',        aliases: ['lien he', 'contact us', 'contact'] },
  CALL_NOW:         { label: 'Gọi ngay',       aliases: ['goi ngay', 'call now', 'call', 'goi'] },
  APPLY_NOW:        { label: 'Đăng ký ngay',   aliases: ['apply now', 'ung tuyen', 'dang ky ngay', 'nop don'] },
  GET_QUOTE:        { label: 'Nhận báo giá',   aliases: ['nhan bao gia', 'get quote', 'bao gia'] },
  WHATSAPP_MESSAGE: { label: 'Nhắn WhatsApp',  aliases: ['whatsapp', 'nhan whatsapp'] },
  NO_BUTTON:        { label: 'Không có nút',   aliases: ['khong co nut', 'no button', 'none', 'khong'] },
};

function normalizeCta(s) {
  return (s ?? '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Phân giải chuỗi người dùng nhập (mã CTA hoặc nhãn tiếng Việt) -> { code, label }.
 * Trả về null nếu để trống hoặc không nhận dạng được.
 */
export function resolveCta(input) {
  const n = normalizeCta(input);
  if (!n) return null;
  const upper = n.replace(/\s+/g, '_').toUpperCase();
  if (CTA_LIBRARY[upper]) return { code: upper, ...CTA_LIBRARY[upper] };
  for (const [code, def] of Object.entries(CTA_LIBRARY)) {
    if (normalizeCta(def.label) === n) return { code, ...def };
    if (def.aliases.some((a) => normalizeCta(a) === n)) return { code, ...def };
  }
  return null;
}

/** CTA mặc định theo loại chiến dịch (khi sheet để trống). */
export function defaultCtaForType(typeId) {
  const t = TYPES[typeId];
  if (!t) return null;
  const def = CTA_LIBRARY[t.default_cta];
  return def ? { code: t.default_cta, ...def } : { code: t.default_cta, label: t.default_cta, aliases: [] };
}

// Danh sách CTA cho dropdown/template frontend
export const CTA_OPTIONS = Object.entries(CTA_LIBRARY).map(([code, d]) => ({ code, label: d.label }));

/**
 * Tìm cấu hình loại chiến dịch theo chuỗi người dùng nhập.
 * Trả về null nếu không khớp.
 */
export function resolveCampaignType(input) {
  const n = normalize(input);
  if (!n) return null;
  for (const [id, t] of Object.entries(TYPES)) {
    if (id === n) return { id, ...t };
    if (t.keys.some((k) => normalize(k) === n)) return { id, ...t };
  }
  // Khớp lỏng: chứa từ khoá
  for (const [id, t] of Object.entries(TYPES)) {
    if (t.keys.some((k) => n.includes(normalize(k)))) return { id, ...t };
  }
  return null;
}
