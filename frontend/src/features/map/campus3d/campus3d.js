import './campus3d.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 平面圖（300dpi 點陣）像素座標 → 公尺（約 0.5 m/px，以操場跑道長度估算）
const S = 0.5;
const planToMeters = (hx, hy) => [(hx - 1400) * S, (hy - 600) * S];
// 平面圖是手繪的，各區比例不一（部分區域偏差可達 50 m）。以 OSM 為準算出平滑的位移場（高斯徑向基底）：
// 控制點是 34 棟與 OSM 同名的建物，加上模型道路對到 OSM 道路中心線的取樣點。
// 所有座標都經過 toWorld，道路、建物、標籤一起移動、彼此不會錯開。
// 每列：[中心 x, 中心 z, 權重 x, 權重 z]，單位公尺
const WARP_SIGMA2 = 3600;
const WARP = [
  [116.5, 5.0, 1.1944, -6.8829],
  [-1.5, -68.5, 1.568, -4.5934],
  [-221.5, 6.5, -14.8933, -9.2217],
  [-292.5, -7.5, -4.5373, -1.6523],
  [237.0, -50.0, -0.2554, 0.1107],
  [-46.5, -113.5, -3.5256, -0.5169],
  [181.0, 50.0, 0.4601, 0.544],
  [-104.0, -69.0, -4.9583, 4.6403],
  [-194.0, -83.5, 1.8464, 1.437],
  [-302.5, 66.0, 2.1357, 0.737],
  [-338.5, 84.5, -13.939, -10.9808],
  [-302.0, 109.0, -5.9238, -9.4044],
  [-141.5, -83.5, 3.9998, 3.8279],
  [-45.0, -42.5, -6.34, -1.1116],
  [61.0, 11.5, -2.2177, -1.7265],
  [236.0, 51.0, 4.2995, -2.4662],
  [-1.5, -13.5, 8.3394, 1.9818],
  [-600.0, -105.0, -9.2897, 26.7736],
  [-592.0, -70.0, -4.8339, 30.6988],
  [-531.0, -44.0, 1.4024, 21.4787],
  [-389.0, 34.0, -14.9872, -0.4314],
  [-253.0, 125.0, 14.1429, -12.2431],
  [-384.5, 143.5, 30.6072, 5.943],
  [-456.0, 112.5, 15.0689, 7.5227],
  [223.5, -182.0, -7.8371, 17.9629],
  [198.5, -99.0, -4.3292, 3.6417],
  [370.0, -107.5, 6.9165, 2.0094],
  [447.0, -85.5, -3.4881, 6.6215],
  [413.5, -34.0, -3.3456, -4.8228],
  [531.0, -77.5, 10.9532, 2.3943],
  [494.0, 13.0, 1.9264, 0.5323],
  [437.0, 75.5, 1.2661, 3.5331],
  [370.0, 65.5, 0.818, -6.3081],
  [427.0, 96.5, -1.4708, -3.6328],
  [-473.1, -39.6, 3.3279, -0.6924],
  [-442.3, -27.8, 0.5091, -4.5862],
  [-411.5, -15.9, -4.5116, -2.9412],
  [-381.5, -3.6, -8.1066, -2.3432],
  [-351.9, 9.1, -7.122, -2.5774],
  [-322.3, 21.8, -1.0903, 0.4049],
  [-292.7, 34.5, 4.3385, 5.1331],
  [-263.1, 47.2, 3.1768, 5.0276],
  [-232.9, 60.8, 0.0498, 1.2724],
  [-202.4, 75.0, -0.0038, -0.9148],
  [-171.8, 89.1, 1.0528, -2.6311],
  [-141.3, 103.2, 1.9099, -4.4657],
  [-109.6, 112.1, 2.2205, -4.4085],
  [-77.7, 120.2, 2.0494, -3.1024],
  [-45.8, 128.3, 1.5059, -1.9731],
  [-13.9, 136.4, 0.5392, -1.4037],
  [18.4, 142.8, -0.4378, -2.2481],
  [51.3, 146.1, -0.5436, -4.5976],
  [404.9, 142.3, -2.2745, -14.8277],
  [437.5, 139.2, -3.1159, -16.8492],
  [151.7, 39.8, -1.5072, -2.5889],
  [166.0, 7.8, -2.555, -4.3525],
  [185.5, -22.5, -2.9926, -3.0634],
  [224.0, -21.8, -2.3674, 1.1465],
  [263.0, -3.0, -4.4757, 7.5379],
  [386.8, 36.0, 4.2515, -7.2451],
  [420.8, 44.0, 3.9697, 0.2822],
  [454.2, 48.9, 2.3783, 7.282],
  [487.5, 53.3, 0.0982, 6.5636],
  [509.7, 73.1, -1.7813, 1.7948],
  [325.9, -39.1, -0.6915, 8.302],
  [367.5, -18.4, 1.4074, -0.3184],
  [268.1, -138.6, 1.2254, 2.5061],
  [306.6, -132.0, 3.4388, -0.7548],
  [341.6, -112.8, 5.9749, 2.6923],
  [374.0, -87.2, 4.6788, 1.0519],
  [413.9, -65.3, -3.6072, -1.8671],
  [-124.7, -149.0, -1.0859, 5.944],
  [-93.0, -139.4, -2.6974, 4.2141],
  [-61.3, -129.8, -2.7484, 0.4403],
  [-29.6, -120.2, -1.6988, -2.721],
  [2.1, -110.6, 0.1352, -4.7958],
  [36.5, -103.9, 0.9008, -3.895],
  [70.8, -98.7, -0.103, -1.9244],
  [103.8, -91.6, -1.6055, -1.8974],
  [137.0, -73.0, -3.474, -3.0174],
  [222.8, -96.0, -0.8566, 2.0002],
  [252.5, -128.5, 0.6908, 3.6836],
  [-222.1, -70.0, -8.2269, -1.4024],
  [-232.5, -110.0, -2.7513, 1.1011],
  [-241.6, -145.3, 1.0196, 1.7522],
  [-244.0, -177.8, 2.3738, 3.7527],
  [-236.5, -210.0, 3.5202, 5.3179],
  [-167.5, -61.2, 4.7066, 0.8927],
  [67.8, 109.6, 1.6867, -3.1418],
  [90.0, 99.2, 2.3668, -2.928],
  [146.0, 133.0, 1.1583, -3.1842],
  [143.8, 98.0, 2.6106, -0.0736],
];
function warpAt(x, z) {
  let dx = 0;
  let dz = 0;
  for (const [cx, cz, wx, wz] of WARP) {
    const k = Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / WARP_SIGMA2);
    dx += wx * k;
    dz += wz * k;
  }
  return [dx, dz];
}
const toWorld = (hx, hy) => {
  const [x, z] = planToMeters(hx, hy);
  const [dx, dz] = warpAt(x, z);
  return [x + dx, z + dz];
};
const FLOOR_H = 3.8;
const ROT = -0.36; // 校區主要建物軸向
const ROT_E = -0.62; // 海事大樓一帶軸向

// 平面形狀工具（建物本地座標，x 沿寬、z 沿深，單位公尺）
const P = {
  rect: (w, d, cx = 0, cz = 0) => [
    [cx - w / 2, cz - d / 2],
    [cx + w / 2, cz - d / 2],
    [cx + w / 2, cz + d / 2],
    [cx - w / 2, cz + d / 2],
  ],
  arc: (cx, cz, r, a0, a1, n = 14) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / n;
      return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
    }),
  circle: (cx, cz, r, n = 24) => P.arc(cx, cz, r, 0, Math.PI * 2 * (1 - 1 / n), n - 1),
};

// 常辦活動的場地（橘色，可分樓層）。rooms 標出活動廳所在樓層（深橘），其餘樓層淺橘。
// tiers：[從第幾層起（含地下室，0 起算）, 平面形狀]，讓上下樓層外型不同（退縮、L 型、弧形）。
// extras：屋頂等附加量體，展開樓層時隱藏。樓層數除學生活動中心（B1～3F）外為暫定，外型依空拍與導覽圖概略推估。
const VENUES = [
  {
    id: 'ocean',
    no: 2,
    name: '海洋廳・展示廳',
    p: [1692, 523],
    floors: 2,
    rot: -0.6,
    // 扇形講堂：南側平直入口、北側弧形背牆
    tiers: [
      [
        0,
        [[-14, 15], [14, 15], [20, 0], ...P.arc(0, 0, 20, 0, -Math.PI, 16).slice(1, -1), [-20, 0]],
      ],
    ],
    extras: (h) => [
      part(P.rect(22, 5, 0, 17.5), 4.2, 0.6, 'white'),
      part(P.circle(0, -1, 9), h, 2.2, 'venueTop'),
    ],
    rooms: { '1F': '展示廳', '2F': '海洋廳' },
    note: '平面圖 2 號（F3），與行政大樓相連',
  },
  {
    id: 'admin',
    no: 1,
    name: '行政大樓',
    p: [1633, 610],
    floors: 5,
    rot: 0.97,
    // 長條量體，1～3F 全長加門廊，4～5F 中段退縮，頂上一座塔屋
    tiers: [
      [
        0,
        [
          [-36, -9],
          [36, -9],
          [36, 9],
          [7, 9],
          [7, 15],
          [-7, 15],
          [-7, 9],
          [-36, 9],
        ],
      ],
      [3, P.rect(44, 18)],
    ],
    extras: (h) => [
      part(P.rect(12, 12), h, 5, 'white'),
      part(P.rect(14, 14), h + 5, 0.6, 'venueTop'),
    ],
    rooms: { '2F': '第一演講廳' },
    note: '平面圖 1 號（F3）。長軸沿校門主幹道，北端接海洋廳',
  },
  {
    id: 'yule',
    no: 10,
    name: '育樂館',
    p: [1397, 463],
    floors: 4,
    rot: ROT,
    // 1～2F 大基座，3～4F 大空間主館，上覆緩坡雙斜屋頂
    tiers: [
      [0, P.rect(52, 40)],
      [2, P.rect(52, 26, 0, -7)],
    ],
    extras: (h) => {
      const r = gableRoof(54, 28, 9, VENUE_ROOF);
      r.position.set(0, h, -7);
      return [r];
    },
    note: '平面圖 10 號（E2）',
  },
  {
    id: 'gym',
    no: 23,
    name: '體育館',
    p: [957, 613],
    floors: 3,
    rot: ROT,
    // 1F 兩端門廳外凸，上方拱形屋頂加肋
    tiers: [
      [0, P.rect(66, 44)],
      [1, P.rect(58, 44)],
    ],
    extras: (h) => {
      const roof = archRoof(60, 46, 11, mat(0xc9cdd0));
      roof.position.y = h;
      const ribs = [-24, -12, 0, 12, 24].map((x) => {
        const g = new THREE.TorusGeometry(23.4, 0.45, 4, 24, Math.PI);
        g.rotateY(Math.PI / 2);
        g.scale(1, 22 / 46, 1);
        const m = new THREE.Mesh(g, mat(0xaeb4b8));
        m.position.set(x, h, 0);
        m.castShadow = true;
        return m;
      });
      return [roof, ...ribs];
    },
    note: '平面圖 23 號（D3）',
  },
  {
    id: 'sac',
    no: 22,
    name: '學生活動中心',
    p: [815, 585],
    floors: 4,
    basement: 1,
    rot: ROT,
    // B1～1F 方整基座，2F 成 L 型，3F 展演廳在西側，上覆弧形屋頂
    tiers: [
      [0, P.rect(56, 36)],
      [
        2,
        [
          [-28, -18],
          [28, -18],
          [28, 2],
          [6, 2],
          [6, 18],
          [-28, 18],
        ],
      ],
      [3, P.rect(34, 36, -11, 0)],
    ],
    // 依街景（2022、2024）：彩色量體（黃、藍、紅色塊）上覆灰色斜折屋頂，西端貼一棟米褐色高塔（鋸齒陽台），東端彩虹玻璃雨棚樓梯下地下道
    extras: (h) => {
      const roofMat = mat(0x8c939a);
      const prof = new THREE.Shape(
        [
          [-30, 0],
          [6, 0],
          [6, 2.2],
          [-12, 5.5],
          [-30, 7.5],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
      );
      const fold = new THREE.Mesh(
        new THREE.ExtrudeGeometry(prof, { depth: 40, bevelEnabled: false }),
        roofMat,
      );
      fold.position.set(0, h, -20);
      fold.castShadow = true;
      addEdges(fold);
      return [fold];
    },
    attached: (h) => {
      const H = FLOOR_H,
        out = [];
      // 南面色塊（面向北寧路）
      for (const [x, y, w, hh, c] of [
        [-14, H, 16, H * 1.6, 0xf2c230],
        [6, 0.3, 14, H * 1.7, 0x2c4fa3],
        [20, H * 1.2, 8, H, 0xd23b33],
        [-24, 0.3, 6, H * 2.2, 0xf2c230],
      ]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.4), mat(c));
        m.position.set(x, y + hh / 2, 18.3);
        out.push(m);
      }
      // 西端米褐色高塔，南面鋸齒陽台
      const tower = part(P.rect(16, 22, -36, 2), 0, 8 * H, 'tan');
      out.push(tower);
      out.push(part(P.rect(6, 22.4, -41, 2), 0, 8 * H + 0.4, mat(0xc49a6c)));
      for (let k = 1; k < 8; k++)
        for (const x of [-40, -36, -32])
          out.push(
            part(
              [
                [x - 2, 13],
                [x + 2, 13],
                [x, 15],
              ],
              k * H,
              0.25,
              WHITE,
            ),
          );
      // 東端彩虹玻璃雨棚：沿坡往下到地下道入口
      const rainbow = [0xe0413a, 0xf08a2c, 0xf2c230, 0x4fb05a, 0x2f8fd0, 0x5a4fc0, 0xb04fb0];
      rainbow.forEach((c, k) => {
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 0.12, 4),
          new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.7 }),
        );
        pane.position.set(31 + k * 2.4, 4.2 - k * 0.45, 20);
        pane.rotation.z = -0.18;
        pane.castShadow = true;
        out.push(pane);
        for (const z of [18.2, 21.8])
          out.push(part(P.rect(0.2, 0.2, 31 + k * 2.4, z), 0, 4.2 - k * 0.45, WHITE));
      });
      return out;
    },
    rooms: { '3F': '展演廳' },
    shops: { '1F': '路易莎咖啡、HALO 快餐' },
    note: '平面圖 22 號（C3）。B1 社團練習區、1F 餐廳商店（路易莎咖啡、HALO 快餐）、2F 辦公室與練習室',
  },
  {
    id: 'humanities',
    no: 34,
    name: '人文大樓',
    p: [1874, 500],
    floors: 9,
    rot: -0.25,
    // 塔樓＋西北角兩層方形低樓（褐色屋頂），8～9F 退縮，頂部懸挑屋簷。
    // 位置依衛星圖：在圖書館東北側約 50 m，東北角接海事大樓甲棟、乙棟
    tiers: [
      [
        0,
        [
          [-12, 18],
          [12, 18],
          [12, -18],
          [-8, -18],
          [-8, -36],
          [-32, -36],
          [-32, -14],
          [-12, -14],
        ],
      ],
      [2, P.rect(24, 36)],
      [7, P.rect(24, 26, 0, -5)],
    ],
    extras: (h) => [
      part(P.rect(10, 10, 0, -5), h, 4, 'white'),
      part(P.rect(28, 30, 0, -5), h + 4, 0.6, 'venueTop'),
    ],
    rooms: { '1F': '畢東江演講廳' },
    note: '平面圖 34 號（G2）',
  },
];

