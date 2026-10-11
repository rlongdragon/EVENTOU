import { Router } from 'express';
import { notImplemented } from '../../shared/notImplemented.js';

// 活動（Event）：RawAnnouncement → Event，唯一鍵 source_id + original_url
// TODO(#5): US-19 定義 Event 資料結構，把 RawAnnouncement 整理成統一活動格式
// TODO(#7): US-20 跨來源偵測可能重複的活動
export const eventsRouter = Router();

// TODO(#6): US-01 搜尋活動（未登入可用），支援關鍵字與篩選條件
eventsRouter.get('/', notImplemented('#6'));

// TODO(#12): US-02 取得活動詳細資訊
// TODO(#18): US-03 回傳活動地點座標，供活動頁顯示地圖
eventsRouter.get('/:eventId', notImplemented('#12'));

// TODO(#13): US-10 活動留言（需登入）
eventsRouter.get('/:eventId/comments', notImplemented('#13'));
eventsRouter.post('/:eventId/comments', notImplemented('#13'));

// TODO(#14): US-11 活動評價（需登入）
eventsRouter.get('/:eventId/ratings', notImplemented('#14'));
eventsRouter.post('/:eventId/ratings', notImplemented('#14'));
