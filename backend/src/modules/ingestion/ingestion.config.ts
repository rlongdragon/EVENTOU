export interface ScraperConfig {
  // US-18 統一擷取設定格式：未填 kind 視為靜態 HTML 列表（US-17 人工設定），見 ingestion.extraction.ts
  kind?: 'html';
  listUrl: string;
  linkSelector: string;
  titleSelector: string;
  contentSelector: string;
  publishedSelector?: string;
  listItemSelector?: string;
  maxAnnouncements: number;
}

// Release 1：每個列表網址的設定由人工維護，不依來源類型自動推測。
// 海大各單位網站為同一套網站系統，公告列表（/p/403-…）共用同一組選擇器；驗證紀錄見 docs/ingestion.md。
export const scraperConfigs: ScraperConfig[] = [
  'https://fs.ntou.edu.tw/p/403-1073-380-1.php?Lang=zh-tw',
  'https://oia.ntou.edu.tw/p/403-1022-11-1.php?Lang=zh-tw',
  // 學校首頁「海大快訊」
  'https://mprp.ntou.edu.tw/p/403-1017-1031.php?Lang=zh-tw',
  // 學務處：處本部、課外活動指導組
  'https://stu.ntou.edu.tw/p/403-1023-1023.php?Lang=zh-tw',
  'https://stu.ntou.edu.tw/p/403-1023-1024.php?Lang=zh-tw',
  // 總務處
  'https://ga.ntou.edu.tw/p/403-1015-1063.php?Lang=zh-tw',
  // 研發處：最新消息、校外活動資訊
  'https://research.ntou.edu.tw/p/403-1021-1027.php?Lang=zh-tw',
  'https://research.ntou.edu.tw/p/403-1021-1057.php?Lang=zh-tw',
  // 圖書暨資訊處
  'https://li.ntou.edu.tw/p/403-1029-11.php?Lang=zh-tw',
  // 主計室
  'https://acc.ntou.edu.tw/p/403-1088-1034.php?Lang=zh-tw',
  // 人事室
  'https://personnel.ntou.edu.tw/p/403-1007-11.php?Lang=zh-tw',
  // 體育室
  'https://peadmin.ntou.edu.tw/p/403-1012-559.php?Lang=zh-tw',
].map((listUrl) => ({
  listUrl,
  linkSelector: '.module-rcglist .mtitle a[href*="/p/406-"]',
  titleSelector: '.module-detail .hdline',
  contentSelector: '.module-detail .mpgdetail',
  listItemSelector: '.d-item',
  publishedSelector: '.mdate',
  maxAnnouncements: 20,
}));

export function positiveInteger(value: string | undefined, fallback: number): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('擷取設定必須為正整數');
  return number;
}
