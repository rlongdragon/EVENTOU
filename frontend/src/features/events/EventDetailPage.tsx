import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { EventDetail } from './api';
import { fetchEvent } from './api';
import { EventLocationMap } from './EventLocationMap';
import { EventComments } from './EventComments';
import { EventRating } from './EventRating';
import { formatEventTime } from './eventTime';
import { ShareEventButton } from './ShareEventButton';

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
      <h1 className="event-title">
        <span className="hero-title-line">
          <span>{event.title}</span>
        </span>
      </h1>
      <dl className="event-meta">
        <div>
          <dt>時間</dt>
          <dd>{formatEventTime(event)}</dd>
        </div>
        <div>
          <dt>地點</dt>
          <dd>{event.location ?? '未提供'}</dd>
        </div>
        <div>
          <dt>類別</dt>
          <dd>{event.categoryLabel}</dd>
        </div>
        <div>
          <dt>主辦單位</dt>
          <dd>{event.organizer ?? '未提供'}</dd>
        </div>
      </dl>
      <section>
        <h2>活動說明</h2>
        <p className="event-description">{event.description || '未提供'}</p>
      </section>
      <section>
        <h2>來源</h2>
        {/* US-20：跨來源的重複公告已合併成這一筆時，列出所有來源 */}
        {event.sources.length > 1 ? (
          <ul>
            {event.sources.map((source) => (
              <li key={source.originalUrl}>
                <a href={source.originalUrl} target="_blank" rel="noreferrer">
                  {source.sourceName}的原始公告
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            <a href={event.originalUrl} target="_blank" rel="noreferrer">
              查看原始公告
            </a>
          </p>
        )}
      </section>
      <ShareEventButton eventId={event.id} />
      <EventLocationMap
        key={event.id}
        eventId={event.id}
        location={event.location}
        category={event.category}
      />
      <EventRating eventId={eventId} />
      <EventComments eventId={eventId} />
    </>
  );
}
