import type { DatabaseSync } from 'node:sqlite';
import type { ReviewStatus } from '../sources/sourceTypes.js';
import { taipeiNow } from './events.dates.js';

// US-20 跨來源重複活動偵測。同一來源同一網址重跑由 upsert 處理，這裡只比對不同來源的活動。
// 新活動寫入（且為已發布）後，與開始日期前後 1 天內、其他已核准來源的已發布活動比對重複分數：
//   分數 ≥ 高門檻 → 合併（dedup_status = merged，不再出現在 published_events）
//   低門檻 ≤ 分數 < 高門檻 → 可能重複（possible，照常顯示，交給管理員確認或拆開）
//   分數 < 低門檻 → 新活動
// 寧可漏判也不要誤判：自動合併必須開始時間完全相同（或報名連結相同），見 SCORE_WEIGHTS。

export const DEDUP_STATUSES = ['none', 'merged', 'possible'] as const;
export type DedupStatus = (typeof DEDUP_STATUSES)[number];

/** 各訊號的權重；權重總和為 1，報名連結相同時直接給 1 分。 */
export const SCORE_WEIGHTS = { title: 0.6, startTime: 0.3, location: 0.1 } as const;

export interface DedupConfig {
  /** 分數達到即自動合併 */
  highThreshold: number;
  /** 分數達到即標記可能重複 */
  lowThreshold: number;
}

/** 預設門檻，可用 DEDUP_HIGH_THRESHOLD、DEDUP_LOW_THRESHOLD 覆寫（NFR-20）。 */
export const DEFAULT_DEDUP_CONFIG: DedupConfig = { highThreshold: 0.75, lowThreshold: 0.5 };

const APPROVED: ReviewStatus = 'approved';
const DAY_MS = 86400000;

/** 讀取門檻設定；值不合法（不在 0–1、低門檻大於高門檻）時使用預設值。 */
export function dedupConfig(env: NodeJS.ProcessEnv = process.env): DedupConfig {
  const read = (value: string | undefined, fallback: number) => {
    const number = value === undefined || value === '' ? NaN : Number(value);
    return number >= 0 && number <= 1 ? number : fallback;
  };
  const highThreshold = read(env.DEDUP_HIGH_THRESHOLD, DEFAULT_DEDUP_CONFIG.highThreshold);
  const lowThreshold = read(env.DEDUP_LOW_THRESHOLD, DEFAULT_DEDUP_CONFIG.lowThreshold);
  return lowThreshold <= highThreshold ? { highThreshold, lowThreshold } : DEFAULT_DEDUP_CONFIG;
}

/** 比對用的標題：全形轉半形、轉小寫，去掉標點、括號（如【】）與空白，只留文字與數字。 */
export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function bigrams(value: string): Set<string> {
  const characters = [...value];
  if (characters.length < 2) return new Set(characters);
  const result = new Set<string>();
  for (let i = 0; i < characters.length - 1; i += 1) result.add(characters[i] + characters[i + 1]);
  return result;
}

