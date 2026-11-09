import { load } from 'cheerio';
import { httpUrl } from '../events/events.cleaner.js';

// US-18 來源類型偵測：看網址副檔名與回應內容特徵（不依賴 Content-Type，擷取器目前只回傳內文）。

export type DetectedType = 'feed' | 'ical' | 'html' | 'unknown';

export interface Detection {
  type: DetectedType;
  /** 判斷依據或無法判斷的原因，顯示給管理員看 */
  reason: string;
  /** type 為 feed 且來源是網頁時，頁面宣告的 feed 網址 */
  feedUrl?: string;
}

/** 頁面文字少於這個長度又有 script，視為要執行 JavaScript 才有內容 */
const MIN_STATIC_TEXT = 200;
const FEED_ROOTS = ['rss', 'feed', 'rdf:rdf'];

export function detectSourceType(url: string, body: string): Detection {
  const text = body.replace(/^\uFEFF/, '').trimStart();
  if (!text) return { type: 'unknown', reason: '回應內容是空的' };

  if (/^BEGIN:VCALENDAR/i.test(text)) {
    return { type: 'ical', reason: '內容是 iCalendar（BEGIN:VCALENDAR）' };
  }

  if (/^<\?xml|^<(rss|feed|rdf:rdf)[\s>]/i.test(text)) {
    const $ = load(text, { xmlMode: true });
    const root = $.root().children().first().prop('tagName')?.toLowerCase() ?? '';
    if (FEED_ROOTS.includes(root)) {
      return { type: 'feed', reason: `內容是 ${root === 'feed' ? 'Atom' : 'RSS'} feed` };
    }
    if (root !== 'html') {
      return { type: 'unknown', reason: `是 XML 但不是 RSS／Atom（根元素 ${root || '不明'}）` };
    }
  }

  if (/<(html|body)[\s>]|^<!doctype html/i.test(text)) {
    const $ = load(text);
    // 頁面自己宣告 feed：<link rel="alternate" type="application/rss+xml" href="...">
    for (const element of $('link[rel~="alternate"][href]').toArray()) {
      const type = ($(element).attr('type') ?? '').toLowerCase();
      if (type !== 'application/rss+xml' && type !== 'application/atom+xml') continue;
      const feedUrl = httpUrl($(element).attr('href') ?? '', url);
      if (feedUrl) return { type: 'feed', reason: '頁面宣告了 feed 連結', feedUrl };
    }
    const scripts = $('script').length;
    $('script, style, noscript').remove();
    const visible = $('body').text().replace(/\s+/g, '');
    if (scripts > 0 && visible.length < MIN_STATIC_TEXT) {
      return {
        type: 'unknown',
        reason: '頁面幾乎沒有靜態內容，可能需要執行 JavaScript 才會顯示，需人工設定',
      };
    }
    return { type: 'html', reason: '一般網頁，內容在 HTML 內' };
  }

  return { type: 'unknown', reason: '內容不是 iCalendar、RSS／Atom 或網頁' };
}
