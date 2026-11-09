import { httpUrl } from '../events/events.cleaner.js';
import type { RawAnnouncement } from '../events/events.types.js';
import { shiftDate, wallTimeToTaipei } from './ingestion.dates.js';
import type { IcalConfig } from './ingestion.extraction.js';
import type { ScraperClient } from './ingestion.scraper.js';

// US-18 iCalendar 擷取：每個 VEVENT 一則公告。只讀取 VEVENT 的單次事件，
// 不展開 RRULE 重複規則（只取第一次）；時間一律轉成台北時間，寫進內文交給 US-19 解析。

/** 台北時間的日期與時間；time 為 null 表示整天活動。 */
interface IcsTime {
  date: string;
  time: string | null;
}

export interface IcsEvent {
  uid: string | null;
  summary: string;
  description: string;
  location: string | null;
  url: string | null;
  start: IcsTime | null;
  end: IcsTime | null;
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** 解析一行 `NAME;PARAM=VALUE:value`；冒號在引號內的參數值不算分隔。 */
function parseProperty(line: string): Property | null {
  let quoted = false;
  let split = -1;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) {
      split = i;
      break;
    }
  }
  if (split < 0) return null;
  const [name, ...rawParams] = line.slice(0, split).split(';');
  const params: Record<string, string> = {};
  for (const raw of rawParams) {
    const eq = raw.indexOf('=');
    if (eq > 0) params[raw.slice(0, eq).toUpperCase()] = raw.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(split + 1) };
}

/** TEXT 值的跳脫字元：\n、\N、\,、\;、\\ */
function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_match, character: string) =>
    character === 'n' || character === 'N' ? '\n' : character,
  );
}

function parseTime(property: Property): IcsTime | null {
  const match = property.value
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, , utc] = match;
  if (hour === undefined) {
    return { date: `${year}-${month}-${day}`, time: null };
  }
  const zone = utc ? 'UTC' : (property.params.TZID ?? null);
  const converted = wallTimeToTaipei(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
    },
    zone,
  );
  return converted;
}

/** 解析 iCalendar 文字，回傳所有 VEVENT（略過 VALARM 等子元件）。 */
export function parseIcs(text: string): IcsEvent[] {
  // 長行以換行加空白／Tab 接續
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/);
  const events: IcsEvent[] = [];
  let current: Property[] | null = null;
  let depth = 0;
  for (const line of lines) {
    const property = parseProperty(line);
    if (!property) continue;
    if (property.name === 'BEGIN') {
      if (property.value.toUpperCase() === 'VEVENT' && !current) current = [];
      else if (current) depth += 1;
      continue;
    }
    if (property.name === 'END') {
      if (current && depth > 0) depth -= 1;
      else if (current && property.value.toUpperCase() === 'VEVENT') {
        events.push(toEvent(current));
        current = null;
      }
      continue;
    }
    if (current && depth === 0) current.push(property);
  }
  return events;
}

function toEvent(properties: Property[]): IcsEvent {
  const first = (name: string) => properties.find((property) => property.name === name);
  const textOf = (name: string) => {
    const value = first(name)?.value;
    return value === undefined ? '' : unescapeText(value).trim();
  };
  const startProperty = first('DTSTART');
  const endProperty = first('DTEND');
  const start = startProperty ? parseTime(startProperty) : null;
  let end = endProperty ? parseTime(endProperty) : null;
  // 整天活動的 DTEND 是「結束日的隔天」，還原成實際最後一天；只有一天時不顯示結束日
  if (start && end && start.time === null && end.time === null) {
    const last = shiftDate(end.date, -1);
    end = last > start.date ? { date: last, time: null } : null;
  }
  return {
    uid: textOf('UID') || null,
    summary: textOf('SUMMARY'),
    description: textOf('DESCRIPTION'),
    location: textOf('LOCATION') || null,
    url: first('URL')?.value.trim() || null,
    start,
    end,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 活動時間文字，格式需讓 US-19 的日期解析讀得到，例如「2026-10-15 14:00～16:00」。 */
function formatWhen(start: IcsTime, end: IcsTime | null): string {
  if (start.time === null) return end ? `${start.date}～${end.date}` : start.date;
  if (!end) return `${start.date} ${start.time}`;
  if (end.time === null || end.date !== start.date)
    return `${start.date} ${start.time}～${end.date}${end.time ? ` ${end.time}` : ''}`;
  return `${start.date} ${start.time}～${end.time}`;
}

/** 把 VEVENT 轉成 US-19 能解析的內文：時間、地點與說明各自一段。 */
export function icsEventContent(event: IcsEvent): string {
  const paragraphs: string[] = [];
  if (event.start) paragraphs.push(`活動時間：${formatWhen(event.start, event.end)}`);
  if (event.location) paragraphs.push(`活動地點：${event.location}`);
  if (event.description) paragraphs.push(event.description);
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** 公告網址：優先用 VEVENT 的 URL；沒有時用「ics 網址#UID」，同一來源內不重複即可。 */
function announcementUrl(event: IcsEvent, listUrl: string, index: number): string {
  const own = httpUrl(event.url ?? '', listUrl);
  if (own) return own;
  const url = new URL(listUrl);
  url.hash = encodeURIComponent(event.uid ?? `event-${index}`);
  return url.href;
}

export async function* scrapeIcal(
  sourceId: number,
  config: IcalConfig,
  client: ScraperClient,
): AsyncGenerator<RawAnnouncement> {
  const events = parseIcs(await client.get(config.listUrl)).filter((event) => event.summary);
  if (!events.length)
    throw new Error('iCalendar 未找到可用的活動（VEVENT 需有 SUMMARY），請確認檔案內容');
  // 行事曆常含大量過去活動：開始時間較晚的優先，沒有開始時間的排最後
  const sorted = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const left = a.event.start ? `${a.event.start.date} ${a.event.start.time ?? ''}` : '';
      const right = b.event.start ? `${b.event.start.date} ${b.event.start.time ?? ''}` : '';
      return right.localeCompare(left) || a.index - b.index;
    })
    .slice(0, config.maxAnnouncements);
  const seen = new Set<string>();
  for (const { event, index } of sorted) {
    const url = announcementUrl(event, config.listUrl, index);
    if (seen.has(url)) continue;
    seen.add(url);
    yield {
      sourceId,
      url,
      title: event.summary,
      rawContent: icsEventContent(event) || `<p>${escapeHtml(event.summary)}</p>`,
      publishedAt: null,
      fetchedAt: new Date().toISOString(),
    };
  }
}