// 重點地標（非活動場地）：以多個量體組出外型，其餘建物維持方塊。外型依空拍與導覽圖推估。
// parts：[平面形狀, 起始高度, 高度, 材質, 是否加樓層腰帶]
const LANDMARKS = [
  {
    no: 12,
    name: '延平技術大樓',
    p: [1307, 373],
    rot: ROT,
    floors: 11,
    parts: (H) => [
      [P.rect(40, 24, -3, 0), 0, 11 * H, 'brown', 1],
      [P.rect(6, 14, 20, 0), 0, 12 * H, 'rust'],
      [P.rect(44, 8, -1, 16), 0, 2 * H, 'cream', 1],
      [P.rect(14, 10, -6, 0), 11 * H, 3.4, 'white'],
      [P.rect(1.2, 26, -23.6, 0), 2 * H, 9 * H, 'rust'],
    ],
  },
  {
    no: 3,
    name: '圖書館',
    p: [1802, 612],
    rot: ROT,
    floors: 5,
    shopNote: '1F 有 7-ELEVEN 無人商店',
    // 依照片：白色清水量體。1F 退縮的玻璃門廳（橘色入口框）加獨立白柱，2F 一圈玻璃帶，
    // 3～5F 白色方盒外挑、深凹方窗；西南角一座比屋頂高的空心方框塔；北側兩層玻璃低棟上覆白色平板。
    // 屋頂兩座白色大金字塔天窗（2016 空拍）。正面朝西（主幹道、棕櫚樹側）
    parts: (H) => [
      [P.rect(34, 28), 0, H, 'glass'],
      [P.rect(37, 31), H, H, 'glass'],
      [P.rect(37.4, 31.4), H - 0.2, 0.4, 'white'],
      [P.rect(40, 34), 2 * H, 3 * H, 'white', 1],
      [P.rect(10, 8, -12, -11), 5 * H, 3, 'white'],
      [P.rect(18, 14, -10, -24), 0, 2 * H - 0.6, 'glass'],
      [P.rect(22, 17, -10, -24), 2 * H - 0.6, 0.6, 'white'],
      [P.rect(0.6, 4.4, -17.3, 3), 0, 3.4, 'libDoor'],
    ],
    extra: (H) => {
      const out = [];
      // 獨立白柱：西側正面與北側低棟
      for (const z of [-14, -7, 0, 7, 14])
        out.push(part(P.rect(1.1, 1.1, -19.5, z), 0, 2 * H, 'white'));
      for (const x of [-20, -10, 0])
        out.push(part(P.rect(0.8, 0.8, x, -32), 0, 2 * H - 0.6, 'white'));
      // 3～5F 深凹方窗（四面）
      const win = mat(0x56636d);
      for (let k = 0; k < 3; k++) {
        const y = 2 * H + k * H + 1;
        for (let t = -16; t <= 16.01; t += 4) {
          out.push(
            part(P.rect(0.3, 1.6, -20.05, t * 0.95), y, 1.7, win),
            part(P.rect(0.3, 1.6, 20.05, t * 0.95), y, 1.7, win),
          );
        }
        for (let t = -18; t <= 18.01; t += 4) {
          out.push(
            part(P.rect(1.6, 0.3, t, -17.05), y, 1.7, win),
            part(P.rect(1.6, 0.3, t, 17.05), y, 1.7, win),
          );
        }
      }
      // 西南角空心方框塔（四根角柱＋兩圈框）
      const tx = -15,
        tz = 19.5,
        ts = 3;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          out.push(part(P.rect(1, 1, tx + sx * ts, tz + sz * ts), 0, 6 * H + 1, 'white'));
      for (const y of [5 * H, 6 * H]) {
        out.push(
          part(P.rect(7, 1, tx, tz - ts), y, 1, 'white'),
          part(P.rect(7, 1, tx, tz + ts), y, 1, 'white'),
          part(P.rect(1, 7, tx - ts, tz), y, 1, 'white'),
          part(P.rect(1, 7, tx + ts, tz), y, 1, 'white'),
        );
      }
      // 屋頂兩座白色大金字塔天窗
      for (const dx of [-8, 8]) {
        const g = new THREE.ConeGeometry(8.5, 6, 4);
        g.rotateY(Math.PI / 4);
        const m = new THREE.Mesh(g, LM_MAT.white);
        m.position.set(dx + 2, 5 * H + 3, 2);
        m.castShadow = true;
        addEdges(m);
        out.push(m);
      }
      // 西側入口廣場紅色帳篷、棕櫚樹
      const red = mat(0xc8322b);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const g = new THREE.ConeGeometry(2.2, 1.6, 4);
          g.rotateY(Math.PI / 4);
          const m = new THREE.Mesh(g, red);
          m.position.set(-29 + i * 3.1, 3.4, -3 + j * 3.1);
          m.castShadow = true;
          out.push(m);
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), LM_MAT.white);
          post.position.set(-29 + i * 3.1, 1.3, -3 + j * 3.1);
          out.push(post);
        }
      for (const z of [-16, -10, 10, 16]) out.push(...palm(-25, z, 6.5));
      return out;
    },
  },
  // 綜合研究中心：沿北寧路彎道的弧形長條量體（依空拍）
  {
    no: 4,
    name: '綜合研究中心',
    p: [1762, 700],
    rot: ROT,
    floors: 4,
    parts: (H) => {
      const a0 = -Math.PI / 2 - 0.38,
        a1 = -Math.PI / 2 + 0.38;
      const band = [...P.arc(0, 58, 68, a0, a1, 18), ...P.arc(0, 58, 54, a1, a0, 18)];
      const fins = [-0.28, -0.1, 0.08, 0.26].map((t) => {
        const a = -Math.PI / 2 + t,
          x = Math.cos(a) * 53.2,
          z = 58 + Math.sin(a) * 53.2;
        return [P.rect(1.4, 1.4, x, z), 0, 4 * H + 1.2, 'gold'];
      });
      return [[band, 0, 4 * H, 'grey', 1], [P.rect(8, 12, 27, 2), 0, 5 * H, 'glass'], ...fins];
    },
  },
  {
    no: 14,
    name: '沛華大樓',
    p: [1192, 462],
    rot: ROT,
    floors: 9,
    parts: (H) => [
      [P.rect(20, 26), 0, 9 * H, 'cream', 1],
      [P.circle(0, 15, 7), 0, 2 * H, 'glass'],
      [P.rect(8, 8), 9 * H, 3.2, 'white'],
    ],
  },
  {
    no: 17,
    name: '海空大樓',
    p: [1012, 433],
    rot: ROT,
    floors: 10,
    // 8F 主體，上兩層往西退縮，頂上框架
    parts: (H) => [
      [P.rect(30, 22), 0, 8 * H, 'cream', 1],
      [P.rect(20, 22, -5, 0), 8 * H, 2 * H, 'cream', 1],
      [P.rect(6, 10, 16, 0), 0, 10 * H, 'rust'],
      [P.rect(14, 12, -5, 0), 10 * H, 3, 'white'],
    ],
  },
  {
    no: 68,
    name: '電資暨綜合教學大樓',
    p: [795, 732],
    rot: -0.4,
    floors: 11,
    // 依街景：正面朝北寧路、左右對稱，背面兩端灰色百葉直條、每層陽台。1～2F 粉褐色基座＋三角小雨遮入口；中央土黃主體，
    // 兩側各一座通高玻璃樓梯塔，再外側是兩翼，翼端每層外挑陽台（土黃與白色交錯）
    parts: (H) => [
      [P.rect(58, 22, 0, 1), 0, 2 * H, 'podium'],
      [P.rect(18, 20, 0, 0), 2 * H, 9 * H, 'tan', 1],
      [P.rect(5.5, 6, -12, -8), 0, 11 * H + 1.5, 'glass'],
      [P.rect(5.5, 6, 12, -8), 0, 11 * H + 1.5, 'glass'],
      [P.rect(6.5, 18, -12, 2), 2 * H, 9 * H, 'grey'],
      [P.rect(6.5, 18, 12, 2), 2 * H, 9 * H, 'grey'],
      [P.rect(13, 20, -21.5, 1), 2 * H, 9 * H, 'tan', 1],
      [P.rect(13, 20, 21.5, 1), 2 * H, 9 * H, 'tan', 1],
      [P.rect(10, 6, 21, 4), 11 * H, 3, 'white'],
      // 背面（朝資工系館）兩道灰色百葉直條
      [P.rect(2.6, 1.6, -15, 11.6), 2 * H, 9 * H + 1, 'grey'],
      [P.rect(2.6, 1.6, 15, 11.6), 2 * H, 9 * H + 1, 'grey'],
    ],
    extra: (H) => {
      const out = [];
      for (let k = 3; k < 11; k++)
        out.push(part(P.rect(26, 1.5, 0, 11.6), k * H + 0.2, 1, 'white'));
      // 翼端陽台：每層一個外挑盒，土黃、白交錯
      for (let k = 2; k < 11; k++)
        for (const sx of [-1, 1]) {
          out.push(part(P.rect(3.2, 7, sx * 29.6, -4), k * H + 0.3, 1.3, k % 2 ? 'tan' : 'white'));
        }
      // 入口雨遮與三個小山牆
      out.push(part(P.rect(18, 4.5, 0, -11.5), H + 0.6, 0.4, 'white'));
      for (const x of [-6, 0, 6]) {
        const g = gableRoof(5.5, 4.5, 1.2, LM_MAT.white);
        g.position.set(x, H + 1, -11.5);
        out.push(g);
      }
      return out;
    },
  },
  {
    no: 62,
    name: '電機一館',
    p: [723, 769],
    rot: -0.36,
    floors: 6,
    // 依 2012 街景：土黃色 6F，正面中央一道藍色磁磚直條，入口紅磚小門廳上有玻璃山形雨遮；
    // 東側 3F 一道玻璃空橋接電機二館・資工系館，橋下可通行
    parts: (H) => [
      [P.rect(20, 26), 0, 6 * H, 'tan', 1],
      [P.rect(5, 0.8, -2, -13.3), 0, 6 * H + 0.4, 'blueTile'],
      [P.rect(8, 5, -2, -15.5), 0, H, 'brick'],
      [P.rect(25, 4, 22.5, 2), 2 * H, H, 'glass'],
      [P.rect(25.4, 4.6, 22.5, 2), 2 * H - 0.5, 0.5, 'tan'],
      [P.rect(25.4, 4.6, 22.5, 2), 3 * H, 0.6, 'tan'],
      [P.rect(6, 6, -4, 6), 6 * H, 3, 'white'],
    ],
    extra: (H) => {
      const g = gableRoof(8, 5, 2.2, LM_MAT.glass);
      g.position.set(-2, H, -15.5);
      return [g];
    },
  },
  {
    no: 64,
    name: '電機二館・資工系館',
    p: [796, 818],
    rot: -0.4,
    floors: 8,
    // 電機二館與資工系館是同一棟：電資大樓後方的土黃色方樓（約 8F），東側一道玻璃直條；
    // 2F 高度有厚樑加圓柱的門廊往北接電資大樓背面；西側一座切角（八角）樓梯塔，西面以空橋接電機一館；
    // 東南角兩層低棟，屋頂玻璃山形天窗（依 2012 街景）
    parts: (H) => [
      [P.rect(22, 18), 0, 8 * H, 'tan'],
      [P.circle(-11.5, -3, 3.6, 8), 0, 8 * H + 1.2, 'tan'],
      [P.rect(10, 8, 15, 4), 0, 2 * H, 'tan'],
      [P.rect(2.4, 6, 11.2, -3), 0, 8 * H, 'glass'],
      [P.rect(22.4, 18.4), 8 * H, 0.8, 'tan'],
      [P.rect(7, 20, -6, -18.5), 2 * H - 1.6, 1.6, 'tan'],
    ],
    extra: (H) => {
      const out = [];
      // 門廊圓柱
      for (const z of [-26, -18])
        for (const x of [-9, -3]) out.push(part(P.circle(x, z, 0.5, 12), 0, 2 * H - 1.6, 'tan'));
      // 八角樓梯塔的帶狀窗、低棟玻璃山形天窗
      for (let k = 1; k < 8; k++)
        out.push(part(P.circle(-11.5, -3, 3.7, 8), k * H + 1.2, 1, 'glass'));
      const sky = gableRoof(8, 5, 2.2, LM_MAT.glass);
      sky.position.set(15, 2 * H, 4);
      out.push(sky);
      // 窗帶：每層兩組窗
      for (let k = 1; k < 8; k++)
        for (const x of [-6, 4]) out.push(part(P.rect(5, 0.3, x, -9.1), k * H + 1, 1.4, 'glass'));
      return out;
    },
  },
  // 宿舍（依 2026 校園地圖編號名稱）：米黃外牆、磚紅樓梯間直條
  {
    no: 19,
    name: '第四宿舍',
    p: [977, 213],
    rot: ROT,
    floors: 12,
    dorm: true,
    parts: (H) => [
      [P.rect(22, 40), 0, 12 * H, 'dormWall', 1],
      [P.rect(6, 8, 13.5, -10), 0, 13 * H, 'dormRed'],
      [P.rect(6, 8, 13.5, 10), 0, 13 * H, 'dormRed'],
      [P.rect(8, 6, 0, -12), 12 * H, 4, 'white'],
      [P.rect(8, 6, 0, 12), 12 * H, 4, 'white'],
      [P.rect(3, 40.4, -9, 0), 0, 12 * H + 1, 'dormRed'],
    ],
  },
  {
    no: 21,
    name: '第三宿舍',
    p: [1087, 223],
    rot: ROT,
    floors: 11,
    dorm: true,
    // L 型宿舍，轉角是磚紅樓梯塔
    parts: (H) => [
      [
        [
          [-13, -18],
          [13, -18],
          [13, -6],
          [-1, -6],
          [-1, 18],
          [-13, 18],
        ],
        0,
        11 * H,
        'dormWall',
        1,
      ],
      [P.rect(7, 7, -2, -9), 0, 12 * H, 'dormRed'],
      [P.rect(6, 6, -7, 12), 11 * H, 3.5, 'white'],
    ],
  },
  {
    no: 28,
    name: '第二宿舍',
    p: [1758, 141],
    rot: -0.2,
    floors: 8,
    dorm: true,
    parts: (H) => [
      [P.rect(20, 30), 0, 8 * H, 'dormWall', 1],
      [P.rect(5, 9, 12.5, 0), 0, 9 * H, 'dormRed'],
      [P.rect(8, 8, -3, 0), 8 * H, 3, 'white'],
    ],
  },
  // 第一宿舍（女一舍）整修中：外罩鷹架
  {
    no: 36,
    name: '第一宿舍',
    p: [2113, 235],
    rot: ROT_E,
    floors: 6,
    dorm: true,
    tag: '第一宿舍・整修中',
    dormNote: '整修中（女一宿舍）',
    parts: (H) => [
      [P.rect(20, 18), 0, 6 * H, 'dormWall', 1],
      [P.rect(5, 7, -12.5, 0), 0, 7 * H, 'dormRed'],
      [P.rect(7, 6, 3, 0), 6 * H, 3, 'white'],
    ],
    extra: (H) => {
      const g = new THREE.BoxGeometry(23, 6 * H + 2, 21, 6, 8, 6);
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color: 0x8a8f94,
          wireframe: true,
          transparent: true,
          opacity: 0.55,
        }),
      );
      m.position.y = (6 * H + 2) / 2;
      return [m];
    },
  },
  // 木蘭海洋海事教育大樓：新宿舍
  {
    no: 54,
    name: '木蘭海洋海事教育大樓',
    p: [2489, 939],
    rot: -0.3,
    floors: 6,
    dorm: true,
    tag: '木蘭・新宿舍',
    dormNote: '新宿舍',
    parts: (H) => [
      [P.rect(30, 24), 0, 6 * H, 'dormWall', 1],
      [P.rect(6, 8, 18, -4), 0, 7 * H, 'dormRed'],
      [P.rect(3, 24.4, -10, 0), 0, 6 * H + 1, 'dormRed'],
      [P.rect(9, 8, 4, 0), 6 * H, 3, 'white'],
    ],
  },
  // 第二餐廳（勇泉商場）：門口雨遮
  {
    no: 20,
    name: '第二餐廳（勇泉商場）',
    p: [1040, 260],
    rot: ROT,
    floors: 2,
    shopNote: '餐廳',
    parts: (H) => [
      [P.rect(18, 14), 0, 2 * H, 'cream', 1],
      [P.rect(20, 3, 0, 8.5), 3.4, 0.5, 'shopAwning'],
      [P.rect(19, 15), 2 * H, 0.6, 'white'],
    ],
  },
  // 7-ELEVEN 海大勇泉門市：游泳池東側的一層店面
  {
    no: 0,
    name: '7-ELEVEN 海大勇泉門市',
    p: [1165, 300],
    rot: ROT,
    floors: 1,
    shopNote: '便利商店',
    parts: (H) => [
      [P.rect(14, 10), 0, H, 'white'],
      [P.rect(14.4, 10.4), H, 0.5, 'white'],
      [P.rect(14.6, 0.6, 0, 5.3), 2.6, 0.5, 'shopAwning'],
      [P.rect(15, 3, 0, 6.6), 3.2, 0.3, 'white'],
    ],
  },
  {
    no: 15,
    name: '航管系館',
    p: [1117, 433],
    rot: ROT,
    floors: 5,
    parts: (H) => [
      [
        [
          [-13, -11],
          [13, -11],
          [13, 1],
          [1, 1],
          [1, 11],
          [-13, 11],
        ],
        0,
        5 * H,
        'cream',
        1,
      ],
    ],
    extra: (H) => {
      const r = gableRoof(26, 12, 4, LM_MAT.roof);
      r.position.set(0, 5 * H, -5);
      return [r];
    },
  },
  {
    no: 11,
    name: '商船系館',
    p: [1310, 515],
    rot: ROT,
    floors: 5,
    parts: (H) => [
      [P.rect(30, 20), 0, 5 * H, 'cream', 1],
      [P.rect(10, 4, 0, 12), 0, 5 * H + 2, 'cream'],
    ],
    extra: (H) => {
      const r = gableRoof(30, 20, 5, LM_MAT.roof);
      r.position.y = 5 * H;
      return [r];
    },
  },
  {
    no: 8,
    name: '機械B館、電算中心',
    p: [1522, 623],
    rot: ROT,
    floors: 5,
    parts: (H) => [
      [P.rect(36, 20), 0, 5 * H, 'cream', 1],
      [P.rect(6, 8, -21, 0), 0, 6 * H, 'rust'],
      [P.rect(14, 3, 6, 11.5), 0, 5 * H, 'glass'],
    ],
  },
  {
    no: 5,
    name: '綜合二館',
    p: [1872, 702],
    rot: ROT,
    floors: 6,
    shopNote: '旁有五南文化廣場（海洋書坊）書店',
    parts: (H) => [
      [P.rect(24, 30), 0, 4 * H, 'brown', 1],
      [P.rect(24, 20, 0, -5), 4 * H, 2 * H, 'brown', 1],
      [P.rect(8, 8, 0, -5), 6 * H, 3, 'white'],
    ],
  },
  {
    no: 38,
    name: '海事大樓乙棟',
    p: [1932, 392],
    rot: 0.95,
    floors: 5,
    // 依衛星圖：從人文大樓東北角往東北接到丙棟西端的長條連接棟，西側兩座樓梯間凸出
    parts: (H) => [
      [P.rect(64, 13), 0, 5 * H, 'white', 1],
      ...[-18, 14].map((x) => [P.rect(6, 5, x, 8.5), 0, 5 * H + 3, 'cream']),
    ],
  },
];

// 教務處館樓代碼（教室代碼開頭，例如 BOH201 = 人文大樓 2 樓）
const CODES = {
  1: 'ADM',
  2: 'ADM',
  3: 'LIB',
  4: 'GRC',
  5: 'GH2',
  8: 'MEB・CC3',
  9: 'MEA',
  10: 'STA',
  11: 'NAV',
  12: 'TEC',
  14: 'IVY',
  15: 'STM',
  17: 'SAH',
  18: 'SPF',
  22: 'SAC',
  23: 'GYM',
  24: 'SPF',
  25: 'SPF',
  26: 'ODB',
  30: 'FRB',
  31: 'GH3',
  34: 'BOH',
  38: 'MAF',
  39: 'MAF',
  41: 'MAF',
  45: 'GH1',
  46: 'OCE',
  47: 'FSB',
  48: 'SPF',
  49: 'FSH',
  50: 'CLS',
  51: 'MFE',
  53: 'MFS',
  56: 'HRE',
  58: 'HR1',
  60: 'NVA',
  61: 'CE-',
  62: 'EE1',
  63: 'EE2',
  64: 'INS',
  65: 'AAC',
  68: 'ECG',
  69: 'UAH',
  70: 'HR2',
};

// 其他建物（白模）：[編號, 名稱, x, y, 寬, 深, 樓層, 旋轉]
const BUILDINGS = [
  [6, '安庚書屋', 1850, 652, 14, 14, 2, ROT],
  [7, '郵局', 1672, 732, 10, 10, 1, ROT],
  [9, '機械A館', 1397, 573, 36, 20, 5, ROT],

  [13, '輪機實習工廠', 1250, 486, 24, 24, 3, ROT],
  [16, '勇泉', 1117, 323, 10, 10, 1, ROT],

  [69, '大型空蝕水槽實驗室', 200, 390, 30, 24, 3, ROT],
  [70, '河工二館', 216, 460, 30, 40, 4, ROT],
  [56, '海洋工程綜合實驗館', 338, 512, 70, 48, 3, ROT, 'gable'],
  [58, '河工一館', 478, 585, 26, 18, 4, ROT],
  [60, '造船系館', 552, 625, 24, 20, 6, ROT],
  [61, '工學院、第三餐廳', 622, 668, 18, 18, 5, ROT],
  [65, '水生動物實驗中心', 894, 850, 20, 14, 3, ROT],
  [66, '海洋生物培育館', 631, 887, 36, 30, 2, ROT],
  [67, '聲學實驗中心', 488, 825, 20, 20, 2, ROT],
  [30, '第一餐廳（夢泉商場）', 1847, 236, 30, 22, 2, -0.6],
  [31, '綜合三館', 1797, 402, 18, 18, 4, ROT],
  [41, '海事大樓丙棟', 2042, 384, 72, 15, 5, -0.64],
  [39, '海事大樓甲棟', 1952, 480, 64, 15, 5, -0.54],
  [42, '校史博物館', 2058, 520, 14, 14, 2, ROT_E],
  [43, '環態所館', 2140, 385, 12, 12, 3, ROT_E],
  [44, '養殖溫室', 2142, 520, 24, 20, 2, ROT_E],
  [45, '綜合一館', 2294, 429, 36, 30, 5, ROT_E],
  [46, '海洋系館', 2227, 532, 40, 18, 4, ROT_E],
  [47, '食安所館', 2187, 605, 16, 16, 3, ROT_E],
  [49, '漁學館', 2462, 445, 30, 30, 5, -0.3],
  [50, '生命科學院館', 2388, 626, 30, 60, 6, -0.3],
  [51, '食品工程館', 2274, 751, 40, 20, 4, ROT_E],
  [53, '食品科學系館', 2140, 731, 30, 18, 4, ROT_E],
  [52, '陸生動物實驗中心', 2254, 793, 12, 12, 2, ROT_E],
  [26, '海洋夢想基地', 1725, 975, 12, 22, 3, -0.2],
  [27, '小艇碼頭', 1730, 1045, 20, 20, 1, -0.2],
];

// 平坦場地：[編號, 名稱, x, y, 寬, 深, 旋轉, 顏色, 是否活動場地]
const FIELDS = [
  [37, '海大農場', 2100, 329, 40, 28, ROT_E, 0xcfe3c9, false],
  [0, '空地草坪（X 型廣場）', 1540, 515, 80, 56, ROT, 0xd7e8d0, false],
  [29, '射箭場', 1720, 300, 16, 50, -0.2, 0xd7e8d0, false],
];

// ---------- 場景 ----------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
labelRenderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8edee);
scene.fog = new THREE.Fog(0xe8edee, 1100, 2400);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 1, 4000);
const HOME = { pos: new THREE.Vector3(-40, 360, 680), target: new THREE.Vector3(10, 0, -20) };
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.zoomToCursor = true; // 滾輪往游標所在處縮放
controls.screenSpacePanning = false; // 平移貼著地面走
// 方向鍵與 WASD 移動：自己追蹤按住的鍵、每一幀平滑移動，避免系統連發延遲造成的卡頓
const held = new Set();
const KEYMAP = {
  ArrowUp: 'f',
  KeyW: 'f',
  ArrowDown: 'b',
  KeyS: 'b',
  ArrowLeft: 'l',
  KeyA: 'l',
  ArrowRight: 'r',
  KeyD: 'r',
};
window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (!k || e.target.closest?.('input, textarea')) return;
  held.add(k);
  e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) held.delete(k);
});
window.addEventListener('blur', () => held.clear());
const moveVel = new THREE.Vector3();
controls.maxPolarAngle = Math.PI * 0.46;
controls.minDistance = 60;
controls.maxDistance = 1500;

scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c4c6, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-300, 500, 250);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, {
  left: -1000,
  right: 1000,
  top: 900,
  bottom: -900,
  near: 10,
  far: 2000,
});
sun.shadow.bias = -0.0004;
scene.add(sun);

const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
    ...extra,
  });
