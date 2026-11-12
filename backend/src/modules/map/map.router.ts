import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { notImplemented } from '../../shared/notImplemented.js';
import { findMapEventLocation, geocodeLocation } from './map.service.js';

// 地圖
export const mapRouter = Router();

// US-03：只對資料庫中已發布活動的地點進行地理編碼。
mapRouter.get('/events/:eventId/location', async (req, res) => {
  const id = Number(req.params.eventId);
  if (!/^[1-9]\d*$/.test(req.params.eventId) || !Number.isSafeInteger(id)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const location = findMapEventLocation(getDb(), id);
  if (location === undefined) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (!location?.trim()) {
    res.json({ coordinates: null });
    return;
  }
  try {
    res.json({ coordinates: await geocodeLocation(location) });
  } catch {
    res.status(502).json({ error: 'geocoding_unavailable' });
  }
});

// TODO(#19): US-04 整合式校園活動地圖，回傳指定範圍／時間內有座標的活動
mapRouter.get('/events', notImplemented('#19'));
