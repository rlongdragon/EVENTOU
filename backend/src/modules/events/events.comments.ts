import type { DatabaseSync } from 'node:sqlite';
import type { Role } from '../auth/roles.js';
import { taipeiNow } from './events.dates.js';

/** 留言內容上限（字元數，以 trim 後計算） */
export const COMMENT_MAX_LENGTH = 1000;

/** 頂層留言的排序方式；回覆一律由舊到新 */
export const COMMENT_SORTS = ['oldest', 'newest', 'top'] as const;
export type CommentSort = (typeof COMMENT_SORTS)[number];

export function isCommentSort(value: unknown): value is CommentSort {
  return typeof value === 'string' && (COMMENT_SORTS as readonly string[]).includes(value);
}

/**
 * US-10：活動留言；只公開留言者的 id 與顯示名稱，不含 email。
 * #79：可編輯、刪除、按讚與一層回覆。被刪除或隱藏的頂層留言若仍有回覆，以 removed 佔位
 * （content、author 為 null），回覆照常顯示；沒有回覆的則不列出。
 */
export interface EventComment {
  id: number;
  /** 回覆的上層留言；頂層留言為 null */
  parentId: number | null;
  content: string | null;
  /** Asia/Taipei ISO 8601 */
  createdAt: string;
  /** 最後一次編輯的時間；未編輯為 null */
  editedAt: string | null;
  /** role 用來顯示管理員徽章（#100），由 users.role 決定，與顯示名稱無關 */
  author: { id: number; displayName: string; role: Role } | null;
  /** 留言者目前對這個活動的評分（US-11，1–5）；未評分為 null。改分數後舊留言也顯示新分數 */
  rating: number | null;
  likeCount: number;
  /** 目前登入者是否按過讚；訪客一律 false */
  likedByMe: boolean;
  /** 已被留言者刪除或被管理員隱藏，只是為了保留回覆的位置 */
  removed: boolean;
  /** 頂層留言的回覆，由舊到新；回覆本身一律為空陣列 */
  replies: EventComment[];
}

export interface EventCommentList {
  comments: EventComment[];
  /** 對外顯示的留言數（含回覆，不含已刪除或隱藏的佔位） */
  total: number;
}

const SELECT_COMMENT = `
  SELECT c.id, c.parent_id, c.content, c.created_at, c.edited_at,
    (c.deleted_at IS NOT NULL OR c.hidden_at IS NOT NULL) AS removed,
    u.id AS user_id, u.display_name, u.role, r.score AS rating,
    (SELECT count(*) FROM comment_likes l WHERE l.comment_id = c.id) AS like_count,
    EXISTS (
      SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = :viewerId
    ) AS liked_by_me
  FROM event_comments c JOIN users u ON u.id = c.user_id
  LEFT JOIN event_ratings r ON r.event_id = c.event_id AND r.user_id = c.user_id`;

function toComment(row: Record<string, unknown>): EventComment {
  const removed = Boolean(row.removed);
  return {
    id: Number(row.id),
    parentId: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
    content: removed ? null : String(row.content),
    createdAt: String(row.created_at),
    editedAt: removed || row.edited_at === null ? null : String(row.edited_at),
    author: removed
      ? null
      : {
          id: Number(row.user_id),
          displayName: String(row.display_name),
          role: String(row.role) as Role,
        },
    rating: removed || row.rating === null || row.rating === undefined ? null : Number(row.rating),
    likeCount: removed ? 0 : Number(row.like_count),
    likedByMe: !removed && Boolean(row.liked_by_me),
    removed,
    replies: [],
  };
}

function compareComments(sort: CommentSort) {
  const byTime = (a: EventComment, b: EventComment) =>
    a.createdAt === b.createdAt ? a.id - b.id : a.createdAt < b.createdAt ? -1 : 1;
  if (sort === 'oldest') return byTime;
  if (sort === 'newest') return (a: EventComment, b: EventComment) => byTime(b, a);
  return (a: EventComment, b: EventComment) => b.likeCount - a.likeCount || byTime(b, a);
}

