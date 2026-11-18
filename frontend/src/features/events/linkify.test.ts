import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { splitLinks } from './linkify';

describe('splitLinks', () => {
  test('沒有網址時整段都是文字', () => {
    assert.deepEqual(splitLinks('報名截止日期為 11 月 13 日'), [
      { type: 'text', text: '報名截止日期為 11 月 13 日' },
    ]);
  });

  test('網址遇到中文標點就結束', () => {
    assert.deepEqual(splitLinks('報名連結:https://reurl.cc/QNVOvo。報名截止'), [
      { type: 'text', text: '報名連結:' },
      { type: 'link', text: 'https://reurl.cc/QNVOvo', href: 'https://reurl.cc/QNVOvo' },
      { type: 'text', text: '。報名截止' },
    ]);
  });

  test('多個網址與換行都保留', () => {
    const segments = splitLinks('網站:https://www.aef30.com\nIG:http://reurl.cc/GaQlj3');
    assert.deepEqual(
      segments.filter((s) => s.type === 'link').map((s) => s.text),
      ['https://www.aef30.com', 'http://reurl.cc/GaQlj3'],
    );
    assert.equal(
      segments.map((s) => s.text).join(''),
      '網站:https://www.aef30.com\nIG:http://reurl.cc/GaQlj3',
    );
  });

  test('去掉網址尾端的英文標點與多餘的右括號', () => {
    assert.deepEqual(splitLinks('詳見 (https://example.com/a?b=1).'), [
      { type: 'text', text: '詳見 (' },
      { type: 'link', text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { type: 'text', text: ').' },
    ]);
    assert.equal(
      splitLinks('https://zh.wikipedia.org/wiki/A_(B)')[0]?.text,
      'https://zh.wikipedia.org/wiki/A_(B)',
    );
  });

  test('只有 scheme 沒有主機的不算網址', () => {
    assert.deepEqual(splitLinks('https://。'), [{ type: 'text', text: 'https://。' }]);
  });
});
