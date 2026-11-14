import { useEffect, useState } from 'react';
import { MapView } from '../map/MapView';
import type { MapCoordinates } from '../map/api';

type LocationState = 'loading' | 'found' | 'not_found' | 'error';

interface EventLocationMapProps {
  eventId: number;
  location: string | null;
}

interface LocationResult {
  eventId: number;
  query: string;
  state: LocationState;
  coordinates: MapCoordinates | null;
  placeName: string | null;
}

export function EventLocationMap({ eventId, location }: EventLocationMapProps) {
  const [result, setResult] = useState<LocationResult | null>(null);
  const query = location?.trim() ?? '';

  useEffect(() => {
    if (!query) return;

    const controller = new AbortController();
    fetch(`/api/map/events/${eventId}/location`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as {
          coordinates: MapCoordinates | null;
          placeName: string | null;
        };
      })
      .then(({ coordinates, placeName }) => {
        setResult({
          eventId,
          query,
          state: coordinates ? 'found' : 'not_found',
          coordinates,
          placeName,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ eventId, query, state: 'error', coordinates: null, placeName: null });
        }
      });
    return () => controller.abort();
  }, [eventId, query]);

  // 切換活動時不沿用上一個活動的結果
  const current = result?.eventId === eventId && result.query === query ? result : null;
  const state: LocationState = current?.state ?? 'loading';

  return (
    <section className="event-location-section" aria-labelledby="event-location-heading">
      <h2 id="event-location-heading">地點地圖</h2>
      {!query && <p>此活動沒有地點資料，無法顯示地圖。</p>}
      {query && state === 'loading' && <p role="status">正在載入地點地圖…</p>}
      {query && state === 'not_found' && (
        <p>「{query}」無法對應到校內建物，暫時無法在地圖上顯示。</p>
      )}
      {query && state === 'error' && <p role="status">暫時無法載入地點地圖，請稍後再試。</p>}
      {query && state === 'found' && current?.coordinates && (
        <MapView
          markers={[
            {
              id: eventId,
              ...current.coordinates,
              label: query,
              summary:
                current.placeName && current.placeName !== query ? current.placeName : undefined,
            },
          ]}
          ariaLabel={`${query}地圖`}
        />
      )}
    </section>
  );
}
