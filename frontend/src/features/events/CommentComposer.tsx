import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ApiError } from '../auth/api';

/** 與後端 COMMENT_MAX_LENGTH 相同 */
const COMMENT_MAX_LENGTH = 1000;

interface CommentComposerProps {
  label: string;
  submitLabel: string;
  initialContent?: string;
  /** 回覆與編輯時打開就聚焦 */
  autoFocus?: boolean;
  rows?: number;
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
}

/** 留言輸入框：發表留言、回覆與編輯共用；Ctrl／⌘ + Enter 送出，Esc 取消。 */
export function CommentComposer({
  label,
  submitLabel,
  initialContent = '',
  autoFocus = false,
  rows = 3,
  onSubmit,
  onCancel,
}: CommentComposerProps) {
  const id = useId();
  const [content, setContent] = useState(initialContent);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = content.trim();
  const unchanged = trimmed === initialContent.trim();

  async function submit() {
    if (!trimmed || unchanged || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setContent('');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(
          caught.status === 401
            ? '登入已過期，請重新登入'
            : (caught.fields.content ?? caught.message),
        );
      } else {
        setError('送出失敗，請稍後再試');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape' && onCancel) {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form className="comment-composer" onSubmit={handleSubmit}>
      <label htmlFor={`${id}-content`}>{label}</label>
      <textarea
        id={`${id}-content`}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={COMMENT_MAX_LENGTH}
        rows={rows}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="comment-error">
          {error}
        </p>
      )}
      <div className="comment-composer-actions">
        <span className="comment-counter" aria-hidden="true">
          {content.length > COMMENT_MAX_LENGTH * 0.8 && `${content.length} / ${COMMENT_MAX_LENGTH}`}
        </span>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={submitting}>
            取消
          </button>
        )}
        <button type="submit" disabled={submitting || !trimmed || unchanged}>
          {submitting ? '送出中…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
