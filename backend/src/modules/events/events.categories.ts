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
  { topic: 'security', pattern: /資安|資訊安全|網路安全|駭客|CTF|滲透測試/ },
  { topic: 'ai', pattern: /人工智慧|\bAI\b|生成式|機器學習|深度學習|資料科學|大數據|LLM/ },
  { topic: 'it', pattern: /資訊工程|資訊科技|資工|程式|軟體|雲端|演算法|App開發|網頁/ },
  { topic: 'electrical', pattern: /電機|電子|半導體|通訊|晶片|IC設計/ },
  { topic: 'mechanical', pattern: /機械|土木|材料|機器人|系統工程/ },
  { topic: 'maritime', pattern: /造船|船舶|航運|航海|輪機|海事|船員/ },
  { topic: 'ocean_science', pattern: /海洋科學|海洋生態|海洋環境|海洋資源|海洋保育/ },
  { topic: 'aquaculture', pattern: /水產|漁業|養殖|魚類/ },
  { topic: 'food', pattern: /食品|食安|營養|餐飲/ },
  { topic: 'life_medical', pattern: /生命科學|生物|生技|醫學|基因|藥物/ },
  { topic: 'sustainability', pattern: /永續|環境|減碳|淨灘|氣候|ESG|SDGs/ },
  { topic: 'business', pattern: /商管|管理|行銷|財務|金融|經濟|會計|投資/ },
  { topic: 'law', pattern: /法律|法規|著作權|智慧財產|法學/ },
  { topic: 'language', pattern: /英語|英文|日語|韓語|外語|多益|TOEIC|IELTS|托福/ },
  { topic: 'international', pattern: /國際交流|交換學生|海外|雙聯|國際志工|遊學/ },
  { topic: 'humanities', pattern: /人文|歷史|哲學|文學|社會學|文化資產/ },
  { topic: 'arts', pattern: /藝術|美術|攝影|電影|設計展|書法|插畫/ },
  { topic: 'performing', pattern: /音樂|演奏|合唱|樂團|戲劇|舞蹈|表演/ },
  { topic: 'mental_health', pattern: /心理|諮商|紓壓|情緒|韌性/ },
  { topic: 'healthcare', pattern: /健康|保健|健檢|疾病|防治|愛滋|醫療/ },
  { topic: 'ball_sports', pattern: /球賽|籃球|排球|桌球|羽球|足球|棒球|網球|壘球/ },
  { topic: 'water_activities', pattern: /游泳|潛水|獨木舟|衝浪|帆船|划船|水上|浮潛/ },
  { topic: 'outdoor', pattern: /登山|健行|路跑|馬拉松|露營|單車|戶外/ },
  { topic: 'career', pattern: /職涯|就業|實習|求職|徵才|企業參訪|履歷/ },
  { topic: 'graduate', pattern: /研究所|升學|碩士班|博士班|甄試|留學/ },
  { topic: 'startup', pattern: /創業|新創|創新創意/ },
  { topic: 'volunteer', pattern: /志工|服務學習|志願服務|公益/ },
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
