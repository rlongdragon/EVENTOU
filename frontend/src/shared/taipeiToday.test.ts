import assert from 'node:assert/strict';
import { test } from 'node:test';
import { msUntilTaipeiMidnight, taipeiDate } from './taipeiToday';

test('以台北時間決定日期，跨 UTC 日界時仍是台北的那一天', () => {
  assert.deepEqual(taipeiDate(new Date('2026-11-24T15:59:59Z')), {
    year: 2026,
    month: 11,
    day: 24,
    weekday: '二',
  });
  assert.deepEqual(taipeiDate(new Date('2026-11-24T16:00:00Z')), {
    year: 2026,
    month: 11,
    day: 25,
    weekday: '三',
  });
  assert.deepEqual(taipeiDate(new Date('2026-12-31T16:30:00Z')), {
    year: 2027,
    month: 1,
    day: 1,
    weekday: '五',
  });
});

test('計算到下一個台北午夜的時間', () => {
  assert.equal(msUntilTaipeiMidnight(new Date('2026-11-24T15:59:00Z')), 60 * 1000);
  assert.equal(msUntilTaipeiMidnight(new Date('2026-11-24T16:00:00Z')), 24 * 60 * 60 * 1000);
});
