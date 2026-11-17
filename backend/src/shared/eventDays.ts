// 活動涵蓋的台北日期（SQL 片段），供地圖與行事曆的日期範圍查詢共用。
// 時間皆存成 YYYY-MM-DDTHH:mm:ss+08:00（見 docs/event-schema.md），前 10 碼即台北日期。
// 片段使用未加前綴的 start_time／end_time，查詢中這兩個欄位名稱必須沒有歧義。

/** 活動第一天（台北日期）。 */
export const EVENT_FIRST_DAY_SQL = 'substr(start_time, 1, 10)';

/**
 * 活動最後一天（台北日期）：
 * - 沒有 end_time：與開始日期相同
 * - end_time 為 00:00（全天活動的 end_time 是結束日隔天 00:00，或一般活動到午夜結束）：前一天
 * - 其餘：end_time 的日期
 * 最後一天不會早於開始日期，避免資料異常時把活動排除在外。
 */
export const EVENT_LAST_DAY_SQL = `max(${EVENT_FIRST_DAY_SQL}, CASE
    WHEN end_time IS NULL THEN ${EVENT_FIRST_DAY_SQL}
    WHEN substr(end_time, 12, 8) = '00:00:00' THEN date(substr(end_time, 1, 10), '-1 day')
    ELSE substr(end_time, 1, 10)
  END)`;

/** 是否為實際存在的日曆日期（YYYY-MM-DD）。 */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
