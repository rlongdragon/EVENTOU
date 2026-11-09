import { useEffect, useId } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './mapView.css';

export interface MapMarker {
  id: string | number;
  latitude: number;
  longitude: number;
  label: string;
}

interface MapViewProps {
  markers: MapMarker[];
  ariaLabel: string;
}

/** US-03 與 US-04 共用的 Leaflet 地圖；標記數量可為一筆或多筆。 */
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

    const markerLayer = L.featureGroup(
      markers.map((marker) => {
        const popup = document.createElement('span');
        popup.textContent = marker.label;
        return L.marker([marker.latitude, marker.longitude]).bindPopup(popup);
      }),
    ).addTo(map);

    if (markers.length === 1) {
      const [marker] = markers;
      map.setView([marker.latitude, marker.longitude], 16);
    } else {
      map.fitBounds(markerLayer.getBounds().pad(0.15), { maxZoom: 16 });
    }

    return () => {
      map.remove();
    };
  }, [mapId, markers]);

  return <div id={mapId} className="map-view" role="application" aria-label={ariaLabel} />;
}
