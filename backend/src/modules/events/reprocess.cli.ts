import { getDb } from '../../db/index.js';
import { llmConfigFromEnv } from './events.llm.js';
import { processAnnouncementWithLlm } from './events.service.js';
import type { RawAnnouncement } from './events.types.js';

// #69 用目前的整理規則（有設定 LLM 時加上 LLM）重新整理所有已擷取的公告，並印出整理前後的統計。
// 用法：npm run events:reprocess -w backend [-- --concurrency 4]
// LLM 結果有快取，重跑只會呼叫內容有變的公告。

function stats() {
  const row = getDb()
    .prepare(
      `SELECT
        count(*) AS total,
        sum(status = 'published') AS published,
        sum(status = 'needs_review' AND is_event = 1) AS needsReview,
        sum(is_event = 0) AS notEvent,
        sum(summary IS NOT NULL) AS withSummary,
        sum(topics != '[]') AS withTopics
      FROM events`,
    )
    .get();
  const missingPublishedAt = getDb()
    .prepare('SELECT count(*) AS n FROM raw_announcements WHERE published_at IS NULL')
    .get()?.n;
  return { ...row, missingPublishedAt };
}

const concurrencyIndex = process.argv.indexOf('--concurrency');
const concurrency = Math.max(1, Number(process.argv[concurrencyIndex + 1]) || 4);
if (!llmConfigFromEnv()) console.warn('未設定 LLM_BASE_URL／LLM_MODEL，只用規則重新整理');

const db = getDb();
const before = stats();
const raws = db
  .prepare(
    'SELECT source_id AS sourceId, url, title, raw_content AS rawContent, published_at AS publishedAt, fetched_at AS fetchedAt FROM raw_announcements ORDER BY source_id, url',
  )
  .all() as unknown as RawAnnouncement[];

let done = 0;
let failed = 0;
const queue = [...raws];
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (let raw = queue.shift(); raw; raw = queue.shift()) {
      try {
        await processAnnouncementWithLlm(db, raw);
      } catch (error) {
        failed += 1;
        console.error('[reprocess]', error instanceof Error ? error.message : error);
      }
      done += 1;
      if (done % 20 === 0) console.log(`${done}/${raws.length}`);
    }
  }),
);
console.table({ before, after: stats() });
if (failed) console.log(`失敗 ${failed} 則`);
