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

## 功能入口與 TODO

US-19 已提供 Event 資料格式、migration、公告清理與轉換、日期解析、驗證及冪等 upsert，供搜尋、行事曆與通知共用。專案活動範圍為國立臺灣海洋大學；使用 `processAnnouncement` 接合擷取結果。欄位、RawAnnouncement 契約、範例及來源 FK 的接合限制見 [`docs/event-schema.md`](docs/event-schema.md)。擷取排程及各功能 API 仍由各自模組實作。

各功能的入口已預先建立，尚未實作的部分：

- 後端 API 回傳 `501 Not Implemented`，body 帶有負責的 issue 編號。
- 前端頁面以 `TodoPlaceholder` 佔位，連到對應 issue。
- 程式中以 `TODO(#issue編號)` 標記，可用下列指令找出自己負責的部分：

```bash
git grep -n "TODO(#20)"
```

API 路徑為暫定，實作時可依需求調整，但請同步更新前端呼叫與此 README。
