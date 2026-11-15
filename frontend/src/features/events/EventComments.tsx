import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiError } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { fetchEventComments, postEventComment, type EventComment } from './api';
import { CommentReportDialog } from './CommentReportDialog';
import './eventComments.css';

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

/** 例：★★★★☆；留言者的評分顯示在名字旁，像地圖評論一樣 */
function commentStars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

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
  // 正在檢舉的留言；目前只有畫面，之後串接檢舉 API
  const [reporting, setReporting] = useState<EventComment | null>(null);

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
          <ol className="comment-list">
            {state.comments.map((comment) => (
              <li key={comment.id} className="comment-item">
                <div className="comment-head">
                  <strong>{comment.author.displayName}</strong>
                  {comment.rating !== null && (
                    <span
                      className="comment-rating"
                      role="img"
                      aria-label={`評分 ${comment.rating} / 5`}
                    >
                      {commentStars(comment.rating)}
                    </span>
                  )}
                  <time dateTime={comment.createdAt} className="comment-time">
                    {commentTimeFormat.format(new Date(comment.createdAt))}
                  </time>
                  {/* 登入後才能檢舉，且不能檢舉自己的留言 */}
                  {user && user.id !== comment.author.id && (
                    <button
                      type="button"
                      className="comment-report-button"
                      onClick={() => setReporting(comment)}
                    >
                      檢舉
                    </button>
                  )}
                </div>
                <p className="comment-content">{comment.content}</p>
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
      {reporting && (
        <CommentReportDialog
          authorName={reporting.author.displayName}
          onClose={() => setReporting(null)}
        />
      )}
    </section>
  );
}
