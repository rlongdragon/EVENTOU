import type { EventCategory, EventTopic } from './events.types.js';

// 沒有 LLM 時的關鍵字規則（#69 的退回方式）。說明會、競賽要排在講座前，
// 「招生說明會」「程式競賽講座」這類標題以較具體的形式為準；運動排在競賽前，「體育競賽」算運動。
const CATEGORY_RULES: { category: EventCategory; pattern: RegExp }[] = [
  { category: 'workshop', pattern: /工作坊|研習|實作課|訓練課/ },
  { category: 'sports', pattern: /運動會|球賽|路跑|體育(?![館室場])|馬拉松/ },
  { category: 'competition', pattern: /競賽|比賽|黑客松|[Hh]ackathon|徵件|徵稿/ },
  { category: 'info_session', pattern: /說明會|座談會/ },
  { category: 'exhibition', pattern: /展覽|特展|藝術展|水彩展|音樂會|演出|表演/ },
  { category: 'camp', pattern: /營隊|夏令營|冬令營|迎新|社團博覽/ },
  { category: 'welfare', pattern: /餐券|獎助學金|獎學金|福利|免費餐/ },
  { category: 'lecture', pattern: /講座|演講|論壇|分享會|研討會/ },
];

const TOPIC_RULES: { topic: EventTopic; pattern: RegExp }[] = [
  {
    topic: 'it',
    pattern:
      /資訊工程|資訊科技|資訊安全|資工|程式|軟體|人工智慧|\bAI\b|生成式|機器學習|深度學習|資安|資料科學|大數據|雲端|網路安全|演算法/,
  },
  { topic: 'electrical', pattern: /電機|電子|半導體|通訊|晶片|IC設計/ },
  { topic: 'engineering', pattern: /機械|土木|造船|河海|材料|系統工程/ },
  { topic: 'ocean', pattern: /海洋|水產|漁業|養殖|航運|船舶|海事/ },
  { topic: 'life_science', pattern: /生命科學|生物|生技|食品|醫學|基因/ },
  { topic: 'business', pattern: /商管|管理|行銷|財務|金融|經濟|會計/ },
  { topic: 'humanities', pattern: /人文|社會|歷史|哲學|法律|教育|心理/ },
  { topic: 'arts', pattern: /藝術|音樂|美術|攝影|電影|文學|設計展/ },
  { topic: 'language', pattern: /英語|英文|日語|外語|語言|國際交流|交換學生|海外|多益|TOEIC/ },
  { topic: 'career', pattern: /職涯|就業|實習|求職|徵才|企業參訪|履歷/ },
  { topic: 'graduate', pattern: /研究所|升學|碩士班|博士班|甄試|留學/ },
  { topic: 'startup', pattern: /創業|新創|創新創意/ },
  { topic: 'health', pattern: /健康|心理衛生|保健|運動傷害|紓壓|諮商/ },
  { topic: 'sustainability', pattern: /永續|環境|減碳|淨灘|氣候|ESG|SDGs/ },
];

// 地點、主辦等欄位描述的是場地與單位，不代表活動性質（例如「地點：體育館」）。
const FIELD_LINE = /^(?:活動地點|演講地點|地點|場地|地址|主辦|承辦|協辦|指導|聯絡)/;

function bodyWithoutFieldLines(description: string): string {
  return description
    .split('\n')
    .filter((line) => !FIELD_LINE.test(line))
    .join('\n');
}

/** 標題先於內文；同一文字多重命中時以規則順序決定。 */
export function classifyEvent(
  title: string,
  description: string,
  defaultCategory: EventCategory | null = null,
): EventCategory | null {
  const body = bodyWithoutFieldLines(description);
  return (
    CATEGORY_RULES.find((rule) => rule.pattern.test(title))?.category ??
    CATEGORY_RULES.find((rule) => rule.pattern.test(body))?.category ??
    defaultCategory
  );
}

/** 主題只看標題與內文前 300 字，避免頁尾、相關連結誤判；最多 3 個。 */
export function classifyTopics(title: string, description: string): EventTopic[] {
  const text = `${title}\n${bodyWithoutFieldLines(description).slice(0, 300)}`;
  return TOPIC_RULES.filter((rule) => rule.pattern.test(text))
    .map((rule) => rule.topic)
    .slice(0, 3);
}
