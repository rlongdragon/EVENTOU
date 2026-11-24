import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { EventComment } from './api';
import {
  addComment,
  addReply,
  countComments,
  removeComment,
  replaceComment,
  updateComment,
} from './commentList';

function comment(id: number, overrides: Partial<EventComment> = {}): EventComment {
  return {
    id,
    parentId: null,
    content: `留言 ${id}`,
    createdAt: '2026-11-17T10:00:00+08:00',
    editedAt: null,
    author: { id: 1, displayName: 'Alice' },
    rating: null,
    likeCount: 0,
    likedByMe: false,
    removed: false,
    replies: [],
    ...overrides,
  };
}

const reply = (id: number, parentId: number) => comment(id, { parentId });

describe('留言串的本地更新（#79）', () => {
  test('countComments 含回覆、不含佔位', () => {
    const list = [
      comment(1, { replies: [reply(2, 1), reply(3, 1)] }),
      comment(4, { removed: true, content: null, replies: [reply(5, 4)] }),
    ];
    assert.equal(countComments(list), 4);
    assert.equal(countComments([]), 0);
  });

  test('addComment 依排序決定放前面或後面', () => {
    const list = [comment(1)];
    assert.deepEqual(
      addComment(list, comment(2), 'newest').map((item) => item.id),
      [2, 1],
    );
    assert.deepEqual(
      addComment(list, comment(2), 'oldest').map((item) => item.id),
      [1, 2],
    );
    assert.deepEqual(
      addComment(list, comment(2), 'top').map((item) => item.id),
      [1, 2],
    );
  });

  test('addReply 接在上層留言的回覆最後面', () => {
    const list = [comment(1, { replies: [reply(2, 1)] }), comment(3)];
    const next = addReply(list, reply(4, 1));
    assert.deepEqual(
      next[0]?.replies.map((item) => item.id),
      [2, 4],
    );
    assert.equal(next[1], list[1]);
  });

  test('updateComment 可更新頂層留言或回覆', () => {
    const list = [comment(1, { replies: [reply(2, 1)] })];
    const like = (item: EventComment) => ({ ...item, likeCount: 5, likedByMe: true });
    assert.equal(updateComment(list, 1, like)[0]?.likeCount, 5);
    assert.equal(updateComment(list, 2, like)[0]?.replies[0]?.likeCount, 5);
    assert.equal(updateComment(list, 99, like)[0], list[0]);
  });

  test('replaceComment 保留原有的回覆', () => {
    const list = [comment(1, { replies: [reply(2, 1)] })];
    const edited = comment(1, { content: '改過', editedAt: '2026-11-17T11:00:00+08:00' });
    const next = replaceComment(list, edited);
    assert.equal(next[0]?.content, '改過');
    assert.deepEqual(
      next[0]?.replies.map((item) => item.id),
      [2],
    );
  });

  test('removeComment：沒有回覆就移除，有回覆就留下佔位', () => {
    const list = [comment(1), comment(2, { likeCount: 3, replies: [reply(3, 2)] })];
    const next = removeComment(list, 1);
    assert.deepEqual(
      next.map((item) => item.id),
      [2],
    );
    const withPlaceholder = removeComment(next, 2);
    assert.equal(withPlaceholder[0]?.removed, true);
    assert.equal(withPlaceholder[0]?.content, null);
    assert.equal(withPlaceholder[0]?.author, null);
    assert.equal(withPlaceholder[0]?.likeCount, 0);
    assert.equal(withPlaceholder[0]?.replies.length, 1);
  });

  test('removeComment：佔位的最後一則回覆被刪除時，佔位一併移除', () => {
    const list = [
      comment(1, { removed: true, content: null, replies: [reply(2, 1)] }),
      comment(3, { replies: [reply(4, 3), reply(5, 3)] }),
    ];
    assert.deepEqual(
      removeComment(list, 2).map((item) => item.id),
      [3],
    );
    assert.deepEqual(
      removeComment(list, 4)[1]?.replies.map((item) => item.id),
      [5],
    );
  });
});
