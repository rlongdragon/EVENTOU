import { randomBytes } from 'node:crypto';
import type { DatabaseSync, SQLInputValue, SQLOutputValue } from 'node:sqlite';
import { EVENT_FIRST_DAY_SQL, EVENT_LAST_DAY_SQL } from '../../shared/eventDays.js';
import type { EventCategory } from '../events/events.types.js';
import { EVENT_CATEGORY_LABELS } from '../events/events.types.js';
import type { ReviewStatus } from '../sources/sourceTypes.js';
import type { CalendarEvent } from './calendars.ics.js';

// #76「我的行事曆」：每位使用者只有一個行事曆，不另存活動清單，每次依追蹤即時查詢。
// 活動出現在某人的行事曆 = 手動加入（added），或追蹤了它的類別／來源且沒有被隱藏（hidden）。

const APPROVED: ReviewStatus = 'approved';

export const EVENT_MARK_STATES = ['added', 'hidden'] as const;

/** 對單一活動的標記：added 手動加入、hidden 從我的行事曆隱藏。 */
export type EventMarkState = (typeof EVENT_MARK_STATES)[number];

export function isEventMarkState(value: unknown): value is EventMarkState {
  return EVENT_MARK_STATES.some((state) => state === value);
}

/** 活動與目前使用者的關係；訪客一律為 mine: false、mark: null。 */
export interface EventCalendarState {
  /** 是否出現在我的行事曆 */
  mine: boolean;
  mark: EventMarkState | null;
  /** 是否因為追蹤類別／來源而帶進來（與 mark 無關） */
  via: { category: boolean; source: boolean; topic: boolean };
}

/** 月曆上的一筆活動。 */
export interface CalendarItem extends EventCalendarState {
  id: number;
  title: string;
  category: EventCategory;
  categoryLabel: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  sourceId: number;
  sourceName: string;
}

export interface CalendarItemQuery {
  /** 訪客為 undefined */
  userId: number | undefined;
  /** mine：只列我的行事曆；all：列出所有活動 */
  scope: 'mine' | 'all';
  /** 台北日期範圍（含兩端），活動期間與範圍有重疊就列出 */
  from: string;
  to: string;
  category?: EventCategory;
  sourceId?: number;
  /** scope 為 mine 時，是否一併列出追蹤帶進來但被隱藏的活動（供還原） */
  includeHidden?: boolean;
}

// US-20 合併重複活動後，被合併的那筆不在 published_events；使用者對它的標記、
// 以及對它來源的追蹤，都要算到保留的那筆活動上，否則合併後活動會從行事曆消失。
const MERGED_EVENT_IDS_SQL = `SELECT d.id FROM events d
  WHERE d.duplicate_of = e.id AND d.dedup_status = 'merged'`;
const MERGED_SOURCE_IDS_SQL = `SELECT d.source_id FROM events d
  WHERE d.duplicate_of = e.id AND d.dedup_status = 'merged'`;

/** 已發布且來源已核准的活動，加上與 :userId 的關係；:userId 為 NULL 時三個欄位都是「沒有」。 */
const USER_EVENTS_SQL = `
  SELECT e.id, e.title, e.description, e.category, e.start_time, e.end_time, e.all_day,
    e.location, e.registration_url, e.original_url, e.created_at, e.updated_at,
    e.source_id, s.name AS source_name,
    COALESCE(
      (SELECT m.state FROM calendar_event_marks m
        WHERE m.user_id = :userId AND m.event_id = e.id),
      (SELECT m.state FROM calendar_event_marks m
        WHERE m.user_id = :userId AND m.event_id IN (${MERGED_EVENT_IDS_SQL})
        ORDER BY m.event_id LIMIT 1)
    ) AS mark,
    EXISTS (SELECT 1 FROM category_subscriptions cs
      WHERE cs.user_id = :userId AND cs.category = e.category) AS via_category,
    EXISTS (SELECT 1 FROM source_follows sf
      WHERE sf.user_id = :userId
        AND (sf.source_id = e.source_id OR sf.source_id IN (${MERGED_SOURCE_IDS_SQL}))) AS via_source,
    EXISTS (SELECT 1 FROM users u, json_each(u.interest_topics) ut, json_each(e.topics) et
      WHERE u.id = :userId AND ut.value = et.value) AS via_topic,
    (e.source_id = :sourceId OR :sourceId IN (${MERGED_SOURCE_IDS_SQL})) AS from_source
  FROM published_events e
  JOIN sources s ON s.id = e.source_id
  WHERE s.review_status = '${APPROVED}'`;

