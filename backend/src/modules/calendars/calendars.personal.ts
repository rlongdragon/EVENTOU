import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { normalizeText } from '../events/events.cleaner.js';
import { taipeiNow } from '../events/events.dates.js';
import type { EventCategory } from '../events/events.types.js';
import { EVENT_CATEGORIES } from '../events/events.types.js';

// US-09 個人行事曆：使用者以「類別＋標籤」的條件組合建立多個行事曆。
// 行事曆只存條件，不另存活動，活動每次都從 published_events 依條件查詢，所以新活動會自動出現。

export const CALENDAR_NAME_MAX_LENGTH = 50;
export const CALENDAR_TAG_MAX_LENGTH = 30;
/** 每個行事曆最多幾個標籤條件 */
export const CALENDAR_MAX_TAGS = 20;
/** 每位使用者最多幾個個人行事曆 */
export const MAX_CALENDARS_PER_USER = 20;

export interface PersonalCalendar {
  id: number;
  name: string;
  /** 類別條件，依 EVENT_CATEGORIES 的順序 */
  categories: EventCategory[];
  /** 標籤條件，依字母排序 */
  tags: string[];
  /** iCal 訂閱網址的路徑（不含網站位址），任何拿到網址的人都能讀取 */
  icsPath: string;
  createdAt: string;
  updatedAt: string;
}

/** 建立或修改行事曆時的輸入（已驗證） */
export interface PersonalCalendarInput {
  name: string;
  categories: EventCategory[];
  tags: string[];
}

export type ValidationResult =
  { ok: true; value: PersonalCalendarInput } | { ok: false; fields: Record<string, string> };

function isEventCategory(value: unknown): value is EventCategory {
  return EVENT_CATEGORIES.some((category) => category === value);
}

/** 驗證 API 傳入的行事曆名稱與條件；標籤用與活動相同的 normalizeText 正規化，才比對得到。 */
export function validateCalendarInput(body: unknown): ValidationResult {
  const input = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) fields.name = '請輸入行事曆名稱';
  else if (name.length > CALENDAR_NAME_MAX_LENGTH) {
    fields.name = `名稱不可超過 ${CALENDAR_NAME_MAX_LENGTH} 個字元`;
  }

  const rawCategories = input.categories ?? [];
  let categories: EventCategory[] = [];
  if (!Array.isArray(rawCategories) || !rawCategories.every(isEventCategory)) {
    fields.categories = '類別不正確';
  } else {
    categories = EVENT_CATEGORIES.filter((category) => rawCategories.includes(category));
  }

  const rawTags = input.tags ?? [];
  let tags: string[] = [];
  if (!Array.isArray(rawTags) || !rawTags.every((tag) => typeof tag === 'string')) {
    fields.tags = '標籤不正確';
  } else {
    tags = [...new Set(rawTags.map(normalizeText).filter(Boolean))].sort();
    if (tags.some((tag) => tag.length > CALENDAR_TAG_MAX_LENGTH)) {
      fields.tags = `每個標籤不可超過 ${CALENDAR_TAG_MAX_LENGTH} 個字元`;
    } else if (tags.length > CALENDAR_MAX_TAGS) {
      fields.tags = `最多選擇 ${CALENDAR_MAX_TAGS} 個標籤`;
    }
  }

  if (!fields.categories && !fields.tags && categories.length === 0 && tags.length === 0) {
    fields.categories = '請至少選擇一個類別或標籤';
  }

  return Object.keys(fields).length > 0
    ? { ok: false, fields }
    : { ok: true, value: { name, categories, tags } };
}

export function personalIcsPath(token: string): string {
  return `/api/calendars/personal/${token}.ics`;
}

function readConditions(db: DatabaseSync, calendarId: number) {
  const categories = db
    .prepare('SELECT category FROM personal_calendar_categories WHERE calendar_id = ?')
    .all(calendarId)
    .map((row) => String(row.category));
  const tags = db
    .prepare('SELECT tag FROM personal_calendar_tags WHERE calendar_id = ? ORDER BY tag')
    .all(calendarId)
    .map((row) => String(row.tag));
  return {
    // 類別已從 EVENT_CATEGORIES 移除時直接略過，不讓舊條件造成錯誤
    categories: EVENT_CATEGORIES.filter((category) => categories.includes(category)),
    tags,
  };
}

