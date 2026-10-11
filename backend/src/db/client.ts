import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// SQLite 連線（Node 內建 node:sqlite，不需額外套件）
// 路徑由環境變數 DATABASE_PATH 指定，預設為 backend/data/eventou.db；
// 設為 :memory: 則使用記憶體資料庫（測試用）

const DEFAULT_DATABASE_PATH = 'data/eventou.db';

let db: DatabaseSync | undefined;

/**
 * 取得共用的資料庫連線，第一次呼叫時才建立。
 */
export function getDb(): DatabaseSync {
  if (!db) {
    const path = process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH;
    if (path === ':memory:') {
      db = new DatabaseSync(path);
    } else {
      const absolutePath = resolve(path);
      mkdirSync(dirname(absolutePath), { recursive: true });
      db = new DatabaseSync(absolutePath);
    }
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
  }
  return db;
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
