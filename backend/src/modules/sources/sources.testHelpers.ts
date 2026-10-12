import type { DatabaseSync } from 'node:sqlite';

/**
 * 測試用：建立一位使用者與 count 個來源（id 從 1 開始），
 * 給需要 events.source_id 外鍵對得到 sources 的測試使用。
 */
export function seedSources(db: DatabaseSync, count = 1): void {
  db.prepare(
    "INSERT INTO users (email, password_hash, display_name) VALUES ('seed@example.com', 'x', 'seed')",
  ).run();
  const insert = db.prepare(
    "INSERT INTO sources (name, url, type, submitted_by) VALUES (?, ?, 'other', 1)",
  );
  for (let i = 1; i <= count; i += 1) {
    insert.run(`測試來源 ${i}`, `https://example.com/source-${i}`);
  }
}
