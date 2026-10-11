import { load } from 'cheerio';

export function normalizeText(value: string): string {
  return value
    .replace(/[！-～]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/日 +期|時 +間|地 +點|主 +辦 +單 +位/g, (label) => label.replace(/ /g, ''))
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cleanAnnouncement(content: string): {
  text: string;
  links: { text: string; href: string }[];
} {
  const $ = load(content, null, false);
  $('script, style, noscript, template').remove();
  const links = $('a[href]')
    .toArray()
    .map((element) => ({
      text: normalizeText($(element).text()),
      href: $(element).attr('href') ?? '',
    }));
  $('br').replaceWith('\n');
  $('p, div, section, article, li, tr, h1, h2, h3, h4').each((_index, element) => {
    $(element).prepend('\n').append('\n');
  });
  $('td, th').each((_index, element) => {
    $(element).append(' ');
  });
  return { text: normalizeText($.root().text()), links };
}

export function httpUrl(value: string | null, base?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = base ? new URL(value.trim(), base) : new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function isNtouUrl(value: string | null): boolean {
  const normalized = httpUrl(value);
  if (!normalized) return false;
  const hostname = new URL(normalized).hostname;
  return hostname === 'ntou.edu.tw' || hostname.endsWith('.ntou.edu.tw');
}
