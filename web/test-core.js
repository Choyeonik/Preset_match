// node web/test-core.js
const assert = require('assert');

const N = 64, PX = N * N;

// core.js는 브라우저용이라 캔버스만 흉내 낸다. 표본 크기를 이미 N으로 맞춰 두어 리샘플은 필요 없다.
global.window = global;
global.document = {
  createElement: () => {
    let src = null;
    return { set width(v) {}, set height(v) {}, getContext: () => ({ drawImage: s => { src = s; }, getImageData: () => ({ data: src.data }) }) };
  },
};
require('./js/core.js');
const { analyze, curveFn, embeddedJpegs } = window.RetoneCore;

console.log('analyze() — 보정 파라미터가 Reference에 실제로 가까워지게 하는가');

function img(fn) {
  const data = new Uint8ClampedArray(PX * 4);
  for (let i = 0; i < PX; i++) {
    const [r, g, b] = fn(i);
    data[i * 4] = r * 255; data[i * 4 + 1] = g * 255; data[i * 4 + 2] = b * 255; data[i * 4 + 3] = 255;
  }
  return { data };
}

// 결정적 의사난수 — 실행마다 같은 그림이라야 실패를 재현할 수 있다.
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const base = [];
for (let i = 0; i < PX; i++) base.push([0.25 + rnd() * 0.4, 0.3 + rnd() * 0.35, 0.28 + rnd() * 0.38]);
const original = img(i => base[i]);

// core.js 셰이더의 노출·대비·색온도 단계를 테스트 쪽에서 독립적으로 옮겨 적은 것.
const clamp = v => Math.min(1, Math.max(0, v));
const shade = (c, ex, co, te, ti, curve) => {
  const g = Math.pow(2, ex), k = 1 + co / 100 * 0.8;
  const out = [
    clamp((c[0] * g - 0.5) * k + 0.5 + te / 100 * 0.08 + ti / 100 * 0.03),
    clamp((c[1] * g - 0.5) * k + 0.5 - ti / 100 * 0.07),
    clamp((c[2] * g - 0.5) * k + 0.5 - te / 100 * 0.08 + ti / 100 * 0.03),
  ];
  if (!curve) return out;
  const f = curveFn(curve); // 셰이더와 같게 맨 마지막에 채널별로 먹인다
  return out.map(v => clamp(f(v)));
};

// 평균만 보면 대비 변화를 놓치므로 픽셀 단위로 잰다.
const rms = (a, b) => Math.sqrt(a.reduce((s, c, i) => s + (c[0] - b[i][0]) ** 2 + (c[1] - b[i][1]) ** 2 + (c[2] - b[i][2]) ** 2, 0) / (a.length * 3));

// 마지막 케이스는 평균도 표준편차도 거의 그대로인 채 분포 모양만 바꾼다 — 톤 커브라야 따라갈 수 있다.
const LIFT = [[0, 0.1], [0.25, 0.31], [0.5, 0.52], [0.75, 0.76], [1, 0.98]];
// 세 번째 값은 "원래 거리의 몇 배까지 남아도 되는가". 톤(노출·대비·커브)은 정확히 따라가야 하지만
// 화이트밸런스는 일부러 일부만 따라가므로(core.js의 WB_FOLLOW) 느슨하게 본다.
const CASES = [
  ['따뜻하고 밝게', [0.5, 0, 45, 0], 0.2],
  ['차갑고 어둡게', [-0.4, 0, -50, 0], 0.3],
  ['대비 강하게', [0, 45, 0, 0], 0.1],
  ['녹색으로 치우치게', [0, 0, 0, -35], 0.8],
  ['암부 들뜬 필름조', [0, 0, 0, 0, LIFT], 0.15],
];

const seen = new Set();
for (const [name, look, tol] of CASES) {
  const refPx = base.map(c => shade(c, ...look));
  const P = analyze(original, img(i => refPx[i]));

  const before = rms(base, refPx);
  const after = rms(base.map(c => shade(c, P.exposure, P.contrast, P.temperature, P.tint, P.curve)), refPx);

  // 값을 먼저 찍는다 — 실패했을 때 무엇이 어긋났는지 보이려면 assert보다 앞서야 한다
  console.log(`  ${name.padEnd(12)} 거리 ${before.toFixed(4)} → ${after.toFixed(4)}  노출 ${P.exposure} 대비 ${P.contrast} 색온도 ${P.temperature} 색조 ${P.tint}`);
  assert.ok(after < before * tol, `${name}: 색 거리가 충분히 줄지 않음 (${before.toFixed(4)} → ${after.toFixed(4)}, 기준 ${(before * tol).toFixed(4)})`);
  seen.add(JSON.stringify([P.exposure, P.contrast, P.temperature, P.tint]));
}

