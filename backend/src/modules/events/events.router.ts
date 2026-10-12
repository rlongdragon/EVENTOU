import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { notImplemented } from '../../shared/notImplemented.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { findPublishedEventById } from './events.repository.js';

// 活動（Event）：RawAnnouncement → Event，唯一鍵 source_id + original_url
// US-19 轉換入口為 events.service.ts 的 processAnnouncement；資料格式見 events.types.ts。
// TODO(#7): US-20 跨來源偵測可能重複的活動
export const eventsRouter = Router();

// TODO(#6): US-01 搜尋活動（未登入可用），支援關鍵字與篩選條件
eventsRouter.get('/', notImplemented('#6'));

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
  res.json({ event });
});

// TODO(#13): US-10 活動留言（需登入）
eventsRouter.get('/:eventId/comments', notImplemented('#13'));
eventsRouter.post('/:eventId/comments', requireAuth, notImplemented('#13'));

// TODO(#14): US-11 活動評價（需登入）
eventsRouter.get('/:eventId/ratings', notImplemented('#14'));
eventsRouter.post('/:eventId/ratings', requireAuth, notImplemented('#14'));
