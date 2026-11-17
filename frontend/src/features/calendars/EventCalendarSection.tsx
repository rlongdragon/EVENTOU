import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchEventCalendarState, type EventCalendarState } from './api';
import type { LinkableEvent } from './calendarLinks';
import { calendarReason } from './calendarReason';
import { EventCalendarActions } from './EventCalendarActions';
import './calendar.css';

/** 活動詳細頁的「加入行事曆」區塊。 */
export function EventCalendarSection({ event }: { event: LinkableEvent & { id: number } }) {
  const { user } = useAuth();
  const [state, setState] = useState<{ eventId: number; value: EventCalendarState } | null>(null);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    fetchEventCalendarState(event.id, controller.signal)
      .then((value) => setState({ eventId: event.id, value }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [user, event.id]);

  // 切換活動或登出時不沿用上一個結果
  const current = user && state?.eventId === event.id ? state.value : null;
  const reason = current ? calendarReason(current) : null;

  return (
    <section aria-labelledby="event-calendar-heading">
      <h2 id="event-calendar-heading">加入行事曆</h2>
      {current && (
        <p className="cal-muted">
          {current.mine ? `已在你的行事曆（${reason}）` : (reason ?? '尚未加入你的行事曆')}
        </p>
      )}
      <EventCalendarActions
        event={event}
        state={current}
        onStateChange={(value) => setState({ eventId: event.id, value })}
      />
    </section>
  );
}
