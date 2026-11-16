import type { EventCalendarState } from './api';

/** 活動在我的行事曆中的原因，例如「來自追蹤的類別」；與行事曆無關時回傳 null。 */
export function calendarReason(state: EventCalendarState): string | null {
  if (state.mark === 'added') return '已手動加入';
  if (state.mark === 'hidden') return '已從行事曆隱藏';
  if (state.via.category && state.via.source) return '來自追蹤的類別與來源';
  if (state.via.category) return '來自追蹤的類別';
  if (state.via.source) return '來自追蹤的來源';
  return null;
}
