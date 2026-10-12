import { positiveInteger } from './ingestion.config.js';
import { getIngestionService } from './ingestion.service.js';

export function startIngestionScheduler(
  run = () => getIngestionService().runAll(),
  intervalMs = positiveInteger(process.env.INGESTION_INTERVAL_MS, 3600000),
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await run();
    } catch (error) {
      console.error('[ingestion]', error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
