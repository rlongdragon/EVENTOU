import { useCallback, useEffect, useRef, useState } from 'react';
import type L from 'leaflet';
import { Campus3DView } from './Campus3DView';
import { MapView, type MapMarker } from './MapView';
import './campusMapStage.css';

export type MapMode = '3d' | '2d';

interface CampusMapStageProps {
  mode: MapMode;
  /** 平面地圖的資料；活動還沒載入時為 null，只顯示立體模型 */
  map2d: {
    markers: MapMarker[];
    ariaLabel: string;
    emptyCenter?: { latitude: number; longitude: number };
  } | null;
}

const FADE_MS = 600;

type Reply = { type: string; lat?: number; lng?: number; zoom?: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function isPositioned(map: L.Map): boolean {
  try {
    map.getCenter();
    return true;
  } catch {
    return false;
  }
}

/**
 * 立體模型與平面地圖疊在同一個框裡，切換時兩邊先對齊同一個位置再淡入淡出：
 * - 平面 → 立體：3D 先停在與平面地圖重疊的俯視、近平行投影畫面，淡入後才慢慢變成透視、傾斜成立體視角。
 * - 立體 → 平面：3D 先轉回北方朝上的俯視並收成近平行投影，平面地圖對到同一點後再淡入。
 * 兩邊透過 postMessage 溝通（3D 模型在同源的 iframe 裡）。
 */
export function CampusMapStage({ mode, map2d }: CampusMapStageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const leafletRef = useRef<L.Map | null>(null);
  const waitersRef = useRef(new Map<string, (reply: Reply) => void>());
  const [shown, setShown] = useState<MapMode>(mode);
  const shownRef = useRef<MapMode>(mode);

  const show = useCallback((next: MapMode) => {
    shownRef.current = next;
    setShown(next);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const reply = event.data as Reply | null;
      if (!reply || typeof reply.type !== 'string') return;
      const waiter = waitersRef.current.get(reply.type);
      if (waiter) {
        waitersRef.current.delete(reply.type);
        waiter(reply);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const waitFor = useCallback(
    (type: string, timeoutMs: number) =>
      new Promise<Reply | null>((resolve) => {
        const timer = setTimeout(() => {
          waitersRef.current.delete(type);
          resolve(null);
        }, timeoutMs);
        waitersRef.current.set(type, (reply) => {
          clearTimeout(timer);
          resolve(reply);
        });
      }),
    [],
  );

  useEffect(() => {
    if (mode === shownRef.current) return;
    let cancelled = false;

    const run = async () => {
      const win = iframeRef.current?.contentWindow as (Window & { __ready?: boolean }) | null;
      const map = leafletRef.current;
      // 3D 還沒載入、平面地圖還沒定位，或使用者偏好減少動態時，直接切換
      if (!win?.__ready || !map || !isPositioned(map) || prefersReducedMotion()) {
        show(mode);
        return;
      }

      if (mode === '3d') {
        const center = map.getCenter();
        const ready = waitFor('eventou:3d-ready', 5000);
        win.postMessage(
          { type: 'eventou:to-3d', lat: center.lat, lng: center.lng, zoom: map.getZoom() },
          location.origin,
        );
        await ready;
        if (cancelled) return;
        show('3d');
        await sleep(FADE_MS);
        if (cancelled) return;
        win.postMessage({ type: 'eventou:3d-begin' }, location.origin);
      } else {
        const ready = waitFor('eventou:2d-ready', 10000);
        win.postMessage({ type: 'eventou:to-2d' }, location.origin);
        const reply = await ready;
        if (cancelled) return;
        if (reply && [reply.lat, reply.lng, reply.zoom].every(Number.isFinite)) {
          map.invalidateSize();
          map.setView([reply.lat!, reply.lng!], reply.zoom!, { animate: false });
          // 等新位置的底圖畫出來再淡入
          await sleep(150);
          if (cancelled) return;
        }
        show('2d');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [mode, show, waitFor]);

  // 立體模型被藏起來時通知它暫停繪製，省下整頁的 CPU／GPU
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'eventou:visibility', visible: shown === '3d' },
      location.origin,
    );
  }, [shown]);

  const onMapReady = useCallback((map: L.Map | null) => {
    leafletRef.current = map;
  }, []);

  return (
    <div
      className="campus-map-stage"
      style={{ '--fade-ms': `${FADE_MS}ms` } as React.CSSProperties}
    >
      <div className="campus-map-layer" data-active={shown === '3d'} inert={shown !== '3d'}>
        <Campus3DView title="3D 校園模型" iframeRef={iframeRef} />
      </div>
      <div className="campus-map-layer" data-active={shown === '2d'} inert={shown !== '2d'}>
        {map2d && <MapView {...map2d} onReady={onMapReady} />}
      </div>
    </div>
  );
}
