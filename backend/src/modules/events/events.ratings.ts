import type { DatabaseSync } from 'node:sqlite';
import { taipeiNow } from './events.dates.js';

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** US-11：活動的評價摘要 */
export interface EventRatingSummary {
  /** 平均分數，四捨五入到小數第一位；沒有評價時為 null */
  average: number | null;
  /** 評價人數 */
  count: number;
  /** 目前使用者的評分；訪客或尚未評分時為 null */
  myScore: number | null;
}

/** 分數須為 1–5 的整數，合法時回傳該分數，否則回傳 undefined。 */
export function parseRatingScore(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= RATING_MIN &&
    value <= RATING_MAX
    ? value
    : undefined;
}

/** 讀取活動的平均分數、評價人數，以及 userId 的評分（userId 為 undefined 表示訪客）。 */
export function getEventRatingSummary(
  db: DatabaseSync,
  eventId: number,
  userId?: number,
): EventRatingSummary {
  const row = db
    .prepare(
      'SELECT AVG(score) AS average, COUNT(*) AS count FROM event_ratings WHERE event_id = ?',
    )
    .get(eventId);
  const count = Number(row?.count ?? 0);
  const average = count > 0 ? Math.round(Number(row?.average) * 10) / 10 : null;
  const mine =
    userId === undefined
      ? undefined
      : db
          .prepare('SELECT score FROM event_ratings WHERE event_id = ? AND user_id = ?')
          .get(eventId, userId);
  return { average, count, myScore: mine ? Number(mine.score) : null };
}

/** 新增或修改使用者對活動的評分（每人每活動一筆），回傳更新後的摘要。 */
export function upsertEventRating(
  db: DatabaseSync,
  input: { eventId: number; userId: number; score: number },
  now = new Date(),
): EventRatingSummary {
  const timestamp = taipeiNow(now);
  db.prepare(
    `INSERT INTO event_ratings (event_id, user_id, score, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (event_id, user_id) DO UPDATE SET
      score = excluded.score, updated_at = excluded.updated_at`,
  ).run(input.eventId, input.userId, input.score, timestamp, timestamp);
  return getEventRatingSummary(db, input.eventId, input.userId);
}
