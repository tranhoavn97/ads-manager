import { resolveCampaignType } from './campaign-mapper.js';

// ============================================================
//  Kiểm tra dữ liệu từng dòng từ file Excel/Sheet
// ============================================================

// Trạng thái dòng (đồng bộ với frontend)
export const ROW_STATUS = {
  VALID: 'valid',            // hợp lệ
  MISSING: 'missing',        // thiếu dữ liệu
  PERMISSION: 'permission',  // lỗi quyền
  POST_ERROR: 'post_error',  // lỗi post
  CREATED: 'created',        // đã tạo thành công
  CREATE_ERROR: 'create_error', // lỗi khi tạo
};

export const ROW_STATUS_LABEL = {
  valid: 'Hợp lệ',
  missing: 'Thiếu dữ liệu',
  permission: 'Lỗi quyền',
  post_error: 'Lỗi post',
  created: 'Đã tạo thành công',
  create_error: 'Lỗi khi tạo',
};

// Bản đồ tên quốc gia tiếng Việt phổ biến -> mã ISO 3166-1 alpha-2
const COUNTRY_MAP = {
  'việt nam': 'VN', 'viet nam': 'VN', vietnam: 'VN', vn: 'VN',
  mỹ: 'US', my: 'US', 'hoa kỳ': 'US', usa: 'US', us: 'US',
  'thái lan': 'TH', 'thai lan': 'TH', thailand: 'TH', th: 'TH',
  singapore: 'SG', sg: 'SG',
  malaysia: 'MY', 'mã lai': 'MY',
  indonesia: 'ID', id: 'ID',
  philippines: 'PH', ph: 'PH',
  'cam pu chia': 'KH', campuchia: 'KH', cambodia: 'KH', kh: 'KH',
  lào: 'LA', lao: 'LA', laos: 'LA', la: 'LA',
  'nhật bản': 'JP', 'nhat ban': 'JP', japan: 'JP', jp: 'JP',
  'hàn quốc': 'KR', 'han quoc': 'KR', korea: 'KR', kr: 'KR',
  'trung quốc': 'CN', 'trung quoc': 'CN', china: 'CN', cn: 'CN',
  'đài loan': 'TW', 'dai loan': 'TW', taiwan: 'TW', tw: 'TW',
  úc: 'AU', australia: 'AU', au: 'AU',
  anh: 'GB', uk: 'GB', gb: 'GB',
  pháp: 'FR', france: 'FR', fr: 'FR',
  đức: 'DE', germany: 'DE', de: 'DE',
  canada: 'CA', ca: 'CA',
  'ấn độ': 'IN', india: 'IN', in: 'IN',
};

export function resolveCountries(input) {
  const raw = (input ?? '').toString().trim();
  if (!raw) return { codes: [], unknown: [] };
  const parts = raw.split(/[,;|/]+/).map((p) => p.trim()).filter(Boolean);
  const codes = [];
  const unknown = [];
  for (const p of parts) {
    const key = p.toLowerCase().normalize('NFC');
    if (/^[A-Za-z]{2}$/.test(p)) {
      codes.push(p.toUpperCase());
    } else if (COUNTRY_MAP[key]) {
      codes.push(COUNTRY_MAP[key]);
    } else {
      unknown.push(p);
    }
  }
  return { codes: [...new Set(codes)], unknown };
}

// "trạng thái" trong sheet -> ACTIVE / PAUSED
export function resolveAdStatus(input, draftMode) {
  if (draftMode) return 'PAUSED';
  const n = (input ?? '').toString().trim().toLowerCase().normalize('NFC');
  const active = ['active', 'bật', 'bat', 'on', 'chạy', 'chay', 'live', '1', 'true'];
  if (active.includes(n)) return 'ACTIVE';
  return 'PAUSED'; // mặc định an toàn: tạm dừng
}

