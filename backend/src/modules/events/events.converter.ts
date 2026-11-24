import { classifyEvent, classifyTopics } from './events.categories.js';
import { cleanAnnouncement, httpUrl, normalizeText } from './events.cleaner.js';
import { isTaipeiTimestamp, parseEventDates } from './events.dates.js';
import { extractField } from './events.fields.js';
import { EVENT_CATEGORIES } from './events.types.js';
import type {
  ConvertedAnnouncement,
  ConversionOptions,
  LlmExtraction,
  RawAnnouncement,
} from './events.types.js';

export function validateEvent(event: ConvertedAnnouncement): string[] {
  const reasons = [...event.reviewReasons];
  if (!event.title.trim()) reasons.push('缺少標題');
  if (!event.category || !EVENT_CATEGORIES.includes(event.category)) reasons.push('缺少有效類別');
  if (!event.startTime || !isTaipeiTimestamp(event.startTime)) reasons.push('缺少有效開始時間');
  if (
    event.endTime &&
    (!isTaipeiTimestamp(event.endTime) || (event.startTime && event.endTime <= event.startTime))
  )
    reasons.push('無效結束時間');
  if (!Number.isSafeInteger(event.sourceId) || (event.sourceId ?? 0) <= 0)
    reasons.push('缺少有效來源');
  if (!httpUrl(event.originalUrl)) reasons.push('缺少有效原始連結');
  return [...new Set(reasons)];
}

/** LLM 信心低於此值時仍採用它的欄位，但保留待審核讓管理員確認。 */
export const LLM_MIN_CONFIDENCE = 0.6;

/**
 * 以 LLM 整理結果（#69）覆寫規則擷取的欄位。LLM 沒給的欄位保留規則結果；
 * 時間只採用合法的 +08:00 時間，最後仍經過 validateEvent，缺必填欄位一樣待審核。
 */
function applyLlmExtraction(event: ConvertedAnnouncement, llm: LlmExtraction): void {
  event.isEvent = llm.isEvent;
  event.summary = llm.summary;
  event.topics = llm.topics;
  event.audienceDepartments = llm.audienceDepartments;
  event.audienceGrades = llm.audienceGrades;
  // 公告原標題常帶「轉知」、機關全銜等冗字，LLM 整理過的活動名稱比較適合列表；原文仍可從原始連結查看
  if (llm.title) event.title = llm.title;
  event.category = llm.category ?? event.category;
  event.location = llm.location ?? event.location;
  event.organizer = llm.organizer ?? event.organizer;
  if (llm.startTime && isTaipeiTimestamp(llm.startTime)) {
    event.startTime = llm.startTime;
    event.endTime = llm.endTime && isTaipeiTimestamp(llm.endTime) ? llm.endTime : null;
    event.allDay = llm.allDay;
    // 規則找不到日期的理由已由 LLM 補上，不再列入
    event.reviewReasons = [];
  }
  if (!llm.isEvent) event.reviewReasons = [...event.reviewReasons, NOT_EVENT_REASON];
  else if (llm.confidence < LLM_MIN_CONFIDENCE)
    event.reviewReasons = [...event.reviewReasons, '整理結果信心偏低，需人工確認'];
}

export const NOT_EVENT_REASON = '非活動公告';

export function convertAnnouncement(
  raw: RawAnnouncement,
  options: ConversionOptions = {},
): ConvertedAnnouncement {
  const cleaned = cleanAnnouncement(raw.rawContent);
  const title = cleanAnnouncement(raw.title ?? '').text.replace(/\s+/g, ' ');
  let dates = parseEventDates(cleaned.text, raw.publishedAt, raw.fetchedAt);
  if (dates.reasons[0] === '找不到活動日期')
    dates = parseEventDates(title, raw.publishedAt, raw.fetchedAt);
  const originalUrl = httpUrl(raw.url);
  const plainRegistration = cleaned.text.match(
    /(?:報名(?:網址|連結)?)[\s:：]*(https?:\/\/[^\s<>]+)/,
  )?.[1];
  // 指回公告頁本身的錨點（如 href="#"）不算報名連結，改看下一個候選。
  const withoutHash = (url: string) => url.replace(/#.*$/, '');
  const registrationUrl =
    [
      ...cleaned.links
        .filter((link) => /報名|註冊|register/i.test(link.text))
        .map((link) => link.href),
      plainRegistration ?? null,
    ]
      .map((href) => httpUrl(href, originalUrl))
      .find((url) => url && (!originalUrl || withoutHash(url) !== withoutHash(originalUrl))) ??
    null;
  const event: ConvertedAnnouncement = {
    title,
    description: cleaned.text,
    category: classifyEvent(title, cleaned.text, options.defaultCategory),
    topics: classifyTopics(title, cleaned.text),
    summary: null,
    isEvent: true,
    audienceDepartments: [],
    audienceGrades: [],
    tags: [...new Set((options.tags ?? []).map(normalizeText).filter(Boolean))],
    startTime: dates.startTime,
    endTime: dates.endTime,
    allDay: dates.allDay,
    location: extractField(cleaned.text, '活動地點|演講地點|地點|場地'),
    organizer: extractField(cleaned.text, '主辦單位|主辦'),
    registrationUrl,
    sourceId: raw.sourceId,
    originalUrl,
    status: 'needs_review',
    reviewReasons: dates.reasons,
  };
  if (options.llm) applyLlmExtraction(event, options.llm);
  event.reviewReasons = validateEvent(event);
  event.status = event.reviewReasons.length ? 'needs_review' : 'published';
  return event;
}
