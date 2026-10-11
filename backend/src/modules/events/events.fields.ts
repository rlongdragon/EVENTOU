/** 段落、表格或同行欄位皆可讀取；不以承辦單位代替主辦單位。 */
export function extractField(text: string, labels: string): string | null {
  const fieldBoundary =
    '活動地點|演講地點|地點|場地|主辦(?:單位)?|承辦單位|報名(?:網址|連結)|活動(?:時間|日期)|演講(?:時間|日期)';
  const pattern = new RegExp(
    `(?:^|\\s|[|｜])\\s*(?:${labels})\\s*[:：]?\\s*([^\\n|｜]+?)(?=\\s+(?:${fieldBoundary})\\s*[:：]|\\n|[|｜]|$)`,
  );
  return text.match(pattern)?.[1]?.trim() || null;
}
