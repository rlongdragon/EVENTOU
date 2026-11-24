import { Router, type Response } from 'express';
import { getDb } from '../../db/index.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import {
  createEventComment,
  deleteEventComment,
  isCommentSort,
  listEventComments,
  resolveReplyParent,
  setCommentLike,
  updateEventComment,
  validateCommentContent,
} from './events.comments.js';
import {
  confirmDuplicate,
  listDuplicatePairs,
  listEventSources,
  splitDuplicate,
} from './events.dedup.js';
import {
  REPORT_NOTE_MAX_LENGTH,
  createCommentReport,
  isReportReason,
  listPendingReports,
  reviewCommentReports,
  type ReviewAction,
} from './events.reports.js';
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
// US-20 跨來源重複偵測在 processAnnouncement 內進行（events.dedup.ts），管理員 API 在 /duplicates。
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

// US-20 管理員的重複活動清單：可能重複（待確認）與已合併的配對
eventsRouter.get('/duplicates', requireRole('admin'), (_req, res) => {
  res.json({ pairs: listDuplicatePairs(getDb()) });
});

// US-20 管理員確認合併「可能重複」的活動，合併後不再出現在搜尋、行事曆與通知
eventsRouter.post('/duplicates/:eventId/merge', requireRole('admin'), (req, res) => {
  const eventId = parseEventId(req.params.eventId);
  if (eventId === undefined || !confirmDuplicate(getDb(), eventId)) {
    sendDuplicateNotFound(res);
    return;
  }
  res.json({ pairs: listDuplicatePairs(getDb()) });
});

// US-20 管理員拆開配對（含還原誤合併）：兩筆恢復為獨立活動，之後重跑擷取也不會再合併
eventsRouter.post('/duplicates/:eventId/split', requireRole('admin'), (req, res) => {
  const eventId = parseEventId(req.params.eventId);
  if (eventId === undefined || !splitDuplicate(getDb(), eventId, req.user?.id ?? null)) {
    sendDuplicateNotFound(res);
    return;
  }
  res.json({ pairs: listDuplicatePairs(getDb()) });
});

// #65 管理員的留言檢舉審核：列出有待審檢舉的留言
eventsRouter.get('/comment-reports', requireRole('admin'), (_req, res) => {
  res.json({ reports: listPendingReports(getDb()) });
});

// #65 管理員審核一則留言的檢舉：hide 隱藏留言、dismiss 駁回；同一則留言的待審檢舉一併結案
eventsRouter.post('/comment-reports/:commentId/:action', requireRole('admin'), (req, res) => {
  const commentId = parseEventId(req.params.commentId);
  const action = req.params.action;
  if (action !== 'hide' && action !== 'dismiss') {
    res.status(404).json({ error: 'not_found', message: '不支援的審核動作' });
    return;
  }
  if (
    commentId === undefined ||
    !req.user ||
    !reviewCommentReports(getDb(), {
      commentId,
      action: action satisfies ReviewAction,
      reviewerId: req.user.id,
    })
  ) {
    res.status(404).json({ error: 'not_found', message: '這則留言沒有待審的檢舉' });
    return;
  }
  res.json({ reports: listPendingReports(getDb()) });
});

function parseEventId(value: unknown): number | undefined {
  const id = Number(value);
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id)
    ? id
    : undefined;
}

function sendDuplicateNotFound(res: Response) {
  res.status(404).json({ error: 'not_found', message: '找不到這組可能重複或已合併的活動' });
}

/** 依路徑上的 eventId 讀取已發布活動；id 無效、不存在或待審時回 404 並回傳 undefined。 */
function findPublishedEventOr404(eventId: unknown, res: Response): PublishedEvent | undefined {
  const id = parseEventId(eventId);
  const event = id === undefined ? undefined : findPublishedEventById(getDb(), id);
  if (!event) res.status(404).json({ error: 'not_found', message: '找不到這個活動' });
  return event;
}

// US-02 取得活動詳細資訊（未登入可用）；id 無效、不存在或待審的活動一律回 404
eventsRouter.get('/:eventId', (req, res) => {
  const event = findPublishedEventOr404(req.params.eventId, res);
  if (!event) return;
  // categoryLabel 取自 EVENT_CATEGORY_LABELS（類別顯示名稱的單一來源）；查無對照時顯示代碼
  const categoryLabel = EVENT_CATEGORY_LABELS[event.category] ?? event.category;
  // US-20 sources：自己的來源與合併進來的活動的來源，活動頁列出全部
  res.json({ event: { ...event, categoryLabel, sources: listEventSources(getDb(), event.id) } });
});

/** 讀取 JSON body 的欄位；body 不是物件時回傳 undefined。 */
function bodyField(body: unknown, name: string): unknown {
  return typeof body === 'object' && body !== null && name in body
    ? (body as Record<string, unknown>)[name]
    : undefined;
}

/** 驗證留言內容（去除前後空白）；不合法時回 400 並回傳 undefined。 */
function readCommentContent(body: unknown, res: Response): string | undefined {
  const raw = bodyField(body, 'content');
  const content = typeof raw === 'string' ? raw.trim() : '';
  const contentError = validateCommentContent(content);
  if (contentError) {
    res.status(400).json({
      error: 'validation_error',
      message: '留言內容有誤',
      fields: { content: contentError },
    });
    return undefined;
  }
  return content;
}

function sendCommentNotFound(res: Response) {
  res.status(404).json({ error: 'not_found', message: '找不到這則留言' });
}

