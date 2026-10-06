import { LeadClassification, PostIntent, ServiceItem, OutreachTemplate } from '@/types';

// ==============================================================================
// KEYWORD DICTIONARIES WITH CONTEXT SENSITIVITY
// ==============================================================================

// Direct studio / photographer ads & provider promotions (NOT customers!)
const PROVIDER_AD_KEYWORDS = [
  'nhận chụp', 'nhận book', 'nhận kèo', 'nhận job', 'nhận lịch',
  'inbox để đặt lịch', 'inbox đặt lịch', 'inbox để book', 'inbox book lịch',
  'bên mình nhận', 'bên em nhận', 'tiệm nhận', 'studio nhận',
  'nhận chụp kỷ yếu', 'nhận chụp áo dài', 'nhận chụp concept', 'nhận chụp nàng thơ',
  'inbox mình báo giá', 'inbox em báo giá', 'inbox để nhận ưu đãi', 'ib để đặt lịch',
  'bảng giá chụp', 'combo chụp trọn gói', 'ưu đãi chụp ảnh', 'nhận làm bộ ảnh',
  'liên hệ book lịch', 'portfolio:', 'link fb:', 'link page:', 'zalo: 0'
];

// Closed / Fulfilled / Cancelled posts
const CLOSED_POST_KEYWORDS = [
  'đã tìm được thợ', 'đã tìm được', 'đã book được', 'đã có thợ',
  'không cần nữa', 'đã chốt thợ', 'đã thuê được', 'đã chọn được',
  'hết nhu cầu', 'xin phép đóng bài', 'đã xong nha', 'đã kiếm được thợ'
];

// Selling / Pass / Equipment keywords (Requires explicit selling intent)
const EXPLICIT_SELLING_PHRASES = [
  'bán máy', 'pass máy', 'thanh lý máy', 'bán lens', 'pass lens', 'thanh lý lens',
  'bán ống kính', 'pass ống kính', 'cần bán', 'muốn bán', 'thanh lý body',
  'giá ra đi', 'giá công khai', 'fullbox nguyên seal', 'máy ảnh cũ',
  'gdtt trực tiếp', 'ship cod', 'tình trạng 99%', 'hết bảo hành', 'inbox lấy giá'
];

// Spam / Scam / Non-photography
const SPAM_KEYWORDS = [
  'vay tiền', 'tuyển dụng việc làm', 'cộng tác viên shopee', 'kiếm tiền online',
  'bán acc', 'tăng like', 'tăng follow', 'chạy quảng cáo fb', 'hoa hồng ngày'
];

// Recruiting models / casting
const RECRUITING_KEYWORDS = [
  'tuyển thợ phụ', 'tuyển mẫu', 'tuyển model', 'cần tuyển mẫu', 'tìm mẫu make',
  'cát xê mẫu', 'cast:', 'tuyển ctv chụp'
];

