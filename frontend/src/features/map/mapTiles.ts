export interface TileLayerConfig {
  url: string;
  maxZoom: number;
  subdomains?: string;
  attribution: string;
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

/**
 * 依是否有 CARTO 金鑰決定底圖：有金鑰用 CARTO Voyager（配色較淡，標記比較顯眼），
 * 沒有就退回 OpenStreetMap 標準圖磚，讓沒申請金鑰的組員也能開發。
 * CARTO 自 2026-09 起點陣圖磚需要金鑰，非商業用途免費（見 frontend/.env.example）。
 */
export function getTileLayerConfig(cartoApiKey?: string): TileLayerConfig {
  const key = cartoApiKey?.trim();
  if (!key) {
    return {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      attribution: OSM_ATTRIBUTION,
    };
  }
  return {
    url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`,
    maxZoom: 20,
    subdomains: 'abcd',
    attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
  };
}
