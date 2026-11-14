import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getTileLayerConfig } from './mapTiles';

describe('getTileLayerConfig', () => {
  test('沒有 CARTO 金鑰時退回 OpenStreetMap 圖磚', () => {
    for (const key of [undefined, '', '   ']) {
      const config = getTileLayerConfig(key);
      assert.equal(config.url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      assert.equal(config.subdomains, undefined);
      assert.match(config.attribution, /OpenStreetMap contributors/);
      assert.doesNotMatch(config.attribution, /CARTO/);
    }
  });

  test('有金鑰時使用 CARTO Voyager，並在網址帶上編碼後的金鑰', () => {
    const config = getTileLayerConfig(' abc+/= ');
    assert.equal(
      config.url,
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=abc%2B%2F%3D',
    );
    assert.equal(config.subdomains, 'abcd');
    assert.equal(config.maxZoom, 20);
  });

  test('CARTO 圖磚只到第 18 層，更大的層級改放大第 18 層的圖磚', () => {
    assert.equal(getTileLayerConfig('key').maxNativeZoom, 18);
  });

  test('CARTO 底圖必須同時標示 OpenStreetMap 與 CARTO 版權', () => {
    const { attribution } = getTileLayerConfig('key');
    assert.match(attribution, /OpenStreetMap contributors/);
    assert.match(attribution, /CARTO/);
  });
});