/** 標題相似度：正規化後的字元 bigram Jaccard，0–1。 */
export function titleSimilarity(a: string, b: string): number {
  const left = bigrams(normalizeForMatch(a));
  const right = bigrams(normalizeForMatch(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** 報名連結比對時忽略 hash 與結尾斜線。 */
function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}

/** 計算重複分數需要的欄位 */
export interface DedupFields {
  title: string;
  startTime: string;
  location: string | null;
  registrationUrl: string | null;
}

export interface DuplicateScore {
  score: number;
  /** 報名連結相同，直接判定重複 */
  sameRegistrationUrl: boolean;
  titleSimilarity: number;
  sameStartTime: boolean;
  sameLocation: boolean;
}

/** 兩個活動的重複分數，0–1。 */
export function scoreDuplicate(a: DedupFields, b: DedupFields): DuplicateScore {
  const sameRegistrationUrl =
    !!a.registrationUrl &&
    !!b.registrationUrl &&
    normalizeUrl(a.registrationUrl) === normalizeUrl(b.registrationUrl);
  const similarity = titleSimilarity(a.title, b.title);
  const sameStartTime = new Date(a.startTime).getTime() === new Date(b.startTime).getTime();
  const locationA = a.location ? normalizeForMatch(a.location) : '';
  const sameLocation =
    locationA !== '' && b.location !== null && locationA === normalizeForMatch(b.location);
  const score = sameRegistrationUrl
    ? 1
    : SCORE_WEIGHTS.title * similarity +
      (sameStartTime ? SCORE_WEIGHTS.startTime : 0) +
      (sameLocation ? SCORE_WEIGHTS.location : 0);
  return {
    score: Math.round(score * 1000) / 1000,
    sameRegistrationUrl,
    titleSimilarity: Math.round(similarity * 1000) / 1000,
    sameStartTime,
    sameLocation,
  };
}

/** 依分數判斷：merged、possible 或 none。 */
export function classifyScore(score: number, config: DedupConfig): DedupStatus {
  if (score >= config.highThreshold) return 'merged';
  if (score >= config.lowThreshold) return 'possible';
  return 'none';
}

/** 台北日期 YYYY-MM-DD 加減天數；startTime 為 +08:00 的 ISO 字串，前 10 碼即台北日期。 */
function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

interface EventRow extends DedupFields {
  id: number;
  sourceId: number;
}

function toEventRow(row: Record<string, unknown>): EventRow {
  return {
    id: Number(row.id),
    sourceId: Number(row.source_id),
    title: String(row.title),
    startTime: String(row.start_time),
    location: row.location === null ? null : String(row.location),
    registrationUrl: row.registration_url === null ? null : String(row.registration_url),
  };
}

function orderedPair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export interface DedupResult {
  status: DedupStatus;
  duplicateOf: number | null;
  score: number | null;
}

/**
 * 對剛寫入的活動做重複偵測。只處理已發布、尚未判定（dedup_status = none）、
 * 也沒有其他活動合併進來的活動；已判定或已被管理員處理過的活動不會被改動。
 */
export function detectDuplicate(
  db: DatabaseSync,
  eventId: number,
  config: DedupConfig = dedupConfig(),
): DedupResult {
  const none: DedupResult = { status: 'none', duplicateOf: null, score: null };
  const row = db
    .prepare(
      `SELECT e.id, e.source_id, e.title, e.start_time, e.location, e.registration_url
      FROM events e
      WHERE e.id = ? AND e.status = 'published' AND e.dedup_status = 'none'
        AND NOT EXISTS (SELECT 1 FROM events d WHERE d.duplicate_of = e.id)`,
    )
    .get(eventId);
  if (!row) return none;
  const event = toEventRow(row);
  const date = event.startTime.slice(0, 10);

  // 候選：開始日期前後 1 天內、其他已核准來源、尚未判定為重複的已發布活動，排除管理員判定不重複的配對
  const candidates = db
    .prepare(
      `SELECT e.id, e.source_id, e.title, e.start_time, e.location, e.registration_url
      FROM events e
      JOIN sources s ON s.id = e.source_id
      WHERE e.status = 'published' AND e.dedup_status = 'none' AND e.id != ?
        AND e.source_id != ? AND s.review_status = ?
        AND substr(e.start_time, 1, 10) BETWEEN ? AND ?
        AND NOT EXISTS (
          SELECT 1 FROM event_distinct_pairs p
          WHERE p.event_id = min(e.id, ?) AND p.other_event_id = max(e.id, ?)
        )
      ORDER BY e.id`,
    )
    .all(
      event.id,
      event.sourceId,
      APPROVED,
      shiftDate(date, -1),
      shiftDate(date, 1),
      event.id,
      event.id,
    )
    .map(toEventRow);

  let best: { candidate: EventRow; score: number } | undefined;
  for (const candidate of candidates) {
    const { score } = scoreDuplicate(event, candidate);
    // 分數相同時保留較早建立（id 較小）的活動
    if (!best || score > best.score) best = { candidate, score };
  }
  if (!best) return none;
  const status = classifyScore(best.score, config);
  if (status === 'none') return none;

  db.prepare(
    'UPDATE events SET duplicate_of = ?, dedup_status = ?, dedup_score = ? WHERE id = ?',
  ).run(best.candidate.id, status, best.score, event.id);
  return { status, duplicateOf: best.candidate.id, score: best.score };
}

/** 管理員清單中的一筆配對 */
export interface DuplicatePair {
  status: Exclude<DedupStatus, 'none'>;
  score: number | null;
  /** 被判定為重複的那筆 */
  event: PairEvent;
  /** 保留的那筆 */
  duplicateOf: PairEvent;
}

export interface PairEvent {
  id: number;
  title: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  registrationUrl: string | null;
  originalUrl: string;
  sourceId: number;
  sourceName: string;
}

function pairEvent(row: Record<string, unknown>, prefix: string): PairEvent {
  const value = (column: string) => row[`${prefix}${column}`];
  const text = (column: string) => (value(column) === null ? null : String(value(column)));
  return {
    id: Number(value('id')),
    title: String(value('title')),
    startTime: String(value('start_time')),
    endTime: text('end_time'),
    allDay: Number(value('all_day')) === 1,
    location: text('location'),
    registrationUrl: text('registration_url'),
    originalUrl: String(value('original_url')),
    sourceId: Number(value('source_id')),
    sourceName: String(value('source_name')),
  };
}

const PAIR_COLUMNS = [
  'id',
  'title',
  'start_time',
  'end_time',
  'all_day',
  'location',
  'registration_url',
  'original_url',
];

/** 列出可能重複（待確認）與已合併的配對；可能重複在前，各自依活動 id 排序。 */
export function listDuplicatePairs(db: DatabaseSync): DuplicatePair[] {
  const select = (alias: string, prefix: string) =>
    [
      ...PAIR_COLUMNS.map((column) => `${alias}.${column} AS ${prefix}${column}`),
      `${alias}.source_id AS ${prefix}source_id`,
    ].join(', ');
  return db
    .prepare(
      `SELECT e.dedup_status, e.dedup_score, ${select('e', 'd_')}, ds.name AS d_source_name,
        ${select('k', 'k_')}, ks.name AS k_source_name
      FROM events e
      JOIN events k ON k.id = e.duplicate_of
      JOIN sources ds ON ds.id = e.source_id
      JOIN sources ks ON ks.id = k.source_id
      WHERE e.dedup_status IN ('possible', 'merged')
      ORDER BY e.dedup_status = 'merged', e.id`,
    )
    .all()
    .map((row) => ({
      status: String(row.dedup_status) as DuplicatePair['status'],
      score: row.dedup_score === null ? null : Number(row.dedup_score),
      event: pairEvent(row, 'd_'),
      duplicateOf: pairEvent(row, 'k_'),
    }));
}

/** 管理員確認合併「可能重複」的活動；不是可能重複時回傳 false。 */
export function confirmDuplicate(db: DatabaseSync, eventId: number): boolean {
  const result = db
    .prepare(
      `UPDATE events SET dedup_status = 'merged'
      WHERE id = ? AND dedup_status = 'possible' AND duplicate_of IS NOT NULL`,
    )
    .run(eventId);
  return Number(result.changes) > 0;
}

/**
 * 拆開配對：可能重複或已合併（含誤合併）的活動還原成獨立活動，
 * 並記錄這組配對不是重複，之後重跑擷取不會再合併。不是可能重複或已合併時回傳 false。
 */
export function splitDuplicate(
  db: DatabaseSync,
  eventId: number,
  decidedBy: number | null,
  now = new Date(),
): boolean {
  const row = db
    .prepare(
      `SELECT duplicate_of FROM events
      WHERE id = ? AND dedup_status IN ('possible', 'merged') AND duplicate_of IS NOT NULL`,
    )
    .get(eventId);
  if (!row) return false;
  const [first, second] = orderedPair(eventId, Number(row.duplicate_of));
  db.exec('BEGIN');
  try {
    db.prepare(
      "UPDATE events SET duplicate_of = NULL, dedup_status = 'none', dedup_score = NULL WHERE id = ?",
    ).run(eventId);
    db.prepare(
      `INSERT INTO event_distinct_pairs (event_id, other_event_id, decided_by, decided_at)
      VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    ).run(first, second, decidedBy, taipeiNow(now));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return true;
}

/** 活動頁列出的一個來源 */
export interface EventSourceLink {
  sourceId: number;
  sourceName: string;
  originalUrl: string;
}

/** 活動的所有來源：自己的來源在前，再列出合併進來的活動的來源（依活動 id）。 */
export function listEventSources(db: DatabaseSync, eventId: number): EventSourceLink[] {
  return db
    .prepare(
      `SELECT e.source_id, s.name, e.original_url
      FROM events e JOIN sources s ON s.id = e.source_id
      WHERE e.id = ? OR (e.duplicate_of = ? AND e.dedup_status = 'merged')
      ORDER BY e.id != ?, e.id`,
    )
    .all(eventId, eventId, eventId)
    .map((row) => ({
      sourceId: Number(row.source_id),
      sourceName: String(row.name),
      originalUrl: String(row.original_url),
    }));
}
