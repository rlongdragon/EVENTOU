import { normalizeText } from './events.cleaner.js';

interface Day {
  year: number;
  month: number;
  day: number;
}
interface DateResult {
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  reasons: string[];
}
const datePattern =
  /(?<![\d/.])(?<!\d:)(?:民國\s*)?(?:(\d{3,4}(?=\s*[/.-])|\d{1,4}(?=\s*年))\s*(?:年|[/.-])\s*)?(\d{1,2})\s*(?:月|[/.-])\s*(\d{1,2})\s*日?(?![\d:])/g;
const timePattern =
  /(?<![\d/:])(?:(上午|下午|中午|晚上|凌晨|AM|PM)\s*)?(\d{1,2})(?:\s*:\s*(\d{2})|\s*[時點](?:(\d{1,2})分?|(半))?)\s*(AM|PM)?(?![\d:])/gi;
const rangePattern = /^\s*(?:[-–—~～]|[~～]?\s*[至到])\s*$/;
const pad = (value: number) => String(value).padStart(2, '0');
const DAY_MS = 86400000;
function validDay(value: Day): boolean {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  return (
    value.year >= 1912 &&
    date.getUTCFullYear() === value.year &&
    date.getUTCMonth() + 1 === value.month &&
    date.getUTCDate() === value.day
  );
}
function timestamp(day: Day, hour = 0, minute = 0): string {
  return `${day.year}-${pad(day.month)}-${pad(day.day)}T${pad(hour)}:${pad(minute)}:00+08:00`;
}
export function taipeiNow(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error('無效的儲存時間');
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 19) + '+08:00';
}
export function isTaipeiTimestamp(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+08:00$/);
  return (
    !!match &&
    validDay({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }) &&
    Number(match[4]) < 24 &&
    Number(match[5]) < 60 &&
    Number(match[6]) < 60
  );
}
/** 未寫年份時取落在公告日前 90 天至後 275 天的年份，避免年底公告的一月活動落到過去。 */
function inferYear(month: number, day: number, reference: Day): number {
  const base = Date.UTC(reference.year, reference.month - 1, reference.day);
  return (
    [reference.year, reference.year + 1, reference.year - 1].find((year) => {
      const offset = (Date.UTC(year, month - 1, day) - base) / DAY_MS;
      return offset >= -90 && offset < 276;
    }) ?? reference.year
  );
}
function parseCandidate(text: string, reference: Day | null): DateResult {
  const fail = (reason: string): DateResult => ({
    startTime: null,
    endTime: null,
    allDay: false,
    reasons: [reason],
  });
  const cleaned = text.replace(/[（(]\s*(?:星期|週|周)?[一二三四五六日天]\s*[)）]/g, (match) =>
    ' '.repeat(match.length),
  );
  const matches = [...cleaned.matchAll(datePattern)];
  if (!matches.length || matches.length > 2) return fail('活動日期缺漏或包含多個活動');
  const days: Day[] = [];
  for (const match of matches) {
    const explicit = match[1];
    const month = Number(match[2]);
    let candidateYear: number;
    if (explicit) candidateYear = Number(explicit) + (explicit.length <= 3 ? 1911 : 0);
    else if (days[0]) candidateYear = days[0].year + (month < days[0].month ? 1 : 0);
    else if (reference) candidateYear = inferYear(month, Number(match[3]), reference);
    else return fail('缺少可判斷年份的公告時間');
    const day = { year: candidateYear, month, day: Number(match[3]) };
    if (!validDay(day)) return fail('無效的活動日期');
    if (reference && Math.abs(day.year - reference.year) > 1)
      return fail('活動年份與公告時間差距過大');
    days.push(day);
  }
  const times = [...cleaned.matchAll(timePattern)];
  if (times.length > 2) return fail('包含多組活動時間');
  if (matches.length === 2) {
    const between = cleaned
      .slice(matches[0].index + matches[0][0].length, matches[1].index)
      .replace(timePattern, '');
    if (!rangePattern.test(between)) return fail('多個日期未形成明確區間');
  }
  if (
    times.length === 2 &&
    !rangePattern.test(
      cleaned.slice(times[0].index + times[0][0].length, times[1].index).replace(datePattern, ''),
    )
  )
    return fail('多個時間未形成明確區間');
  const clocks: { hour: number; minute: number }[] = [];
  let inherited = '';
  for (const match of times) {
    const meridiem = (match[1] ?? match[6] ?? inherited).toUpperCase();
    let hour = Number(match[2]);
    const minute = Number(match[3] ?? match[4] ?? (match[5] ? 30 : 0));
    if (hour > 23 || minute > 59 || (['上午', '凌晨', 'AM'].includes(meridiem) && hour > 12))
      return fail('無效的活動時間');
    if (meridiem === '晚上' && hour === 12) return fail('午夜時間需人工確認');
    if (['下午', '晚上', '中午', 'PM'].includes(meridiem) && hour < 12) hour += 12;
    if (['上午', '凌晨', 'AM'].includes(meridiem) && hour === 12) hour = 0;
    clocks.push({ hour, minute });
    inherited = meridiem;
  }
  const remainder = cleaned
    .slice(matches[0].index + matches[0][0].length)
    .replace(datePattern, '')
    .replace(timePattern, '');
  if (!times.length && /上午|下午|中午|晚上|凌晨|\d\s*[:時點]/.test(remainder))
    return fail('活動時間無法解析');
  if (
    times.length === 1 &&
    /^\s*[-–—~～至到]/.test(cleaned.slice(times[0].index + times[0][0].length))
  )
    return fail('缺少區間結束時間');
  if (!times.length && matches.length === 1 && /^\s*[-–—~～至到]/.test(remainder))
    return fail('日期區間不完整');
  const first = days[0];
  const start = timestamp(first, clocks[0]?.hour, clocks[0]?.minute);
  let end: string | null = null;
  if (times.length === 2) end = timestamp(days[1] ?? first, clocks[1].hour, clocks[1].minute);
  else if (days.length === 2) {
    if (times.length) return fail('跨日區間缺少結束時間');
    const last = days[1];
    if (timestamp(last) < start) return fail('結束日期早於開始日期');
    const exclusive = new Date(Date.UTC(last.year, last.month - 1, last.day + 1));
    end = timestamp({
      year: exclusive.getUTCFullYear(),
      month: exclusive.getUTCMonth() + 1,
      day: exclusive.getUTCDate(),
    });
  }
  if (end && end <= start) return fail('結束時間必須晚於開始時間');
  return { startTime: start, endTime: end, allDay: !times.length, reasons: [] };
}
/** 公告時間須帶時區，或為台北日期 YYYY-MM-DD；無法解析時回傳 null。 */
function referenceDay(value: string | null): Day | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00+08:00' : value;
  const time = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? new Date(normalized).getTime() : NaN;
  if (!Number.isFinite(time)) return null;
  const taipei = new Date(time + 8 * 3600000);
  return {
    year: taipei.getUTCFullYear(),
    month: taipei.getUTCMonth() + 1,
    day: taipei.getUTCDate(),
  };
}
/** references 依序取第一個可解析的時間（發布時間、擷取時間）作為推論年份的基準。 */
export function parseEventDates(content: string, ...references: (string | null)[]): DateResult {
  const reference = references.map(referenceDay).find((day) => day !== null) ?? null;
  const lines = normalizeText(content)
    .split('\n')
    .map((line) => line.replace(/^[。•●\s]+/, ''))
    .filter(Boolean);
  const activityLabel = /^(?:(?:活動|演講|講座|舉辦)(?:日期|時間|期間)|日期|時間)\s*[:：]?/;
  const labeled = lines.filter((line) => activityLabel.test(line));
  const candidates = labeled.length
    ? labeled
    : lines.filter(
        (line) =>
          !/報名|截止|發布|發佈|更新|刊登/.test(line) && new RegExp(datePattern.source).test(line),
      );
  const results: DateResult[] = [];
  for (const line of candidates) {
    if (!new RegExp(datePattern.source).test(line) && /^(?:活動|演講|講座)?時間/.test(line))
      continue;
    const next = lines[lines.indexOf(line) + 1];
    const candidate =
      next &&
      /^(?:(?:活動|演講|講座)?時間|時段)\s*[:：]?/.test(next) &&
      !new RegExp(datePattern.source).test(next)
        ? line + ' ' + next.replace(activityLabel, '')
        : line;
    results.push(parseCandidate(candidate, reference));
  }
  if (!results.length)
    return { startTime: null, endTime: null, allDay: false, reasons: ['找不到活動日期'] };
  const unique = [...new Map(results.map((result) => [JSON.stringify(result), result])).values()];
  return unique.length === 1
    ? unique[0]
    : { startTime: null, endTime: null, allDay: false, reasons: ['活動日期不明確，需人工確認'] };
}