// US-10 活動留言：未登入可看，留言需登入。
// #79 sort=oldest（預設）|newest|top 排序頂層留言，回覆附在各留言的 replies，由舊到新
eventsRouter.get('/:eventId/comments', (req, res) => {
  const event = findPublishedEventOr404(req.params.eventId, res);
  if (!event) return;
  const sort = isCommentSort(req.query.sort) ? req.query.sort : 'oldest';
  res.json(listEventComments(getDb(), event.id, { viewerId: req.user?.id ?? null, sort }));
});

// 發表留言；帶 parentId 時為回覆（回覆「回覆」會掛到同一則頂層留言）
eventsRouter.post('/:eventId/comments', requireAuth, (req, res) => {
  const event = findPublishedEventOr404(req.params.eventId, res);
  if (!event || !req.user) return;
  const content = readCommentContent(req.body, res);
  if (content === undefined) return;
  const rawParent = bodyField(req.body, 'parentId');
  let parentId: number | null = null;
  if (rawParent !== undefined && rawParent !== null) {
    const resolved =
      typeof rawParent === 'number' && Number.isSafeInteger(rawParent) && rawParent > 0
        ? resolveReplyParent(getDb(), event.id, rawParent)
        : undefined;
    if (resolved === undefined) {
      res.status(404).json({ error: 'not_found', message: '要回覆的留言不存在或已被刪除' });
      return;
    }
    parentId = resolved;
  }
  const comment = createEventComment(getDb(), {
    eventId: event.id,
    userId: req.user.id,
    content,
    parentId,
  });
  res.status(201).json({ comment });
});

// #79 留言者編輯自己的留言
eventsRouter.patch('/:eventId/comments/:commentId', requireAuth, (req, res) => {
  const event = findPublishedEventOr404(req.params.eventId, res);
  if (!event || !req.user) return;
  const commentId = parseEventId(req.params.commentId);
  if (commentId === undefined) return sendCommentNotFound(res);
  const content = readCommentContent(req.body, res);
  if (content === undefined) return;
  const result = updateEventComment(getDb(), {
    eventId: event.id,
    commentId,
    userId: req.user.id,
    content,
  });
  if (result.ok) res.json({ comment: result.comment });
  else if (result.error === 'forbidden') {
    res.status(403).json({ error: 'forbidden', message: '只能編輯自己的留言' });
  } else sendCommentNotFound(res);
});

// #79 刪除留言：留言者可刪除自己的留言，管理員可刪除任何留言（等同隱藏）
eventsRouter.delete('/:eventId/comments/:commentId', requireAuth, (req, res) => {
  const event = findPublishedEventOr404(req.params.eventId, res);
  if (!event || !req.user) return;
  const commentId = parseEventId(req.params.commentId);
  if (commentId === undefined) return sendCommentNotFound(res);
  const result = deleteEventComment(getDb(), { eventId: event.id, commentId, user: req.user });
  if (result.ok) res.status(204).end();
  else if (result.error === 'forbidden') {
    res.status(403).json({ error: 'forbidden', message: '只能刪除自己的留言' });
  } else sendCommentNotFound(res);
});

// #79 按讚（PUT）與取消讚（DELETE），可重複呼叫
for (const [method, liked] of [
  ['put', true],
  ['delete', false],
] as const) {
  eventsRouter[method]('/:eventId/comments/:commentId/like', requireAuth, (req, res) => {
    const event = findPublishedEventOr404(req.params.eventId, res);
    if (!event || !req.user) return;
    const commentId = parseEventId(req.params.commentId);
    const result =
      commentId === undefined
        ? undefined
        : setCommentLike(getDb(), { eventId: event.id, commentId, userId: req.user.id, liked });
    if (result) res.json(result);
    else sendCommentNotFound(res);
  });
}

// #65 檢舉留言：需登入，不能檢舉自己的留言，同一人對同一則只能檢舉一次
eventsRouter.post('/:eventId/comments/:commentId/reports', requireAuth, (req, res) => {
  const event = findPublishedEventOr404(req.params.eventId, res);
  if (!event || !req.user) return;
  const commentId = parseEventId(req.params.commentId);
  const body: unknown = req.body;
  const field = (name: string) =>
    typeof body === 'object' && body !== null && name in body
      ? (body as Record<string, unknown>)[name]
      : undefined;
  const reason = field('reason');
  const rawNote = field('note');
  const note = typeof rawNote === 'string' ? rawNote.trim() : '';
  const fields: Record<string, string> = {};
  if (!isReportReason(reason)) fields.reason = '請選擇檢舉原因';
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') {
    fields.note = '補充說明格式有誤';
  } else if (note.length > REPORT_NOTE_MAX_LENGTH) {
    fields.note = `補充說明不可超過 ${REPORT_NOTE_MAX_LENGTH} 個字元`;
  }
  if (commentId === undefined) {
    res.status(404).json({ error: 'not_found', message: '找不到這則留言' });
    return;
  }
  if (!isReportReason(reason) || Object.keys(fields).length > 0) {
    res.status(400).json({ error: 'validation_error', message: '檢舉資料有誤', fields });
    return;
  }
  const result = createCommentReport(getDb(), {
    eventId: event.id,
    commentId,
    reporterId: req.user.id,
    reason,
    note: note || null,
  });
  if (result.ok) {
    res.status(201).json({ ok: true });
  } else if (result.error === 'comment_not_found') {
    res.status(404).json({ error: 'not_found', message: '找不到這則留言' });
  } else if (result.error === 'own_comment') {
    res.status(400).json({ error: 'own_comment', message: '不能檢舉自己的留言' });
  } else {
    res.status(409).json({ error: 'already_reported', message: '你已經檢舉過這則留言' });
  }
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
