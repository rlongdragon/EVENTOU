import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { httpUrl } from './events.cleaner.js';
import { validateEvent } from './events.converter.js';
import { taipeiNow } from './events.dates.js';
import type {
  ConvertedAnnouncement,
  Event,
  EventCategory,
  PublishedEvent,
} from './events.types.js';

/** 只接受具備真實追溯鍵的公告；缺鍵資料須保留在擷取端待人工修正。 */
export function upsertEvent(
  db: DatabaseSync,
  input: ConvertedAnnouncement,
  now = new Date(),
): Event {
  const sourceId = input.sourceId;
  const originalUrl = httpUrl(input.originalUrl);
  if (!Number.isSafeInteger(sourceId) || sourceId === null || sourceId <= 0 || !originalUrl)
    throw new Error('缺少來源或原始連結，無法建立可追溯 Event');
  const reviewReasons = validateEvent(input);
  const status = reviewReasons.length ? 'needs_review' : 'published';
  const content = {
    title: input.title,
    description: input.description,
    category: input.category,
    tags: JSON.stringify(input.tags),
    start_time: input.startTime,
    end_time: input.endTime,
    all_day: Number(input.allDay),
    location: input.location,
    organizer: input.organizer,
    registration_url: input.registrationUrl,
    status,
    review_reasons: JSON.stringify(reviewReasons),
  };
  const previous = db
    .prepare(
      `SELECT id, created_at, updated_at, ${Object.keys(content).join(', ')}
      FROM events WHERE source_id = ? AND original_url = ?`,
    )
    .get(sourceId, originalUrl);
  // 重跑擷取時內容相同就不寫入，updatedAt 才能代表活動真的有變動。
  const unchanged =
    previous !== undefined &&
    Object.entries(content).every(([column, value]) => previous[column] === value);
  const updatedAt = unchanged ? String(previous.updated_at) : taipeiNow(now);
  let row = previous;
  if (!unchanged)
    row = db
      .prepare(
        `
    INSERT INTO events (title, description, category, tags, start_time, end_time, all_day,
      location, organizer, registration_url, source_id, original_url, status, review_reasons, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (source_id, original_url) DO UPDATE SET
      title=excluded.title, description=excluded.description, category=excluded.category,
      tags=excluded.tags, start_time=excluded.start_time, end_time=excluded.end_time,
      all_day=excluded.all_day, location=excluded.location, organizer=excluded.organizer,
      registration_url=excluded.registration_url, status=excluded.status,
      review_reasons=excluded.review_reasons, updated_at=excluded.updated_at
    RETURNING id, created_at
  `,
      )
      .get(
        content.title,
        content.description,
        content.category,
        content.tags,
        content.start_time,
        content.end_time,
        content.all_day,
        content.location,
        content.organizer,
        content.registration_url,
        sourceId,
        originalUrl,
        content.status,
        content.review_reasons,
        updatedAt,
        updatedAt,
      );
  if (!row || typeof row.id !== 'number' || typeof row.created_at !== 'string')
    throw new Error('Event 儲存結果無效');
  const fields = {
    ...input,
    id: row.id,
    sourceId,
    originalUrl,
    createdAt: row.created_at,
    updatedAt,
    reviewReasons,
  };
  if (status === 'published' && input.category && input.startTime)
    return { ...fields, status, category: input.category, startTime: input.startTime };
  return { ...fields, status: 'needs_review' };
}

/** US-02：依 id 讀取已發布活動；不存在或待審（needs_review）時回傳 undefined。 */
export function findPublishedEventById(db: DatabaseSync, id: number): PublishedEvent | undefined {
  const row = db.prepare('SELECT * FROM published_events WHERE id = ?').get(id);
  if (!row) return undefined;
  const text = (value: SQLOutputValue) => (value === null ? null : String(value));
  // published_events 只含已發布活動，schema 已保證 category、start_time 不為 null
  return {
    id: Number(row.id),
    title: String(row.title),
    description: String(row.description),
    category: String(row.category) as EventCategory,
    tags: JSON.parse(String(row.tags)) as string[],
    startTime: String(row.start_time),
    endTime: text(row.end_time),
    allDay: Number(row.all_day) === 1,
    location: text(row.location),
    organizer: text(row.organizer),
    registrationUrl: text(row.registration_url),
    sourceId: Number(row.source_id),
    originalUrl: String(row.original_url),
    status: 'published',
    reviewReasons: JSON.parse(String(row.review_reasons)) as string[],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
