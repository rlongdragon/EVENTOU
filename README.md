# EVENTOU

<img width="1448" height="1086" alt="image" src="https://github.com/user-attachments/assets/cb3dfb6d-dc99-482d-8710-bd92948942fe" />

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
│   └── map/            # /api/map           US-03、US-04
└── shared/
```

## 校園活動地圖（US-04）

- 前端頁面 `/map` 未登入即可瀏覽，使用共用 Leaflet `MapView` 顯示活動標記；標記密集時會聚合，點選後可查看活動摘要並前往詳細頁。地圖一律以海大為中心顯示，地點對不到校內建物的活動列在地圖下方。
- `GET /api/map/events?date=YYYY-MM-DD&category=lecture` 回傳有地點的已發布活動（含 `coordinates` 與對到的建物名稱 `placeName`，對不到時皆為 `null`）、校園中心點 `campus` 及類別選項。`date` 以台北時區活動開始日期篩選，省略時包含所有日期；前端預設顯示今天，清除篩選後顯示所有日期。`category` 可省略以包含全部類別。
- 座標來自 `backend/src/modules/map/map.places.ts` 的海大建物對照表（名稱、別名、座標，初始資料取自 OpenStreetMap），不呼叫外部地理編碼服務。活動地點文字包含任一別名即算對到，多個符合時取最長的別名。新地點對不到時，把建物或別名補進對照表即可。

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

## 來源風險提示（US-15）

- 後端 API：`GET /api/sources/:sourceId/risk`。管理員可查看任何來源的風險等級、分數與原因；其他人（含訪客）只能查看已核准來源的風險等級（`{ "level" }`），未核准的來源回傳 `404`。`GET /api/sources` 的每個來源也帶有 `risk`（管理員為完整結果，其他人只有等級）；`GET /api/sources/mine` 只有已核准的來源帶風險等級，未核准為 `null`。
- 規則式評估，規則與門檻定義在 `backend/src/modules/sources/sources.risk.ts`，修改時請同步更新此表：

  | 規則                                        | 分數 |
  | ------------------------------------------- | ---- |
  | 已被管理員退回                              | 60   |
  | 尚未通過管理員審核                          | 30   |
  | 網址未使用 HTTPS                            | 20   |
  | 最近連續 3 次以上擷取失敗（視為無法存取）   | 30   |
  | 最近一次擷取失敗（連續未達 3 次）           | 20   |
  | 最近 10 次擷取失敗率 ≥ 50%（至少 3 次紀錄） | 20   |
  | 最近 10 次擷取失敗率 ≥ 20%（至少 3 次紀錄） | 10   |
  | 已核准但已停用                              | 10   |
  | 已核准但尚無擷取紀錄                        | 5    |

- 擷取相關規則只套用在已核准的來源，資料來自 US-17 的 `ingestion_runs`（只計 `success`／`failure`，不計執行中）。可存取性以擷取結果判斷，不另外發送連線檢查。
- 總分 0–19 為低風險、20–49 為中風險、50 以上為高風險；原因依分數由高到低排列，第一項為主要原因。
- 風險只是提示，**不會**改變審核狀態或啟用狀態，也不影響擷取；最終決定仍由管理員審核。
- 前端 `/admin/sources`：每個來源顯示風險等級與原因；`/sources/new` 的「我提交的來源」顯示已核准來源的風險等級。

## 類別公開行事曆（US-05）

- 後端 API（皆不需登入）：`GET /api/calendars/categories`（各類別的代碼、顯示名稱與訂閱路徑）、`GET /api/calendars/categories/:category.ics`（該類別的 iCalendar，`Content-Type: text/calendar`）。
- 每個類別一個固定網址，類別代碼見 `EVENT_CATEGORIES`（`lecture`、`workshop`、`exhibition`、`sports`、`welfare`）；不存在的類別回傳 `404`，沒有活動的類別回傳合法的空行事曆。
- 只輸出已發布（`published_events`）且來源審核狀態為 `approved` 的活動；活動轉為待審或來源被退回後，下次同步就會從行事曆消失。
- 每個活動的 UID 為 `event-<活動 id>@eventou`，活動更新時 id 不變，行事曆軟體會視為同一筆並更新內容。
- 時間以 UTC 輸出（不需 VTIMEZONE）；全天活動以 `VALUE=DATE` 輸出，結束日為排他的隔天。
- `.ics` 的產生邏輯在 `backend/src/modules/calendars/calendars.ics.ts` 的 `buildCalendar`，US-09 的個人行事曆也沿用。
- 前端頁面 `/calendars`：列出各類別的訂閱網址，提供「複製網址」與「訂閱行事曆」（`webcal://`）。Google Calendar 等線上服務需要能從外部連到的網址，本機的 `localhost` 網址無法訂閱。

