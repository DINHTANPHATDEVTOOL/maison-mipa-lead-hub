import { LeadClassification, PostIntent, ServiceItem, OutreachTemplate } from '@/types';

// ==============================================================================
// VIETNAMESE ACCENT NORMALIZATION HELPER
// ==============================================================================

export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

// ==============================================================================
// KEYWORD DICTIONARIES WITH CONTEXT SENSITIVITY (ACCENTED & UNACCENTED)
// ==============================================================================

// Direct studio / photographer ads & provider promotions (NOT customers!)
const PROVIDER_AD_KEYWORDS = [
  'nhận chụp', 'nhận book', 'nhận kèo', 'nhận job', 'nhận lịch',
  'inbox để đặt lịch', 'inbox đặt lịch', 'inbox để book', 'inbox book lịch',
  'bên mình nhận', 'bên em nhận', 'tiệm nhận', 'studio nhận',
  'nhận chụp kỷ yếu', 'nhận chụp áo dài', 'nhận chụp concept', 'nhận chụp nàng thơ',
  'inbox mình báo giá', 'inbox em báo giá', 'inbox để nhận ưu đãi', 'ib để đặt lịch',
  'bảng giá chụp', 'combo chụp trọn gói', 'ưu đãi chụp ảnh', 'nhận làm bộ ảnh',
  'liên hệ book lịch', 'portfolio:', 'link fb:', 'link page:', 'zalo: 0',
  // Unaccented equivalents
  'nhan chup', 'nhan book', 'nhan keo', 'nhan job', 'nhan lich',
  'inbox de dat lich', 'inbox dat lich', 'inbox de book', 'inbox book lich',
  'ben minh nhan', 'ben em nhan', 'tiem nhan', 'studio nhan',
  'bang gia chup', 'combo chup', 'uu dai chup', 'nhan lam bo anh', 'lien he book lich'
];

// Closed / Fulfilled / Cancelled posts
const CLOSED_POST_KEYWORDS = [
  'đã tìm được thợ', 'đã tìm được', 'đã book được', 'đã có thợ',
  'không cần nữa', 'đã chốt thợ', 'đã thuê được', 'đã chọn được',
  'hết nhu cầu', 'xin phép đóng bài', 'đã xong nha', 'đã kiếm được thợ',
  // Unaccented equivalents
  'da tim duoc tho', 'da tim duoc', 'da book duoc', 'da co tho',
  'khong can nua', 'da chot tho', 'da thue duoc', 'da chon duoc',
  'het nhu cau', 'xin phep dong bai', 'da xong nha', 'da kiem duoc tho'
];

// Explicit negative customer phrases ("NOT looking for service")
const NEGATIVE_LOOKING_KEYWORDS = [
  'không tìm thợ', 'không cần thợ', 'chưa cần thợ', 'không thuê thợ',
  'không muốn chụp', 'không phải tìm thợ', 'không thuê chụp', 'không book thợ',
  'chỉ hỏi giá máy ảnh không thuê chụp', 'pass lại máy ảnh chứ không tìm thợ',
  'chỉ hỏi mua lens', 'chỉ mua máy ảnh', 'không có nhu cầu chụp',
  // Unaccented equivalents
  'khong tim tho', 'khong can tho', 'chua can tho', 'khong thue tho',
  'khong muon chup', 'khong phai tim tho', 'khong thue chup', 'khong book tho',
  'chi hoi gia may anh khong thue chup', 'pass lai may anh chu khong tim tho',
  'chi hoi mua lens', 'chi mua may anh', 'khong co nhu cau chup'
];

// Selling / Pass / Equipment keywords (Requires explicit selling intent)
const EXPLICIT_SELLING_PHRASES = [
  'bán máy', 'pass máy', 'thanh lý máy', 'bán lens', 'pass lens', 'thanh lý lens',
  'bán ống kính', 'pass ống kính', 'cần bán', 'muốn bán', 'thanh lý body',
  'giá ra đi', 'giá công khai', 'fullbox nguyên seal', 'máy ảnh cũ',
  'gdtt trực tiếp', 'ship cod', 'tình trạng 99%', 'hết bảo hành', 'inbox lấy giá',
  'pass body', 'bán body', 'thanh lý phụ kiện', 'pass gimbal', 'bán flash',
  // Unaccented equivalents
  'ban may', 'pass may', 'thanh ly may', 'ban lens', 'pass lens', 'thanh ly lens',
  'ban ong kinh', 'pass ong kinh', 'can ban', 'muon ban', 'thanh ly body',
  'gia ra di', 'gia cong khai', 'may anh cu', 'gdtt', 'pass body', 'ban body'
];

