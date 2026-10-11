import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate } from '../../db/index.js';

process.env.DATABASE_PATH = ':memory:';

test('Event schema 可重跑 migration，保存待審並只公開完整活動', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    migrate(db);
    const insert = db.prepare(`
      INSERT INTO events (
        title, category, start_time, all_day, source_id, original_url, status,
        review_reasons, created_at, updated_at
      ) VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?, ?)
    `);
    const timestamp = '2026-10-01T09:00:00+08:00';
    insert.run(
      '海大講座',
      'lecture',
      '2026-10-07T14:00:00+08:00',
      'https://www.ntou.edu.tw/announcements/1',
      'published',
      '[]',
      timestamp,
      timestamp,
    );
    insert.run(
      '',
      null,
      null,
      'https://www.ntou.edu.tw/announcements/2',
      'needs_review',
      '["缺少必填欄位"]',
      timestamp,
      timestamp,
    );
    assert.equal(db.prepare('SELECT count(*) AS count FROM events').get()?.count, 2);
    assert.equal(db.prepare('SELECT count(*) AS count FROM published_events').get()?.count, 1);
    assert.throws(
      () =>
        insert.run(
          '重複公告',
          'lecture',
          '2026-10-07T14:00:00+08:00',
          'https://www.ntou.edu.tw/announcements/1',
          'published',
          '[]',
          timestamp,
          timestamp,
        ),
      /UNIQUE/,
    );
    assert.throws(
      () =>
        insert.run(
          '缺少日期',
          'lecture',
          null,
          'https://www.ntou.edu.tw/announcements/3',
          'published',
          '[]',
          timestamp,
          timestamp,
        ),
      /CHECK/,
    );
    assert.throws(
      () =>
        insert.run(
          '缺少類別',
          null,
          '2026-10-07T14:00:00+08:00',
          'https://www.ntou.edu.tw/announcements/4',
          'published',
          '[]',
          timestamp,
          timestamp,
        ),
      /CHECK/,
    );
  } finally {
    db.close();
  }
});
