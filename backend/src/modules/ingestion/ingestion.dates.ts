// 擷取器共用：把各種時間表示轉成台北時間，與 Event 的 +08:00 慣例一致。

const TAIPEI = 'Asia/Taipei';

function partsIn(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
}

const pad = (value: number) => String(value).padStart(2, '0');

/** 某個時間點在台北的日期與時間。 */
export function taipeiDateTime(date: Date): { date: string; time: string } {
  const p = partsIn(date, TAIPEI);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** 解析 RSS／Atom 的時間字串（RFC 822 或 ISO 8601）為台北日期 YYYY-MM-DD，無法解析時回傳 null。 */
export function taipeiDateOf(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const time = Date.parse(value.trim());
  return Number.isNaN(time) ? null : taipeiDateTime(new Date(time)).date;
}

/**
 * 把「某時區的牆上時間」轉成台北日期與時間。zone 為 null 或 Asia/Taipei 時原樣使用，
 * 'UTC' 表示 iCalendar 的 Z 結尾；時區名稱無法辨識時回傳 null。
 */
export function wallTimeToTaipei(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  zone: string | null,
): { date: string; time: string } | null {
  const { year, month, day, hour, minute } = wall;
  if (zone === null || zone === TAIPEI)
    return { date: `${year}-${pad(month)}-${pad(day)}`, time: `${pad(hour)}:${pad(minute)}` };
  try {
    const guess = Date.UTC(year, month - 1, day, hour, minute);
    if (zone === 'UTC') return taipeiDateTime(new Date(guess));
    const seen = partsIn(new Date(guess), zone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    return taipeiDateTime(new Date(guess - (seenAsUtc - guess)));
  } catch {
    return null;
  }
}

/** YYYY-MM-DD 加減天數（純日期運算，不受時區影響）。 */
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
