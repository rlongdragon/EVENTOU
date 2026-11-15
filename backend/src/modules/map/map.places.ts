import type { MapCoordinates } from './map.service.js';

export interface CampusPlace extends MapCoordinates {
  /** 地圖標記上顯示的建物名稱 */
  name: string;
  /** 活動地點文字只要包含任一別名即對應到此建物；名稱本身也會比對 */
  aliases: string[];
}

export interface MatchedCampusPlace extends MapCoordinates {
  name: string;
}

/** 海大（祥豐校區）中心點，地圖沒有活動標記時以此為中心。 */
export const CAMPUS_CENTER: MatchedCampusPlace = {
  name: '國立臺灣海洋大學',
  latitude: 25.14969,
  longitude: 121.77573,
};

/**
 * 海大建物對照表。座標為 OpenStreetMap 建物輪廓的中心點
 * （© OpenStreetMap contributors，ODbL），2026-11 取得。
 * 對不到的地點不要猜座標，確認位置後再補進來。
 */
export const CAMPUS_PLACES: CampusPlace[] = [
  { name: '行政大樓', aliases: [], latitude: 25.15011, longitude: 121.7761 },
  { name: '人文大樓', aliases: [], latitude: 25.14977, longitude: 121.77505 },
  { name: '會議中心', aliases: [], latitude: 25.14978, longitude: 121.77585 },
  { name: '綜合研究中心', aliases: [], latitude: 25.15055, longitude: 121.77548 },
  { name: '綜合一館', aliases: [], latitude: 25.14954, longitude: 121.77309 },
  { name: '綜合三館', aliases: [], latitude: 25.1494, longitude: 121.77547 },
  {
    name: '圖書館',
    aliases: ['圖資處', '機械B館'],
    latitude: 25.1502,
    longitude: 121.77668,
  },
  { name: '第一餐廳', aliases: [], latitude: 25.14888, longitude: 121.77524 },
  {
    name: '食品科學學系館',
    aliases: ['食品科學系館', '食品科學系', '食科系館', '甲子廳'],
    latitude: 25.1506,
    longitude: 121.77373,
  },
  { name: '食品工程館', aliases: [], latitude: 25.15078, longitude: 121.77303 },
  {
    name: '生命科學院館',
    aliases: ['生命科學館', '生科院館'],
    latitude: 25.15026,
    longitude: 121.77257,
  },
  { name: '環漁系館', aliases: [], latitude: 25.14953, longitude: 121.77212 },
  {
    name: '海洋環境資訊系系館',
    aliases: ['海洋環境資訊系館', '環資系館'],
    latitude: 25.14984,
    longitude: 121.7734,
  },
  {
    name: '海洋環境化學與生態研究所',
    aliases: ['環態所'],
    latitude: 25.14929,
    longitude: 121.77357,
  },
  { name: '海事大樓', aliases: [], latitude: 25.14956, longitude: 121.77418 },
  { name: '育樂館', aliases: [], latitude: 25.14949, longitude: 121.77723 },
  {
    name: '商船學系系館',
    aliases: ['商船學系館', '商船系館'],
    latitude: 25.14977,
    longitude: 121.77771,
  },
  { name: '延平技術大樓', aliases: [], latitude: 25.14932, longitude: 121.77775 },
  { name: '操船模擬機室', aliases: [], latitude: 25.1495, longitude: 121.7781 },
  { name: '沛華大樓', aliases: [], latitude: 25.14968, longitude: 121.77824 },
  { name: '航管大樓', aliases: [], latitude: 25.14954, longitude: 121.7785 },
  { name: '海空大樓', aliases: [], latitude: 25.14953, longitude: 121.77899 },
  { name: '游泳池', aliases: [], latitude: 25.14911, longitude: 121.77903 },
  { name: '體育館', aliases: [], latitude: 25.15012, longitude: 121.77944 },
  { name: '學生活動中心', aliases: [], latitude: 25.15012, longitude: 121.78004 },
  {
    name: '電資暨綜合教學大樓',
    aliases: ['電資大樓'],
    latitude: 25.15071,
    longitude: 121.77992,
  },
  { name: '電機一館', aliases: [], latitude: 25.15067, longitude: 121.7806 },
  { name: '電機二館', aliases: [], latitude: 25.15093, longitude: 121.78014 },
  { name: '工學院', aliases: [], latitude: 25.15042, longitude: 121.78114 },
  { name: '海洋工程綜合試驗館', aliases: [], latitude: 25.15015, longitude: 121.78214 },
  { name: '河工二館', aliases: [], latitude: 25.1501, longitude: 121.78278 },
  { name: '水生動物實驗中心', aliases: [], latitude: 25.15102, longitude: 121.77935 },
  { name: '陸生動物實驗中心', aliases: [], latitude: 25.15085, longitude: 121.77329 },
];

/** 全形轉半形、去除空白、統一大小寫與「台／臺」，讓不同寫法能互相比對。 */
export function normalizePlaceText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '').toLowerCase().replaceAll('台', '臺');
}

const placeKeys = CAMPUS_PLACES.flatMap((place) =>
  [place.name, ...place.aliases].map((alias) => ({ key: normalizePlaceText(alias), place })),
).sort((a, b) => b.key.length - a.key.length);

/**
 * 將活動地點文字對應到校內建物：地點包含任一別名即算對到，
 * 多個別名都符合時取最長的那個（例如「食品科學系甲子廳」取「食品科學系」）。
 */
export function matchCampusPlace(location: string | null | undefined): MatchedCampusPlace | null {
  const text = normalizePlaceText(location ?? '');
  if (!text) return null;
  const match = placeKeys.find(({ key }) => text.includes(key));
  if (!match) return null;
  const { name, latitude, longitude } = match.place;
  return { name, latitude, longitude };
}
