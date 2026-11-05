import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiError } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { fetchEventRating, rateEvent, type EventRatingSummary } from './api';

const SCORES = [1, 2, 3, 4, 5] as const;

const errorStyle = { color: '#cf222e', margin: 0 } as const;
const starButtonStyle = {
  background: 'none',
  border: 'none',
  padding: '0 0.125rem',
  fontSize: '1.5rem',
  lineHeight: 1,
  cursor: 'pointer',
  color: '#bf8700',
} as const;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; rating: EventRatingSummary };

/** 例：★★★★☆，依平均分數四捨五入到整數星。 */
function stars(average: number): string {
  const filled = Math.round(average);
  return '★'.repeat(filled) + '☆'.repeat(SCORES.length - filled);
}

/** US-11 活動評價：訪客可看平均分數與人數，登入後可評 1–5 星並修改。 */
export function EventRating({ eventId }: { eventId: string }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const userId = user?.id ?? null;
  // 記錄是哪個活動、哪位使用者的結果；登入狀態改變時重新載入自己的評分
  const key = `${eventId}:${userId}`;
  const [result, setResult] = useState<{ key: string; state: LoadState } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    const resultKey = `${eventId}:${userId}`;
    fetchEventRating(eventId, controller.signal)
      .then((rating) => setResult({ key: resultKey, state: { status: 'ok', rating } }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.message : String(error);
        setResult({ key: resultKey, state: { status: 'error', message } });
      });
    return () => controller.abort();
  }, [eventId, userId, authLoading]);

  const state: LoadState = result?.key === key ? result.state : { status: 'loading' };

  async function handleRate(score: number) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const rating = await rateEvent(eventId, score);
      setResult({ key, state: { status: 'ok', rating } });
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(
          error.status === 401 ? '登入已過期，請重新登入' : (error.fields.score ?? error.message),
        );
      } else {
        setSubmitError('評分失敗，請稍後再試');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const loginUrl = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <section aria-labelledby="event-rating-heading">
      <h2 id="event-rating-heading">評價</h2>

      {state.status === 'loading' && <p>載入評價中…</p>}
      {state.status === 'error' && <p role="alert">無法載入評價：{state.message}</p>}
      {state.status === 'ok' && (
        <>
          <p>
            {state.rating.average === null ? (
              '目前還沒有評價。'
            ) : (
              <>
                <span aria-hidden="true" style={{ color: '#bf8700' }}>
                  {stars(state.rating.average)}
                </span>{' '}
                平均 {state.rating.average.toFixed(1)} 分（{state.rating.count} 人評價）
              </>
            )}
          </p>

          {user ? (
            <div>
              <span id="event-rating-label">
                {state.rating.myScore === null
                  ? '給這個活動評分：'
                  : `你的評分：${state.rating.myScore} 星（點選星星可修改）`}
              </span>
              <div
                role="group"
                aria-labelledby="event-rating-label"
                onMouseLeave={() => setHovered(null)}
              >
                {SCORES.map((score) => {
                  const active = score <= (hovered ?? state.rating.myScore ?? 0);
                  return (
                    <button
                      key={score}
                      type="button"
                      style={starButtonStyle}
                      disabled={submitting}
                      aria-label={`${score} 星`}
                      aria-pressed={state.rating.myScore === score}
                      onMouseEnter={() => setHovered(score)}
                      onFocus={() => setHovered(score)}
                      onBlur={() => setHovered(null)}
                      onClick={() => void handleRate(score)}
                    >
                      {active ? '★' : '☆'}
                    </button>
                  );
                })}
              </div>
              {submitError && (
                <p role="alert" style={errorStyle}>
                  {submitError}
                </p>
              )}
            </div>
          ) : (
            <p>
              <Link to={loginUrl}>登入</Link>後即可評分。
            </p>
          )}
        </>
      )}
    </section>
  );
}
