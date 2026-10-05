import { LeadClassification, PostIntent, ServiceItem, OutreachTemplate } from '@/types';

// Regular expressions and keywords for Tier 1: Fast Rule Filtering
const SELLING_KEYWORDS = [
  'bán máy', 'pass lại', 'thanh lý', 'cần bán', 'lens', 'ống kính', 
  'body máy', 'sony a7', 'canon eos', 'nikon z', 'fujifilm', 'máy ảnh cũ',
  'gdtt', 'fullbox', 'nguyên seal', 'giá ra đi', 'inbox lấy giá'
];

const RECRUITING_KEYWORDS = [
  'tuyển thợ', 'tuyển mẫu', 'tuyển photographer', 'tuyển ctv', 
  'cần tuyển', 'tuyển model', 'cát xê', 'cast:', 'tìm mẫu makeup', 'cần thợ phụ'
];

const SPAM_KEYWORDS = [
  'vay tiền', 'tuyển dụng việc làm', 'cộng tác viên shopee', 'kiếm tiền online',
  'bán acc', 'tăng like', 'tăng follow', 'chạy quảng cáo fb'
];

const LOOKING_FOR_KEYWORDS = [
  'cần tìm thợ', 'tìm thợ chụp', 'cần chụp', 'muốn chụp', 'kiếm thợ ảnh',
  'tìm studio', 'cần studio', 'tìm photographer', 'ai nhận chụp', 'cần book thợ',
  'muốn làm bộ ảnh', 'cần thợ ngày', 'chụp ngoại cảnh', 'chụp áo dài', 'chụp nàng thơ'
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

export function classifyPostContent(
  rawContent: string, 
  services: ServiceItem[], 
  templates: OutreachTemplate[]
): ClassificationResult {
  // Sanitize and defend against prompt injections
  const sanitizedText = sanitizePostContent(rawContent);
  const lower = sanitizedText.toLowerCase();

  // Tier 1: Fast Rule Filtering
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
        confidence_score: 99,
        classification_reason: `Quy tắc phát hiện từ khóa spam/lừa đảo: "${kw}"`,
        suggested_template_id: null,
      };
    }
  }

  for (const kw of SELLING_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        intent: 'selling',
        service_detected: null,
        location: null,
        pax: null,
        shooting_date_text: null,
        shooting_date_suggested: null,
        budget_raw: null,
        extra_requirements: [],
        confidence_score: 98,
        classification_reason: `Quy tắc phát hiện bài rao bán thiết bị/máy ảnh: "${kw}"`,
        suggested_template_id: null,
      };
    }
  }

  for (const kw of RECRUITING_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        intent: 'recruiting',
        service_detected: null,
        location: null,
        pax: null,
        shooting_date_text: null,
        shooting_date_suggested: null,
        budget_raw: null,
        extra_requirements: [],
        confidence_score: 95,
        classification_reason: `Quy tắc phát hiện bài tuyển dụng/tìm mẫu: "${kw}"`,
        suggested_template_id: null,
      };
    }
  }

  // Tier 2: Entity & Intent Extraction (Looking for service)
  const isLooking = LOOKING_FOR_KEYWORDS.some(kw => lower.includes(kw));

  // Extract Service
  let detectedService: ServiceItem | null = null;
  if (lower.includes('áo dài') || lower.includes('ao dai') || lower.includes('cổ phục')) {
    detectedService = services.find(s => s.code === 'AO_DAI') || null;
  } else if (lower.includes('nàng thơ') || lower.includes('vintage') || lower.includes('indoor') || lower.includes('sinh nhật') || lower.includes('concept')) {
    detectedService = services.find(s => s.code === 'NANG_THO') || null;
  } else if (lower.includes('đôi') || lower.includes('couple') || lower.includes('cưới') || lower.includes('pre-wedding') || lower.includes('bạn gái') || lower.includes('người yêu')) {
    detectedService = services.find(s => s.code === 'PRE_WEDDING') || null;
  } else if (lower.includes('kỷ yếu') || lower.includes('nhóm') || lower.includes('tốt nghiệp') || lower.includes('lớp')) {
    detectedService = services.find(s => s.code === 'KY_YEU') || null;
  }

  // Extract Location (HCM Districts)
  let location: string | null = null;
  const districtMatch = lower.match(/(quận\s*[0-9]+|q\s*[0-9]+|bình thạnh|thủ đức|gò vấp|phú nhuận|tân bình|quận 1|quận 3|quận 7)/i);
  if (districtMatch) {
    location = districtMatch[0].toUpperCase() + ', TP. Hồ Chí Minh';
  } else if (lower.includes('sài gòn') || lower.includes('hcm') || lower.includes('tphcm')) {
    location = 'TP. Hồ Chí Minh';
  }

  // Extract Pax (number of people)
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

  // Extract Date
  let dateText: string | null = null;
  let dateSuggested: string | null = null;
  if (lower.includes('chủ nhật này') || lower.includes('cn này')) {
    dateText = 'Chủ nhật tuần này';
    dateSuggested = getNextDayOfWeek(0); // Sunday
  } else if (lower.includes('thứ 7 này') || lower.includes('t7 này')) {
    dateText = 'Thứ bảy tuần này';
    dateSuggested = getNextDayOfWeek(6); // Saturday
  } else if (lower.includes('cuối tuần này')) {
    dateText = 'Cuối tuần này';
    dateSuggested = getNextDayOfWeek(6);
  } else if (lower.includes('hôm nay') || lower.includes('tối nay')) {
    dateText = 'Hôm nay';
    dateSuggested = new Date().toISOString().split('T')[0];
  } else if (lower.includes('ngày mai')) {
    dateText = 'Ngày mai';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateSuggested = tomorrow.toISOString().split('T')[0];
  }

  // Extract Extra Requirements (e.g. "Hỗ trợ tạo dáng", "Makeup", "Trang phục")
  const extraRequirements: string[] = [];
  if (lower.includes('tạo dáng') || lower.includes('hướng dẫn dáng') || lower.includes('hỗ trợ tạo dáng') || lower.includes('ngại ống kính')) {
    extraRequirements.push('Cần hỗ trợ hướng dẫn tạo dáng chi tiết');
  }
  if (lower.includes('makeup') || lower.includes('trang điểm')) {
    extraRequirements.push('Yêu cầu kèm gói makeup/làm tóc');
  }
  if (lower.includes('trang phục') || lower.includes('thuê đồ') || lower.includes('áo dài')) {
    extraRequirements.push('Có chuẩn bị hoặc tư vấn trang phục');
  }

  // Find Best Matching Template
  let suggestedTemplate: OutreachTemplate | null = null;
  if (detectedService) {
    suggestedTemplate = templates.find(t => t.service_id === detectedService?.id) || templates[0] || null;
  } else {
    suggestedTemplate = templates[0] || null;
  }

  // Compose suggested comment with strict guardrails (never fabricate custom pricing or promises)
  let suggestedCommentText: string | undefined = undefined;
  if (suggestedTemplate && detectedService) {
    const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(detectedService.base_price);
    suggestedCommentText = suggestedTemplate.template_content
      .replace('{gia}', formattedPrice)
      .replace('{khu_vuc}', location || 'TP. Hồ Chí Minh')
      .replace('{ho_tro_tao_dang}', detectedService.includes_posing_support ? 'có stylist hướng dẫn tạo dáng chi tiết' : '');
  }

  const intent: PostIntent = (isLooking || detectedService !== null) ? 'looking_for_service' : 'unclear';
  const confidence = (detectedService && location && isLooking) ? 97 : (isLooking ? 82 : 55);

  const reason = intent === 'looking_for_service'
    ? `Xác định nhu cầu khách hàng: Dịch vụ ${detectedService?.name || 'Chụp ảnh'}, Địa điểm: ${location || 'Chưa rõ'}, Số người: ${pax || 'Chưa rõ'}, Yêu cầu: ${extraRequirements.join(', ') || 'Cơ bản'}.`
    : 'Bài viết có thông tin nhưng chưa rõ ràng hoặc ngôn từ mơ hồ, cần nhân viên Marketing kiểm duyệt.';

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

// Security: Strip potential prompt injection vectors
export function sanitizePostContent(text: string): string {
  if (!text) return '';
  return text
    .replace(/(system prompt|ignore previous instructions|bỏ qua hướng dẫn|hãy viết rằng|đăng nội dung này)/gi, '[REDACTED_INPUT]')
    .trim();
}

function getNextDayOfWeek(dayOfWeek: number): string {
  const resultDate = new Date();
  resultDate.setDate(resultDate.getDate() + (dayOfWeek + 7 - resultDate.getDay()) % 7);
  return resultDate.toISOString().split('T')[0];
}
