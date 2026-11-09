import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../auth/api';
import { formatEventTime } from '../events/eventTime';
import {
  deletePersonalCalendar,
  fetchPersonalCalendar,
  updatePersonalCalendar,
  type CalendarEventItem,
  type PersonalCalendar,
} from './api';
import { subscribeUrl, webcalUrl } from './calendarUrls';
import { PersonalCalendarForm } from './PersonalCalendarForm';
import { describeConditions, useCategoryLabels } from './personalCalendar';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; notFound: boolean }
  | { status: 'ok'; calendar: PersonalCalendar; events: CalendarEventItem[] };

function SubscribeBox({ icsPath }: { icsPath: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const url = subscribeUrl(icsPath);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <section>
      <h2>訂閱到行事曆軟體</h2>
      <p>拿到這個網址的人都能看到行事曆內容，請不要公開分享。</p>
      <input
        type="text"
        readOnly
        value={url}
        aria-label="個人行事曆訂閱網址"
        onFocus={(event) => event.currentTarget.select()}
        style={{ width: '100%', maxWidth: '36rem', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.25rem' }}>
        <button type="button" onClick={handleCopy}>
          複製網址
        </button>
        <a href={webcalUrl(icsPath)}>訂閱行事曆</a>
        <span role="status">
          {copyState === 'copied' && '已複製'}
          {copyState === 'failed' && '無法自動複製，請手動選取網址'}
        </span>
      </div>
    </section>
  );
}

/** US-09 個人行事曆檢視：符合條件的活動、iCal 訂閱網址，以及編輯與刪除。 */
export function PersonalCalendarPage() {
  const { calendarId = '' } = useParams();
  const navigate = useNavigate();
  const labels = useCategoryLabels();
  // 編輯條件後要重新查詢活動，以 version 觸發
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ key: string; state: LoadState } | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const key = `${calendarId}:${version}`;

  useEffect(() => {
    const controller = new AbortController();
    const resultKey = `${calendarId}:${version}`;
    fetchPersonalCalendar(calendarId, controller.signal)
      .then(({ calendar, events }) =>
        setResult({ key: resultKey, state: { status: 'ok', calendar, events } }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key: resultKey,
          state: {
            status: 'error',
            message: error instanceof ApiError ? error.message : String(error),
            notFound: error instanceof ApiError && error.status === 404,
          },
        });
      });
    return () => controller.abort();
  }, [calendarId, version]);

  const state: LoadState = result?.key === key ? result.state : { status: 'loading' };

  if (state.status === 'loading') return <p>載入中…</p>;
  if (state.status === 'error') {
    return (
      <>
        <p role="alert">{state.notFound ? '找不到這個行事曆。' : `無法載入：${state.message}`}</p>
        <Link to="/calendars">回到行事曆</Link>
      </>
    );
  }

  const { calendar, events } = state;

  async function handleDelete() {
    if (!window.confirm(`確定要刪除「${calendar.name}」嗎？刪除後訂閱網址也會失效。`)) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deletePersonalCalendar(calendar.id);
      void navigate('/calendars');
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : '刪除失敗，請稍後再試');
      setDeleting(false);
    }
  }

  return (
    <>
      <p>
        <Link to="/calendars">← 行事曆</Link>
      </p>
      <h1>{calendar.name}</h1>
      <p>篩選條件：{describeConditions(calendar, labels)}</p>

      {editing ? (
        <PersonalCalendarForm
          initial={calendar}
          submitLabel="儲存"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await updatePersonalCalendar(calendar.id, input);
            setEditing(false);
            setVersion((value) => value + 1);
          }}
        />
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={() => setEditing(true)}>
            編輯條件
          </button>
          <button type="button" onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? '刪除中…' : '刪除行事曆'}
          </button>
        </div>
      )}
      {deleteError && <p role="alert">{deleteError}</p>}

      <section>
        <h2>活動（{events.length}）</h2>
        {events.length === 0 ? (
          <p>目前沒有符合條件的活動。之後有符合條件的新活動時會自動出現在這裡。</p>
        ) : (
          <ul>
            {events.map((event) => (
              <li key={event.id}>
                <Link to={`/events/${event.id}`}>{event.title}</Link>
                <br />
                <small>
                  {formatEventTime(event)}
                  {event.location ? `｜${event.location}` : ''}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SubscribeBox icsPath={calendar.icsPath} />
    </>
  );
}
