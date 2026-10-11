# US-19：海大活動 Event 資料格式

這次交付包含 **Event 型別、SQLite schema／migration、公告轉換、驗證、upsert 與測試**，讓搜尋、行事曆與通知共用同一份活動資料。US-17 擷取排程及搜尋、行事曆、通知 API 由各自負責人接合。

專案只處理國立臺灣海洋大學的活動。轉換及儲存會檢查原始網址是否為 `ntou.edu.tw` 或其子網域；轉知標題或明確外校主辦單位會標記待審。這些規則無法完整理解公告語意，來源審核與擷取流程仍須確認活動歸屬。海大活動可使用外部報名表單；外校來賓也不代表活動屬於外校。

## 共用介面

型別位於 `backend/src/modules/events/events.types.ts`。程式欄位使用 camelCase，SQLite 欄位使用 snake_case。

`Event` 是 `PublishedEvent | ReviewEvent`：判斷 `status === 'published'` 後，TypeScript 能確認 `category` 與 `startTime` 不為 null。

`EventDraft` 是尚未產生 id、createdAt、updatedAt 的資料；它仍須有來源與原始網址，才能建立可追溯的活動。

## RawAnnouncement 輸入契約

供 US-17 接合轉換流程使用，不在 US-19 建立原始公告資料表。

| 原始欄位     | TypeScript 欄位 | 型別           | 說明                                      |
| ------------ | --------------- | -------------- | ----------------------------------------- |
| source_id    | sourceId        | number 或 null | 海大公告來源的正整數識別碼；null 表示缺漏 |
| url          | url             | string 或 null | 原始公告網址                              |
| title        | title           | string 或 null | 原始標題                                  |
| raw_content  | rawContent      | string         | 原始 HTML 或純文字內文                    |
| published_at | publishedAt     | string 或 null | 公告發布時間，未知則 null                 |
| fetched_at   | fetchedAt       | string         | 擷取時間                                  |

這是待與 US-17 負責人確認的契約，尚未完成排程接合。活動開始時間不能由擷取時間代替。

## Event 欄位

「發布必填」表示 published 活動需要完整資料；待審活動可保留缺漏，不填入虛構日期或類別。

| SQLite 欄位      | TypeScript 欄位 | 型別／儲存                  | 發布必填 | 說明                          |
| ---------------- | --------------- | --------------------------- | -------- | ----------------------------- |
| id               | id              | INTEGER／number             | 是       | 資料庫產生                    |
| title            | title           | TEXT／string                | 是       | 整理後標題，待審可為空字串    |
| description      | description     | TEXT／string                | 否       | 純文字內文，預設空字串        |
| category         | category        | TEXT／EventCategory 或 null | 是       | 下表類別代碼                  |
| tags             | tags            | JSON TEXT／string[]         | 否       | 預設 []                       |
| start_time       | startTime       | TEXT／string 或 null        | 是       | Asia/Taipei ISO 8601          |
| end_time         | endTime         | TEXT／string 或 null        | 否       | 未提供則 null                 |
| all_day          | allDay          | INTEGER 0／1 → boolean      | 是       | 只有日期沒有時間時為 true     |
| location         | location        | TEXT／string 或 null        | 否       | 地點原文；此版無經緯度        |
| organizer        | organizer       | TEXT／string 或 null        | 否       | 主辦單位                      |
| registration_url | registrationUrl | TEXT／string 或 null        | 否       | 報名連結                      |
| source_id        | sourceId        | INTEGER／number             | 是       | 正整數來源識別碼，目前待補 FK |
| original_url     | originalUrl     | TEXT／string                | 是       | 原始公告網址，必須可追溯      |
| status           | status          | TEXT／EventStatus           | 是       | published 或 needs_review     |
| review_reasons   | reviewReasons   | JSON TEXT／string[]         | 是       | 待審原因，發布時為 []         |
| created_at       | createdAt       | TEXT／string                | 是       | 首次建立時間                  |
| updated_at       | updatedAt       | TEXT／string                | 是       | 最後更新時間                  |

時間格式為 `YYYY-MM-DDTHH:mm:ss+08:00`。SQLite 以 TEXT 儲存，轉換及儲存流程驗證日期、網址與活動範圍；直接寫 SQL 不會經過程式驗證，接合端應使用 `processAnnouncement`。

`source_id` 與 `original_url` 是儲存時必填的追溯鍵。缺少這兩個欄位的原始公告須由後續流程保留供人工檢查；不能用假來源或假網址建立 Event。

### 類別提案

| 代碼       | 顯示名稱     |
| ---------- | ------------ |
| lecture    | 講座         |
| workshop   | 工作坊／研習 |
| exhibition | 展覽         |
| sports     | 運動         |
| welfare    | 餐飲／福利   |

SRD 尚未列出完整清單，本清單需與搜尋、訂閱及行事曆負責人確認。若新增類別，須同步更新型別並新增 migration 修改資料庫 CHECK 約束。分類先以標題關鍵字，再以內文關鍵字覆寫來源預設類別；皆未命中且未提供來源預設類別時標記待審。

## Migration 與資料庫約束

在 `backend/src/db/migrations/index.ts` 新增 `2_create_events`，既有 migration 1 保持原樣。

- `(source_id, original_url)` 為唯一鍵，`upsertEvent` 使用 `ON CONFLICT DO UPDATE`，保留 id 與 created_at，更新其餘內容及 updated_at。
- `status`、`category` 與 `all_day` 有值域約束，tags 與 review_reasons 須為合法 JSON array。
- published 活動須有非空標題、類別與開始時間，且沒有待審原因。
- `published_events` view 只提供 published 活動；搜尋、行事曆與通知應從此 view 或加上相同狀態條件查詢。
- 來源模組尚未有 `sources` 表，`source_id` 目前只有正整數約束，**尚無 FK**。來源主鍵定案後，由接合者新增 migration 補上 `REFERENCES sources(id)` 並檢查既有資料。

