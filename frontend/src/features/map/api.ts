export interface MapCoordinates {
  latitude: number;
  longitude: number;
}

export interface MapEventItem {
  id: number;
  title: string;
  category: string;
  categoryLabel: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string;
  /** 對到校內建物時的座標，對不到為 null */
  coordinates: MapCoordinates | null;
  /** 對到的校內建物名稱 */
  placeName: string | null;
}

export interface MapEventResult {
  items: MapEventItem[];
  campus: MapCoordinates & { name: string };
  categories: { code: string; label: string }[];
}

export async function fetchMapEvents(
  filters: { date: string; category: string },
  signal?: AbortSignal,
): Promise<MapEventResult> {
  const query = new URLSearchParams();
  if (filters.date) query.set('date', filters.date);
  if (filters.category) query.set('category', filters.category);
  const response = await fetch(`/api/map/events?${query}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as MapEventResult;
}
