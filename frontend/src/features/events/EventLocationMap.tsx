import { useEffect, useState } from 'react';
import { MapView } from '../map/MapView';

type Coordinates = { latitude: number; longitude: number };
type GeocodeState = 'loading' | 'found' | 'not_found' | 'error';

interface EventLocationMapProps {
  eventId: number;
  location: string | null;
}

export function EventLocationMap({ eventId, location }: EventLocationMapProps) {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [state, setState] = useState<GeocodeState>(location?.trim() ? 'loading' : 'not_found');

  useEffect(() => {
    const query = location?.trim();
    if (!query) return;

    const controller = new AbortController();
    fetch(`/api/map/events/${eventId}/location`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as { coordinates: Coordinates | null };
      })
      .then(({ coordinates: result }) => {
        setCoordinates(result);
        setState(result ? 'found' : 'not_found');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [eventId, location]);

  return (
    <section className="event-location-section" aria-labelledby="event-location-heading">
      <h2 id="event-location-heading">地點地圖</h2>
      {state === 'loading' && <p role="status">正在查詢地點座標…</p>}
      {state === 'not_found' && <p>目前沒有可用的地點資料，無法顯示地圖。</p>}
      {state === 'error' && <p role="status">暫時無法載入地點地圖，請稍後再試。</p>}
      {state === 'found' && coordinates && (
        <MapView
          markers={[{ id: location ?? '', ...coordinates, label: location?.trim() || '活動地點' }]}
          ariaLabel={`${location}地圖`}
        />
      )}
    </section>
  );
}
