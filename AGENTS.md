# AGENTS.md

給 AI coding agent（Codex、Claude Code、Copilot 等）與新組員的專案說明。專案架構或流程有變動時，請同步更新本文件。

## 專案簡介

EVENTOU 是校園活動資訊聚合與訂閱系統：自動蒐集分散在各來源的校園活動公告，整理成統一格式，讓使用者透過搜尋、iCalendar 訂閱與 Email 通知取得。

核心資料流程：

```text
Source（已核准且啟用中）
  └─ 定期擷取（US-17）→ RawAnnouncement
       └─ 清理／擷取欄位／分類／驗證（US-19）→ Event
            └─ 搜尋（US-01）、iCal（US-05）、Email 通知（US-08）
```

- **Source**：資訊來源。審核狀態（待審核／已核准／已退回）與啟用狀態（啟用中／已停用）是兩個獨立欄位，只有「已核准且啟用中」的來源會被擷取。
- **RawAnnouncement**：擷取到的原始公告，以 `(source_id, url)` 為唯一鍵 upsert。
- **Event**：統一格式的活動資料，以 `(source_id, original_url)` 為唯一鍵 upsert；缺必填欄位時標記 `needs_review`，不對外顯示。

搜尋、行事曆、通知都讀同一份 Event，不要各自另存一份活動資料。

## 目錄結構

npm workspaces 單一 repo，前後端各是一個 workspace。

```text
frontend/               # React 19 + Vite + TypeScript + React Router
└── src/
    ├── app/            # router 與共用版面（Layout）
    ├── features/       # 依功能分資料夾：auth events map subscriptions calendars sources
    └── shared/         # 跨功能共用元件與 API 呼叫
backend/                # Node.js + TypeScript + Express 5
└── src/
    ├── app.ts          # 建立 Express app、掛載 /api/* 各模組 router
    ├── index.ts        # 啟動 HTTP server 與擷取排程
    ├── modules/        # health auth sources ingestion events subscriptions calendars map
    └── shared/         # 跨模組共用程式
docs/                   # 需求文件（SRD）與 User Story 分工
eslint.config.js        # 前後端共用的 ESLint flat config
```

- `frontend/` 只負責畫面與呼叫 `/api`；dev server 會把 `/api` proxy 到後端。
- `backend/` 負責 API、資料存取與背景擷取排程，所有 API 都掛在 `/api` 底下。
- 新功能放進對應的 `features/<模組>/` 與 `modules/<模組>/`；各模組對應的 User Story 與負責人見 `README.md` 與 `docs/user-story-分工.md`。

## 常用指令

需要 Node.js 22 以上（見 `.nvmrc`）、npm 10 以上。所有指令都在 repo 根目錄執行。

| 指令                                           | 說明                                 |
| ---------------------------------------------- | ------------------------------------ |
| `npm install`                                  | 安裝前後端所有相依套件               |
| `npm run dev`                                  | 同時啟動前端（:5173）與後端（:3000） |
| `npm run dev:frontend` / `npm run dev:backend` | 只啟動其中一邊                       |
| `npm run lint`                                 | ESLint 檢查前後端                    |
| `npm run typecheck`                            | TypeScript 型別檢查                  |
| `npm run build`                                | 建置前後端（輸出到各自的 `dist/`）   |
| `npm run format` / `npm run format:check`      | Prettier 格式化／檢查                |

- 啟動後可用 `curl localhost:5173/api/health` 確認前後端已串接。
- 目前**尚未設定測試框架**，沒有 `npm test`；加入測試時請同步更新本節。
- 提交前請確認 `npm run lint`、`npm run typecheck`、`npm run build`、`npm run format:check` 都通過。

## 程式碼慣例

