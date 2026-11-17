// #80 活動地點 → 3D 校園模型（campus3d/campus3d.js 的 VENUES）中的常用場地。
// 模型目前只能用網址參數 ?select=<id> 聚焦這幾個場地；完整的「地點 → 建物／樓層／廳室」
// 對照屬於 #74，完成後應取代這裡的簡易比對。

export interface Campus3DVenue {
  /** campus3d.js VENUES 的 id */
  id: string;
  name: string;
  /** 地點文字包含任一關鍵字就視為這個場地；越具體的場地排越前面 */
  keywords: string[];
}

export const CAMPUS_3D_VENUES: Campus3DVenue[] = [
  { id: 'ocean', name: '海洋廳・展示廳', keywords: ['海洋廳', '展示廳'] },
  { id: 'sac', name: '學生活動中心', keywords: ['學生活動中心', '學活'] },
  { id: 'humanities', name: '人文大樓', keywords: ['人文大樓', '畢東江'] },
  { id: 'admin', name: '行政大樓', keywords: ['行政大樓', '第一演講廳'] },
  { id: 'yule', name: '育樂館', keywords: ['育樂館'] },
  { id: 'gym', name: '體育館', keywords: ['體育館'] },
];

/** 依活動地點文字與地圖比對到的建物名稱，找出 3D 模型可聚焦的場地；找不到時回傳 null。 */
export function findCampus3DVenue(...texts: (string | null | undefined)[]): Campus3DVenue | null {
  const haystack = texts
    .filter((text): text is string => Boolean(text))
    .join(' ')
    .replace(/\s+/g, '');
  if (!haystack) return null;
  return (
    CAMPUS_3D_VENUES.find((venue) => venue.keywords.some((word) => haystack.includes(word))) ?? null
  );
}

/** 3D 模型頁的網址；有場地時聚焦並選取該場地。 */
export function campus3DUrl(venue: Campus3DVenue | null): string {
  return venue ? `/campus-3d.html?select=${encodeURIComponent(venue.id)}` : '/campus-3d.html';
}
