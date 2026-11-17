import { useState } from 'react';
import { Link } from 'react-router';
import type { User } from '../auth/api';
import type { EventComment } from './api';
import { CommentComposer } from './CommentComposer';
import { CommentMenu, type CommentMenuItem } from './CommentMenu';

/** 回覆超過這個數量時預設收合 */
const COLLAPSE_REPLIES_OVER = 2;

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

export interface CommentActions {
  user: User | null;
  loginUrl: string;
  /** 目前正在編輯的留言 id */
  editingId: number | null;
  setEditingId: (id: number | null) => void;
  onEdit: (comment: EventComment, content: string) => Promise<void>;
  onDelete: (comment: EventComment) => void;
  onLike: (comment: EventComment) => void;
  onReport: (comment: EventComment) => void;
  onReply: (parentId: number, content: string) => Promise<void>;
}

interface CommentBodyProps {
  comment: EventComment;
  actions: CommentActions;
  onReplyClick?: () => void;
}

function CommentBody({ comment, actions, onReplyClick }: CommentBodyProps) {
  const { user } = actions;
  if (comment.removed || !comment.author || comment.content === null) {
    return <p className="comment-removed">此留言已刪除</p>;
  }
  const author = comment.author;
  const mine = user?.id === author.id;
  const menuItems: CommentMenuItem[] = [];
  if (mine) menuItems.push({ label: '編輯', onSelect: () => actions.setEditingId(comment.id) });
  if (mine || user?.role === 'admin') {
    menuItems.push({ label: '刪除', danger: true, onSelect: () => actions.onDelete(comment) });
  }
  if (user && !mine) menuItems.push({ label: '檢舉', onSelect: () => actions.onReport(comment) });

  const editing = actions.editingId === comment.id;
  const likeLabel = comment.likeCount > 0 ? String(comment.likeCount) : '';

  return (
    <article className="comment-body" aria-label={`${author.displayName} 的留言`}>
      <header className="comment-head">
        <strong className="comment-author">{author.displayName}</strong>
        {mine && <span className="comment-badge">你</span>}
        {comment.rating !== null && (
          <span className="comment-rating" role="img" aria-label={`評分 ${comment.rating} / 5`}>
            {commentStars(comment.rating)}
          </span>
        )}
        <time dateTime={comment.createdAt} className="comment-time">
          {commentTimeFormat.format(new Date(comment.createdAt))}
        </time>
        {comment.editedAt && (
          <span
            className="comment-time"
            title={`編輯於 ${commentTimeFormat.format(new Date(comment.editedAt))}`}
          >
            （已編輯）
          </span>
        )}
        <CommentMenu label={`${author.displayName} 的留言選項`} items={menuItems} />
      </header>

      {editing ? (
        <CommentComposer
          label="編輯留言"
          submitLabel="儲存"
          initialContent={comment.content}
          autoFocus
          rows={Math.min(8, comment.content.split('\n').length + 1)}
          onSubmit={(content) => actions.onEdit(comment, content)}
          onCancel={() => actions.setEditingId(null)}
        />
      ) : (
        <p className="comment-content">{comment.content}</p>
      )}

      {!editing && (
        <div className="comment-actions">
          {user ? (
            <button
              type="button"
              className="comment-action"
              aria-pressed={comment.likedByMe}
              aria-label={`讚${comment.likeCount ? `，${comment.likeCount} 個` : ''}`}
              onClick={() => actions.onLike(comment)}
            >
              <span aria-hidden="true">{comment.likedByMe ? '♥' : '♡'}</span> {likeLabel}
            </button>
          ) : (
            <Link
              to={actions.loginUrl}
              className="comment-action"
              aria-label={`登入後按讚${comment.likeCount ? `，目前 ${comment.likeCount} 個讚` : ''}`}
            >
              <span aria-hidden="true">♡</span> {likeLabel}
            </Link>
          )}
          {user && onReplyClick && (
            <button type="button" className="comment-action" onClick={onReplyClick}>
              回覆
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** 一則頂層留言與它的回覆（只有一層）；回覆「回覆」時預填 @名字，送出後掛在同一則頂層留言下。 */
export function CommentThread({
  comment,
  actions,
}: {
  comment: EventComment;
  actions: CommentActions;
}) {
  const [expanded, setExpanded] = useState(comment.replies.length <= COLLAPSE_REPLIES_OVER);
  const [replyDraft, setReplyDraft] = useState<string | null>(null);
  const replies = comment.replies;
  const showReplies = expanded || replies.length <= COLLAPSE_REPLIES_OVER;
  const canReply = !comment.removed;

  function startReply(target: EventComment) {
    setExpanded(true);
    setReplyDraft(
      target.parentId !== null && target.author ? `@${target.author.displayName} ` : '',
    );
  }

  return (
    <li className="comment-item">
      <CommentBody
        comment={comment}
        actions={actions}
        onReplyClick={canReply ? () => startReply(comment) : undefined}
      />

      {(replies.length > 0 || replyDraft !== null) && (
        <div className="comment-replies">
          {replies.length > COLLAPSE_REPLIES_OVER && (
            <button
              type="button"
              className="comment-toggle"
              aria-expanded={showReplies}
              onClick={() => setExpanded((value) => !value)}
            >
              {showReplies ? '隱藏回覆' : `顯示 ${replies.length} 則回覆`}
            </button>
          )}
          {showReplies && replies.length > 0 && (
            <ol className="comment-reply-list">
              {replies.map((reply) => (
                <li key={reply.id}>
                  <CommentBody
                    comment={reply}
                    actions={actions}
                    onReplyClick={canReply ? () => startReply(reply) : undefined}
                  />
                </li>
              ))}
            </ol>
          )}
          {replyDraft !== null && actions.user && (
            <CommentComposer
              key={replyDraft}
              label={`以 ${actions.user.displayName} 身分回覆`}
              submitLabel="回覆"
              initialContent={replyDraft}
              autoFocus
              rows={2}
              onSubmit={async (content) => {
                await actions.onReply(comment.id, content);
                setReplyDraft(null);
              }}
              onCancel={() => setReplyDraft(null)}
            />
          )}
        </div>
      )}
    </li>
  );
}
