import { useEffect, useId, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster';
import { categoryClassName, categoryGlyph } from './mapCategories';
import { getTileLayerConfig } from './mapTiles';
import './mapView.css';

export interface MapMarker {
  id: string | number;
  latitude: number;
  longitude: number;
  label: string;
  /** 活動類別代碼，決定標記顏色與縮寫 */
  category?: string;
  /** 彈出視窗上方顯示的類別名稱 */
  categoryLabel?: string;
  /** 彈出視窗中標題下方的資訊，每項一行 */
  details?: string[];
  href?: string;
}

interface MapViewProps {
  markers: MapMarker[];
  ariaLabel: string;
  /** 沒有任何標記時的地圖中心；未提供時地圖要等有標記才會定位 */
  emptyCenter?: { latitude: number; longitude: number };
}

const DEFAULT_ZOOM = 16;

const tileLayerConfig = getTileLayerConfig(import.meta.env.VITE_CARTO_API_KEY);

/** 依類別上色的水滴形標記；縮寫為固定常數，不含使用者輸入。 */
function createPinIcon(marker: MapMarker): L.DivIcon {
  return L.divIcon({
    className: 'map-pin-icon',
    html: `<span class="map-pin ${categoryClassName(marker.category)}"><span class="map-pin-glyph">${categoryGlyph(marker.category)}</span></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -38],
  });
}

function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count >= 50 ? 52 : count >= 10 ? 46 : 40;
  return L.divIcon({
    className: 'map-cluster-icon',
    html: `<span class="map-cluster"><span>${count}</span></span>`,
    iconSize: [size, size],
  });
}

/** US-03 與 US-04 共用的 Leaflet 地圖，支援多筆標記與聚合。 */
export function MapView({ markers, ariaLabel, emptyCenter }: MapViewProps) {
  const mapId = useId();
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markerRecordsRef = useRef(new Map<string, { marker: L.Marker; signature: string }>());
  const userInteractedRef = useRef(false);

  useEffect(() => {
    const map = L.map(mapId, { scrollWheelZoom: false });
    const markerRecords = markerRecordsRef.current;
    const { url: tileUrl, ...tileOptions } = tileLayerConfig;
    L.tileLayer(tileUrl, tileOptions).addTo(map);
    const cluster = L.markerClusterGroup({
      iconCreateFunction: createClusterIcon,
      showCoverageOnHover: false,
    }).addTo(map);
    const markUserInteraction = () => {
      userInteractedRef.current = true;
    };
    map.getContainer().addEventListener('pointerdown', markUserInteraction);
    map.getContainer().addEventListener('wheel', markUserInteraction);
    map.getContainer().addEventListener('keydown', markUserInteraction);
    mapRef.current = map;
    clusterRef.current = cluster;

    return () => {
      map.getContainer().removeEventListener('pointerdown', markUserInteraction);
      map.getContainer().removeEventListener('wheel', markUserInteraction);
      map.getContainer().removeEventListener('keydown', markUserInteraction);
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      markerRecords.clear();
      userInteractedRef.current = false;
    };
  }, [mapId]);

  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;

    const nextIds = new Set(markers.map((marker) => String(marker.id)));
    let removedCount = 0;
    for (const [id, record] of markerRecordsRef.current) {
      if (!nextIds.has(id)) {
        cluster.removeLayer(record.marker);
        markerRecordsRef.current.delete(id);
        removedCount += 1;
      }
    }

    let addedCount = 0;
    for (const marker of markers) {
      const id = String(marker.id);
      const signature = JSON.stringify(marker);
      const existing = markerRecordsRef.current.get(id);
      if (existing) {
        if (existing.signature !== signature) {
          existing.marker.setLatLng([marker.latitude, marker.longitude]);
          existing.marker.setIcon(createPinIcon(marker));
          existing.marker.setPopupContent(createPopupContent(marker));
          existing.marker.getPopup()?.update();
          existing.signature = signature;
        }
        continue;
      }

      const leafletMarker = L.marker([marker.latitude, marker.longitude], {
        icon: createPinIcon(marker),
        title: marker.label,
      }).bindPopup(createPopupContent(marker), POPUP_OPTIONS);
      cluster.addLayer(leafletMarker);
      markerRecordsRef.current.set(id, { marker: leafletMarker, signature });
      addedCount += 1;
    }

    // 容器可能在建立地圖後才有尺寸（例如分頁在背景載入），定位前先重新量測
    map.invalidateSize();
    if (markers.length === 0) {
      // 地圖尚未定位，或標記全被篩選掉時，回到預設中心
      if (emptyCenter && (removedCount > 0 || !isMapPositioned(map))) {
        map.setView([emptyCenter.latitude, emptyCenter.longitude], DEFAULT_ZOOM);
      }
    } else if (addedCount > 0 && (removedCount > 0 || !userInteractedRef.current)) {
      if (markers.length === 1) {
        const [marker] = markers;
        map.setView([marker.latitude, marker.longitude], DEFAULT_ZOOM);
      } else {
        map.fitBounds(cluster.getBounds().pad(0.15), { maxZoom: DEFAULT_ZOOM });
      }
    }
  }, [markers, emptyCenter]);

  return <div id={mapId} className="map-view" role="application" aria-label={ariaLabel} />;
}

/** Leaflet 在第一次 setView／fitBounds 前沒有中心點，getCenter 會丟出錯誤。 */
function isMapPositioned(map: L.Map): boolean {
  try {
    map.getCenter();
    return true;
  } catch {
    return false;
  }
}

const POPUP_OPTIONS: L.PopupOptions = { className: 'map-popup', minWidth: 220, maxWidth: 300 };

/** 以 DOM API 組出彈出視窗，所有文字都用 textContent，不會被當成 HTML。 */
function createPopupContent(marker: MapMarker): HTMLElement {
  const popup = document.createElement('div');
  popup.className = 'map-popup-body';
  if (marker.categoryLabel) {
    const chip = document.createElement('span');
    chip.className = `map-popup-category ${categoryClassName(marker.category)}`;
    chip.textContent = marker.categoryLabel;
    popup.append(chip);
  }
  const title = document.createElement('strong');
  title.className = 'map-popup-title';
  title.textContent = marker.label;
  popup.append(title);
  for (const detail of marker.details ?? []) {
    const line = document.createElement('p');
    line.className = 'map-popup-detail';
    line.textContent = detail;
    popup.append(line);
  }
  if (marker.href) {
    const link = document.createElement('a');
    link.className = 'map-popup-link';
    link.href = marker.href;
    link.textContent = '查看活動詳細資訊 →';
    popup.append(link);
  }
  return popup;
}
