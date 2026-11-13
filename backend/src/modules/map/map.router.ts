import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABELS } from '../events/events.types.js';
import { CAMPUS_CENTER, matchCampusPlace, type MatchedCampusPlace } from './map.places.js';
import { findMapEventLocation, findMapEvents } from './map.service.js';

export const mapRouter = Router();

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toLocationResult(place: MatchedCampusPlace | null) {
  return {
    coordinates: place ? { latitude: place.latitude, longitude: place.longitude } : null,
    placeName: place?.name ?? null,
  };
}

// US-03：依已發布活動的地點，從校內建物對照表取得座標。
mapRouter.get('/events/:eventId/location', (req, res) => {
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
  res.json(toLocationResult(matchCampusPlace(location)));
});

// US-04：未登入可取得校園活動地圖資料，依台北日期與類別篩選。
mapRouter.get('/events', (req, res) => {
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

  const items = findMapEvents(getDb(), { category, date }).map((event) => ({
    ...event,
    categoryLabel: EVENT_CATEGORY_LABELS[event.category] ?? event.category,
    ...toLocationResult(matchCampusPlace(event.location)),
  }));
  res.json({
    items,
    campus: CAMPUS_CENTER,
    categories: EVENT_CATEGORIES.map((code) => ({
      code,
      label: EVENT_CATEGORY_LABELS[code],
    })),
  });
});
