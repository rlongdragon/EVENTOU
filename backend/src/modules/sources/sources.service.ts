import { getDb } from '../../db/index.js';
import type { ReviewStatus, SourceType } from './sourceTypes.js';

export interface Source {
  id: number;
  name: string;
  url: string;
  type: SourceType;
  /** 審核狀態；只有「已核准且啟用中」的來源才會被擷取 */
  reviewStatus: ReviewStatus;
  /** 啟用狀態，與審核狀態獨立（US-16 切換） */
  enabled: boolean;
  /** 提交者的 users.id */
  submittedBy: number;
  createdAt: string;
}

interface SourceRow {
  id: number;
  name: string;
  url: string;
  type: SourceType;
  review_status: ReviewStatus;
  enabled: number;
  submitted_by: number;
  created_at: string;
}

function toSource(row: SourceRow): Source {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    type: row.type,
    reviewStatus: row.review_status,
    enabled: row.enabled === 1,
    submittedBy: row.submitted_by,
    createdAt: row.created_at,
  };
}

/** 建立新來源，審核狀態固定為待審核（pending），不會進入擷取流程。 */
export function createSource(input: {
  name: string;
  url: string;
  type: SourceType;
  submittedBy: number;
}): Source {
  const row = getDb()
    .prepare('INSERT INTO sources (name, url, type, submitted_by) VALUES (?, ?, ?, ?) RETURNING *')
    .get(input.name, input.url, input.type, input.submittedBy) as unknown as SourceRow;
  return toSource(row);
}

/** 列出某位使用者提交的來源，新的在前。 */
export function listSourcesBySubmitter(userId: number): Source[] {
  const rows = getDb()
    .prepare('SELECT * FROM sources WHERE submitted_by = ? ORDER BY created_at DESC, id DESC')
    .all(userId) as unknown as SourceRow[];
  return rows.map(toSource);
}

/** 列出來源，approvedOnly 為 true 時只回傳已核准的來源。 */
export function listSources(options: { approvedOnly: boolean }): Source[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM sources
       WHERE (? = 0 OR review_status = 'approved')
       ORDER BY created_at DESC, id DESC`,
    )
    .all(options.approvedOnly ? 1 : 0) as unknown as SourceRow[];
  return rows.map(toSource);
}

/** 管理員看到的來源：多了提交者名稱與審核結果。 */
export interface AdminSource extends Source {
  submitterName: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** 管理員是否確認來源為海大單位或社團；尚未審核為 null */
  ntouVerified: boolean | null;
}

interface AdminSourceRow extends SourceRow {
  submitter_name: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_note: string | null;
  ntou_verified: number | null;
}

function toAdminSource(row: AdminSourceRow): AdminSource {
  return {
    ...toSource(row),
    submitterName: row.submitter_name,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    ntouVerified: row.ntou_verified === null ? null : row.ntou_verified === 1,
  };
}

const ADMIN_SELECT = `
  SELECT sources.*, users.display_name AS submitter_name
  FROM sources JOIN users ON users.id = sources.submitted_by`;

/** 管理員列出來源，可只看某個審核狀態，新的在前。 */
export function listSourcesForAdmin(options: { reviewStatus?: ReviewStatus } = {}): AdminSource[] {
  const rows = getDb()
    .prepare(
      `${ADMIN_SELECT}
       WHERE (? IS NULL OR sources.review_status = ?)
       ORDER BY sources.created_at DESC, sources.id DESC`,
    )
    .all(options.reviewStatus ?? null, options.reviewStatus ?? null) as unknown as AdminSourceRow[];
  return rows.map(toAdminSource);
}

export interface ReviewInput {
  sourceId: number;
  reviewerId: number;
  decision: 'approved' | 'rejected';
  ntouVerified: boolean;
  note: string | null;
}

/**
 * 審核待審核的來源並保存結果。只有 pending 的來源能審核，
 * 已核准或已退回的來源回傳 'already_reviewed'，找不到回傳 'not_found'。
 * 審核不會改變 enabled（啟用狀態由 US-16 管理）。
 */
export function reviewSource(input: ReviewInput): AdminSource | 'not_found' | 'already_reviewed' {
  const db = getDb();
  const updated = db
    .prepare(
      `UPDATE sources
       SET review_status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
           review_note = ?, ntou_verified = ?
       WHERE id = ? AND review_status = 'pending'
       RETURNING id`,
    )
    .get(input.decision, input.reviewerId, input.note, input.ntouVerified ? 1 : 0, input.sourceId);

  if (!updated) {
    const exists = db.prepare('SELECT 1 FROM sources WHERE id = ?').get(input.sourceId);
    return exists ? 'already_reviewed' : 'not_found';
  }
  const row = db
    .prepare(`${ADMIN_SELECT} WHERE sources.id = ?`)
    .get(input.sourceId) as unknown as AdminSourceRow;
  return toAdminSource(row);
}
