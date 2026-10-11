## Summary

US-19 公告整理為統一活動格式，Closes #5。合併前須確認下列接合事項。

```text
海大 RawAnnouncement
  → HTML／全形清理
  → 日期、地點、主辦、報名連結與分類
  → 必填／台北時間／海大範圍驗證
  → published 或 needs_review
  → (source_id, original_url) upsert
  → published_events（供搜尋、行事曆、通知）
```

建議將 schema、型別與欄位契約先拆成第一個 PR，轉換服務及測試作為第二個 PR。

## Evidence

- **Before:** 僅有資料格式，未提供公告轉換及冪等儲存。
  **After:** 轉換及儲存測試驗證日期格式、待審隔離與重複更新，並加入 20 則海大真實公告的欄位摘錄。
- `npm run lint`、`npm run typecheck`、`npm run build`、`npm test`、`npm run format:check` 通過；62 項測試通過，測試使用記憶體資料庫，不寫入正式資料。
- 待 US-17 負責人確認 RawAnnouncement 契約；來源模組建立 sources 表後，須新增 migration 補 source_id FK。不得將這兩項視為已完成。
- 公開消費者需讀 published_events；來源審核仍須確認活動確實屬於海大。

## Merge Danger

**Door:** two-way

新增 Event 表與 view，不修改既有帳號資料；回退程式前須確認下游是否已依賴新表及有無需保留的 Event。

**Blast Radius:** Event

日期無法確定時進待審，避免向下游發布錯誤時間。搜尋、行事曆與通知 API 由各自 issue 接合。
