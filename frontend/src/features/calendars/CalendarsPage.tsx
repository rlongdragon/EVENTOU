import { useEffect, useState } from 'react';
import type { CategoryCalendar } from './api';
import { fetchCategoryCalendars } from './api';
import { subscribeUrl, webcalUrl } from './calendarUrls';
import { PersonalCalendarsSection } from './PersonalCalendarsSection';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; calendars: CategoryCalendar[] };

function CategoryCalendarRow({ calendar }: { calendar: CategoryCalendar }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const url = subscribeUrl(calendar.icsPath);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      // 瀏覽器不允許寫入剪貼簿時，請使用者自行選取網址
      setCopyState('failed');
    }
  }

  return (
    <li style={{ margin: '1rem 0' }}>
      <h3 style={{ margin: 0 }}>{calendar.label}</h3>
      <input
        type="text"
        readOnly
        value={url}
        aria-label={`${calendar.label}行事曆訂閱網址`}
        onFocus={(event) => event.currentTarget.select()}
        style={{ width: '100%', maxWidth: '36rem', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.25rem' }}>
        <button type="button" onClick={handleCopy}>
          複製網址
        </button>
        <a href={webcalUrl(calendar.icsPath)}>訂閱行事曆</a>
        <span role="status">
          {copyState === 'copied' && '已複製'}
          {copyState === 'failed' && '無法自動複製，請手動選取網址'}
        </span>
      </div>
    </li>
  );
}

export function CalendarsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchCategoryCalendars(controller.signal)
      .then((calendars) => setState({ status: 'ok', calendars }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: String(error) });
      });
    return () => controller.abort();
  }, []);

  return (
    <>
      <h1>行事曆</h1>
      <section>
        <h2>類別公開行事曆</h2>
        <p>
          每個活動類別都有一個公開的 iCalendar 訂閱網址，不需登入。把網址加入 Google Calendar、Apple
          Calendar 或 Outlook 後，該類別的新活動與時間異動會自動同步到你的行事曆。
        </p>
        {state.status === 'loading' && <p>載入中…</p>}
        {state.status === 'error' && <p role="alert">無法載入行事曆：{state.message}</p>}
        {state.status === 'ok' && (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {state.calendars.map((calendar) => (
              <CategoryCalendarRow key={calendar.category} calendar={calendar} />
            ))}
          </ul>
        )}
      </section>
      <PersonalCalendarsSection />
    </>
  );
}