// Spam / Scam / Non-photography
const SPAM_KEYWORDS = [
  'vay tiền', 'tuyển dụng việc làm', 'cộng tác viên shopee', 'kiếm tiền online',
  'bán acc', 'tăng like', 'tăng follow', 'chạy quảng cáo fb', 'hoa hồng ngày',
  'vay tien', 'cong tac vien shopee', 'kiem tien online', 'ban acc', 'tang like', 'tang follow'
];

// Recruiting models / casting / hiring
const RECRUITING_KEYWORDS = [
  'tuyển thợ phụ', 'tuyển mẫu', 'tuyển model', 'cần tuyển mẫu', 'tìm mẫu make',
  'cát xê mẫu', 'cast:', 'tuyển ctv chụp', 'tuyển phụ tá', 'cần mẫu ảnh', 'tìm model',
  // Unaccented equivalents
  'tuyen tho phu', 'tuyen mau', 'tuyen model', 'can tuyen mau', 'tim mau make',
  'cat xe mau', 'cast mau', 'tuyen ctv chup', 'tuyen phu ta', 'can mau anh', 'tim model'
];

// Genuine customer looking for service
const CUSTOMER_LOOKING_KEYWORDS = [
  'cần tìm thợ', 'tìm thợ chụp', 'cần chụp', 'muốn chụp', 'kiếm thợ ảnh',
  'tìm studio', 'cần studio', 'tìm photographer', 'ai nhận chụp', 'cần book thợ',
  'muốn làm bộ ảnh', 'cần thợ ngày', 'chụp ngoại cảnh', 'cần thợ có tâm',
  'tìm bạn chụp', 'muốn book lịch', 'cần người chụp', 'thuê thợ chụp',
  'tìm người chụp', 'muốn chụp một bộ', 'cần kiếm thợ', 'tìm ekip chụp',
  // Unaccented equivalents
  'can tim tho', 'tim tho chup', 'can chup', 'muon chup', 'kiem tho anh',
  'tim studio', 'can studio', 'tim photographer', 'ai nhan chup', 'can book tho',
  'muon lam bo anh', 'can tho ngay', 'chup ngoai canh', 'can tho co tam',
  'tim ban chup', 'muon book lich', 'can nguoi chup', 'thue tho chup',
  'tim nguoi chup', 'muon chup mot bo', 'can kiem tho', 'tim ekip chup'
];

// Allowed template placeholders
const ALLOWED_PLACEHOLDERS = ['{gia}', '{khu_vuc}', '{ho_tro_tao_dang}', '{ten_dich_vu}', '{ten_khach}'];

export interface ClassificationResult {
  intent: PostIntent;
  service_detected: string | null;
  location: string | null;
  pax: number | null;
  shooting_date_text: string | null;
  shooting_date_suggested: string | null;
  budget_raw: string | null;
  extra_requirements: string[];
  confidence_score: number;
  classification_reason: string;
  suggested_template_id: string | null;
  suggested_comment_text?: string;
}

/**
 * Vietnam Timezone Helper (+07:00)
 * Prevents UTC date shift bug at 01:30 AM
 */
export function getVietnamDate(inputDate?: Date | string | number): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  dateString: string; // YYYY-MM-DD
} {
  const d = inputDate ? new Date(inputDate) : new Date();
  const vnFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateString = vnFormatter.format(d);
  const [year, month, day] = dateString.split('-').map(Number);

  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
  });
  const weekdayStr = weekdayFormatter.format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = map[weekdayStr] ?? 0;

  return { year, month, day, dayOfWeek, dateString };
}

function calculateSuggestedDateInVN(relativeDays: number, baseDate?: string): string {
  const base = baseDate ? new Date(baseDate) : new Date();
  base.setDate(base.getDate() + relativeDays);
  return getVietnamDate(base).dateString;
}

