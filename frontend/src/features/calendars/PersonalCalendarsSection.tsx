import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiError } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { createPersonalCalendar, fetchPersonalCalendars, type PersonalCalendar } from './api';
import { PersonalCalendarForm } from './PersonalCalendarForm';
import { describeConditions, useCategoryLabels } from './personalCalendar';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; calendars: PersonalCalendar[] };

function PersonalCalendarList({ userId }: { userId: number }) {
  const labels = useCategoryLabels();
  const [result, setResult] = useState<{ userId: number; state: LoadState } | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchPersonalCalendars(controller.signal)
      .then((calendars) => setResult({ userId, state: { status: 'ok', calendars } }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.message : String(error);
        setResult({ userId, state: { status: 'error', message } });
      });
    return () => controller.abort();
  }, [userId]);

  const state: LoadState = result?.userId === userId ? result.state : { status: 'loading' };

  if (state.status === 'loading') return <p>載入中…</p>;
  if (state.status === 'error') return <p role="alert">無法載入個人行事曆：{state.message}</p>;

  return (
    <>
      {state.calendars.length === 0 ? (
        <p>你還沒有建立個人行事曆。</p>
      ) : (
        <ul>
          {state.calendars.map((calendar) => (
            <li key={calendar.id}>
              <Link to={`/calendars/personal/${calendar.id}`}>{calendar.name}</Link>（
              {describeConditions(calendar, labels)}）
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <PersonalCalendarForm
          submitLabel="建立"
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            const calendar = await createPersonalCalendar(input);
            setResult({
              userId,
              state: { status: 'ok', calendars: [...state.calendars, calendar] },
            });
            setCreating(false);
          }}
        />
      ) : (
        <button type="button" onClick={() => setCreating(true)}>
          新增個人行事曆
        </button>
      )}
    </>
  );
}

/** US-09 個人行事曆：登入後可依類別與標籤建立多個行事曆，訪客只看到登入提示。 */
export function PersonalCalendarsSection() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const loginUrl = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <section>
      <h2>個人行事曆</h2>
      <p>
        依「類別＋標籤」的組合建立自己的行事曆，只會顯示符合條件的活動，新活動符合條件時會自動加入；也可以用
        iCalendar 網址訂閱到行事曆軟體。
      </p>
      {loading ? null : user ? (
        <PersonalCalendarList userId={user.id} />
      ) : (
        <p>
          <Link to={loginUrl}>登入</Link>後即可建立個人行事曆。
        </p>
      )}
    </section>
  );
}
