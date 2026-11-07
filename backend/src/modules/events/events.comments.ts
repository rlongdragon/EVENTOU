import type { DatabaseSync } from 'node:sqlite';
import { taipeiNow } from './events.dates.js';

/** 留言內容上限（字元數，以 trim 後計算） */
export const COMMENT_MAX_LENGTH = 1000;

/** US-10：活動留言；只公開留言者的 id 與顯示名稱，不含 email。 */
export interface EventComment {
  id: number;
  content: string;
  /** Asia/Taipei ISO 8601 */
  createdAt: string;
  author: { id: number; displayName: string };
}

const SELECT_COMMENT = `
  SELECT event_comments.id, event_comments.content, event_comments.created_at,
    users.id AS user_id, users.display_name
  FROM event_comments JOIN users ON users.id = event_comments.user_id`;

function toComment(row: Record<string, unknown>): EventComment {
  return {
    id: Number(row.id),
    content: String(row.content),
    createdAt: String(row.created_at),
    author: { id: Number(row.user_id), displayName: String(row.display_name) },
  };
}

/** 驗證留言內容，回傳錯誤訊息；合法時回傳 undefined。 */
export function validateCommentContent(content: string): string | undefined {
  if (!content) return '請輸入留言內容';
  if (content.length > COMMENT_MAX_LENGTH) return `留言不可超過 ${COMMENT_MAX_LENGTH} 個字元`;
  return undefined;
}

/** 列出活動的所有留言，依留言時間由舊到新排序。 */
export function listEventComments(db: DatabaseSync, eventId: number): EventComment[] {
  return db
    .prepare(
      `${SELECT_COMMENT}
      WHERE event_comments.event_id = ?
      ORDER BY event_comments.created_at, event_comments.id`,
    )
    .all(eventId)
    .map(toComment);
}

/** 新增留言；content 須先經 validateCommentContent 驗證。 */
export function createEventComment(
  db: DatabaseSync,
  input: { eventId: number; userId: number; content: string },
  now = new Date(),
): EventComment {
  const inserted = db
    .prepare(
      `INSERT INTO event_comments (event_id, user_id, content, created_at)
      VALUES (?, ?, ?, ?) RETURNING id`,
    )
    .get(input.eventId, input.userId, input.content, taipeiNow(now));
  const row = db.prepare(`${SELECT_COMMENT} WHERE event_comments.id = ?`).get(Number(inserted?.id));
  if (!row) throw new Error('留言儲存結果無效');
  return toComment(row);
}
