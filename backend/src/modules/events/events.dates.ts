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
  /(?<![\d/.])(?<!\d:)(?:民國\s*)?(?:(\d{1,4})\s*(?:年|[/.-])\s*)?(\d{1,2})\s*(?:月|[/.-])\s*(\d{1,2})\s*日?(?![\d:])/g;
const timePattern =
  /(?<![\d/:])(?:(上午|下午|中午|晚上|凌晨|AM|PM)\s*)?(\d{1,2})(?:\s*:\s*(\d{2})|\s*[時點](?:(\d{1,2})分?|(半))?)\s*(AM|PM)?(?![\d:])/gi;
const rangePattern = /^\s*(?:[-–—~～]|[~～]?\s*[至到])\s*$/;
const pad = (value: number) => String(value).padStart(2, '0');
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
function parseCandidate(text: string, year: number): DateResult {
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
    let candidateYear = explicit
      ? Number(explicit) + (explicit.length <= 3 ? 1911 : 0)
      : (days[0]?.year ?? year);
    if (!explicit && days[0] && Number(match[2]) < days[0].month) candidateYear++;
    const day = { year: candidateYear, month: Number(match[2]), day: Number(match[3]) };
    if (!validDay(day)) return fail('無效的活動日期');
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
export function parseEventDates(content: string, reference: string): DateResult {
  const normalizedReference = /^\d{4}-\d{2}-\d{2}$/.test(reference)
    ? reference + 'T00:00:00+08:00'
    : reference;
  const referenceDate = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalizedReference)
    ? new Date(normalizedReference)
    : new Date(NaN);
  const year = new Date(referenceDate.getTime() + 8 * 3600000).getUTCFullYear();
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
    results.push(parseCandidate(candidate, year));
  }
  if (!results.length)
    return { startTime: null, endTime: null, allDay: false, reasons: ['找不到活動日期'] };
  const unique = [...new Map(results.map((result) => [JSON.stringify(result), result])).values()];
  return unique.length === 1
    ? unique[0]
    : { startTime: null, endTime: null, allDay: false, reasons: ['活動日期不明確，需人工確認'] };
}
