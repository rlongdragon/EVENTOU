import { getDb } from '../../db/index.js';
import type { EventCategory } from '../events/events.types.js';
import { EVENT_CATEGORIES } from '../events/events.types.js';

/** 訂閱某類別的使用者，供 US-08 寄送通知使用。 */
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

/** US-08 的通知對象：目前訂閱該類別的使用者，取消訂閱後就不會出現。 */
export function listSubscribersByCategory(category: EventCategory): Subscriber[] {
  const rows = getDb()
    .prepare(
      `SELECT users.id, users.email, users.display_name
      FROM category_subscriptions
      JOIN users ON users.id = category_subscriptions.user_id
      WHERE category_subscriptions.category = ?
      ORDER BY users.id`,
    )
    .all(category);
  return rows.map((row) => ({
    userId: Number(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
  }));
}
