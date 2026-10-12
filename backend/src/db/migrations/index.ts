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
  {
    id: 2,
    name: 'create_events',
    // Source 尚未有資料表；來源模組定案後須以新 migration 補上外鍵。
    // category 值域由程式 EVENT_CATEGORIES 驗證，不設 CHECK，增減類別不必重建資料表。
    up: `
      CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category TEXT,
        tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
        start_time TEXT,
        end_time TEXT,
        all_day INTEGER NOT NULL CHECK (all_day IN (0, 1)),
        location TEXT,
        organizer TEXT,
        registration_url TEXT,
        source_id INTEGER NOT NULL CHECK (source_id > 0),
        original_url TEXT NOT NULL CHECK (length(trim(original_url)) > 0),
        status TEXT NOT NULL CHECK (status IN ('published', 'needs_review')),
        review_reasons TEXT NOT NULL DEFAULT '[]'
          CHECK (json_valid(review_reasons) AND json_type(review_reasons) = 'array'),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (source_id, original_url),
        CHECK (status != 'published' OR (
          length(trim(title)) > 0 AND category IS NOT NULL AND start_time IS NOT NULL
          AND json_array_length(review_reasons) = 0
        ))
      );

      CREATE INDEX events_status_category_start ON events (status, category, start_time);
      CREATE VIEW published_events AS SELECT * FROM events WHERE status = 'published';
    `,
  },
];
