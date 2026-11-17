import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  dayTitle,
  eventDays,
  groupByDay,
  monthGrid,
  monthTitle,
  shiftMonth,
  timeLabel,
} from './calendarMonth';

describe('monthGrid', () => {
  test('固定 6 週，從包含 1 日那週的週日開始', () => {
    // 2026/11/1 是週日
    const november = monthGrid({ year: 2026, month: 11 });
    assert.equal(november.days.length, 42);
    assert.equal(november.from, '2026-11-01');
    assert.equal(november.to, '2026-12-12');
    // 2026/12/1 是週二，前面補 11/29、11/30
    const december = monthGrid({ year: 2026, month: 12 });
    assert.equal(december.from, '2026-11-29');
    assert.equal(december.days[2], '2026-12-01');
  });

  test('閏年二月', () => {
    const grid = monthGrid({ year: 2028, month: 2 });
    assert.ok(grid.days.includes('2028-02-29'));
  });
});

describe('shiftMonth', () => {
  test('可跨年前後切換', () => {
    assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
    assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
    assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 0), { year: 2026, month: 11 });
  });
});

describe('eventDays', () => {
  test('沒有結束時間時只有開始日', () => {
    assert.deepEqual(eventDays({ startTime: '2026-11-17T15:10:00+08:00', endTime: null }), {
      first: '2026-11-17',
      last: '2026-11-17',
    });
  });

  test('全天活動的結束時間是結束日隔天 00:00，不算進最後一天', () => {
    assert.deepEqual(
      eventDays({ startTime: '2026-11-10T00:00:00+08:00', endTime: '2026-11-13T00:00:00+08:00' }),
      { first: '2026-11-10', last: '2026-11-12' },
    );
  });

  test('跨日的一般活動涵蓋到結束日', () => {
    assert.deepEqual(
      eventDays({ startTime: '2026-11-10T20:00:00+08:00', endTime: '2026-11-11T02:00:00+08:00' }),
      { first: '2026-11-10', last: '2026-11-11' },
    );
  });

  test('結束時間早於開始時間的異常資料仍顯示在開始日', () => {
    assert.deepEqual(
      eventDays({ startTime: '2026-11-10T20:00:00+08:00', endTime: '2026-11-10T00:00:00+08:00' }),
      { first: '2026-11-10', last: '2026-11-10' },
    );
  });
});

describe('groupByDay', () => {
  test('跨多天的活動在每一天都出現，範圍外的日子不出現', () => {
    const exhibition = {
      startTime: '2026-11-10T00:00:00+08:00',
      endTime: '2026-11-13T00:00:00+08:00',
    };
    const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
    const grouped = groupByDay([exhibition], days);
    assert.deepEqual(
      days.map((day) => grouped.get(day)?.length),
      [0, 1, 1, 1, 0],
    );
  });
});

describe('標題文字', () => {
  test('月份與日期的顯示', () => {
    assert.equal(monthTitle({ year: 2026, month: 11 }), '2026 年 11 月');
    assert.equal(dayTitle('2026-11-17'), '11 月 17 日（週二）');
  });
});

describe('timeLabel', () => {
  const at = (start: string, end: string | null, allDay = false) => ({
    startTime: start,
    endTime: end,
    allDay,
  });

  test('單日活動只顯示時間，沒有結束時間時只顯示開始', () => {
    assert.equal(
      timeLabel(at('2026-11-17T15:10:00+08:00', '2026-11-17T16:55:00+08:00')),
      '15:10 – 16:55',
    );
    assert.equal(timeLabel(at('2026-11-17T15:10:00+08:00', null)), '15:10');
    assert.equal(timeLabel(at('2026-11-17T20:00:00+08:00', '2026-11-18T00:00:00+08:00')), '20:00');
  });

  test('全天與跨多天的活動', () => {
    assert.equal(timeLabel(at('2026-11-09T00:00:00+08:00', null, true)), '全天');
    assert.equal(
      timeLabel(at('2026-11-10T00:00:00+08:00', '2026-11-13T00:00:00+08:00', true)),
      '11/10 – 11/12',
    );
    assert.equal(
      timeLabel(at('2026-11-10T20:00:00+08:00', '2026-11-11T02:00:00+08:00')),
      '11/10 20:00 – 11/11',
    );
  });
});
