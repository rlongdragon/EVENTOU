import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { EventCategory } from '../events/events.types.js';
import type { ReviewStatus } from '../sources/sourceTypes.js';
import type { CalendarEvent } from './calendars.ics.js';

const APPROVED: ReviewStatus = 'approved';

/** 行事曆的篩選條件；空陣列表示不以該項篩選。 */
export interface CalendarEventFilter {
  categories: readonly EventCategory[];
  tags: readonly string[];
}

/**
 * 行事曆要輸出的活動，依開始時間排序。只含已發布（published_events）且來源已核准的活動；
 * 來源被退回或活動轉為待審後就不再輸出。
 * 類別之間、標籤之間是「任一符合」；同時指定類別與標籤時，兩者都要符合。
 */
export function listCalendarEvents(db: DatabaseSync, filter: CalendarEventFilter): CalendarEvent[] {
  const conditions = ['s.review_status = ?'];
  const params: string[] = [APPROVED];
  if (filter.categories.length > 0) {
    conditions.push('e.category IN (SELECT value FROM json_each(?))');
    params.push(JSON.stringify(filter.categories));
  }
  if (filter.tags.length > 0) {
    conditions.push(
      'EXISTS (SELECT 1 FROM json_each(e.tags) t WHERE t.value IN (SELECT value FROM json_each(?)))',
    );
    params.push(JSON.stringify(filter.tags));
  }
  const rows = db
    .prepare(
      `SELECT e.id, e.title, e.description, e.start_time, e.end_time, e.all_day, e.location,
        e.registration_url, e.original_url, e.created_at, e.updated_at
      FROM published_events e
      JOIN sources s ON s.id = e.source_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.start_time, e.id`,
    )
    .all(...params);
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

/** US-05：某類別要放進公開行事曆的活動。 */
export function listCalendarEventsByCategory(
  db: DatabaseSync,
  category: EventCategory,
): CalendarEvent[] {
  return listCalendarEvents(db, { categories: [category], tags: [] });
}

/** 已發布且來源已核准的活動中出現過的所有標籤，依字母排序；供個人行事曆選擇條件。 */
export function listEventTags(db: DatabaseSync): string[] {
  return db
    .prepare(
      `SELECT DISTINCT t.value AS tag
      FROM published_events e
      JOIN sources s ON s.id = e.source_id
      JOIN json_each(e.tags) t
      WHERE s.review_status = ?
      ORDER BY t.value`,
    )
    .all(APPROVED)
    .map((row) => String(row.tag));
}