/** 驗證留言內容，回傳錯誤訊息；合法時回傳 undefined。 */
export function validateCommentContent(content: string): string | undefined {
  if (!content) return '請輸入留言內容';
  if (content.length > COMMENT_MAX_LENGTH) return `留言不可超過 ${COMMENT_MAX_LENGTH} 個字元`;
  return undefined;
}

/** 列出活動的留言：頂層依 sort 排序並附上回覆；已刪除或隱藏的回覆不列出。 */
export function listEventComments(
  db: DatabaseSync,
  eventId: number,
  options: { viewerId?: number | null; sort?: CommentSort } = {},
): EventCommentList {
  const rows = db
    .prepare(`${SELECT_COMMENT} WHERE c.event_id = :eventId`)
    .all({ eventId, viewerId: options.viewerId ?? null })
    .map(toComment);
  const repliesByParent = new Map<number, EventComment[]>();
  for (const reply of rows) {
    if (reply.parentId === null || reply.removed) continue;
    const list = repliesByParent.get(reply.parentId) ?? [];
    list.push(reply);
    repliesByParent.set(reply.parentId, list);
  }
  const oldestFirst = compareComments('oldest');
  const comments: EventComment[] = [];
  let total = 0;
  for (const comment of rows) {
    if (comment.parentId !== null) continue;
    const replies = (repliesByParent.get(comment.id) ?? []).sort(oldestFirst);
    if (comment.removed && replies.length === 0) continue;
    comments.push({ ...comment, replies });
    total += (comment.removed ? 0 : 1) + replies.length;
  }
  comments.sort(compareComments(options.sort ?? 'oldest'));
  return { comments, total };
}

/** 讀取單一則留言（含已刪除的佔位），供新增與編輯後回傳；不含回覆。 */
export function getEventComment(
  db: DatabaseSync,
  commentId: number,
  viewerId: number | null = null,
): EventComment | undefined {
  const row = db.prepare(`${SELECT_COMMENT} WHERE c.id = :commentId`).get({ commentId, viewerId });
  return row ? toComment(row) : undefined;
}

interface CommentRow {
  userId: number;
  parentId: number | null;
  removed: boolean;
}

/** 活動底下的一則留言（不論是否已刪除）；不屬於該活動時回傳 undefined。 */
function findComment(db: DatabaseSync, eventId: number, commentId: number): CommentRow | undefined {
  const row = db
    .prepare(
      `SELECT user_id, parent_id, (deleted_at IS NOT NULL OR hidden_at IS NOT NULL) AS removed
      FROM event_comments WHERE id = ? AND event_id = ?`,
    )
    .get(commentId, eventId);
  if (!row) return undefined;
  return {
    userId: Number(row.user_id),
    parentId: row.parent_id === null ? null : Number(row.parent_id),
    removed: Boolean(row.removed),
  };
}

/**
 * 回覆要掛在哪一則頂層留言下：回覆「回覆」時掛到同一則頂層留言（只有一層回覆）。
 * 留言不存在、不屬於該活動或已被刪除／隱藏時回傳 undefined。
 */
export function resolveReplyParent(
  db: DatabaseSync,
  eventId: number,
  commentId: number,
): number | undefined {
  const comment = findComment(db, eventId, commentId);
  if (!comment || comment.removed) return undefined;
  if (comment.parentId === null) return commentId;
  const parent = findComment(db, eventId, comment.parentId);
  return parent && !parent.removed ? comment.parentId : undefined;
}

