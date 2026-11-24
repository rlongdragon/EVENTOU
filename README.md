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
│   ├── auth/           # US-06（海大 CAS 登入，#90）
│   ├── events/         # US-01、US-02、US-03、US-10、US-11、US-12
│   ├── map/            # US-04
│   ├── subscriptions/  # 追蹤 API（行事曆頁使用）
│   ├── calendars/      # 行事曆頁：月曆、追蹤、同步（US-05、US-07、US-09，#76）
│   └── sources/        # US-13 ~ US-16
└── shared/         # 跨功能共用元件與 API 呼叫

backend/src/
├── app.ts          # 建立 Express app、掛載各模組 router
├── index.ts        # 啟動 HTTP server 與擷取排程
├── modules/
│   ├── health/         # GET /api/health
│   ├── auth/           # /api/auth          US-06（海大 CAS 登入，#90）
│   ├── sources/        # /api/sources       US-13 ~ US-16
│   ├── ingestion/      # 背景排程           US-17、US-18
│   ├── events/         # /api/events        US-19、US-20、US-01、US-02、US-03、US-10、US-11
│   ├── subscriptions/  # /api/subscriptions US-07、US-08
│   ├── calendars/      # /api/calendars     US-05、US-09、#76
│   └── map/            # /api/map           US-03、US-04
└── shared/
```

## 校園活動地圖（US-04）

- 前端頁面 `/map` 未登入即可瀏覽，使用共用 Leaflet `MapView` 顯示活動標記；標記密集時會聚合，點選後可查看活動摘要並前往詳細頁。地圖一律以海大為中心顯示，地點對不到校內建物的活動列在地圖下方。標記依活動類別上色並附圖例。
- 底圖：在 `frontend/.env` 設定 `VITE_CARTO_API_KEY` 時使用 CARTO Voyager 圖磚，未設定時使用 OpenStreetMap 標準圖磚。CARTO 金鑰非商業用途免費，到 https://carto.com/basemaps/apikey 用 email 申請；金鑰會出現在前端程式中，請在 CARTO 後台限制可使用的網站，本機開發與正式網站需分別申請。
- `GET /api/map/events?from=YYYY-MM-DD&to=YYYY-MM-DD&category=lecture` 回傳有地點的已發布活動（含 `coordinates` 與對到的建物名稱 `placeName`，對不到時皆為 `null`）、校園中心點 `campus` 及類別選項。`from`、`to` 為台北日期，範圍含兩端，任一端省略即不設限；活動期間與範圍有重疊就會顯示，跨多天的活動在進行中的每一天都查得到（全天活動的 `end_time` 是結束日隔天 00:00，不算進最後一天）；開始日期晚於結束日期時回 400（`invalid_date_range`）。前端預設為今天起 7 天，並提供「今天」「未來 7 天」「未來 30 天」快速選擇，清除篩選後顯示所有日期。`category` 可省略以包含全部類別。
- 座標來自 `backend/src/modules/map/map.places.ts` 的海大建物對照表（名稱、別名、座標，初始資料取自 OpenStreetMap），不呼叫外部地理編碼服務。活動地點文字包含任一別名即算對到，多個符合時取最長的別名。新地點對不到時，把建物或別名補進對照表即可。

## 帳號與權限（US-06、#90）

- 登入一律使用海大 CAS（`https://tccas.ntou.edu.tw/cas`），EVENTOU 不保存密碼，也沒有註冊。CAS 驗證成功只回傳帳號（學生為學號），沒有姓名等其他資料。
- 後端 API：
  - `GET /api/auth/cas/login?redirect=/站內路徑`：導向 CAS 登入頁；`redirect` 只接受站內路徑。
  - `GET /api/auth/cas/callback`：CAS 登入完成後回到這裡，後端以 `serviceValidate` 向 CAS 驗證票證，通過才採用學號；第一次登入自動建立會員資料，之後登入對應到同一筆。失敗時導回 `/login?error=cas`。登入須從同一個瀏覽器發起（`state` 寫在 service 網址與短效 cookie 中），別人取得的票證無法塞進來。
  - `GET /api/auth/me`（需登入）：回傳 `{ user: { id, studentId, email, displayName, role, createdAt } }`，學號只有本人看得到。
  - `PATCH /api/auth/me`（需登入）：body 為 `{ "displayName"?: string, "email"?: string }`，修改顯示名稱（1–50 字）與通知信箱；信箱傳空字串表示不寄通知。
  - `POST /api/auth/logout`：清除站內 session，回傳 `{ casLogoutUrl }`。body 帶 `{ "cas": true }` 時 `casLogoutUrl` 為海大 CAS 的登出網址，前端導過去一併登出 CAS（TronClass 等校內系統也會一起登出），否則為 `null`。
