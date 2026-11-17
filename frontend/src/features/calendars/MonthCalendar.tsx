import { categoryClassName } from '../../shared/eventCategories';
import type { CalendarItem } from './api';
import { WEEKDAY_LABELS, dayTitle, type YearMonth } from './calendarMonth';

/** 每格最多顯示幾個活動，其餘以「還有 N 個」表示 */
const MAX_CHIPS = 3;

interface MonthCalendarProps {
  month: YearMonth;
  days: string[];
  itemsByDay: Map<string, CalendarItem[]>;
  today: string;
  selectedDay: string;
  onSelectDay: (day: string) => void;
}

/** 月檢視：6 週 × 7 天，點日期在下方列出當日活動。 */
export function MonthCalendar({
  month,
  days,
  itemsByDay,
  today,
  selectedDay,
  onSelectDay,
}: MonthCalendarProps) {
  const monthPrefix = `${month.year}-${String(month.month).padStart(2, '0')}`;

  return (
    <div className="cal-month">
      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="cal-grid">
        {days.map((day) => {
          const items = itemsByDay.get(day) ?? [];
          const visible = items.filter((item) => item.mark !== 'hidden' || item.mine);
          const outside = !day.startsWith(monthPrefix);
          const classes = [
            'cal-day',
            outside && 'cal-day--outside',
            day === today && 'cal-day--today',
            day === selectedDay && 'cal-day--selected',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={day}
              type="button"
              className={classes}
              aria-pressed={day === selectedDay}
              aria-label={`${dayTitle(day)}${day === today ? '，今天' : ''}，${
                visible.length ? `${visible.length} 個活動` : '沒有活動'
              }`}
              onClick={() => onSelectDay(day)}
            >
              <span className="cal-day-number" aria-hidden="true">
                {Number(day.slice(8, 10))}
              </span>
              <span className="cal-day-events" aria-hidden="true">
                {visible.slice(0, MAX_CHIPS).map((item) => (
                  <span key={item.id} className={`cal-chip ${categoryClassName(item.category)}`}>
                    {item.title}
                  </span>
                ))}
                {visible.length > MAX_CHIPS && (
                  <span className="cal-more">還有 {visible.length - MAX_CHIPS} 個</span>
                )}
              </span>
              {visible.length > 0 && (
                <span className="cal-dots" aria-hidden="true">
                  {visible.slice(0, 4).map((item) => (
                    <span key={item.id} className={`cal-dot ${categoryClassName(item.category)}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
