import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { formatEventTime } from '../events/eventTime';
import { MapView, type MapMarker } from './MapView';
import { categoryClassName, categoryGlyph } from './mapCategories';
import { fetchMapEvents, type MapEventResult } from './api';
import {
  DATE_RANGE_PRESETS,
  DEFAULT_RANGE_DAYS,
  getTaipeiToday,
  isValidRange,
  rangeFromToday,
  type DateRange,
} from './dateRange';
import './campusMapPage.css';

interface LoadedMapEvents {
  key: string;
  result: MapEventResult;
}

export function CampusMapPage() {
  const [today] = useState(() => getTaipeiToday());
  const [range, setRange] = useState<DateRange>(() => rangeFromToday(today, DEFAULT_RANGE_DAYS));
  const [category, setCategory] = useState('');
  const [loaded, setLoaded] = useState<LoadedMapEvents | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const { from, to } = range;
  const rangeIsValid = isValidRange(range);
  const key = `${from}|${to}|${category}`;

  useEffect(() => {
    // 範圍無效時不查詢，保留上一次的地圖並提示錯誤
    if (!rangeIsValid) return;
    const controller = new AbortController();
    fetchMapEvents({ from, to, category }, controller.signal)
      .then((result) => setLoaded({ key, result }))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError({ key, message: String(reason) });
      });
    return () => controller.abort();
  }, [category, from, to, key, rangeIsValid]);

  // 換篩選條件時先保留上一次的標記，載入完成再一次更新，地圖不會先跳回中心
  const result = loaded?.result;
  const isLoading = rangeIsValid && loaded?.key !== key;
  const matchingError = rangeIsValid
    ? error?.key === key
      ? `無法載入活動地圖：${error.message}`
      : null
    : '開始日期不能晚於結束日期。';
  const items = useMemo(() => result?.items ?? [], [result]);
  const showResult = !isLoading && !matchingError;
  const unlocatedEvents = showResult ? items.filter((event) => !event.coordinates) : [];
  const markers = useMemo<MapMarker[]>(
    () =>
      items.flatMap((event) =>
        event.coordinates
          ? [
              {
                id: event.id,
                ...event.coordinates,
                label: event.title,
                category: event.category,
                categoryLabel: event.categoryLabel,
                details: [
                  formatEventTime(event),
                  event.placeName && !event.location.includes(event.placeName)
                    ? `${event.location}（${event.placeName}）`
                    : event.location,
                ],
                href: `/events/${event.id}`,
              },
            ]
          : [],
      ),
    [items],
  );

  return (
    <section className="campus-map-page">
      <h1>校園活動地圖</h1>
      <div className="campus-map-filters">
        <label>
          開始日期
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setRange({ from: event.target.value, to })}
          />
        </label>
        <label>
          結束日期
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setRange({ from, to: event.target.value })}
          />
        </label>
        <label>
          類別
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">全部類別</option>
            {result?.categories.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="campus-map-presets" role="group" aria-label="快速選擇日期範圍">
        {DATE_RANGE_PRESETS.map((preset) => {
          const presetRange = rangeFromToday(today, preset.days);
          const active = presetRange.from === from && presetRange.to === to;
          return (
            <button
              key={preset.days}
              type="button"
              aria-pressed={active}
              onClick={() => setRange(presetRange)}
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setRange({ from: '', to: '' });
            setCategory('');
          }}
        >
          清除篩選
        </button>
      </div>
      {matchingError && <p role="alert">{matchingError}</p>}
      {!matchingError && isLoading && <p role="status">正在載入活動地圖…</p>}
      {showResult && (
        <p role="status">
          {items.length === 0
            ? '目前沒有符合條件的活動。'
            : `地圖顯示 ${markers.length} 筆活動，點選標記可查看摘要與詳細頁連結。`}
        </p>
      )}
      {result && (
        <>
          <ul className="map-legend" aria-label="圖例">
            {result.categories.map((option) => (
              <li key={option.code}>
                <span
                  className={`map-legend-swatch ${categoryClassName(option.code)}`}
                  aria-hidden="true"
                >
                  {categoryGlyph(option.code)}
                </span>
                {option.label}
              </li>
            ))}
          </ul>
          <MapView markers={markers} ariaLabel="校園活動地圖" emptyCenter={result.campus} />
        </>
      )}
      {unlocatedEvents.length > 0 && (
        <section className="campus-map-unlocated" aria-labelledby="campus-map-unlocated-heading">
          <h2 id="campus-map-unlocated-heading">無法定位的活動（{unlocatedEvents.length}）</h2>
          <p className="campus-map-note">以下活動的地點對不到校內建物，未顯示在地圖上。</p>
          <ul>
            {unlocatedEvents.map((event) => (
              <li key={event.id}>
                <Link to={`/events/${event.id}`}>{event.title}</Link>
                <div className="campus-map-note">
                  {formatEventTime(event)}｜{event.location}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
