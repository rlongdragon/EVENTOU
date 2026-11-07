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
  const event = upsertEvent(db, convertAnnouncement(raw, options), now);
  return { ...event, dedup: detectDuplicate(db, event.id) };
}