const IS_MINE_SQL = `(mark = 'added' OR ((via_category OR via_source OR via_topic) AND mark IS NOT 'hidden'))`;
const IS_FOLLOWED_SQL = `(mark = 'added' OR via_category OR via_source OR via_topic)`;

function toState(row: Record<string, SQLOutputValue>): EventCalendarState {
  const mark = isEventMarkState(row.mark) ? row.mark : null;
  const via = {
    category: Number(row.via_category) === 1,
    source: Number(row.via_source) === 1,
    topic: Number(row.via_topic) === 1,
  };
  return {
    mine: mark === 'added' || ((via.category || via.source || via.topic) && mark !== 'hidden'),
    mark,
    via,
  };
}

const text = (value: SQLOutputValue) => (value === null ? null : String(value));

/** 月曆要顯示的活動，依開始時間排序。 */
export function listCalendarItems(db: DatabaseSync, query: CalendarItemQuery): CalendarItem[] {
  const conditions = [`${EVENT_LAST_DAY_SQL} >= :from`, `${EVENT_FIRST_DAY_SQL} <= :to`];
  const params: Record<string, SQLInputValue> = {
    userId: query.userId ?? null,
    sourceId: query.sourceId ?? null,
    from: query.from,
    to: query.to,
  };
  if (query.scope === 'mine') conditions.push(query.includeHidden ? IS_FOLLOWED_SQL : IS_MINE_SQL);
  if (query.category) {
    conditions.push('category = :category');
    params.category = query.category;
  }
  if (query.sourceId !== undefined) conditions.push('from_source');
  const rows = db
    .prepare(
      `WITH user_events AS (${USER_EVENTS_SQL})
      SELECT * FROM user_events WHERE ${conditions.join(' AND ')} ORDER BY start_time, id`,
    )
    .all(params);
  return rows.map((row) => {
    const category = String(row.category) as EventCategory;
    return {
      id: Number(row.id),
      title: String(row.title),
      category,
      categoryLabel: EVENT_CATEGORY_LABELS[category] ?? category,
      startTime: String(row.start_time),
      endTime: text(row.end_time),
      allDay: Number(row.all_day) === 1,
      location: text(row.location),
      sourceId: Number(row.source_id),
      sourceName: String(row.source_name),
      ...toState(row),
    };
  });
}

