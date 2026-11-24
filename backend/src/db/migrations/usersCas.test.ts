import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate } from '../migrate.js';
import { migrations } from './index.js';

const CAS_MIGRATION_ID = 16;

/** 建立 migration 16 之前的資料庫，模擬已有密碼帳號與相關資料的升級前狀態。 */
function createDbBeforeCasMigration(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(
    "CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  for (const migration of migrations.filter((m) => m.id < CAS_MIGRATION_ID)) {
    db.exec(migration.up);
    db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(
      migration.id,
      migration.name,
    );
  }
  return db;
}

test('改用 CAS 的 migration 保留舊帳號與它的關聯資料，移除密碼並清空 session', () => {
  const db = createDbBeforeCasMigration();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, display_name, role) VALUES (7, 'old@example.com', 'scrypt$x', '老帳號', 'admin')",
  ).run();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('s', 7, '2999-01-01')").run();
  db.prepare("INSERT INTO category_subscriptions (user_id, category) VALUES (7, 'lecture')").run();
  db.prepare(
    "INSERT INTO sources (name, url, type, submitted_by) VALUES ('來源', 'https://example.com', 'other', 7)",
  ).run();

  migrate(db);

  const columns = db
    .prepare('PRAGMA table_info(users)')
    .all()
    .map((column) => column.name);
  assert.ok(columns.includes('student_id'));
  assert.ok(!columns.includes('password_hash'));

  const user = db.prepare('SELECT * FROM users WHERE id = 7').get();
  assert.equal(user?.student_id, null);
  assert.equal(user?.email, 'old@example.com');
  assert.equal(user?.display_name, '老帳號');
  assert.equal(user?.role, 'admin');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM category_subscriptions').get()?.n, 1);
  assert.equal(db.prepare('SELECT submitted_by FROM sources').get()?.submitted_by, 7);

  // 外鍵仍指向新的 users 表，而且已重新開啟
  assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.throws(() =>
    db
      .prepare("INSERT INTO category_subscriptions (user_id, category) VALUES (99, 'lecture')")
      .run(),
  );
  // sources.submitted_by 沒有 ON DELETE，刪帳號前要先刪來源；其他關聯會連帶刪除
  assert.throws(() => db.prepare('DELETE FROM users WHERE id = 7').run());
  db.prepare('DELETE FROM sources').run();
  db.prepare('DELETE FROM users WHERE id = 7').run();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM category_subscriptions').get()?.n, 0);
});

test('學號唯一，信箱可為空且不再唯一', () => {
  const db = createDbBeforeCasMigration();
  migrate(db);
  const insert = db.prepare('INSERT INTO users (student_id, email, display_name) VALUES (?, ?, ?)');
  insert.run('01357107', null, 'a');
  insert.run('01357108', null, 'b');
  insert.run('01357109', 'same@example.com', 'c');
  insert.run('01357110', 'same@example.com', 'd');
  assert.throws(() => insert.run('01357107', null, 'e'));
});