const WHITE = mat(0xf6f3ee);
const ROOF = mat(0xe9e5de);
const EDGE = new THREE.LineBasicMaterial({ color: 0xb9bfc0, transparent: true, opacity: 0.6 });
const VENUE_COLOR = 0xd9653b;
// 依 3D 導覽與空拍圖，少數建物加上淡淡的外牆色（米黃、磚紅、深褐），其餘維持白模
const TINTS = {
  cream: [8, 9, 11, 13, 14, 15, 17, 3, 31, 62, 63, 64, 68],
  brick: [46, 50, 51, 49, 30],
  brown: [5, 12],
  // 依手繪校園圖：西側工學院一排米褐色、水生紅磚、海洋生物培育館深灰
  tan: [56, 58, 60, 61, 69, 70],
  redBrick: [65],
  dark: [66],
};
const TINT_COLOR = {
  cream: 0xf1e6c8,
  brick: 0xd9ab98,
  brown: 0xb89a88,
  tan: 0xeccb8e,
  redBrick: 0xc0564a,
  dark: 0x6f7479,
};
const ROOF_TINT = { 56: 0xb9434c };
const WIN_MAT = mat(0x7f98a6, { roughness: 0.4, metalness: 0.2 });
const TINT_MAT = {};
const tintFor = (no) => {
  for (const [k, list] of Object.entries(TINTS))
    if (list.includes(no)) return (TINT_MAT[k] ||= mat(TINT_COLOR[k]));
  return null;
};
const VENUE_TOP = mat(0xf2b79c);
const VENUE_ROOF = mat(0xe8c3b0);
const LM_MAT = {
  white: WHITE,
  venueTop: VENUE_TOP,
  cream: mat(0xf1e6c8),
  brown: mat(0xb89a88),
  rust: mat(0xc0754f),
  grey: mat(0xc6cacc),
  glass: mat(0xbcd6dd),
  gold: mat(0xe5c35c),
  roof: mat(0xd9b8a8),
  band: mat(0xfbfaf7),
  dormWall: mat(0xf0e2b8),
  dormRed: mat(0xc0583e),
  shopAwning: mat(0x3f9a8c),
  templeWall: mat(0xc9483a),
  templeRoof: mat(0xe0a03c),
  tan: mat(0xe8c48c),
  podium: mat(0xcfa09a),
  blueTile: mat(0x5f7fb8),
  brick: mat(0xa9533e),
  libDoor: mat(0xe8742c),
};

// 依平面形狀擠出量體
function prism(poly, h, material) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  addEdges(m);
  return m;
}
function part(poly, y0, h, key) {
  const m = prism(poly, h, LM_MAT[key] || key);
  m.position.y = y0;
  return m;
}
const bbox = (poly) => {
  const xs = poly.map((q) => q[0]),
    zs = poly.map((q) => q[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
};
// 樓板外緣略為外擴
const padPoly = (poly, pad) => {
  const b = bbox(poly),
    cx = (b.x0 + b.x1) / 2,
    cz = (b.z0 + b.z1) / 2;
  const sx = (b.x1 - b.x0 + pad) / (b.x1 - b.x0),
    sz = (b.z1 - b.z0 + pad) / (b.z1 - b.z0);
  return poly.map(([x, z]) => [cx + (x - cx) * sx, cz + (z - cz) * sz]);
};

// 海面
const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), mat(0x9cc3cc));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -3;
sea.receiveShadow = true;
scene.add(sea);

// 陸地（依平面圖海岸線概略描出）
const LAND = [
  [60, 330],
  [200, -500],
  [2900, -500],
  [2900, 1300],
  [2800, 1300],
  [1980, 1250],
  [1900, 935],
  [1780, 930],
  [1560, 915],
  [1100, 930],
  [700, 960],
  [450, 950],
  [250, 820],
  [110, 560],
];
const landShape = new THREE.Shape(
  LAND.map(([x, y]) => {
    const [wx, wz] = toWorld(x, y);
    return new THREE.Vector2(wx, -wz);
  }),
);
const land = new THREE.Mesh(
  new THREE.ExtrudeGeometry(landShape, { depth: 3, bevelEnabled: false }),
  mat(0xf4f1ea),
);
land.rotation.x = -Math.PI / 2;
land.position.y = -3;
land.receiveShadow = true;
scene.add(land);

// 碼頭
const pierShape = new THREE.Shape(
  [
    [1690, 920],
    [1760, 920],
    [1770, 1080],
    [1690, 1080],
  ].map(([x, y]) => {
    const [wx, wz] = toWorld(x, y);
    return new THREE.Vector2(wx, -wz);
  }),
);
const pier = new THREE.Mesh(
  new THREE.ExtrudeGeometry(pierShape, { depth: 2, bevelEnabled: false }),
  mat(0xeeeae2),
);
pier.rotation.x = -Math.PI / 2;
pier.position.y = -3;
pier.receiveShadow = true;
scene.add(pier);

// 北寧路（依平面圖，沿海岸由西北往東南再轉平）
// 道路與步道：記下每條的頂點，編輯模式可拖曳頂點重畫
const ROADS = [];
function ribbonGeom(points, width, y) {
  // 轉角用斜接：每個頂點只算一組左右邊點，相鄰兩段共用，路面連續不會在轉角斷開
  const pts = points.map(([x, h]) => toWorld(x, h));
  const n = pts.length,
    half = width / 2;
  const L = [],
    R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[i],
      c = pts[Math.min(n - 1, i + 1)];
    let d1x = b[0] - a[0],
      d1z = b[1] - a[1],
      d2x = c[0] - b[0],
      d2z = c[1] - b[1];
    const l1 = Math.hypot(d1x, d1z) || 1,
      l2 = Math.hypot(d2x, d2z) || 1;
    d1x /= l1;
    d1z /= l1;
    d2x /= l2;
    d2z /= l2;
    if (i === 0) {
      d1x = d2x;
      d1z = d2z;
    }
    if (i === n - 1) {
      d2x = d1x;
      d2z = d1z;
    }
    let nx = -(d1z + d2z),
      nz = d1x + d2x;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    const cos = Math.max(0.35, nx * -d1z + nz * d1x); // 與段法線夾角，限制尖角長度
    const m = half / cos;
    L.push([b[0] + nx * m, b[1] + nz * m]);
    R.push([b[0] - nx * m, b[1] - nz * m]);
  }
  const pos = [];
  for (let i = 0; i < n - 1; i++) {
    const a1 = L[i],
      a2 = R[i],
      b1 = L[i + 1],
      b2 = R[i + 1];
    pos.push(
      a1[0],
      y,
      a1[1],
      b1[0],
      y,
      b1[1],
      a2[0],
      y,
      a2[1],
      a2[0],
      y,
      a2[1],
      b1[0],
      y,
      b1[1],
      b2[0],
      y,
      b2[1],
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function ribbon(points, width, color, y = 0.15, name = '') {
  const m = new THREE.Mesh(ribbonGeom(points, width, y), mat(color, { side: THREE.DoubleSide }));
  m.receiveShadow = true;
  scene.add(m);
  // 同一組頂點（例如路面加中線）視為同一條路，一起編輯
  const key = JSON.stringify(points);
  let road = ROADS.find((r) => r.key === key);
  if (!road) {
    road = {
      key,
      name: name || `道路 ${ROADS.length + 1}`,
      points: points.map((q) => [...q]),
      layers: [],
    };
    ROADS.push(road);
  } else if (name) road.name = name;
  road.layers.push({ mesh: m, width, y });
  return m;
}
const NINGLU = [
  [150, 440],
  [400, 500],
  [600, 577],
  [896, 704],
  [1125, 810],
  [1412, 883],
  [1725, 915],
  [2025, 897],
  [2250, 882],
  [2550, 840],
  [2900, 800],
];
ribbon(NINGLU, 18, 0xc9cbcb, 0.15, '北寧路');
ribbon(NINGLU, 0.8, 0xe2b93b, 0.3);
// 校內道路（依平面圖與館樓代碼配置圖，避開建物）
// 濱海校門往北經圖書館西側到夢泉
// 以下人文、海事、夢泉一帶道路依衛星圖描線（圖書館、涼亭、射箭場、第一宿舍、環態所五點對齊）
ribbon(
  [
    [1680, 735],
    [1720, 640],
    [1752, 575],
    [1790, 535],
    [1789, 496],
    [1778, 450],
  ],
  8,
  0xd6d7d6,
  0.15,
  '校門主幹道（校門－山腳道路）',
);
// 人文大樓與圖書館之間往東，接海事大樓一帶
// 圖書館北側往東的直路（2016 空拍：兩側停車，靠山側草坪與棕櫚樹）
ribbon(
  [
    [1790, 535],
    [1806, 537],
    [1834, 549],
    [1862, 564],
    [1903, 583],
    [1949, 605],
    [2080, 650],
    [2250, 690],
    [2400, 710],
    [2470, 840],
  ],
  8,
  0xd6d7d6,
  0.15,
  '圖書館北側往東道路',
);
// 海事甲棟北側、往綜合一館的小路
ribbon(
  [
    [1995, 520],
    [2016, 508],
    [2043, 517],
    [2078, 536],
    [2127, 561],
    [2175, 574],
    [2216, 578],
  ],
  6,
  0xd6d7d6,
  0.15,
  '海事甲棟旁小路',
);
// 夢泉往東：沿海事丙棟北側往東南到綜合一館、海洋系館
ribbon(
  [
    [1907, 331],
    [1946, 320],
    [1987, 327],
    [2022, 339],
    [2057, 358],
    [2092, 380],
    [2127, 406],
    [2155, 432],
    [2176, 451],
    [2201, 469],
    [2290, 470],
    [2350, 380],
    [2480, 380],
  ],
  7,
  0xd6d7d6,
  0.15,
  '夢泉往東道路',
);
// 夢泉往西北上坡：經第一餐廳（鐵板館）到射箭場
ribbon(
  [
    [1907, 331],
    [1878, 315],
    [1850, 299],
    [1821, 274],
    [1800, 251],
    [1782, 232],
    [1760, 190],
  ],
  7,
  0xd6d7d6,
  0.15,
  '夢泉往射箭場道路',
);
// 舊北寧路（汽機車停車場）：系館一排與運動場之間
ribbon(
  [
    [780, 470],
    [945, 532],
    [1200, 575],
    [1500, 692],
    [1650, 735],
    [1680, 740],
  ],
  15,
  0xd6d7d6,
  0.15,
  '舊北寧路',
);
ribbon(
  [
    [780, 470],
    [945, 532],
    [1200, 575],
    [1500, 692],
    [1650, 735],
    [1680, 740],
  ],
  9,
  0xcbcdcd,
  0.2,
);
// 山腳道路（依 2016 空拍）：校門主幹道在海洋廳北側分岔，沿 X 型廣場靠山一側、遮雨走廊外側往西北到育樂館、延平技術大樓；兩側停車
ribbon(
  [
    [1111, 290],
    [1428, 386],
    [1500, 396],
    [1600, 412],
    [1660, 450],
    [1688, 458],
    [1734, 454],
    [1778, 450],
    [1808, 433],
    [1838, 412],
    [1868, 396],
    [1891, 377],
    [1903, 355],
    [1907, 331],
  ],
  10,
  0xd6d7d6,
  0.15,
  '山腳道路（育樂館－夢泉）',
);
// 體育館四周都是路（依衛星圖）：南側北寧路、北側舊北寧路，西側與學活之間一條小路貫通兩者；
// 舊北寧路在體育館北側正中有小圓環，往北上坡接宿舍區、游泳池
ribbon(
  [
    [848, 684],
    [880, 598],
    [910, 518],
  ],
  7,
  0xd6d7d6,
  0.15,
  '學活與體育館間小路',
);
// 往宿舍是上坡（依衛星圖）：從圓環往北，貼著海空大樓、游泳池西側上去，繞到第四宿舍後方再接第三宿舍、二餐
ribbon(
  [
    [960, 532],
    [958, 470],
    [945, 410],
    [925, 350],
    [912, 285],
    [912, 220],
    [930, 172],
    [972, 155],
    [1012, 160],
  ],
  7,
  0xd6d7d6,
  0.15,
  '體育館北側往宿舍道路（上坡）',
);
// 海空大樓與航管系館之間的小側門，小路往南穿過舊北寧路（斑馬線）到體育館
ribbon(
  [
    [1066, 450],
    [1064, 505],
    [1062, 534],
  ],
  3,
  0xece6da,
  0.6,
  '海空－航管側門小路',
);
ribbon(
  [
    [1057, 569],
    [1046, 580],
    [1030, 588],
  ],
  3,
  0xece6da,
  0.6,
  '側門小路（體育館端）',
);

// ---------- 建物 ----------
const pickables = [];
const allLabels = [];

function addEdges(mesh) {
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), EDGE);
  mesh.add(e);
}

function placeGroup(group, p, rot) {
  const [x, z] = toWorld(p[0], p[1]);
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  scene.add(group);
}

function makeLabel(text, cls, onClick) {
  const el = document.createElement('div');
  el.className = 'tag ' + cls;
  el.textContent = text;
  if (onClick)
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick();
    });
  return new CSS2DObject(el);
}

function gableRoof(w, d, h, material) {
  const s = new THREE.Shape([
    new THREE.Vector2(-d / 2, 0),
    new THREE.Vector2(d / 2, 0),
    new THREE.Vector2(0, h),
  ]);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  addEdges(m);
  return m;
}

function archRoof(w, d, h, material) {
  // 半橢圓斷面沿寬度方向擠出（拱頂朝上）
  const s = new THREE.Shape(
    Array.from({ length: 25 }, (_, i) => {
      const a = Math.PI - (Math.PI * i) / 24;
      return new THREE.Vector2((Math.cos(a) * d) / 2, Math.sin(a) * h);
    }),
  );
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  addEdges(m);
  return m;
}

// 一般建物：方塊加上樓層腰帶、樓梯間、屋頂機房，依編號變化位置，讓每棟不至於一模一樣
const CORE_MAT = mat(0xe3dccf);
for (const [no, name, x, y, w, d, floors, rot, roof] of BUILDINGS) {
  const group = new THREE.Group();
  const h = floors * FLOOR_H;
  const bodyMat = tintFor(no) || WHITE;
  const meshes = [part(P.rect(w, d), 0, h, bodyMat)];
  if (floors >= 3) {
    for (let k = 1; k < floors; k++)
      meshes.push(part(padPoly(P.rect(w, d), 0.7), k * FLOOR_H - 0.2, 0.4, 'band'));
    const side = no % 2 ? 1 : -1;
    // 端部樓梯間（長條建物在北側多加兩座）
    meshes.push(
      part(
        P.rect(4.5, Math.min(9, d * 0.45), side * (w / 2 + 2.2), ((no % 3) - 1) * d * 0.2),
        0,
        h + 3,
        CORE_MAT,
      ),
    );
    if (w >= 50)
      for (const fx of [-w / 3, w / 3])
        meshes.push(part(P.rect(6, 4, fx, -d / 2 - 2), 0, h + 2, CORE_MAT));
    if (roof !== 'gable') {
      meshes.push(
        part(
          P.rect(Math.min(10, w * 0.35), Math.min(8, d * 0.35), -side * w * 0.18, 0),
          h,
          3,
          'white',
        ),
      );
      meshes.push(part(padPoly(P.rect(w, d), 0.8), h, 1, bodyMat)); // 女兒牆
    }
  } else {
    // 低矮建物：屋簷外伸
    meshes.push(part(padPoly(P.rect(w, d), 2.4), h, 0.5, 'white'));
  }
  if (roof === 'gable') {
    const r = gableRoof(w, d, 10, mat(ROOF_TINT[no] || 0xe7d9d2));
    r.position.y = h;
    meshes.push(r);
  }
  // 每層窗帶：長邊整排、短邊較窄
  if (floors >= 2) {
    for (let k = 0; k < floors; k++) {
      const y = k * FLOOR_H + 1.9;
      for (const sz of [-1, 1]) {
        const a = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 1.3, 0.12), WIN_MAT);
        a.position.set(0, y, sz * (d / 2 + 0.06));
        meshes.push(a);
        if (d >= 12) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, d * 0.6), WIN_MAT);
          b.position.set(sz * (w / 2 + 0.06), y, 0);
          meshes.push(b);
        }
      }
    }
  }
  group.add(...meshes);
  const info = { no, name, floorCount: floors, venue: false, group, body: meshes[0] };
  for (const m of meshes) {
    m.userData.info = info;
    pickables.push(m);
  }
  const label = makeLabel(name, 'hidden', () => select(info));
  label.position.set(0, h + (roof ? 12 : 6), 0);
  group.add(label);
  info.label = label;
  allLabels.push(label);
  placeGroup(group, [x, y], rot);
}

// 重點地標
for (const lm of LANDMARKS) {
  const group = new THREE.Group();
  const meshes = [];
  for (const [poly, y0, h, key, bands] of lm.parts(FLOOR_H)) {
    meshes.push(part(poly, y0, h, key));
    // 樓層腰帶：每層一圈淡色樓板線，讓高樓看得出層數
    if (bands)
      for (let k = 1; k * FLOOR_H < h - 0.5; k++)
        meshes.push(part(padPoly(poly, 0.7), y0 + k * FLOOR_H - 0.2, 0.4, 'band'));
  }
  if (lm.extra) meshes.push(...lm.extra(FLOOR_H));
  group.add(...meshes);
  const info = {
    no: lm.no,
    name: lm.name,
    floorCount: lm.floors,
    venue: false,
    group,
    body: meshes[0],
  };
  if (lm.dorm)
    Object.assign(info, { always: true, badge: '宿舍', badgeCls: 'dorm', note: lm.dormNote || '' });
  if (lm.shopNote) info.note = lm.shopNote;
  for (const m of meshes) {
    m.userData.info = info;
    pickables.push(m);
  }
  const top = new THREE.Box3().setFromObject(group).max.y;
  const label = makeLabel(lm.tag || lm.name, lm.dorm ? 'dorm' : 'hidden', () => select(info));
  label.position.set(0, top + 3, 0);
  group.add(label);
  info.label = label;
  if (!lm.dorm) allLabels.push(label);
  placeGroup(group, lm.p, lm.rot);
}

// 平坦場地
for (const [no, name, x, y, w, d, rot, color, isVenue] of FIELDS) {
  const group = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), mat(color));
  m.position.y = 0.3;
  m.receiveShadow = true;
  group.add(m);
  if (no) {
    const info = { no, name, floorCount: 0, venue: isVenue, group, body: m };
    m.userData.info = info;
    pickables.push(m);
    const label = makeLabel(name, isVenue ? 'venue' : 'hidden', () => select(info));
    label.position.set(0, 3, 0);
    group.add(label);
    info.label = label;
    if (!isVenue) allLabels.push(label);
  }
  placeGroup(group, [x, y], rot);
}

// 空地草坪的 X 型步道與外圈步道（育樂館前）
{
  const g = new THREE.Group();
  const W = 80,
    D = 56,
    paveMat = mat(0xece6da);
  const len = Math.hypot(W, D),
    ang = Math.atan2(D, W);
  for (const sgn of [1, -1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 3.2), paveMat);
    m.rotation.y = sgn * ang;
    m.position.y = 0.75;
    m.receiveShadow = true;
    g.add(m);
  }
  for (const [w, d, x, z] of [
    [W, 2.4, 0, -D / 2],
    [W, 2.4, 0, D / 2],
    [2.4, D, -W / 2, 0],
    [2.4, D, W / 2, 0],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), paveMat);
    m.position.set(x, 0.75, z);
    m.receiveShadow = true;
    g.add(m);
  }
  const c = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.5, 24), paveMat);
  c.position.y = 0.8;
  g.add(c);
  placeGroup(g, [1540, 515], ROT);
}

// 遮雨走廊：屋頂板＋兩側細柱，沿平面圖座標折線
function canopy(points, name, width = 4, height = 3.4) {
  const group = new THREE.Group();
  const roofMat = mat(0xd8dde0),
    postMat = mat(0xb9c0c4);
  const pts = points.map(([x, y]) => toWorld(x, y));
  const meshes = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i],
      [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az),
      a = Math.atan2(-(bz - az), bx - ax);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(L + width, 0.5, width), roofMat);
    roof.position.set((ax + bx) / 2, height, (az + bz) / 2);
    roof.rotation.y = a;
    roof.castShadow = true;
    addEdges(roof);
    meshes.push(roof);
    for (let t = 0; t <= L; t += 7) {
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, height, 0.35), postMat);
        const px = ax + ((bx - ax) * t) / L + Math.sin(a) * side * (width / 2 - 0.3);
        const pz = az + ((bz - az) * t) / L + Math.cos(a) * side * (width / 2 - 0.3);
        post.position.set(px, height / 2, pz);
        meshes.push(post);
      }
    }
  }
  group.add(...meshes);
  const info = { no: 0, name, floorCount: 0, venue: false, group, body: meshes[0] };
  for (const m of meshes) {
    m.userData.info = info;
    pickables.push(m);
  }
  const mid = pts[Math.floor(pts.length / 2)];
  const label = makeLabel(name, 'hidden', () => select(info));
  label.position.set(mid[0], height + 3, mid[1]);
  group.add(label);
  info.label = label;
  allLabels.push(label);
  scene.add(group);
}
// 海洋廳沿 X 型廣場北緣往西接育樂館；行政大樓北端沿廣場南緣接機械 A 館
canopy(
  [
    [1655, 498],
    [1560, 452],
    [1455, 440],
  ],
  '遮雨走廊',
);
canopy(
  [
    [1622, 582],
    [1530, 572],
    [1440, 558],
  ],
  '遮雨走廊（南側）',
);
// 山海迴廊：ㄇ字形，圖書館往北接人文大樓，再沿人文南側往西跨主幹道，轉下接海洋廳（依空拍）
canopy(
  [
    [1816, 576],
    [1820, 505],
    [1852, 500],
  ],
  '山海迴廊（圖書館－人文）',
  5,
  5,
);
canopy(
  [
    [1820, 505],
    [1786, 505],
    [1752, 505],
  ],
  '山海迴廊',
  5,
  5,
);
canopy(
  [
    [1752, 505],
    [1738, 512],
    [1724, 520],
  ],
  '山海迴廊（海洋廳）',
  5,
  5,
);

