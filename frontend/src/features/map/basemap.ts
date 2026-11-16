import L from 'leaflet';
import { getTileLayerConfig } from './mapTiles';

const POSITRON_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const rasterConfig = getTileLayerConfig(import.meta.env.VITE_CARTO_API_KEY);

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * 底圖：CARTO Positron 向量樣式（MapLibre GL 畫在 Leaflet 圖層裡，免金鑰、淺灰配色）。
 * 沒有 WebGL、套件載入失敗或樣式載入失敗時，退回原本的點陣圖磚（mapTiles.ts）。
 * 回傳的函式會移除底圖。
 */
export function addBasemap(map: L.Map): () => void {
  let cancelled = false;
  let layer: L.Layer | null = null;

  const fallBackToRaster = (reason?: unknown) => {
    if (cancelled) return;
    if (reason) console.warn('[basemap] 向量底圖無法使用，改用點陣圖磚', reason);
    layer?.remove();
    const { url, ...options } = rasterConfig;
    layer = L.tileLayer(url, options).addTo(map);
  };

  if (!supportsWebGL()) {
    fallBackToRaster();
  } else {
    void Promise.all([
      import('@maplibre/maplibre-gl-leaflet'),
      import('maplibre-gl'),
      // MapLibre 預設從自己模組的位置找 worker，被 Vite 打包後路徑會錯，改用 Vite 打包好的 worker
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ])
      .then(([{ maplibreGL }, maplibre, { default: workerUrl }]) => {
        if (cancelled) return;
        maplibre.setWorkerUrl(workerUrl);
        const vector = maplibreGL({
          style: POSITRON_STYLE,
          attributionControl: { customAttribution: CARTO_ATTRIBUTION },
        });
        try {
          vector.addTo(map);
        } catch (error) {
          // addTo 失敗時 MapLibre 地圖沒有建立，移除圖層前要避免 onRemove 再去存取它
          vector.onRemove = () => vector;
          map.removeLayer(vector);
          fallBackToRaster(error);
          return;
        }
        layer = vector;
        const glMap = vector.getMaplibreMap();
        glMap.on('error', (event) => {
          if (glMap.isStyleLoaded() || cancelled) return;
          fallBackToRaster(event.error);
        });
      })
      .catch(fallBackToRaster);
  }

  return () => {
    cancelled = true;
    layer?.remove();
  };
}