- **TypeScript**：前後端皆為 ESM（`"type": "module"`），開啟 `verbatimModuleSyntax`、`noUnusedLocals`、`noUnusedParameters`；後端另開 `strict`。
  - 只匯入型別時用 `import type`。
  - 後端（`moduleResolution: nodenext`）的相對匯入要寫 `.js` 副檔名，例如 `./modules/auth/auth.router.js`；前端不寫副檔名。
  - 用不到的參數以 `_` 開頭（例如 `_req`）。
- **命名**：
  - React 元件與其檔案用 PascalCase（`LoginPage.tsx`），一律使用具名匯出，不用 default export。
  - 其他檔案用 camelCase（`notImplemented.ts`）；後端模組檔案為 `<模組>.<角色>.ts`（`auth.router.ts`、`ingestion.scheduler.ts`）。
  - 變數與函式用 camelCase，型別與介面用 PascalCase。
- **格式**：Prettier（單引號、分號、trailing comma、行寬 100）；`.editorconfig` 規定 2 空格縮排、LF 換行、UTF-8。不要手動調整格式，執行 `npm run format`。
- **ESLint**：根目錄的 `eslint.config.js` 為前後端共用設定；不要在子目錄另建設定，也不要用 `eslint-disable` 迴避錯誤。
- **尚未實作的功能**：後端入口以 `notImplemented('#issue')` 回傳 501，前端頁面以 `TodoPlaceholder` 佔位，程式中以 `TODO(#issue編號)` 標記。實作時把佔位換成真正的內容並移除該 TODO；可用 `git grep -n "TODO(#20)"` 找出某個 issue 的入口。
- API 路徑有變動時，同步更新前端呼叫與 `README.md`。
- 註解與文件使用繁體中文，識別字使用英文。

## Git 流程

- **分支**：從最新的 `main` 開分支，命名為 `<類型>/<issue 編號>-<英文簡述>`，類型對應 issue 類別：`feature/`（US-xx）、`task/`（T-xx）、`bug/`。例如 `task/25-project-scaffold`。
- **Commit 訊息**：採 Conventional Commits，格式為 `<type>: <摘要>`，type 用 `feat`、`fix`、`docs`、`refactor`、`test`、`chore`。例如 `docs: add AGENTS.md`。
- **Pull Request**：
  - 一律透過 PR 合併到 `main`，並經至少一位組員 Code Review。
  - 標題或內文註明對應的 Issue（US-xx／T-xx），內文以 `Closes #<issue 編號>` 連結，合併時會自動關閉 issue。
  - 內文附上已執行的檢查（lint、typecheck、build）與結果。

## 需求文件

- SRD（軟體需求文件）：[`docs/需求文件網址.md`](docs/需求文件網址.md)（SRD 全文，原稿在 HackMD；功能需求 FR-xx 對應 US-xx）
- User Story 分工與難易度：[`docs/user-story-分工.md`](docs/user-story-分工.md)
- GitHub Project（看板與進度）：https://github.com/users/rlongdragon/projects/1
- Issues：https://github.com/rlongdragon/EVENTOU/issues

實作某個 User Story 前，先讀對應 issue 的驗收條件與 SRD 中的相關功能需求。

## 注意事項與禁止事項

- **不可提交 `.env`** 或任何密鑰、token、密碼；需要新的環境變數時，把名稱與範例值加進 `backend/.env.example` 或 `frontend/.env.example`。
- **不可直接 push 到 `main`**，也不可 force push 共用分支。
- 不可提交 `node_modules/`、`dist/` 等產生的檔案。
- 不要手動修改 `package-lock.json`；增減套件請用 `npm install <套件> -w frontend` 或 `-w backend`。
- 不要為了通過檢查而關閉 lint 規則、放寬 `tsconfig` 或使用 `any`／`@ts-ignore`。
- 一個 PR 只處理一個 issue，不要順手修改無關的檔案或其他人負責的模組；需要跨模組調整時先在 issue 討論。
- `.agents/` 與 `skills-lock.json` 由 `npx skills` 管理，不要手動編輯。
