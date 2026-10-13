import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { TodoPlaceholder } from '../../shared/TodoPlaceholder';
import type { EventDetail } from './api';
import { fetchEvent } from './api';
import { formatEventTime } from './eventTime';

type LoadState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'error'; message: string }
  | { status: 'ok'; event: EventDetail };

export function EventDetailPage() {
  const { eventId = '' } = useParams();
  // 記錄是哪個 eventId 的結果，切換活動時直接視為載入中
  const [result, setResult] = useState<{ eventId: string; state: LoadState } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchEvent(eventId, controller.signal)
      .then((event) =>
        setResult({
          eventId,
          state: event ? { status: 'ok', event } : { status: 'not_found' },
        }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ eventId, state: { status: 'error', message: String(error) } });
      });
    return () => controller.abort();
  }, [eventId]);

  const state: LoadState = result?.eventId === eventId ? result.state : { status: 'loading' };

  if (state.status === 'loading') return <p>載入中…</p>;
  if (state.status === 'error') return <p role="alert">無法載入活動：{state.message}</p>;
  if (state.status === 'not_found') {
    return (
      <section>
        <h1>404：找不到這個活動</h1>
        <p>活動可能不存在或已移除。</p>
        <Link to="/">回到活動列表</Link>
      </section>
    );
  }

  const { event } = state;

  return (
    <>
      <h1>{event.title}</h1>
      <dl>
        <dt>時間</dt>
        <dd>{formatEventTime(event)}</dd>
        <dt>地點</dt>
        <dd>{event.location ?? '未提供'}</dd>
        <dt>類別</dt>
        <dd>{event.categoryLabel}</dd>
        <dt>主辦單位</dt>
        <dd>{event.organizer ?? '未提供'}</dd>
      </dl>
      <h2>活動說明</h2>
      <p style={{ whiteSpace: 'pre-wrap' }}>{event.description || '未提供'}</p>
      <p>
        <a href={event.originalUrl} target="_blank" rel="noreferrer">
          查看原始公告
        </a>
      </p>
      {/* TODO(#18): US-03 活動地點地圖 */}
      <TodoPlaceholder
        title="地點地圖"
        issues={[{ number: 18, label: 'US-03 活動頁顯示地點地圖' }]}
      />
      {/* TODO(#15): US-12 分享活動連結 */}
      <TodoPlaceholder title="分享" issues={[{ number: 15, label: 'US-12 分享活動連結' }]} />
      {/* TODO(#14): US-11 評價（需登入，#20） */}
      <TodoPlaceholder title="評價" issues={[{ number: 14, label: 'US-11 對活動評價' }]} />
      {/* TODO(#13): US-10 留言（需登入，#20） */}
      <TodoPlaceholder title="留言" issues={[{ number: 13, label: 'US-10 對活動留言' }]} />
    </>
  );
}
