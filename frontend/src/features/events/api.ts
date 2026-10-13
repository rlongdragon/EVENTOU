// 對應 backend/src/modules/events/events.types.ts 的 PublishedEvent（只列活動頁用到的欄位）
export interface EventDetail {
  id: number;
  title: string;
  description: string;
  /** 類別代碼 */
  category: string;
  /** 類別顯示名稱，由後端依 EVENT_CATEGORY_LABELS 提供 */
  categoryLabel: string;
  /** Asia/Taipei ISO 8601；全天活動的 endTime 為結束日隔天 00:00 */
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  organizer: string | null;
  originalUrl: string;
}

/** 取得單一活動（US-02），活動不存在時回傳 null。 */
export async function fetchEvent(
  eventId: string,
  signal?: AbortSignal,
): Promise<EventDetail | null> {
  const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const { event } = (await response.json()) as { event: EventDetail };
  return event;
}

/** 搜尋結果列表的單筆活動（US-01） */
export type EventSummary = Pick<
  EventDetail,
  'id' | 'title' | 'category' | 'categoryLabel' | 'startTime' | 'endTime' | 'allDay' | 'location'
>;

export interface EventSearchParams {
  q: string;
  category: string;
  page: number;
}

export interface EventSearchResult {
  items: EventSummary[];
  page: number;
  pageSize: number;
  total: number;
  /** 類別篩選選項，由後端依 EVENT_CATEGORY_LABELS 提供 */
  categories: { code: string; label: string }[];
}

/** 搜尋活動（US-01），空字串的條件不送出。 */
export async function searchEvents(
  { q, category, page }: EventSearchParams,
  signal?: AbortSignal,
): Promise<EventSearchResult> {
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (category) query.set('category', category);
  if (page > 1) query.set('page', String(page));
  const response = await fetch(`/api/events?${query}`, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as EventSearchResult;
}
