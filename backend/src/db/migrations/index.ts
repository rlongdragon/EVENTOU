import type { Migration } from '../migrate.js';

// 依序列出所有 migration，id 遞增且上線後不可修改，要變更 schema 請新增一筆。
export const migrations: Migration[] = [
  {
    id: 1,
    name: 'create_users_and_sessions',
    // role 的可用值與 modules/auth/roles.ts 的 ROLES 一致；訪客為未登入狀態，不存進資料庫
    // sessions.id 存的是 session token 的 SHA-256，不存原始 token
    up: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX sessions_user_id ON sessions (user_id);
    `,
  },
];
