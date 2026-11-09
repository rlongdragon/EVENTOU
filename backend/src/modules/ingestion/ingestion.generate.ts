import { detectSourceType } from './ingestion.detect.js';
import type { ExtractionConfig } from './ingestion.extraction.js';
import { parseFeed } from './ingestion.feed.js';
import { parseIcs } from './ingestion.ical.js';
import type { ScraperClient } from './ingestion.scraper.js';

// US-18 依來源類型產生擷取設定。產生的設定與人工寫的是同一種格式（ExtractionConfig）。

export const DEFAULT_MAX_ANNOUNCEMENTS = 20;

export type GenerationResult =
  | { status: 'generated'; type: 'feed' | 'ical'; config: ExtractionConfig; reason: string }
  | { status: 'manual_required'; reason: string };

/**
 * 抓取來源網址、偵測類型並產生設定。回應內容確認至少有一則可用項目才算產生成功，
 * 類型無法判斷或內容不可用時回傳 manual_required 與原因，不丟例外。
 */
export async function generateExtractionConfig(
  sourceUrl: string,
  client: ScraperClient,
  maxAnnouncements = DEFAULT_MAX_ANNOUNCEMENTS,
): Promise<GenerationResult> {
  let body: string;
  try {
    body = await client.get(sourceUrl);
  } catch (error) {
    return { status: 'manual_required', reason: `無法取得來源內容：${messageOf(error)}` };
  }
  const detection = detectSourceType(sourceUrl, body);

  if (detection.type === 'ical') {
    const usable = parseIcs(body).filter((event) => event.summary).length;
    if (!usable) return unusable('iCalendar 沒有可用的活動（VEVENT 需有 SUMMARY）');
    return {
      status: 'generated',
      type: 'ical',
      reason: `${detection.reason}，共 ${usable} 個活動`,
      config: { kind: 'ical', listUrl: sourceUrl, maxAnnouncements },
    };
  }

  if (detection.type === 'feed') {
    const feedUrl = detection.feedUrl ?? sourceUrl;
    let feedBody = body;
    if (detection.feedUrl) {
      try {
        feedBody = await client.get(feedUrl);
      } catch (error) {
        return unusable(`無法取得頁面宣告的 feed（${feedUrl}）：${messageOf(error)}`);
      }
      if (detectSourceType(feedUrl, feedBody).type !== 'feed')
        return unusable(`頁面宣告的 ${feedUrl} 不是 RSS／Atom`);
    }
    const usable = parseFeed(feedBody, feedUrl).length;
    if (!usable) return unusable('feed 沒有可用的項目（需有標題與連結）');
    return {
      status: 'generated',
      type: 'feed',
      reason: `${detection.reason}，共 ${usable} 個項目`,
      config: { kind: 'feed', listUrl: sourceUrl, feedUrl, maxAnnouncements },
    };
  }

  if (detection.type === 'html') {
    // TODO(#17): 靜態 HTML 列表的選擇器推測在第二個 PR 實作，目前先標記需人工設定
    return unusable('靜態 HTML 公告列表目前需要人工設定擷取規則（自動推測尚未支援）');
  }
  return unusable(detection.reason);
}

function unusable(reason: string): GenerationResult {
  return { status: 'manual_required', reason };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '未知錯誤';
}