// Reference마다 다른 값이 나와야 한다 — 고정 상수로 되돌아가면 여기서 걸린다.
assert.strictEqual(seen.size, CASES.length, 'Reference가 달라도 같은 파라미터가 나옴');

// 자기 자신을 Reference로 주면 손댈 것이 없다.
const same = analyze(original, original);
assert.ok(Math.abs(same.exposure) < 0.1 && Math.abs(same.temperature) < 6 && Math.abs(same.tint) < 6, `동일 이미지인데 보정값이 큼: ${JSON.stringify(same)}`);
assert.ok(same.curve.every(([x, y]) => Math.abs(y - x) < 0.03), `동일 이미지인데 톤 커브가 휘었다: ${JSON.stringify(same.curve)}`);
const hslMax = Math.max(...Object.values(same.hsl).flat().map(Math.abs));
assert.ok(hslMax <= 3, `동일 이미지인데 색대별 HSL이 움직였다: 최대 ${hslMax}`);
// 색이 충분히 있어야 HSL 경로가 실제로 돌아간 것이다 — 전부 0이면 표본 부족으로 건너뛴 것일 수 있다
const touched = analyze(original, img(i => base[i].map((v, c) => clamp(c === 1 ? v * 1.3 : v))));
assert.ok(Object.values(touched.hsl).flat().some(v => v !== 0), 'HSL이 한 색대도 계산되지 않았다 (표본 부족?)');
console.log('  ok  동일 이미지       보정값·톤 커브·HSL 거의 0');


console.log('\nembeddedJpegs() — RAW 바이트에서 내장 JPEG 꺼내기');

const jpeg = n => { // n바이트짜리 가짜 JPEG (SOI + APP0 … EOI)
  const b = new Uint8Array(n).fill(0x42);
  b[0] = 0xFF; b[1] = 0xD8; b[2] = 0xFF; b[3] = 0xE0; b[n - 2] = 0xFF; b[n - 1] = 0xD9;
  return b;
};
const fakeMarkers = n => { // 압축 데이터에 우연히 박힌 FFD8 … FFD9 — 뒤에 APPn이 없다
  const b = new Uint8Array(n).fill(0x77);
  b[0] = 0xFF; b[1] = 0xD8; b[n - 2] = 0xFF; b[n - 1] = 0xD9;
  return b;
};
const junk = n => new Uint8Array(n).fill(0x11);
const glue = (...parts) => { // RAW 파일을 흉내 낸 바이트 뭉치
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0; parts.forEach(p => { out.set(p, at); at += p.length; });
  return new Blob([out]);
};

(async () => {
  // 작은 썸네일과 큰 미리보기가 같이 들어 있으면 큰 쪽이 먼저 와야 한다.
  const two = await embeddedJpegs(glue(junk(40), jpeg(64), junk(24), jpeg(300), junk(16)));
  assert.strictEqual(two.length, 2, `후보가 2개여야 하는데 ${two.length}개`);
  assert.deepStrictEqual(two.map(b => b.size), [300, 64], '큰 것부터 정렬되지 않음');
  const bytes = new Uint8Array(await two[0].arrayBuffer());
  assert.ok(bytes[0] === 0xFF && bytes[1] === 0xD8, 'SOI에서 시작하지 않음');
  assert.ok(bytes[298] === 0xFF && bytes[299] === 0xD9, 'EOI까지 포함하지 않음'); // 끝 마커를 자르는 off-by-one 방지
  console.log('  ok  큰 것부터 정렬     300, 64바이트 · SOI~EOI 온전');

  assert.deepStrictEqual(await embeddedJpegs(glue(junk(200))), [], 'JPEG가 없는데 무언가를 반환함');
  console.log('  ok  JPEG 없음        빈 배열');

  // 끝나지 않은 SOI가 앞에 있어도 뒤의 온전한 JPEG를 찾아야 한다.
  const tail = await embeddedJpegs(glue(new Uint8Array([0xFF, 0xD8]), junk(50), jpeg(120)));
  assert.deepStrictEqual(tail.map(b => b.size), [120], `잘린 SOI에 걸려 ${tail.map(b => b.size)}를 집었다`);
  console.log('  ok  잘린 SOI 무시     120바이트');

  // 실제 RAW에서 미리보기를 놓치던 원인 — 우연한 마커가 만든 거대한 구간이 진짜를 밀어냈다.
  const mixed = await embeddedJpegs(glue(junk(20), fakeMarkers(5000), junk(30), jpeg(400)));
  assert.deepStrictEqual(mixed.map(b => b.size), [400], `가짜 마커를 걸러내지 못하고 ${mixed.map(b => b.size)}를 집었다`);
  console.log('  ok  우연한 마커 제외   진짜 400바이트만');

  console.log('\n통과');
})();
