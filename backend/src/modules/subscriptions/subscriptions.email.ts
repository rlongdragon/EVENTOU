// US-08 新活動通知信的內容：只負責把活動資料轉成信件文字，不寄信也不碰資料庫。

/** 一封要寄出的信。 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** 通知信需要的活動欄位；時間為 Event 的 Asia/Taipei ISO 8601 字串。 */
export interface NotificationEvent {
  id: number;
  title: string;
  categoryLabel: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  originalUrl: string;
}

/** 收到通知的原因：追蹤了活動的類別、內容領域，或活動的來源。 */
export type NotificationReason =
  | { kind: 'category' }
  | { kind: 'topic'; topicLabel: string }
  | { kind: 'source'; sourceName: string };

const TIME_ZONE = 'Asia/Taipei';
const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
// 只用 Intl 取出台北時間的數字，文字自己組：Intl 直接輸出的字串會隨 Node 內建的 ICU 版本不同
// （例如日期與星期之間有沒有空格），信件內容不應該跟著變。
const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** 把時間轉成台北時間的日期（例：2026年10月7日 週三）與時間（例：14:00）。 */
function taipeiDateTime(value: Date): { date: string; time: string } {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of partsFormat.formatToParts(value)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0 } = parts;
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${year}年${month}月${day}日 ${weekday}`,
    time: `${pad(hour)}:${pad(minute)}`,
  };
}

/** 例：2026年10月7日 週三 14:00 – 16:00；全天活動只顯示日期（與前端活動頁的顯示方式一致）。 */
export function formatEventTime({
  startTime,
  endTime,
  allDay,
}: Pick<NotificationEvent, 'startTime' | 'endTime' | 'allDay'>): string {
  const start = taipeiDateTime(new Date(startTime));
  // 全天活動的 endTime 是結束日隔天 00:00，顯示時往前推到結束日
  const end = endTime
    ? taipeiDateTime(new Date(new Date(endTime).getTime() - (allDay ? 1 : 0)))
    : null;
  if (allDay) return !end || end.date === start.date ? start.date : `${start.date} – ${end.date}`;
  const startText = `${start.date} ${start.time}`;
  if (!end) return startText;
  const endText = end.date === start.date ? '' : `${end.date} `;
  return `${startText} – ${endText}${end.time}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 產生新活動通知信。baseUrl 為網站對外的位址（不含結尾斜線），
 * 用來組出活動頁與行事曆頁（取消追蹤、關閉通知）的連結。
 */
export function buildNewEventEmail(
  recipient: { email: string; displayName: string },
  event: NotificationEvent,
  baseUrl: string,
  reason: NotificationReason = { kind: 'category' },
): EmailMessage {
  const eventUrl = `${baseUrl}/events/${event.id}`;
  const subscriptionsUrl = `${baseUrl}/calendars`;
  const time = formatEventTime(event);
  const location = event.location ?? '未提供';
  const followed =
    reason.kind === 'source'
      ? `來源「${reason.sourceName}」`
      : reason.kind === 'topic'
        ? `「${reason.topicLabel}」領域`
        : `「${event.categoryLabel}」類別`;
  const unsubscribe = `你會收到這封信，是因為你追蹤了${followed}。不想再收到通知時，請到行事曆頁取消追蹤或關閉 Email 通知`;

  const text = [
    `${recipient.displayName} 你好，`,
    '',
    `你追蹤的${followed}有新活動：`,
    '',
    `活動：${event.title}`,
    `時間：${time}`,
    `地點：${location}`,
    `活動連結：${eventUrl}`,
    `原始公告：${event.originalUrl}`,
    '',
    `${unsubscribe}：${subscriptionsUrl}`,
  ].join('\n');

  const html = [
    `<p>${escapeHtml(recipient.displayName)} 你好，</p>`,
    `<p>你追蹤的${escapeHtml(followed)}有新活動：</p>`,
    `<h2><a href="${escapeHtml(eventUrl)}">${escapeHtml(event.title)}</a></h2>`,
    '<ul>',
    `<li>時間：${escapeHtml(time)}</li>`,
    `<li>地點：${escapeHtml(location)}</li>`,
    `<li>活動連結：<a href="${escapeHtml(eventUrl)}">${escapeHtml(eventUrl)}</a></li>`,
    `<li>原始公告：<a href="${escapeHtml(event.originalUrl)}">${escapeHtml(event.originalUrl)}</a></li>`,
    '</ul>',
    `<p style="color:#57606a;font-size:0.875em">${escapeHtml(unsubscribe)}：<a href="${escapeHtml(subscriptionsUrl)}">${escapeHtml(subscriptionsUrl)}</a></p>`,
  ].join('\n');

  return {
    to: recipient.email,
    subject: `【EVENTOU】${event.categoryLabel}新活動：${event.title}`,
    text,
    html,
  };
}
