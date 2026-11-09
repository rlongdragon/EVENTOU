import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABELS } from '../events/events.types.js';
import { findMapEvents, geocodeLocation, getCachedGeocodeLocation } from './map.service.js';

export const mapRouter = Router();

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// US-04：未登入可取得校園活動地圖資料，依台北日期與類別篩選。
mapRouter.get('/events', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  const date = typeof req.query.date === 'string' ? req.query.date : '';
  if (category && !EVENT_CATEGORIES.includes(category as (typeof EVENT_CATEGORIES)[number])) {
    res.status(400).json({ error: 'invalid_category' });
    return;
  }
  if (date && !isCalendarDate(date)) {
    res.status(400).json({ error: 'invalid_date' });
    return;
  }

  try {
    const events = findMapEvents(getDb(), { category, date });
    const items = events.map((event) => {
      const geocode = getCachedGeocodeLocation(event.location);
      if (geocode.pending) void geocodeLocation(event.location).catch(() => undefined);
      return {
        ...event,
        categoryLabel: EVENT_CATEGORY_LABELS[event.category] ?? event.category,
        coordinates: geocode.coordinates,
        geocodingPending: geocode.pending,
      };
    });
    res.json({
      items,
      geocodingPending: items.some((item) => item.geocodingPending),
      categories: EVENT_CATEGORIES.map((code) => ({
        code,
        label: EVENT_CATEGORY_LABELS[code],
      })),
    });
  } catch {
    res.status(502).json({ error: 'geocoding_unavailable', message: '暫時無法取得活動座標' });
  }
});
