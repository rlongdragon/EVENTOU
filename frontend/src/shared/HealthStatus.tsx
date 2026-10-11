import { useEffect, useState } from 'react';
import type { HealthResponse } from './health';
import { fetchHealth } from './health';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; data: HealthResponse }
  | { status: 'error'; message: string };

export function HealthStatus() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((data) => setHealth({ status: 'ok', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHealth({ status: 'error', message: String(error) });
      });
    return () => controller.abort();
  }, []);

  return (
    <section>
      <h2>後端連線狀態</h2>
      {health.status === 'loading' && <p>連線中…</p>}
      {health.status === 'ok' && (
        <pre data-testid="health">{JSON.stringify(health.data, null, 2)}</pre>
      )}
      {health.status === 'error' && <p role="alert">無法連線到後端：{health.message}</p>}
    </section>
  );
}
