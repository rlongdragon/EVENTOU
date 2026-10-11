import type { EventCategory } from './events.types.js';

const CATEGORY_RULES: { category: EventCategory; pattern: RegExp }[] = [
  { category: 'workshop', pattern: /工作坊|研習|實作課|訓練課/ },
  { category: 'exhibition', pattern: /展覽|特展|藝術展|水彩展/ },
  { category: 'sports', pattern: /運動會|球賽|路跑|體育|馬拉松/ },
  { category: 'welfare', pattern: /餐券|獎助學金|福利|免費餐/ },
  { category: 'lecture', pattern: /講座|演講|論壇|分享會|說明會|研討會/ },
];

/** 標題先於內文；同一文字多重命中時以規則順序決定。 */
export function classifyEvent(
  title: string,
  description: string,
  defaultCategory: EventCategory | null = null,
): EventCategory | null {
  return (
    CATEGORY_RULES.find((rule) => rule.pattern.test(title))?.category ??
    CATEGORY_RULES.find((rule) => rule.pattern.test(description))?.category ??
    defaultCategory
  );
}