// 地面標線：segs 為本地座標 [[x1, z1], [x2, z2]] 線段
const LINE_MAT = new THREE.LineBasicMaterial({ color: 0xffffff });
function groundLines(segs, y = 0.8, material = LINE_MAT) {
  const pos = [];
  for (const [[x1, z1], [x2, z2]] of segs) pos.push(x1, y, z1, x2, y, z2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(g, material);
}
const arcSegs = (cx, cz, r, a0, a1, n = 24) => {
  const pts = P.arc(cx, cz, r, a0, a1, n);
  return pts.slice(1).map((q, i) => [pts[i], q]);
};
const rectSegs = (w, d, cx = 0, cz = 0) => {
  const q = P.rect(w, d, cx, cz);
  return q.map((v, i) => [v, q[(i + 1) % 4]]);
};

// 運動場（24）
{
  const group = new THREE.Group();
  const outer = new THREE.Shape();
  const L = 92,
    R = 42,
    r = 30;
  outer.absarc(L / 2, 0, R, -Math.PI / 2, Math.PI / 2, false);
  outer.absarc(-L / 2, 0, R, Math.PI / 2, (Math.PI * 3) / 2, false);
  const track = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outer, { depth: 0.5, bevelEnabled: false }),
    mat(0xd98c74),
  );
  track.rotation.x = -Math.PI / 2;
  track.receiveShadow = true;
  const inner = new THREE.Shape();
  inner.absarc(L / 2, 0, r, -Math.PI / 2, Math.PI / 2, false);
  inner.absarc(-L / 2, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  const grass = new THREE.Mesh(
    new THREE.ExtrudeGeometry(inner, { depth: 0.7, bevelEnabled: false }),
    mat(0xbcd8b0),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  group.add(track, grass);
  // 分道線：跑道八道
  const lane = [];
  for (let k = 0; k <= 8; k++) {
    const rr = r + 0.6 + k * 1.3;
    lane.push(
      ...arcSegs(L / 2, 0, rr, -Math.PI / 2, Math.PI / 2, 20),
      ...arcSegs(-L / 2, 0, rr, Math.PI / 2, Math.PI * 1.5, 20),
      [
        [-L / 2, -rr],
        [L / 2, -rr],
      ],
      [
        [-L / 2, rr],
        [L / 2, rr],
      ],
    );
  }
  group.add(groundLines(lane, 0.6, new THREE.LineBasicMaterial({ color: 0xf6e3dc })));
  // 足球場：外框、中線、中圈、禁區、球門區
  const FW = 104,
    FD = 56;
  const pitch = [
    ...rectSegs(FW, FD),
    [
      [0, -FD / 2],
      [0, FD / 2],
    ],
    ...arcSegs(0, 0, 9.15, 0, Math.PI * 2, 32),
  ];
  for (const sgn of [-1, 1]) {
    pitch.push(
      ...rectSegs(16.5, 40.3, sgn * (FW / 2 - 8.25), 0),
      ...rectSegs(5.5, 18.3, sgn * (FW / 2 - 2.75), 0),
    );
    // 球門
    const goal = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2.4, 7.3),
      new THREE.MeshStandardMaterial({ color: 0xffffff, wireframe: true }),
    );
    goal.position.set(sgn * (FW / 2 + 1), 1.9, 0);
    group.add(goal);
  }
  group.add(groundLines(pitch, 0.85));
  const info = { no: 24, name: '運動場', floorCount: 0, venue: true, group, body: track };
  track.userData.info = info;
  grass.userData.info = info;
  pickables.push(track, grass);
  const label = makeLabel('運動場', 'venue', () => select(info));
  label.position.set(0, 3, 0);
  group.add(label);
  info.label = label;
  placeGroup(group, [1152, 690], -0.42);
}

// 籃球場（25）：2×2 共四面，紅色分隔帶，含標線與籃架
{
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(48, 0.6, 72), mat(0xb9776c));
  base.position.y = 0.3;
  base.receiveShadow = true;
  group.add(base);
  const meshes = [base];
  const segs = [];
  const hoopMat = mat(0xf2f2f2);
  const COURTS = [
    [-11, -17],
    [11, -17],
    [-11, 17],
    [11, 17],
  ];
  COURTS.forEach(([cx, cz], i) => {
    const court = new THREE.Mesh(
      new THREE.BoxGeometry(17, 0.2, 30),
      mat(i === 1 || i === 2 ? 0x6f86c2 : 0x7b93c9),
    );
    court.position.set(cx, 0.65, cz);
    court.receiveShadow = true;
    group.add(court);
    meshes.push(court);
    segs.push(
      ...rectSegs(15, 28, cx, cz),
      [
        [cx - 7.5, cz],
        [cx + 7.5, cz],
      ],
      ...arcSegs(cx, cz, 1.8, 0, Math.PI * 2, 20),
    );
    for (const sgn of [-1, 1]) {
      const zb = cz + sgn * 14;
      segs.push(
        ...rectSegs(4.9, 5.8, cx, zb - sgn * 2.9),
        ...arcSegs(
          cx,
          zb - sgn * 1.6,
          6.75,
          sgn > 0 ? Math.PI : 0,
          sgn > 0 ? Math.PI * 2 : Math.PI,
          20,
        ),
      );
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 0.3), hoopMat);
      pole.position.set(cx, 1.6, zb + sgn * 1.2);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.1), hoopMat);
      board.position.set(cx, 3.4, zb + sgn * 0.6);
      pole.castShadow = board.castShadow = true;
      group.add(pole, board);
    }
  });
  group.add(groundLines(segs, 0.8));
  // 外圍圍網
  const fence = new THREE.Mesh(
    new THREE.BoxGeometry(48, 4, 72),
    new THREE.MeshStandardMaterial({
      color: 0x6b7a72,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    }),
  );
  fence.position.y = 2.6;
  group.add(fence);
  const info = { no: 25, name: '籃球場', floorCount: 0, venue: true, group, body: base };
  for (const m of meshes) {
    m.userData.info = info;
    pickables.push(m);
  }
  const label = makeLabel('籃球場（四面）', 'venue', () => select(info));
  label.position.set(0, 5, 0);
  group.add(label);
  info.label = label;
  placeGroup(group, [1400, 776], -0.3); // 長邊垂直北寧路（依空拍）
}

// 籃球場與濱海校門之間的空地：裝置藝術草坪（彎曲步道、雕塑）、看板
function namedThing(name, group, meshes) {
  const info = { no: 0, name, floorCount: 0, venue: false, group, body: meshes[0] };
  for (const m of meshes) {
    m.userData.info = info;
    pickables.push(m);
  }
  const label = makeLabel(name, 'hidden', () => select(info));
  const box = new THREE.Box3().setFromObject(group);
  label.position.set(0, box.max.y - group.position.y + 3, 0);
  group.add(label);
  info.label = label;
  allLabels.push(label);
  return info;
}
// 濱海校門口（依 2016 空拍俯視）：主車道中央種棕櫚樹的安全島、北寧路斑馬線、車道東側機車停車場
function palm(x, z, h = 7) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, h, 6), mat(0x8a6a4a));
  trunk.position.set(x, h / 2, z);
  trunk.castShadow = true;
  const crown = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 5), mat(0x5f9a5a));
  crown.scale.set(1, 0.45, 1);
  crown.position.set(x, h + 0.4, z);
  crown.castShadow = true;
  return [trunk, crown];
}
{
  const g = new THREE.Group();
  const curb = part(P.rect(3.6, 22), 0, 0.5, mat(0xc9c4b8));
  const soil = part(P.rect(2.8, 21.2), 0.5, 0.1, mat(0x9cc28f));
  const trees = [-8, -2.7, 2.7, 8].flatMap((z) => palm(0, z, 6 + Math.abs(z) * 0.1));
  g.add(curb, soil, ...trees);
  placeGroup(g, [1692, 868], 0.04);
  namedThing('校門安全島（棕櫚樹）', g, [curb, soil, ...trees]);
}
{
  const g = new THREE.Group();
  const bars = [];
  for (let z = -8; z <= 8.01; z += 1.2) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.6), mat(0xffffff));
    b.position.set(0, 0.36, z);
    bars.push(b);
  }
  g.add(...bars);
  placeGroup(g, [1662, 908], -0.1);
  namedThing('斑馬線（濱海校門）', g, bars);
}
// 側門斑馬線：跨舊北寧路，連接海空－航管側門與體育館
{
  const g = new THREE.Group();
  const bars = [];
  for (let z = -7.6; z <= 7.61; z += 1.2) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.6), mat(0xffffff));
    b.position.set(0, 0.3, z);
    bars.push(b);
  }
  g.add(...bars);
  placeGroup(g, [1060, 552], -0.167);
  namedThing('斑馬線（側門－體育館）', g, bars);
}
// 地下道：穿越北寧路。路面以深灰虛帶示意地下通道，兩端是有玻璃雨棚的下行樓梯口
function underpassEntrance(name, at, toward, colors) {
  const [ax, az] = toWorld(...at),
    [bx, bz] = toWorld(...toward);
  const g = new THREE.Group();
  const ms = [];
  const wall = mat(0xbfb8ab);
  for (const x of [-2.2, 2.2]) ms.push(part(P.rect(0.4, 7, x, 0), 0, 1.1, wall));
  ms.push(part(P.rect(4, 7, 0, 0), 0, 0.05, mat(0x4a4f55)));
  const cs = colors || [0xa9c9d6];
  for (let k = 0; k < 4; k++) {
    const c = cs[k % cs.length];
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.12, 1.9),
      new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.65 }),
    );
    pane.position.set(0, 3.4 - k * 0.35, -2.85 + k * 1.9);
    pane.rotation.x = -0.18;
    pane.castShadow = true;
    ms.push(pane);
  }
  for (const x of [-2.4, 2.4])
    for (const z of [-3.2, 3.2])
      ms.push(part(P.circle(x, z, 0.12, 6), 0, z < 0 ? 3.4 : 2.4, WHITE));
  g.add(...ms);
  g.position.set(ax, 0, az);
  g.rotation.y = Math.atan2(bx - ax, bz - az) + Math.PI;
  scene.add(g);
  namedThing(name, g, ms);
}
ribbon(
  [
    [884, 654],
    [893, 700],
    [903, 730],
  ],
  3.5,
  0x6b7076,
  0.34,
  '地下道（學活－電資）',
);
underpassEntrance('地下道口（電資側）', [906, 738], [895, 700]);
ribbon(
  [
    [652, 570],
    [656, 598],
    [661, 628],
  ],
  3.5,
  0x6b7076,
  0.34,
  '地下道（工學院、第三餐廳）',
);
underpassEntrance('地下道口（北寧路北側）', [651, 563], [656, 598]);
underpassEntrance('地下道口（工學院側）', [662, 635], [656, 598]);
// 海空大樓與航管系館之間的小側門
{
  const g = new THREE.Group();
  const gm = mat(0x9a9488);
  const ps = [-2.4, 2.4].map((x) => {
    const m = part(P.rect(0.8, 0.8, x, 0), 0, 2.6, gm);
    return m;
  });
  const top = part(P.rect(5.6, 0.6), 2.6, 0.35, gm);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1.8, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x5c6670, transparent: true, opacity: 0.55 }),
  );
  door.position.set(0, 1, 0);
  g.add(...ps, top, door);
  placeGroup(g, [1064, 505], -0.36);
  namedThing('小側門（海空－航管）', g, [...ps, top, door]);
}
{
  const g = new THREE.Group();
  const W = 24,
    D = 15;
  const pad = part(P.rect(W, D), 0, 0.3, mat(0xc4c6c6));
  const segs = [];
  for (const z of [-D / 2 + 0.6, 0, D / 2 - 0.6])
    segs.push([
      [-W / 2 + 1, z],
      [W / 2 - 1, z],
    ]);
  const bikes = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [z0, dir] of [
    [-D / 2 + 0.6, 1],
    [0, -1],
    [0, 1],
    [D / 2 - 0.6, -1],
  ]) {
    for (let x = -W / 2 + 1.5; x < W / 2 - 1; x += 1.05) {
      segs.push([
        [x - 0.5, z0],
        [x - 0.5, z0 + dir * 2.2],
      ]);
      if (rnd() < 0.8) bikes.push([x, z0 + dir * 1.2]);
    }
  }
  const lines = groundLines(segs, 0.36, new THREE.LineBasicMaterial({ color: 0xffffff }));
  const bg = new THREE.BoxGeometry(0.6, 1.0, 1.8);
  bg.translate(0, 0.8, 0);
  const cols = [0xf2f2f2, 0x3a3f45, 0xc9473b, 0x5c8fc4, 0xe0c35a];
  const inst = new THREE.InstancedMesh(
    bg,
    new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }),
    bikes.length,
  );
  const m4 = new THREE.Matrix4(),
    c = new THREE.Color();
  bikes.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0, z);
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.setHex(cols[Math.floor(rnd() * cols.length)]));
  });
  inst.castShadow = true;
  g.add(pad, lines, inst);
  placeGroup(g, [1736, 790], -0.05);
  namedThing('機車停車場（濱海校門）', g, [pad]);
}
// 彩繪玻璃屋：利用圖書館南牆與綜合研究中心北牆，夾在兩棟之間加蓋的玻璃屋頂休閒空間（24 小時，18:00 後刷學生證）
{
  const PLAN = [
    [1757, 629],
    [1829, 656],
    [1812, 705],
    [1790, 693],
    [1769, 681],
    [1748, 676],
  ];
  const cx = PLAN.reduce((a, q) => a + q[0], 0) / PLAN.length,
    cy = PLAN.reduce((a, q) => a + q[1], 0) / PLAN.length;
  const [ox, oz] = toWorld(cx, cy);
  const loc = (q) => {
    const [x, z] = toWorld(q[0], q[1]);
    return [x - ox, z - oz];
  };
  const poly = PLAN.map(loc);
  const g = new THREE.Group();
  const H = 8;
  const floor = prism(poly, 0.4, mat(0xc9a27a));
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xa9d0de,
    transparent: true,
    opacity: 0.38,
    roughness: 0.1,
    depthWrite: false,
  });
  const shell = prism(poly, H, glassMat);
  shell.castShadow = false;
  const roof = prism(poly, 0.2, glassMat);
  roof.position.y = H;
  // 屋頂鋼構：從圖書館牆面拉到研究中心牆面的一道道橫樑
  const L0 = loc(PLAN[0]),
    L1 = loc(PLAN[1]),
    G0 = loc(PLAN[5]),
    G1 = loc(PLAN[2]);
  const segs = [];
  for (let t = 0; t <= 1.001; t += 0.08) {
    segs.push([
      [L0[0] + (L1[0] - L0[0]) * t, L0[1] + (L1[1] - L0[1]) * t],
      [G0[0] + (G1[0] - G0[0]) * t, G0[1] + (G1[1] - G0[1]) * t],
    ]);
  }
  segs.push([
    [(L0[0] + G0[0]) / 2, (L0[1] + G0[1]) / 2],
    [(L1[0] + G1[0]) / 2, (L1[1] + G1[1]) / 2],
  ]);
  const frame = groundLines(segs, H + 0.3, new THREE.LineBasicMaterial({ color: 0x4a5560 }));
  // 西側入口立面：藍、紫色彩繪玻璃
  const W0 = loc(PLAN[5]),
    W1 = loc(PLAN[0]);
  const panes = [];
  const n = 8;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 4; k++) {
      const t = (i + 0.5) / n;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 1.8, 2.6),
        mat((i + k) % 3 === 1 ? 0x7b55b5 : 0x4f86c6),
      );
      m.position.set(W0[0] + (W1[0] - W0[0]) * t - 0.4, 1.2 + k * 1.9, W0[1] + (W1[1] - W0[1]) * t);
      m.rotation.y = -Math.atan2(W1[1] - W0[1], W1[0] - W0[0]) + Math.PI / 2;
      panes.push(m);
    }
  g.add(floor, shell, roof, frame, ...panes);
  placeGroup(g, [cx, cy], 0);
  const info = namedThing('彩繪玻璃屋', g, [floor, shell, roof, ...panes]);
  info.note =
    '圖書館與綜合研究中心之間的休閒空間，24 小時開放（18:00 後刷學生證），空調 8:00～22:00';
}
// 壘球場（57）：外野草地、扇形紅土內野、菱形壘包、投手丘、白色界外線、本壘後擋網與兩側休息區
{
  const g = new THREE.Group();
  const W = 100,
    D = 62;
  const meshes = [];
  const grass = part(P.rect(W, D), 0, 0.5, mat(0x8fbf7a));
  meshes.push(grass);
  const HX = -W / 2 + 8,
    HZ = D / 2 - 8; // 本壘
  const dirt = mat(0xc98f62);
  const fan = [[HX - 3, HZ + 3], ...P.arc(HX, HZ, 34, 0.08, -Math.PI / 2 - 0.08, 20)];
  meshes.push(part(fan, 0.5, 0.12, dirt));
  const inGrass = [
    [HX + 4, HZ - 4],
    [HX + 23, HZ - 4],
    [HX + 23, HZ - 23],
    [HX + 4, HZ - 23],
  ];
  meshes.push(part(inGrass, 0.62, 0.05, mat(0x86b872)));
  meshes.push(part(P.circle(HX + 13.5, HZ - 13.5, 2.6, 16), 0.62, 0.35, dirt));
  for (const [bx, bz] of [
    [HX, HZ],
    [HX + 27, HZ],
    [HX + 27, HZ - 27],
    [HX, HZ - 27],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 1), WHITE);
    b.position.set(bx, 0.72, bz);
    b.rotation.y = Math.PI / 4;
    meshes.push(b);
  }
  const FR = 52; // 全壘打牆半徑
  const lines = groundLines(
    [
      [
        [HX, HZ],
        [HX + FR, HZ],
      ],
      [
        [HX, HZ],
        [HX, HZ - FR],
      ],
      [
        [HX, HZ],
        [HX + 27, HZ],
      ],
      [
        [HX + 27, HZ],
        [HX + 27, HZ - 27],
      ],
      [
        [HX + 27, HZ - 27],
        [HX, HZ - 27],
      ],
      [
        [HX, HZ - 27],
        [HX, HZ],
      ],
    ],
    0.66,
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  // 本壘後擋網（弧形），外野圍網
  const net = mat(0x6d7b80);
  for (const [x, z] of P.arc(HX, HZ, 7, Math.PI * 0.55, Math.PI * 0.95, 6))
    meshes.push(part(P.rect(0.4, 0.4, x, z), 0.5, 5, net));
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 4.6, 9),
    new THREE.MeshStandardMaterial({ color: 0x8a979c, transparent: true, opacity: 0.45 }),
  );
  back.position.set(HX - 5.4, 2.8, HZ + 4.6);
  back.rotation.y = Math.PI / 4;
  meshes.push(back);
  // 外野弧形圍網：深綠網面＋黃色頂緣，兩端界外標竿
  const arcPts = P.arc(HX, HZ, FR, 0, -Math.PI / 2, 28);
  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0x2f5d3a,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });
  const capMat = mat(0xe8c547);
  for (let k = 0; k < arcPts.length - 1; k++) {
    const [ax, az] = arcPts[k],
      [bx, bz] = arcPts[k + 1];
    const len = Math.hypot(bx - ax, bz - az),
      ang = Math.atan2(bz - az, bx - ax);
    const f = new THREE.Mesh(new THREE.BoxGeometry(len, 2.2, 0.08), fenceMat);
    f.position.set((ax + bx) / 2, 1.6, (az + bz) / 2);
    f.rotation.y = -ang;
    meshes.push(f);
    const c = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.2), capMat);
    c.position.set((ax + bx) / 2, 2.75, (az + bz) / 2);
    c.rotation.y = -ang;
    meshes.push(c);
  }
  // 警戒區紅土帶
  meshes.push(
    part(
      [
        ...P.arc(HX, HZ, FR - 0.1, 0, -Math.PI / 2, 28),
        ...P.arc(HX, HZ, FR - 3, -Math.PI / 2, 0, 28),
      ],
      0.5,
      0.1,
      dirt,
    ),
  );
  for (const [x, z] of [
    [HX + FR, HZ],
    [HX, HZ - FR],
  ])
    meshes.push(part(P.circle(x, z, 0.25, 8), 0.5, 7, capMat));
  // 休息區：一壘、三壘外側的小雨棚
  for (const [x, z, r] of [
    [HX + 14, HZ + 5, 0],
    [HX - 5, HZ - 14, Math.PI / 2],
  ]) {
    const d = part(P.rect(10, 2.6), 0.5, 2.2, mat(0x3d6d8f));
    d.position.set(x, 0.5, z);
    d.rotation.y = r;
    meshes.push(d);
  }
  g.add(...meshes, lines);
  placeGroup(g, [288, 700], ROT);
  namedThing('57 壘球場', g, meshes);
}
// 沙灘排球場（59）：沙坑兩面球場，木邊框、白色界線、球網與立柱，旁邊棕櫚樹與遮陽傘
{
  const g = new THREE.Group();
  const meshes = [];
  meshes.push(part(P.rect(42, 30), 0, 0.5, mat(0xb98d5c)));
  meshes.push(part(P.rect(40, 28), 0.5, 0.15, mat(0xead6a8)));
  const segs = [];
  for (const cx of [-10, 10]) {
    segs.push(
      ...rectSegs(16, 8).map(([[a, b], [c, d]]) => [
        [a + cx, b],
        [c + cx, d],
      ]),
    );
    for (const sz of [-5, 5]) meshes.push(part(P.circle(cx, sz, 0.18, 8), 0.6, 2.6, WHITE));
    const net = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 1, 10),
      new THREE.MeshStandardMaterial({ color: 0x223344, transparent: true, opacity: 0.55 }),
    );
    net.position.set(cx, 2.6, 0);
    meshes.push(net);
  }
  g.add(groundLines(segs, 0.7, new THREE.LineBasicMaterial({ color: 0xffffff })));
  for (const [x, z] of [
    [-22, -16],
    [22, -16],
    [-22, 16],
    [22, 16],
  ])
    meshes.push(...palm(x, z, 6.5));
  for (const [x, z, c] of [
    [0, -12.5, 0xd8483b],
    [0, 12.5, 0x3d7dc0],
  ]) {
    meshes.push(part(P.circle(x, z, 0.1, 6), 0.6, 2.4, WHITE));
    const u = new THREE.Mesh(new THREE.ConeGeometry(2, 0.8, 10), mat(c));
    u.position.set(x, 3.2, z);
    u.castShadow = true;
    meshes.push(u);
  }
  g.add(...meshes);
  placeGroup(g, [363, 775], ROT);
  namedThing('59 沙灘排球場', g, meshes);
}
// 體育館北側圓環
{
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.3, 32), mat(0xd6d7d6));
  ring.position.y = 0.2;
  ring.receiveShadow = true;
  const island = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.6, 24), mat(0xb9d7b0));
  island.position.y = 0.4;
  island.receiveShadow = true;
  g.add(ring, island);
  placeGroup(g, [960, 532], 0);
  namedThing('體育館北側圓環', g, [ring, island]);
}
{
  // 草坪：籃球場東側到校門車道之間
  const LAWN = [
    [1462, 712],
    [1600, 752],
    [1662, 770],
    [1668, 860],
    [1590, 880],
    [1462, 872],
  ]; // 留出舊北寧路與機車格
  const g = new THREE.Group();
  const shape = new THREE.Shape(
    LAWN.map(([x, y]) => {
      const [wx, wz] = toWorld(x, y);
      return new THREE.Vector2(wx, -wz);
    }),
  );
  const lawn = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }),
    mat(0xc8dfba),
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  g.add(lawn);
  scene.add(g);
  // 彎曲步道
  ribbon(
    [
      [1485, 865],
      [1510, 835],
      [1544, 814],
      [1575, 812],
      [1610, 825],
      [1650, 850],
    ],
    3,
    0xece6da,
    0.6,
    '草坪步道（主）',
  );
  ribbon(
    [
      [1575, 812],
      [1585, 785],
      [1598, 768],
    ],
    3,
    0xece6da,
    0.6,
    '草坪步道（北）',
  );
  ribbon(
    [
      [1545, 815],
      [1525, 795],
      [1495, 778],
    ],
    2.4,
    0xece6da,
    0.6,
    '草坪步道（西）',
  );
  // 籃球場邊一排樹
  const tg = new THREE.ConeGeometry(2.6, 7, 6);
  tg.translate(0, 4, 0);
  const tm = mat(0x7fae86);
  for (let k = 0; k < 9; k++) {
    const [x, z] = toWorld(1468 + k * 1.2, 730 + k * 16);
    const t = new THREE.Mesh(tg, tm);
    t.position.set(x, 0, z);
    t.castShadow = true;
    scene.add(t);
  }
  // 裝置藝術：圓形小廣場＋展翅造型雕塑（造型為示意）
  const s2 = new THREE.Group();
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.6, 32), mat(0xece6da));
  plaza.position.y = 0.6;
  plaza.receiveShadow = true;
  const sculptMat = mat(0x8e9aa3, { metalness: 0.4, roughness: 0.5 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 2, 8), mat(0xd9d4cb));
  pedestal.position.y = 1.6;
  pedestal.castShadow = true;
  addEdges(pedestal);
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 6), sculptMat);
  body.position.y = 5.6;
  body.castShadow = true;
  const wings = [-1, 1].map((sgn) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.3, 2.2), sculptMat);
    w.position.set(sgn * 3.2, 6.9, 0);
    w.rotation.z = sgn * 0.45;
    w.castShadow = true;
    return w;
  });
  s2.add(plaza, pedestal, body, ...wings);
  placeGroup(s2, [1572, 812], -0.18);
  namedThing('裝置藝術', s2, [plaza, pedestal, body, ...wings]);
}
// 濱海校門：北寧路直進的主車道，另有從北寧路東側彎進來的車道
ribbon(
  [
    [1694, 912],
    [1690, 820],
    [1682, 740],
  ],
  10,
  0xd6d7d6,
  0.25,
  '濱海校門主車道',
);
ribbon(
  [
    [1800, 918],
    [1760, 905],
    [1726, 880],
    [1703, 845],
    [1691, 815],
  ],
  7,
  0xd6d7d6,
  0.24,
  '北寧路彎入車道',
);
{
  const g = new THREE.Group();
  const gm = mat(0xe9e6df),
    dark = mat(0x8c9399);
  const pillars = [-9, 9].map((x) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 9, 3), gm);
    m.position.set(x, 4.5, 0);
    m.castShadow = true;
    addEdges(m);
    return m;
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(22, 1.8, 3.4), gm);
  beam.position.y = 9.6;
  beam.castShadow = true;
  addEdges(beam);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(10, 1.1, 0.2), dark);
  sign.position.set(0, 9.6, 1.8);
  const booth = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), gm);
  booth.position.set(13, 1.5, 3);
  booth.castShadow = true;
  addEdges(booth);
  g.add(...pillars, beam, sign, booth);
  placeGroup(g, [1689, 790], -0.05);
  const info = {
    no: 0,
    name: '濱海校門（北寧校區）',
    floorCount: 0,
    venue: false,
    group: g,
    body: beam,
    always: true,
  };
  for (const m of [...pillars, beam, sign, booth]) {
    m.userData.info = info;
    pickables.push(m);
  }
  const label = makeLabel('濱海校門', '', () => select(info));
  label.position.set(0, 14, 0);
  g.add(label);
  info.label = label;
}
{
  // 看板：面向北寧路
  const g = new THREE.Group();
  const postMat = mat(0x8a9196);
  const posts = [-3.2, 3.2].map((x) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), postMat);
    m.position.set(x, 2.5, 0);
    return m;
  });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 0.4), mat(0x2f6f8f));
  panel.position.y = 5.4;
  panel.castShadow = true;
  addEdges(panel);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 2.6), mat(0xf5f1e8));
  face.position.set(0, 5.4, 0.21);
  g.add(...posts, panel, face);
  placeGroup(g, [1655, 878], -0.1);
  namedThing('看板', g, [panel, face, ...posts]);
}

