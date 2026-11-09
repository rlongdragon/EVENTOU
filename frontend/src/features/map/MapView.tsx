import { useEffect, useId } from 'react';
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

  useEffect(() => {
    if (markers.length === 0) return;
    const map = L.map(mapId, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);
    const cluster = L.markerClusterGroup();

    for (const marker of markers) {
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
      cluster.addLayer(
        L.marker([marker.latitude, marker.longitude], { icon: markerIcon }).bindPopup(popup),
      );
    }

    map.addLayer(cluster);
    if (markers.length === 1) {
      const [marker] = markers;
      map.setView([marker.latitude, marker.longitude], 16);
    } else {
      map.fitBounds(cluster.getBounds().pad(0.15), { maxZoom: 16 });
    }

    return () => {
      map.remove();
    };
  }, [mapId, markers]);

  return <div id={mapId} className="map-view" role="application" aria-label={ariaLabel} />;
}
