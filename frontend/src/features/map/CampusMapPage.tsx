import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { formatEventTime } from '../events/eventTime';
import { MapView, type MapMarker } from './MapView';
import { fetchMapEvents, type MapEventResult } from './api';
import './campusMapPage.css';

interface LoadedMapEvents {
  key: string;
  result: MapEventResult;
}

function getTaipeiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function CampusMapPage() {
  const [date, setDate] = useState(getTaipeiToday);
  const [category, setCategory] = useState('');
  const [loaded, setLoaded] = useState<LoadedMapEvents | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const key = `${date}|${category}`;

  useEffect(() => {
    const controller = new AbortController();
    fetchMapEvents({ date, category }, controller.signal)
      .then((result) => setLoaded({ key, result }))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError({ key, message: String(reason) });
      });
    return () => controller.abort();
  }, [category, date, key]);

  // 換篩選條件時先保留上一次的標記，載入完成再一次更新，地圖不會先跳回中心
  const result = loaded?.result;
  const isLoading = loaded?.key !== key;
  const matchingError = error?.key === key ? error.message : null;
  const items = useMemo(() => result?.items ?? [], [result]);
  const unlocatedEvents = isLoading ? [] : items.filter((event) => !event.coordinates);
  const markers = useMemo<MapMarker[]>(
    () =>
      items.flatMap((event) =>
        event.coordinates
          ? [
              {
                id: event.id,
                ...event.coordinates,
                label: event.title,
                summary: `${formatEventTime(event)}｜${event.categoryLabel}｜${event.location}`,
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
          日期
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
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
        <button
          type="button"
          onClick={() => {
            setDate('');
            setCategory('');
          }}
        >
          清除篩選
        </button>
      </div>
      {matchingError && <p role="alert">無法載入活動地圖：{matchingError}</p>}
      {!matchingError && isLoading && <p role="status">正在載入活動地圖…</p>}
      {!matchingError && !isLoading && (
        <p role="status">
          {items.length === 0
            ? '目前沒有符合條件的活動。'
            : `地圖顯示 ${markers.length} 筆活動，點選標記可查看摘要與詳細頁連結。`}
        </p>
      )}
      {result && <MapView markers={markers} ariaLabel="校園活動地圖" emptyCenter={result.campus} />}
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
