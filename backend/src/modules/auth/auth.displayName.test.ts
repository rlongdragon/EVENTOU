import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, migrate } from '../../db/index.js';
import { migrate as migrateDb } from '../../db/migrate.js';
import { migrations } from '../../db/migrations/index.js';
import { defaultDisplayName, displayNameCode, findReservedWord } from './auth.displayName.js';
import { findOrCreateUserByStudentId, maskStudentId } from './auth.service.js';
import { createTestUser } from './auth.testHelpers.js';

process.env.DATABASE_PATH = ':memory:';

let server: Server;
let baseUrl: string;

before(async () => {
  migrate();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  closeDb();
});

describe('預設顯示名稱不重複（#100）', () => {
  test('短代碼一對一，前 10 萬個 id 不重複，且不是流水號', () => {
    const codes = new Set<string>();
    for (let id = 1; id <= 100_000; id += 1) codes.add(displayNameCode(id));
    assert.equal(codes.size, 100_000);
    assert.match(displayNameCode(1), /^[0-9A-F]{5}$/);
    assert.notEqual(displayNameCode(2), '00002');
  });

  test('同系同屆的學號第一次登入時得到不同的預設名稱', () => {
    const a = findOrCreateUserByStudentId('01357201');
    const b = findOrCreateUserByStudentId('01357202');
    assert.equal(a.displayName, defaultDisplayName('01357*', a.id));
    assert.notEqual(a.displayName, b.displayName);
    assert.ok(a.displayName.startsWith('01357*-'));
    // 再次登入不會改掉名稱
    assert.equal(findOrCreateUserByStudentId('01357201').displayName, a.displayName);
  });

  test('migration 19 只更新仍在用預設名稱的帳號，算式與程式相同', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(
      "CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
    );
    for (const migration of migrations.filter((m) => m.id < 19)) {
      db.exec(migration.up);
      db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(
        migration.id,
        migration.name,
      );
    }
    db.exec(`INSERT INTO users (id, student_id, display_name) VALUES
      (5, '01357107', '01357*'),
      (77777, '01357108', '01357*'),
      (6, '01357109', '小明'),
      (8, 'A123', 'A1*'),
      (9, NULL, '舊帳號')`);
    migrateDb(db);
    const names = Object.fromEntries(
      db
        .prepare('SELECT id, display_name FROM users')
        .all()
        .map((row) => [Number(row.id), String(row.display_name)]),
    );
    assert.equal(names[5], defaultDisplayName(maskStudentId('01357107'), 5));
    assert.equal(names[77777], defaultDisplayName(maskStudentId('01357108'), 77777));
    assert.equal(names[8], defaultDisplayName(maskStudentId('A123'), 8));
    assert.equal(names[6], '小明');
    assert.equal(names[9], '舊帳號');
    db.close();
  });
});

describe('顯示名稱保留字（#100）', () => {
  test('擋下中英文保留字與常見繞過寫法', () => {
    for (const name of [
      '管理員',
      'EVENTOU 管理員',
      '管 理 員',
      '管-理-員',
      `管${String.fromCharCode(0x200b)}理員`, // 零寬空白
      '管理员',
      '官方小幫手',
      '站長',
      'admin',
      'ＡＤＭＩＮ',
      'Admin123',
      'a d m i n',
      '系統Administrator',
      'Moderator',
      'eventou_official',
    ]) {
      assert.ok(findReservedWord(name), `${name} 應被擋下`);
    }
  });

  test('一般名稱與包含保留字母的單字不受影響', () => {
    for (const name of ['小明', '資訊管理系', 'badminton 社', '01357*-3F2A1', 'Eve', 'Adam']) {
      assert.equal(findReservedWord(name), undefined, `${name} 不應被擋下`);
    }
  });

  test('一般使用者不能改成保留字，管理員可以', async () => {
    const patch = (cookie: string, displayName: string) =>
      fetch(`${baseUrl}/api/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ displayName }),
      });
    const user = createTestUser();
    const rejected = await patch(user.cookie, 'EVENTOU 管理員');
    assert.equal(rejected.status, 400);
    const body = (await rejected.json()) as { fields: Record<string, string> };
    assert.match(body.fields.displayName, /保留字/);

    const admin = createTestUser({ role: 'admin' });
    assert.equal((await patch(admin.cookie, 'EVENTOU 管理員')).status, 200);
  });
});
