import type { DatabaseSync } from 'node:sqlite';
import type { EventCategory } from '../events/events.types.js';

export interface MapEvent {
  id: number;
  title: string;
  category: EventCategory;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string;
}

export interface MapCoordinates {
  latitude: number;
  longitude: number;
}

export function findMapEvents(
  db: DatabaseSync,
  filters: { category: string; date: string },
): MapEvent[] {
  const conditions = ['location IS NOT NULL', 'length(trim(location)) > 0'];
  const params: string[] = [];
  if (filters.category) {
    conditions.push('category = ?');
    params.push(filters.category);
  }
  if (filters.date) {
    conditions.push('substr(start_time, 1, 10) = ?');
    params.push(filters.date);
  }

  const rows = db
    .prepare(
      `SELECT id, title, category, start_time, end_time, all_day, location
       FROM published_events WHERE ${conditions.join(' AND ')} ORDER BY start_time, id`,
    )
    .all(...params);

  return rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    category: String(row.category) as EventCategory,
    startTime: String(row.start_time),
    endTime: row.end_time === null ? null : String(row.end_time),
    allDay: Number(row.all_day) === 1,
    location: String(row.location),
  }));
}

type GeocodeResult = MapCoordinates | null;
const geocodeCache = new Map<string, GeocodeResult>();
let nextGeocodeAt = 0;
let geocodeQueue: Promise<void> = Promise.resolve();

/** Nominatim 查詢採序列化與記憶體快取，遵守公開服務每秒一筆的限制。 */
export function geocodeLocation(location: string): Promise<GeocodeResult> {
  const normalized = location.trim().toLocaleLowerCase();
  const cached = geocodeCache.get(normalized);
  if (cached !== undefined || geocodeCache.has(normalized)) return Promise.resolve(cached ?? null);

  const result = geocodeQueue.then(async () => {
    const queuedCached = geocodeCache.get(normalized);
    if (queuedCached !== undefined || geocodeCache.has(normalized)) return queuedCached ?? null;

    const wait = Math.max(0, nextGeocodeAt - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    nextGeocodeAt = Date.now() + 1000;

    const query = new URLSearchParams({
      q: `${location}, National Taiwan Ocean University, Taiwan`,
      format: 'jsonv2',
      limit: '1',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, {
      headers: { 'User-Agent': 'EVENTOU/1.0 (campus event map)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    const matches = (await response.json()) as { lat: string; lon: string }[];
    const latitude = Number(matches[0]?.lat);
    const longitude = Number(matches[0]?.lon);
    const coordinates =
      matches[0] && Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null;
    geocodeCache.set(normalized, coordinates);
    return coordinates;
  });

  geocodeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
