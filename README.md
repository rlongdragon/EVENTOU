# EVENTOU

校園活動資訊整合平台。需求文件見 [`docs/需求文件網址.md`](docs/需求文件網址.md)。

## 技術架構

| 部分             | 技術                                                              |
| ---------------- | ----------------------------------------------------------------- |
| 前端 `frontend/` | React 19 + Vite + TypeScript + React Router                       |
| 後端 `backend/`  | Node.js + TypeScript + Express 5（開發時以 `tsx watch` 自動重啟） |
| 程式碼風格       | ESLint（flat config，前後端共用）+ Prettier                       |

採 npm workspaces 單一 repo，根目錄執行指令即可同時管理前後端。

## 環境需求

- Node.js **22 以上**（見 `.nvmrc`）
- npm 10 以上

## 安裝與啟動

```bash
git clone https://github.com/rlongdragon/EVENTOU.git
cd EVENTOU
npm install

# 選用：複製環境變數範本（不複製也會使用預設值）
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

npm run dev
```

- 前端：http://localhost:5173
- 後端：http://localhost:3000（健康檢查 `GET /api/health`）

前端 dev server 會把 `/api` 轉發到後端，首頁會顯示 `/api/health` 的回應，確認前後端已串接。

## 常用指令（在根目錄執行）

| 指令                                           | 說明                               |
| ---------------------------------------------- | ---------------------------------- |
| `npm run dev`                                  | 同時啟動前後端                     |
| `npm run dev:frontend` / `npm run dev:backend` | 只啟動其中一邊                     |
| `npm run lint`                                 | ESLint 檢查前後端                  |
| `npm run typecheck`                            | TypeScript 型別檢查                |
| `npm test`                                     | 執行測試（Node 內建 test runner）  |
| `npm run build`                                | 建置前後端（輸出到各自的 `dist/`） |
| `npm run format` / `npm run format:check`      | Prettier 格式化／檢查              |

## 目錄結構

```text
frontend/src/
├── app/            # Router 與共用版面
├── features/       # 依功能模組分資料夾，每個頁面標示對應 issue
│   ├── auth/           # US-06
│   ├── events/         # US-01、US-02、US-03、US-10、US-11、US-12
│   ├── map/            # US-04
│   ├── subscriptions/  # US-07、US-08
│   ├── calendars/      # US-05、US-09
│   └── sources/        # US-13 ~ US-16
└── shared/         # 跨功能共用元件與 API 呼叫

backend/src/
├── app.ts          # 建立 Express app、掛載各模組 router
├── index.ts        # 啟動 HTTP server 與擷取排程
├── modules/
│   ├── health/         # GET /api/health
│   ├── auth/           # /api/auth          US-06
│   ├── sources/        # /api/sources       US-13 ~ US-16
│   ├── ingestion/      # 背景排程           US-17、US-18
│   ├── events/         # /api/events        US-19、US-20、US-01、US-02、US-03、US-10、US-11
│   ├── subscriptions/  # /api/subscriptions US-07、US-08
│   ├── calendars/      # /api/calendars     US-05、US-09
│   └── map/            # /api/map           US-04
└── shared/
```

## 帳號與權限（US-06）

- 後端 API：`POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`。
- 登入狀態以 httpOnly cookie（`eventou_session`）保存，session 存在 SQLite，有效期 7 天；密碼以 scrypt 雜湊。
- 角色統一定義在 `backend/src/modules/auth/roles.ts`：`user`（一般使用者）、`admin`（管理員）；訪客就是未登入。
- 需登入的 API 掛 `requireAuth`，管理員 API 掛 `requireRole('admin')`（`backend/src/modules/auth/auth.middleware.ts`），handler 內用 `req.user` 取得目前使用者。
- 前端用 `useAuth()` 取得登入狀態，需登入的頁面包在 `<RequireAuth>`（管理員頁面用 `<RequireAuth role="admin">`）。
- 註冊的帳號預設為一般使用者，設為管理員：

```bash
npm run user:set-role -w backend -- someone@example.com admin
```

資料庫為 SQLite（`backend/data/eventou.db`，可用 `DATABASE_PATH` 調整），後端啟動時會自動執行 migration。

## 來源提交（US-13）

- 後端 API：`POST /api/sources`（需登入，提交來源）、`GET /api/sources/mine`（需登入，自己提交的來源與審核狀態）、`GET /api/sources`（訪客與一般使用者只看到已核准的來源，管理員看全部）。
- 提交欄位：`name`（最長 100 字）、`url`（http／https，不可含帳號密碼）、`type`（`school_site`、`department_site`、`club_site`、`social_media`、`other`，定義在 `backend/src/modules/sources/sourceTypes.ts`）。
- 新提交的來源審核狀態一律為 `pending`，並記錄提交者與提交時間；審核狀態（`pending`／`approved`／`rejected`）與啟用狀態（`enabled`）是兩個獨立欄位，只有「已核准且啟用中」的來源會被擷取。US-14、US-16 沿用同一個 `sources` 資料表。
- 前端頁面 `/sources/new`（需登入）：提交表單，以及「我提交的來源」與其審核狀態。

## 來源審核（US-14）

