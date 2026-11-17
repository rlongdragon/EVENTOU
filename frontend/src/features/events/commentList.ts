import type { CommentSort, EventComment } from './api';

// #79 留言串的本地更新：新增、編輯、刪除、按讚後直接更新畫面，不必重新載入整個列表。
// 規則與後端 listEventComments 相同：被刪除的頂層留言若仍有回覆就留下佔位，否則移除。

/** 對外顯示的留言數（含回覆，不含佔位）。 */
export function countComments(comments: EventComment[]): number {
  return comments.reduce(
    (sum, comment) => sum + (comment.removed ? 0 : 1) + comment.replies.length,
    0,
  );
}

/** 新的頂層留言放在哪裡：最新排序放最前面，其餘放最後面。 */
export function addComment(
  comments: EventComment[],
  comment: EventComment,
  sort: CommentSort,
): EventComment[] {
  return sort === 'newest' ? [comment, ...comments] : [...comments, comment];
}

/** 新回覆接在上層留言的回覆最後面。 */
export function addReply(comments: EventComment[], reply: EventComment): EventComment[] {
  return comments.map((comment) =>
    comment.id === reply.parentId ? { ...comment, replies: [...comment.replies, reply] } : comment,
  );
}

/** 對留言串裡的某一則（頂層或回覆）套用變更。 */
export function updateComment(
  comments: EventComment[],
  id: number,
  change: (comment: EventComment) => EventComment,
): EventComment[] {
  return comments.map((comment) => {
    if (comment.id === id) return change(comment);
    if (!comment.replies.some((reply) => reply.id === id)) return comment;
    return {
      ...comment,
      replies: comment.replies.map((reply) => (reply.id === id ? change(reply) : reply)),
    };
  });
}

/** 編輯後的留言取代原本的內容，保留原有的回覆。 */
export function replaceComment(comments: EventComment[], updated: EventComment): EventComment[] {
  return updateComment(comments, updated.id, (comment) => ({
    ...updated,
    replies: comment.replies,
  }));
}

function placeholder(comment: EventComment): EventComment {
  return {
    ...comment,
    content: null,
    author: null,
    editedAt: null,
    rating: null,
    likeCount: 0,
    likedByMe: false,
    removed: true,
  };
}

/** 刪除一則留言或回覆；頂層留言仍有回覆時改成佔位，佔位的最後一則回覆被刪除時佔位一併移除。 */
export function removeComment(comments: EventComment[], id: number): EventComment[] {
  const result: EventComment[] = [];
  for (const comment of comments) {
    if (comment.id === id) {
      if (comment.replies.length > 0) result.push(placeholder(comment));
      continue;
    }
    const replies = comment.replies.filter((reply) => reply.id !== id);
    if (comment.removed && replies.length === 0) continue;
    result.push(replies.length === comment.replies.length ? comment : { ...comment, replies });
  }
  return result;
}
