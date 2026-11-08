import { Router, type Request, type Response } from 'express';
import { getDb } from '../../db/index.js';
import { requireAuth } from '../auth/auth.middleware.js';
import type { EventCategory } from '../events/events.types.js';
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABELS } from '../events/events.types.js';
import { buildCalendar } from './calendars.ics.js';
import {
  createPersonalCalendar,
  deletePersonalCalendar,
  findPersonalCalendarByToken,
  getPersonalCalendar,
  listPersonalCalendars,
  MAX_CALENDARS_PER_USER,
  updatePersonalCalendar,
  validateCalendarInput,
  type PersonalCalendarInput,
} from './calendars.personal.js';
import {
  listCalendarEvents,
  listCalendarEventsByCategory,
  listEventTags,
} from './calendars.repository.js';

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
  sendIcs(res, calendar, `eventou-${category}.ics`, 'public');
});

/** 回傳 .ics；行事曆軟體會定期重抓，短暫快取即可。 */
function sendIcs(res: Response, calendar: string, filename: string, cache: 'public' | 'private') {
  res
    .status(200)
    .set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': `${cache}, max-age=300`,
    })
    .send(calendar);
}

// US-09 活動中出現過的所有標籤（未登入可用），供個人行事曆選擇標籤條件
calendarsRouter.get('/tags', (_req, res) => {
  res.json({ tags: listEventTags(getDb()) });
});

// US-09 個人行事曆的 iCal 訂閱（不需登入）：行事曆軟體無法登入，以不可猜的 token 識別；
// 要放在 /personal/:calendarId 之前，避免被當成行事曆 id
calendarsRouter.get('/personal/:token.ics', (req, res) => {
  const calendar = findPersonalCalendarByToken(getDb(), req.params.token);
  if (!calendar) {
    sendCalendarNotFound(res);
    return;
  }
  const events = listCalendarEvents(getDb(), calendar);
  sendIcs(
    res,
    buildCalendar(`EVENTOU ${calendar.name}`, events),
    'eventou-personal.ics',
    'private',
  );
});

// US-09 個人行事曆的管理（需登入）：只能查看與管理自己的行事曆，別人的行事曆一律回 404
calendarsRouter.get('/personal', requireAuth, (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  res.json({ calendars: listPersonalCalendars(getDb(), userId) });
});

calendarsRouter.post('/personal', requireAuth, (req, res) => {
  const userId = currentUserId(req, res);
  const input = userId === undefined ? undefined : parseCalendarInput(req, res);
  if (userId === undefined || !input) return;
  const calendar = createPersonalCalendar(getDb(), userId, input);
  if (calendar === 'limit_reached') {
    res.status(409).json({
      error: 'limit_reached',
      message: `每位使用者最多建立 ${MAX_CALENDARS_PER_USER} 個個人行事曆`,
    });
    return;
  }
  res.status(201).json({ calendar });
});

// 行事曆與目前符合條件的活動；活動每次依條件即時查詢，新活動會自動出現
calendarsRouter.get('/personal/:calendarId', requireAuth, (req, res) => {
  const userId = currentUserId(req, res);
  const calendarId = parseCalendarId(req.params.calendarId);
  const calendar =
    userId === undefined || calendarId === undefined
      ? undefined
      : getPersonalCalendar(getDb(), userId, calendarId);
  if (!calendar) {
    if (userId !== undefined) sendCalendarNotFound(res);
    return;
  }
  res.json({ calendar, events: listCalendarEvents(getDb(), calendar) });
});

calendarsRouter.put('/personal/:calendarId', requireAuth, (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const calendarId = parseCalendarId(req.params.calendarId);
  if (calendarId === undefined || !getPersonalCalendar(getDb(), userId, calendarId)) {
    sendCalendarNotFound(res);
    return;
  }
  const input = parseCalendarInput(req, res);
  if (!input) return;
  const calendar = updatePersonalCalendar(getDb(), userId, calendarId, input);
  if (!calendar) {
    sendCalendarNotFound(res);
    return;
  }
  res.json({ calendar });
});

calendarsRouter.delete('/personal/:calendarId', requireAuth, (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const calendarId = parseCalendarId(req.params.calendarId);
  if (calendarId === undefined || !deletePersonalCalendar(getDb(), userId, calendarId)) {
    sendCalendarNotFound(res);
    return;
  }
  res.status(204).end();
});

function currentUserId(req: Request, res: Response): number | undefined {
  const userId = req.user?.id;
  if (userId === undefined) res.status(401).json({ error: 'unauthorized', message: '請先登入' });
  return userId;
}

function parseCalendarId(value: unknown): number | undefined {
  const id = Number(value);
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id)
    ? id
    : undefined;
}

function parseCalendarInput(req: Request, res: Response): PersonalCalendarInput | undefined {
  const result = validateCalendarInput(req.body);
  if (result.ok) return result.value;
  res.status(400).json({
    error: 'validation_error',
    message: '行事曆資料有誤',
    fields: result.fields,
  });
  return undefined;
}

function sendCalendarNotFound(res: Response) {
  res.status(404).json({ error: 'not_found', message: '找不到這個行事曆' });
}
