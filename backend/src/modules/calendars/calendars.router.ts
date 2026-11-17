import { Router, type Request, type Response } from 'express';
import { getDb } from '../../db/index.js';
import { isCalendarDate } from '../../shared/eventDays.js';
import { requireAuth } from '../auth/auth.middleware.js';
import type { EventCategory } from '../events/events.types.js';
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABELS } from '../events/events.types.js';
import { buildCalendar } from './calendars.ics.js';
import {
  clearEventMark,
  findCalendarEvent,
  findUserIdByFeedToken,
  getCalendarSettings,
  getEventCalendarState,
  isEventMarkState,
  listCalendarItems,
  listMyCalendarEvents,
  resetFeedToken,
  setEventMark,
} from './calendars.mine.js';
import { listCalendarEventsByCategory, listCalendarSources } from './calendars.repository.js';

// 行事曆：站內月曆、我的行事曆與 iCal 同步
export const calendarsRouter = Router();

/** 月曆一次最多查詢的天數；月檢視含前後月補滿的格子為 42 天 */
export const MAX_RANGE_DAYS = 100;
const DAY_MS = 86400000;

function isEventCategory(value: unknown): value is EventCategory {
  return EVENT_CATEGORIES.some((category) => category === value);
}

function categoryIcsPath(category: EventCategory): string {
  return `/api/calendars/categories/${category}.ics`;
}

function feedIcsPath(token: string): string {
  return `/api/calendars/feed/${token}.ics`;
}

/** 回傳 .ics；行事曆軟體會定期重抓，短暫快取即可。 */
function sendIcs(
  res: Response,
  calendar: string,
  filename: string,
  cache: 'public' | 'private',
  disposition: 'inline' | 'attachment' = 'inline',
) {
  res
    .status(200)
    .set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': `${cache}, max-age=300`,
    })
    .send(calendar);
}

function currentUserId(req: Request, res: Response): number | undefined {
  const userId = req.user?.id;
  if (userId === undefined) res.status(401).json({ error: 'unauthorized', message: '請先登入' });
  return userId;
}

function parseId(value: unknown): number | undefined {
  const id = Number(value);
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id)
    ? id
    : undefined;
}

function sendEventNotFound(res: Response) {
  res.status(404).json({ error: 'not_found', message: '找不到這個活動' });
}

function sendInvalid(res: Response, error: string, message: string) {
  res.status(400).json({ error, message });
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

// 可供月曆篩選的來源（未登入可用）：已核准的來源
calendarsRouter.get('/sources', (_req, res) => {
  res.json({ sources: listCalendarSources(getDb()) });
});

// 月曆的活動（未登入可用）。scope=all 列出所有活動，scope=mine（需登入）只列我的行事曆；
// from／to 為台北日期（含兩端），活動期間與範圍有重疊就列出。登入時每筆活動附上與自己的關係。
calendarsRouter.get('/events', (req, res) => {
  const query = (name: string) => {
    const value = req.query[name];
    return typeof value === 'string' ? value : '';
  };
  const scope = query('scope') || 'all';
  if (scope !== 'all' && scope !== 'mine') {
    sendInvalid(res, 'invalid_scope', 'scope 請使用 all 或 mine');
    return;
  }
  if (scope === 'mine' && !req.user) {
    res.status(401).json({ error: 'unauthorized', message: '請先登入' });
    return;
  }
  const from = query('from');
  const to = query('to');
  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    sendInvalid(res, 'invalid_date', 'from 與 to 請使用 YYYY-MM-DD');
    return;
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days < 1 || days > MAX_RANGE_DAYS) {
    sendInvalid(res, 'invalid_date_range', `日期範圍需為 1 到 ${MAX_RANGE_DAYS} 天`);
    return;
  }
  const category = query('category');
  if (category && !isEventCategory(category)) {
    sendInvalid(res, 'invalid_category', '找不到這個活動類別');
    return;
  }
  const sourceId = query('sourceId') ? parseId(query('sourceId')) : undefined;
  if (query('sourceId') && sourceId === undefined) {
    sendInvalid(res, 'invalid_source', '來源編號有誤');
    return;
  }
  res.json({
    items: listCalendarItems(getDb(), {
      userId: req.user?.id,
      scope,
      from,
      to,
      category: category ? (category as EventCategory) : undefined,
      sourceId,
      includeHidden: query('hidden') === '1',
    }),
  });
});

// 單一活動的 .ics（未登入可用），供下載後匯入 Apple 行事曆、Outlook 等軟體
calendarsRouter.get('/events/:eventId.ics', (req, res) => {
  const eventId = parseId(req.params.eventId);
  const event = eventId === undefined ? undefined : findCalendarEvent(getDb(), eventId);
  if (!event) {
    sendEventNotFound(res);
    return;
  }
  sendIcs(
    res,
    buildCalendar(event.title, [event]),
    `eventou-event-${event.id}.ics`,
    'public',
    'attachment',
  );
});

// 活動與我的行事曆的關係（需登入）
calendarsRouter.get('/events/:eventId/mark', requireAuth, (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const eventId = parseId(req.params.eventId);
  const state = eventId === undefined ? undefined : getEventCalendarState(getDb(), userId, eventId);
  if (!state) {
    sendEventNotFound(res);
    return;
  }
  res.json(state);
});

// 把活動加入我的行事曆（state: added）或從我的行事曆隱藏（state: hidden）；重複呼叫結果相同
calendarsRouter.put('/events/:eventId/mark', requireAuth, (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const state: unknown = (req.body as { state?: unknown } | undefined)?.state;
  if (!isEventMarkState(state)) {
    sendInvalid(res, 'validation_error', 'state 請使用 added 或 hidden');
    return;
  }
  const eventId = parseId(req.params.eventId);
  const result = eventId === undefined ? undefined : setEventMark(getDb(), userId, eventId, state);
  if (!result) {
    sendEventNotFound(res);
    return;
  }
  res.json(result);
});

// 移除標記：手動加入的活動不再出現，被隱藏的活動恢復由追蹤決定
calendarsRouter.delete('/events/:eventId/mark', requireAuth, (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const eventId = parseId(req.params.eventId);
  const result = eventId === undefined ? undefined : clearEventMark(getDb(), userId, eventId);
  if (!result) {
    sendEventNotFound(res);
    return;
  }
  res.json(result);
});

// 我的行事曆的 iCal 同步（不需登入）：行事曆軟體無法登入，以不可猜的 token 識別
calendarsRouter.get('/feed/:token.ics', (req, res) => {
  const userId = findUserIdByFeedToken(getDb(), req.params.token);
  if (userId === undefined) {
    res.status(404).json({ error: 'not_found', message: '找不到這個行事曆' });
    return;
  }
  const events = listMyCalendarEvents(getDb(), userId);
  sendIcs(res, buildCalendar('EVENTOU 我的行事曆', events), 'eventou-my-calendar.ics', 'private');
});

// 取得自己的同步網址（需登入）
calendarsRouter.get('/feed', requireAuth, (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  res.json({ icsPath: feedIcsPath(getCalendarSettings(getDb(), userId).feedToken) });
});

// 重設同步網址（需登入）：舊網址立即失效，已訂閱的行事曆軟體要重新加入
calendarsRouter.post('/feed/reset', requireAuth, (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  res.json({ icsPath: feedIcsPath(resetFeedToken(getDb(), userId).feedToken) });
});