// 游泳運動中心（18）：池畔、50 m 池八水道、藍頂看台、池邊機房
{
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(64, 1.2, 34), mat(0xece4d3));
  deck.position.y = 0.6;
  deck.receiveShadow = true;
  addEdges(deck);
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(50, 0.4, 21),
    mat(0x5fb8d9, { roughness: 0.25, metalness: 0.1 }),
  );
  water.position.set(-2, 1.05, -2);
  water.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(51.6, 0.3, 22.6), mat(0xffffff));
  rim.position.set(-2, 0.95, -2);
  const laneSegs = [];
  for (let k = 1; k < 8; k++) {
    const z = -2 - 10.5 + k * 2.625;
    laneSegs.push([
      [-26.5, z],
      [22.5, z],
    ]);
  }
  const lanes = groundLines(laneSegs, 1.3, new THREE.LineBasicMaterial({ color: 0xf2f2f2 }));
  // 看台：北側三階，上覆藍色雨棚
  const parts = [deck, water];
  for (let k = 0; k < 3; k++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(46, 0.9, 2.2),
      mat(k % 2 ? 0x6fa3d6 : 0x4f86c6),
    );
    step.position.set(-2, 1.65 + k * 0.9, 14.5 - k * 2.2 + 2.2 * 0);
    step.castShadow = true;
    parts.push(step);
    g.add(step);
  }
  const shade = new THREE.Mesh(new THREE.BoxGeometry(48, 0.4, 7), mat(0x3d7fc4));
  shade.position.set(-2, 7, 13.5);
  shade.rotation.x = 0.12;
  shade.castShadow = true;
  addEdges(shade);
  const shadePosts = [-24, -12, 0, 12, 20].map((x) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), mat(0xe6e6e6));
    m.position.set(x, 4, 16.5);
    return m;
  });
  // 池東側更衣室與機房
  const house = part(P.rect(9, 30, 27, 0), 1.2, 6, 'white');
  g.add(deck, rim, water, lanes, shade, ...shadePosts, house);
  parts.push(shade, house);
  placeGroup(g, [1017, 343], ROT);
  namedThing('游泳運動中心', g, parts);
}

// 勇泉商場（7-ELEVEN）到第四、第三宿舍的遮雨走廊
// 宿舍區只有兩段遮雨走廊：第四宿舍東側接第三宿舍西端、第三宿舍南側接 7-ELEVEN；不接游泳池
canopy(
  [
    [992, 249],
    [1022, 236],
    [1056, 216],
  ],
  '宿舍走廊（第四－第三宿舍）',
);
canopy(
  [
    [1112, 255],
    [1142, 272],
    [1170, 286],
  ],
  '宿舍走廊（第三宿舍－7-ELEVEN）',
);

// 舊北寧路（運動場北側）沿街機車停車格：兩側白線格，停了些機車
{
  const ROUTE = [
    [780, 470],
    [945, 532],
    [1200, 575],
    [1500, 692],
    [1650, 735],
  ].map(([x, y]) => toWorld(x, y));
  const RING = toWorld(960, 532);
  const SIDE_X = toWorld(1060, 552);
  const segs = [],
    bikes = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const [ax, az] = ROUTE[i],
      [bx, bz] = ROUTE[i + 1];
    const L = Math.hypot(bx - ax, bz - az),
      ux = (bx - ax) / L,
      uz = (bz - az) / L,
      nx = -uz,
      nz = ux;
    for (const side of [-1, 1]) {
      const o0 = side * 5,
        o1 = side * 7.2;
      segs.push([
        [ax + nx * o1, az + nz * o1],
        [bx + nx * o1, bz + nz * o1],
      ]);
      for (let t = 6; t < L - 6; t += 1.1) {
        if (t % 32 < 4) continue; // 每段留出入口
        const px = ax + ux * t,
          pz = az + uz * t;
        if (Math.hypot(px - RING[0], pz - RING[1]) < 13) continue; // 體育館北側圓環不畫車格
        if (Math.hypot(px - SIDE_X[0], pz - SIDE_X[1]) < 7) continue; // 側門斑馬線前後不畫車格
        segs.push([
          [px + nx * o0, pz + nz * o0],
          [px + nx * o1, pz + nz * o1],
        ]);
        if (rnd() < 0.55)
          bikes.push([
            px + ux * 0.55 + nx * side * 6.1,
            pz + uz * 0.55 + nz * side * 6.1,
            Math.atan2(nx, nz),
          ]);
      }
    }
  }
  scene.add(groundLines(segs, 0.35, new THREE.LineBasicMaterial({ color: 0xffffff })));
  const bg = new THREE.BoxGeometry(0.6, 1.0, 1.8);
  bg.translate(0, 0.6, 0);
  const cols = [0xf2f2f2, 0x3a3f45, 0xc9473b, 0x5c8fc4, 0xe0c35a];
  const inst = new THREE.InstancedMesh(
    bg,
    new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }),
    bikes.length,
  );
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    one = new THREE.Vector3(1, 1, 1),
    c = new THREE.Color();
  bikes.forEach(([x, z, a], i) => {
    m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(up, a), one);
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.setHex(cols[Math.floor(rnd() * cols.length)]));
  });
  inst.castShadow = true;
  scene.add(inst);
}

// 排球場、網球場（48）：一面網球場（藍）＋四面排球場（綠，2×2），含標線、球網、圍網
{
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(36, 0.6, 62), mat(0x7f8a86));
  base.position.y = 0.3;
  base.receiveShadow = true;
  group.add(base);
  const meshes = [base],
    segs = [];
  const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, wireframe: true });
  const addNet = (w, h, x, z) => {
    const n = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1, 8, 2, 1), netMat);
    n.position.set(x, 0.6 + h / 2 + (h < 1.5 ? 0 : 0.9), z);
    group.add(n);
  };
  // 網球場（長邊沿 x）
  const tennis = new THREE.Mesh(new THREE.BoxGeometry(30, 0.2, 14), mat(0x4f78b8));
  tennis.position.set(0, 0.7, -22);
  group.add(tennis);
  meshes.push(tennis);
  segs.push(
    ...rectSegs(23.8, 11, 0, -22),
    [
      [-11.9, -22 - 4.1],
      [11.9, -22 - 4.1],
    ],
    [
      [-11.9, -22 + 4.1],
      [11.9, -22 + 4.1],
    ],
    [
      [-6.4, -26.1],
      [-6.4, -17.9],
    ],
    [
      [6.4, -26.1],
      [6.4, -17.9],
    ],
    [
      [-6.4, -22],
      [6.4, -22],
    ],
  );
  {
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 12, 1, 2, 10), netMat);
    n.position.set(0, 1.2, -22);
    group.add(n);
  }
  // 排球場 2×2（長邊沿 z）
  for (const cx of [-8.5, 8.5])
    for (const cz of [-1, 19]) {
      const court = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 19), mat(0x6f9e6a));
      court.position.set(cx, 0.7, cz);
      group.add(court);
      meshes.push(court);
      segs.push(
        ...rectSegs(9, 18, cx, cz),
        [
          [cx - 4.5, cz],
          [cx + 4.5, cz],
        ],
        [
          [cx - 4.5, cz - 3],
          [cx + 4.5, cz - 3],
        ],
        [
          [cx - 4.5, cz + 3],
          [cx + 4.5, cz + 3],
        ],
      );
      addNet(10, 1, cx, cz);
    }
  group.add(groundLines(segs, 0.85));
  const fence = new THREE.Mesh(
    new THREE.BoxGeometry(36, 4, 62),
    new THREE.MeshStandardMaterial({
      color: 0x6b7a72,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    }),
  );
  fence.position.y = 2.6;
  group.add(fence);
  placeGroup(group, [2300, 605], ROT_E);
  namedThing('排球場、網球場', group, meshes);
}
// 海大涼亭：人文大樓與綜合二館之間、圖書館東側的樹林邊路旁（依空拍）
{
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.6, 6), mat(0xd9d4cb));
  floor.position.y = 0.3;
  const posts = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3, 0.35), mat(0x9a6b4c));
    m.position.set(Math.cos(a) * 3.3, 2.1, Math.sin(a) * 3.3);
    return m;
  });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 2.6, 6), mat(0xb5553f));
  roof.position.y = 4.9;
  roof.castShadow = true;
  addEdges(roof);
  g.add(floor, ...posts, roof);
  placeGroup(g, [1919, 511], 0);
  namedThing('海大涼亭', g, [floor, roof, ...posts]);
}

// 綜合二館東側小停車場
{
  const g = new THREE.Group();
  const lot = new THREE.Mesh(new THREE.BoxGeometry(20, 0.4, 30), mat(0xcfd0cf));
  lot.position.y = 0.2;
  lot.receiveShadow = true;
  g.add(lot);
  const segs = [];
  for (const sx of [-1, 1])
    for (let z = -14; z <= 14; z += 2.6)
      segs.push([
        [sx * 10, z],
        [sx * 5, z],
      ]);
  g.add(groundLines(segs, 0.45));
  const cols = [0xf3f3f3, 0x9aa7b4, 0x3d4a57, 0xc94c3c];
  let k = 0;
  for (const sx of [-1, 1])
    for (let z = -12.7; z < 14; z += 2.6) {
      if (++k % 3 === 0) continue;
      const car = new THREE.Mesh(new THREE.BoxGeometry(4.3, 1.4, 1.8), mat(cols[k % 4]));
      car.position.set(sx * 7.5, 0.9, z);
      car.castShadow = true;
      g.add(car);
    }
  placeGroup(g, [1928, 772], ROT);
  namedThing('停車場', g, [lot]);
}
// 寰宇之書：北寧路旁的書本造型公共藝術（造型為示意）
{
  const g = new THREE.Group();
  const bm = mat(0xd9d2c3),
    base = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 4), mat(0xbfb7a8));
  base.position.y = 0.4;
  const pages = [-1, 1].map((sgn) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 4.2), bm);
    m.position.set(sgn * 1.5, 2.2, 0);
    m.rotation.z = sgn * 0.5;
    m.castShadow = true;
    addEdges(m);
    return m;
  });
  g.add(base, ...pages);
  placeGroup(g, [2210, 842], -0.1);
  namedThing('寰宇之書', g, [base, ...pages]);
}

// 自由中國號：沛華大樓前的中式帆船（造型為示意）
{
  const g = new THREE.Group();
  const hullMat = mat(0x8a5a3c),
    sailMat = mat(0xc9733f, { side: THREE.DoubleSide });
  const hs = new THREE.Shape(
    [
      [-9, 0],
      [8, 0],
      [11, 3.2],
      [-10.5, 3.6],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  );
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 4.4, bevelEnabled: false });
  hg.translate(0, 0, -2.2);
  const hull = new THREE.Mesh(hg, hullMat);
  hull.position.y = 1;
  hull.castShadow = true;
  addEdges(hull);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 5), mat(0xcfc8bb));
  stand.position.y = 0.5;
  stand.receiveShadow = true;
  const parts = [hull, stand];
  for (const [x, hgt, sw] of [
    [-5, 9, 5],
    [1.5, 12, 6.5],
    [7.5, 7, 4],
  ]) {
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, hgt, 0.3), mat(0x5b3d2a));
    mast.position.set(x, 4.5 + hgt / 2, 0);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(sw, hgt * 0.75), sailMat);
    sail.position.set(x + sw * 0.35, 4.5 + hgt * 0.55, 0);
    sail.castShadow = true;
    g.add(mast, sail);
    parts.push(sail);
  }
  g.add(stand, hull);
  placeGroup(g, [1150, 540], ROT);
  namedThing('自由中國號', g, parts);
}

// 夢泉（圓形廣場）
{
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.8, 32), mat(0xd7e8d0));
  m.position.y = 0.4;
  m.receiveShadow = true;
  g.add(m);
  const f = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 2, 16), WHITE);
  f.position.y = 1;
  f.castShadow = true;
  g.add(f);
  placeGroup(g, [1884, 352], 0);
}

// 活動場地：每層一塊，可展開
const venueInfos = [];
for (const v of VENUES) {
  let info = null;
  const group = new THREE.Group();
  const floorMat = mat(VENUE_COLOR);
  const quietMat = mat(0xf1cdbb);
  const basement = v.basement || 0;
  const rooms = v.rooms || {};
  const floors = [];
  for (let i = 0; i < v.floors; i++) {
    const fg = new THREE.Group();
    const fname = i < basement ? `B${basement - i}` : `${i - basement + 1}F`;
    const room = rooms[fname];
    const slabMat = v.rooms && !room ? quietMat : floorMat;
    const poly = v.tiers.filter(([from]) => from <= i).at(-1)[1];
    const next = v.tiers.find(([from]) => from === i + 1);
    const slab = prism(poly, FLOOR_H - 0.5, slabMat);
    // 頂層或下一層退縮時，露出的樓板用屋頂色
    const plate = prism(padPoly(poly, 1.2), 0.5, i === v.floors - 1 || next ? VENUE_TOP : WHITE);
    plate.position.y = FLOOR_H - 0.5;
    fg.add(slab, plate);
    fg.userData.box = bbox(poly);
    fg.position.y = (i - basement) * FLOOR_H;
    fg.userData.baseY = (i - basement) * FLOOR_H;
    fg.userData.fname = fname;
    fg.userData.room = room;
    const shop = (v.shops || {})[fname];
    fg.userData.shop = shop;
    const fl = makeLabel([fname, room, shop].filter(Boolean).join('・'), 'floor hidden', () =>
      showFloor(info, i),
    );
    fl.position.set(
      fg.userData.box.x1 + 6,
      FLOOR_H / 2,
      (fg.userData.box.z0 + fg.userData.box.z1) / 2,
    );
    fg.add(fl);
    fg.userData.label = fl;
    group.add(fg);
    floors.push(fg);
  }
  const h = (v.floors - basement) * FLOOR_H;
  let roof = null;
  if (v.extras) {
    roof = new THREE.Group();
    roof.add(...v.extras(h));
    group.add(roof);
  }
  info = {
    ...v,
    floorCount: v.floors,
    venue: true,
    group,
    floorMeshes: floors,
    roofMesh: roof,
    exploded: false,
    t: 0,
    h,
    floorMat,
  };
  if (v.attached) {
    const att = new THREE.Group();
    att.add(...v.attached(h));
    group.add(att);
    att.traverse((o) => {
      if (o.isMesh) {
        o.userData.info = info;
        pickables.push(o);
      }
    });
  }
  for (const fg of floors)
    fg.traverse((o) => {
      if (o.isMesh) {
        o.userData.info = info;
        pickables.push(o);
      }
    });
  if (roof)
    roof.traverse((o) => {
      if (o.isMesh) {
        o.userData.info = info;
        pickables.push(o);
      }
    });
  const roofTop = roof ? new THREE.Box3().setFromObject(roof).max.y : h;
  const label = makeLabel(v.name, 'venue', () => select(info));
  label.position.set(0, Math.max(h, roofTop) + 4, 0);
  group.add(label);
  info.label = label;
  placeGroup(group, v.p, v.rot);
  venueInfos.push(info);
}

