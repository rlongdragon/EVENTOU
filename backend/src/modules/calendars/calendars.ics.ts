// iCalendar（RFC 5545）產生器：只負責把活動資料轉成 .ics 文字，不碰資料庫。
// US-09 的個人行事曆可沿用 buildCalendar。

/** 產生 VEVENT 所需的活動欄位；時間為 Event 的 Asia/Taipei ISO 8601 字串。 */
export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  registrationUrl: string | null;
  originalUrl: string;
  createdAt: string;
  updatedAt: string;
}

const CRLF = '\r\n';
const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

/** UID 只由活動 id 決定；upsert 會保留 id，所以活動更新後行事曆軟體仍視為同一筆。 */
export function eventUid(eventId: number): string {
  return `event-${eventId}@eventou`;
}

/** TEXT 值跳脫（RFC 5545 3.3.11）：反斜線、分號、逗號與換行；其餘控制字元移除。 */
function escapeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\\;,]/g, '\\$&')
    .replace(/\n/g, '\\n')
    .replace(/\p{Cc}/gu, '');
}

/** 每行不超過 75 個位元組（RFC 5545 3.1），續行以一個空白開頭；不切斷多位元組字元。 */
function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > MAX_LINE_OCTETS) {
      parts.push(current);
      current = ' ';
      octets = 1;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(CRLF);
}

/** 轉成 UTC 的 DATE-TIME（20261007T060000Z），不需要另外輸出 VTIMEZONE。 */
function utcDateTime(isoTime: string): string {
  return new Date(isoTime).toISOString().slice(0, 19).replace(/[-:]/g, '').concat('Z');
}

/** 取 Asia/Taipei 當地日期作為 DATE（20261007）；Event 時間字串本身就是台北時間。 */
function localDate(isoTime: string): string {
  return isoTime.slice(0, 10).replace(/-/g, '');
}

function eventTimeLines({ startTime, endTime, allDay }: CalendarEvent): string[] {
  if (allDay) {
    const start = localDate(startTime);
    const lines = [`DTSTART;VALUE=DATE:${start}`];
    // Event 的全天結束時間已是排他的隔天 00:00，與 DTEND 的定義相同
    const end = endTime ? localDate(endTime) : null;
    if (end && end > start) lines.push(`DTEND;VALUE=DATE:${end}`);
    return lines;
  }
  const lines = [`DTSTART:${utcDateTime(startTime)}`];
  if (endTime && new Date(endTime) > new Date(startTime)) {
    lines.push(`DTEND:${utcDateTime(endTime)}`);
  }
  return lines;
}

/** Google Calendar 不顯示 URL 屬性，所以連結也寫進說明。 */
function eventDescription(event: CalendarEvent): string {
  return [
    event.description,
    event.registrationUrl ? `報名連結：${event.registrationUrl}` : '',
    `原始公告：${event.originalUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function eventLines(event: CalendarEvent): string[] {
  const updatedAt = utcDateTime(event.updatedAt);
  return [
    'BEGIN:VEVENT',
    `UID:${eventUid(event.id)}`,
    // DTSTAMP 用活動最後更新時間，內容沒變時輸出也不變，方便行事曆軟體與快取判斷
    `DTSTAMP:${updatedAt}`,
    `CREATED:${utcDateTime(event.createdAt)}`,
    `LAST-MODIFIED:${updatedAt}`,
    ...eventTimeLines(event),
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(eventDescription(event))}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    `URL:${event.originalUrl}`,
    'END:VEVENT',
  ];
}

/** 產生完整的 VCALENDAR；events 為空時仍是合法的空行事曆。 */
export function buildCalendar(name: string, events: CalendarEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EVENTOU//Calendar//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:Asia/Taipei',
    // 建議行事曆軟體每小時重新同步一次
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events.flatMap(eventLines),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
