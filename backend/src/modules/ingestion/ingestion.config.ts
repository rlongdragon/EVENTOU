export interface ScraperConfig {
  listUrl: string;
  linkSelector: string;
  titleSelector: string;
  contentSelector: string;
  publishedSelector?: string;
  maxAnnouncements: number;
}

// Release 1：每個列表網址的設定由人工維護，不依來源類型自動推測。
export const scraperConfigs: ScraperConfig[] = [
  'https://fs.ntou.edu.tw/p/403-1073-380-1.php?Lang=zh-tw',
  'https://oia.ntou.edu.tw/p/403-1022-11-1.php?Lang=zh-tw',
].map((listUrl) => ({
  listUrl,
  linkSelector: '.module-rcglist .mtitle a[href*="/p/406-"]',
  titleSelector: '.module-detail .hdline',
  contentSelector: '.module-detail .mpgdetail',
  publishedSelector: '.module-detail .mdate',
  maxAnnouncements: 20,
}));

export function positiveInteger(value: string | undefined, fallback: number): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('擷取設定必須為正整數');
  return number;
}