function parseNumber(input) {
  if (input == null) return NaN;
  let s = input.toString().trim();
  if (!s) return NaN;

  // Nếu chứa cả dấu phẩy và dấu chấm (vd: 1,200,000.50 hoặc 1.200.000,50)
  if (s.includes(',') && s.includes('.')) {
    if (s.indexOf(',') < s.indexOf('.')) {
      // Định dạng tiếng Anh: phẩy là phân cách nghìn, chấm là thập phân
      s = s.replace(/,/g, '');
    } else {
      // Định dạng tiếng Việt/Đức: chấm là phân cách nghìn, phẩy là thập phân
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (s.includes(',')) {
    // Chỉ chứa dấu phẩy (vd: 200,000 hoặc 1,5)
    // Nếu dấu phẩy ở vị trí chia hết cho 3 chữ số từ hàng đơn vị (phân cách nghìn)
    // Ví dụ: 200,000 -> 200000. Nhưng 1,5 -> 1.5
    const parts = s.split(',');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  } else if (s.includes('.')) {
    // Chỉ chứa dấu chấm (vd: 200.000 hoặc 1.5)
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/\./g, '');
    }
  }

  // Loại bỏ mọi ký tự không phải số, dấu trừ hoặc dấu chấm thập phân
  s = s.replace(/[^\d.\-]/g, '');
  return parseFloat(s);
}

function parseDate(input, timeInput) {
  if (!input) return null;
  const s = input.toString().trim();
  let dt = null;

  // Hỗ trợ số serial ngày của Excel (ví dụ 46195)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    const baseDate = new Date(Date.UTC(1899, 11, 30));
    dt = new Date(baseDate.getTime() + Math.floor(serial) * 24 * 60 * 60 * 1000);
  } else {
    // dd/mm/yyyy hoặc dd-mm-yyyy
    const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (dmy) {
      const [, d, m, y] = dmy;
      dt = new Date(Date.UTC(+y, +m - 1, +d, 0, 0, 0));
    } else {
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) {
        dt = parsed;
      }
    }
  }

  if (!dt || isNaN(dt.getTime())) return null;

  if (timeInput) {
    const ts = timeInput.toString().trim();
    const timeMatch = ts.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const hrs = parseInt(timeMatch[1], 10);
      const mins = parseInt(timeMatch[2], 10);
      const secs = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      dt.setUTCHours(hrs, mins, secs, 0);
    }
  }

  return dt;
}

