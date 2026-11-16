import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { clearEventMark, setEventMark, type EventCalendarState } from './api';
import { eventIcsPath, googleEventUrl, type LinkableEvent } from './calendarLinks';

interface EventCalendarActionsProps {
  event: LinkableEvent & { id: number };
  /** 活動與自己的行事曆的關係；訪客或尚未載入時為 null */
  state: EventCalendarState | null;
  onStateChange?: (state: EventCalendarState) => void;
  /** 月曆的當日列表用較小的按鈕 */
  compact?: boolean;
}

/** 依目前狀態決定主要按鈕：加入、移除（手動加入的）、隱藏（追蹤帶進來的）或還原（被隱藏的）。 */
function primaryAction(state: EventCalendarState) {
  if (state.mark === 'added') return { label: '從行事曆移除', run: clearEventMark } as const;
  if (state.mine) return { label: '從行事曆隱藏', run: (id: number) => setEventMark(id, 'hidden') };
  if (state.mark === 'hidden') return { label: '還原到行事曆', run: clearEventMark } as const;
  return { label: '加入我的行事曆', run: (id: number) => setEventMark(id, 'added') } as const;
}

/** 加入／移除我的行事曆，以及加到 Google 日曆、下載 .ics。 */
export function EventCalendarActions({
  event,
  state,
  onStateChange,
  compact = false,
}: EventCalendarActionsProps) {
  const { user } = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventPageUrl = new URL(`/events/${event.id}`, window.location.origin).href;
  const action = state ? primaryAction(state) : null;

  async function handlePrimary() {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      onStateChange?.(await action.run(event.id));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`cal-actions${compact ? ' cal-actions--compact' : ''}`}>
      {user && action && (
        <button
          type="button"
          className={state?.mine ? undefined : 'cal-actions-primary'}
          onClick={() => void handlePrimary()}
          disabled={busy}
        >
          {action.label}
        </button>
      )}
      {!user && (
        <Link
          className="cal-actions-login"
          to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        >
          登入後加入我的行事曆
        </Link>
      )}
      <a href={googleEventUrl(event, eventPageUrl)} target="_blank" rel="noreferrer">
        加到 Google 日曆
      </a>
      <a href={eventIcsPath(event.id)} download>
        下載 .ics
      </a>
      {error && (
        <span role="alert" className="cal-error">
          {error}
        </span>
      )}
    </div>
  );
}
