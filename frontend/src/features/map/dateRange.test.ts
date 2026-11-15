import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addDays, getTaipeiToday, isValidRange, rangeFromToday } from './dateRange';

describe('dateRange', () => {
  test('以台北時區取得今天日期', () => {
    // UTC 11/12 17:00 = 台北 11/13 01:00
    assert.equal(getTaipeiToday(new Date('2026-11-12T17:00:00Z')), '2026-11-13');
    assert.equal(getTaipeiToday(new Date('2026-11-12T15:59:59Z')), '2026-11-12');
  });

  test('加減天數可跨月、跨年與閏年', () => {
    assert.equal(addDays('2026-11-13', 6), '2026-11-19');
    assert.equal(addDays('2026-11-28', 5), '2026-12-03');
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });

  test('從今天起算的範圍包含今天', () => {
    assert.deepEqual(rangeFromToday('2026-11-13', 1), { from: '2026-11-13', to: '2026-11-13' });
    assert.deepEqual(rangeFromToday('2026-11-13', 7), { from: '2026-11-13', to: '2026-11-19' });
    assert.deepEqual(rangeFromToday('2026-11-13', 30), { from: '2026-11-13', to: '2026-12-12' });
  });

  test('開始日期晚於結束日期時為無效範圍，任一端留空則有效', () => {
    assert.equal(isValidRange({ from: '2026-11-13', to: '2026-11-13' }), true);
    assert.equal(isValidRange({ from: '2026-11-14', to: '2026-11-13' }), false);
    assert.equal(isValidRange({ from: '', to: '2026-11-13' }), true);
    assert.equal(isValidRange({ from: '2026-11-14', to: '' }), true);
  });
});
