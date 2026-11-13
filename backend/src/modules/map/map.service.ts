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

/** 取得已發布活動的地點；活動不存在或未發布時回傳 undefined。 */
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
