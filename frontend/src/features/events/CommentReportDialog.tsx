import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../auth/api';
import { REPORT_REASON_LABELS, reportEventComment, type ReportReason } from './api';

const REPORT_REASONS = Object.keys(REPORT_REASON_LABELS) as ReportReason[];

/** 與後端 REPORT_NOTE_MAX_LENGTH 相同 */
const NOTE_MAX_LENGTH = 500;

/** #65 留言檢舉視窗：選擇原因與補充說明，送出後由管理員審核。 */
export function CommentReportDialog({
  eventId,
  commentId,
  authorName,
  onClose,
}: {
  eventId: string;
  commentId: number;
  authorName: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<'sent' | 'already' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get('reason') ?? '') as ReportReason;
    const note = String(form.get('note') ?? '').trim();
    setError(null);
    setSubmitting(true);
    try {
      await reportEventComment(eventId, commentId, { reason, note });
      setResult('sent');
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'already_reported') {
        setResult('already');
      } else if (caught instanceof ApiError && caught.status === 401) {
        setError('登入已過期，請重新登入後再檢舉');
      } else if (caught instanceof ApiError) {
        setError(caught.fields.note ?? caught.fields.reason ?? caught.message);
      } else {
        setError('無法連線到伺服器，請稍後再試');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="comment-report-dialog"
      aria-labelledby="comment-report-title"
      onClose={onClose}
    >
      <h3 id="comment-report-title">檢舉 {authorName} 的留言</h3>
      {result ? (
        <>
          <p role="status">
            {result === 'sent'
              ? '感謝回報！管理員會盡快審核這則留言。'
              : '你已經檢舉過這則留言，管理員會盡快審核。'}
          </p>
          <div className="comment-report-actions">
            <button type="button" onClick={() => dialogRef.current?.close()}>
              關閉
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)}>
          <fieldset>
            <legend>檢舉原因</legend>
            {REPORT_REASONS.map((reason, index) => (
              <label key={reason} className="comment-report-reason">
                <input
                  type="radio"
                  name="reason"
                  value={reason}
                  required
                  defaultChecked={index === 0}
                />
                {REPORT_REASON_LABELS[reason]}
              </label>
            ))}
          </fieldset>
          <label htmlFor="comment-report-note">補充說明（選填）</label>
          <textarea id="comment-report-note" name="note" rows={3} maxLength={NOTE_MAX_LENGTH} />
          {error && (
            <p role="alert" className="comment-report-error">
              {error}
            </p>
          )}
          <div className="comment-report-actions">
            <button type="button" onClick={() => dialogRef.current?.close()}>
              取消
            </button>
            <button type="submit" disabled={submitting}>
              {submitting ? '送出中…' : '送出檢舉'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
