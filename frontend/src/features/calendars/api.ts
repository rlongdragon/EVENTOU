import { ApiError } from '../auth/api';

export interface CategoryCalendar {
  /** 類別代碼 */
  category: string;
  /** 類別顯示名稱，由後端依 EVENT_CATEGORY_LABELS 提供 */
  label: string;
  /** iCal 訂閱網址的路徑（不含網站位址） */
  icsPath: string;
}

/** 取得各類別的公開行事曆（US-05），未登入可用。 */
export async function fetchCategoryCalendars(signal?: AbortSignal): Promise<CategoryCalendar[]> {
  const response = await fetch('/api/calendars/categories', { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const { categories } = (await response.json()) as { categories: CategoryCalendar[] };
  return categories;
}

/** 個人行事曆（US-09），對應 backend/src/modules/calendars/calendars.personal.ts 的 PersonalCalendar */
export interface PersonalCalendar {
  id: number;
  name: string;
  /** 類別條件（類別代碼） */
  categories: string[];
  /** 標籤條件 */
  tags: string[];
  /** iCal 訂閱網址的路徑（不含網站位址） */
  icsPath: string;
  createdAt: string;
  updatedAt: string;
}

/** 建立或修改個人行事曆時送出的內容；類別之間、標籤之間任一符合，類別與標籤要同時符合。 */
export interface PersonalCalendarInput {
  name: string;
  categories: string[];
  tags: string[];
}

/** 行事曆中的活動 */
export interface CalendarEventItem {
  id: number;
  title: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
}

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

/** 活動中出現過的所有標籤，供選擇條件（未登入可用）。 */
export async function fetchEventTags(signal?: AbortSignal): Promise<string[]> {
  return (await request<{ tags: string[] }>('/api/calendars/tags', { signal })).tags;
}

/** 列出自己的個人行事曆（需登入）。 */
export async function fetchPersonalCalendars(signal?: AbortSignal): Promise<PersonalCalendar[]> {
  return (await request<{ calendars: PersonalCalendar[] }>('/api/calendars/personal', { signal }))
    .calendars;
}

/** 取得自己的某個行事曆與目前符合條件的活動（需登入）。 */
export function fetchPersonalCalendar(
  calendarId: string,
  signal?: AbortSignal,
): Promise<{ calendar: PersonalCalendar; events: CalendarEventItem[] }> {
  return request(`/api/calendars/personal/${encodeURIComponent(calendarId)}`, { signal });
}

export async function createPersonalCalendar(
  input: PersonalCalendarInput,
): Promise<PersonalCalendar> {
  return (
    await request<{ calendar: PersonalCalendar }>('/api/calendars/personal', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).calendar;
}

export async function updatePersonalCalendar(
  calendarId: number,
  input: PersonalCalendarInput,
): Promise<PersonalCalendar> {
  return (
    await request<{ calendar: PersonalCalendar }>(`/api/calendars/personal/${calendarId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  ).calendar;
}

export async function deletePersonalCalendar(calendarId: number): Promise<void> {
  await request(`/api/calendars/personal/${calendarId}`, { method: 'DELETE' });
}
