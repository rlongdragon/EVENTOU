import type { EventDetail } from './api';

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

/** 例：2026年10月7日 週三 14:00 – 16:00；全天活動只顯示日期。活動頁與搜尋列表共用。 */
export function formatEventTime({
  startTime,
  endTime,
  allDay,
}: Pick<EventDetail, 'startTime' | 'endTime' | 'allDay'>): string {
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
