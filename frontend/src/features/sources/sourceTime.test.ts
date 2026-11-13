import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatSourceTime } from './sourceTime';

test('UTC 時間轉成台灣時間（+8）', () => {
  assert.equal(formatSourceTime('2026-11-13 14:20:09'), '2026-11-13 22:20:09');
});

test('跨日時日期要跟著進位', () => {
  assert.equal(formatSourceTime('2026-11-13 20:00:00'), '2026-11-14 04:00:00');
});

test('跨月與跨年', () => {
  assert.equal(formatSourceTime('2026-12-31 16:30:00'), '2027-01-01 00:30:00');
});

test('UTC 午夜轉成台灣上午 8 點，小時為兩位數', () => {
  assert.equal(formatSourceTime('2026-11-13 00:00:00'), '2026-11-13 08:00:00');
});

test('格式不符時原樣回傳', () => {
  assert.equal(formatSourceTime(''), '');
  assert.equal(formatSourceTime('not a date'), 'not a date');
});