## 個人行事曆（US-09）

- 後端 API（需登入，訪客回傳 `401`）：`GET /api/calendars/personal`（自己的行事曆）、`POST /api/calendars/personal`（建立）、`GET /api/calendars/personal/:calendarId`（行事曆與目前符合條件的活動）、`PUT /api/calendars/personal/:calendarId`（修改）、`DELETE /api/calendars/personal/:calendarId`（刪除）。
- 建立與修改的 body 為 `{ "name": string, "categories": string[], "tags": string[] }`：名稱最長 50 字，類別為 `EVENT_CATEGORIES` 的代碼，標籤最多 20 個、每個最長 30 字，類別與標籤至少要有一個；不符合時回傳 `400 validation_error`。每位使用者最多 20 個行事曆，超過回傳 `409 limit_reached`。
- 篩選規則：類別之間、標籤之間是「任一符合」；同時指定類別與標籤時，活動要兩者都符合。標籤以與活動相同的方式正規化（全形轉半形、去除前後空白）後比對。
- 行事曆只存條件，活動每次都從 `published_events`（且來源已核准）即時查詢，新活動符合條件時會自動出現。
- 只能查看與管理自己的行事曆；別人的行事曆或不存在的 id 一律回傳 `404`。
- iCal 訂閱（不需登入）：`GET /api/calendars/personal/:token.ics`。行事曆軟體無法登入，所以用隨機 token 當網址，拿到網址的人都能讀取；修改條件不會改變網址，刪除行事曆後網址失效。產生邏輯沿用 US-05 的 `buildCalendar`。
- `GET /api/calendars/tags`（不需登入）：已發布活動中出現過的所有標籤，供選擇條件。
- 資料表（migration 11）：`personal_calendars`、`personal_calendar_categories`、`personal_calendar_tags`；使用者或行事曆刪除時條件一併刪除。
- 前端：`/calendars` 的「個人行事曆」區塊可建立與列出行事曆（訪客看到登入提示）；`/calendars/personal/:calendarId`（需登入）顯示符合條件的活動與訂閱網址，可編輯條件或刪除。

## 訂閱活動類別（US-07）

- 後端 API（皆需登入，訪客回傳 `401`）：`GET /api/subscriptions`（所有類別與自己的訂閱狀態）、`PUT /api/subscriptions/:category`（訂閱）、`DELETE /api/subscriptions/:category`（取消訂閱）。三者都回傳 `{ "categories": [{ "category", "label", "subscribed" }] }`。
- `:category` 為類別代碼（`EVENT_CATEGORIES`），不存在的類別回傳 `404`。訂閱與取消都可重複呼叫：重複訂閱不會產生第二筆，取消未訂閱的類別也視為成功。
- 訂閱關係存在 `category_subscriptions`（migration 7），主鍵為 `(user_id, category)`；使用者刪除時一併刪除。類別值域由程式驗證，不設 CHECK。
- US-08 的通知對象請用 `listSubscribersByCategory()`（`backend/src/modules/subscriptions/subscriptions.service.ts`）取得，取消訂閱的使用者不會出現。
- 前端頁面 `/subscriptions`（需登入，訪客會先被導向登入再回來）：「我的訂閱」清單，以及各類別的訂閱狀態與訂閱／取消訂閱按鈕。