function getNextDayOfWeekInVN(targetDayOfWeek: number, baseDate?: string): string {
  const vnBase = getVietnamDate(baseDate);
  let daysUntil = (targetDayOfWeek + 7 - vnBase.dayOfWeek) % 7;
  if (daysUntil === 0) daysUntil = 7; // Next week's instance
  return calculateSuggestedDateInVN(daysUntil, baseDate);
}

/**
 * Budget extraction helper
 */
export function extractBudget(text: string): string | null {
  if (!text) return null;
  const budgetRegex = /(?:ngân\s*sách|kinh\s*phí|budget|ngan\s*sach|kinh\s*phi|chi\s*phí|chi\s*phi|tầm\s*giá|tam\s*gia)\s*[:=-]?\s*(?:khoảng|tầm|tầm\s*khoảng|khoang|tam|tam\s*khoang)?\s*([0-9]+(?:\.[0-9]+)?\s*(?:k|tr|triệu|trieu|nghìn|nghin|vnd|đ|d)?[0-9]*(?:\s*-\s*[0-9]+(?:\.[0-9]+)?\s*(?:k|tr|triệu|trieu|nghìn|nghin|vnd|đ|d)?[0-9]*)?|hạt\s*dẻ|hat\s*de|sinh\s*viên|sinh\s*vien|học\s*sinh|hoc\s*sinh)/i;
  const match = text.match(budgetRegex);
  if (match) {
    return match[0].trim();
  }
  const colonRegex = /(?:budget|ngân\s*sách|kinh\s*phí|ngan\s*sach|kinh\s*phi)\s*[:=-]\s*([^\n,.]+)/i;
  const match2 = text.match(colonRegex);
  if (match2) {
    return match2[0].trim();
  }
  return null;
}

/**
 * Main Lead Classification Engine
 */