// Genuine customer looking for service
const CUSTOMER_LOOKING_KEYWORDS = [
  'cần tìm thợ', 'tìm thợ chụp', 'cần chụp', 'muốn chụp', 'kiếm thợ ảnh',
  'tìm studio', 'cần studio', 'tìm photographer', 'ai nhận chụp', 'cần book thợ',
  'muốn làm bộ ảnh', 'cần thợ ngày', 'chụp ngoại cảnh', 'cần thợ có tâm',
  'tìm bạn chụp', 'muốn book lịch', 'cần người chụp', 'thuê thợ chụp'
];

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

  // Tier 1: Spam / Scam Detection
  for (const kw of SPAM_KEYWORDS) {
    if (lower.includes(kw)) {
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
        classification_reason: `Phát hiện nội dung quảng cáo spam/lừa đảo: "${kw}"`,
        suggested_template_id: null,
      };
    }
  }

  // Tier 2: Check if post is Closed / Fulfilled
  for (const kw of CLOSED_POST_KEYWORDS) {
    if (lower.includes(kw)) {
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
        classification_reason: `Bài viết đã tìm được thợ hoặc đóng nhu cầu: "${kw}". Bỏ qua để tránh làm phiền khách.`,
        suggested_template_id: null,
      };
    }
  }

  // Tier 3: Check if post is Studio / Photographer Promotion (Provider Ad)
  // Example: "Maison Studio nhận chụp áo dài ở quận 1, inbox để đặt lịch"
  const isProviderAd = PROVIDER_AD_KEYWORDS.some(kw => lower.includes(kw));
  if (isProviderAd) {
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

  // Tier 4: Explicit Equipment Selling Check (e.g. pass máy, bán lens)
  // Ensure "cần tìm thợ ... dùng lens 85mm" is NOT misclassified as selling!
  const hasExplicitSellingPhrase = EXPLICIT_SELLING_PHRASES.some(phrase => lower.includes(phrase));
  const hasCustomerLookingPhrase = CUSTOMER_LOOKING_KEYWORDS.some(kw => lower.includes(kw));

  if (hasExplicitSellingPhrase && !hasCustomerLookingPhrase) {
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
      classification_reason: 'Bài rao bán / sang nhượng thiết bị, máy ảnh hoặc phụ kiện.',
      suggested_template_id: null,
    };
  }

  // Tier 5: Recruiting models / casting
  if (RECRUITING_KEYWORDS.some(kw => lower.includes(kw)) && !hasCustomerLookingPhrase) {
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

  // Tier 6: Extract Service (ONLY FROM ACTIVE SERVICES)
  const activeServices = services.filter(s => s.is_active);
  let detectedService: ServiceItem | null = null;

  if (lower.includes('áo dài') || lower.includes('ao dai') || lower.includes('cổ phục')) {
    detectedService = activeServices.find(s => s.code === 'AO_DAI') || null;
  } else if (lower.includes('nàng thơ') || lower.includes('vintage') || lower.includes('concept') || lower.includes('indoor') || lower.includes('sinh nhật')) {
    detectedService = activeServices.find(s => s.code === 'NANG_THO') || null;
  } else if (lower.includes('đôi') || lower.includes('couple') || lower.includes('cưới') || lower.includes('pre-wedding') || lower.includes('bạn gái') || lower.includes('người yêu')) {
    detectedService = activeServices.find(s => s.code === 'PRE_WEDDING') || null;
  } else if (lower.includes('kỷ yếu') || lower.includes('nhóm bạn') || lower.includes('tốt nghiệp') || lower.includes('lớp')) {
    detectedService = activeServices.find(s => s.code === 'KY_YEU') || null;
  }

  // Tier 7: Extract Location (HCM Districts)
  let location: string | null = null;
  const districtMatch = lower.match(/(quận\s*[0-9]+|q\s*[0-9]+|bình thạnh|thủ đức|gò vấp|phú nhuận|tân bình|quận 1|quận 3|quận 7)/i);
  if (districtMatch) {
    location = districtMatch[0].toUpperCase() + ', TP. Hồ Chí Minh';
  } else if (lower.includes('sài gòn') || lower.includes('hcm') || lower.includes('tphcm')) {
    location = 'TP. Hồ Chí Minh';
  }

  // Tier 8: Extract Pax (Number of people)
  let pax: number | null = null;
  if (lower.includes('hai người') || lower.includes('2 người') || lower.includes('2 bạn') || lower.includes('hai bạn') || lower.includes('couple')) {
    pax = 2;
  } else if (lower.includes('một mình') || lower.includes('1 mình') || lower.includes('1 người') || lower.includes('cho em') || lower.includes('cá nhân')) {
    pax = 1;
  } else {
    const numMatch = lower.match(/([0-9]+)\s*(người|bạn|thành viên)/);
    if (numMatch) {
      pax = parseInt(numMatch[1], 10);
    }
  }

  // Tier 9: Extract Date with Vietnam Timezone Accuracy
  let dateText: string | null = null;
  let dateSuggested: string | null = null;

  if (lower.includes('chủ nhật này') || lower.includes('cn này')) {
    dateText = 'Chủ nhật tuần này';
    dateSuggested = getNextDayOfWeekInVN(0, postedAt);
  } else if (lower.includes('thứ 7 này') || lower.includes('t7 này')) {
    dateText = 'Thứ bảy tuần này';
    dateSuggested = getNextDayOfWeekInVN(6, postedAt);
  } else if (lower.includes('cuối tuần này')) {
    dateText = 'Cuối tuần này';
    dateSuggested = getNextDayOfWeekInVN(6, postedAt);
  } else if (lower.includes('hôm nay') || lower.includes('tối nay')) {
    dateText = 'Hôm nay';
    dateSuggested = getVietnamDate(postedAt).dateString;
  } else if (lower.includes('ngày mai') || lower.includes('mai')) {
    dateText = 'Ngày mai';
    dateSuggested = calculateSuggestedDateInVN(1, postedAt);
  }

  // Tier 10: Extract Extra Requirements
  const extraRequirements: string[] = [];
  if (lower.includes('tạo dáng') || lower.includes('hướng dẫn dáng') || lower.includes('hỗ trợ tạo dáng') || lower.includes('ngại ống kính') || lower.includes('chỉ dáng') || lower.includes('bị đơ')) {
    extraRequirements.push('Hỗ trợ hướng dẫn tạo dáng tận tình cho khách ít chụp');
  }
  if (lower.includes('makeup') || lower.includes('trang điểm')) {
    extraRequirements.push('Yêu cầu kèm gói makeup/làm tóc');
  }
  if (lower.includes('trang phục') || lower.includes('thuê đồ') || lower.includes('áo dài')) {
    extraRequirements.push('Có chuẩn bị hoặc tư vấn trang phục');
  }
  if (lower.includes('lens') || lower.includes('ống kính') || lower.includes('máy')) {
    const lensMatch = lower.match(/(lens\s*[0-9]+(?:mm)?|85mm|50mm|35mm)/i);
    if (lensMatch) {
      extraRequirements.push(`Yêu cầu thiết bị thợ ảnh: ${lensMatch[0]}`);
    }
  }

  // Tier 11: Match ONLY Approved Templates of the Detected Service!
  // CRITICAL FIX: Do NOT fallback to an unrelated service template (e.g. Áo Dài for Kỷ Yếu)!
  let suggestedTemplate: OutreachTemplate | null = null;
  if (detectedService) {
    const matchingTemplates = templates.filter(t => t.is_approved && t.service_id === detectedService?.id);
    if (matchingTemplates.length > 0) {
      suggestedTemplate = matchingTemplates[0];
    }
  }

  // Compose suggested comment only if service & matching approved template exist
  let suggestedCommentText: string | undefined = undefined;
  if (suggestedTemplate && detectedService) {
    const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(detectedService.base_price);
    suggestedCommentText = suggestedTemplate.template_content
      .replace('{gia}', formattedPrice)
      .replace('{khu_vuc}', location || 'TP. Hồ Chí Minh')
      .replace('{ho_tro_tao_dang}', detectedService.includes_posing_support ? 'có stylist hướng dẫn tạo dáng chi tiết' : '');
  }

  // Tier 12: Intent & Realistic Confidence Score Computation
  const isLooking = hasCustomerLookingPhrase || (detectedService !== null && (location !== null || dateText !== null));
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
    budget_raw: null,
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
    .replace(/(system prompt|ignore previous instructions|bỏ qua hướng dẫn|hãy viết rằng|đăng nội dung này)/gi, '[REDACTED_INPUT]')
    .trim();
}