## 新活動 Email 通知（US-08）

- 沒有 HTTP API，由後端啟動時開始的背景排程處理（`backend/src/modules/subscriptions/subscriptions.scheduler.ts`），預設每 5 分鐘一輪，可用 `NOTIFICATION_INTERVAL_MS`（毫秒，預設 `300000`）調整。
- 每一輪會從 `published_events` 找出**還沒有派送紀錄**的活動，替當下訂閱該類別的使用者建立寄送紀錄並寄信。是不是「新活動」只看有沒有派送過，不看 upsert 的結果：重跑擷取或活動內容更新不會再寄，`needs_review` 轉為已發布時才第一次通知。
- 不通知的情況：活動已經結束、來源審核狀態不是 `approved`、使用者在活動派送之後才訂閱、寄出前已取消訂閱。
- 資料表（migration 8）：`event_notification_dispatches`（每個活動只派送一次）、`event_notifications`（寄送紀錄，`(event_id, user_id)` 唯一，同一活動對同一使用者只寄一次）。
- 寄送狀態：`pending`（待寄送或待重試）、`sent`、`failed`（試滿 5 次）、`skipped`。失敗原因記在 `last_error`，`pending` 的通知每一輪都會重試；`failed` 的可用 `npm run notifications:retry -w backend` 重新排入。
- 信件內容包含活動標題、時間、地點、活動頁連結、原始公告連結，以及到訂閱頁取消訂閱的連結；連結的網站位址由 `PUBLIC_BASE_URL` 決定。
- 寄信使用 SMTP（`nodemailer`），設定見 `backend/.env.example` 的 `SMTP_*` 與 `MAIL_FROM`。**沒有設定 `SMTP_HOST` 時不會真的寄信**，只把信件內容印在後端主控台，方便本機開發。

## 活動留言（US-10）

- 後端 API：`GET /api/events/:eventId/comments`（未登入可看）、`POST /api/events/:eventId/comments`（需登入，body 為 `{ "content": string }`）。
- 只有已發布的活動能看與留言；活動不存在、待審（`needs_review`）或 id 無效時回傳 `404`。
- 留言內容會去除前後空白，空白留言回傳 `400 validation_error`（`fields.content`），上限 1000 字元。
- 留言依時間由舊到新排序；每則留言回傳 `id`、`content`、`createdAt`（`+08:00` 的 ISO 字串）與留言者 `author`（`id`、`displayName`，不含 email）。
- 資料表（migration 9）：`event_comments`，活動或使用者刪除時留言一併刪除。
- 前端在活動頁（`/events/:eventId`）下方顯示留言列表；訪客看到登入提示，登入後才出現留言輸入框。

## 活動評價（US-11）

- 後端 API：`GET /api/events/:eventId/ratings`（未登入可看）、`PUT /api/events/:eventId/ratings`（需登入，body 為 `{ "score": 1-5 }`）。
- 回應為 `{ "rating": { "average", "count", "myScore" } }`：`average` 四捨五入到小數第一位，沒有評價時為 `null`；`myScore` 是目前使用者的評分，訪客或尚未評分時為 `null`。
- 每位使用者對同一活動只有一筆評價，再次 `PUT` 即修改；分數不是 1–5 的整數時回傳 `400 validation_error`（`fields.score`）。
- 只有已發布的活動能看與評分；活動不存在、待審或 id 無效時回傳 `404`。
- 資料表（migration 10）：`event_ratings`，`(event_id, user_id)` 為主鍵。
- 前端在活動頁顯示星等、平均分數與評價人數；登入後可點星星評分或修改，訪客看到登入提示。

## 分享活動連結（US-12）

- 活動頁的固定網址為 `<網站 origin>/events/:eventId`（`frontend/src/features/events/eventShare.ts`），不帶查詢字串或 hash，開啟不需登入。
- 活動頁的「分享」按鈕會把固定網址複製到剪貼簿並顯示「已複製」；瀏覽器不允許存取剪貼簿時（例如非 HTTPS），改顯示網址讓使用者手動複製。

