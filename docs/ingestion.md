# US-17 定期擷取

後端啟動後立即執行一次，之後依 `INGESTION_INTERVAL_MS`（預設一小時）觸發；上一輪仍執行中時略過該次觸發，單一來源也不允許重疊執行。部署時只啟動一個排程程序；鎖定在程序記憶體中，不支援多程序協調。

## 人工設定與來源

在 `backend/src/modules/ingestion/ingestion.config.ts` 的 `scraperConfigs` 維護列表網址、連結／列表列容器／標題／內文／發布時間 CSS 選擇器與每輪公告上限。發布日期由列表連結所屬的 listItemSelector 列容器內，以 publishedSelector 擷取；詳細頁不提供發布日期，缺漏時保留 null。Source 的網址須與設定的 `listUrl` 完全一致。沒有設定的合格來源會留下失敗紀錄，不自動推測規則（US-18）。本版只擷取設定列表的第一頁，上限預設 20 則；每次重抓內文以偵測更新，不保證歷史回填。

預設含食品系演講公告與國際事務處最新消息。2026-10-13 使用正式擷取器，各完成 robots.txt、列表與一則內文驗證，取得非空標題與原始 HTML；離線測試不依賴網站即時狀態。

來源仍須存在資料庫且 `review_status='approved' AND enabled=1`。US-14 已提供來源審核，US-16 目前仍是佔位，開發時可人工更新啟用欄位；設定檔本身不會核准或建立 Source。

## 資料接合

沿用 `events.types.ts` 的 `RawAnnouncement` 及 [US-19 契約](event-schema.md)，已確認共用型別與 processAnnouncement 介面符合契約，fetchedAt 使用帶時區的 ISO 8601。SQLite 使用 snake_case，程式使用 camelCase。migration 6 新增 `raw_announcements` 與 `ingestion_runs`，不修改舊 migration。

原始公告以 `(source_id, url)` upsert，保留 id；每次更新 fetched_at。新增或標題／內文／發布日期變更時呼叫 `processAnnouncement`。`processed_at` 為內部處理標記，單則整理失敗保留原始公告並在下一輪重試，記錄公告網址與錯誤後繼續處理其他公告與擷取新公告；該輪標記 failure。已停用或取消核准的來源不會進入下一輪，寫入前也重新檢查資格。

擷取紀錄包含來源、開始／結束時間、running／success／failure、新增筆數、更新筆數與錯誤訊息。部分公告已寫入後失敗仍保留該次已完成筆數。

## 管理員 API

兩個入口都需管理員 session cookie。參數與來源狀態錯誤使用 { error: 代碼, message: 中文訊息 }，代碼為 invalid_source_id、not_found、source_not_eligible 或 already_running：

- `POST /api/ingestion/:sourceId/fetch`：同步執行一次，成功 200，擷取失敗 502（body 保留 run）、來源不存在 404、不合資格或正在執行 409。
- `GET /api/ingestion/:sourceId/runs`：最近 100 筆紀錄，按 id 遞減，紀錄欄位使用 camelCase（sourceId、startedAt、finishedAt、insertedCount、updatedCount、errorMessage）。

現有管理員頁面仍是其他 User Story 的佔位，這次提供 API 作為手動入口。

## 設定與錯誤處理

環境變數範例見 `backend/.env.example`：週期、請求間隔、逾時及重試次數。設定須為正整數，同網域請求間隔至少一秒。User-Agent 為 `EVENTOU/1.0`，附專案網址。

robots.txt 使用 robots-parser 判斷群組與路徑；404／410 視為無規則，其餘非 200 回應停止該來源。排程每輪重新讀取規則；遵守 Crawl-delay。網路錯誤、逾時、429 與 5xx 至多重試兩次，等待時間遞增。其他 HTTP 錯誤、空列表、缺標題／內文皆留下錯誤。跨網域公告連結與 HTTP 重新導向會失敗並留下紀錄，需人工確認並修改設定。

每個請求預設 30 秒逾時；同一來源可能有多則公告，整輪時間包含請求間隔與重試。多來源逐一處理，單一來源失敗仍繼續下一個。
