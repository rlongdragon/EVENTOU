import type { DatabaseSync } from 'node:sqlite';
import { getDb } from './client.js';
import { migrations } from './migrations/index.js';

export interface Migration {
  id: number;
  name: string;
  up: string;
}

/**
 * 執行尚未套用的 migration，已套用的記錄在 schema_migrations。
 */
export function migrate(db: DatabaseSync = getDb()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => row.id as number),
  );
  const insert = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)');

  for (const migration of [...migrations].sort((a, b) => a.id - b.id)) {
    if (applied.has(migration.id)) continue;

    db.exec('BEGIN');
    try {
      db.exec(migration.up);
      insert.run(migration.id, migration.name);
      db.exec('COMMIT');
      console.log(`[db] applied migration ${migration.id}_${migration.name}`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
