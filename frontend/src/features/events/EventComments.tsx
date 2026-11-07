import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiError } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { fetchEventComments, postEventComment, type EventComment } from './api';

/** 與後端 COMMENT_MAX_LENGTH 相同 */
const COMMENT_MAX_LENGTH = 1000;

const errorStyle = { color: '#cf222e', margin: 0 } as const;

const commentTimeFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; comments: EventComment[] };

/** US-10 活動留言：訪客可看留言，登入後才能發表。 */
export function EventComments({ eventId }: { eventId: string }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  // 記錄是哪個 eventId 的結果，切換活動時直接視為載入中
  const [result, setResult] = useState<{ eventId: string; state: LoadState } | null>(null);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchEventComments(eventId, controller.signal)
      .then((comments) => setResult({ eventId, state: { status: 'ok', comments } }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.message : String(error);
        setResult({ eventId, state: { status: 'error', message } });
      });
    return () => controller.abort();
  }, [eventId]);

  const state: LoadState = result?.eventId === eventId ? result.state : { status: 'loading' };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setSubmitError('請輸入留言內容');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const comment = await postEventComment(eventId, trimmed);
      setResult((previous) =>
        previous?.eventId === eventId && previous.state.status === 'ok'
          ? { eventId, state: { status: 'ok', comments: [...previous.state.comments, comment] } }
          : { eventId, state: { status: 'ok', comments: [comment] } },
      );
      setContent('');
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(
          error.status === 401 ? '登入已過期，請重新登入' : (error.fields.content ?? error.message),
        );
      } else {
        setSubmitError('留言失敗，請稍後再試');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const loginUrl = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <section aria-labelledby="event-comments-heading">
      <h2 id="event-comments-heading">
        留言{state.status === 'ok' ? `（${state.comments.length}）` : ''}
      </h2>

      {state.status === 'loading' && <p>載入留言中…</p>}
      {state.status === 'error' && <p role="alert">無法載入留言：{state.message}</p>}
      {state.status === 'ok' &&
        (state.comments.length === 0 ? (
          <p>目前還沒有留言。</p>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0 }}>
            {state.comments.map((comment) => (
              <li key={comment.id} style={{ marginBottom: '1rem' }}>
                <strong>{comment.author.displayName}</strong>{' '}
                <time dateTime={comment.createdAt} style={{ color: '#59636e' }}>
                  {commentTimeFormat.format(new Date(comment.createdAt))}
                </time>
                <p style={{ whiteSpace: 'pre-wrap', margin: '0.25rem 0 0' }}>{comment.content}</p>
              </li>
            ))}
          </ol>
        ))}

      {authLoading ? null : user ? (
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        >
          <label htmlFor="event-comment-content">以 {user.displayName} 身分留言</label>
          <textarea
            id="event-comment-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={COMMENT_MAX_LENGTH}
            rows={3}
            aria-invalid={submitError ? true : undefined}
            aria-describedby={submitError ? 'event-comment-error' : undefined}
          />
          {submitError && (
            <p id="event-comment-error" role="alert" style={errorStyle}>
              {submitError}
            </p>
          )}
          <div>
            <button type="submit" disabled={submitting || !content.trim()}>
              {submitting ? '送出中…' : '送出留言'}
            </button>
          </div>
        </form>
      ) : (
        <p>
          <Link to={loginUrl}>登入</Link>後即可留言。
        </p>
      )}
    </section>
  );
}