- 後端 API（皆需管理員）：`GET /api/sources`（管理員會看到全部來源，含提交者名稱與審核結果，可用 `?status=pending|approved|rejected` 篩選）、`POST /api/sources/:sourceId/review`。
- 審核內容：`{ "decision": "approved" | "rejected", "ntouVerified": boolean, "note": string }`。依 #22 的建議，**核准前必須確認來源為海大單位或社團**（`ntouVerified: true`），退回不需要；`note` 為選填（最長 500 字）。
- 只有 `pending` 的來源能審核，已審核的來源回傳 `409`。審核者、審核時間、備註與海大確認會保存（migration 5：`reviewed_by`、`reviewed_at`、`review_note`、`ntou_verified`）。
- 審核只改 `review_status`，不改 `enabled`；是否擷取仍要 US-16 的啟用狀態與 US-17 判斷。
- 前端頁面 `/admin/sources`（管理員）：預設顯示待審核來源，可核准或退回，也可切換查看已核准、已退回的來源。

## 來源啟用／停用（US-16）

- 後端 API（需管理員）：`PATCH /api/sources/:sourceId/enabled`，body 為 `{ "enabled": boolean }`。
- 只有 `approved` 的來源能切換，其他審核狀態回傳 `409`；切換不影響 `review_status`。
- **核准即啟用是刻意的決定**：`sources.enabled` 預設為 `1`（US-13 的 schema），來源核准後不需要管理員再按「啟用」就會出現在 `listIngestableSources()`；管理員要暫停擷取時再按「停用」。管理員用 `GET /api/sources` 可看到每個來源目前是否啟用。
- US-17 的排程擷取請用 `listIngestableSources()`（`backend/src/modules/sources/sources.service.ts`）取得來源，只會包含「已核准且啟用中」的來源，停用的來源不會被擷取。
- 前端 `/admin/sources`：已核准的來源會顯示啟用狀態，可按鈕啟用或停用。

## 訂閱活動類別（US-07）

- 後端 API（皆需登入，訪客回傳 `401`）：`GET /api/subscriptions`（所有類別與自己的訂閱狀態）、`PUT /api/subscriptions/:category`（訂閱）、`DELETE /api/subscriptions/:category`（取消訂閱）。三者都回傳 `{ "categories": [{ "category", "label", "subscribed" }] }`。
- `:category` 為類別代碼（`EVENT_CATEGORIES`），不存在的類別回傳 `404`。訂閱與取消都可重複呼叫：重複訂閱不會產生第二筆，取消未訂閱的類別也視為成功。
- 訂閱關係存在 `category_subscriptions`（migration 6），主鍵為 `(user_id, category)`；使用者刪除時一併刪除。類別值域由程式驗證，不設 CHECK。
- US-08 的通知對象請用 `listSubscribersByCategory()`（`backend/src/modules/subscriptions/subscriptions.service.ts`）取得，取消訂閱的使用者不會出現。
- 前端頁面 `/subscriptions`（需登入，訪客會先被導向登入再回來）：「我的訂閱」清單，以及各類別的訂閱狀態與訂閱／取消訂閱按鈕。

## 新活動 Email 通知（US-08）

- 沒有 HTTP API，由後端啟動時開始的背景排程處理（`backend/src/modules/subscriptions/subscriptions.scheduler.ts`），預設每 300 秒一輪，可用 `NOTIFICATION_INTERVAL_SECONDS` 調整。
- 每一輪會從 `published_events` 找出**還沒有派送紀錄**的活動，替當下訂閱該類別的使用者建立寄送紀錄並寄信。是不是「新活動」只看有沒有派送過，不看 upsert 的結果：重跑擷取或活動內容更新不會再寄，`needs_review` 轉為已發布時才第一次通知。
- 不通知的情況：活動已經結束、來源審核狀態不是 `approved`、使用者在活動派送之後才訂閱、寄出前已取消訂閱。
- 資料表（migration 7）：`event_notification_dispatches`（每個活動只派送一次）、`event_notifications`（寄送紀錄，`(event_id, user_id)` 唯一，同一活動對同一使用者只寄一次）。
- 寄送狀態：`pending`（待寄送或待重試）、`sent`、`failed`（試滿 5 次）、`skipped`。失敗原因記在 `last_error`，`pending` 的通知每一輪都會重試；`failed` 的可用 `npm run notifications:retry -w backend` 重新排入。
- 信件內容包含活動標題、時間、地點、活動頁連結、原始公告連結，以及到訂閱頁取消訂閱的連結；連結的網站位址由 `PUBLIC_BASE_URL` 決定。
- 寄信使用 SMTP（`nodemailer`），設定見 `backend/.env.example` 的 `SMTP_*` 與 `MAIL_FROM`。**沒有設定 `SMTP_HOST` 時不會真的寄信**，只把信件內容印在後端主控台，方便本機開發。

## 功能入口與 TODO

US-19 已提供 Event 資料格式、migration、公告清理與轉換、日期解析、驗證及冪等 upsert，供搜尋、行事曆與通知共用。使用 `processAnnouncement` 接合擷取結果。欄位、RawAnnouncement 契約、範例及來源 FK 的接合限制見 [`docs/event-schema.md`](docs/event-schema.md)。擷取排程及各功能 API 仍由各自模組實作。

各功能的入口已預先建立，尚未實作的部分：

- 後端 API 回傳 `501 Not Implemented`，body 帶有負責的 issue 編號。
- 前端頁面以 `TodoPlaceholder` 佔位，連到對應 issue。
- 程式中以 `TODO(#issue編號)` 標記，可用下列指令找出自己負責的部分：

```bash
git grep -n "TODO(#20)"
```

API 路徑為暫定，實作時可依需求調整，但請同步更新前端呼叫與此 README。
