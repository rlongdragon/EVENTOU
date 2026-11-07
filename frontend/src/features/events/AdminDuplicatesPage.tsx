import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../auth/api';
import {
  fetchDuplicatePairs,
  mergeDuplicate,
  splitDuplicate,
  type DuplicatePair,
  type PairEvent,
} from './api';
import { formatEventTime } from './eventTime';

const errorStyle = { color: '#cf222e', margin: 0 } as const;
const cardStyle = {
  border: '1px solid #d0d7de',
  borderRadius: 6,
  padding: '0.75rem 1rem',
  marginBottom: '1rem',
} as const;

const CONNECTION_ERROR = '無法連線到伺服器，請稍後再試';

function errorMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : CONNECTION_ERROR;
}

function PairEventDetails({
  label,
  event,
  linked,
}: {
  label: string;
  event: PairEvent;
  linked: boolean;
}) {
  return (
    <div style={{ flex: '1 1 18rem' }}>
      <strong>{label}</strong>
      <p style={{ margin: '0.25rem 0' }}>
        {/* 已合併的那筆不會出現在活動頁，只連到原始公告 */}
        {linked ? <Link to={`/events/${event.id}`}>{event.title}</Link> : event.title}
      </p>
      <small>
        {formatEventTime(event)}
        {event.location ? `｜${event.location}` : ''}
        <br />
        來源：{event.sourceName}（
        <a href={event.originalUrl} target="_blank" rel="noreferrer">
          原始公告
        </a>
        ）
      </small>
    </div>
  );
}

/** US-20 管理員的重複活動管理：確認或拆開「可能重複」，還原誤合併。 */
export function AdminDuplicatesPage() {
  const [pairs, setPairs] = useState<DuplicatePair[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDuplicatePairs()
      .then((loaded) => {
        if (!cancelled) setPairs(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function act(eventId: number, action: (id: number) => Promise<DuplicatePair[]>) {
    setActionError(null);
    setBusyId(eventId);
    try {
      setPairs(await action(eventId));
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  const possible = pairs?.filter((pair) => pair.status === 'possible') ?? [];
  const merged = pairs?.filter((pair) => pair.status === 'merged') ?? [];

  function renderPair(pair: DuplicatePair) {
    const busy = busyId === pair.event.id;
    return (
      <li key={pair.event.id} style={cardStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
          <PairEventDetails label="保留的活動" event={pair.duplicateOf} linked />
          <PairEventDetails
            label={pair.status === 'merged' ? '已合併的活動' : '可能重複的活動'}
            event={pair.event}
            linked={pair.status === 'possible'}
          />
        </div>
        <p style={{ margin: '0.5rem 0' }}>
          重複分數：{pair.score === null ? '—' : pair.score.toFixed(2)}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {pair.status === 'possible' ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(pair.event.id, mergeDuplicate)}
              >
                確認合併
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(pair.event.id, splitDuplicate)}
              >
                不是重複（拆開）
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(pair.event.id, splitDuplicate)}
            >
              還原成兩筆獨立活動
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <>
      <h1>重複活動</h1>
      <p>
        系統會比對不同來源、開始日期前後 1
        天內的活動。高信心的重複會自動合併（活動頁列出所有來源），信心不足的標記為「可能重複」，兩筆都照常顯示，請在這裡確認。拆開或還原後，同一組活動不會再被合併。
      </p>
      {loadError && <p role="alert">無法載入重複活動：{loadError}</p>}
      {actionError && (
        <p role="alert" style={errorStyle}>
          {actionError}
        </p>
      )}
      {!pairs && !loadError && <p>載入中…</p>}
      {pairs && (
        <>
          <section>
            <h2>可能重複（{possible.length}）</h2>
            {possible.length === 0 ? (
              <p>目前沒有待確認的配對。</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>{possible.map(renderPair)}</ul>
            )}
          </section>
          <section>
            <h2>已合併（{merged.length}）</h2>
            {merged.length === 0 ? (
              <p>目前沒有已合併的活動。</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>{merged.map(renderPair)}</ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
