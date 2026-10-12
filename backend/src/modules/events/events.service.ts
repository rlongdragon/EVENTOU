import type { DatabaseSync } from 'node:sqlite';
import { convertAnnouncement } from './events.converter.js';
import { upsertEvent } from './events.repository.js';
import type { ConversionOptions, RawAnnouncement, UpsertResult } from './events.types.js';

export function processAnnouncement(
  db: DatabaseSync,
  raw: RawAnnouncement,
  options: ConversionOptions = {},
  now = new Date(),
): UpsertResult {
  return upsertEvent(db, convertAnnouncement(raw, options), now);
}
