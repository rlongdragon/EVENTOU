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

/** 僅從已發布活動取得地點，避免任意字串觸發外部地理編碼。 */
export function findMapEventLocation(db: DatabaseSync, eventId: number): string | null | undefined {
  const row = db.prepare('SELECT location FROM published_events WHERE id = ?').get(eventId) as
    { location: string | null } | undefined;
  return row?.location;
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
const geocodeFailures = new Map<string, number>();
const geocodeInFlight = new Map<string, Promise<GeocodeResult>>();
let nextGeocodeAt = 0;
let geocodeQueue: Promise<void> = Promise.resolve();

export function getCachedGeocodeLocation(location: string): {
  coordinates: GeocodeResult;
  pending: boolean;
} {
  const normalized = location.trim().toLocaleLowerCase();
  if (geocodeCache.has(normalized)) {
    return { coordinates: geocodeCache.get(normalized) ?? null, pending: false };
  }
  if ((geocodeFailures.get(normalized) ?? 0) > Date.now()) {
    return { coordinates: null, pending: false };
  }
  return { coordinates: null, pending: true };
}

/** Nominatim 查詢採序列化與記憶體快取，遵守公開服務每秒一筆的限制。 */
export function geocodeLocation(location: string): Promise<GeocodeResult> {
  const normalized = location.trim().toLocaleLowerCase();
  const cached = geocodeCache.get(normalized);
  if (cached !== undefined || geocodeCache.has(normalized)) return Promise.resolve(cached ?? null);
  if ((geocodeFailures.get(normalized) ?? 0) > Date.now()) return Promise.resolve(null);
  const inFlight = geocodeInFlight.get(normalized);
  if (inFlight) return inFlight;

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
    try {
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
      geocodeFailures.delete(normalized);
      return coordinates;
    } catch (error) {
      geocodeFailures.set(normalized, Date.now() + 60_000);
      throw error;
    }
  });

  geocodeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  geocodeInFlight.set(normalized, result);
  void result.then(
    () => geocodeInFlight.delete(normalized),
    () => geocodeInFlight.delete(normalized),
  );
  return result;
}