- 預設值：顯示名稱為學號前 5 碼加 `*`，再加上由會員 id 產生的 5 碼短代碼（例如 `01357*-3F2A1`，看得出入學年度與系所，但不露出完整學號；短代碼讓同系同屆的人不會同名，#100），本人在帳號頁看得到完整學號；通知信箱為 `學號@mail.ntou.edu.tw`（`SCHOOL_EMAIL_DOMAIN` 可調整，設為空字串則不預設）。兩者都可在「帳號」頁修改。
- 顯示名稱保留字（#100）：一般使用者的名稱不可包含「管理員」「官方」「站長」「客服」「admin」「moderator」「official」「eventou」等保留字（比對前統一全半形、大小寫並忽略空白與符號）；管理員不受限制。管理員身分改以留言旁的「管理員」徽章表示，徽章依 `users.role` 顯示，不依名稱判斷。
- CAS 只接受 `*.ntou.edu.tw` 的 service 網址，所以 `PUBLIC_BASE_URL` 必須是海大子網域（正式環境為 `https://eventou.ind.ntou.edu.tw`），回呼網址為 `PUBLIC_BASE_URL` + `/api/auth/cas/callback`。
- 開發模式與正式環境的登入頁不同：`npm run dev` 時登入頁是「模擬登入」，輸入任意學號並選角色即可登入，不經 CAS（`POST /api/auth/dev-login`，由 `backend/.env.development` 的 `AUTH_DEV_LOGIN=1` 開啟）；正式建置只有「使用海大帳號登入」。後端在 `NODE_ENV=production` 時一律停用模擬登入。
- 登入狀態以 httpOnly cookie（`eventou_session`）保存，session 存在 SQLite，有效期 7 天。
- 角色統一定義在 `backend/src/modules/auth/roles.ts`：`user`（一般使用者）、`admin`（管理員）；訪客就是未登入。
- 需登入的 API 掛 `requireAuth`，管理員 API 掛 `requireRole('admin')`（`backend/src/modules/auth/auth.middleware.ts`），handler 內用 `req.user` 取得目前使用者。
- 前端用 `useAuth()` 取得登入狀態，需登入的頁面包在 `<RequireAuth>`（管理員頁面用 `<RequireAuth role="admin">`）。
- 測試中要登入的使用者用 `createTestUser()`（`backend/src/modules/auth/auth.testHelpers.ts`）直接建立。
- 新帳號預設為一般使用者。設為管理員時，該學號須先用 CAS 登入過一次：

```bash
npm run user:set-role -w backend -- 01357107 admin
```

資料庫為 SQLite（`backend/data/eventou.db`，可用 `DATABASE_PATH` 調整），後端啟動時會自動執行 migration。

資料庫在各自的電腦上，不在 repo 中，新環境一開始沒有任何來源。要擷取學校公告，先把自己的帳號設為管理員，再一次建立擷取設定中所有海大官方公告列表的來源（已核准、啟用中；已存在相同網址的來源會略過，可重複執行），重開後端後就會開始擷取：

```bash
npm run sources:seed-ntou -w backend -- 01357107
```

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

## 行事曆與追蹤（US-05、US-07、US-08、US-09，#76 整併）

「行事曆」與「訂閱」整併成一個頁面 `/calendars`：每位使用者有一個「我的行事曆」，內容由追蹤決定，可在站內月曆查看，也能一鍵同步到 Google 日曆、Apple 行事曆、Outlook。

