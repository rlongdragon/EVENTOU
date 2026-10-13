import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { EventCategory } from '../events/events.types.js';
import type { ReviewStatus } from '../sources/sourceTypes.js';
import type { CalendarEvent } from './calendars.ics.js';

const APPROVED: ReviewStatus = 'approved';

/**
 * US-05：某類別要放進公開行事曆的活動，依開始時間排序。
 * 只含已發布（published_events）且來源已核准的活動；來源被退回或活動轉為待審後就不再輸出。
 */
export function listCalendarEventsByCategory(
  db: DatabaseSync,
  category: EventCategory,
): CalendarEvent[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.title, e.description, e.start_time, e.end_time, e.all_day, e.location,
        e.registration_url, e.original_url, e.created_at, e.updated_at
      FROM published_events e
      JOIN sources s ON s.id = e.source_id
      WHERE e.category = ? AND s.review_status = ?
      ORDER BY e.start_time, e.id`,
    )
    .all(category, APPROVED);
  const text = (value: SQLOutputValue) => (value === null ? null : String(value));
  return rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    description: String(row.description),
    startTime: String(row.start_time),
    endTime: text(row.end_time),
    allDay: Number(row.all_day) === 1,
    location: text(row.location),
    registrationUrl: text(row.registration_url),
    originalUrl: String(row.original_url),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}
