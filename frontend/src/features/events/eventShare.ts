/**
 * US-12：活動頁的固定網址，例：https://eventou.example/events/42。
 * 只用網站 origin 與活動 id 組成，不帶目前網址的查詢字串或 hash，開啟後不需登入即可瀏覽。
 */
export function eventShareUrl(origin: string, eventId: number): string {
  return new URL(`/events/${eventId}`, origin).href;
}
