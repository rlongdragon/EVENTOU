import { useEffect, useState } from 'react';
import { Campus3DView } from '../map/Campus3DView';
import { CampusMapStage } from '../map/CampusMapStage';
import { campus3DUrl, findCampus3DVenue } from '../map/campus3dVenues';
import { MapModeToggle, type MapMode } from '../map/MapModeToggle';
import type { MapCoordinates } from '../map/api';

type LocationState = 'loading' | 'found' | 'not_found' | 'error';

interface EventLocationMapProps {
  eventId: number;
  location: string | null;
  /** 活動類別代碼，決定標記顏色 */
  category?: string;
}

interface LocationResult {
  eventId: number;
  query: string;
  state: LocationState;
  coordinates: MapCoordinates | null;
  placeName: string | null;
}

export function EventLocationMap({ eventId, location, category }: EventLocationMapProps) {
  const [result, setResult] = useState<LocationResult | null>(null);
  // #80 預設平面（可精準標出地點）；立體模型只在切換後才載入
  const [mode, setMode] = useState<MapMode>('2d');
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
  const venue = query ? findCampus3DVenue(query, current?.placeName) : null;
  // 有地點就能看立體模型；對應不到常用場地時顯示全景並說明
  const show3d = Boolean(query) && mode === '3d';

  return (
    <section className="event-location-section" aria-labelledby="event-location-heading">
      <h2 id="event-location-heading">地點地圖</h2>
      {!query && <p>此活動沒有地點資料，無法顯示地圖。</p>}
      {query && <MapModeToggle mode={mode} onChange={setMode} order={['2d', '3d']} />}
      {show3d && (
        <p className="map-mode-note">
          {venue
            ? `已在立體模型標出「${venue.name}」，可展開樓層查看。`
            : `立體模型目前只能定位到常用場地，「${query}」請切換平面地圖查看位置。`}
        </p>
      )}
      {query && state === 'found' && current?.coordinates ? (
        // 平面與立體疊在同一框，切換時對齊位置再淡入淡出（與地圖頁相同）
        <CampusMapStage
          mode={mode}
          map2d={{
            markers: [
              {
                id: eventId,
                ...current.coordinates,
                label: query,
                category,
                details:
                  current.placeName && current.placeName !== query
                    ? [current.placeName]
                    : undefined,
              },
            ],
            ariaLabel: `${query}地圖`,
          }}
          src3d={campus3DUrl(venue)}
          title3d={venue ? `${venue.name} 3D 模型` : '3D 校園模型'}
          compact
          lazy3d
        />
      ) : (
        <>
          {/* 平面地圖定位不到時，立體模型仍可單獨看 */}
          {show3d && (
            <Campus3DView
              key={venue?.id ?? 'campus'}
              title={venue ? `${venue.name} 3D 模型` : '3D 校園模型'}
              src={campus3DUrl(venue)}
              compact
            />
          )}
          {query && !show3d && state === 'loading' && <p role="status">正在載入地點地圖…</p>}
          {query && !show3d && state === 'not_found' && (
            <p>「{query}」無法對應到校內建物，暫時無法在地圖上顯示。</p>
          )}
          {query && !show3d && state === 'error' && (
            <p role="status">暫時無法載入地點地圖，請稍後再試。</p>
          )}
        </>
      )}
    </section>
  );
}
