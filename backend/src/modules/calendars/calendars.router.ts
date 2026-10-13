import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { notImplemented } from '../../shared/notImplemented.js';
import { requireAuth } from '../auth/auth.middleware.js';
import type { EventCategory } from '../events/events.types.js';
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABELS } from '../events/events.types.js';
import { buildCalendar } from './calendars.ics.js';
import { listCalendarEventsByCategory } from './calendars.repository.js';

// 行事曆（iCal）
export const calendarsRouter = Router();

function isEventCategory(value: string): value is EventCategory {
  return EVENT_CATEGORIES.some((category) => category === value);
}

function categoryIcsPath(category: EventCategory): string {
  return `/api/calendars/categories/${category}.ics`;
}

// US-05 列出各類別的公開行事曆（未登入可用）；icsPath 為相對路徑，由前端補上網站位址
calendarsRouter.get('/categories', (_req, res) => {
  res.json({
    categories: EVENT_CATEGORIES.map((category) => ({
      category,
      label: EVENT_CATEGORY_LABELS[category],
      icsPath: categoryIcsPath(category),
    })),
  });
});

// US-05 類別公開 iCal 行事曆（未登入可訂閱）；每個類別一個固定網址，不存在的類別回 404
calendarsRouter.get('/categories/:category.ics', (req, res) => {
  const { category } = req.params;
  if (!isEventCategory(category)) {
    res.status(404).json({ error: 'not_found', message: '找不到這個活動類別' });
    return;
  }
  const events = listCalendarEventsByCategory(getDb(), category);
  const calendar = buildCalendar(`EVENTOU ${EVENT_CATEGORY_LABELS[category]}`, events);
  res
    .status(200)
    .set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="eventou-${category}.ics"`,
      // 行事曆軟體會定期重抓，短暫快取即可
      'Cache-Control': 'public, max-age=300',
    })
    .send(calendar);
});

// TODO(#11): US-09 依類別與標籤建立個人行事曆（需登入，沿用 #8 的 iCal 產生邏輯）
calendarsRouter.post('/personal', requireAuth, notImplemented('#11'));
calendarsRouter.get('/personal/:token.ics', notImplemented('#11'));
