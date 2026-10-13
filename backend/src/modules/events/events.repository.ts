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

/** 搜尋結果列表的單筆活動（US-01），只含列表需要的欄位。 */
export interface EventSummary {
  id: number;
  title: string;
  category: EventCategory;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
}

export interface EventSearchOptions {
  /** 關鍵字，不分大小寫比對標題、說明、地點、主辦單位 */
  q?: string;
  category?: string;
  page: number;
  pageSize: number;
}

/**
 * US-01：搜尋已發布且尚未結束的活動（end_time，沒有則 start_time，晚於現在），
 * 依開始時間由近到遠排序並分頁。
 */
export function searchPublishedEvents(
  db: DatabaseSync,
  { q, category, page, pageSize }: EventSearchOptions,
  now = new Date(),
): { items: EventSummary[]; total: number } {
  // 時間皆存成 +08:00 的 ISO 字串，可直接以字串比較先後
  const conditions = ['COALESCE(end_time, start_time) > ?'];
  const params: string[] = [taipeiNow(now)];
  if (q) {
    // 跳脫 LIKE 萬用字元，讓 % 與 _ 以字面比對
    const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    conditions.push(
      `(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'
        OR location LIKE ? ESCAPE '\\' OR organizer LIKE ? ESCAPE '\\')`,
    );
    params.push(pattern, pattern, pattern, pattern);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const total = Number(
    db.prepare(`SELECT count(*) AS total FROM published_events ${where}`).get(...params)?.total,
  );
  const rows = db
    .prepare(
      `SELECT id, title, category, start_time, end_time, all_day, location
      FROM published_events ${where}
      ORDER BY start_time, id
      LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  const items = rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    category: String(row.category) as EventCategory,
    startTime: String(row.start_time),
    endTime: row.end_time === null ? null : String(row.end_time),
    allDay: Number(row.all_day) === 1,
    location: row.location === null ? null : String(row.location),
  }));
  return { items, total };
}