後端既有啟動流程會呼叫 migrate()；亦可在 repo 根目錄執行 `npm run db:migrate -w backend`。這次驗證只使用記憶體資料庫，不寫入正式活動資料。

## Event 範例

以下為合成格式範例，不代表真實公告。

```json
{
  "id": 1,
  "title": "海大 AI 講座",
  "description": "活動內容說明",
  "category": "lecture",
  "tags": ["AI"],
  "startTime": "2026-10-07T14:00:00+08:00",
  "endTime": "2026-10-07T16:00:00+08:00",
  "allDay": false,
  "location": "海大校內會議室",
  "organizer": "國立臺灣海洋大學",
  "registrationUrl": null,
  "sourceId": 1,
  "originalUrl": "https://www.ntou.edu.tw/announcements/example",
  "status": "published",
  "reviewReasons": [],
  "createdAt": "2026-10-01T09:00:00+08:00",
  "updatedAt": "2026-10-01T09:00:00+08:00"
}
```

缺少活動開始時間時，保存 `startTime: null`、`status: "needs_review"`、`reviewReasons: ["缺少開始時間"]`，公開 view 不會回傳。

## 轉換與接合

```ts
import { processAnnouncement } from './modules/events/events.service.js';

const event = processAnnouncement(db, {
  sourceId: 1,
  url: 'https://www.ntou.edu.tw/announcements/example',
  title: '海大 AI 講座',
  rawContent: '<p>活動日期：115年10月7日 下午2:00-4:00</p>',
  publishedAt: '2026-10-01T09:00:00+08:00',
  fetchedAt: '2026-10-01T09:05:00+08:00',
}, { defaultCategory: 'lecture', tags: ['AI'] });
```

此範例為合成資料。`db` 是已執行 migration 的 SQLite DatabaseSync。US-17 呼叫前須確認來源已核准、啟用且屬於海大。

- `convertAnnouncement`：HTML 轉純文字、移除 script/style、全形轉半形、合併空白、擷取欄位及分類，不寫入資料庫。
- `processAnnouncement`：轉換後 upsert；`upsertEvent` 在寫入前再次驗證必填欄位、日期與活動範圍。
- 缺少來源／原始網址：轉換結果為 needs_review；無法建立唯一追溯鍵，因此儲存函式拋錯，US-17 須保留 RawAnnouncement 並送人工修正，不產生假來源或假網址。
- 其他缺必填欄位：可寫入 needs_review，公開 view 不會回傳。原始資料修正後重跑可更新為 published。
- 報名連結支援 HTML anchor、純文字網址與相對路徑；僅接受 HTTP(S)，不接受帳密網址或 javascript 連結。

## 日期規則

支援西元／民國年、中文月日、括號星期、上午／下午／中午、AM／PM、時／點／半，以及時間區間、日期區間。所有輸出使用台北時區，避免依執行主機時區判斷。

- 未寫年份時取公告發布時間的台北年份；發布時間缺漏時取擷取年份，絕不將擷取日期當作活動日期。
- 優先解析活動日期／演講日期等欄位，排除報名截止、發布、更新日期；內文沒有日期時才嘗試標題。
- 只有日期：allDay 為 true，startTime 為當日午夜。單日且未寫結束時 endTime 為 null。
- `10/7–10/9` 的 endTime 為 `10/10 00:00`，採行事曆常用的排他結束日期；無年份的跨年區間可遞增結束年份。
- 不合法日期、時間倒置、多個未形成區間的日期或無法解析的時間，均標記待審。中文數字時間、模糊日期、隱含跨午夜時間目前需人工確認。

## 測試公告與驗收對照

`fixtures/ntou-announcements.json` 收錄 20 個不同原始網址：食品科學系 12 則、學術演講 7 則、國際事務處 1 則。保留 excerptSource 與 captureKind，標題採短述、內文為與解析相關的欄位摘錄，**不是完整原始 HTML 快照**。食品系 listing-fields 只記錄列表確認的日期，未提供時間因此為全天；detail-fields 保留已確認的時間字串。

資料來源：[食品系演講列表](https://fs.ntou.edu.tw/p/403-1073-380-1.php?Lang=zh-tw)、各 fixture 所列的學術演講 detail.aspx、[國際處實習計畫說明會](https://oia.ntou.edu.tw/p/406-1022-129806,r11.php?Lang=zh-tw)。離線測試不依賴網站即時回應。

| Issue 項目 | 狀態 |
| --- | --- |
| Event schema、migration、欄位文件與範例 | 完成 |
| 清理、日期解析、欄位擷取、分類、必填驗證 | 完成，非支援格式進待審 |
| 台北 ISO 時間、待審隔離、冪等更新、來源追溯 | 完成；缺追溯鍵須由擷取端保留 |
| 20 則真實公告 fixture 與單元測試 | 完成，使用欄位摘錄 |
| 與 US-17 負責人確認介面 | 待組員確認，本文件提供契約 |
| source_id 外鍵 | 待 sources 表建立後新增 migration 接合 |
| schema PR review／merge | 待 GitHub PR 流程，不等同程式已合併 |

建議先提交 schema/types/schema test 與欄位文件供其他組員 review，再提交轉換服務與測試。US-01、US-05、US-08 的 API 接合屬於各自 issue；本次不實作這些功能。
