// 擷取流程：Source → RawAnnouncement
// 不提供 HTTP API，由排程器在背景執行。

/**
 * 啟動定期擷取排程。
 *
 * TODO(#16): US-17 定期擷取已核准且啟用中的來源，寫入 RawAnnouncement（唯一鍵 source_id + url），
 *            包含錯誤處理與重試。
 * TODO(#17): US-18 依來源類型（RSS、網頁、社群…）選擇或產生對應的擷取流程。
 */
export function startIngestionScheduler(): void {
  // TODO(#16): 實作排程器後移除這行
  console.log('[ingestion] scheduler not implemented yet, see #16');
}
