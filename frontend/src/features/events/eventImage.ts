/** 預設圖池中的一張照片 */
export interface DefaultPhoto {
  src: string;
  /** 圖上的地點小字，例如「和平島 · Keelung」 */
  place: string;
}

/** 決定活動圖片所需的欄位；imageUrl 為活動自己的圖（目前 Event 尚無此欄位，加上後即生效） */
export interface EventImageSource {
  id: number;
  imageUrl?: string | null;
}

/** 列表上一則活動要顯示的圖；place 只有預設圖才有 */
export interface EventImage {
  src: string;
  place: string | null;
}

/** 依活動 id 固定挑一張預設圖（乘法雜湊，避免連號 id 都落在相鄰的圖） */
export function defaultImageIndex(eventId: number, poolSize: number): number {
  if (poolSize <= 0) throw new Error('預設圖池不可為空');
  return (Math.imul(eventId, 2654435761) >>> 0) % poolSize;
}

/**
 * 為一串活動挑圖：有自己的圖就用原圖，沒有就從預設圖池依 id 固定挑一張；
 * 若和上一列的預設圖相同，改用下一張，避免相鄰兩列重複。
 */
export function pickEventImages(
  events: readonly EventImageSource[],
  pool: readonly DefaultPhoto[],
): EventImage[] {
  let previous: number | null = null;
  return events.map((event) => {
    if (event.imageUrl) {
      previous = null;
      return { src: event.imageUrl, place: null };
    }
    let index = defaultImageIndex(event.id, pool.length);
    if (pool.length > 1 && index === previous) index = (index + 1) % pool.length;
    previous = index;
    return { src: pool[index].src, place: pool[index].place };
  });
}
