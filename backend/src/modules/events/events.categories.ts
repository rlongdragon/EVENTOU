import type { EventCategory } from './events.types.js';

const CATEGORY_RULES: { category: EventCategory; pattern: RegExp }[] = [
  { category: 'workshop', pattern: /工作坊|研習|實作課|訓練課/ },
  { category: 'exhibition', pattern: /展覽|特展|藝術展|水彩展/ },
  { category: 'sports', pattern: /運動會|球賽|路跑|體育(?![館室場])|馬拉松/ },
  { category: 'welfare', pattern: /餐券|獎助學金|福利|免費餐/ },
  { category: 'lecture', pattern: /講座|演講|論壇|分享會|說明會|研討會/ },
];
// 地點、主辦等欄位描述的是場地與單位，不代表活動性質（例如「地點：體育館」）。
const FIELD_LINE = /^(?:活動地點|演講地點|地點|場地|地址|主辦|承辦|協辦|指導|聯絡)/;

/** 標題先於內文；同一文字多重命中時以規則順序決定。 */
export function classifyEvent(
  title: string,
  description: string,
  defaultCategory: EventCategory | null = null,
): EventCategory | null {
  const body = description
    .split('\n')
    .filter((line) => !FIELD_LINE.test(line))
    .join('\n');
  return (
    CATEGORY_RULES.find((rule) => rule.pattern.test(title))?.category ??
    CATEGORY_RULES.find((rule) => rule.pattern.test(body))?.category ??
    defaultCategory
  );
}
