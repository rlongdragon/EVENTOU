import { Router, type Response } from 'express';
import { getDb } from '../../db/index.js';
import { requireAuth } from '../auth/auth.middleware.js';
import {
  createEventComment,
  listEventComments,
  validateCommentContent,
} from './events.comments.js';
import {
  RATING_MAX,
  RATING_MIN,
  getEventRatingSummary,
  parseRatingScore,
  upsertEventRating,
} from './events.ratings.js';
import { findPublishedEventById, searchPublishedEvents } from './events.repository.js';
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABELS, type PublishedEvent } from './events.types.js';

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

/** 依路徑上的 eventId 讀取已發布活動；id 無效、不存在或待審時回 404 並回傳 undefined。 */
function findPublishedEventOr404(eventId: unknown, res: Response): PublishedEvent | undefined {
  const id = Number(eventId);
  const event =
    typeof eventId === 'string' && /^[1-9]\d*$/.test(eventId) && Number.isSafeInteger(id)
      ? findPublishedEventById(getDb(), id)
      : undefined;
  if (!event) res.status(404).json({ error: 'not_found', message: '找不到這個活動' });
  return event;
}

// US-02 取得活動詳細資訊（未登入可用）；id 無效、不存在或待審的活動一律回 404
// TODO(#18): US-03 回傳活動地點座標，供活動頁顯示地圖
eventsRouter.get('/:eventId', (req, res) => {
  const event = findPublishedEventOr404(req.params.eventId, res);
  if (!event) return;
  // categoryLabel 取自 EVENT_CATEGORY_LABELS（類別顯示名稱的單一來源）；查無對照時顯示代碼
  const categoryLabel = EVENT_CATEGORY_LABELS[event.category] ?? event.category;
  res.json({ event: { ...event, categoryLabel } });
});

// US-10 活動留言：未登入可看，留言需登入；依留言時間由舊到新排序
eventsRouter.get('/:eventId/comments', (req, res) => {
  const event = findPublishedEventOr404(req.params.eventId, res);
  if (!event) return;
  res.json({ comments: listEventComments(getDb(), event.id) });
});

eventsRouter.post('/:eventId/comments', requireAuth, (req, res) => {
  const event = findPublishedEventOr404(req.params.eventId, res);
  if (!event || !req.user) return;
  const body: unknown = req.body;
  const raw =
    typeof body === 'object' && body !== null && 'content' in body ? body.content : undefined;
  const content = typeof raw === 'string' ? raw.trim() : '';
  const contentError = validateCommentContent(content);
  if (contentError) {
    res.status(400).json({
      error: 'validation_error',
      message: '留言內容有誤',
      fields: { content: contentError },
    });
    return;
  }
  const comment = createEventComment(getDb(), {
    eventId: event.id,
    userId: req.user.id,
    content,
  });
  res.status(201).json({ comment });
});

// US-11 活動評價：未登入可看平均分數與人數，評分需登入；每人每活動一筆，再次評分即修改
eventsRouter.get('/:eventId/ratings', (req, res) => {
  const event = findPublishedEventOr404(req.params.eventId, res);
  if (!event) return;
  res.json({ rating: getEventRatingSummary(getDb(), event.id, req.user?.id) });
});

eventsRouter.put('/:eventId/ratings', requireAuth, (req, res) => {
  const event = findPublishedEventOr404(req.params.eventId, res);
  if (!event || !req.user) return;
  const body: unknown = req.body;
  const score = parseRatingScore(
    typeof body === 'object' && body !== null && 'score' in body ? body.score : undefined,
  );
  if (score === undefined) {
    res.status(400).json({
      error: 'validation_error',
      message: '評分資料有誤',
      fields: { score: `請選擇 ${RATING_MIN}–${RATING_MAX} 星` },
    });
    return;
  }
  const rating = upsertEventRating(getDb(), { eventId: event.id, userId: req.user.id, score });
  res.json({ rating });
});
