import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  absoluteUrl,
  googleDates,
  googleEventUrl,
  googleSubscribeUrl,
  isPrivateOrigin,
  outlookSubscribeUrl,
  webcalUrl,
} from './calendarLinks';

const FEED = 'https://eventou.example/api/calendars/feed/abc.ics';

describe('訂閱連結', () => {
  test('補上網站位址並轉成 webcal', () => {
    assert.equal(absoluteUrl('/api/calendars/feed/abc.ics', 'https://eventou.example'), FEED);
    assert.equal(webcalUrl(FEED), 'webcal://eventou.example/api/calendars/feed/abc.ics');
    assert.equal(webcalUrl('http://a.test/x.ics'), 'webcal://a.test/x.ics');
  });

  test('Google 以 cid 帶入編碼後的 webcal 網址', () => {
    assert.equal(
      googleSubscribeUrl(FEED),
      'https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Feventou.example%2Fapi%2Fcalendars%2Ffeed%2Fabc.ics',
    );
  });

  test('Outlook 帶入網址與行事曆名稱', () => {
    const url = new URL(outlookSubscribeUrl(FEED, 'EVENTOU 我的行事曆'));
    assert.equal(url.origin + url.pathname, 'https://outlook.live.com/calendar/0/addfromweb');
    assert.equal(url.searchParams.get('url'), FEED);
    assert.equal(url.searchParams.get('name'), 'EVENTOU 我的行事曆');
  });
});

describe('isPrivateOrigin', () => {
  test('本機與區域網路的位址外部服務連不到', () => {
    for (const origin of [
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://[::1]:5173',
      'http://192.168.1.20:5173',
      'http://10.0.0.5',
      'http://172.20.1.1',
      'http://eventou.local',
      'http://app.localhost',
    ]) {
      assert.equal(isPrivateOrigin(origin), true, origin);
    }
  });

  test('公開網址可以讓外部服務同步', () => {
    for (const origin of ['https://eventou.example', 'http://172.32.0.1', 'https://8.8.8.8']) {
      assert.equal(isPrivateOrigin(origin), false, origin);
    }
  });
});

describe('googleDates', () => {
  test('一般活動轉成 UTC，沒有結束時間時預設一小時', () => {
    assert.equal(
      googleDates({
        startTime: '2026-11-17T15:10:00+08:00',
        endTime: '2026-11-17T16:55:00+08:00',
        allDay: false,
      }),
      '20261117T071000Z/20261117T085500Z',
    );
    assert.equal(
      googleDates({ startTime: '2026-11-17T15:10:00+08:00', endTime: null, allDay: false }),
      '20261117T071000Z/20261117T081000Z',
    );
  });

  test('全天活動用日期，結束日為排他的隔天', () => {
    assert.equal(
      googleDates({
        startTime: '2026-11-10T00:00:00+08:00',
        endTime: '2026-11-13T00:00:00+08:00',
        allDay: true,
      }),
      '20261110/20261113',
    );
    assert.equal(
      googleDates({ startTime: '2026-11-30T00:00:00+08:00', endTime: null, allDay: true }),
      '20261130/20261201',
    );
  });
});

describe('googleEventUrl', () => {
  test('帶入標題、時間、地點與活動頁連結', () => {
    const url = new URL(
      googleEventUrl(
        {
          title: '專題演講 & 交流',
          startTime: '2026-11-17T15:10:00+08:00',
          endTime: null,
          allDay: false,
          location: '甲子廳',
        },
        'https://eventou.example/events/27',
      ),
    );
    assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
    assert.equal(url.searchParams.get('action'), 'TEMPLATE');
    assert.equal(url.searchParams.get('text'), '專題演講 & 交流');
    assert.equal(url.searchParams.get('location'), '甲子廳');
    assert.match(url.searchParams.get('details') ?? '', /https:\/\/eventou\.example\/events\/27/);
  });

  test('沒有地點時不帶 location', () => {
    const url = new URL(
      googleEventUrl(
        {
          title: 'x',
          startTime: '2026-11-17T15:10:00+08:00',
          endTime: null,
          allDay: false,
          location: null,
        },
        'https://eventou.example/events/1',
      ),
    );
    assert.equal(url.searchParams.has('location'), false);
  });
});
