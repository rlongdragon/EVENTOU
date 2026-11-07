/** 完整的訂閱網址；行事曆軟體要的是絕對網址，所以補上目前的網站位址。 */
export function subscribeUrl(icsPath: string): string {
  return new URL(icsPath, window.location.origin).href;
}

/** webcal:// 會讓作業系統直接用預設的行事曆軟體開啟訂閱。 */
export function webcalUrl(icsPath: string): string {
  return subscribeUrl(icsPath).replace(/^https?:/, 'webcal:');
}
