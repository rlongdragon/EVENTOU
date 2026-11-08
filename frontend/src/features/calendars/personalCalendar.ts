import { useEffect, useState } from 'react';
import { fetchCategoryCalendars, type PersonalCalendar } from './api';

/** 例：類別：講座、工作坊；標籤：AI */
export function describeConditions(
  calendar: Pick<PersonalCalendar, 'categories' | 'tags'>,
  labels: Record<string, string>,
): string {
  const parts: string[] = [];
  if (calendar.categories.length > 0) {
    parts.push(`類別：${calendar.categories.map((code) => labels[code] ?? code).join('、')}`);
  }
  if (calendar.tags.length > 0) parts.push(`標籤：${calendar.tags.join('、')}`);
  return parts.join('；');
}

/** 類別代碼 → 顯示名稱，由後端的 EVENT_CATEGORY_LABELS 提供。 */
export function useCategoryLabels(): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    fetchCategoryCalendars(controller.signal)
      .then((categories) =>
        setLabels(Object.fromEntries(categories.map((item) => [item.category, item.label]))),
      )
      // 拿不到名稱時直接顯示類別代碼
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return labels;
}