function toCalendar(db: DatabaseSync, row: Record<string, unknown>): PersonalCalendar {
  const id = Number(row.id);
  return {
    id,
    name: String(row.name),
    ...readConditions(db, id),
    icsPath: personalIcsPath(String(row.token)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function writeConditions(db: DatabaseSync, calendarId: number, input: PersonalCalendarInput) {
  db.prepare('DELETE FROM personal_calendar_categories WHERE calendar_id = ?').run(calendarId);
  db.prepare('DELETE FROM personal_calendar_tags WHERE calendar_id = ?').run(calendarId);
  const insertCategory = db.prepare(
    'INSERT INTO personal_calendar_categories (calendar_id, category) VALUES (?, ?)',
  );
  for (const category of input.categories) insertCategory.run(calendarId, category);
  const insertTag = db.prepare(
    'INSERT INTO personal_calendar_tags (calendar_id, tag) VALUES (?, ?)',
  );
  for (const tag of input.tags) insertTag.run(calendarId, tag);
}

/** 在交易中執行，失敗時回復，避免行事曆只寫入一半的條件。 */
function inTransaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec('BEGIN');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** 列出使用者自己的行事曆，依建立順序。 */
export function listPersonalCalendars(db: DatabaseSync, userId: number): PersonalCalendar[] {
  return db
    .prepare('SELECT * FROM personal_calendars WHERE user_id = ? ORDER BY id')
    .all(userId)
    .map((row) => toCalendar(db, row));
}

/** 取得使用者自己的某個行事曆；不存在或屬於別人時回傳 undefined。 */
export function getPersonalCalendar(
  db: DatabaseSync,
  userId: number,
  calendarId: number,
): PersonalCalendar | undefined {
  const row = db
    .prepare('SELECT * FROM personal_calendars WHERE id = ? AND user_id = ?')
    .get(calendarId, userId);
  return row ? toCalendar(db, row) : undefined;
}

/** 依訂閱 token 取得行事曆（iCal 訂閱用，不需登入）。 */
export function findPersonalCalendarByToken(
  db: DatabaseSync,
  token: string,
): PersonalCalendar | undefined {
  const row = db.prepare('SELECT * FROM personal_calendars WHERE token = ?').get(token);
  return row ? toCalendar(db, row) : undefined;
}

/** 建立行事曆；已達 MAX_CALENDARS_PER_USER 時回傳 'limit_reached'。 */
export function createPersonalCalendar(
  db: DatabaseSync,
  userId: number,
  input: PersonalCalendarInput,
  now = new Date(),
): PersonalCalendar | 'limit_reached' {
  return inTransaction(db, () => {
    const count = db
      .prepare('SELECT COUNT(*) AS count FROM personal_calendars WHERE user_id = ?')
      .get(userId);
    if (Number(count?.count) >= MAX_CALENDARS_PER_USER) return 'limit_reached';
    const timestamp = taipeiNow(now);
    const inserted = db
      .prepare(
        `INSERT INTO personal_calendars (user_id, name, token, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(userId, input.name, randomBytes(24).toString('base64url'), timestamp, timestamp);
    const calendarId = Number(inserted?.id);
    writeConditions(db, calendarId, input);
    const calendar = getPersonalCalendar(db, userId, calendarId);
    if (!calendar) throw new Error('行事曆儲存結果無效');
    return calendar;
  });
}

/** 修改自己的行事曆名稱與條件；不存在或屬於別人時回傳 undefined。訂閱網址不變。 */
export function updatePersonalCalendar(
  db: DatabaseSync,
  userId: number,
  calendarId: number,
  input: PersonalCalendarInput,
  now = new Date(),
): PersonalCalendar | undefined {
  return inTransaction(db, () => {
    const result = db
      .prepare(
        'UPDATE personal_calendars SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      )
      .run(input.name, taipeiNow(now), calendarId, userId);
    if (Number(result.changes) === 0) return undefined;
    writeConditions(db, calendarId, input);
    return getPersonalCalendar(db, userId, calendarId);
  });
}

/** 刪除自己的行事曆，回傳是否有刪除；刪除後訂閱網址失效。 */
export function deletePersonalCalendar(
  db: DatabaseSync,
  userId: number,
  calendarId: number,
): boolean {
  const result = db
    .prepare('DELETE FROM personal_calendars WHERE id = ? AND user_id = ?')
    .run(calendarId, userId);
  return Number(result.changes) > 0;
}
