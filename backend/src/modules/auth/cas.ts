// #90 海大 CAS 登入：導向 CAS 登入頁、以 serviceValidate 驗證 service ticket。
// CAS 只發票給 *.ntou.edu.tw 的 service，而且只回傳帳號（cas:user，學生為學號），沒有其他屬性。

const DEFAULT_CAS_BASE_URL = 'https://tccas.ntou.edu.tw/cas';
const DEFAULT_PUBLIC_BASE_URL = 'http://localhost:5173';
const VALIDATE_TIMEOUT_MS = 5000;
// 學號、員工編號只會是英數字；限制格式也避免把 XML 裡的其他內容當成帳號
const ACCOUNT_PATTERN = /^[A-Za-z0-9]{1,32}$/;

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function casBaseUrl(): string {
  return trimSlash(process.env.CAS_BASE_URL || DEFAULT_CAS_BASE_URL);
}

export function publicBaseUrl(): string {
  return trimSlash(process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL);
}

/** 回呼網址；state 放進 service，CAS 驗票時會逐字比對，別的瀏覽器取得的票對不上 */
export function casServiceUrl(state: string): string {
  return `${publicBaseUrl()}/api/auth/cas/callback?state=${encodeURIComponent(state)}`;
}

export function casLoginUrl(service: string): string {
  return `${casBaseUrl()}/login?service=${encodeURIComponent(service)}`;
}

/** 一併登出 CAS 後回到網站首頁 */
export function casLogoutUrl(): string {
  return `${casBaseUrl()}/logout?service=${encodeURIComponent(`${publicBaseUrl()}/`)}`;
}

export type TicketValidation =
  { ok: true; account: string } | { ok: false; error: 'invalid_ticket' | 'cas_unavailable' };

/** 向 CAS 驗證 service ticket；成功時回傳帳號（學號）。不接受前端直接送來的學號。 */
export async function validateServiceTicket(
  ticket: string,
  service: string,
): Promise<TicketValidation> {
  const url =
    `${casBaseUrl()}/serviceValidate?service=${encodeURIComponent(service)}` +
    `&ticket=${encodeURIComponent(ticket)}`;
  let xml: string;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS) });
    if (!response.ok) return { ok: false, error: 'cas_unavailable' };
    xml = await response.text();
  } catch {
    return { ok: false, error: 'cas_unavailable' };
  }
  return parseServiceResponse(xml);
}

export function parseServiceResponse(xml: string): TicketValidation {
  const success = xml.match(
    /<cas:authenticationSuccess>([\s\S]*?)<\/cas:authenticationSuccess>/,
  )?.[1];
  const account = success?.match(/<cas:user>([\s\S]*?)<\/cas:user>/)?.[1]?.trim();
  return account && ACCOUNT_PATTERN.test(account)
    ? { ok: true, account }
    : { ok: false, error: 'invalid_ticket' };
}
