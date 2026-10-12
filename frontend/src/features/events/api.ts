// 對應 backend/src/modules/events/events.types.ts 的 PublishedEvent（只列活動頁用到的欄位）
export interface EventDetail {
  id: number;
  title: string;
  description: string;
  /** 類別代碼，顯示名稱待類別清單定案（#9）後再處理 */
  category: string;
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
