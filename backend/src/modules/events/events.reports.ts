import type { DatabaseSync } from 'node:sqlite';
import { taipeiNow } from './events.dates.js';

/** #65 留言檢舉原因；前端 CommentReportDialog 使用同一組代碼 */
export const REPORT_REASONS = ['spam', 'abusive', 'off_topic', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** 補充說明上限（字元數，以 trim 後計算） */
export const REPORT_NOTE_MAX_LENGTH = 500;

export type ReviewAction = 'hide' | 'dismiss';

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

export type CreateReportResult =
  { ok: true } | { ok: false; error: 'comment_not_found' | 'own_comment' | 'already_reported' };

/**
 * 檢舉留言；留言須屬於該活動且未被隱藏或刪除，不能檢舉自己的留言，同一人對同一則只能檢舉一次。
 * #87 例外：檢舉已結案（駁回）且留言在結案後又被編輯過時，同一人可以重新檢舉，
 * 原本那筆檢舉改回待審並換成新的原因與說明，避免被檢舉者在駁回後把內容改回去。
 * reason 與 note 須先驗證。
 */
export function createCommentReport(
  db: DatabaseSync,
  input: {
    eventId: number;
    commentId: number;
    reporterId: number;
    reason: ReportReason;
    note: string | null;
  },
  now = new Date(),
): CreateReportResult {
  const comment = db
    .prepare(
      `SELECT user_id, edited_at FROM event_comments
      WHERE id = ? AND event_id = ? AND hidden_at IS NULL AND deleted_at IS NULL`,
    )
    .get(input.commentId, input.eventId);
  if (!comment) return { ok: false, error: 'comment_not_found' };
  if (Number(comment.user_id) === input.reporterId) return { ok: false, error: 'own_comment' };
  const inserted = db
    .prepare(
      `INSERT INTO comment_reports (comment_id, reporter_id, reason, note, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (comment_id, reporter_id) DO NOTHING
      RETURNING id`,
    )
    .get(input.commentId, input.reporterId, input.reason, input.note, taipeiNow(now));
  if (inserted) return { ok: true };
  const editedAt = comment.edited_at === null ? null : String(comment.edited_at);
  if (editedAt === null) return { ok: false, error: 'already_reported' };
  // 時間皆為 +08:00 的 ISO 字串，可直接比較
  const reopened = db
    .prepare(
      `UPDATE comment_reports
      SET reason = ?, note = ?, status = 'pending', created_at = ?, reviewed_by = NULL, reviewed_at = NULL
      WHERE comment_id = ? AND reporter_id = ? AND status != 'pending' AND reviewed_at < ?`,
    )
    .run(input.reason, input.note, taipeiNow(now), input.commentId, input.reporterId, editedAt);
  return Number(reopened.changes) > 0 ? { ok: true } : { ok: false, error: 'already_reported' };
}

/** 管理員審核頁的一筆：一則被檢舉的留言與它所有待審的檢舉 */
export interface ReportedComment {
  comment: {
    id: number;
    content: string;
    /** Asia/Taipei ISO 8601 */
    createdAt: string;
    author: { id: number; displayName: string };
  };
  event: { id: number; title: string };
  reportCount: number;
  /** 各原因的檢舉次數 */
  reasons: Partial<Record<ReportReason, number>>;
  /** 檢舉者填寫的補充說明（不含檢舉者身分） */
  notes: string[];
  /** 最早一筆待審檢舉的時間 */
  firstReportedAt: string;
}

/** 列出有待審檢舉的留言，依最早被檢舉的時間排序；留言者已自行刪除的留言（#79）不列出。 */
export function listPendingReports(db: DatabaseSync): ReportedComment[] {
  const rows = db
    .prepare(
      `SELECT r.comment_id, r.reason, r.note, r.created_at,
        c.content, c.created_at AS comment_created_at, c.event_id,
        u.id AS author_id, u.display_name, e.title AS event_title
      FROM comment_reports r
      JOIN event_comments c ON c.id = r.comment_id
      JOIN users u ON u.id = c.user_id
      JOIN events e ON e.id = c.event_id
      WHERE r.status = 'pending' AND c.deleted_at IS NULL
      ORDER BY r.created_at, r.id`,
    )
    .all();
  const byComment = new Map<number, ReportedComment>();
  for (const row of rows) {
    const commentId = Number(row.comment_id);
    let item = byComment.get(commentId);
    if (!item) {
      item = {
        comment: {
          id: commentId,
          content: String(row.content),
          createdAt: String(row.comment_created_at),
          author: { id: Number(row.author_id), displayName: String(row.display_name) },
        },
        event: { id: Number(row.event_id), title: String(row.event_title ?? '') },
        reportCount: 0,
        reasons: {},
        notes: [],
        firstReportedAt: String(row.created_at),
      };
      byComment.set(commentId, item);
    }
    const reason = String(row.reason) as ReportReason;
    item.reportCount += 1;
    item.reasons[reason] = (item.reasons[reason] ?? 0) + 1;
    if (row.note) item.notes.push(String(row.note));
  }
  return [...byComment.values()];
}

/**
 * 審核一則留言的所有待審檢舉：hide 隱藏留言，dismiss 駁回檢舉。
 * 該留言沒有待審檢舉時回傳 false。
 */
export function reviewCommentReports(
  db: DatabaseSync,
  input: { commentId: number; action: ReviewAction; reviewerId: number },
  now = new Date(),
): boolean {
  const reviewedAt = taipeiNow(now);
  const status = input.action === 'hide' ? 'hidden' : 'dismissed';
  const updated = db
    .prepare(
      `UPDATE comment_reports SET status = ?, reviewed_by = ?, reviewed_at = ?
      WHERE comment_id = ? AND status = 'pending'`,
    )
    .run(status, input.reviewerId, reviewedAt, input.commentId);
  if (Number(updated.changes) === 0) return false;
  if (input.action === 'hide') {
    db.prepare(
      'UPDATE event_comments SET hidden_at = ?, hidden_by = ? WHERE id = ? AND hidden_at IS NULL',
    ).run(reviewedAt, input.reviewerId, input.commentId);
  }
  return true;
}
