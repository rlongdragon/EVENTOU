import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { notImplemented } from '../../shared/notImplemented.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { findPublishedEventById, searchPublishedEvents } from './events.repository.js';
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABELS } from './events.types.js';

// 活動（Event）：RawAnnouncement → Event，唯一鍵 source_id + original_url
// US-19 轉換入口為 events.service.ts 的 processAnnouncement；資料格式見 events.types.ts。
// TODO(#7): US-20 跨來源偵測可能重複的活動
export const eventsRouter = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** 正整數查詢參數；缺少或格式不符時用預設值。 */
function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'string' && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : fallback;
}

// US-01 搜尋活動（未登入可用）：GET /api/events?q=&category=&page=&page_size=
// 回應附上 categories（代碼與顯示名稱），供前端類別篩選使用，不需各自寫死類別清單
eventsRouter.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  const page = positiveInt(req.query.page, 1);
  const pageSize = Math.min(positiveInt(req.query.page_size, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const { items, total } = searchPublishedEvents(getDb(), { q, category, page, pageSize });
  res.json({
    items: items.map((item) => ({
      ...item,
      categoryLabel: EVENT_CATEGORY_LABELS[item.category] ?? item.category,
    })),
    page,
    pageSize,
    total,
    categories: EVENT_CATEGORIES.map((code) => ({ code, label: EVENT_CATEGORY_LABELS[code] })),
  });
});

// US-02 取得活動詳細資訊（未登入可用）；id 無效、不存在或待審的活動一律回 404
// TODO(#18): US-03 回傳活動地點座標，供活動頁顯示地圖
eventsRouter.get('/:eventId', (req, res) => {
  const { eventId } = req.params;
  const id = Number(eventId);
  const event =
    /^[1-9]\d*$/.test(eventId) && Number.isSafeInteger(id)
      ? findPublishedEventById(getDb(), id)
      : undefined;
  if (!event) {
    res.status(404).json({ error: 'not_found', message: '找不到這個活動' });
    return;
  }
  // categoryLabel 取自 EVENT_CATEGORY_LABELS（類別顯示名稱的單一來源）；查無對照時顯示代碼
  const categoryLabel = EVENT_CATEGORY_LABELS[event.category] ?? event.category;
  res.json({ event: { ...event, categoryLabel } });
});

// TODO(#13): US-10 活動留言（需登入）
eventsRouter.get('/:eventId/comments', notImplemented('#13'));
eventsRouter.post('/:eventId/comments', requireAuth, notImplemented('#13'));

// TODO(#14): US-11 活動評價（需登入）
eventsRouter.get('/:eventId/ratings', notImplemented('#14'));
eventsRouter.post('/:eventId/ratings', requireAuth, notImplemented('#14'));
