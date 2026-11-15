/** 日期一律為 YYYY-MM-DD 字串，以台北時區為準；空字串代表不設限。 */
export interface DateRange {
  from: string;
  to: string;
}

export interface DateRangePreset {
  label: string;
  /** 包含今天在內的天數 */
  days: number;
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { label: '今天', days: 1 },
  { label: '未來 7 天', days: 7 },
  { label: '未來 30 天', days: 30 },
];

/** 地圖頁預設的天數（今天起 7 天）。 */
export const DEFAULT_RANGE_DAYS = 7;

export function getTaipeiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** 對 YYYY-MM-DD 加減天數；以 UTC 計算，不受執行環境時區與日光節約影響。 */
export function addDays(date: string, days: number): string {
  const time = new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

/** 從 today 起算、共 days 天（含今天）的日期範圍。 */
export function rangeFromToday(today: string, days: number): DateRange {
  return { from: today, to: addDays(today, days - 1) };
}

/** 開始與結束都有值且開始晚於結束時為無效範圍。 */
export function isValidRange({ from, to }: DateRange): boolean {
  return !from || !to || from <= to;
}
