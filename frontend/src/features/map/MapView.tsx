import { useEffect, useId, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import './mapView.css';

export interface MapMarker {
  id: string | number;
  latitude: number;
  longitude: number;
  label: string;
  summary?: string;
  href?: string;
}

interface MapViewProps {
  markers: MapMarker[];
  ariaLabel: string;
}

const markerIcon = new L.Icon({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/** US-03 與 US-04 共用的 Leaflet 地圖，支援多筆標記與聚合。 */
export function MapView({ markers, ariaLabel }: MapViewProps) {
  const mapId = useId();
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markerRecordsRef = useRef(new Map<string, { marker: L.Marker; signature: string }>());
  const userInteractedRef = useRef(false);

  useEffect(() => {
    const map = L.map(mapId, { scrollWheelZoom: false });
    const markerRecords = markerRecordsRef.current;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);
    const cluster = L.markerClusterGroup().addTo(map);
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
          existing.marker.setPopupContent(createPopupContent(marker));
          existing.marker.getPopup()?.update();
          existing.signature = signature;
        }
        continue;
      }

      const leafletMarker = L.marker([marker.latitude, marker.longitude], {
        icon: markerIcon,
      }).bindPopup(createPopupContent(marker));
      cluster.addLayer(leafletMarker);
      markerRecordsRef.current.set(id, { marker: leafletMarker, signature });
      addedCount += 1;
    }

    if (addedCount > 0 && (removedCount > 0 || !userInteractedRef.current)) {
      if (markers.length === 1) {
        const [marker] = markers;
        map.setView([marker.latitude, marker.longitude], 16);
      } else if (markers.length > 1) {
        map.fitBounds(cluster.getBounds().pad(0.15), { maxZoom: 16 });
      }
    }
  }, [markers]);

  return <div id={mapId} className="map-view" role="application" aria-label={ariaLabel} />;
}

function createPopupContent(marker: MapMarker): HTMLElement {
  const popup = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = marker.label;
  popup.append(title);
  if (marker.summary) {
    const summary = document.createElement('p');
    summary.textContent = marker.summary;
    popup.append(summary);
  }
  if (marker.href) {
    const link = document.createElement('a');
    link.href = marker.href;
    link.textContent = '查看活動詳細資訊';
    popup.append(link);
  }
  return popup;
}