### 前端

- `/calendars`（未登入可用）：月曆可切換月份、回到今天，點日期在旁邊（手機版在下方）列出當日活動；可依類別、來源篩選。訪客瀏覽全部活動；登入後可切換「我的行事曆／全部活動」（`?view=all`），月份記在 `?month=YYYY-MM`。
- 每筆活動可「加入我的行事曆」（手動加入）、「從行事曆隱藏」（追蹤帶進來但不想看到）、「還原」，也可「加到 Google 日曆」（開啟 Google 的新增活動畫面，不需要網站有公開網址）或下載 `.ics`。活動詳細頁有同樣的「加入行事曆」區塊。
- 「追蹤」區塊（需登入）：追蹤類別與來源，以及新活動 Email 通知的總開關。
- 「同步到你的行事曆」區塊：登入後提供個人同步網址的一鍵訂閱（Google 日曆、Outlook.com、`webcal://`）、下載 `.ics`、複製與重設網址；訪客可訂閱各類別的公開行事曆。
- **網站在本機或區域網路執行時**（`localhost`、`127.0.0.1`、`192.168.x.x` 等，見 `calendarLinks.ts` 的 `isPrivateOrigin`），Google 日曆、Outlook.com 的伺服器連不到同步網址，畫面會說明原因、停用這兩個按鈕，改提供同一台電腦的行事曆軟體訂閱與下載 `.ics`。部署到公開網址後即可一鍵訂閱。
- 舊網址 `/subscriptions` 導向 `/calendars#follow`，`/calendars/personal/:id` 導向 `/calendars`。
- 類別色在 `frontend/src/shared/eventCategories.css`，地圖與行事曆共用。

### 我的行事曆

- 活動出現在某人的行事曆 = 手動加入，或追蹤了它的類別或來源且沒有被隱藏。只含已發布（`published_events`）且來源已核准的活動；行事曆不另存活動清單，每次即時查詢，新活動會自動出現。
- US-20 合併重複活動後，對被合併那筆活動的標記與對其來源的追蹤，會算到保留的那筆活動上。
- 後端 API：
  - `GET /api/calendars/events?from=YYYY-MM-DD&to=YYYY-MM-DD`（未登入可用）：月曆的活動，活動期間與範圍有重疊就列出，範圍最多 100 天。選填 `scope=mine`（需登入，只列我的行事曆）、`category`、`sourceId`、`hidden=1`（與 `scope=mine` 一起用，一併列出被隱藏的活動）。登入時每筆附上 `mine`、`mark`（`added`／`hidden`／`null`）與 `via`（`{ category, source }`，是否因追蹤而帶進來）。
  - `GET|PUT|DELETE /api/calendars/events/:eventId/mark`（需登入）：查詢、設定（body `{ "state": "added" | "hidden" }`）或移除對活動的標記，皆回傳 `{ mine, mark, via }`。活動不存在或來源未核准回 `404`。
  - `GET /api/calendars/events/:eventId.ics`（未登入可用）：單一活動的 `.ics`（附件下載）。
  - `GET /api/calendars/sources`（未登入可用）：可篩選與追蹤的來源（已核准）。
- 同步網址（iCal）：`GET /api/calendars/feed`（需登入）取得自己的網址路徑，`POST /api/calendars/feed/reset`（需登入）換新網址、舊網址立即失效。`GET /api/calendars/feed/:token.ics` 不需登入：行事曆軟體無法登入，以隨機 token 識別，拿到網址的人都能讀取。

### 類別公開行事曆（US-05）

- `GET /api/calendars/categories`（各類別的代碼、顯示名稱與訂閱路徑）、`GET /api/calendars/categories/:category.ics`（該類別的 iCalendar），皆不需登入，網址不變。
- 只輸出已發布且來源已核准的活動；每個活動的 UID 為 `event-<活動 id>@eventou`，活動更新時 id 不變，行事曆軟體會視為同一筆並更新內容。時間以 UTC 輸出，全天活動以 `VALUE=DATE` 輸出，結束日為排他的隔天。
- `.ics` 的產生邏輯在 `backend/src/modules/calendars/calendars.ics.ts` 的 `buildCalendar`，我的行事曆與單一活動下載也沿用。

