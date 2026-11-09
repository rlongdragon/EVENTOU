import { ApiError } from '../auth/api';

// 與 backend/src/modules/sources/sourceTypes.ts 保持一致
export const SOURCE_TYPE_OPTIONS = [
  { value: 'school_site', label: '學校網站' },
  { value: 'department_site', label: '系所／處室網站' },
  { value: 'club_site', label: '社團網站' },
  { value: 'social_media', label: '社群平台（如 Instagram）' },
  { value: 'other', label: '其他' },
] as const;

export type SourceType = (typeof SOURCE_TYPE_OPTIONS)[number]['value'];

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Source {
  id: number;
  name: string;
  url: string;
  type: SourceType;
  reviewStatus: ReviewStatus;
  enabled: boolean;
  submittedBy: number;
  createdAt: string;
  /** 一般使用者只看到已核准來源的風險等級；未核准為 null，剛提交的來源沒有此欄位（US-15） */
  risk?: { level: RiskLevel } | null;
}

// 與 backend/src/modules/sources/sources.risk.ts 保持一致（US-15）
export type RiskLevel = 'low' | 'medium' | 'high';

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: '低風險',
  medium: '中風險',
  high: '高風險',
};

export type RiskReasonCode =
  | 'review_rejected'
  | 'review_pending'
  | 'not_https'
  | 'disabled'
  | 'latest_run_failed'
  | 'consecutive_failures'
  | 'high_failure_rate'
  | 'elevated_failure_rate'
  | 'no_ingestion_history';

export interface RiskReason {
  code: RiskReasonCode;
  points: number;
  message: string;
}

/** 來源風險評估；只是提示，不會改變審核或啟用狀態。 */
export interface SourceRisk {
  level: RiskLevel;
  score: number;
  /** 依分數由高到低，第一筆為主要原因 */
  reasons: RiskReason[];
  recentRuns: number;
  recentFailures: number;
}

/** 管理員看到的來源：多了提交者名稱、審核結果（US-14）與風險評估（US-15）。 */
export interface AdminSource extends Source {
  risk: SourceRisk;
  submitterName: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** 是否確認為海大單位或社團；尚未審核為 null */
  ntouVerified: boolean | null;
}

export interface ReviewSourceInput {
  decision: 'approved' | 'rejected';
  ntouVerified: boolean;
  note: string;
}

export interface SubmitSourceInput {
  name: string;
  url: string;
  type: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? 'unknown_error',
      body?.message ?? `HTTP ${response.status}`,
      body?.fields,
    );
  }
  return body as T;
}

/** 提交新的活動資訊來源，成功後狀態為待審核。 */
export async function submitSource(input: SubmitSourceInput): Promise<Source> {
  const { source } = await request<{ source: Source }>('/api/sources', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return source;
}

/** 取得自己提交的來源（含審核狀態），新的在前。 */
export async function fetchMySources(signal?: AbortSignal): Promise<Source[]> {
  const { sources } = await request<{ sources: Source[] }>('/api/sources/mine', { signal });
  return sources;
}

/** 管理員取得來源清單，可只看某個審核狀態。 */
export async function fetchAdminSources(
  status?: ReviewStatus,
  signal?: AbortSignal,
): Promise<AdminSource[]> {
  const query = status ? `?status=${status}` : '';
  const { sources } = await request<{ sources: AdminSource[] }>(`/api/sources${query}`, { signal });
  return sources;
}

/** 管理員核准或退回待審核的來源。 */
export async function reviewSource(id: number, input: ReviewSourceInput): Promise<AdminSource> {
  const { source } = await request<{ source: AdminSource }>(`/api/sources/${id}/review`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return source;
}

/** 管理員啟用或停用已核准的來源。 */
export async function setSourceEnabled(id: number, enabled: boolean): Promise<AdminSource> {
  const { source } = await request<{ source: AdminSource }>(`/api/sources/${id}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
  return source;
}
