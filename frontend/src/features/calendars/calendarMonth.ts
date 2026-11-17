import { addDays } from '../map/dateRange';

// 月曆格子的日期計算。日期一律為 YYYY-MM-DD（台北時區）字串，以 UTC 計算，不受執行環境時區影響。

export interface YearMonth {
  year: number;
  /** 1–12 */
  month: number;
}

export interface MonthGrid {
  /** 42 天（6 週），從包含當月 1 日那週的週日開始 */
  days: string[];
  from: string;
  to: string;
}

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

const pad = (value: number) => String(value).padStart(2, '0');

export function yearMonthOf(date: string): YearMonth {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthKey({ year, month }: YearMonth): string {
  return `${year}-${pad(month)}`;
}

/** 固定 6 週，切換月份時版面高度不會跳動。 */
export function monthGrid({ year, month }: YearMonth): MonthGrid {
  const first = `${year}-${pad(month)}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const from = addDays(first, -weekday);
  const days = Array.from({ length: 42 }, (_, index) => addDays(from, index));
  return { days, from, to: days[days.length - 1] };
}

export interface DatedEvent {
  startTime: string;
  endTime: string | null;
}

/**
 * 活動涵蓋的台北日期（含頭尾），與後端 shared/eventDays.ts 的判斷一致：
 * 沒有結束時間時只有開始日；結束時間為 00:00 時（全天活動的結束日隔天 00:00、或到午夜結束）
 * 不算進最後一天。
 */
export function eventDays(event: DatedEvent): { first: string; last: string } {
  const first = event.startTime.slice(0, 10);
  if (!event.endTime) return { first, last: first };
  const endDate = event.endTime.slice(0, 10);
  const last = event.endTime.slice(11, 19) === '00:00:00' ? addDays(endDate, -1) : endDate;
  return { first, last: last < first ? first : last };
}

/** 把活動放進月曆的每一天；跨多天的活動在每一天都會出現。 */
export function groupByDay<T extends DatedEvent>(events: T[], days: string[]): Map<string, T[]> {
  const result = new Map<string, T[]>(days.map((day) => [day, []]));
  for (const event of events) {
    const { first, last } = eventDays(event);
    for (const day of days) {
      if (day >= first && day <= last) result.get(day)?.push(event);
    }
  }
  return result;
}

/** 例：2026 年 11 月 */
export function monthTitle({ year, month }: YearMonth): string {
  return `${year} 年 ${month} 月`;
}

/** 例：11 月 17 日（週二） */
export function dayTitle(date: string): string {
  const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日（週${weekday}）`;
}

/**
 * 議程列表上的時間：全天活動顯示「全天」，跨多天的活動顯示起訖日期，其餘只顯示時間。
 * 時間字串本身就是台北時間（+08:00），直接取時分。
 */
export function timeLabel(event: DatedEvent & { allDay: boolean }): string {
  const { first, last } = eventDays(event);
  const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  if (first !== last) {
    const range = `${md(first)} – ${md(last)}`;
    return event.allDay ? range : `${md(first)} ${event.startTime.slice(11, 16)} – ${md(last)}`;
  }
  if (event.allDay) return '全天';
  const start = event.startTime.slice(11, 16);
  if (!event.endTime || event.endTime.slice(11, 19) === '00:00:00') return start;
  return `${start} – ${event.endTime.slice(11, 16)}`;
}
