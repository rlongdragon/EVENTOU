import coastPhoto from '../../assets/photos/coast.jpg';
import badouziPhoto from '../../assets/photos/defaults/badouzi.jpg';
import chaojingPhoto from '../../assets/photos/defaults/chaojing.jpg';
import chaojingRocksPhoto from '../../assets/photos/defaults/chaojing2.jpg';
import lighthousePhoto from '../../assets/photos/defaults/lighthouse.jpg';
import ntouPhoto from '../../assets/photos/defaults/ntou.jpg';
import portPhoto from '../../assets/photos/defaults/port.jpg';
import waimushanPhoto from '../../assets/photos/defaults/waimushan.jpg';
import wangyouPhoto from '../../assets/photos/defaults/wangyou.jpg';
import harborPhoto from '../../assets/photos/harbor.jpg';
import ridgePhoto from '../../assets/photos/ridge.jpg';
import type { DefaultPhoto } from './eventImage';

/** 活動沒有自己的圖時使用的預設圖池（照片來源與授權見 PHOTO_CREDITS） */
export const DEFAULT_PHOTOS: DefaultPhoto[] = [
  { src: ntouPhoto, place: '海洋大學 · NTOU' },
  { src: coastPhoto, place: '和平島 · Keelung' },
  { src: badouziPhoto, place: '八斗子 · Badouzi' },
  { src: ridgePhoto, place: '合歡山 · Hehuanshan' },
  { src: chaojingPhoto, place: '潮境公園 · Chaojing' },
  { src: lighthousePhoto, place: '基隆燈塔 · Keelung' },
  { src: harborPhoto, place: '基隆嶼 · Keelung Islet' },
  { src: wangyouPhoto, place: '望幽谷 · Wangyou' },
  { src: portPhoto, place: '基隆港 · Port of Keelung' },
  { src: waimushanPhoto, place: '外木山 · Waimushan' },
  { src: chaojingRocksPhoto, place: '潮境公園 · Chaojing' },
];

/** 首頁底部的照片署名：作者與授權 */
export const PHOTO_CREDITS =
  '照片來源 Wikimedia Commons，已裁切並調整色調：和平島海岸、潮境公園礁岩 lienyuan lee（CC BY 3.0）；合歡山雲海 Quintin Lin（CC BY-SA 2.0）；海大校園 Taiwankengo（CC BY-SA 3.0）；基隆嶼、八斗子大坪海岸、潮境公園、基隆燈塔、基隆港、外木山漁港、望幽谷 Taiwankengo（CC BY-SA 4.0）；清水模牆面 Gryffindor（CC0）；鼻頭角 Liu Dyson（CC BY 3.0）。';
