import { useEffect, useMemo, useState } from 'react';
import { MapView } from './MapView';
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
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function loadMapEvents() {
      try {
        const result = await fetchMapEvents({ date, category }, controller.signal);
        if (controller.signal.aborted) return;
        setLoaded((previous) => {
          const previousState =
            previous?.key === key
              ? JSON.stringify(
                  previous.result.items.map((item) => [
                    item.id,
                    item.coordinates,
                    item.geocodingPending,
                  ]),
                )
              : null;
          const nextState = JSON.stringify(
            result.items.map((item) => [item.id, item.coordinates, item.geocodingPending]),
          );
          return previousState === nextState &&
            previous?.result.geocodingPending === result.geocodingPending
            ? previous
            : { key, result };
        });
        if (result.geocodingPending) {
          timeout = setTimeout(() => void loadMapEvents(), 1000);
        }
      } catch (reason: unknown) {
        if (!controller.signal.aborted) setError({ key, message: String(reason) });
      }
    }

    void loadMapEvents();
    return () => {
      controller.abort();
      if (timeout) clearTimeout(timeout);
    };
  }, [category, date, key]);

  const result = loaded?.result;
  const isLoading = loaded?.key !== key;
  const matchingError = error?.key === key ? error.message : null;
  const locatedEvents = useMemo(
    () => result?.items.filter((event) => event.coordinates) ?? [],
    [result?.items],
  );
  const unlocatedCount = result?.items.length ? result.items.length - locatedEvents.length : 0;
  const markers = useMemo(
    () =>
      locatedEvents.map((event) => ({
        id: event.id,
        latitude: event.coordinates!.latitude,
        longitude: event.coordinates!.longitude,
        label: event.title,
        summary: `${event.startTime.slice(0, 10)}${event.allDay ? '（全天）' : ''}｜${event.categoryLabel}｜${event.location}`,
        href: `/events/${event.id}`,
      })),
    [locatedEvents],
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
      {isLoading && <p role="status">正在載入活動地圖…首次查詢地點可能需要一些時間。</p>}
      {!isLoading && !matchingError && result?.geocodingPending && (
        <p role="status">正在查詢尚未定位的活動，地圖會逐步更新。</p>
      )}
      {matchingError && <p role="alert">無法載入活動地圖：{matchingError}</p>}
      {!isLoading && !matchingError && markers.length === 0 && (
        <p>目前沒有符合條件且可定位的活動。</p>
      )}
      {!isLoading && !matchingError && markers.length > 0 && (
        <MapView markers={markers} ariaLabel="校園活動地圖" />
      )}
      {!isLoading && !matchingError && !result?.geocodingPending && unlocatedCount > 0 && (
        <p className="campus-map-note">
          有 {unlocatedCount} 筆活動地點無法轉換成座標，未顯示在地圖上。
        </p>
      )}
      {!isLoading && !matchingError && locatedEvents.length > 0 && (
        <p>
          地圖顯示 {locatedEvents.length}{' '}
          筆活動。點選標記查看摘要，並使用標記中的連結查看活動詳細頁。
        </p>
      )}
    </section>
  );
}
