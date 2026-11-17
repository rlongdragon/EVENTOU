import './mapModeToggle.css';

export type MapMode = '3d' | '2d';

interface MapModeToggleProps {
  mode: MapMode;
  onChange: (mode: MapMode) => void;
  /** 按鈕順序；地圖頁預設立體所以立體在前，活動頁預設平面所以平面在前 */
  order?: MapMode[];
}

const LABELS: Record<MapMode, string> = { '3d': '立體', '2d': '平面' };

/** 地圖的「立體／平面」切換，地圖頁與活動頁的地點地圖共用。 */
export function MapModeToggle({ mode, onChange, order = ['3d', '2d'] }: MapModeToggleProps) {
  return (
    <div className="map-mode-toggle" role="group" aria-label="地圖檢視">
      {order.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => onChange(option)}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}
