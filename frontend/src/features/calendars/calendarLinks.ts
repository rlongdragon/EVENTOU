import { addDays } from '../map/dateRange';

// 把活動或行事曆加到外部行事曆服務的連結。全部是純函式，網站位址由呼叫端傳入。

/** 相對路徑轉成完整網址；行事曆軟體要的是絕對網址。 */
export function absoluteUrl(path: string, origin: string): string {
  return new URL(path, origin).href;
}

/** webcal:// 會讓作業系統直接用預設的行事曆軟體（Apple 行事曆、Outlook 桌面版）訂閱。 */
export function webcalUrl(url: string): string {
  return url.replace(/^https?:/, 'webcal:');
}

/** 在 Google 日曆「以網址新增行事曆」；Google 會定期重新抓取，之後的變動會自動同步。 */
export function googleSubscribeUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(feedUrl))}`;
}

/** 在 Outlook.com／Microsoft 365 網頁版訂閱行事曆。 */
export function outlookSubscribeUrl(feedUrl: string, name: string): string {
  const query = new URLSearchParams({ url: feedUrl, name });
  return `https://outlook.live.com/calendar/0/addfromweb?${query}`;
}

/**
 * 外部服務（Google、Outlook.com）連不到的網站位址：本機、區域網路與 .local 網域。
 * 這些位址只有同一台電腦或同一個網路裡的軟體連得到，無法讓線上服務自動同步。
 */
export function isPrivateOrigin(origin: string): boolean {
  const host = new URL(origin).hostname.replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

export interface LinkableEvent {
  title: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
}

/** 20261117T060000Z */
function utcStamp(isoTime: string): string {
  return new Date(isoTime).toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
}

const compactDate = (date: string) => date.replace(/-/g, '');

/** Google 日曆的 dates 參數；全天活動用日期且結束日為排他的隔天，沒有結束時間時一般活動預設一小時。 */
export function googleDates(event: Omit<LinkableEvent, 'title' | 'location'>): string {
  if (event.allDay) {
    const start = event.startTime.slice(0, 10);
    const end = event.endTime ? event.endTime.slice(0, 10) : '';
    return `${compactDate(start)}/${compactDate(end > start ? end : addDays(start, 1))}`;
  }
  const start = new Date(event.startTime).getTime();
  const end = event.endTime ? new Date(event.endTime).getTime() : NaN;
  const endIso = new Date(end > start ? end : start + 3600000).toISOString();
  return `${utcStamp(event.startTime)}/${utcStamp(endIso)}`;
}

/** 開啟 Google 日曆的「新增活動」畫面並預先填好內容；只是範本，不需要網站有公開網址。 */
export function googleEventUrl(event: LinkableEvent, eventPageUrl: string): string {
  const query = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: googleDates(event),
    details: `EVENTOU 活動頁：${eventPageUrl}`,
    ctz: 'Asia/Taipei',
  });
  if (event.location) query.set('location', event.location);
  return `https://calendar.google.com/calendar/render?${query}`;
}

/** 單一活動 .ics 的路徑（不含網站位址），可下載後匯入任何行事曆軟體。 */
export function eventIcsPath(eventId: number): string {
  return `/api/calendars/events/${eventId}.ics`;
}
