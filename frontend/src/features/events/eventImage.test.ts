import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { defaultImageIndex, pickEventImages, type DefaultPhoto } from './eventImage';

const pool: DefaultPhoto[] = [
  { src: 'a.jpg', place: 'A' },
  { src: 'b.jpg', place: 'B' },
  { src: 'c.jpg', place: 'C' },
];

describe('活動圖片', () => {
  test('同一個活動 id 永遠得到同一張預設圖', () => {
    for (const id of [1, 2, 42, 999]) {
      assert.equal(defaultImageIndex(id, pool.length), defaultImageIndex(id, pool.length));
      const [first] = pickEventImages([{ id }], pool);
      const [second] = pickEventImages([{ id }], pool);
      assert.deepEqual(first, second);
    }
  });

  test('預設圖索引落在圖池範圍內', () => {
    for (let id = 1; id <= 200; id += 1) {
      const index = defaultImageIndex(id, pool.length);
      assert.ok(index >= 0 && index < pool.length);
    }
  });

  test('活動有自己的圖時用原圖，不加地點小字', () => {
    const [image] = pickEventImages([{ id: 7, imageUrl: 'https://example.com/poster.jpg' }], pool);
    assert.deepEqual(image, { src: 'https://example.com/poster.jpg', place: null });
  });

  test('相鄰兩列的預設圖不重複', () => {
    const events = Array.from({ length: 50 }, (_, index) => ({ id: index + 1 }));
    const images = pickEventImages(events, pool);
    for (let index = 1; index < images.length; index += 1) {
      assert.notEqual(images[index].src, images[index - 1].src);
    }
  });

  test('圖池為空時丟出錯誤', () => {
    assert.throws(() => defaultImageIndex(1, 0));
  });
});
