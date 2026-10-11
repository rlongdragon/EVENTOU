import type { DatabaseSync } from 'node:sqlite';
import { convertAnnouncement } from './events.converter.js';
import { upsertEvent } from './events.repository.js';
import type { ConversionOptions, RawAnnouncement } from './events.types.js';

export function processAnnouncement(
  db: DatabaseSync,
  raw: RawAnnouncement,
  options: ConversionOptions = {},
  now = new Date(),
) {
  return upsertEvent(db, convertAnnouncement(raw, options), now);
}
