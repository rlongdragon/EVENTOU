export interface MapEventItem {
  id: number;
  title: string;
  category: string;
  categoryLabel: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string;
  coordinates: { latitude: number; longitude: number } | null;
}

export interface MapEventResult {
  items: MapEventItem[];
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