### 追蹤與 Email 通知（US-07、US-08）

- 後端 API（皆需登入）：`GET /api/subscriptions`、`PUT|DELETE /api/subscriptions/:category`（追蹤類別）、`PUT|DELETE /api/subscriptions/sources/:sourceId`（追蹤來源，只能追蹤已核准的來源）、`PATCH /api/subscriptions/settings`（body `{ "emailNotifications": boolean }`）。全部回傳 `{ categories: [{ category, label, subscribed }], sources: [{ id, name, type, followed }], emailNotifications }`。重複追蹤或取消都視為成功。
- 通知對象為追蹤該活動類別或來源、有通知信箱、且沒有關閉 Email 通知的使用者（`listEventSubscribers()`，`backend/src/modules/subscriptions/subscriptions.service.ts`），同一人只算一次。
- 新活動通知由後端背景排程處理（`subscriptions.scheduler.ts`），預設每 5 分鐘一輪，可用 `NOTIFICATION_INTERVAL_MS`（毫秒，預設 `300000`）調整。每一輪從 `published_events` 找出**還沒有派送紀錄**的活動建立寄送紀錄並寄信：重跑擷取或活動內容更新不會再寄，`needs_review` 轉為已發布時才第一次通知。
- 不通知的情況：活動已經結束、來源審核狀態不是 `approved`、使用者在活動派送之後才追蹤、寄出前已取消追蹤、關閉通知或清空通知信箱。
- 寄送狀態：`pending`（待寄送或待重試）、`sent`、`failed`（試滿 5 次）、`skipped`。`failed` 的可用 `npm run notifications:retry -w backend` 重新排入。
- 信件說明收到通知的原因（追蹤的類別或來源），並附活動頁、原始公告與行事曆頁（取消追蹤、關閉通知）的連結；網站位址由 `PUBLIC_BASE_URL` 決定。
- 寄信使用 SMTP（`nodemailer`），設定見 `backend/.env.example` 的 `SMTP_*` 與 `MAIL_FROM`。**沒有設定 `SMTP_HOST` 時不會真的寄信**，只把信件內容印在後端主控台。

### 資料表

- `category_subscriptions`（migration 7）：追蹤的類別。
- `event_notification_dispatches`、`event_notifications`（migration 8）：通知派送與寄送紀錄，同一活動對同一使用者只寄一次。
- migration 14：`source_follows`（追蹤的來源）、`calendar_event_marks`（對單一活動的 `added`／`hidden` 標記）、`user_calendar_settings`（同步網址 token 與 Email 通知開關，沒有資料列時視為通知開啟）。同時移除 US-09 的多個個人行事曆與標籤條件（`personal_calendars` 等三張表），舊的個人行事曆同步網址隨之失效。

## 活動留言（US-10、#79）

- 後端 API（`:eventId` 須為已發布的活動；活動不存在、待審（`needs_review`）或 id 無效時回傳 `404`）：
  - `GET /api/events/:eventId/comments?sort=oldest|newest|top`（未登入可看）：回傳 `{ comments, total }`。頂層留言依 `sort` 排序（預設 `oldest`；`top` 依讚數，同讚數較新的在前），每則的 `replies` 為它的回覆（由舊到新）；`total` 為對外顯示的留言數（含回覆）。
  - `POST /api/events/:eventId/comments`（需登入）：body 為 `{ "content": string, "parentId"?: number }`，帶 `parentId` 時為回覆。只有一層回覆：回覆「回覆」會掛到同一則頂層留言；要回覆的留言不存在、屬於其他活動或已刪除時回 `404`。
  - `PATCH /api/events/:eventId/comments/:commentId`（需登入）：留言者編輯自己的留言，body 為 `{ "content": string }`；別人的留言回 `403`；留言有待審的檢舉時回 `409 under_review`，審核完成前不能編輯（#87，避免把內容改成無害來躲過審核）。
  - `DELETE /api/events/:eventId/comments/:commentId`（需登入）：留言者刪除自己的留言，或管理員刪除任何留言，成功回 `204`；一般使用者刪除別人的留言回 `403`。
  - `PUT`／`DELETE /api/events/:eventId/comments/:commentId/like`（需登入）：按讚／取消讚，可重複呼叫，回傳 `{ likeCount, likedByMe }`。
