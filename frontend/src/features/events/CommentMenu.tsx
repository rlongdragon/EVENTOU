import { useEffect, useId, useRef, useState } from 'react';

export interface CommentMenuItem {
  label: string;
  onSelect: () => void;
  /** 刪除等破壞性操作以警示色顯示 */
  danger?: boolean;
}

/** 每則留言的「⋯」選單：編輯、刪除、檢舉等操作；點外面或按 Esc 關閉。 */
export function CommentMenu({ label, items }: { label: string; items: CommentMenuItem[] }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    // 打開時把焦點移到第一個選項，方便鍵盤操作
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="comment-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="comment-icon-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open && (
        <div id={`${id}-menu`} role="menu" className="comment-menu-list">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? 'comment-menu-danger' : undefined}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
