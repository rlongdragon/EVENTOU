import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate } from '../migrate.js';
import { migrations } from './index.js';

const FK_MIGRATION_ID = 4;
const timestamp = '2026-10-01T09:00:00+08:00';

/** 建立 migration 4 之前的資料庫（只套用編號 1～3），模擬升級前的狀態。 */
function createDbBeforeFkMigration(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(
    "CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  for (const migration of migrations.filter((m) => m.id < FK_MIGRATION_ID)) {
    db.exec(migration.up);
    db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(
      migration.id,
      migration.name,
    );
  }
  return db;
}

function insertEvent(
  db: DatabaseSync,
  sourceId: number,
  originalUrl: string,
  status = 'published',
) {
  db.prepare(
    `INSERT INTO events (
      title, category, start_time, all_day, source_id, original_url, status,
      review_reasons, created_at, updated_at
    ) VALUES ('海大講座', 'lecture', '2026-10-07T14:00:00+08:00', 0, ?, ?, ?, '[]', ?, ?)`,
  ).run(sourceId, originalUrl, status, timestamp, timestamp);
}

function seedUserAndSource(db: DatabaseSync) {
  db.prepare(
    "INSERT INTO users (email, password_hash, display_name) VALUES ('a@example.com', 'x', 'a')",
  ).run();
  db.prepare(
    "INSERT INTO sources (name, url, type, submitted_by) VALUES ('來源', 'https://example.com', 'other', 1)",
  ).run();
}

test('補外鍵後保留既有 events，並保留唯一鍵、index 與 published_events view', () => {
  const db = createDbBeforeFkMigration();
  try {
    seedUserAndSource(db);
    insertEvent(db, 1, 'https://example.com/a');
    insertEvent(db, 1, 'https://example.com/b', 'needs_review');

    migrate(db);

    assert.equal(db.prepare('SELECT count(*) AS n FROM events').get()?.n, 2);
    assert.equal(db.prepare('SELECT count(*) AS n FROM published_events').get()?.n, 1);
    assert.throws(() => insertEvent(db, 1, 'https://example.com/a'), /UNIQUE/);
    assert.ok(
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'events_status_category_start'",
        )
        .get(),
    );
  } finally {
    db.close();
  }
});

test('補外鍵後 events.source_id 必須對得到 sources', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    assert.throws(() => insertEvent(db, 99, 'https://example.com/a'), /FOREIGN KEY/);

    seedUserAndSource(db);
    insertEvent(db, 1, 'https://example.com/a');
    assert.equal(db.prepare('SELECT count(*) AS n FROM events').get()?.n, 1);
  } finally {
    db.close();
  }
});

test('既有 events 的 source_id 對不到來源時，migration 失敗並完整回復', () => {
  const db = createDbBeforeFkMigration();
  try {
    insertEvent(db, 99, 'https://example.com/orphan');

    assert.throws(() => migrate(db), /FOREIGN KEY/);

    assert.equal(db.prepare('SELECT count(*) AS n FROM events').get()?.n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM published_events').get()?.n, 1);
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM schema_migrations WHERE id = ?').get(FK_MIGRATION_ID)
        ?.n,
      0,
    );
  } finally {
    db.close();
  }
});
