import { useEffect, useRef, useState, type FormEvent } from 'react';

/** 檢舉原因；之後串接後端時沿用同一組代碼 */
const REPORT_REASONS = [
  { code: 'spam', label: '垃圾訊息或廣告' },
  { code: 'abusive', label: '不當或攻擊性言論' },
  { code: 'off_topic', label: '與活動無關' },
  { code: 'other', label: '其他' },
] as const;

/**
 * 留言檢舉視窗（目前只有畫面）。
 * TODO(#65)：串接檢舉 API，送出後改為真正寫入後端並由管理員審核。
 */
export function CommentReportDialog({
  authorName,
  onClose,
}: {
  authorName: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <dialog
      ref={dialogRef}
      className="comment-report-dialog"
      aria-labelledby="comment-report-title"
      onClose={onClose}
    >
      <h3 id="comment-report-title">檢舉 {authorName} 的留言</h3>
      {submitted ? (
        <>
          <p role="status">感謝回報！檢舉功能即將上線，這次的檢舉還不會送出。</p>
          <div className="comment-report-actions">
            <button type="button" onClick={() => dialogRef.current?.close()}>
              關閉
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <fieldset>
            <legend>檢舉原因</legend>
            {REPORT_REASONS.map((reason, index) => (
              <label key={reason.code} className="comment-report-reason">
                <input
                  type="radio"
                  name="reason"
                  value={reason.code}
                  required
                  defaultChecked={index === 0}
                />
                {reason.label}
              </label>
            ))}
          </fieldset>
          <label htmlFor="comment-report-note">補充說明（選填）</label>
          <textarea id="comment-report-note" name="note" rows={3} maxLength={500} />
          <div className="comment-report-actions">
            <button type="button" onClick={() => dialogRef.current?.close()}>
              取消
            </button>
            <button type="submit">送出檢舉</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
