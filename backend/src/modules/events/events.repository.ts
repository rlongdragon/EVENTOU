import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { httpUrl } from './events.cleaner.js';
import { validateEvent } from './events.converter.js';
import { taipeiNow } from './events.dates.js';
import { RELEVANT_SCORE, relevanceScore, type RelevanceProfile } from './events.relevance.js';
import { isDepartment, isEventTopic } from './events.types.js';
import type {
  ConvertedAnnouncement,
  Event,
  EventCategory,
  EventTopic,
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
    topics: JSON.stringify(input.topics),
    summary: input.summary,
    is_event: Number(input.isEvent),
    audience_departments: JSON.stringify(input.audienceDepartments),
    audience_grades: JSON.stringify(input.audienceGrades),
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
    INSERT INTO events (title, description, category, tags, topics, summary, is_event,
      audience_departments, audience_grades, start_time, end_time, all_day,
      location, organizer, registration_url, source_id, original_url, status, review_reasons, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (source_id, original_url) DO UPDATE SET
      title=excluded.title, description=excluded.description, category=excluded.category,
      tags=excluded.tags, topics=excluded.topics, summary=excluded.summary,
      is_event=excluded.is_event, audience_departments=excluded.audience_departments,
      audience_grades=excluded.audience_grades, start_time=excluded.start_time, end_time=excluded.end_time,
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
        content.topics,
        content.summary,
        content.is_event,
        content.audience_departments,
        content.audience_grades,
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
    ...eventExtras(row),
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

/** #69／#88 新增的欄位，published_events 與 events 共用同一套讀法。 */
function eventExtras(row: Record<string, SQLOutputValue>) {
  const list = (value: SQLOutputValue): unknown[] => {
    const parsed: unknown = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed : [];
  };
  return {
    topics: list(row.topics).filter(isEventTopic),
    summary: row.summary === null || row.summary === undefined ? null : String(row.summary),
    isEvent: Number(row.is_event ?? 1) === 1,
    audienceDepartments: list(row.audience_departments).filter(isDepartment),
    audienceGrades: list(row.audience_grades).filter(
      (grade): grade is number => typeof grade === 'number',
    ),
  };
}

/** 搜尋結果列表的單筆活動（US-01），只含列表需要的欄位。 */
export interface EventSummary {
  id: number;
  title: string;
  category: EventCategory;
  topics: EventTopic[];
  summary: string | null;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
}

export interface EventSearchOptions {
  /** 關鍵字，不分大小寫比對標題、說明、地點、主辦單位、摘要 */
  q?: string;
  category?: string;
  /** 主題代碼（#69） */
  topic?: string;
  /** 只列出跟這位使用者相關的活動，依相關度排序（#88） */
  profile?: RelevanceProfile | null;
  page: number;
  pageSize: number;
}

const DAY_MS = 86400000;

/**
 * US-01：搜尋已發布且尚未結束的活動，依開始時間由近到遠排序並分頁。
 * 結束時間為 end_time；沒有 end_time 時，全天活動算到當天結束，其餘算到 start_time。
 * 有 profile 時只保留相關的活動，先依相關度、再依開始時間排序（#88）。
 */
export function searchPublishedEvents(
  db: DatabaseSync,
  { q, category, topic, profile, page, pageSize }: EventSearchOptions,
  now = new Date(),
): { items: EventSummary[]; total: number } {
  // 時間皆存成 +08:00 的 ISO 字串，可直接以字串比較先後。
  // 單日全天活動的 end_time 是 null、start_time 是當天 00:00，改用「開始時間晚於 24 小時前」判斷
  const conditions = [
    `(CASE WHEN end_time IS NULL AND all_day = 1 THEN start_time > ?
      ELSE COALESCE(end_time, start_time) > ? END)`,
  ];
  const params: string[] = [taipeiNow(new Date(now.getTime() - DAY_MS)), taipeiNow(now)];
  if (q) {
    // 跳脫 LIKE 萬用字元，讓 % 與 _ 以字面比對
    const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    conditions.push(
      `(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'
        OR location LIKE ? ESCAPE '\\' OR organizer LIKE ? ESCAPE '\\'
        OR summary LIKE ? ESCAPE '\\')`,
    );
    params.push(pattern, pattern, pattern, pattern, pattern);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (topic) {
    conditions.push('EXISTS (SELECT 1 FROM json_each(topics) WHERE value = ?)');
    params.push(topic);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const columns = `id, title, category, topics, summary, is_event, audience_departments,
    audience_grades, start_time, end_time, all_day, location`;
  const toSummary = (row: Record<string, SQLOutputValue>) => {
    const extras = eventExtras(row);
    return {
      item: {
        id: Number(row.id),
        title: String(row.title),
        category: String(row.category) as EventCategory,
        topics: extras.topics,
        summary: extras.summary,
        startTime: String(row.start_time),
        endTime: row.end_time === null ? null : String(row.end_time),
        allDay: Number(row.all_day) === 1,
        location: row.location === null ? null : String(row.location),
      },
      extras,
    };
  };
  if (profile) {
    // 個人化要先算分數才能排序，活動數量是數百筆等級，直接在程式裡排序與分頁。
    const ranked = db
      .prepare(`SELECT ${columns} FROM published_events ${where} ORDER BY start_time, id`)
      .all(...params)
      .map(toSummary)
      .map(({ item, extras }) => ({
        item,
        score: relevanceScore(profile, { ...extras, category: item.category }),
      }))
      .filter(({ score }) => score >= RELEVANT_SCORE)
      .sort((a, b) => b.score - a.score);
    const start = (page - 1) * pageSize;
    return {
      items: ranked.slice(start, start + pageSize).map(({ item }) => item),
      total: ranked.length,
    };
  }
  const total = Number(
    db.prepare(`SELECT count(*) AS total FROM published_events ${where}`).get(...params)?.total,
  );
  const items = db
    .prepare(
      `SELECT ${columns} FROM published_events ${where}
      ORDER BY start_time, id
      LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize)
    .map((row) => toSummary(row).item);
  return { items, total };
}
