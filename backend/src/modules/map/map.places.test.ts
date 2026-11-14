import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CAMPUS_CENTER,
  CAMPUS_PLACES,
  matchCampusPlace,
  normalizePlaceText,
} from './map.places.js';

describe('matchCampusPlace', () => {
  test('地點包含建物名稱或別名即可對到', () => {
    assert.equal(matchCampusPlace('甲子廳')?.name, '食品科學學系館');
    assert.equal(matchCampusPlace('行政大樓第二演講廳')?.name, '行政大樓');
    assert.equal(matchCampusPlace('生命科學院館 307 室')?.name, '生命科學院館');
  });

  test('多個別名符合時取最長的別名', () => {
    // 「工學院」與「電機一館」都出現時，取較長的「電機一館」
    assert.equal(matchCampusPlace('工學院電機一館 101')?.name, '電機一館');
    // 「食品科學系」比「甲子廳」長，兩者指向同一棟
    assert.equal(matchCampusPlace('食品科學系甲子廳')?.name, '食品科學學系館');
  });

  test('忽略空白、全形字元、大小寫，並視「台」「臺」為同一字', () => {
    assert.equal(matchCampusPlace('  生命科學 院館３０７')?.name, '生命科學院館');
    assert.equal(matchCampusPlace('機械ｂ館')?.name, '圖書館');
    assert.equal(normalizePlaceText('國立台灣 海洋大學'), '國立臺灣海洋大學');
  });

  test('對不到建物、空白或沒有地點時回傳 null，不會猜相近的建物', () => {
    assert.equal(matchCampusPlace('綜合二館3樓303R'), null);
    assert.equal(matchCampusPlace('國立臺灣海洋大學食安所館'), null);
    assert.equal(matchCampusPlace('   '), null);
    assert.equal(matchCampusPlace(null), null);
    assert.equal(matchCampusPlace(undefined), null);
  });

  test('回傳建物名稱與座標，不含別名', () => {
    const place = CAMPUS_PLACES.find((item) => item.name === '行政大樓');
    assert.deepEqual(matchCampusPlace('行政大樓'), {
      name: '行政大樓',
      latitude: place?.latitude,
      longitude: place?.longitude,
    });
  });
});

describe('CAMPUS_PLACES', () => {
  test('名稱與別名不重複，避免同一段文字對到兩棟建物', () => {
    const keys = CAMPUS_PLACES.flatMap((place) => [place.name, ...place.aliases]).map(
      normalizePlaceText,
    );
    assert.equal(new Set(keys).size, keys.length);
  });

  test('所有座標都在海大校園附近（約 1 公里內）', () => {
    for (const place of CAMPUS_PLACES) {
      assert.ok(Math.abs(place.latitude - CAMPUS_CENTER.latitude) < 0.01, place.name);
      assert.ok(Math.abs(place.longitude - CAMPUS_CENTER.longitude) < 0.01, place.name);
    }
  });
});