/** 新增留言或回覆；content 須先經 validateCommentContent 驗證，parentId 須先經 resolveReplyParent。 */
export function createEventComment(
  db: DatabaseSync,
  input: { eventId: number; userId: number; content: string; parentId?: number | null },
  now = new Date(),
): EventComment {
  const inserted = db
    .prepare(
      `INSERT INTO event_comments (event_id, user_id, content, created_at, parent_id)
      VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(input.eventId, input.userId, input.content, taipeiNow(now), input.parentId ?? null);
  const comment = getEventComment(db, Number(inserted?.id), input.userId);
  if (!comment) throw new Error('留言儲存結果無效');
  return comment;
}

export type CommentChangeResult =
  | { ok: true; comment: EventComment }
  | { ok: false; error: 'not_found' | 'forbidden' | 'under_review' };

/** 留言是否有待審的檢舉（#65）。 */
function hasPendingReports(db: DatabaseSync, commentId: number): boolean {
  return Boolean(
    db
      .prepare("SELECT 1 FROM comment_reports WHERE comment_id = ? AND status = 'pending' LIMIT 1")
      .get(commentId),
  );
}

/**
 * 留言者編輯自己的留言；content 須先驗證。已刪除或隱藏的留言視為不存在。
 * #87 有待審檢舉時不能編輯（under_review），避免把內容改成無害來躲過審核；
 * 檢舉結案後再編輯的話，原檢舉人可以重新檢舉（見 events.reports.ts 的 createCommentReport）。
 */
export function updateEventComment(
  db: DatabaseSync,
  input: { eventId: number; commentId: number; userId: number; content: string },
  now = new Date(),
): CommentChangeResult {
  const comment = findComment(db, input.eventId, input.commentId);
  if (!comment || comment.removed) return { ok: false, error: 'not_found' };
  if (comment.userId !== input.userId) return { ok: false, error: 'forbidden' };
  if (hasPendingReports(db, input.commentId)) return { ok: false, error: 'under_review' };
  db.prepare('UPDATE event_comments SET content = ?, edited_at = ? WHERE id = ?').run(
    input.content,
    taipeiNow(now),
    input.commentId,
  );
  const updated = getEventComment(db, input.commentId, input.userId);
  if (!updated) throw new Error('留言儲存結果無效');
  return { ok: true, comment: updated };
}

/**
 * 刪除留言：留言者刪除自己的留言記為 deleted_at；管理員刪除別人的留言等同隱藏
 * （hidden_at／hidden_by），該留言的待審檢舉一併以「已隱藏」結案。
 */
export function deleteEventComment(
  db: DatabaseSync,
  input: { eventId: number; commentId: number; user: { id: number; role: string } },
  now = new Date(),
): { ok: true } | { ok: false; error: 'not_found' | 'forbidden' } {
  const comment = findComment(db, input.eventId, input.commentId);
  if (!comment || comment.removed) return { ok: false, error: 'not_found' };
  const at = taipeiNow(now);
  if (comment.userId === input.user.id) {
    db.prepare('UPDATE event_comments SET deleted_at = ? WHERE id = ?').run(at, input.commentId);
    return { ok: true };
  }
  if (input.user.role !== 'admin') return { ok: false, error: 'forbidden' };
  // 隱藏留言與結案檢舉要一起成功，避免留言已隱藏但檢舉仍是待審（#87）
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE event_comments SET hidden_at = ?, hidden_by = ? WHERE id = ?').run(
      at,
      input.user.id,
      input.commentId,
    );
    db.prepare(
      `UPDATE comment_reports SET status = 'hidden', reviewed_by = ?, reviewed_at = ?
      WHERE comment_id = ? AND status = 'pending'`,
    ).run(input.user.id, at, input.commentId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { ok: true };
}

/** 按讚或取消讚（可重複呼叫）；留言不存在或已刪除時回傳 undefined。 */
export function setCommentLike(
  db: DatabaseSync,
  input: { eventId: number; commentId: number; userId: number; liked: boolean },
  now = new Date(),
): { likeCount: number; likedByMe: boolean } | undefined {
  const comment = findComment(db, input.eventId, input.commentId);
  if (!comment || comment.removed) return undefined;
  if (input.liked) {
    db.prepare(
      `INSERT INTO comment_likes (comment_id, user_id, created_at) VALUES (?, ?, ?)
      ON CONFLICT (comment_id, user_id) DO NOTHING`,
    ).run(input.commentId, input.userId, taipeiNow(now));
  } else {
    db.prepare('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?').run(
      input.commentId,
      input.userId,
    );
  }
  const row = db
    .prepare('SELECT count(*) AS n FROM comment_likes WHERE comment_id = ?')
    .get(input.commentId);
  return { likeCount: Number(row?.n ?? 0), likedByMe: input.liked };
}
