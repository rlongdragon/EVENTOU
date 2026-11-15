const TIME_ZONE = 'Asia/Taipei';
const format = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

// SQLite datetime('now') 的格式：2026-11-13 14:20:09（UTC，不帶時區）
const SQLITE_UTC = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/**
 * 把資料庫的 UTC 時間字串轉成台灣時間顯示，例如 2026-11-13 22:20:09。
 * 格式不符時原樣回傳，避免畫面出現 Invalid Date。
 */
export function formatSourceTime(value: string): string {
  const match = SQLITE_UTC.exec(value);
  if (!match) return value;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(date.getTime())) return value;
  return format.format(date);
}