function stripAccents(s) {
  return (s ?? '').toString().toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

// "trọn đời" / "hàng ngày" -> 'lifetime' | 'daily' (mặc định daily)
export function resolveBudgetMode(input) {
  const n = stripAccents(input);
  if (!n) return 'daily';
  if (/(tron doi|lifetime|tron|toan bo|tong ngan sach)/.test(n)) return 'lifetime';
  return 'daily';
}

// "chiến dịch" (CBO) / "nhóm" -> 'campaign' | 'adset' (mặc định adset)
export function resolveBudgetLevel(input) {
  const n = stripAccents(input);
  if (!n) return 'adset';
  if (/(chien dich|campaign|cbo)/.test(n)) return 'campaign';
  return 'adset';
}

export function resolveContentMode(input) {
  const n = stripAccents(input);
  if (n.includes('strict') || n.includes('goc') || n.includes('dung dung') || n.includes('co san') || n.includes('existing')) {
    return 'EXISTING_POST_STRICT';
  }
  return 'NEW_CTA_CREATIVE';
}

export function resolveCtaHandling(input) {
  const n = stripAccents(input);
  if (n.includes('hien tai') || n.includes('giu cta') || n.includes('keep')) {
    return 'KEEP_CURRENT';
  }
  if (n.includes('khong') || n.includes('no cta') || n.includes('khong dung')) {
    return 'NO_CTA';
  }
  return 'AUTO';
}

/**
 * Kiểm tra một dòng. KHÔNG gọi API ở đây (phần resolve Page/Post nằm ở route).
 * @param {object} row - dữ liệu đã map theo khoá chuẩn
 * @returns { status, errors[], warnings[], normalized{} }
 */
export function validateRow(row) {
  const errors = [];
  const warnings = [];
  const normalized = {};

  const need = (val, label) => {
    if (val == null || val.toString().trim() === '') {
      errors.push(`Thiếu ${label}`);
      return false;
    }
    return true;
  };

  const mode = resolveContentMode(row.contentMode);
  normalized.contentMode = mode;

  const ctaHand = resolveCtaHandling(row.ctaHandling);
  normalized.ctaHandling = ctaHand;

  need(row.contentMode, 'chế độ nội dung');
  need(row.ctaHandling, 'xử lý CTA');
  need(row.pageLink, 'link Page');
  need(row.postLink, 'link bài viết');

  if (mode === 'NEW_CTA_CREATIVE') {
    need(row.ctaLink, 'link CTA');
  }

  need(row.campaignName, 'tên chiến dịch');
  need(row.adsetName, 'tên nhóm quảng cáo');
  need(row.adName, 'tên quảng cáo');
  need(row.campaignType, 'loại chiến dịch');
  need(row.country, 'quốc gia');
  need(row.budget, 'ngân sách');
  need(row.budgetMode, 'loại ngân sách');
  need(row.startDate, 'ngày bắt đầu');
  need(row.statusRaw, 'trạng thái');

  // Loại chiến dịch
  const ctype = resolveCampaignType(row.campaignType);
  if (row.campaignType && !ctype) {
    errors.push(`Loại chiến dịch "${row.campaignType}" không hợp lệ (chỉ nhận: Tin nhắn, Tương tác, Traffic, Lead, Doanh số)`);
  } else if (ctype) {
    normalized.campaignType = ctype;
    
    // Loại cần website nhưng thiếu link CTA (chỉ check khi ctaHandling = AUTO và không phải chế độ dùng bài gốc)
    const needsLink = ctype.needsLink && mode !== 'EXISTING_POST_STRICT';
    if (needsLink && ctaHand === 'AUTO' && (!row.ctaLink || row.ctaLink.toString().trim() === '')) {
      errors.push(`Loại "${ctype.label}" cần link CTA (website đích) nhưng đang để trống`);
    }
  }

  // Quốc gia
  if (row.country) {
    const { codes, unknown } = resolveCountries(row.country);
    if (codes.length === 0) {
      errors.push(`Không nhận dạng được quốc gia "${row.country}". Dùng tên tiếng Việt hoặc mã ISO (vd: VN, US)`);
    } else {
      normalized.countries = codes;
      if (unknown.length) warnings.push(`Bỏ qua quốc gia không nhận dạng: ${unknown.join(', ')}`);
    }
  }

  // Ngân sách
  if (row.budget) {
    const b = parseNumber(row.budget);
    if (isNaN(b) || b <= 0) {
      errors.push(`Ngân sách "${row.budget}" không hợp lệ`);
    } else {
      normalized.budget = b;
      if (b < 1000) warnings.push('Ngân sách có vẻ thấp — kiểm tra lại đơn vị tiền tệ của tài khoản');
    }
  }

  // Ngày & Giờ bắt đầu/kết thúc
  const start = parseDate(row.startDate, row.startTimeRaw);
  const end = parseDate(row.endDate, row.endTimeRaw);
  
  if (row.startDate && !start) errors.push(`Ngày bắt đầu "${row.startDate}" không đọc được (dùng dd/mm/yyyy)`);
  if (row.endDate && !end) errors.push(`Ngày kết thúc "${row.endDate}" không đọc được (dùng dd/mm/yyyy)`);
  if (start && end && end <= start) errors.push('Ngày kết thúc phải sau ngày bắt đầu');
  if (start) normalized.startTime = start.toISOString();
  if (end) normalized.endTime = end.toISOString();

  // Ngân sách: hàng ngày/trọn đời + cấp chiến dịch (CBO)/nhóm
  const budgetMode = resolveBudgetMode(row.budgetMode);
  const budgetLevel = resolveBudgetLevel(row.budgetLevel);
  normalized.budgetMode = budgetMode;
  normalized.budgetLevel = budgetLevel;
  if (budgetMode === 'lifetime' && !end) {
    errors.push('Ngân sách trọn đời cần có Ngày kết thúc (để Facebook biết tổng thời gian chạy).');
  }

  const status = errors.length ? ROW_STATUS.MISSING : ROW_STATUS.VALID;
  return { status, errors, warnings, normalized };
}
