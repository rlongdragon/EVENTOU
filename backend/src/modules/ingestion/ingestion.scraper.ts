import { load } from 'cheerio';
import { createRequire } from 'node:module';
import type { RawAnnouncement } from '../events/events.types.js';
import type { ScraperConfig } from './ingestion.config.js';

const userAgent = 'EVENTOU/1.0 (+https://github.com/rlongdragon/EVENTOU)';
// 套件為 CommonJS；透過明確介面接合其執行期匯出。
const robotsParser = createRequire(import.meta.url)('robots-parser') as (
  url: string,
  text: string,
) => {
  isAllowed(url: string, userAgent: string): boolean | undefined;
  getCrawlDelay(userAgent: string): number | undefined;
};
export class ScraperClient {
  private lastRequest = new Map<string, number>();
  private robots = new Map<string, ReturnType<typeof robotsParser>>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private fetchPage: typeof fetch = fetch,
    private intervalMs = 1000,
    private timeoutMs = 30000,
    private retries = 2,
  ) {}

  private request(url: string): Promise<{ status: number; text: string }> {
    const operation = this.queue.then(async () => {
      const origin = new URL(url).origin;
      for (let attempt = 0; ; attempt += 1) {
        const delay = Math.max(
          0,
          (this.lastRequest.get(origin) ?? 0) + this.intervalMs - Date.now(),
        );
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        this.lastRequest.set(origin, Date.now());
        try {
          const response = await this.fetchPage(url, {
            headers: { 'User-Agent': userAgent },
            signal: AbortSignal.timeout(this.timeoutMs),
            redirect: 'manual',
          });
          if (response.status === 429 || response.status >= 500)
            throw new Error(`HTTP ${response.status}`);
          return { status: response.status, text: await response.text() };
        } catch (error) {
          if (attempt >= this.retries) throw error;
          await new Promise((resolve) => setTimeout(resolve, this.intervalMs * 2 ** attempt));
        }
      }
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  async get(url: string): Promise<string> {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
      throw new Error('不支援的擷取網址');
    if (!this.robots.has(parsed.origin)) {
      const robotsUrl = `${parsed.origin}/robots.txt`;
      const response = await this.request(robotsUrl);
      if (![200, 404, 410].includes(response.status))
        throw new Error(`無法確認 robots.txt：HTTP ${response.status}`);
      this.robots.set(
        parsed.origin,
        robotsParser(robotsUrl, response.status === 200 ? response.text : ''),
      );
    }
    const robots = this.robots.get(parsed.origin)!;
    if (robots.isAllowed(url, 'EVENTOU') === false) throw new Error('robots.txt 禁止擷取');
    const crawlDelay = robots.getCrawlDelay('EVENTOU');
    if (crawlDelay && crawlDelay * 1000 > this.intervalMs)
      await new Promise((resolve) => setTimeout(resolve, crawlDelay * 1000));
    const response = await this.request(url);
    if (response.status !== 200) throw new Error(`HTTP ${response.status}：${url}`);
    return response.text;
  }
  clearRobots(): void {
    this.robots.clear();
  }
}

export async function* scrapeAnnouncements(
  sourceId: number,
  config: ScraperConfig,
  client: ScraperClient,
): AsyncGenerator<RawAnnouncement> {
  const list = load(await client.get(config.listUrl));
  const announcements = new Map<string, string | null>(
    list(config.linkSelector)
      .toArray()
      .map((element) => {
        const url = new URL(list(element).attr('href') ?? '', config.listUrl);
        url.hash = '';
        const published =
          config.listItemSelector && config.publishedSelector
            ? list(element)
                .closest(config.listItemSelector)
                .find(config.publishedSelector)
                .first()
                .text()
            : '';
        return [url.href, published.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? null] as const;
      }),
  );
  if (!announcements.size) throw new Error('公告列表未找到連結，請檢查頁面結構與選擇器');
  for (const [url, publishedAt] of [...announcements].slice(0, config.maxAnnouncements)) {
    if (new URL(url).origin !== new URL(config.listUrl).origin) throw new Error('公告連結跨網域');
    const detail = load(await client.get(url));
    const title = detail(config.titleSelector).first().text().trim();
    const rawContent = detail(config.contentSelector).first().html();
    if (!title || !rawContent?.trim()) throw new Error(`公告欄位缺漏，請檢查頁面結構：${url}`);
    yield {
      sourceId,
      url,
      title,
      rawContent,
      publishedAt,
      fetchedAt: new Date().toISOString(),
    };
  }
}
