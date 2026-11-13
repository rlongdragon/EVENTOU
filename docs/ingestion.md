# US-17 定期擷取

後端啟動後立即執行一次，之後依 `INGESTION_INTERVAL_MS`（預設一小時）觸發；上一輪仍執行中時略過該次觸發，單一來源也不允許重疊執行。部署時只啟動一個排程程序；鎖定在程序記憶體中，不支援多程序協調。

## 人工設定與來源

在 `backend/src/modules/ingestion/ingestion.config.ts` 的 `scraperConfigs` 維護列表網址、連結／列表列容器／標題／內文／發布時間 CSS 選擇器與每輪公告上限。發布日期由列表連結所屬的 listItemSelector 列容器內，以 publishedSelector 擷取；詳細頁不提供發布日期，缺漏時保留 null。Source 的網址須與設定的 `listUrl` 完全一致。沒有設定的合格來源會留下失敗紀錄；RSS／Atom 與 iCalendar 可用 US-18 的設定產生器產生設定，見文末「自動產生擷取設定」。本版只擷取設定列表的第一頁，上限預設 20 則；每次重抓內文以偵測更新，不保證歷史回填。

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

## 自動產生擷取設定（US-18，第一部分）

### 統一設定格式

`ingestion.extraction.ts` 的 `ExtractionConfig` 是 `ScraperConfig`（靜態 HTML，`kind` 省略或 `'html'`）、`FeedConfig` 與 `IcalConfig` 的聯集，以 `listUrl` 對應 Source 的網址。`IngestionService` 與排程不區分設定是人工寫的或自動產生的，只依 `kind` 呼叫對應擷取器（`extractAnnouncements`），輸出都是 `RawAnnouncement`。既有的 `scraperConfigs` 與 HTML 擷取器行為不變。

| kind    | 欄位                                          | 說明                                                                |
| ------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `html`  | 見 `ScraperConfig`                            | US-17 人工設定                                                      |
| `feed`  | `listUrl`、`feedUrl`、`maxAnnouncements`      | `feedUrl` 是實際抓取的 feed；來源是網頁、feed 在連結裡時與 `listUrl` 不同 |
| `ical`  | `listUrl`、`maxAnnouncements`                 | `listUrl` 本身就是 .ics                                             |

### 類型偵測

`detectSourceType(url, body)` 只看回應內容，不看 Content-Type（擷取器目前只回傳內文）：

- 內容以 `BEGIN:VCALENDAR` 開頭 → iCalendar。
- XML 根元素為 `rss`、`feed` 或 `rdf:RDF` → RSS／Atom；其他 XML 視為無法判斷。
- HTML 且有 `<link rel="alternate" type="application/rss+xml|atom+xml">` → feed（取該連結）。
- 其他 HTML：靜態內容少於 200 字且有 script，視為要執行 JavaScript，歸為無法判斷；否則是靜態 HTML 列表。
- 空內容或其他格式 → 無法判斷。回傳結果都附 `reason`。

### 擷取行為

- RSS／Atom：每個項目一則公告，內文取 `content:encoded`、`content`、`description`、`summary`（依序），沒有內文時以標題當內文。相對連結以 feed 網址解析並去掉 hash，缺標題或連結的項目略過，全部略過視為失敗。不另外抓詳細頁。發布日期轉成台北日期。
- iCalendar：每個有 `SUMMARY` 的 VEVENT 一則公告，時間轉成台北時間，以「活動時間」「活動地點」及說明組成內文交給 US-19 解析。公告網址優先用 `URL`，沒有時用 `.ics 網址#UID`。開始時間較晚的優先，超過 `maxAnnouncements` 的截斷。整天活動的 `DTEND` 是隔天，會還原成最後一天。不展開 `RRULE`（只取第一次），不讀取 `VALARM`。
- 都遵守 US-17 的 robots.txt、請求間隔與重試（`ScraperClient`）。

### 產生設定

`generateExtractionConfig(sourceUrl, client)` 抓取來源、偵測類型，並確認內容至少有一則可用項目才產生設定。回傳 `generated`（含 `config`）或 `manual_required`（含原因）：抓取失敗、無法判斷、內容不可用、頁面宣告的 feed 抓不到或不是 feed，以及靜態 HTML（選擇器推測尚未實作）。

### 尚未包含（第二個 PR）

靜態 HTML 的選擇器推測、來源核准後自動觸發、設定存檔與讓排程讀取、試跑預覽、「需人工設定」狀態與管理介面。在那之前，產生的設定不會被排程使用。

### 測試範例

`backend/src/modules/ingestion/fixtures/` 的 RSS、Atom、iCalendar 與網頁範例是依實際格式手寫的，不是從真實來源擷取的內容；取得真實來源後建議補上真實範例。
