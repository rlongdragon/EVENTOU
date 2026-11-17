import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { campus3DUrl, findCampus3DVenue } from './campus3dVenues';

describe('活動地點對應 3D 模型場地（#80）', () => {
  test('地點文字包含場地名稱或廳室時對應到該場地', () => {
    const cases: [string, string][] = [
      ['行政大樓 2F 第一演講廳', 'admin'],
      ['第一演講廳', 'admin'],
      ['人文大樓1F 畢東江演講廳', 'humanities'],
      ['學生活動中心 3F 展演廳', 'sac'],
      ['學活三樓', 'sac'],
      ['育樂館', 'yule'],
      ['體育館 2 樓', 'gym'],
      ['海洋廳', 'ocean'],
    ];
    for (const [location, id] of cases) {
      assert.equal(findCampus3DVenue(location)?.id, id, location);
    }
  });

  test('較具體的廳室優先於所在大樓', () => {
    assert.equal(findCampus3DVenue('行政大樓旁 海洋廳')?.id, 'ocean');
  });

  test('地點文字與地圖比對到的建物名稱都會用來比對', () => {
    assert.equal(findCampus3DVenue('INS201 演講廳', '人文大樓')?.id, 'humanities');
    assert.equal(findCampus3DVenue(null, '體育館')?.id, 'gym');
  });

  test('忽略空白；對應不到或沒有地點時回傳 null', () => {
    assert.equal(findCampus3DVenue('學生 活動 中心')?.id, 'sac');
    assert.equal(findCampus3DVenue('圖書館 B1'), null);
    assert.equal(findCampus3DVenue(null, undefined, ''), null);
  });

  test('campus3DUrl 有場地時帶 select 參數', () => {
    assert.equal(campus3DUrl(findCampus3DVenue('育樂館')), '/campus-3d.html?select=yule');
    assert.equal(campus3DUrl(null), '/campus-3d.html');
  });
});
