import { getDb } from '../../db/index.js';
import type { EventCategory } from '../events/events.types.js';
import { EVENT_CATEGORIES } from '../events/events.types.js';
import type { ReviewStatus } from '../sources/sourceTypes.js';

/** 新活動通知的收件人，供 US-08 寄送通知使用。 */
export interface Subscriber {
  userId: number;
  email: string;
  displayName: string;
}

export function isEventCategory(value: unknown): value is EventCategory {
  return EVENT_CATEGORIES.some((category) => category === value);
}

/** 使用者目前訂閱的類別；已從 EVENT_CATEGORIES 移除的類別不回傳。 */
export function listSubscribedCategories(userId: number): EventCategory[] {
  const rows = getDb()
    .prepare('SELECT category FROM category_subscriptions WHERE user_id = ?')
    .all(userId);
  const subscribed = new Set(rows.map((row) => String(row.category)));
  return EVENT_CATEGORIES.filter((category) => subscribed.has(category));
}

/** 訂閱類別；已訂閱時不會產生第二筆。 */
export function subscribeCategory(userId: number, category: EventCategory): void {
  getDb()
    .prepare(
      `INSERT INTO category_subscriptions (user_id, category) VALUES (?, ?)
      ON CONFLICT (user_id, category) DO NOTHING`,
    )
    .run(userId, category);
}

/** 取消訂閱；原本就沒訂閱時不做任何事。 */
export function unsubscribeCategory(userId: number, category: EventCategory): void {
  getDb()
    .prepare('DELETE FROM category_subscriptions WHERE user_id = ? AND category = ?')
    .run(userId, category);
}

const APPROVED: ReviewStatus = 'approved';

/** 可追蹤的來源（已核准）與使用者的追蹤狀態，依名稱排序。 */
export function listSourceFollows(
  userId: number,
): { id: number; name: string; type: string; followed: boolean }[] {
  return getDb()
    .prepare(
      `SELECT s.id, s.name, s.type, sf.user_id IS NOT NULL AS followed
      FROM sources s
      LEFT JOIN source_follows sf ON sf.source_id = s.id AND sf.user_id = ?
      WHERE s.review_status = ?
      ORDER BY s.name, s.id`,
    )
    .all(userId, APPROVED)
    .map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      type: String(row.type),
      followed: Number(row.followed) === 1,
    }));
}

/** 追蹤來源；已追蹤時不會產生第二筆。來源不存在或未核准時回傳 false。 */
export function followSource(userId: number, sourceId: number): boolean {
  const result = getDb()
    .prepare(
      `INSERT INTO source_follows (user_id, source_id)
      SELECT ?, id FROM sources WHERE id = ? AND review_status = ?
      ON CONFLICT (user_id, source_id) DO NOTHING`,
    )
    .run(userId, sourceId, APPROVED);
  if (Number(result.changes) > 0) return true;
  return (
    getDb()
      .prepare('SELECT 1 FROM source_follows WHERE user_id = ? AND source_id = ?')
      .get(userId, sourceId) !== undefined
  );
}

/** 取消追蹤來源；原本就沒追蹤時不做任何事。 */
export function unfollowSource(userId: number, sourceId: number): void {
  getDb()
    .prepare('DELETE FROM source_follows WHERE user_id = ? AND source_id = ?')
    .run(userId, sourceId);
}

/**
 * US-08 的通知對象：追蹤該活動的類別或來源、且沒有關閉 Email 通知的使用者。
 * 沒有行事曆設定資料列的使用者視為通知開啟；同一位使用者只會出現一次。
 */
export function listEventSubscribers(event: {
  category: EventCategory;
  sourceId: number;
}): Subscriber[] {
  const rows = getDb()
    .prepare(
      `SELECT users.id, users.email, users.display_name
      FROM users
      LEFT JOIN user_calendar_settings settings ON settings.user_id = users.id
      WHERE COALESCE(settings.email_notifications, 1) = 1
        AND (
          EXISTS (SELECT 1 FROM category_subscriptions cs
            WHERE cs.user_id = users.id AND cs.category = ?)
          OR EXISTS (SELECT 1 FROM source_follows sf
            WHERE sf.user_id = users.id AND sf.source_id = ?)
        )
      ORDER BY users.id`,
    )
    .all(event.category, event.sourceId);
  return rows.map((row) => ({
    userId: Number(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
  }));
}
