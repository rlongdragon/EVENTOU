import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate } from '../../db/index.js';
import { scraperConfigs } from '../ingestion/ingestion.config.js';
import { NTOU_SOURCES, seedNtouSources } from './ntouSources.js';

process.env.DATABASE_PATH = ':memory:';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  migrate(db);
  db.prepare(
    "INSERT INTO users (student_id, email, display_name, role) VALUES ('A0000001', 'admin@example.com', '管理員', 'admin')",
  ).run();
  return db;
}

test('官方來源清單與擷取設定的網址一一對應', () => {
  assert.deepEqual(
    NTOU_SOURCES.map((source) => source.url).sort(),
    scraperConfigs.map((config) => config.listUrl).sort(),
  );
});

test('建立的來源為已核准、啟用中，提交者與審核者為指定的管理員', () => {
  const db = setup();
  try {
    const { created, skipped } = seedNtouSources(db, 1);
    assert.equal(created.length, NTOU_SOURCES.length);
    assert.deepEqual(skipped, []);
    const rows = db.prepare('SELECT * FROM sources').all();
    assert.equal(rows.length, NTOU_SOURCES.length);
    for (const row of rows) {
      assert.equal(row.review_status, 'approved');
      assert.equal(row.enabled, 1);
      assert.equal(row.submitted_by, 1);
      assert.equal(row.reviewed_by, 1);
      assert.ok(row.reviewed_at);
    }
  } finally {
    db.close();
  }
});

test('重複執行不會多建；已存在的來源略過且不改動其狀態', () => {
  const db = setup();
  try {
    const existing = NTOU_SOURCES[0];
    db.prepare(
      "INSERT INTO sources (name, url, type, review_status, enabled, submitted_by) VALUES ('自己提交的', ?, 'other', 'pending', 0, 1)",
    ).run(existing.url);
    const first = seedNtouSources(db, 1);
    assert.equal(first.created.length, NTOU_SOURCES.length - 1);
    assert.deepEqual(first.skipped, [existing.name]);
    const again = seedNtouSources(db, 1);
    assert.deepEqual(again.created, []);
    assert.equal(again.skipped.length, NTOU_SOURCES.length);
    assert.equal(db.prepare('SELECT count(*) AS n FROM sources').get()!.n, NTOU_SOURCES.length);
    const kept = db.prepare('SELECT * FROM sources WHERE url = ?').get(existing.url)!;
    assert.equal(kept.review_status, 'pending');
    assert.equal(kept.enabled, 0);
  } finally {
    db.close();
  }
});