/** 同步網址（iCal）要輸出的活動：我的行事曆中的所有活動，不限日期。 */
export function listMyCalendarEvents(db: DatabaseSync, userId: number): CalendarEvent[] {
  const rows = db
    .prepare(
      `WITH user_events AS (${USER_EVENTS_SQL})
      SELECT * FROM user_events WHERE ${IS_MINE_SQL} ORDER BY start_time, id`,
    )
    .all({ userId, sourceId: null });
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

/** 單一活動與使用者的關係；活動不存在、未發布或來源未核准時回傳 undefined。 */
export function getEventCalendarState(
  db: DatabaseSync,
  userId: number,
  eventId: number,
): EventCalendarState | undefined {
  const row = db
    .prepare(
      `WITH user_events AS (${USER_EVENTS_SQL}) SELECT * FROM user_events WHERE id = :eventId`,
    )
    .get({ userId, sourceId: null, eventId });
  return row ? toState(row) : undefined;
}

/**
 * 標記活動為手動加入或隱藏，回傳更新後的關係；活動不存在時回傳 undefined。
 * 標記記在目前發布的那筆活動上，並清掉先前記在被合併活動上的舊標記，避免兩者互相矛盾。
 */
export function setEventMark(
  db: DatabaseSync,
  userId: number,
  eventId: number,
  state: EventMarkState,
): EventCalendarState | undefined {
  if (!getEventCalendarState(db, userId, eventId)) return undefined;
  clearMarks(db, userId, eventId);
  db.prepare('INSERT INTO calendar_event_marks (user_id, event_id, state) VALUES (?, ?, ?)').run(
    userId,
    eventId,
    state,
  );
  return getEventCalendarState(db, userId, eventId);
}

/** 移除標記，活動回到只由追蹤決定是否出現；活動不存在時回傳 undefined。 */
export function clearEventMark(
  db: DatabaseSync,
  userId: number,
  eventId: number,
): EventCalendarState | undefined {
  if (!getEventCalendarState(db, userId, eventId)) return undefined;
  clearMarks(db, userId, eventId);
  return getEventCalendarState(db, userId, eventId);
}

function clearMarks(db: DatabaseSync, userId: number, eventId: number): void {
  db.prepare(
    `DELETE FROM calendar_event_marks
    WHERE user_id = ? AND (event_id = ? OR event_id IN (
      SELECT d.id FROM events d WHERE d.duplicate_of = ? AND d.dedup_status = 'merged'))`,
  ).run(userId, eventId, eventId);
}

export interface CalendarSettings {
  /** 同步網址的 token，任何拿到網址的人都能讀取這個行事曆 */
  feedToken: string;
  emailNotifications: boolean;
}

function newFeedToken(): string {
  return randomBytes(24).toString('base64url');
}

/** 取得使用者的行事曆設定；第一次取得時建立同步網址的 token。 */
export function getCalendarSettings(db: DatabaseSync, userId: number): CalendarSettings {
  db.prepare(
    `INSERT INTO user_calendar_settings (user_id, feed_token) VALUES (?, ?)
    ON CONFLICT (user_id) DO NOTHING`,
  ).run(userId, newFeedToken());
  const row = db
    .prepare('SELECT feed_token, email_notifications FROM user_calendar_settings WHERE user_id = ?')
    .get(userId);
  if (!row) throw new Error('行事曆設定儲存結果無效');
  return {
    feedToken: String(row.feed_token),
    emailNotifications: Number(row.email_notifications) === 1,
  };
}

/** 換一個新的同步網址，舊網址立即失效。 */
export function resetFeedToken(db: DatabaseSync, userId: number): CalendarSettings {
  getCalendarSettings(db, userId);
  db.prepare(
    `UPDATE user_calendar_settings SET feed_token = ?, updated_at = datetime('now')
    WHERE user_id = ?`,
  ).run(newFeedToken(), userId);
  return getCalendarSettings(db, userId);
}

export function setEmailNotifications(
  db: DatabaseSync,
  userId: number,
  enabled: boolean,
): CalendarSettings {
  getCalendarSettings(db, userId);
  db.prepare(
    `UPDATE user_calendar_settings SET email_notifications = ?, updated_at = datetime('now')
    WHERE user_id = ?`,
  ).run(enabled ? 1 : 0, userId);
  return getCalendarSettings(db, userId);
}

/** 依同步網址的 token 找出使用者；token 不存在時回傳 undefined。 */
export function findUserIdByFeedToken(db: DatabaseSync, token: string): number | undefined {
  const row = db
    .prepare('SELECT user_id FROM user_calendar_settings WHERE feed_token = ?')
    .get(token);
  return row ? Number(row.user_id) : undefined;
}

/** 單一活動（供下載 .ics）；活動不存在、未發布或來源未核准時回傳 undefined。 */
export function findCalendarEvent(db: DatabaseSync, eventId: number): CalendarEvent | undefined {
  const row = db
    .prepare(
      `SELECT e.id, e.title, e.description, e.start_time, e.end_time, e.all_day, e.location,
        e.registration_url, e.original_url, e.created_at, e.updated_at
      FROM published_events e
      JOIN sources s ON s.id = e.source_id
      WHERE e.id = ? AND s.review_status = ?`,
    )
    .get(eventId, APPROVED);
  if (!row) return undefined;
  return {
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
  };
}
