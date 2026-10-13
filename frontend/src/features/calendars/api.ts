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
