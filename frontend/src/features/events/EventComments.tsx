import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiError } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import {
  deleteEventComment,
  fetchEventComments,
  postEventComment,
  setCommentLike,
  updateEventComment,
  type CommentSort,
  type EventComment,
} from './api';
import { CommentComposer } from './CommentComposer';
import { CommentReportDialog } from './CommentReportDialog';
import { CommentThread, type CommentActions } from './CommentThread';
import {
  addComment,
  addReply,
  countComments,
  removeComment,
  replaceComment,
  updateComment,
} from './commentList';
import './eventComments.css';

const SORT_OPTIONS: { value: CommentSort; label: string }[] = [
  { value: 'oldest', label: '最舊' },
  { value: 'newest', label: '最新' },
  { value: 'top', label: '最多讚' },
];

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; comments: EventComment[] };

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.status === 401 ? '登入已過期，請重新登入' : error.message;
  }
  return fallback;
}

/**
 * US-10 活動留言：訪客可看留言與讚數，登入後可留言、回覆、按讚與檢舉；
 * #79 留言者可編輯、刪除自己的留言，管理員可刪除任何留言。
 */
export function EventComments({ eventId }: { eventId: string }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [sort, setSort] = useState<CommentSort>('oldest');
  // 記錄是哪個活動、排序與登入者的結果；條件改變時直接視為載入中
  const queryKey = `${eventId}|${sort}|${user?.id ?? ''}`;
  const [result, setResult] = useState<{ key: string; state: LoadState } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reporting, setReporting] = useState<EventComment | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    fetchEventComments(eventId, sort, controller.signal)
      .then(({ comments }) => setResult({ key: queryKey, state: { status: 'ok', comments } }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.message : String(error);
        setResult({ key: queryKey, state: { status: 'error', message } });
      });
    return () => controller.abort();
  }, [eventId, sort, queryKey, authLoading]);

  const state: LoadState = result?.key === queryKey ? result.state : { status: 'loading' };

  /** 對已載入的留言串套用本地更新 */
  function updateList(change: (comments: EventComment[]) => EventComment[]) {
    setResult((previous) =>
      previous?.key === queryKey && previous.state.status === 'ok'
        ? { key: queryKey, state: { status: 'ok', comments: change(previous.state.comments) } }
        : previous,
    );
  }

  const loginUrl = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;

  const actions: CommentActions = {
    user,
    loginUrl,
    editingId,
    setEditingId,
    async onEdit(comment, content) {
      const updated = await updateEventComment(eventId, comment.id, content);
      updateList((comments) => replaceComment(comments, updated));
      setEditingId(null);
    },
    onDelete(comment) {
      const own = comment.author?.id === user?.id;
      const message = own
        ? '確定要刪除這則留言嗎？刪除後無法復原。'
        : `確定要以管理員身分刪除 ${comment.author?.displayName ?? ''} 的留言嗎？`;
      if (!window.confirm(message)) return;
      setActionError(null);
      deleteEventComment(eventId, comment.id)
        .then(() => updateList((comments) => removeComment(comments, comment.id)))
        .catch((error: unknown) => setActionError(errorMessage(error, '刪除失敗，請稍後再試')));
    },
    onLike(comment) {
      const liked = !comment.likedByMe;
      setActionError(null);
      // 先更新畫面，失敗時還原
      const optimistic = (item: EventComment) => ({
        ...item,
        likedByMe: liked,
        likeCount: Math.max(0, item.likeCount + (liked ? 1 : -1)),
      });
      updateList((comments) => updateComment(comments, comment.id, optimistic));
      setCommentLike(eventId, comment.id, liked)
        .then((like) =>
          updateList((comments) =>
            updateComment(comments, comment.id, (item) => ({ ...item, ...like })),
          ),
        )
        .catch((error: unknown) => {
          updateList((comments) =>
            updateComment(comments, comment.id, (item) => ({
              ...item,
              likedByMe: comment.likedByMe,
              likeCount: comment.likeCount,
            })),
          );
          setActionError(errorMessage(error, '按讚失敗，請稍後再試'));
        });
    },
    onReport: setReporting,
    async onReply(parentId, content) {
      const reply = await postEventComment(eventId, content, parentId);
      updateList((comments) => addReply(comments, reply));
    },
  };

  async function handleNewComment(content: string) {
    const comment = await postEventComment(eventId, content);
    updateList((comments) => addComment(comments, comment, sort));
  }

  return (
    <section className="event-comments" aria-labelledby="event-comments-heading">
      <div className="comment-section-head">
        <h2 id="event-comments-heading">
          留言{state.status === 'ok' ? `（${countComments(state.comments)}）` : ''}
        </h2>
        <label className="comment-sort">
          排序
          <select value={sort} onChange={(event) => setSort(event.target.value as CommentSort)}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {authLoading ? null : user ? (
        <CommentComposer
          label={`以 ${user.displayName} 身分留言`}
          submitLabel="送出留言"
          onSubmit={handleNewComment}
        />
      ) : (
        <p className="comment-login">
          <Link to={loginUrl}>登入</Link>後即可留言、回覆與按讚。
        </p>
      )}

      {actionError && (
        <p role="alert" className="comment-error">
          {actionError}
        </p>
      )}

      {state.status === 'loading' && <p>載入留言中…</p>}
      {state.status === 'error' && <p role="alert">無法載入留言：{state.message}</p>}
      {state.status === 'ok' &&
        (state.comments.length === 0 ? (
          <p className="comment-empty">目前還沒有留言，來當第一個留言的人吧。</p>
        ) : (
          <ol className="comment-list">
            {state.comments.map((comment) => (
              <CommentThread key={comment.id} comment={comment} actions={actions} />
            ))}
          </ol>
        ))}

      {reporting?.author && (
        <CommentReportDialog
          eventId={eventId}
          commentId={reporting.id}
          authorName={reporting.author.displayName}
          onClose={() => setReporting(null)}
        />
      )}
    </section>
  );
}
