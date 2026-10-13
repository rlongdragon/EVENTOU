import { createMailer } from './subscriptions.mailer.js';
import { runNotificationCycle } from './subscriptions.notifier.js';

// US-08 新活動 Email 通知的背景排程，不提供 HTTP API。

const DEFAULT_INTERVAL_MS = 300000;
const DEFAULT_PUBLIC_BASE_URL = 'http://localhost:5173';

/**
 * 啟動定期通知排程：每隔 NOTIFICATION_INTERVAL_MS 毫秒（預設 300000，即 5 分鐘，需小於 NFR-05 的 15 分鐘；
 * 單位與擷取排程的 INGESTION_INTERVAL_MS 一致）
 * 執行一輪 runNotificationCycle。信中的連結以 PUBLIC_BASE_URL 為網站位址。
 */
export function startNotificationScheduler(env: NodeJS.ProcessEnv = process.env): NodeJS.Timeout {
  const configured = Number(env.NOTIFICATION_INTERVAL_MS);
  const intervalMs = configured > 0 ? configured : DEFAULT_INTERVAL_MS;
  const baseUrl = (env.PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
  const mailer = createMailer(env);
  let running = false;

  async function tick() {
    // 上一輪還沒寄完就略過，避免同一封通知被兩輪同時寄出
    if (running) return;
    running = true;
    try {
      const result = await runNotificationCycle(mailer, baseUrl);
      if (result.dispatchedEvents || result.sent || result.failed || result.skipped) {
        console.log(
          `[notifications] 新活動 ${result.dispatchedEvents}、寄出 ${result.sent}、失敗 ${result.failed}、略過 ${result.skipped}`,
        );
      }
    } catch (error) {
      console.error('[notifications] 通知排程執行失敗', error);
    } finally {
      running = false;
    }
  }

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  console.log(`[notifications] scheduler started, every ${intervalMs / 1000}s`);
  return timer;
}