export function classifyPostContent(
  rawContent: string,
  services: ServiceItem[] = [],
  templates: OutreachTemplate[] = [],
  postedAt?: string
): ClassificationResult {
  const sanitizedText = sanitizePostContent(rawContent);
  const lower = sanitizedText.toLowerCase();
  const unaccented = removeVietnameseTones(lower);

  // Helper matcher: check either accented or unaccented
  const containsAny = (keywords: string[]) => {
    return keywords.some(kw => lower.includes(kw) || unaccented.includes(kw));
  };

  // Tier 1: Spam / Scam Detection
  if (containsAny(SPAM_KEYWORDS)) {
    return {
      intent: 'spam',
      service_detected: null,
      location: null,
      pax: null,
      shooting_date_text: null,
      shooting_date_suggested: null,
      budget_raw: null,
      extra_requirements: [],
      confidence_score: 95,
      classification_reason: 'Phát hiện nội dung quảng cáo spam/lừa đảo/dịch vụ ngoài chụp ảnh.',
      suggested_template_id: null,
    };
  }

  // Tier 2: Check if post is Closed / Fulfilled
  if (containsAny(CLOSED_POST_KEYWORDS)) {
    return {
      intent: 'unclear',
      service_detected: null,
      location: null,
      pax: null,
      shooting_date_text: null,
      shooting_date_suggested: null,
      budget_raw: null,
      extra_requirements: [],
      confidence_score: 90,
      classification_reason: 'Bài viết đã tìm được thợ hoặc đóng nhu cầu. Bỏ qua để tránh làm phiền khách.',
      suggested_template_id: null,
    };
  }

  // Tier 3: Check Explicit Negative Cases ("NOT looking for service")
  const hasNegativeLooking = containsAny(NEGATIVE_LOOKING_KEYWORDS);

  // Tier 4: Check if post is Studio / Photographer Promotion (Provider Ad)
  const isProviderAd = containsAny(PROVIDER_AD_KEYWORDS);
  if (isProviderAd && !containsAny(CUSTOMER_LOOKING_KEYWORDS)) {
    return {
      intent: 'selling',
      service_detected: null,
      location: null,
      pax: null,
      shooting_date_text: null,
      shooting_date_suggested: null,
      budget_raw: null,
      extra_requirements: [],
      confidence_score: 88,
      classification_reason: 'Bài đăng quảng bá dịch vụ chụp ảnh của studio hoặc thợ ảnh khác, không phải khách hàng cần tìm dịch vụ.',
      suggested_template_id: null,
    };
  }

  // Tier 5: Explicit Equipment Selling Check (e.g. pass máy, bán lens)
  const hasExplicitSellingPhrase = containsAny(EXPLICIT_SELLING_PHRASES);
  const hasCustomerLookingPhrase = containsAny(CUSTOMER_LOOKING_KEYWORDS);

  if ((hasExplicitSellingPhrase || hasNegativeLooking) && (!hasCustomerLookingPhrase || hasNegativeLooking)) {
    return {
      intent: 'selling',
      service_detected: null,
      location: null,
      pax: null,
      shooting_date_text: null,
      shooting_date_suggested: null,
      budget_raw: null,
      extra_requirements: [],
      confidence_score: 92,
      classification_reason: hasNegativeLooking 
        ? 'Bài viết nêu rõ phủ định nhu cầu tìm thợ chụp hoặc chỉ hỏi thiết bị/mua bán.'
        : 'Bài rao bán / sang nhượng thiết bị, máy ảnh hoặc phụ kiện.',
      suggested_template_id: null,
    };
  }

  // Tier 6: Recruiting models / casting / staff hiring
  const isRecruitingRegex = /(?:tuyển|tuyen|cần\s*tuyển|can\s*tuyen|tìm|tim)\s*(?:[0-9]+\s*)?(?:mẫu|model|thợ\s*phụ|tho\s*phu|ctv|phụ\s*tá|phu\s*ta|diễn\s*viên|dien\s*vien)/i;
  const isRecruiting = containsAny(RECRUITING_KEYWORDS) || isRecruitingRegex.test(lower) || isRecruitingRegex.test(unaccented);
  if (isRecruiting && !hasCustomerLookingPhrase) {
    return {
      intent: 'recruiting',
      service_detected: null,
      location: null,
      pax: null,
      shooting_date_text: null,
      shooting_date_suggested: null,
      budget_raw: null,
      extra_requirements: [],
      confidence_score: 85,
      classification_reason: 'Bài viết tuyển mẫu hoặc tuyển nhân sự/thợ phụ.',
      suggested_template_id: null,
    };
  }

  // Tier 7: Extract Service (ONLY FROM ACTIVE SERVICES)
  const activeServices = services.filter(s => s.is_active);
  let detectedService: ServiceItem | null = null;

  if (
    lower.includes('áo dài') || unaccented.includes('ao dai') || 
    lower.includes('cổ phục') || unaccented.includes('co phuc')
  ) {
    detectedService = activeServices.find(s => s.code === 'AO_DAI') || null;
  } else if (
    lower.includes('nàng thơ') || unaccented.includes('nang tho') || 
    lower.includes('vintage') || lower.includes('concept') || 
    lower.includes('indoor') || lower.includes('sinh nhật') || unaccented.includes('sinh nhat')
  ) {
    detectedService = activeServices.find(s => s.code === 'NANG_THO') || null;
  } else if (
    lower.includes('đôi') || unaccented.includes('doi') ||
    lower.includes('couple') || lower.includes('cưới') || unaccented.includes('cuoi') ||
    lower.includes('pre-wedding') || lower.includes('bạn gái') || unaccented.includes('ban gai') ||
    lower.includes('người yêu') || unaccented.includes('nguoi yeu')
  ) {
    detectedService = activeServices.find(s => s.code === 'PRE_WEDDING') || null;
  } else if (
    lower.includes('kỷ yếu') || unaccented.includes('ky yeu') ||
    lower.includes('nhóm bạn') || unaccented.includes('nhom ban') ||
    lower.includes('tốt nghiệp') || unaccented.includes('tot nghiep') ||
    lower.includes('lớp') || unaccented.includes('lop')
  ) {
    detectedService = activeServices.find(s => s.code === 'KY_YEU') || null;
  }

  // Tier 8: Extract Location (HCM Districts)
  let location: string | null = null;
  const districtMatch = lower.match(/(quận\s*[0-9]+|q\s*[0-9]+|bình thạnh|thủ đức|gò vấp|phú nhuận|tân bình|quận 1|quận 3|quận 7)/i) ||
                        unaccented.match(/(quan\s*[0-9]+|q\s*[0-9]+|binh thanh|thu duc|go vap|phu nhuan|tan binh|quan 1|quan 3|quan 7)/i);
  if (districtMatch) {
    location = districtMatch[0].toUpperCase() + ', TP. Hồ Chí Minh';
  } else if (
    lower.includes('sài gòn') || unaccented.includes('sai gon') ||
    lower.includes('hcm') || lower.includes('tphcm')
  ) {
    location = 'TP. Hồ Chí Minh';
  }

  // Tier 9: Extract Pax (Number of people)
  let pax: number | null = null;
  if (
    lower.includes('hai người') || unaccented.includes('hai nguoi') ||
    lower.includes('2 người') || unaccented.includes('2 nguoi') ||
    lower.includes('2 bạn') || unaccented.includes('2 ban') ||
    lower.includes('hai bạn') || unaccented.includes('hai ban') ||
    lower.includes('couple')
  ) {
    pax = 2;
  } else if (
    lower.includes('một mình') || unaccented.includes('mot minh') ||
    lower.includes('1 mình') || unaccented.includes('1 minh') ||
    lower.includes('1 người') || unaccented.includes('1 nguoi') ||
    lower.includes('cho em') || unaccented.includes('cho em') ||
    lower.includes('cá nhân') || unaccented.includes('ca nhan')
  ) {
    pax = 1;
  } else {
    const numMatch = lower.match(/([0-9]+)\s*(người|bạn|thành viên)/) ||
                     unaccented.match(/([0-9]+)\s*(nguoi|ban|thanh vien)/);
    if (numMatch) {
      pax = parseInt(numMatch[1], 10);
    }
  }

  // Tier 10: Extract Date with Vietnam Timezone Accuracy
  let dateText: string | null = null;
  let dateSuggested: string | null = null;

  if (
    lower.includes('chủ nhật này') || unaccented.includes('chu nhat nay') ||
    lower.includes('cn này') || unaccented.includes('cn nay')
  ) {
    dateText = 'Chủ nhật tuần này';
    dateSuggested = getNextDayOfWeekInVN(0, postedAt);
  } else if (
    lower.includes('thứ 7 này') || unaccented.includes('thu 7 nay') ||
    lower.includes('t7 này') || unaccented.includes('t7 nay')
  ) {
    dateText = 'Thứ bảy tuần này';
    dateSuggested = getNextDayOfWeekInVN(6, postedAt);
  } else if (
    lower.includes('cuối tuần này') || unaccented.includes('cuoi tuan nay') ||
    lower.includes('cuối tuần') || unaccented.includes('cuoi tuan')
  ) {
    dateText = 'Cuối tuần này';
    dateSuggested = getNextDayOfWeekInVN(6, postedAt);
  } else if (
    lower.includes('hôm nay') || unaccented.includes('hom nay') ||
    lower.includes('tối nay') || unaccented.includes('toi nay')
  ) {
    dateText = 'Hôm nay';
    dateSuggested = getVietnamDate(postedAt).dateString;
  } else if (
    lower.includes('ngày mai') || unaccented.includes('ngay mai') ||
    lower.includes('mai')
  ) {
    dateText = 'Ngày mai';
    dateSuggested = calculateSuggestedDateInVN(1, postedAt);
  }

  // Tier 11: Extract Budget
  const budgetRaw = extractBudget(sanitizedText);

  // Tier 12: Extract Extra Requirements
  const extraRequirements: string[] = [];
  if (
    lower.includes('tạo dáng') || unaccented.includes('tao dang') ||
    lower.includes('hướng dẫn dáng') || unaccented.includes('huong dan dang') ||
    lower.includes('hỗ trợ tạo dáng') || unaccented.includes('ho tro tao dang') ||
    lower.includes('ngại ống kính') || unaccented.includes('ngai ong kinh') ||
    lower.includes('chỉ dáng') || unaccented.includes('chi dang') ||
    lower.includes('bị đơ') || unaccented.includes('bi do')
  ) {
    extraRequirements.push('Hỗ trợ hướng dẫn tạo dáng tận tình cho khách ít chụp');
  }
  if (
    lower.includes('makeup') || lower.includes('trang điểm') || unaccented.includes('trang diem')
  ) {
    extraRequirements.push('Yêu cầu kèm gói makeup/làm tóc');
  }
  if (
    lower.includes('trang phục') || unaccented.includes('trang phuc') ||
    lower.includes('thuê đồ') || unaccented.includes('thue do') ||
    lower.includes('áo dài') || unaccented.includes('ao dai')
  ) {
    extraRequirements.push('Có chuẩn bị hoặc tư vấn trang phục');
  }
  if (lower.includes('lens') || lower.includes('ống kính') || unaccented.includes('ong kinh')) {
    const lensMatch = lower.match(/(lens\s*[0-9]+(?:mm)?|85mm|50mm|35mm)/i);
    if (lensMatch) {
      extraRequirements.push(`Yêu cầu thiết bị thợ ảnh: ${lensMatch[0]}`);
    }
  }

  // Tier 13: Match ONLY Approved Templates of the Active Detected Service!
  let suggestedTemplate: OutreachTemplate | null = null;
  if (detectedService && detectedService.is_active) {
    const matchingTemplates = templates.filter(t => t.is_approved && t.service_id === detectedService?.id);
    if (matchingTemplates.length > 0) {
      suggestedTemplate = matchingTemplates[0];
    }
  }

  // Compose suggested comment ONLY if service is active & matching approved template exists
  let suggestedCommentText: string | undefined = undefined;
  if (suggestedTemplate && detectedService && detectedService.is_active) {
    const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(detectedService.base_price);
    suggestedCommentText = suggestedTemplate.template_content
      .replace('{gia}', formattedPrice)
      .replace('{khu_vuc}', location || 'TP. Hồ Chí Minh')
      .replace('{ho_tro_tao_dang}', detectedService.includes_posing_support ? 'có stylist hướng dẫn tạo dáng chi tiết' : '')
      .replace('{ten_dich_vu}', detectedService.name)
      .replace('{ten_khach}', 'bạn');
  }

  // Tier 14: Intent & Realistic Confidence Score
  const isLooking = !hasNegativeLooking && (hasCustomerLookingPhrase || (detectedService !== null && (location !== null || dateText !== null)));
  const intent: PostIntent = isLooking ? 'looking_for_service' : 'unclear';

  let confidence = 50;
  if (hasCustomerLookingPhrase) confidence += 25;
  if (detectedService) confidence += 20;
  if (location) confidence += 10;
  if (dateText) confidence += 5;
  if (pax) confidence += 5;
  if (confidence > 94) confidence = 94; // Cap realistic rule score

  let reason = '';
  if (intent === 'looking_for_service') {
    reason = `Xác định nhu cầu khách hàng: ${detectedService?.name || 'Chụp ảnh'}. Địa điểm: ${location || 'Chưa rõ'}, Thời gian: ${dateText || 'Chưa rõ'}, Yêu cầu: ${extraRequirements.join(', ') || 'Cơ bản'}.`;
    if (!suggestedTemplate && detectedService) {
      reason += ' [LƯU Ý]: Chưa có mẫu bình luận được duyệt cho dịch vụ này, cần CSKH/Marketing duyệt tay.';
    }
  } else {
    reason = 'Bài viết có thông tin nhưng chưa đủ rõ ràng để tự động bình luận, cần nhân viên Marketing kiểm duyệt.';
  }

  return {
    intent,
    service_detected: detectedService?.name || null,
    location,
    pax,
    shooting_date_text: dateText,
    shooting_date_suggested: dateSuggested,
    budget_raw: budgetRaw,
    extra_requirements: extraRequirements,
    confidence_score: confidence,
    classification_reason: reason,
    suggested_template_id: suggestedTemplate?.id || null,
    suggested_comment_text: suggestedCommentText,
  };
}

export function sanitizePostContent(text: string): string {
  if (!text) return '';
  return text
    .replace(/(system\s*prompt|ignore\s*previous\s*instructions|ignore\s*all\s*instructions|bỏ\s*qua\s*hướng\s*dẫn|bo\s*qua\s*huong\s*dan|hãy\s*viết\s*rằng|hay\s*viet\s*rang|đăng\s*nội\s*dung\s*này|dang\s*noi\s*dung\s*nay|set\s*price\s*to|admin:\s*dispatch)/gi, '[REDACTED_INPUT]')
    .trim();
}
