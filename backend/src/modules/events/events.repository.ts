import type { DatabaseSync } from 'node:sqlite';
import { httpUrl } from './events.cleaner.js';
import { validateEvent } from './events.converter.js';
import { taipeiNow } from './events.dates.js';
import type { ConvertedAnnouncement, EventStatus, UpsertResult } from './events.types.js';

/** 只接受具備真實追溯鍵的公告；缺鍵資料須保留在擷取端待人工修正。 */
export function upsertEvent(
  db: DatabaseSync,
  input: ConvertedAnnouncement,
  now = new Date(),
): UpsertResult {
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
  const previousStatus = (previous?.status as EventStatus | undefined) ?? null;
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
  const change = unchanged ? 'unchanged' : previous ? 'updated' : 'created';
  if (status === 'published' && input.category && input.startTime)
    return {
      event: { ...fields, status, category: input.category, startTime: input.startTime },
      change,
      previousStatus,
    };
  return { event: { ...fields, status: 'needs_review' }, change, previousStatus };
}
