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
