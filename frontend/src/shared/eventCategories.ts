/** 類別縮寫，用在地圖標記、月曆等小空間；顏色定義在 shared/eventCategories.css 的 .cat--<類別>。 */
export const CATEGORY_GLYPHS: Record<string, string> = {
  lecture: '講',
  workshop: '工',
  exhibition: '展',
  sports: '運',
  welfare: '餐',
};

/** 類別對應的 CSS class（設定 --cat-color）；未知或未提供類別時用主題輔色。 */
export function categoryClassName(category?: string): string {
  return category && category in CATEGORY_GLYPHS ? `cat--${category}` : 'cat--default';
}

/** 類別縮寫；未知或未提供類別時顯示圓點。 */
export function categoryGlyph(category?: string): string {
  return (category && CATEGORY_GLYPHS[category]) || '●';
}
