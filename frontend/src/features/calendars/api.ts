import { ApiError } from '../auth/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? 'unknown_error',
      body?.message ?? `HTTP ${response.status}`,
      body?.fields,
    );
  }
  return body as T;
}

export interface CategoryCalendar {
  /** 類別代碼 */
  category: string;
  /** 類別顯示名稱，由後端依 EVENT_CATEGORY_LABELS 提供 */
  label: string;
  /** iCal 訂閱網址的路徑（不含網站位址） */
  icsPath: string;
}

/** 各類別的公開行事曆（US-05），未登入可用。 */
export async function fetchCategoryCalendars(signal?: AbortSignal): Promise<CategoryCalendar[]> {
  return (
    await request<{ categories: CategoryCalendar[] }>('/api/calendars/categories', { signal })
  ).categories;
}

export interface CalendarSource {
  id: number;
  name: string;
  type: string;
}

/** 可供篩選的來源（已核准），未登入可用。 */
export async function fetchCalendarSources(signal?: AbortSignal): Promise<CalendarSource[]> {
  return (await request<{ sources: CalendarSource[] }>('/api/calendars/sources', { signal }))
    .sources;
}

/** 對單一活動的標記：added 手動加入、hidden 從我的行事曆隱藏。 */
export type EventMark = 'added' | 'hidden';

/** 活動與目前使用者的關係，對應後端 calendars.mine.ts 的 EventCalendarState。 */
export interface EventCalendarState {
  /** 是否出現在我的行事曆 */
  mine: boolean;
  mark: EventMark | null;
  /** 是否因為追蹤類別／來源而帶進來 */
  via: { category: boolean; source: boolean };
}

/** 月曆上的一筆活動。 */
export interface CalendarItem extends EventCalendarState {
  id: number;
  title: string;
  category: string;
  categoryLabel: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  sourceId: number;
  sourceName: string;
}

export interface CalendarQuery {
  /** mine 只列我的行事曆（需登入）；all 列出所有活動 */
  scope: 'mine' | 'all';
  from: string;
  to: string;
  category?: string;
  sourceId?: number;
  /** scope 為 mine 時一併列出被隱藏的活動 */
  includeHidden?: boolean;
}

/** 月曆在日期範圍內的活動；活動期間與範圍有重疊就列出。 */
export async function fetchCalendarItems(
  query: CalendarQuery,
  signal?: AbortSignal,
): Promise<CalendarItem[]> {
  const params = new URLSearchParams({ scope: query.scope, from: query.from, to: query.to });
  if (query.category) params.set('category', query.category);
  if (query.sourceId !== undefined) params.set('sourceId', String(query.sourceId));
  if (query.includeHidden) params.set('hidden', '1');
  return (await request<{ items: CalendarItem[] }>(`/api/calendars/events?${params}`, { signal }))
    .items;
}

function markPath(eventId: number): string {
  return `/api/calendars/events/${eventId}/mark`;
}

/** 活動與自己的行事曆的關係（需登入）。 */
export function fetchEventCalendarState(
  eventId: number,
  signal?: AbortSignal,
): Promise<EventCalendarState> {
  return request(markPath(eventId), { signal });
}

/** 把活動加入我的行事曆，或從我的行事曆隱藏（需登入）。 */
export function setEventMark(eventId: number, state: EventMark): Promise<EventCalendarState> {
  return request(markPath(eventId), { method: 'PUT', body: JSON.stringify({ state }) });
}

/** 移除標記：手動加入的活動移除，被隱藏的活動恢復由追蹤決定（需登入）。 */
export function clearEventMark(eventId: number): Promise<EventCalendarState> {
  return request(markPath(eventId), { method: 'DELETE' });
}

/** 我的行事曆同步網址的路徑（需登入），任何拿到網址的人都能讀取。 */
export async function fetchFeedPath(signal?: AbortSignal): Promise<string> {
  return (await request<{ icsPath: string }>('/api/calendars/feed', { signal })).icsPath;
}

/** 換一個新的同步網址，舊網址立即失效（需登入）。 */
export async function resetFeedPath(): Promise<string> {
  return (await request<{ icsPath: string }>('/api/calendars/feed/reset', { method: 'POST' }))
    .icsPath;
}