## 跨來源重複活動偵測（US-20）

- 新活動寫入（`processAnnouncement`）後，與開始日期前後 1 天內、其他已核准來源的已發布活動比對重複分數：高信心自動合併、中信心標記「可能重複」交給管理員。規則、門檻與 precision／recall 驗證結果見 [`docs/dedup.md`](docs/dedup.md)。
- 合併掉的活動不會出現在 `published_events`，所以搜尋、行事曆與通知都自動排除；`GET /api/events/:eventId` 的 `sources` 列出活動的所有來源，活動頁顯示全部原始公告。
- 管理員 API：`GET /api/events/duplicates`、`POST /api/events/duplicates/:eventId/merge`（確認合併）、`POST /api/events/duplicates/:eventId/split`（拆開或還原誤合併）；前端頁面 `/admin/duplicates`。
- 門檻用 `DEDUP_HIGH_THRESHOLD`（預設 0.75）、`DEDUP_LOW_THRESHOLD`（預設 0.5）設定。
- 資料（migration 12）：`events` 新增 `duplicate_of`、`dedup_status`、`dedup_score`，新增 `event_distinct_pairs`。

## 自動擷取設定（US-18，第一部分）

- 擷取設定改用統一格式 `ExtractionConfig`（`backend/src/modules/ingestion/ingestion.extraction.ts`）：靜態 HTML 沿用 US-17 的 `ScraperConfig`（`kind` 省略或 `'html'`），另有 `kind: 'feed'`（RSS／Atom）與 `kind: 'ical'`（iCalendar）。US-17 的 `IngestionService` 依 `kind` 選擇擷取器，輸出一律是 `RawAnnouncement`，人工寫的與自動產生的設定不需區分。
- `detectSourceType` 依網址與回應內容判斷來源類型：iCalendar、RSS／Atom（含頁面宣告的 feed 連結）、一般 HTML、無法判斷（含需要執行 JavaScript 的頁面）。
- `generateExtractionConfig` 抓取來源、偵測類型並產生設定；內容沒有可用項目，或類型無法判斷時，回傳 `manual_required` 與原因，不丟例外。
- 目前尚未包含：靜態 HTML 的選擇器推測、核准後自動觸發、設定存檔、試跑預覽與管理介面（第二個 PR）。自動產生的設定在那之前不會被排程使用。
- 詳細規則、限制與測試範例見 [`docs/ingestion.md`](docs/ingestion.md)。

## 功能入口與 TODO

US-17 已提供每小時背景擷取、原始公告 upsert、擷取紀錄與 US-19 接合。管理員可使用 `POST /api/ingestion/:sourceId/fetch` 手動擷取，以及 `GET /api/ingestion/:sourceId/runs` 查看最近 100 筆紀錄。人工來源設定、環境變數與操作方式見 [`docs/ingestion.md`](docs/ingestion.md)。

US-19 已提供 Event 資料格式、migration、公告清理與轉換、日期解析、驗證及冪等 upsert，供搜尋、行事曆與通知共用。使用 `processAnnouncement` 接合擷取結果。欄位、RawAnnouncement 契約、範例及來源 FK 的接合限制見 [`docs/event-schema.md`](docs/event-schema.md)。其他功能 API 由各自模組實作。

各功能的入口已預先建立，尚未實作的部分：

- 後端 API 回傳 `501 Not Implemented`，body 帶有負責的 issue 編號。
- 前端頁面以 `TodoPlaceholder` 佔位，連到對應 issue。
- 程式中以 `TODO(#issue編號)` 標記，可用下列指令找出自己負責的部分：

```bash
git grep -n "TODO(#20)"
```

API 路徑為暫定，實作時可依需求調整，但請同步更新前端呼叫與此 README。

活動詳細頁的 `GET /api/map/events/:eventId/location` 依已發布活動的地點，從同一份建物對照表回傳 `{ coordinates, placeName }`；沒有地點或對不到建物時皆為 `null`。地圖使用 OpenStreetMap 圖磚。
