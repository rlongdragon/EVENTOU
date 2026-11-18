/** 活動說明拆成的片段：一般文字或網址 */
export type TextSegment =
  { type: 'text'; text: string } | { type: 'link'; text: string; href: string };

// 網址只吃 ASCII 可見字元，遇到空白或中文標點（如「。」「，」）就結束
const URL_PATTERN = /https?:\/\/[\x21-\x7E]+/g;
// 網址結尾常黏著的英文標點，不算在網址內
const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;

/** 去掉網址尾端的標點；括號只有在網址內沒有對應的左括號時才去掉 */
function trimUrl(url: string): string {
  let result = url.replace(TRAILING_PUNCTUATION, '');
  while (result.endsWith(')') && !result.includes('(')) {
    result = result.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
  }
  return result;
}

/** 把文字中的 http(s) 網址切出來，其餘保持原樣 */
export function splitLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0]);
    if (!/^https?:\/\/[^/?#]/.test(url)) continue;
    const start = match.index;
    if (start > lastIndex) segments.push({ type: 'text', text: text.slice(lastIndex, start) });
    segments.push({ type: 'link', text: url, href: url });
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', text: text.slice(lastIndex) });
  return segments;
}
