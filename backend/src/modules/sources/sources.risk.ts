import { getDb } from '../../db/index.js';
import type { ReviewStatus } from './sourceTypes.js';

// US-15 來源可信度／風險提示：規則式評估，每條規則命中時加上固定分數，
// 依總分分成低／中／高三級。風險只是提示，不會改變審核狀態或啟用狀態。
// 規則與門檻都定義在這裡，README 的「來源風險提示（US-15）」需同步更新。

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** 總分達到門檻就是該等級：0–19 低、20–49 中、50 以上高。 */
export const RISK_LEVEL_THRESHOLDS = { medium: 20, high: 50 } as const;

/** 只看最近幾次已結束（成功或失敗）的擷取紀錄。 */
export const RECENT_RUN_LIMIT = 10;
/** 計算失敗率至少需要的擷取次數，次數太少時不判斷失敗率。 */
export const MIN_RUNS_FOR_FAILURE_RATE = 3;
/** 連續失敗幾次以上視為無法正常存取。 */
export const CONSECUTIVE_FAILURE_THRESHOLD = 3;

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

/** 各規則命中時加的分數。 */
export const RISK_POINTS: Record<RiskReasonCode, number> = {
  review_rejected: 60,
  review_pending: 30,
  not_https: 20,
  latest_run_failed: 20,
  consecutive_failures: 30,
  high_failure_rate: 20,
  elevated_failure_rate: 10,
  disabled: 10,
  no_ingestion_history: 5,
};

export interface RiskReason {
  code: RiskReasonCode;
  points: number;
  message: string;
}

export interface SourceRisk {
  level: RiskLevel;
  score: number;
  /** 命中的規則，依分數由高到低排列，第一筆即主要原因 */
  reasons: RiskReason[];
  /** 納入評估的最近擷取次數與失敗次數 */
  recentRuns: number;
  recentFailures: number;
}

export interface RiskInput {
  url: string;
  reviewStatus: ReviewStatus;
  enabled: boolean;
  /** 最近已結束的擷取結果，新的在前 */
  recentRunStatuses: ('success' | 'failure')[];
}

export function riskLevelForScore(score: number): RiskLevel {
  if (score >= RISK_LEVEL_THRESHOLDS.high) return 'high';
  if (score >= RISK_LEVEL_THRESHOLDS.medium) return 'medium';
  return 'low';
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** 依規則評估單一來源的風險；純函式，方便測試。 */
export function assessSourceRisk(input: RiskInput): SourceRisk {
  const reasons: RiskReason[] = [];
  const add = (code: RiskReasonCode, message: string) =>
    reasons.push({ code, points: RISK_POINTS[code], message });

  if (input.reviewStatus === 'rejected') add('review_rejected', '已被管理員退回');
  if (input.reviewStatus === 'pending') add('review_pending', '尚未通過管理員審核');
  if (!isHttps(input.url)) add('not_https', '網址未使用 HTTPS');

  // 擷取相關規則只套用在已核准的來源；未核准的來源本來就不會被擷取
  const runs = input.recentRunStatuses.slice(0, RECENT_RUN_LIMIT);
  const failures = runs.filter((status) => status === 'failure').length;
  if (input.reviewStatus === 'approved') {
    if (!input.enabled) add('disabled', '目前已停用，不會被擷取');

    if (runs.length === 0) {
      add('no_ingestion_history', '尚無擷取紀錄，無法確認來源可正常存取');
    } else {
      let consecutive = 0;
      while (consecutive < runs.length && runs[consecutive] === 'failure') consecutive += 1;

      if (consecutive >= CONSECUTIVE_FAILURE_THRESHOLD) {
        add('consecutive_failures', `最近連續 ${consecutive} 次擷取失敗，來源可能無法存取`);
      } else if (consecutive > 0) {
        add('latest_run_failed', '最近一次擷取失敗');
      }

      if (runs.length >= MIN_RUNS_FOR_FAILURE_RATE) {
        const rate = failures / runs.length;
        const summary = `最近 ${runs.length} 次擷取有 ${failures} 次失敗`;
        if (rate >= 0.5) add('high_failure_rate', `${summary}，失敗率偏高`);
        else if (rate >= 0.2) add('elevated_failure_rate', `${summary}，偶有失敗`);
      }
    }
  }

  reasons.sort((a, b) => b.points - a.points);
  const score = reasons.reduce((sum, reason) => sum + reason.points, 0);
  return {
    level: riskLevelForScore(score),
    score,
    reasons,
    recentRuns: runs.length,
    recentFailures: failures,
  };
}

/** 讀取多個來源最近已結束的擷取結果（新的在前），每個來源最多 RECENT_RUN_LIMIT 筆。 */
export function getRecentRunStatuses(sourceIds: number[]): Map<number, ('success' | 'failure')[]> {
  const result = new Map<number, ('success' | 'failure')[]>();
  if (sourceIds.length === 0) return result;

  const rows = getDb()
    .prepare(
      `SELECT source_id, status FROM (
         SELECT source_id, status,
                ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY id DESC) AS rn
         FROM ingestion_runs
         WHERE status IN ('success', 'failure')
           AND source_id IN (SELECT value FROM json_each(?))
       )
       WHERE rn <= ?
       ORDER BY source_id, rn`,
    )
    .all(JSON.stringify(sourceIds), RECENT_RUN_LIMIT) as unknown as {
    source_id: number;
    status: 'success' | 'failure';
  }[];

  for (const row of rows) {
    const list = result.get(row.source_id) ?? [];
    list.push(row.status);
    result.set(row.source_id, list);
  }
  return result;
}

interface RiskSubject {
  id: number;
  url: string;
  reviewStatus: ReviewStatus;
  enabled: boolean;
}

/** 幫一批來源加上風險評估結果。 */
export function withRisk<T extends RiskSubject>(sources: T[]): (T & { risk: SourceRisk })[] {
  const runs = getRecentRunStatuses(sources.map((source) => source.id));
  return sources.map((source) => ({
    ...source,
    risk: assessSourceRisk({
      url: source.url,
      reviewStatus: source.reviewStatus,
      enabled: source.enabled,
      recentRunStatuses: runs.get(source.id) ?? [],
    }),
  }));
}
