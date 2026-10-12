import type { DatabaseSync } from 'node:sqlite';
import { getDb } from '../../db/index.js';
import { processAnnouncement } from '../events/events.service.js';
import type { RawAnnouncement } from '../events/events.types.js';
import { positiveInteger, scraperConfigs, type ScraperConfig } from './ingestion.config.js';
import { scrapeAnnouncements, ScraperClient } from './ingestion.scraper.js';

export class IngestionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export class IngestionService {
  private active = new Set<number>();
  constructor(
    private db: DatabaseSync,
    private configs: ScraperConfig[] = scraperConfigs,
    private client = new ScraperClient(),
    private scrape = scrapeAnnouncements,
    private process = processAnnouncement,
  ) {}
  async runAll(): Promise<void> {
    this.client.clearRobots();
    const sources = this.db
      .prepare("SELECT id FROM sources WHERE review_status='approved' AND enabled=1")
      .all();
    for (const source of sources) {
      try {
        await this.runSource(Number(source.id));
      } catch (error) {
        console.error('[ingestion]', error);
      }
    }
  }
  async runSource(sourceId: number) {
    const source = this.db.prepare('SELECT * FROM sources WHERE id=?').get(sourceId);
    if (!source) throw new IngestionError('找不到來源', 404);
    if (source.review_status !== 'approved' || source.enabled !== 1)
      throw new IngestionError('來源尚未核准或已停用', 409);
    if (this.active.has(sourceId)) throw new IngestionError('來源正在擷取中', 409);
    const run = this.db
      .prepare(
        "INSERT INTO ingestion_runs(source_id, started_at, status) VALUES (?, ?, 'running') RETURNING id",
      )
      .get(sourceId, new Date().toISOString())!;
    this.active.add(sourceId);
    let insertedCount = 0;
    let updatedCount = 0;
    let errorMessage: string | null = null;
    try {
      const config = this.configs.find((item) => item.listUrl === source.url);
      if (!config) throw new Error('來源尚未設定人工擷取規則');
      const pending = this.db
        .prepare(
          'SELECT source_id AS sourceId, url, title, raw_content AS rawContent, published_at AS publishedAt, fetched_at AS fetchedAt FROM raw_announcements WHERE source_id=? AND processed_at IS NULL',
        )
        .all(sourceId) as unknown as RawAnnouncement[];
      for (const raw of pending) this.processRaw(raw);
      for await (const raw of this.scrape(sourceId, config, this.client)) {
        if (
          !this.db
            .prepare("SELECT id FROM sources WHERE id=? AND review_status='approved' AND enabled=1")
            .get(sourceId)
        )
          throw new Error('擷取期間來源已停用或取消核准');
        const existing = this.db
          .prepare(
            'SELECT title, raw_content, published_at FROM raw_announcements WHERE source_id=? AND url=?',
          )
          .get(sourceId, raw.url!);
        const changed =
          !existing ||
          existing.title !== raw.title ||
          existing.raw_content !== raw.rawContent ||
          existing.published_at !== raw.publishedAt;
        this.db
          .prepare(
            `INSERT INTO raw_announcements(source_id, url, title, raw_content, published_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id, url) DO UPDATE SET title=excluded.title, raw_content=excluded.raw_content, published_at=excluded.published_at, fetched_at=excluded.fetched_at,
          processed_at=CASE WHEN ? THEN NULL ELSE processed_at END`,
          )
          .run(
            sourceId,
            raw.url!,
            raw.title!,
            raw.rawContent,
            raw.publishedAt,
            raw.fetchedAt,
            changed ? 1 : 0,
          );
        if (!existing) insertedCount += 1;
        else if (changed) updatedCount += 1;
        if (changed) this.processRaw(raw);
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : '未知擷取錯誤';
    } finally {
      this.active.delete(sourceId);
      this.db
        .prepare(
          'UPDATE ingestion_runs SET finished_at=?, status=?, inserted_count=?, updated_count=?, error_message=? WHERE id=?',
        )
        .run(
          new Date().toISOString(),
          errorMessage ? 'failure' : 'success',
          insertedCount,
          updatedCount,
          errorMessage,
          run.id!,
        );
    }
    return {
      id: Number(run.id),
      sourceId,
      status: errorMessage ? 'failure' : 'success',
      insertedCount,
      updatedCount,
      errorMessage,
    };
  }
  private processRaw(raw: RawAnnouncement): void {
    this.process(this.db, raw);
    this.db
      .prepare('UPDATE raw_announcements SET processed_at=? WHERE source_id=? AND url=?')
      .run(new Date().toISOString(), raw.sourceId!, raw.url!);
  }
}
let service: IngestionService | undefined;
export function getIngestionService(): IngestionService {
  return (service ??= new IngestionService(
    getDb(),
    scraperConfigs,
    new ScraperClient(
      fetch,
      Math.max(1000, positiveInteger(process.env.INGESTION_REQUEST_INTERVAL_MS, 1000)),
      positiveInteger(process.env.INGESTION_TIMEOUT_MS, 30000),
      positiveInteger(process.env.INGESTION_RETRIES, 2),
    ),
  ));
}
