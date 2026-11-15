/** 地圖標記上顯示的類別縮寫；顏色定義在 mapView.css 的 .map-cat--<類別>。 */
export const CATEGORY_GLYPHS: Record<string, string> = {
  lecture: '講',
  workshop: '工',
  exhibition: '展',
  sports: '運',
  welfare: '餐',
};

/** 類別對應的 CSS class；未知或未提供類別時用主題主色。 */
export function categoryClassName(category?: string): string {
  return category && category in CATEGORY_GLYPHS ? `map-cat--${category}` : 'map-cat--default';
}

/** 類別縮寫；未知或未提供類別時顯示圓點。 */
export function categoryGlyph(category?: string): string {
  return (category && CATEGORY_GLYPHS[category]) || '●';
}