// 後山地形與樹：依 3D 導覽，校區北側與東側是陡峭山坡
{
  // [多邊形（平面圖像素）, 最高點高度 m, 山腳坡度距離 m]
  const HILLS = [
    [
      [
        [200, -500],
        [2900, -500],
        [2900, 300],
        [2600, 330],
        [2450, 385],
        [2330, 320],
        [2200, 195],
        [2060, 200],
        [1900, 170],
        [1790, 90],
        [1730, 70],
        [1700, 265],
        [1450, 300],
        [1250, 255],
        [1150, 100],
        [1050, 165],
        [900, 175],
        [820, 260],
        [600, 310],
        [330, 300],
        [180, 250],
      ],
      140,
      70,
    ],
    [
      [
        [1935, 565],
        [2010, 535],
        [2075, 550],
        [2095, 605],
        [2010, 620],
        [1960, 600],
      ],
      22,
      20,
    ],
    [
      [
        [1900, 660],
        [2080, 690],
        [2125, 720],
        [1985, 765],
        [1880, 720],
      ],
      18,
      30,
    ],
    [
      [
        [2530, 480],
        [2900, 420],
        [2900, 900],
        [2580, 770],
      ],
      70,
      50,
    ],
  ].map(([poly, peak, ramp]) => ({ poly: poly.map(([x, y]) => toWorld(x, y)), peak, ramp }));

  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax,
      dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(px - ax - t * dx, pz - az - t * dz);
  };
  const inside = (x, z, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i],
        [xj, zj] = poly[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const noise = (x, z) =>
    Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017) * 0.5 +
    Math.sin(x * 0.053 + z * 0.041) * 0.3 +
    Math.cos(x * 0.011 - z * 0.029) * 0.4;
  const heightAt = (x, z) => {
    let h = 0;
    for (const hill of HILLS) {
      if (!inside(x, z, hill.poly)) continue;
      let d = Infinity;
      const P = hill.poly;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++)
        d = Math.min(d, segDist(x, z, P[j][0], P[j][1], P[i][0], P[i][1]));
      const k = Math.min(1, d / (hill.ramp * 3));
      const ease = k * k * (3 - 2 * k);
      h = Math.max(h, ease * hill.peak * (0.75 + 0.25 * noise(x, z)) + Math.min(1, d / 12) * 2);
    }
    return h;
  };
  window.__heightAt = heightAt;

  const [x0, z0] = toWorld(150, -500),
    [x1, z1] = toWorld(2900, 1000);
  const STEP = 7;
  const nx = Math.ceil((x1 - x0) / STEP),
    nz = Math.ceil((z1 - z0) / STEP);
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const low = new THREE.Color(0xc8dcc0),
    high = new THREE.Color(0x9dbf9a),
    tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = heightAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, h > 0.5 ? h : -10);
    tmp.copy(low).lerp(high, Math.min(1, h / 90));
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  );
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  // 樹：只種在山坡上
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pts = [];
  for (let k = 0; k < 9000 && pts.length < 2600; k++) {
    const x = x0 + rand() * (x1 - x0),
      z = z0 + rand() * (z1 - z0);
    const h = heightAt(x, z);
    if (h > 3) pts.push([x, h, z]);
  }
  const tgeo = new THREE.ConeGeometry(4.5, 12, 6);
  tgeo.translate(0, 5, 0);
  const trees = new THREE.InstancedMesh(tgeo, mat(0x86b48f), pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, h, z], i) => {
    const s = 0.7 + rand() * 0.9;
    m4.compose(new THREE.Vector3(x, h - 1, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trees.setMatrixAt(i, m4);
  });
  trees.castShadow = true;
  scene.add(trees);
}

// ---------- 互動 ----------
const infoEl = document.getElementById('info');
const nameEl = document.getElementById('infoName');
const metaEl = document.getElementById('infoMeta');
const badgeEl = document.getElementById('infoBadge');
const explodeBtn = document.getElementById('explode');
const floorNote = document.getElementById('floorNote');
let selected = null;
const HILITE = new THREE.Color(0xffe2a8);

function setHighlight(info, on) {
  if (!info) return;
  info.group.traverse((o) => {
    if (o.isMesh && o.material && o.material.emissive) {
      if (on) {
        if (!o.userData.ownMat) {
          o.material = o.material.clone();
          o.userData.ownMat = true;
        }
        o.material.emissive.copy(HILITE).multiplyScalar(0.35);
      } else if (o.userData.ownMat) {
        o.material.emissive.setRGB(0, 0, 0);
      }
    }
  });
}

let anim = null;
function flyTo(target, dist = 220) {
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  anim = {
    t: 0,
    fromPos: camera.position.clone(),
    fromTgt: controls.target.clone(),
    toTgt: target.clone(),
    toPos: target.clone().add(dir.multiplyScalar(dist)),
  };
}

function select(info) {
  if (editMode) {
    editSelect(info);
    return;
  }
  if (selected && selected !== info) {
    setHighlight(selected, false);
    if (selected.exploded) toggleExplode(selected);
  }
  selected = info;
  setHighlight(info, true);
  infoEl.style.display = 'block';
  nameEl.textContent = info.name;
  const parts = [];
  if (CODES[info.no]) parts.push(`館樓代碼 ${CODES[info.no]}`);
  if (info.no) parts.push(`平面圖編號 ${info.no}`);
  if (info.floorCount) {
    const b = info.basement || 0;
    parts.push(b ? `B${b}～${info.floorCount - b}F` : `${info.floorCount} 層（暫定）`);
  }
  metaEl.textContent = info.note ? `${parts.join('・')}。${info.note}` : parts.join('・');
  badgeEl.style.display = info.venue || info.badge ? 'inline-block' : 'none';
  badgeEl.textContent = info.badge || '活動常用場地';
  badgeEl.className = 'badge ' + (info.badgeCls || '');
  explodeBtn.style.display = info.floorMeshes ? 'inline-block' : 'none';
  explodeBtn.textContent = info.exploded ? '收合樓層' : '展開樓層';
  floorNote.textContent = roomSummary(info);
  const c = new THREE.Vector3();
  info.group.getWorldPosition(c);
  c.y = (info.h || 0) / 2;
  flyTo(c, info.floorMeshes ? 170 : 240);
}

function toggleExplode(info) {
  info.exploded = !info.exploded;
  for (const fg of info.floorMeshes)
    fg.userData.label.element.classList.toggle('hidden', !info.exploded);
  if (info.roofMesh) info.roofMesh.visible = !info.exploded;
  if (selected === info) {
    explodeBtn.textContent = info.exploded ? '收合樓層' : '展開樓層';
    floorNote.textContent = info.exploded
      ? '點樓層標籤看該層（之後放教室與活動）'
      : roomSummary(info);
  }
}

function roomSummary(info) {
  if (!info.rooms) return '';
  return Object.entries(info.rooms)
    .map(([f, n]) => `${f} ${n}`)
    .join('・');
}

function showFloor(info, i) {
  const fg = info.floorMeshes[i];
  const room = [fg.userData.room, fg.userData.shop].filter(Boolean).join('、');
  floorNote.textContent = room
    ? `${info.name} ${fg.userData.fname}：${room}（之後列出這裡的活動）`
    : `${info.name} ${fg.userData.fname}：之後可在這裡列出教室與本層活動`;
}

function focusRoom(info, fname) {
  select(info);
  if (!info.exploded) toggleExplode(info);
  const i = info.floorMeshes.findIndex((fg) => fg.userData.fname === fname);
  showFloor(info, i);
}

explodeBtn.addEventListener('click', () => selected && toggleExplode(selected));
document.getElementById('close').addEventListener('click', () => {
  if (selected) {
    setHighlight(selected, false);
    if (selected.exploded) toggleExplode(selected);
  }
  selected = null;
  infoEl.style.display = 'none';
});
document.getElementById('reset').addEventListener('click', () => {
  anim = {
    t: 0,
    fromPos: camera.position.clone(),
    fromTgt: controls.target.clone(),
    toPos: HOME.pos.clone(),
    toTgt: HOME.target.clone(),
  };
});
let labelsOn = false;
const toggleBtn = document.getElementById('toggleLabels');
toggleBtn.addEventListener('click', () => {
  labelsOn = !labelsOn;
  for (const l of allLabels) l.element.classList.toggle('hidden', !labelsOn);
  toggleBtn.textContent = labelsOn ? '隱藏其他名稱' : '顯示全部名稱';
});

const panel = document.getElementById('panel');
const foldBtn = document.getElementById('fold');
const setFold = (on) => {
  panel.classList.toggle('collapsed', on);
  foldBtn.textContent = on ? '展開' : '收合';
  foldBtn.setAttribute('aria-expanded', String(!on));
  try {
    localStorage.setItem('campus3d.fold', on ? '1' : '0');
  } catch {
    /* 無痕模式可能不能存 */
  }
};
foldBtn.addEventListener('click', () => setFold(!panel.classList.contains('collapsed')));
try {
  if (localStorage.getItem('campus3d.fold') === '1') setFold(true);
} catch {
  /* 略過 */
}
// 手機寬度預設收合，避免擋住畫面
if (window.innerWidth < 640) setFold(true);

const chips = document.getElementById('chips');
const venueOrder = [...venueInfos];
for (const info of venueOrder) {
  const b = document.createElement('button');
  b.textContent = info.name;
  b.addEventListener('click', () => select(info));
  chips.appendChild(b);
}
{
  const sep = document.createElement('span');
  sep.textContent = '廳：';
  sep.style.cssText = 'font-size:12px;color:var(--muted);align-self:center;margin-left:4px';
  chips.appendChild(sep);
  for (const info of venueInfos) {
    for (const [fname, room] of Object.entries(info.rooms || {})) {
      const b = document.createElement('button');
      b.textContent = `${room}（${fname}）`;
      b.addEventListener('click', () => focusRoom(info, fname));
      chips.appendChild(b);
    }
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
let hovered = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = [e.clientX, e.clientY];
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (editMode) return;
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const hit = pick(e);
  if (hit) select(hit);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  const hit = pick(e);
  if (hovered && hovered !== hit && !hovered.venue && !hovered.always && hovered.label && !labelsOn)
    hovered.label.element.classList.add('hidden');
  hovered = hit;
  if (hit && hit.label) hit.label.element.classList.remove('hidden');
  renderer.domElement.style.cursor = hit ? 'pointer' : '';
});
function pick(e) {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  const h = hits.find((x) => !x.object.userData.info?.deleted);
  return h ? h.object.userData.info : null;
}

// ---------- 編輯模式：直接拖曳建物與道路頂點，調整存在瀏覽器，可匯出座標寫回資料 ----------
const EDIT_KEY = 'campus3d.edits.v3'; // 寫回模型後換新鍵，舊的調整不再重複套用
// toWorld 的反函數：位移場平滑且小，固定點迭代幾次就收斂
const fromWorld = (x, z) => {
  let [px, pz] = [x, z];
  for (let i = 0; i < 6; i++) {
    const [dx, dz] = warpAt(px, pz);
    px = x - dx;
    pz = z - dz;
  }
  return [Math.round(px / S + 1400), Math.round(pz / S + 600)];
};
let editMode = false;
let editTarget = null; // { kind: 'obj', info } 或 { kind: 'pt', road, i }
let drag = null;
const undoStack = [];
const editBar = document.getElementById('editBar');
const editSel = document.getElementById('editSel');
const editOut = document.getElementById('editOut');
const editToggle = document.getElementById('editToggle');
const hintEl = document.getElementById('hint');

// 可編輯物件：每個有 group 的 info 一筆，依名稱給固定 id
// 11/16 在編輯模式校正過的位置（平面圖座標、旋轉），載入時套用
const BAKED = {
  '6 安庚書屋': [1855, 638, -0.36],
  '7 郵局': [1718, 715, -0.36],
  '16 勇泉': [1078, 311, -0.36],
  '65 水生動物實驗中心': [954, 778, -0.36],
  '30 第一餐廳（夢泉商場）': [1847, 236, -0.6],
  '3 圖書館': [1799, 612, -2.105],
  '68 電資暨綜合教學大樓': [836, 732, -0.36],
  '64 電機二館・資工系館': [809, 801, -0.36],
  '19 第四宿舍': [962, 239, -0.36],
  '21 第三宿舍': [1090, 224, -1.756],
  '36 第一宿舍': [2102, 246, -0.62],
  '20 第二餐廳（勇泉商場）': [1024, 197, -0.36],
  '7-ELEVEN 海大勇泉門市': [1179, 290, -0.36],
  '37 海大農場': [2027, 253, -0.62],
  '29 射箭場': [1717, 222, -0.2],
  '25 籃球場': [1374, 764, -0.3],
  裝置藝術: [1574, 812, -0.18],
  '濱海校門（北寧校區）': [1687, 725, -0.399],
  '排球場、網球場': [2318, 566, -3.762],
  停車場: [1896, 611, 1.211],
  自由中國號: [1265, 541, -0.36],
  '10 育樂館': [1395, 458, -0.36],
  '22 學生活動中心': [811, 580, -0.36],
  '69 大型空蝕水槽實驗室': [121, 479, -0.36],
  '70 河工二館': [199, 519, -0.36],
  '56 海洋工程綜合實驗館': [335, 560, -0.36],
  '12 延平技術大樓': [1296, 408, -0.36],
};
const editables = new Map();
{
  const seen = new Set();
  const count = {};
  for (const m of pickables) {
    const info = m.userData.info;
    if (!info || !info.group || seen.has(info)) continue;
    seen.add(info);
    const base = info.no ? `${info.no} ${info.name}` : info.name;
    count[base] = (count[base] || 0) + 1;
    info.editId = count[base] > 1 ? `${base} #${count[base]}` : base;
    const bk = BAKED[info.editId];
    if (bk) {
      const [x, z] = toWorld(bk[0], bk[1]);
      info.group.position.x = x;
      info.group.position.z = z;
      info.group.rotation.y = bk[2];
    }
    info.orig = { x: info.group.position.x, z: info.group.position.z, rot: info.group.rotation.y };
    editables.set(info.editId, info);
  }
}
for (const r of ROADS) r.orig = r.points.map((q) => [...q]);

// 道路頂點把手
const HANDLE_GEO = new THREE.SphereGeometry(1, 14, 10);
const HANDLE_MAT = new THREE.MeshBasicMaterial({ color: 0xe0782f, depthTest: false });
const HANDLE_SEL = new THREE.MeshBasicMaterial({ color: 0x1f6fd1, depthTest: false });
const handleGroup = new THREE.Group();
handleGroup.visible = false;
handleGroup.renderOrder = 10;
scene.add(handleGroup);
const roadMeshes = [];
for (const r of ROADS)
  for (const l of r.layers) {
    l.mesh.userData.road = r;
    roadMeshes.push(l.mesh);
  }
function rebuildHandles() {
  handleGroup.clear();
  for (const r of ROADS) {
    if (r.deleted) continue;
    r.points.forEach(([hx, hy], i) => {
      const [x, z] = toWorld(hx, hy);
      const h = new THREE.Mesh(
        HANDLE_GEO,
        editTarget?.kind === 'pt' && editTarget.road === r && editTarget.i === i
          ? HANDLE_SEL
          : HANDLE_MAT,
      );
      h.position.set(x, 1.5, z);
      h.renderOrder = 10;
      h.userData.handle = { road: r, i };
      handleGroup.add(h);
    });
  }
  scaleHandles();
  updateBoxUI();
}
function scaleHandles() {
  const k = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) / 260, 0.5, 4) * 1.1;
  for (const h of handleGroup.children) h.scale.setScalar(k);
}
controls.addEventListener('change', () => {
  if (editMode) scaleHandles();
});
function redrawRoad(r) {
  for (const l of r.layers) {
    l.mesh.geometry.dispose();
    l.mesh.geometry = ribbonGeom(r.points, l.width, l.y);
  }
}

// 狀態快照、存檔與套用
const snapObj = (info) => ({
  x: info.group.position.x,
  z: info.group.position.z,
  rot: info.group.rotation.y,
});
function applyObj(info, st) {
  info.group.position.x = st.x;
  info.group.position.z = st.z;
  info.group.rotation.y = st.rot;
}
const objChanged = (info) => {
  const a = snapObj(info),
    o = info.orig;
  return (
    Math.abs(a.x - o.x) > 0.05 || Math.abs(a.z - o.z) > 0.05 || Math.abs(a.rot - o.rot) > 0.001
  );
};
const roadChanged = (r) => JSON.stringify(r.points) !== JSON.stringify(r.orig);
function saveEdits() {
  const data = { objs: {}, roads: {} };
  for (const [id, info] of editables) if (objChanged(info)) data.objs[id] = snapObj(info);
  for (const r of ROADS) if (!r.isNew && roadChanged(r)) data.roads[r.name] = r.points;
  extraSave(data);
  try {
    localStorage.setItem(EDIT_KEY, JSON.stringify(data));
  } catch {
    /* 無痕模式可能不能存 */
  }
}
try {
  const data = JSON.parse(localStorage.getItem(EDIT_KEY) || 'null');
  if (data) {
    for (const [id, st] of Object.entries(data.objs || {})) {
      const info = editables.get(id);
      if (info) applyObj(info, st);
    }
    for (const [name, pts] of Object.entries(data.roads || {})) {
      const r = ROADS.find((q) => q.name === name);
      if (r && Array.isArray(pts) && pts.length >= 2) {
        r.points = pts;
        redrawRoad(r);
      }
    }
  }
} catch {
  /* 讀不到就用原始配置 */
}

function pushUndo() {
  if (!editTarget) return;
  if (editTarget.kind === 'obj')
    undoStack.push({ kind: 'obj', info: editTarget.info, st: snapObj(editTarget.info) });
  else
    undoStack.push({
      kind: 'road',
      road: editTarget.road,
      pts: editTarget.road.points.map((q) => [...q]),
    });
  if (undoStack.length > 200) undoStack.shift();
}
function undo() {
  const u = undoStack.pop();
  if (!u) return;
  if (u.kind === 'obj') applyObj(u.info, u.st);
  else if (u.kind !== 'road') extraUndo(u);
  else {
    u.road.points = u.pts;
    redrawRoad(u.road);
    if (editTarget?.kind === 'pt' && editTarget.road === u.road)
      editTarget.i = Math.min(editTarget.i, u.pts.length - 1);
    rebuildHandles();
  }
  saveEdits();
  describeTarget();
}

function describeTarget() {
  if (!editTarget) {
    editSel.textContent = '點一棟建物或道路上的橘點';
    return;
  }
  if (editTarget.kind === 'obj') {
    const g = editTarget.info.group;
    const [hx, hy] = fromWorld(g.position.x, g.position.z);
    const i = editTarget.info;
    editSel.textContent = `${i.name}（${hx}, ${hy}・${Math.round((g.rotation.y * 180) / Math.PI)}°${i.isBox ? `・${i.w}×${i.d}×${i.h} m` : ''}）`;
  } else {
    const [hx, hy] = editTarget.road.points[editTarget.i];
    editSel.textContent = `${editTarget.road.name} 第 ${editTarget.i + 1} 點（${hx}, ${hy}）`;
  }
}
function editSelect(info) {
  if (selected && selected !== info) setHighlight(selected, false);
  selected = info;
  setHighlight(info, true);
  editTarget = { kind: 'obj', info };
  rebuildHandles();
  describeTarget();
}
function selectPoint(road, i) {
  if (selected) {
    setHighlight(selected, false);
    selected = null;
  }
  editTarget = { kind: 'pt', road, i };
  rebuildHandles();
  describeTarget();
}

