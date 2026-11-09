import type { DatabaseSync } from 'node:sqlite';
import { convertAnnouncement } from './events.converter.js';
import { detectDuplicate, type DedupResult } from './events.dedup.js';
import { upsertEvent } from './events.repository.js';
import type { ConversionOptions, Event, RawAnnouncement } from './events.types.js';

/**
 * 轉換公告並寫入 Event；已發布的活動接著做 US-20 跨來源重複偵測（見 events.dedup.ts），
 * 判定為重複時不會出現在 published_events。重複偵測的結果放在 dedup。
 */
export function processAnnouncement(
  db: DatabaseSync,
  raw: RawAnnouncement,
  options: ConversionOptions = {},
  now = new Date(),
): Event & { dedup: DedupResult } {
  // 寫入與重複偵測不在同一個交易：偵測失敗時活動已寫入，只是這次沒有判定，
  // 之後重跑擷取（dedup_status 仍為 none）會再判定一次，所以不另外包交易。
  const event = upsertEvent(db, convertAnnouncement(raw, options), now);
  return { ...event, dedup: detectDuplicate(db, event.id) };
}
