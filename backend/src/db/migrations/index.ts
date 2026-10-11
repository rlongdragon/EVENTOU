import type { Migration } from '../migrate.js';

// 依序列出所有 migration，id 遞增且上線後不可修改，要變更 schema 請新增一筆。
// 例：
// {
//   id: 1,
//   name: 'create_sources',
//   up: `
//     CREATE TABLE sources (
//       id INTEGER PRIMARY KEY,
//       name TEXT NOT NULL,
//       created_at TEXT NOT NULL DEFAULT (datetime('now'))
//     );
//   `,
// },
export const migrations: Migration[] = [];
