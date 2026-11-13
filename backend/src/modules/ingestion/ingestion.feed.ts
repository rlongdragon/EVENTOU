import { load } from 'cheerio';
import { httpUrl } from '../events/events.cleaner.js';
import type { RawAnnouncement } from '../events/events.types.js';
import { taipeiDateOf } from './ingestion.dates.js';
import type { FeedConfig } from './ingestion.extraction.js';
import type { ScraperClient } from './ingestion.scraper.js';

// US-18 RSS 2.0／RDF／Atom 擷取：每個項目一則公告，內文直接取 feed 提供的內容，不再抓詳細頁。

export interface FeedItem {
  url: string;
  title: string;
  content: string;
  publishedAt: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 解析 feed 文字；沒有任何可用項目（缺標題或連結的項目會略過）時回傳空陣列。 */
export function parseFeed(xml: string, baseUrl: string): FeedItem[] {
  const $ = load(xml, { xmlMode: true });
  const items = new Map<string, FeedItem>();
  for (const element of $('item, entry').toArray()) {
    const item = $(element);
    const text = (selector: string) => item.children(selector).first().text().trim();
    const title = text('title');

    // Atom 的連結在 href 屬性；RSS 的連結是 <link> 文字，沒有時退而求其次用 guid
    const links = item.children('link').toArray();
    const atomLink =
      links.find(
        (link) => /^(alternate)?$/.test($(link).attr('rel') ?? '') && $(link).attr('href'),
      ) ?? links.find((link) => $(link).attr('href'));
    const guid = item.children('guid').first();
    const href =
      (atomLink ? $(atomLink).attr('href') : undefined) ||
      text('link') ||
      (guid.attr('isPermaLink') === 'false' ? '' : guid.text().trim());
    const url = httpUrl(href ?? '', baseUrl);
    if (!title || !url) continue;

    const xhtml = item.children('content[type="xhtml"]').first().html();
    const content =
      text('content\\:encoded') ||
      xhtml?.trim() ||
      text('content') ||
      text('description') ||
      text('summary');
    const published = text('pubDate') || text('published') || text('updated') || text('dc\\:date');
    const withoutHash = new URL(url);
    withoutHash.hash = '';
    items.set(withoutHash.href, {
      url: withoutHash.href,
      title,
      // 沒有內文的項目用標題當內文，讓 US-19 仍能從標題找日期
      content: content || escapeHtml(title),
      publishedAt: taipeiDateOf(published),
    });
  }
  return [...items.values()];
}

export async function* scrapeFeed(
  sourceId: number,
  config: FeedConfig,
  client: ScraperClient,
): AsyncGenerator<RawAnnouncement> {
  const items = parseFeed(await client.get(config.feedUrl), config.feedUrl);
  if (!items.length) throw new Error('feed 未找到可用項目（需有標題與連結），請確認 feed 內容');
  for (const item of items.slice(0, config.maxAnnouncements)) {
    yield {
      sourceId,
      url: item.url,
      title: item.title,
      rawContent: item.content,
      publishedAt: item.publishedAt,
      fetchedAt: new Date().toISOString(),
    };
  }
}
