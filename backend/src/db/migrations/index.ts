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
  {
    id: 3,
    name: 'create_sources',
    // review_status：待審核 pending／已核准 approved／已退回 rejected（值與 modules/sources/sourceTypes.ts 一致）
    // enabled 與審核狀態獨立，只有「已核准且啟用中」的來源會被擷取；type 的可用值只在應用程式端檢查，方便日後新增類型
    up: `
      CREATE TABLE sources (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL,
        review_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (review_status IN ('pending', 'approved', 'rejected')),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        submitted_by INTEGER NOT NULL REFERENCES users (id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX sources_submitted_by ON sources (submitted_by);
      CREATE INDEX sources_review_status ON sources (review_status);
    `,
  },
  {
    id: 4,
    name: 'add_events_source_foreign_key',
    // SQLite 不能用 ALTER TABLE 加外鍵，所以重建 events：欄位、約束、index 與 published_events view 與 migration 2 相同，
    // 只有 source_id 多了 REFERENCES sources (id)。外鍵啟用時，若既有 events 的 source_id 在 sources 找不到，
    // INSERT 會失敗、整個 migration 回復，請先補上來源或清除這些 events 再重新啟動。
    up: `
      DROP VIEW published_events;

      CREATE TABLE events_new (
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
        source_id INTEGER NOT NULL CHECK (source_id > 0) REFERENCES sources (id),
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

      INSERT INTO events_new (
        id, title, description, category, tags, start_time, end_time, all_day, location, organizer,
        registration_url, source_id, original_url, status, review_reasons, created_at, updated_at
      )
      SELECT
        id, title, description, category, tags, start_time, end_time, all_day, location, organizer,
        registration_url, source_id, original_url, status, review_reasons, created_at, updated_at
      FROM events;

      DROP TABLE events;
      ALTER TABLE events_new RENAME TO events;

      CREATE INDEX events_status_category_start ON events (status, category, start_time);
      CREATE VIEW published_events AS SELECT * FROM events WHERE status = 'published';
    `,
  },
  {
    id: 5,
    name: 'add_source_review_fields',
    // US-14：保存審核結果。reviewed_by／reviewed_at／review_note 在審核前為 NULL；
    // ntou_verified 記錄管理員是否確認來源為海大單位或社團（1 是、0 否、NULL 未審核）。
    up: `
      ALTER TABLE sources ADD COLUMN reviewed_by INTEGER REFERENCES users (id);
      ALTER TABLE sources ADD COLUMN reviewed_at TEXT;
      ALTER TABLE sources ADD COLUMN review_note TEXT;
      ALTER TABLE sources ADD COLUMN ntou_verified INTEGER CHECK (ntou_verified IN (0, 1));
    `,
  },
  {
    id: 6,
    name: 'create_ingestion',
    up: `
      CREATE TABLE raw_announcements (
        id INTEGER PRIMARY KEY,
        source_id INTEGER NOT NULL REFERENCES sources(id),
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        published_at TEXT,
        fetched_at TEXT NOT NULL,
        processed_at TEXT,
        UNIQUE(source_id, url)
      );
      CREATE TABLE ingestion_runs (
        id INTEGER PRIMARY KEY,
        source_id INTEGER NOT NULL REFERENCES sources(id),
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failure')),
        inserted_count INTEGER NOT NULL DEFAULT 0,
        updated_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT
      );
      CREATE INDEX ingestion_runs_source ON ingestion_runs(source_id, id);
    `,
  },
  {
    id: 7,
    name: 'create_category_subscriptions',
    // US-07：使用者訂閱的活動類別，(user_id, category) 為主鍵，同一類別不會重複訂閱。
    // category 值域與 events 相同，由程式 EVENT_CATEGORIES 驗證，不設 CHECK，增減類別不必重建資料表。
    up: `
      CREATE TABLE category_subscriptions (
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, category)
      );

      CREATE INDEX category_subscriptions_category ON category_subscriptions (category);
    `,
  },
  {
    id: 8,
    name: 'create_event_notifications',
    // US-08：event_notification_dispatches 記錄活動是否已派送過通知（每個活動只派送一次）；
    // event_notifications 是每位訂閱者的寄送紀錄，(event_id, user_id) 唯一，同一活動對同一使用者只寄一次。
    // status 的可用值與 modules/subscriptions/subscriptions.notifier.ts 的 NOTIFICATION_STATUSES 一致。
    up: `
      CREATE TABLE event_notification_dispatches (
        event_id INTEGER PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
        dispatched_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE event_notifications (
        id INTEGER PRIMARY KEY,
        event_id INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        sent_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (event_id, user_id)
      );

      CREATE INDEX event_notifications_status ON event_notifications (status);
    `,
  },
];
