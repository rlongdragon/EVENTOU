import { Router } from 'express';
import { notImplemented } from '../../shared/notImplemented.js';

// 地圖
export const mapRouter = Router();

type GeocodeResult = { latitude: number; longitude: number } | null;
const geocodeCache = new Map<string, GeocodeResult>();
let lastGeocodeAt = 0;

// US-03：以 Nominatim 將公告地點轉為座標，快取同一地點的查詢結果。
mapRouter.get('/geocode', async (req, res) => {
  const location = typeof req.query.location === 'string' ? req.query.location.trim() : '';
  if (!location || location.length > 200) {
    res.status(400).json({ error: 'invalid_location' });
    return;
  }

  const key = location.toLocaleLowerCase();
  if (geocodeCache.has(key)) {
    res.json({ coordinates: geocodeCache.get(key) });
    return;
  }

  try {
    const wait = Math.max(0, 1000 - (Date.now() - lastGeocodeAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastGeocodeAt = Date.now();
    const query = new URLSearchParams({
      q: `${location}, Taiwan`,
      format: 'jsonv2',
      limit: '1',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, {
      headers: { 'User-Agent': 'EVENTOU/1.0 (campus event map)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    const results = (await response.json()) as { lat: string; lon: string }[];
    const result = results[0]
      ? { latitude: Number(results[0].lat), longitude: Number(results[0].lon) }
      : null;
    geocodeCache.set(key, result);
    res.json({ coordinates: result });
  } catch {
    res.status(502).json({ error: 'geocoding_unavailable' });
  }
});

// TODO(#19): US-04 整合式校園活動地圖，回傳指定範圍／時間內有座標的活動
mapRouter.get('/events', notImplemented('#19'));