function setEditMode(on) {
  editMode = on;
  document.body.classList.toggle('editing', on);
  editToggle.classList.toggle('on', on);
  editBar.classList.toggle('on', on);
  hintEl.style.display = on ? 'none' : '';
  handleGroup.visible = on;
  if (on) {
    infoEl.style.display = 'none';
    if (selected?.exploded) toggleExplode(selected);
    if (selected) editTarget = { kind: 'obj', info: selected };
    rebuildHandles();
    describeTarget();
  } else {
    editTarget = null;
    editOut.classList.remove('on');
    if (selected) {
      setHighlight(selected, false);
      selected = null;
    }
  }
}
editToggle.addEventListener('click', () => setEditMode(!editMode));
// 網站上預設隱藏編輯模式，網址加 ?edit=1 才顯示（校正座標用）
if (!new URLSearchParams(location.search).has('edit')) editToggle.style.display = 'none';
document.getElementById('editDone').addEventListener('click', () => setEditMode(false));

// 旋轉：繞物件外框中心轉，不會甩到別處
function rotateTarget(deg) {
  if (editTarget?.kind !== 'obj') return;
  const g = editTarget.info.group;
  pushUndo();
  const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
  const d = (deg * Math.PI) / 180;
  const dx = g.position.x - c.x,
    dz = g.position.z - c.z;
  // three.js 的 rotation.y 正向：x' = x cos + z sin, z' = -x sin + z cos
  g.position.x = c.x + dx * Math.cos(d) + dz * Math.sin(d);
  g.position.z = c.z - dx * Math.sin(d) + dz * Math.cos(d);
  g.rotation.y += d;
  saveEdits();
  describeTarget();
}
document.getElementById('rotL').addEventListener('click', (e) => rotateTarget(e.shiftKey ? 1 : 5));
document
  .getElementById('rotR')
  .addEventListener('click', (e) => rotateTarget(e.shiftKey ? -1 : -5));
document.getElementById('editUndo').addEventListener('click', undo);
document.getElementById('editResetOne').addEventListener('click', () => {
  if (!editTarget) return;
  pushUndo();
  if (editTarget.kind === 'obj') applyObj(editTarget.info, editTarget.info.orig);
  else {
    const r = editTarget.road;
    r.points = r.orig.map((q) => [...q]);
    redrawRoad(r);
    editTarget.i = Math.min(editTarget.i, r.points.length - 1);
    rebuildHandles();
  }
  saveEdits();
  describeTarget();
});
document.getElementById('editResetAll').addEventListener('click', () => {
  for (const info of editables.values()) if (objChanged(info)) applyObj(info, info.orig);
  for (const r of ROADS)
    if (roadChanged(r)) {
      r.points = r.orig.map((q) => [...q]);
      redrawRoad(r);
    }
  extraResetAll();
  undoStack.length = 0;
  if (editTarget?.kind === 'pt' && editTarget.road.deleted) editTarget = null;
  if (editTarget?.kind === 'pt')
    editTarget.i = Math.min(editTarget.i, editTarget.road.points.length - 1);
  rebuildHandles();
  saveEdits();
  describeTarget();
  editOut.value = '';
  editOut.classList.remove('on');
});
document.getElementById('editExport').addEventListener('click', async () => {
  const objs = [];
  for (const info of editables.values()) {
    if (info.deleted || !objChanged(info)) continue;
    const g = info.group;
    const [hx, hy] = fromWorld(g.position.x, g.position.z);
    const [ox, oy] = fromWorld(info.orig.x, info.orig.z);
    objs.push({
      名稱: info.editId,
      位置: [hx, hy],
      原位置: [ox, oy],
      旋轉: +g.rotation.y.toFixed(3),
      原旋轉: +info.orig.rot.toFixed(3),
    });
  }
  const roads = ROADS.filter((r) => !r.isNew && !r.deleted && roadChanged(r)).map((r) => ({
    名稱: r.name,
    頂點: r.points,
  }));
  const extra = extraExport();
  const text =
    objs.length || roads.length || extra.length
      ? [
          '3D 校園調整',
          ...objs.map((o) => JSON.stringify(o)),
          ...roads.map((r) => JSON.stringify(r)),
          ...extra.map((o) => JSON.stringify(o)),
        ].join('\n')
      : '目前沒有任何調整';
  editOut.value = text;
  editOut.classList.add('on');
  editOut.focus();
  editOut.select();
  try {
    await navigator.clipboard.writeText(text);
    editSel.textContent = '已複製';
  } catch {
    editSel.textContent = '請全選下方文字複製';
  }
});

// 拖曳：在 #stage 的捕捉階段先攔下，避免同時轉動視角
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(e) {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
}
const stageEl = document.getElementById('stage');
stageEl.addEventListener(
  'pointerdown',
  (e) => {
    if (!editMode || e.button !== 0) return;
    if (boxHandleDown(e)) {
      controls.enabled = false;
      stageEl.setPointerCapture?.(e.pointerId);
      e.stopPropagation();
      return;
    }
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hh = raycaster.intersectObjects(handleGroup.children, false);
    if (hh.length) {
      const { road, i } = hh[0].object.userData.handle;
      selectPoint(road, i);
      pushUndo();
      drag = { kind: 'pt', road, i, moved: false };
    } else {
      const info = pick(e);
      if (!info || !info.editId) return;
      editSelect(info);
      pushUndo();
      const p = groundAt(e);
      if (!p) return;
      drag = {
        kind: 'obj',
        info,
        off: new THREE.Vector3(info.group.position.x - p.x, 0, info.group.position.z - p.z),
        moved: false,
      };
    }
    controls.enabled = false;
    stageEl.setPointerCapture?.(e.pointerId);
    e.stopPropagation();
  },
  true,
);
stageEl.addEventListener(
  'pointermove',
  (e) => {
    if (!drag) return;
    if (drag.kind === 'boxH' || drag.kind === 'boxC') {
      boxDragMove(e);
      e.stopPropagation();
      return;
    }
    const p = groundAt(e);
    if (!p) return;
    drag.moved = true;
    if (drag.kind === 'obj') {
      drag.info.group.position.x = p.x + drag.off.x;
      drag.info.group.position.z = p.z + drag.off.z;
    } else {
      drag.road.points[drag.i] = fromWorld(p.x, p.z);
      redrawRoad(drag.road);
      const h = handleGroup.children.find(
        (c) => c.userData.handle.road === drag.road && c.userData.handle.i === drag.i,
      );
      if (h) h.position.set(p.x, 1.5, p.z);
    }
    describeTarget();
    e.stopPropagation();
  },
  true,
);
const endDrag = () => {
  if (!drag) return;
  if (!drag.moved) undoStack.pop();
  else saveEdits();
  drag = null;
  controls.enabled = true;
};
stageEl.addEventListener('pointerup', endDrag, true);
stageEl.addEventListener('pointercancel', endDrag, true);
// 雙擊道路：在最近的線段上插入新頂點
stageEl.addEventListener(
  'dblclick',
  (e) => {
    if (!editMode) return;
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster
      .intersectObjects(roadMeshes, false)
      .filter((h) => !h.object.userData.road.deleted);
    if (!hits.length) return;
    const r = hits[0].object.userData.road;
    const q = fromWorld(hits[0].point.x, hits[0].point.z);
    let best = 0,
      bestD = Infinity;
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, ay] = r.points[i],
        [bx, by] = r.points[i + 1];
      const vx = bx - ax,
        vy = by - ay;
      const t = THREE.MathUtils.clamp(
        ((q[0] - ax) * vx + (q[1] - ay) * vy) / (vx * vx + vy * vy || 1),
        0,
        1,
      );
      const d = Math.hypot(ax + vx * t - q[0], ay + vy * t - q[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    editTarget = { kind: 'pt', road: r, i: best };
    pushUndo();
    r.points.splice(best + 1, 0, q);
    redrawRoad(r);
    selectPoint(r, best + 1);
    saveEdits();
  },
  true,
);
window.addEventListener('keydown', (e) => {
  if (!editMode || e.target.closest?.('input, textarea')) return;
  if (e.code === 'KeyQ') {
    rotateTarget(e.shiftKey ? 1 : 5);
    e.preventDefault();
  } else if (e.code === 'KeyE') {
    rotateTarget(e.shiftKey ? -1 : -5);
    e.preventDefault();
  } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    undo();
    e.preventDefault();
  } else if (
    (e.code === 'Delete' || e.code === 'Backspace') &&
    editTarget?.kind === 'pt' &&
    editTarget.road.points.length > 2
  ) {
    pushUndo();
    editTarget.road.points.splice(editTarget.i, 1);
    redrawRoad(editTarget.road);
    selectPoint(editTarget.road, Math.max(0, editTarget.i - 1));
    saveEdits();
    e.preventDefault();
  } else if ((e.code === 'Delete' || e.code === 'Backspace') && editTarget?.kind === 'obj') {
    deleteTarget();
    e.preventDefault();
  } else if (e.code === 'Escape') setEditMode(false);
});

// ---------- 編輯模式：定位方塊、新增道路、刪除 ----------
// 定位方塊：放一個可拉高、拉寬的方塊並取名，之後再依名稱做成正式建物或設施
const boxes = [];
let boxSeq = 1;
const BOX_MAT = new THREE.MeshStandardMaterial({
  color: 0xf0a050,
  transparent: true,
  opacity: 0.72,
  roughness: 0.7,
});
const boxPanel = document.getElementById('boxPanel');
const boxIn = {
  name: document.getElementById('boxName'),
  w: document.getElementById('boxW'),
  d: document.getElementById('boxD'),
  h: document.getElementById('boxH'),
};
const delBtn = document.getElementById('editDelete');
const BOX_H_MAT = new THREE.MeshBasicMaterial({ color: 0x1f6fd1, depthTest: false });
const BOX_C_MAT = new THREE.MeshBasicMaterial({ color: 0x2f9a5a, depthTest: false });

function makeBox({ name, x, y, rot = ROT, w = 20, d = 14, h = 12, id }) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), BOX_MAT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addEdges(mesh);
  const hH = new THREE.Mesh(HANDLE_GEO, BOX_H_MAT),
    hC = new THREE.Mesh(HANDLE_GEO, BOX_C_MAT);
  hH.renderOrder = hC.renderOrder = 11;
  hH.visible = hC.visible = false;
  g.add(mesh, hH, hC);
  const info = {
    no: 0,
    name,
    isBox: true,
    group: g,
    body: mesh,
    w,
    d,
    h,
    editId: id || `定位方塊 ${boxSeq++}`,
  };
  hH.userData.boxHandle = { info, kind: 'boxH' };
  hC.userData.boxHandle = { info, kind: 'boxC' };
  Object.assign(info, { mesh, hH, hC });
  mesh.userData.info = info;
  pickables.push(mesh);
  const label = makeLabel(name, 'box', () => select(info));
  g.add(label);
  info.label = label;
  const [wx, wz] = toWorld(x, y);
  g.position.set(wx, 0, wz);
  g.rotation.y = rot;
  scene.add(g);
  sizeBox(info);
  boxes.push(info);
  return info;
}
function sizeBox(info) {
  info.mesh.scale.set(info.w, info.h, info.d);
  info.mesh.position.y = info.h / 2;
  info.label.position.set(0, info.h + 6, 0);
  info.hH.position.set(0, info.h, 0);
  info.hC.position.set(info.w / 2, 0.6, info.d / 2);
  const k = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) / 260, 0.5, 4) * 1.3;
  info.hH.scale.setScalar(k);
  info.hC.scale.setScalar(k);
}
function removeBox(info) {
  scene.remove(info.group);
  const i = pickables.indexOf(info.mesh);
  if (i >= 0) pickables.splice(i, 1);
  const j = boxes.indexOf(info);
  if (j >= 0) boxes.splice(j, 1);
  info.label.element.remove();
}
function restoreBox(info) {
  scene.add(info.group);
  pickables.push(info.mesh);
  boxes.push(info);
  info.group.add(info.label);
}
const boxState = (i) => ({ w: i.w, d: i.d, h: i.h });

function updateBoxUI() {
  for (const b of boxes) {
    const on = editMode && editTarget?.kind === 'obj' && editTarget.info === b;
    b.hH.visible = b.hC.visible = on;
    if (on) sizeBox(b);
  }
  const b = editTarget?.kind === 'obj' && editTarget.info.isBox ? editTarget.info : null;
  boxPanel.style.display = b ? 'flex' : 'none';
  if (b && document.activeElement?.closest?.('#boxPanel') == null) {
    boxIn.name.value = b.name;
    boxIn.w.value = b.w;
    boxIn.d.value = b.d;
    boxIn.h.value = b.h;
  }
  delBtn.textContent = editTarget?.kind === 'pt' ? '刪除這條路' : '刪除';
  delBtn.disabled = !editTarget;
}
controls.addEventListener('change', () => {
  if (editMode) for (const b of boxes) if (b.hH.visible) sizeBox(b);
});

boxIn.name.addEventListener('input', () => {
  const b = editTarget?.info;
  if (!b?.isBox) return;
  b.name = boxIn.name.value.trim() || b.editId;
  b.label.element.textContent = b.name;
  saveEdits();
  describeTarget();
});
for (const key of ['w', 'd', 'h']) {
  boxIn[key].addEventListener('change', () => {
    const b = editTarget?.info;
    if (!b?.isBox) return;
    const v = parseFloat(boxIn[key].value);
    if (!(v > 0)) return;
    undoStack.push({ kind: 'boxsize', info: b, st: boxState(b) });
    b[key] = Math.round(v * 2) / 2;
    sizeBox(b);
    saveEdits();
    describeTarget();
  });
}

document.getElementById('addBox').addEventListener('click', () => {
  const [x, y] = fromWorld(controls.target.x, controls.target.z);
  const b = makeBox({ name: `定位方塊 ${boxSeq}`, x, y });
  undoStack.push({ kind: 'addbox', info: b });
  editSelect(b);
  saveEdits();
  boxIn.name.focus();
  boxIn.name.select();
});

// 方塊把手：藍點拉高、綠點拉寬深
function boxHandleDown(e) {
  const list = boxes.flatMap((b) => (b.hH.visible ? [b.hH, b.hC] : []));
  if (!list.length) return false;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(list, false)[0];
  if (!hit) return false;
  const { info, kind } = hit.object.userData.boxHandle;
  undoStack.push({ kind: 'boxsize', info, st: boxState(info) });
  drag = { kind, info, moved: false };
  return true;
}
function boxDragMove(e) {
  const b = drag.info;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (drag.kind === 'boxH') {
    // 通過方塊中心、面向相機的直立平面
    const n = new THREE.Vector3().subVectors(camera.position, b.group.position).setY(0).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, b.group.position);
    const p = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return;
    b.h = Math.max(0.5, Math.round(p.y * 2) / 2);
  } else {
    const p = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
    if (!p) return;
    const l = b.group.worldToLocal(p);
    b.w = Math.max(1, Math.round(Math.abs(l.x) * 2));
    b.d = Math.max(1, Math.round(Math.abs(l.z) * 2));
  }
  drag.moved = true;
  sizeBox(b);
  describeTarget();
  boxIn.w.value = b.w;
  boxIn.d.value = b.d;
  boxIn.h.value = b.h;
}

// 新增道路：在畫面中心放一段 30 m 的路，拖橘點、雙擊加點延伸
let roadSeq = 1;
function addRoad(name, points, width = 7) {
  ribbon(points, width, 0xd6d7d6, 0.16, name);
  const r = ROADS.at(-1);
  r.isNew = true;
  r.orig = null;
  for (const l of r.layers) {
    l.mesh.userData.road = r;
    roadMeshes.push(l.mesh);
  }
  return r;
}
document.getElementById('addRoad').addEventListener('click', () => {
  const [x, y] = fromWorld(controls.target.x, controls.target.z);
  let name = `新道路 ${roadSeq++}`;
  while (ROADS.some((r) => r.name === name)) name = `新道路 ${roadSeq++}`;
  const r = addRoad(name, [
    [x - 30, y],
    [x + 30, y],
  ]);
  undoStack.push({ kind: 'addroad', road: r });
  selectPoint(r, 1);
  saveEdits();
});

// 刪除：建物、方塊、整條道路；都能復原
function setRoadDeleted(r, on) {
  r.deleted = on;
  for (const l of r.layers) l.mesh.visible = !on;
}
function setObjDeleted(info, on) {
  info.deleted = on;
  info.group.visible = !on;
  if (info.label) info.label.element.style.display = on ? 'none' : '';
}
function deleteTarget() {
  if (!editTarget) return;
  if (editTarget.kind === 'pt') {
    const r = editTarget.road;
    undoStack.push({ kind: 'delroad', road: r });
    setRoadDeleted(r, true);
  } else {
    const info = editTarget.info;
    setHighlight(info, false);
    if (info.isBox) {
      undoStack.push({ kind: 'delbox', info });
      removeBox(info);
    } else {
      undoStack.push({ kind: 'delobj', info });
      setObjDeleted(info, true);
    }
    selected = null;
  }
  editTarget = null;
  rebuildHandles();
  saveEdits();
  describeTarget();
}
delBtn.addEventListener('click', deleteTarget);

function extraUndo(u) {
  if (u.kind === 'boxsize') {
    Object.assign(u.info, u.st);
    sizeBox(u.info);
  } else if (u.kind === 'addbox') {
    removeBox(u.info);
    if (editTarget?.info === u.info) editTarget = null;
  } else if (u.kind === 'delbox') restoreBox(u.info);
  else if (u.kind === 'delobj') setObjDeleted(u.info, false);
  else if (u.kind === 'delroad') setRoadDeleted(u.road, false);
  else if (u.kind === 'addroad') {
    setRoadDeleted(u.road, true);
    u.road.removed = true;
    if (editTarget?.road === u.road) editTarget = null;
  }
  rebuildHandles();
}
function extraSave(data) {
  data.deleted = [...editables.values()].filter((i) => i.deleted).map((i) => i.editId);
  data.boxes = boxes.map((b) => {
    const [x, y] = fromWorld(b.group.position.x, b.group.position.z);
    return {
      id: b.editId,
      name: b.name,
      x,
      y,
      rot: +b.group.rotation.y.toFixed(3),
      w: b.w,
      d: b.d,
      h: b.h,
    };
  });
  data.newRoads = ROADS.filter((r) => r.isNew && !r.deleted).map((r) => ({
    name: r.name,
    points: r.points,
    width: r.layers[0].width,
  }));
  data.deletedRoads = ROADS.filter((r) => !r.isNew && r.deleted).map((r) => r.name);
}
function extraExport() {
  const out = [];
  for (const b of boxes) {
    const [x, y] = fromWorld(b.group.position.x, b.group.position.z);
    out.push({
      新增方塊: b.name,
      位置: [x, y],
      旋轉: +b.group.rotation.y.toFixed(3),
      寬: b.w,
      深: b.d,
      高: b.h,
    });
  }
  for (const r of ROADS) if (r.isNew && !r.deleted) out.push({ 新增道路: r.name, 頂點: r.points });
  for (const i of editables.values()) if (i.deleted) out.push({ 刪除: i.editId });
  for (const r of ROADS) if (!r.isNew && r.deleted) out.push({ 刪除道路: r.name });
  return out;
}
function extraResetAll() {
  for (const b of [...boxes]) removeBox(b);
  for (const i of editables.values()) if (i.deleted) setObjDeleted(i, false);
  for (const r of ROADS) {
    if (r.isNew) {
      setRoadDeleted(r, true);
      r.removed = true;
    } else if (r.deleted) setRoadDeleted(r, false);
  }
  if (editTarget?.kind === 'obj' && editTarget.info.isBox) editTarget = null;
}
// 載入上次存的方塊、新道路、刪除
try {
  const data = JSON.parse(localStorage.getItem(EDIT_KEY) || 'null');
  if (data) {
    for (const b of data.boxes || []) makeBox(b);
    boxSeq = boxes.length + 1;
    for (const r of data.newRoads || [])
      if (Array.isArray(r.points) && r.points.length >= 2) {
        addRoad(r.name, r.points, r.width || 7);
        roadSeq++;
      }
    for (const id of data.deleted || []) {
      const i = editables.get(id);
      if (i) setObjDeleted(i, true);
    }
    for (const n of data.deletedRoads || []) {
      const r = ROADS.find((q) => q.name === n);
      if (r) setRoadDeleted(r, true);
    }
  }
} catch {
  /* 讀不到就略過 */
}
updateBoxUI();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// 供截圖用：?select=sac&explode=1
const params = new URLSearchParams(location.search);
if (params.get('select')) {
  const info = venueInfos.find((v) => v.id === params.get('select'));
  if (info) {
    select(info);
    if (params.get('explode')) toggleExplode(info);
    anim = null;
    const c = new THREE.Vector3();
    info.group.getWorldPosition(c);
    c.y = info.h / 2;
    const dir = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
    controls.target.copy(c);
    camera.position.copy(c.clone().add(dir.multiplyScalar(info.h > 30 ? 230 : 190)));
  }
}
if (params.get('labels')) toggleBtn.click();
// 供截圖用：?view=相機x,y,z,目標x,y,z
if (params.get('view')) {
  const n = params.get('view').split(',').map(Number);
  camera.position.set(n[0], n[1], n[2]);
  controls.target.set(n[3], n[4], n[5]);
}
if (params.get('room')) {
  const [vid, fname] = params.get('room').split(':');
  const info = venueInfos.find((v) => v.id === vid);
  if (info) {
    focusRoom(info, fname);
    anim = null;
    const c = new THREE.Vector3();
    info.group.getWorldPosition(c);
    c.y = info.h / 2 + 10;
    controls.target.copy(c);
    camera.position.copy(
      c
        .clone()
        .add(
          new THREE.Vector3(-0.55, 0.5, 0.66).normalize().multiplyScalar(info.h > 30 ? 240 : 190),
        ),
    );
  }
}

