import type { DatabaseSync } from 'node:sqlite';
import { getDb } from './client.js';
import { migrations } from './migrations/index.js';

export interface Migration {
  id: number;
  name: string;
  up: string;
  /**
   * 重建被外鍵參照的資料表時設為 true（SQLite 的 12 步驟改表程序）：交易外先關閉外鍵檢查，
   * 避免 DROP TABLE 觸發 ON DELETE CASCADE；提交前以 foreign_key_check 確認沒有壞掉的參照。
   */
  rebuildsReferencedTable?: boolean;
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

    if (migration.rebuildsReferencedTable) db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(migration.up);
      if (migration.rebuildsReferencedTable) {
        const broken = db.prepare('PRAGMA foreign_key_check').all();
        if (broken.length > 0) {
          throw new Error(`migration ${migration.id} 留下 ${broken.length} 筆無效的外鍵參照`);
        }
      }
      insert.run(migration.id, migration.name);
      db.exec('COMMIT');
      console.log(`[db] applied migration ${migration.id}_${migration.name}`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      if (migration.rebuildsReferencedTable) db.exec('PRAGMA foreign_keys = ON');
    }
  }
}
