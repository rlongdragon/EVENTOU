import { classifyEvent } from './events.categories.js';
import { cleanAnnouncement, httpUrl, isNtouUrl, normalizeText } from './events.cleaner.js';
import { isTaipeiTimestamp, parseEventDates } from './events.dates.js';
import { extractField } from './events.fields.js';
import { EVENT_CATEGORIES } from './events.types.js';
import type { ConvertedAnnouncement, ConversionOptions, RawAnnouncement } from './events.types.js';

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
  if (!isNtouUrl(event.originalUrl)) reasons.push('原始公告不屬於海大網域');
  if (/校外公告|轉知|轉發|代轉|協助公告|外校活動/.test(event.title))
    reasons.push('轉載公告需確認活動歸屬');
  if (/(?:^|\n)\s*[【[]?(?:轉知|轉發|代轉|校外公告|外校活動)/.test(event.description))
    reasons.push('轉載公告需確認活動歸屬');
  if (
    event.organizer &&
    /大[學学]/.test(event.organizer) &&
    !/國立[臺台]灣海洋大學|海大|NTOU/i.test(event.organizer)
  )
    reasons.push('主辦單位可能為外校');
  return [...new Set(reasons)];
}

export function convertAnnouncement(
  raw: RawAnnouncement,
  options: ConversionOptions = {},
): ConvertedAnnouncement {
  const cleaned = cleanAnnouncement(raw.rawContent);
  const title = cleanAnnouncement(raw.title ?? '').text.replace(/\s+/g, ' ');
  let dates = parseEventDates(cleaned.text, raw.publishedAt ?? raw.fetchedAt);
  if (dates.reasons[0] === '找不到活動日期')
    dates = parseEventDates(title, raw.publishedAt ?? raw.fetchedAt);
  const originalUrl = httpUrl(raw.url);
  const registration = cleaned.links.find((link) => /報名|註冊|register/i.test(link.text));
  const plainRegistration = cleaned.text.match(
    /(?:報名(?:網址|連結)?)[\s:：]*(https?:\/\/[^\s<>]+)/,
  )?.[1];
  const event: ConvertedAnnouncement = {
    title,
    description: cleaned.text,
    category: classifyEvent(title, cleaned.text, options.defaultCategory),
    tags: [...new Set((options.tags ?? []).map(normalizeText).filter(Boolean))],
    startTime: dates.startTime,
    endTime: dates.endTime,
    allDay: dates.allDay,
    location: extractField(cleaned.text, '活動地點|演講地點|地點|場地'),
    organizer: extractField(cleaned.text, '主辦單位|主辦'),
    registrationUrl: httpUrl(registration?.href ?? plainRegistration ?? null, originalUrl),
    sourceId: raw.sourceId,
    originalUrl,
    status: 'needs_review',
    reviewReasons: dates.reasons,
  };
  event.reviewReasons = validateEvent(event);
  event.status = event.reviewReasons.length ? 'needs_review' : 'published';
  return event;
}
