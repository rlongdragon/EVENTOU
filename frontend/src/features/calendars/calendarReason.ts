import type { EventCalendarState } from './api';

/** 活動在我的行事曆中的原因，例如「來自追蹤的類別」；與行事曆無關時回傳 null。 */
export function calendarReason(state: EventCalendarState): string | null {
  if (state.mark === 'added') return '已手動加入';
  if (state.mark === 'hidden') return '已從行事曆隱藏';
  const followed = [
    state.via.category && '類別',
    state.via.topic && '領域',
    state.via.source && '來源',
  ].filter(Boolean);
  if (followed.length) return `來自追蹤的${followed.join('與')}`;
  return null;
}
