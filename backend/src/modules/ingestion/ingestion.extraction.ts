import type { RawAnnouncement } from '../events/events.types.js';
import type { ScraperConfig } from './ingestion.config.js';
import { scrapeFeed } from './ingestion.feed.js';
import { scrapeIcal } from './ingestion.ical.js';
import { scrapeAnnouncements, type ScraperClient } from './ingestion.scraper.js';

// US-18 統一的擷取設定格式。人工撰寫（US-17）與自動產生的設定都用這個格式，
// 排程與擷取器不需要區分設定從哪裡來；以 listUrl 對應 Source 的網址。

/** RSS／Atom：listUrl 是來源網址，feedUrl 是實際抓取的 feed 網址（來源是網頁、feed 在連結裡時兩者不同）。 */
export interface FeedConfig {
  kind: 'feed';
  listUrl: string;
  feedUrl: string;
  maxAnnouncements: number;
}

/** iCalendar：listUrl 本身就是 .ics 網址，每個 VEVENT 產生一則公告。 */
export interface IcalConfig {
  kind: 'ical';
  listUrl: string;
  maxAnnouncements: number;
}

/** 靜態 HTML 列表沿用 US-17 的 ScraperConfig（kind 為 'html' 或省略）。 */
export type ExtractionConfig = ScraperConfig | FeedConfig | IcalConfig;

/** 依設定的 kind 選擇擷取器，輸出一律是 RawAnnouncement。 */
export function extractAnnouncements(
  sourceId: number,
  config: ExtractionConfig,
  client: ScraperClient,
): AsyncGenerator<RawAnnouncement> {
  switch (config.kind) {
    case 'feed':
      return scrapeFeed(sourceId, config, client);
    case 'ical':
      return scrapeIcal(sourceId, config, client);
    default:
      return scrapeAnnouncements(sourceId, config, client);
  }
}