// ---------- 與平面地圖無縫切換 ----------
// 3D 世界座標 (x, z)（公尺）↔ 經緯度：相似變換（位移場已經修掉各區的局部偏差）。
// 東 + i·北 = GEO.a·(x − i·z) + GEO.b（以 lat0/lng0 為原點的地面公尺）。
const GEO = { lat0: 25.14969, lng0: 121.7761, a: [-0.937426, -0.002272], b: [111.414, 52.783] };
const EARTH_R = 6378137;
const COS0 = Math.cos((GEO.lat0 * Math.PI) / 180);
const GEO_SCALE = Math.hypot(GEO.a[0], GEO.a[1]); // 1 世界公尺 = 幾地面公尺
const cmul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
const cdiv = ([a, b], [c, d]) => {
  const n = c * c + d * d;
  return [(a * c + b * d) / n, (b * c - a * d) / n];
};
function worldToLatLng(x, z) {
  const [e, n] = cmul(GEO.a, [x, -z]);
  return {
    lat: GEO.lat0 + ((n + GEO.b[1]) / EARTH_R) * (180 / Math.PI),
    lng: GEO.lng0 + ((e + GEO.b[0]) / (EARTH_R * COS0)) * (180 / Math.PI),
  };
}
function latLngToWorld(lat, lng) {
  const e = (((lng - GEO.lng0) * Math.PI) / 180) * EARTH_R * COS0;
  const n = (((lat - GEO.lat0) * Math.PI) / 180) * EARTH_R;
  const [x, q] = cdiv([e - GEO.b[0], n - GEO.b[1]], GEO.a);
  return new THREE.Vector3(x, 0, -q);
}
// 平面地圖是北方朝上；俯視時相機稍微偏向南方，畫面上方就是北
const NORTH = (() => {
  const [x, q] = cdiv([0, 1], GEO.a);
  return new THREE.Vector2(x, -q).normalize();
})();
const AZ_NORTH_UP = Math.atan2(-NORTH.x, -NORTH.y);
const TOP_POLAR = 0.0005;
const FOV_3D = 35;
const FOV_FLAT = 1; // 視角 1° 幾乎等於平行投影，建物高度不會讓屋頂偏移
const HOME_SPH = new THREE.Spherical().setFromVector3(HOME.pos.clone().sub(HOME.target));
const BASE_FOG = [scene.fog.near, scene.fog.far];
// Leaflet（Web Mercator）在某緯度、某縮放等級下，每個螢幕像素代表的地面公尺
const metersPerPixel = (lat, zoom) =>
  (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom);
// 讓畫面高度剛好涵蓋 groundH 世界公尺所需的相機距離
const distFor = (fov, groundH) => groundH / 2 / Math.tan(THREE.MathUtils.degToRad(fov) / 2);

function applyView(v) {
  camera.fov = v.fov;
  camera.near = Math.max(1, v.dist - 2000);
  camera.far = Math.max(4000, v.dist + 3000);
  camera.updateProjectionMatrix();
  controls.target.copy(v.target);
  camera.position
    .copy(v.target)
    .add(new THREE.Vector3().setFromSphericalCoords(v.dist, v.polar, v.azimuth));
  camera.lookAt(v.target);
  // 霧的距離跟著相機距離放大，遠距離俯視時才不會整片起霧
  const k = Math.max(1, v.fogK);
  scene.fog.near = BASE_FOG[0] * k;
  scene.fog.far = BASE_FOG[1] * k;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerpAngle = (a, b, k) =>
  a + (((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI) * k;

// morph：{ segs, i, t, view, onDone } 播放中；{ parked: true } 停在平面狀態等外層切回來
let morph = null;
const currentView = () => {
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  return {
    target: controls.target.clone(),
    polar: sph.phi,
    azimuth: sph.theta,
    dist: sph.radius,
    fov: camera.fov,
    fogK: 1,
  };
};
const flatView = (target, groundH, fov) => {
  const dist = distFor(fov, groundH);
  return {
    target,
    polar: TOP_POLAR,
    azimuth: AZ_NORTH_UP,
    dist,
    fov,
    fogK: dist / distFor(FOV_3D, groundH),
  };
};
function freeze() {
  anim = null;
  held.clear();
  moveVel.set(0, 0, 0);
  controls.enabled = false;
}
function release() {
  morph = null;
  camera.near = 1;
  camera.far = 4000;
  camera.updateProjectionMatrix();
  scene.fog.near = BASE_FOG[0];
  scene.fog.far = BASE_FOG[1];
  controls.enabled = true;
  controls.update();
}
function playMorph(segs, onDone) {
  freeze();
  morph = { segs, i: 0, t: 0, onDone };
}
function stepMorph(dt) {
  if (!morph || morph.parked) return;
  const seg = morph.segs[morph.i];
  morph.t = Math.min(1, morph.t + dt / seg.dur);
  const k = easeInOut(morph.t);
  const { from, to } = seg;
  const v = {
    target: from.target.clone().lerp(to.target, k),
    polar: THREE.MathUtils.lerp(from.polar, to.polar, k),
    azimuth: lerpAngle(from.azimuth, to.azimuth, k),
    fov: THREE.MathUtils.lerp(from.fov, to.fov, k),
  };
  if (seg.dolly) {
    // 換視角時同步改距離，地面比例維持不變（推拉變焦），只有建物立面慢慢出現
    v.dist = distFor(v.fov, seg.groundH);
    v.fogK = v.dist / distFor(FOV_3D, seg.groundH);
  } else {
    v.dist = THREE.MathUtils.lerp(from.dist, to.dist, k);
    v.fogK = THREE.MathUtils.lerp(from.fogK, to.fogK, k);
  }
  applyView(v);
  if (morph.t >= 1) {
    morph.i += 1;
    morph.t = 0;
    if (morph.i >= morph.segs.length) {
      const done = morph.onDone;
      morph = null;
      done?.();
    }
  }
}

const postToParent = (msg) => {
  if (window.parent !== window) window.parent.postMessage(msg, location.origin);
};
let pendingTo3d = null;
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== window.parent) return;
  const m = e.data;
  if (!m || typeof m.type !== 'string') return;

  if (m.type === 'eventou:to-3d') {
    // 平面 → 立體 第 1 步：先停在與平面地圖完全重疊的俯視、近平行投影畫面
    const { lat, lng, zoom } = m;
    if (![lat, lng, zoom].every(Number.isFinite)) return;
    const groundH = (window.innerHeight * metersPerPixel(lat, zoom)) / GEO_SCALE;
    const start = flatView(latLngToWorld(lat, lng), groundH, FOV_FLAT);
    freeze();
    morph = { parked: true };
    applyView(start);
    pendingTo3d = { start, groundH };
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    requestAnimationFrame(() => postToParent({ type: 'eventou:3d-ready' }));
  }

  if (m.type === 'eventou:3d-begin' && pendingTo3d) {
    // 第 2 步：俯視不動、視角慢慢變成透視；第 3 步：才離開俯視，傾斜到立體視角
    const { start, groundH } = pendingTo3d;
    pendingTo3d = null;
    const persp = flatView(start.target, groundH, FOV_3D);
    const end = {
      ...persp,
      polar: HOME_SPH.phi,
      azimuth: HOME_SPH.theta,
      dist: THREE.MathUtils.clamp(persp.dist, controls.minDistance, controls.maxDistance),
      fogK: 1,
    };
    playMorph(
      [
        { from: start, to: persp, dur: 0.9, dolly: true, groundH },
        { from: persp, to: end, dur: 1.3 },
      ],
      release,
    );
  }

  if (m.type === 'eventou:to-2d') {
    // 立體 → 平面：反過來。先轉回北方朝上的俯視，再把視角收成近平行投影，最後交給平面地圖
    pendingTo3d = null;
    const from = currentView();
    const center = worldToLatLng(from.target.x, from.target.z);
    const nowGroundH = 2 * from.dist * Math.tan(THREE.MathUtils.degToRad(FOV_3D) / 2);
    const mpp = (nowGroundH * GEO_SCALE) / window.innerHeight;
    const zoom = THREE.MathUtils.clamp(
      Math.round(Math.log2((40075016.686 * Math.cos((center.lat * Math.PI) / 180)) / (256 * mpp))),
      15,
      19,
    );
    const groundH = (window.innerHeight * metersPerPixel(center.lat, zoom)) / GEO_SCALE;
    const ground = from.target.clone().setY(0);
    const top = flatView(ground, groundH, FOV_3D);
    const flat = flatView(ground, groundH, FOV_FLAT);
    playMorph(
      [
        { from, to: top, dur: 1.2 },
        { from: top, to: flat, dur: 0.8, dolly: true, groundH },
      ],
      () => {
        morph = { parked: true };
        postToParent({ type: 'eventou:2d-ready', lat: center.lat, lng: center.lng, zoom });
      },
    );
  }
});

// ---------- 按需繪製 ----------
// 場景大多時候是靜止的，每幀都重畫（上千個 draw call 加陰影）會讓整頁一直吃滿 CPU／GPU。
// 改成只有畫面會變的時候才畫：相機在動、動畫進行中、使用者正在操作。太陽固定，陰影只在建物移動時重算。
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
let dirtyFrames = 2; // 接下來還要畫幾幀
let shadowDirty = false;
const invalidate = (frames = 2) => {
  dirtyFrames = Math.max(dirtyFrames, frames);
};
// 任何輸入都可能改變畫面（點選高亮、編輯拖曳、面板操作），保守地多畫幾幀
for (const type of [
  'pointerdown',
  'pointermove',
  'pointerup',
  'wheel',
  'keydown',
  'keyup',
  'click',
]) {
  window.addEventListener(
    type,
    () => {
      invalidate(3);
      // 編輯模式會直接移動、旋轉建物，陰影要跟著重算
      if (editMode) shadowDirty = true;
    },
    { capture: true, passive: true },
  );
}
window.addEventListener('resize', () => invalidate());
controls.addEventListener('change', () => invalidate());
// 外層把立體模型藏起來時（切到平面地圖）整個暫停
let paused = false;
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== window.parent) return;
  if (e.data?.type === 'eventou:visibility') {
    paused = !e.data.visible;
    if (!paused) invalidate();
  }
});
document.addEventListener('visibilitychange', () => invalidate());

// ---------- 活動標記 ----------
// 外層地圖頁把篩選後的活動（經緯度＋摘要）傳進來；同一個地點的活動合成一個標記，點開看清單。
// 活動標題、地點都來自擷取的公告，一律用 textContent 放進畫面；連結只接受站內路徑。
const eventLayer = new THREE.Group();
scene.add(eventLayer);
const hitMeshes = [];
scene.traverse((o) => {
  if (o.isMesh) hitMeshes.push(o);
});
const rayDown = new THREE.Raycaster();
// 標記放在該點最高的表面上（屋頂或地面）
function surfaceY(x, z) {
  rayDown.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
  const hit = rayDown.intersectObjects(hitMeshes, false).find((h) => h.object.visible);
  return hit ? hit.point.y : 0;
}
const EVENT_CATEGORIES = new Set(['lecture', 'workshop', 'exhibition', 'sports', 'welfare']);
const safeHref = (href) =>
  typeof href === 'string' && href.startsWith('/') && !href.startsWith('//') ? href : null;
const eventsCard = document.createElement('div');
eventsCard.id = 'eventsCard';
eventsCard.className = 'card';
eventsCard.hidden = true;
document.body.append(eventsCard);

function showEventList(list) {
  const head = document.createElement('div');
  head.className = 'title-row';
  const heading = document.createElement('strong');
  heading.textContent = list.length > 1 ? `這裡有 ${list.length} 個活動` : '活動';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '關閉';
  close.addEventListener('click', () => {
    eventsCard.hidden = true;
  });
  head.append(heading, close);
  const ul = document.createElement('ul');
  for (const ev of list) {
    const li = document.createElement('li');
    if (ev.categoryLabel) {
      const chip = document.createElement('span');
      chip.className =
        'ev-cat cat-' + (EVENT_CATEGORIES.has(ev.category) ? ev.category : 'default');
      chip.textContent = String(ev.categoryLabel);
      li.append(chip);
    }
    const href = safeHref(ev.href);
    const title = document.createElement(href ? 'a' : 'span');
    title.className = 'ev-title';
    title.textContent = String(ev.title ?? '');
    if (href) {
      title.href = href;
      title.target = '_top'; // 在外層頁面開啟活動詳細頁
    }
    li.append(title);
    for (const line of Array.isArray(ev.details) ? ev.details : []) {
      if (!line) continue;
      const p = document.createElement('p');
      p.className = 'ev-detail';
      p.textContent = String(line);
      li.append(p);
    }
    ul.append(li);
  }
  eventsCard.replaceChildren(head, ul);
  eventsCard.hidden = false;
  infoEl.style.display = 'none';
}

function setEvents(events) {
  eventLayer.clear(); // CSS2DObject 被移除時會一併移除自己的 DOM 元素
  eventsCard.hidden = true;
  const groups = new Map();
  for (const ev of events) {
    if (!Number.isFinite(ev?.lat) || !Number.isFinite(ev?.lng)) continue;
    const key = `${ev.lat.toFixed(5)},${ev.lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }
  for (const list of groups.values()) {
    const p = latLngToWorld(list[0].lat, list[0].lng);
    const anchor = document.createElement('div');
    anchor.className = 'ev-anchor';
    const pin = document.createElement('button');
    pin.type = 'button';
    const cat = EVENT_CATEGORIES.has(list[0].category) ? list[0].category : 'default';
    pin.className = 'ev-pin cat-' + cat;
    pin.textContent =
      list.length > 1 ? String(list.length) : String(list[0].glyph ?? '●').slice(0, 2);
    const titles = list.map((ev) => String(ev.title ?? ''));
    pin.title = titles.join('\n');
    pin.setAttribute('aria-label', `${list.length} 個活動：${titles.join('、')}`);
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      showEventList(list);
      invalidate();
    });
    anchor.append(pin);
    const obj = new CSS2DObject(anchor);
    obj.position.set(p.x, surfaceY(p.x, p.z) + 2, p.z);
    eventLayer.add(obj);
  }
  invalidate();
}
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== window.parent) return;
  if (e.data?.type === 'eventou:events' && Array.isArray(e.data.events))
    setEvents(e.data.events.slice(0, 500));
});

// ---------- 移軸鏡頭效果 ----------
// 拉近時模仿移軸攝影：畫面中間一條清楚的帶狀區域，上下逐漸散焦，模糊處再帶一點色散，讓校園看起來像模型。
// 遠景或切換動畫時不套用，直接畫，避免多花效能。
const TILT_NEAR = 150; // 相機距離小於這個值時效果全開
const TILT_FAR = 280; // 大於這個值時完全關閉（約為看得清整棟行政大樓的距離）
const TILT_FOCUS = 0.5; // 清楚帶的中心（畫面由下往上 0–1）
const TILT_BAND = 0.14; // 清楚帶的半寬
const tiltBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    dir: { value: new THREE.Vector2() },
    amount: { value: 0 },
    focus: { value: TILT_FOCUS },
    band: { value: TILT_BAND },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 dir;
    uniform float amount, focus, band;
    varying vec2 vUv;
    void main() {
      float k = amount * smoothstep(band, band + 0.32, abs(vUv.y - focus));
      vec4 sum = texture2D(tDiffuse, vUv) * 0.2270270270;
      vec2 o1 = dir * k * 1.3846153846, o2 = dir * k * 3.2307692308;
      sum += (texture2D(tDiffuse, vUv + o1) + texture2D(tDiffuse, vUv - o1)) * 0.3162162162;
      sum += (texture2D(tDiffuse, vUv + o2) + texture2D(tDiffuse, vUv - o2)) * 0.0702702703;
      gl_FragColor = sum;
    }`,
};
const chromaShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0 },
    focus: { value: TILT_FOCUS },
    band: { value: TILT_BAND },
  },
  vertexShader: tiltBlurShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount, focus, band;
    varying vec2 vUv;
    void main() {
      float k = amount * smoothstep(band, band + 0.4, abs(vUv.y - focus));
      vec2 off = (vUv - vec2(0.5, focus)) * k * 0.006;
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(texture2D(tDiffuse, vUv + off).r, c.g, texture2D(tDiffuse, vUv - off).b, c.a);
    }`,
};
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// 可分離模糊（水平、垂直）做三輪，取樣間距小、不會出現重影
const blurPasses = [];
for (let i = 0; i < 3; i++) {
  for (const axis of ['x', 'y']) {
    const pass = new ShaderPass(tiltBlurShader);
    pass.axis = axis;
    blurPasses.push(pass);
    composer.addPass(pass);
  }
}
const chromaPass = new ShaderPass(chromaShader);
composer.addPass(chromaPass);
composer.addPass(new OutputPass());
function resizeComposer() {
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  const blurPx = 1.8; // 每輪取樣間距（像素），三輪疊加
  for (const pass of blurPasses) {
    pass.uniforms.dir.value.set(
      pass.axis === 'x' ? blurPx / window.innerWidth : 0,
      pass.axis === 'y' ? blurPx / window.innerHeight : 0,
    );
  }
}
resizeComposer();
window.addEventListener('resize', resizeComposer);
function renderView() {
  const dist = camera.position.distanceTo(controls.target);
  const strength = 1 - THREE.MathUtils.smoothstep(dist, TILT_NEAR, TILT_FAR);
  if (strength < 0.01) {
    renderer.render(scene, camera);
    return;
  }
  for (const pass of blurPasses) pass.uniforms.amount.value = strength;
  chromaPass.uniforms.amount.value = strength;
  composer.render();
}

const clock = new THREE.Clock();
const ease = (t) => 1 - Math.pow(1 - t, 3);
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (morph) {
    if (!morph.parked) stepMorph(dt);
    else if (dirtyFrames <= 0) return;
    dirtyFrames = Math.max(0, dirtyFrames - 1);
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    return;
  }
  if (paused || document.hidden) return;
  let moving = false;
  if (anim) {
    anim.t = Math.min(1, anim.t + dt / 0.9);
    const k = ease(anim.t);
    camera.position.lerpVectors(anim.fromPos, anim.toPos, k);
    controls.target.lerpVectors(anim.fromTgt, anim.toTgt, k);
    if (anim.t >= 1) anim = null;
    moving = true;
  }
  for (const v of venueInfos) {
    const goal = v.exploded ? 1 : 0;
    if (Math.abs(goal - v.t) < 1e-4) continue;
    v.t += (goal - v.t) * Math.min(1, dt * 6);
    if (Math.abs(goal - v.t) < 1e-4) v.t = goal;
    moving = true;
    shadowDirty = true;
    const lift = (v.basement || 0) * (FLOOR_H + 9);
    v.floorMeshes.forEach((fg, i) => {
      fg.position.y = fg.userData.baseY + v.t * (i * 9 + lift);
    });
  }
  // 鍵盤移動：速度隨與目標的距離縮放，加減速平滑
  {
    const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const want = new THREE.Vector3();
    if (held.has('f')) want.add(fwd);
    if (held.has('b')) want.sub(fwd);
    if (held.has('r')) want.add(right);
    if (held.has('l')) want.sub(right);
    const speed = Math.max(40, camera.position.distanceTo(controls.target) * 0.9);
    if (want.lengthSq()) {
      want.normalize().multiplyScalar(speed);
      anim = null;
    }
    moveVel.lerp(want, 1 - Math.exp(-dt * 12));
    if (moveVel.lengthSq() > 0.01) {
      const step = moveVel.clone().multiplyScalar(dt);
      camera.position.add(step);
      controls.target.add(step);
      moving = true;
    }
  }
  // update() 在阻尼減速還沒停下時回傳 true
  if (controls.update()) moving = true;
  if (moving) invalidate(1);
  if (dirtyFrames <= 0) return;
  dirtyFrames -= 1;
  if (shadowDirty) {
    renderer.shadowMap.needsUpdate = true;
    shadowDirty = false;
  }
  renderView();
  labelRenderer.render(scene, camera);
});
window.__ready = true;
postToParent({ type: 'eventou:3d-loaded' });
