import './adminBadge.css';

/**
 * #100 管理員徽章：由後端回傳的角色決定，不是顯示名稱的一部分，一般使用者改名稱也做不出來。
 * 盾牌用 inline SVG（不用 emoji：各平台長得不一樣，也容易被複製進名稱裡）。
 */
export function AdminBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={compact ? 'admin-badge admin-badge--compact' : 'admin-badge'}
      title="EVENTOU 管理員，由系統認證"
      role="img"
      aria-label="管理員（由系統認證）"
    >
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
        <path
          d="M8 1.2 2.6 3.1v4.1c0 3.2 2.2 6.1 5.4 7.1 3.2-1 5.4-3.9 5.4-7.1V3.1L8 1.2Z"
          fill="#fff"
          stroke="#d4a84b"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path
          d="m5.5 7.9 1.8 1.8 3.3-3.5"
          fill="none"
          stroke="#0b3d6b"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && <span className="admin-badge-label">管理員</span>}
    </span>
  );
}