- 留言內容會去除前後空白，空白留言回傳 `400 validation_error`（`fields.content`），上限 1000 字元。
- 每則留言回傳 `id`、`parentId`、`content`、`createdAt`、`editedAt`（未編輯為 `null`，時間皆為 `+08:00` 的 ISO 字串）、留言者 `author`（`id`、`displayName`、`role`，不含 email；`role` 為 `admin` 時前端顯示管理員徽章）、留言者目前對該活動的評分 `rating`（1–5，未評分為 `null`，來自 US-11 的 `event_ratings`）、`likeCount`、`likedByMe`（訪客一律 `false`）、`removed` 與 `replies`。
- 刪除與隱藏：留言者刪除記為 `deleted_at`；管理員刪除別人的留言記為隱藏（`hidden_at`、`hidden_by`），該留言的待審檢舉一併以「已隱藏」結案。已刪除或隱藏的留言不能再編輯、按讚、回覆或檢舉；頂層留言若仍有回覆，以 `removed: true` 的佔位保留位置（`content`、`author` 為 `null`），回覆照常顯示，沒有回覆的則不列出。
- 資料表：`event_comments`（migration 9；活動或使用者刪除時留言一併刪除），migration 15 新增 `parent_id`、`edited_at`、`deleted_at` 與 `comment_likes`（每人對每則留言最多一個讚）。
- 前端在活動頁（`/events/:eventId`）下方顯示留言：輸入框在最上方（Ctrl／⌘ + Enter 送出），可切換排序；每則留言顯示星等、讚與「回覆」，「⋯」選單依身分列出「編輯」「刪除」（自己的留言，管理員可刪除任何留言）與「檢舉」（別人的留言）。回覆超過兩則時預設收合。訪客看得到讚數，按讚與留言會導向登入。

## 留言檢舉（#65）

- `POST /api/events/:eventId/comments/:commentId/reports`（需登入），body 為 `{ "reason": "spam" | "abusive" | "off_topic" | "other", "note"?: string }`，成功回 `201`。補充說明會去除前後空白，上限 500 字元。
  - 原因不合法或補充說明過長回 `400 validation_error`（`fields.reason`／`fields.note`）；檢舉自己的留言回 `400 own_comment`；同一人重複檢舉同一則回 `409 already_reported`（例外：檢舉結案後留言又被編輯過時可以重新檢舉，原檢舉改回待審，#87）；活動或留言不存在、留言不屬於該活動或已被隱藏或刪除回 `404`。
- 管理員 API（`requireRole('admin')`）：
  - `GET /api/events/comment-reports`：列出有待審檢舉的留言（留言者已自行刪除的不列出），每筆含留言內容與留言者、所屬活動、檢舉次數、各原因次數與補充說明（不含檢舉者身分）。
  - `POST /api/events/comment-reports/:commentId/hide`：隱藏留言；`POST /api/events/comment-reports/:commentId/dismiss`：駁回檢舉。同一則留言的待審檢舉一併結案，回傳更新後的清單；沒有待審檢舉時回 `404`。
- 資料表（migration 13）：`comment_reports`（`(comment_id, reporter_id)` 唯一，狀態 `pending`／`hidden`／`dismissed`，記錄審核者與時間），`event_comments` 新增 `hidden_at`、`hidden_by`。
- 前端：活動頁別人留言的「⋯」選單中的「檢舉」開啟視窗選擇原因與補充說明；管理員在導覽列「留言檢舉」（`/admin/comment-reports`）審核。

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

活動詳細頁的 `GET /api/map/events/:eventId/location` 依已發布活動的地點，從同一份建物對照表回傳 `{ coordinates, placeName }`；沒有地點或對不到建物時皆為 `null`。底圖設定同上方「校園活動地圖」一節。
