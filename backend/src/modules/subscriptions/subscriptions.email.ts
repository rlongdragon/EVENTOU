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

const TIME_ZONE = 'Asia/Taipei';
const dateFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});
const timeFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 例：2026年10月7日 週三 14:00 – 16:00；全天活動只顯示日期（與前端活動頁的顯示方式一致）。 */
export function formatEventTime({
  startTime,
  endTime,
  allDay,
}: Pick<NotificationEvent, 'startTime' | 'endTime' | 'allDay'>): string {
  const start = new Date(startTime);
  // 全天活動的 endTime 是結束日隔天 00:00，顯示時往前推到結束日
  const end = endTime ? new Date(new Date(endTime).getTime() - (allDay ? 1 : 0)) : null;
  const startDate = dateFormat.format(start);
  const endDate = end ? dateFormat.format(end) : startDate;
  if (allDay) return endDate === startDate ? startDate : `${startDate} – ${endDate}`;
  const startText = `${startDate} ${timeFormat.format(start)}`;
  if (!end) return startText;
  const endText = endDate === startDate ? '' : `${endDate} `;
  return `${startText} – ${endText}${timeFormat.format(end)}`;
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
 * 用來組出活動頁與管理訂閱（取消訂閱）的連結。
 */
export function buildNewEventEmail(
  recipient: { email: string; displayName: string },
  event: NotificationEvent,
  baseUrl: string,
): EmailMessage {
  const eventUrl = `${baseUrl}/events/${event.id}`;
  const subscriptionsUrl = `${baseUrl}/subscriptions`;
  const time = formatEventTime(event);
  const location = event.location ?? '未提供';
  const unsubscribe = `你會收到這封信，是因為你訂閱了「${event.categoryLabel}」類別。不想再收到通知時，請到訂閱頁取消訂閱`;

  const text = [
    `${recipient.displayName} 你好，`,
    '',
    `你訂閱的「${event.categoryLabel}」類別有新活動：`,
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
    `<p>你訂閱的「${escapeHtml(event.categoryLabel)}」類別有新活動：</p>`,
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
