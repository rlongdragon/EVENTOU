import { Link } from 'react-router';
import { categoryClassName } from '../../shared/eventCategories';
import type { CalendarItem, EventCalendarState } from './api';
import { dayTitle, timeLabel } from './calendarMonth';
import { calendarReason } from './calendarReason';
import { EventCalendarActions } from './EventCalendarActions';

interface DayAgendaProps {
  day: string;
  items: CalendarItem[];
  loading: boolean;
  /** 顯示我的行事曆時沒有活動的提示不同 */
  scope: 'mine' | 'all';
  /** 已登入時才顯示活動與行事曆的關係 */
  signedIn: boolean;
  onStateChange: (eventId: number, state: EventCalendarState) => void;
}

/** 選取日期的活動列表，每筆都可以直接加入、移除或加到外部行事曆。 */
export function DayAgenda({ day, items, loading, scope, signedIn, onStateChange }: DayAgendaProps) {
  return (
    <aside className="cal-agenda" aria-labelledby="cal-agenda-heading" aria-busy={loading}>
      <h2 id="cal-agenda-heading">{dayTitle(day)}</h2>
      {items.length === 0 && !loading && (
        <p className="cal-muted">
          {scope === 'mine'
            ? '這天你的行事曆沒有活動。到「全部活動」看看，或在下方追蹤感興趣的類別、領域與來源。'
            : '這天沒有活動。'}
        </p>
      )}
      <ol className="cal-agenda-list">
        {items.map((item) => {
          const reason = signedIn ? calendarReason(item) : null;
          return (
            <li
              key={item.id}
              className={`cal-agenda-item ${categoryClassName(item.category)}${
                item.mark === 'hidden' && !item.mine ? ' cal-agenda-item--hidden' : ''
              }`}
            >
              <div className="cal-agenda-meta">
                <span className="cal-agenda-time">{timeLabel(item)}</span>
                <span className="cal-agenda-category">{item.categoryLabel}</span>
              </div>
              <Link className="cal-agenda-title" to={`/events/${item.id}`}>
                {item.title}
              </Link>
              <div className="cal-muted cal-agenda-detail">
                {[item.location, item.sourceName].filter(Boolean).join('｜')}
                {reason && <span className="cal-agenda-reason">{reason}</span>}
              </div>
              <EventCalendarActions
                event={item}
                state={signedIn ? item : null}
                onStateChange={(state) => onStateChange(item.id, state)}
                compact
              />
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
