// #100 顯示名稱防仿冒：預設名稱不重複、一般使用者不能用保留字。
// 管理員身分改以徽章表示（由 users.role 決定），不靠名稱文字。

/** 短代碼的範圍：16^5，約 104 萬位使用者以內保證不重複 */
const CODE_SPACE = 0x100000;
/** 與 CODE_SPACE 互質（奇數），所以 id → 代碼是一對一，代碼看起來也不像流水號 */
const CODE_MULTIPLIER = 40503;

/**
 * 由使用者 id 產生 5 碼的十六進位短代碼。不使用學號，避免從公開的名稱反推學號。
 * migration 19 以相同算式在 SQL 中產生，修改時兩邊要一起改。
 */
export function displayNameCode(userId: number): string {
  return ((userId * CODE_MULTIPLIER) % CODE_SPACE).toString(16).toUpperCase().padStart(5, '0');
}

/** 預設顯示名稱：遮蔽的學號加上短代碼，例如 01357*-3F2A1，同系同屆的人也不會重複 */
export function defaultDisplayName(maskedStudentId: string, userId: number): string {
  return `${maskedStudentId}-${displayNameCode(userId)}`;
}

// 中文保留字以子字串比對；英文保留字要求前後不是英文字母，避免擋到 badminton 之類的一般單字
const RESERVED_CJK = ['管理員', '管理员', '管理者', '站長', '站长', '官方', '客服'];
const RESERVED_LATIN = ['admin', 'administrator', 'moderator', 'official', 'eventou'];

/** 空白、標點、符號，以及零寬空白等格式字元（Cf） */
const SEPARATORS = /[\s\p{P}\p{S}\p{Cf}]+/gu;

/** 名稱含保留字時回傳該保留字，否則回傳 undefined。管理員不受此限制，由呼叫端判斷。 */
export function findReservedWord(name: string): string | undefined {
  // 統一全半形與大小寫，避免用「ＡＤＭＩＮ」繞過
  const lower = name.normalize('NFKC').toLowerCase();
  // 移除分隔字元，擋下「管 理 員」「a d m i n」
  const compact = lower.replace(SEPARATORS, '');
  // 分隔字元改成空白，讓「eventou_official」仍能以單字邊界比對
  const spaced = lower.replace(SEPARATORS, ' ');
  const cjk = RESERVED_CJK.find((word) => compact.includes(word));
  if (cjk) return cjk;
  return RESERVED_LATIN.find((word) => {
    const pattern = new RegExp(`(?<![a-z])${word}(?![a-z])`);
    return pattern.test(compact) || pattern.test(spaced);
  });
}
