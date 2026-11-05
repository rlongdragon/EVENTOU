import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { eventShareUrl } from './eventShare';

describe('eventShareUrl（US-12）', () => {
  test('以網站 origin 與活動 id 組成固定網址', () => {
    assert.equal(eventShareUrl('https://eventou.example', 42), 'https://eventou.example/events/42');
    assert.equal(eventShareUrl('http://localhost:5173', 7), 'http://localhost:5173/events/7');
  });

  test('origin 結尾有斜線或帶路徑時仍指向活動頁', () => {
    assert.equal(
      eventShareUrl('https://eventou.example/', 42),
      'https://eventou.example/events/42',
    );
    assert.equal(
      eventShareUrl('https://eventou.example/events/1?q=講座#comments', 42),
      'https://eventou.example/events/42',
    );
  });
});
