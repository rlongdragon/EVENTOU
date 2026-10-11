import type { DatabaseSync } from 'node:sqlite';
import { httpUrl } from './events.cleaner.js';
import { validateEvent } from './events.converter.js';
import { taipeiNow } from './events.dates.js';
import type { ConvertedAnnouncement, Event } from './events.types.js';

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
  const updatedAt = taipeiNow(now);
  const row = db
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
      input.title,
      input.description,
      input.category,
      JSON.stringify(input.tags),
      input.startTime,
      input.endTime,
      Number(input.allDay),
      input.location,
      input.organizer,
      input.registrationUrl,
      sourceId,
      originalUrl,
      status,
      JSON.stringify(reviewReasons),
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
