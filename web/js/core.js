(function () {
  const HSL_KEYS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
  const HSL_CENTERS = [0, 30, 60, 120, 180, 240, 275, 315];
  const AUTO = {
    exposure: 0.35, contrast: 12, highlights: -24, shadows: 18, whites: 6, blacks: -10,
    temperature: 14, tint: 4, vibrance: 16, saturation: -6,
    texture: 15, clarity: -20, dehaze: -5, // 실제 라이트룸 프리셋 10개의 중앙값 — 색감 분석 대상이 아니라 데모 기본값
    hsl: { red: [0, 0, 0], orange: [4, -8, 6], yellow: [-6, -10, 0], green: [10, -20, -4], aqua: [0, -10, 0], blue: [-12, -18, -6], purple: [0, 0, 0], magenta: [0, 0, 0] },
    grading: { shadows: [210, 12], midtones: [30, 6], highlights: [40, 14], balance: 0 },
    curve: [[0, 0.04], [0.25, 0.22], [0.5, 0.5], [0.75, 0.79], [1, 0.97]],
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const WB_FOLLOW = 0.4; // 레퍼런스의 화이트밸런스를 따라가는 비율. 나머지는 원본의 조명을 그대로 둔다.
  const LUM = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  function neutral() {
    const hsl = {}; HSL_KEYS.forEach(k => hsl[k] = [0, 0, 0]);
    return {
      exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
      temperature: 0, tint: 0, vibrance: 0, saturation: 0,
      texture: 0, clarity: 0, dehaze: 0, // 64x64 표본으로는 국소 대비·안개 정도를 가늠할 수 없어 분석 대상에서 뺀다
      hsl,
      grading: { shadows: [0, 0], midtones: [0, 0], highlights: [0, 0], balance: 0 },
      curve: [[0, 0], [0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [1, 1]],
    };
  }

  function samplePixels(src, n) {
    try {
      const c = document.createElement('canvas'); c.width = c.height = n;
      const x = c.getContext('2d');
      x.drawImage(src, 0, 0, n, n);
      const d = x.getImageData(0, 0, n, n).data, p = new Float32Array(n * n * 3);
      for (let i = 0, j = 0; j < p.length; i += 4, j += 3) { p[j] = d[i] / 255; p[j + 1] = d[i + 1] / 255; p[j + 2] = d[i + 2] / 255; }
      return p;
    } catch (e) { return null; } // 교차 출처 이미지면 캔버스가 오염되어 읽을 수 없다
  }

  function moments(p) {
    const n = p.length / 3; let ml = 0, ms = 0, wr = 0, wg = 0, wb = 0, ww = 0;
    for (let i = 0; i < p.length; i += 3) {
      ml += LUM(p[i], p[i + 1], p[i + 2]);
      const mx = Math.max(p[i], p[i + 1], p[i + 2]), mn = Math.min(p[i], p[i + 1], p[i + 2]);
      const s = mx > 1e-6 ? (mx - mn) / mx : 0;
      ms += s;
      // 채널 평균은 무채색에 가까운 픽셀을 무겁게 센다. 그냥 평균을 내면 하늘이나 단풍처럼
      // 크고 진한 색면이 기준을 통째로 끌고 가, 색감을 옮긴다는 것이 사진을 그 색으로 물들이는 일이 된다.
      const w = 1 - s;
      wr += p[i] * w; wg += p[i + 1] * w; wb += p[i + 2] * w; ww += w;
    }
    ml /= n; ww = ww || 1;
    let vl = 0;
    for (let i = 0; i < p.length; i += 3) vl += Math.pow(LUM(p[i], p[i + 1], p[i + 2]) - ml, 2);
    return { r: wr / ww, g: wg / ww, b: wb / ww, lum: ml, sd: Math.sqrt(vl / n), sat: ms / n };
  }

  // 위 셰이더의 노출·대비·색온도 단계를 CPU에서 같은 식으로 재현한다.
  // 각 파라미터를 잔차로 구해야 해서, 한 단계를 정할 때마다 표본에 적용하고 다음을 잰다.
  function applyStep(p, gain, k, te, ti) {
    for (let i = 0; i < p.length; i += 3) {
      const r = (p[i] * gain - 0.5) * k + 0.5 + te * 0.08 + ti * 0.03;
      const g = (p[i + 1] * gain - 0.5) * k + 0.5 - ti * 0.07;
      const b = (p[i + 2] * gain - 0.5) * k + 0.5 - te * 0.08 + ti * 0.03;
      p[i] = clamp(r, 0, 1); p[i + 1] = clamp(g, 0, 1); p[i + 2] = clamp(b, 0, 1);
    }
  }

  // 셰이더가 HSL을 먹이는 방식 그대로, 8개 색상대별 평균 채도·명도를 가중 평균으로 잰다.
  // 실제 라이트룸 프리셋이 색감을 만드는 주역이 여기라, 전역 채도만으로는 옮겨지지 않는다.
  function hueBands(p) {
    const acc = HSL_CENTERS.map(() => ({ s: 0, v: 0, w: 0 }));
    for (let i = 0; i < p.length; i += 3) {
      const r = p[i], g = p[i + 1], b = p[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
      if (mx < 1e-6 || c / mx < 0.08) continue; // 무채색에 가까우면 어느 색대인지 말할 수 없다
      const h = 60 * (mx === r ? ((g - b) / c + 6) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4);
      for (let j = 0; j < 8; j++) {
        const d = Math.abs(((h - HSL_CENTERS[j] + 180) % 360 + 360) % 360 - 180);
        const w = Math.max(0, 1 - d / 42); // 셰이더와 같은 42도 폭
        if (w <= 0) continue;
        acc[j].s += (c / mx) * w; acc[j].v += mx * w; acc[j].w += w;
      }
    }
    return acc.map(a => a.w > 50 ? { s: a.s / a.w, v: a.v / a.w } : null); // 표본이 적은 색대는 잡음이라 건드리지 않는다
  }

  // 휘도를 뺀 평균 색 편차. 셰이더의 tintOf()와 같은 공간이라 그대로 역산할 수 있다.
  function tintBias(p, lo, hi, scale) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < p.length; i += 3) {
      const L = LUM(p[i], p[i + 1], p[i + 2]);
      if (L < lo || L >= hi) continue;
      r += p[i] - L; g += p[i + 1] - L; b += p[i + 2] - L; n++;
    }
    return n ? [r / n * scale, g / n * scale, b / n * scale] : [0, 0, 0];
  }

  // 색 편차 벡터 → Color Grading의 [색상°, 채도]. 셰이더가 tintOf(h)*sat*w로 더하고
  // tintOf()는 chroma가 항상 1이므로, 편차의 chroma를 w로 나누면 채도가 바로 나온다.
  function toGrade(d, w) {
    const mx = Math.max(d[0], d[1], d[2]), mn = Math.min(d[0], d[1], d[2]), c = mx - mn;
    if (c < 2e-3) return [0, 0];
    const h = mx === d[0] ? ((d[1] - d[2]) / c + 6) % 6 : mx === d[1] ? (d[2] - d[0]) / c + 2 : (d[0] - d[1]) / c + 4;
    return [Math.round(h * 60), Math.round(clamp(c / w * 100, 0, 35))]; // 상한이 높으면 장면이 다를 때 색이 통째로 튄다
  }

  // 휘도 누적분포. 평균·표준편차로는 분포의 모양(들뜬 암부 같은)이 잡히지 않아 따로 본다.
  function lumCdf(p) {
    const h = new Float64Array(64), n = p.length / 3;
    for (let i = 0; i < p.length; i += 3) h[Math.min(63, Math.floor(LUM(p[i], p[i + 1], p[i + 2]) * 64))]++;
    let s = 0;
    return h.map(v => (s += v / n));
  }

  // 누적분포를 맞추는 톤 커브. 노출·대비가 이미 평균과 폭을 맞춘 뒤라 여기 남는 건 모양 차이뿐이다.
  function matchCurve(O, R) {
    const a = lumCdf(O), b = lumCdf(R);
    const inv = q => { // 같은 누적 비율에 해당하는 Reference 쪽 휘도
      let i = 0; while (i < 63 && b[i] < q) i++;
      const lo = i ? b[i - 1] : 0;
      return (i + (b[i] > lo ? (q - lo) / (b[i] - lo) : 0)) / 64;
    };
    return [0, 0.25, 0.5, 0.75, 1].map(x => {
      const i = Math.round(x * 64) - 1; // a[i]는 구간 끝까지의 누적이라 한 칸 당겨야 x와 맞는다
      const q = i < 0 ? 0 : a[i];
      // 사진에 없는 밝기 구간은 누적분포가 0이나 1로 포화되어 엉뚱한 곳을 가리킨다. 그대로 둔다.
      const y = q < 0.02 || q > 0.98 ? x : inv(q);
      // 실제 프리셋은 암부를 0→11~36(0.04~0.14)까지 들어올린다. 그 폭은 허용하되 그 이상은 막는다.
      return [x, clamp(y, x - 0.16, x + 0.16)];
    });
  }

  // Original을 Reference의 색감에 맞추는 파라미터를 만든다. 표본을 읽지 못하면 고정 기본값으로 물러난다.
  function analyze(origImg, refImg) {
    const O = samplePixels(origImg, 64), R = samplePixels(refImg, 64);
    if (!O || !R) return clone(AUTO);
    const P = neutral(), so = moments(O), sr = moments(R);

    // 노출·대비·색온도·색조는 서로의 평균을 밀어내서, 하나씩 잔차로 재면 값이 옆 파라미터로 샌다.
    // 셰이더 식 out = (in*g-.5)*k + .5 + WB 에서 표준편차는 곱 g*k만 따르고 덧셈인 WB는 타지 않는다.
    // 그래서 비율로 g*k를 먼저 못박고, 남은 g·k·te·ti를 채널 평균 세 개로 한 번에 푼다.
    const ratio = sr.sd / (so.sd + 1e-4);
    const uR = sr.r - so.r * ratio, uG = sr.g - so.g * ratio, uB = sr.b - so.b * ratio;
    // 레퍼런스의 색조에는 그 장면의 조명과 작가가 입힌 색이 섞여 있다. 앞의 것까지 옮기면 사진이
    // 그 색으로 물들기만 하므로, 화이트밸런스는 일부만 따라가고 원본의 조명을 대체로 지킨다.
    // (라이트룸 프리셋도 보통 화이트밸런스는 사진마다 따로 맞추게 두고 룩만 싣는다.)
    const teFull = (uR - uB) / 0.16, tiFull = ((uR + uB) / 2 - uG) / 0.1;
    P.temperature = clamp(Math.round(teFull * 100 * WB_FOLLOW), -30, 30);
    P.tint = clamp(Math.round(tiFull * 100 * WB_FOLLOW), -30, 30);
    // 톤은 화이트밸런스가 온전히 적용된다고 보고 푼다 — 줄인 몫을 노출·대비가 대신 흡수하려 들면
    // 색은 색대로 안 맞고 밝기까지 틀어진다. 못 따라간 색조는 그냥 남겨 두는 편이 낫다.
    const kRaw = clamp(1 - 2 * (uG + 0.07 * tiFull), 0.2, 1.8);
    P.exposure = clamp(Math.round(Math.log2(clamp(ratio / kRaw, 0.125, 8)) * 20) / 20, -3, 3);
    const k = clamp(ratio / Math.pow(2, P.exposure), 0.2, 1.8); // 노출을 슬라이더 눈금으로 반올림한 오차까지 대비가 흡수한다
    P.contrast = Math.round((k - 1) / 0.8 * 100);
    applyStep(O, Math.pow(2, P.exposure), k, P.temperature / 100, P.tint / 100);

    const globalSat = sr.sat / (moments(O).sat + 1e-3);
    P.saturation = clamp(Math.round((globalSat - 1) * 100), -80, 80);

    // 전역 채도가 공통 성분이라면, HSL은 색대마다 그보다 더/덜 나가는 몫이다.
    const bo = hueBands(O), br = hueBands(R);
    HSL_KEYS.forEach((k, j) => {
      const a = bo[j], b = br[j];
      if (!a || !b) return; // 두 사진 중 한쪽에 그 색이 거의 없으면 비교할 것이 없다
      P.hsl[k][1] = clamp(Math.round((b.s / (a.s + 1e-3) / globalSat - 1) * 100), -60, 60);
      // 셰이더는 명도를 h.z *= 1 + dl*0.5*h.y 로 먹이므로, 그 자리의 채도로 나눠 되돌린다
      P.hsl[k][2] = clamp(Math.round((b.v / (a.v + 1e-3) - 1) / (0.5 * a.s + 0.05) * 100), -40, 40);
    });

    // 채도 보정은 색 편차를 거의 비례해 키우므로, 표본을 다시 돌리지 않고 배율로 근사한다.
    const sk = 1 + P.saturation / 100;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dS = sub(tintBias(R, 0, 0.35, 1), tintBias(O, 0, 0.35, sk));
    const dM = sub(tintBias(R, 0.35, 0.65, 1), tintBias(O, 0.35, 0.65, sk));
    const dH = sub(tintBias(R, 0.65, 1.01, 1), tintBias(O, 0.65, 1.01, sk));
    // 세 구간에 공통으로 깔린 색조는 화이트밸런스가 맡을 몫이다. 중간톤을 기준으로 빼내면
    // 그레이딩에는 "어두운 곳과 밝은 곳이 서로 다르게 물든 정도"만 남는다 — 일부러 덜 따라가기로 한
    // 화이트밸런스가 여기로 새어 들어와 사진 전체를 물들이는 일도 이걸로 막힌다.
    P.grading.shadows = toGrade(sub(dS, dM), 0.4);
    P.grading.midtones = [0, 0];
    P.grading.highlights = toGrade(sub(dH, dM), 0.4);

    P.curve = matchCurve(O, R);
    return P;
  }

  // RAW에는 카메라가 만들어 넣은 JPEG 미리보기가 들어 있다. RAW를 현상하는 대신 그 조각을 꺼낸다.
  // 압축 데이터에도 FFD8/FFD9는 우연히 나타나므로 하나로 확정하지 않고 큰 것부터 후보로 돌려준다.
  // 어느 것이 진짜인지는 실제로 디코딩해 보는 쪽이 가린다.
  async function embeddedJpegs(file, limit = 5) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const opens = [], found = [];
    for (let i = 0; i + 1 < buf.length; i++) {
      if (buf[i] !== 0xFF) continue;
      if (buf[i + 1] === 0xD8) opens.push(i);
      else if (buf[i + 1] === 0xD9 && opens.length) {
        // 미리보기 안에 썸네일이 또 들어 있기도 하고 끝나지 않은 SOI가 섞이기도 해서,
        // 가장 최근 SOI와 짝지어야 중첩은 안쪽부터 닫히고 잘린 SOI는 남겨진 채 무시된다.
        const start = opens.pop();
        // 진짜 JPEG면 SOI 뒤에 APPn이나 DQT가 붙는다. 우연히 맞아떨어진 구간은 여기서 대부분 걸러진다.
        const m = buf[start + 3];
        if (buf[start + 2] === 0xFF && ((m >= 0xE0 && m <= 0xEF) || m === 0xDB)) found.push({ start, len: i + 2 - start });
      }
    }
    return found.sort((a, b) => b.len - a.len).slice(0, limit)
      .map(c => new Blob([buf.subarray(c.start, c.start + c.len)], { type: 'image/jpeg' }));
  }

  // 파일 어디에 있든 TIFF 헤더를 찾아 IFD0의 Orientation(0x0112)을 읽는다.
  // RAW에서 잘라낸 미리보기에는 EXIF가 딸려오지 않아, 세로/가로는 원본 파일에서 따로 가져와야 한다.
  async function exifOrientation(file) {
    const buf = new Uint8Array(await file.slice(0, 262144).arrayBuffer()); // 헤더는 파일 앞쪽에 있다
    const dv = new DataView(buf.buffer);
    for (let i = 0; i + 8 < buf.length; i++) {
      const le = buf[i] === 0x49 && buf[i + 1] === 0x49 && buf[i + 2] === 0x2A && buf[i + 3] === 0x00;
      if (!le && !(buf[i] === 0x4D && buf[i + 1] === 0x4D && buf[i + 2] === 0x00 && buf[i + 3] === 0x2A)) continue;
      const ifd = i + dv.getUint32(i + 4, le);
      if (ifd + 2 > buf.length) continue;
      const n = dv.getUint16(ifd, le);
      if (n > 200) continue; // 우연히 맞아떨어진 바이트열이면 엔트리 수가 터무니없이 나온다
      for (let e = 0; e < n; e++) {
        const p = ifd + 2 + e * 12;
        if (p + 12 > buf.length) break;
        if (dv.getUint16(p, le) === 0x0112) {
          const v = dv.getUint16(p + 8, le);
          if (v >= 1 && v <= 8) return v;
        }
      }
    }
    return 1;
  }

  function curveFn(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0]);
    const n = p.length;
    if (n < 2) return x => x;
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0] || 1e-6; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    return x => {
      if (x <= p[0][0]) return p[0][1];
      if (x >= p[n - 1][0]) return p[n - 1][1];
      let i = 0; while (x > p[i + 1][0]) i++;
      const h = dx[i], u = (x - p[i][0]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * p[i][1] + (u3 - 2 * u2 + u) * h * t[i] + (-2 * u3 + 3 * u2) * p[i + 1][1] + (u3 - u2) * h * t[i + 1];
    };
  }

  // ponytail: 텍스처·부분 대비(clarity)는 진짜 언샤프 마스크(블러 후 차분) 대신 2·8텍셀 반경의
  // 4탭 평균으로 근사한다. 디헤이즈도 다크 채널 프라이어가 아니라 대비+채도+암부 근사다.
  // 결과가 부족하면: 블러를 밉맵 기반 다운샘플로 바꾸거나(정사각 텍스처 전제 필요), 실제 헤이즈 추정으로.
  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const FS = `precision highp float;varying vec2 v;
uniform sampler2D img,lut;uniform float ex,co,hi,sh,wh,bl,te,ti,vi,sa,st,sp,bal,tx,cl,hz;
uniform vec3 hsl[8];uniform float hc[8];uniform vec2 gS,gM,gH,texel;
vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1e-10;return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);}
vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 tintOf(float h){vec3 k=hsv2rgb(vec3(h,1.,1.));return k-vec3(lum(k));}
void main(){
vec3 o=texture2D(img,v).rgb;vec3 c=o*exp2(ex);float L=lum(c);
c+=bl*.12*(1.-smoothstep(0.,.35,L));c+=wh*.12*smoothstep(.6,1.,L);
c+=sh*.28*(1.-smoothstep(0.,.55,L))*(1.-L);c+=hi*.28*smoothstep(.45,1.,L);
c=(c-.5)*(1.+co*.8)+.5;
c.r+=te*.08;c.b-=te*.08;c.g-=ti*.07;c.r+=ti*.03;c.b+=ti*.03;
c=clamp(c,0.,1.);
if(hz!=0.){c=(c-.5)*(1.+hz*.35)+.5;c-=hz*.06*(1.-smoothstep(0.,.5,lum(c)));c=clamp(c,0.,1.);}
if(tx!=0.||cl!=0.){
vec3 b1=(texture2D(img,v+vec2(texel.x,0.)).rgb+texture2D(img,v-vec2(texel.x,0.)).rgb+texture2D(img,v+vec2(0.,texel.y)).rgb+texture2D(img,v-vec2(0.,texel.y)).rgb)*.25;
vec3 b2=(texture2D(img,v+texel*4.).rgb+texture2D(img,v-texel*4.).rgb+texture2D(img,v+vec2(texel.x,-texel.y)*4.).rgb+texture2D(img,v+vec2(-texel.x,texel.y)*4.).rgb)*.25;
c+=(o-b1)*tx*.9+(o-b2)*cl*.7;c=clamp(c,0.,1.);
}
vec3 h=rgb2hsv(c);float hd=h.x*360.;float dh=0.,ds=0.,dl=0.;
for(int i=0;i<8;i++){float d=abs(mod(hd-hc[i]+180.,360.)-180.);float w=max(0.,1.-d/42.);dh+=w*hsl[i].x;ds+=w*hsl[i].y;dl+=w*hsl[i].z;}
h.x=fract(h.x+dh*30./360.+1.);h.y=clamp(h.y*(1.+ds),0.,1.);h.z=clamp(h.z*(1.+dl*.5*h.y),0.,1.);
h.y=clamp(h.y*(1.+vi*(1.-h.y)),0.,1.);h.y=clamp(h.y*(1.+sa+hz*.3),0.,1.);
c=hsv2rgb(h);L=lum(c);float pv=.5+bal*.3;
float ws=1.-smoothstep(0.,pv,L);float wH=smoothstep(pv,1.,L);float wm=clamp(1.-ws-wH,0.,1.);
c+=tintOf(gS.x)*gS.y*ws*.4+tintOf(gM.x)*gM.y*wm*.3+tintOf(gH.x)*gH.y*wH*.4;
c=clamp(c,0.,1.);
c=vec3(texture2D(lut,vec2(c.r,.5)).r,texture2D(lut,vec2(c.g,.5)).r,texture2D(lut,vec2(c.b,.5)).r);
c=mix(o,c,st);if(v.x<sp)c=o;gl_FragColor=vec4(c,1.);}`;

  function createRenderer(canvas) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) return null;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(x)); return x; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n);
    const mkTex = unit => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; };
    const imgTex = mkTex(0), lutTex = mkTex(1);
    gl.uniform1i(U('img'), 0); gl.uniform1i(U('lut'), 1);
    gl.uniform1fv(U('hc'), new Float32Array(HSL_CENTERS));
    let ready = false, lastCurve = '';
    return {
      setImage(im) {
        const max = 2400, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        canvas.width = Math.round(im.naturalWidth * s); canvas.height = Math.round(im.naturalHeight * s);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(U('texel'), 1 / canvas.width, 1 / canvas.height);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, imgTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
        ready = true;
      },
      render(P, strength, split) {
        if (!ready) return;
        const key = JSON.stringify(P.curve);
        if (key !== lastCurve) {
          lastCurve = key; const f = curveFn(P.curve), d = new Uint8Array(256);
          for (let i = 0; i < 256; i++) d[i] = Math.max(0, Math.min(255, Math.round(f(i / 255) * 255)));
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lutTex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, d);
        }
        const f = (n, x) => gl.uniform1f(U(n), x);
        f('ex', P.exposure); f('co', P.contrast / 100); f('hi', P.highlights / 100); f('sh', P.shadows / 100);
        f('wh', P.whites / 100); f('bl', P.blacks / 100); f('te', P.temperature / 100); f('ti', P.tint / 100);
        f('vi', P.vibrance / 100); f('sa', P.saturation / 100); f('st', strength); f('sp', split); f('bal', P.grading.balance / 100);
        f('tx', (P.texture || 0) / 100); f('cl', (P.clarity || 0) / 100); f('hz', (P.dehaze || 0) / 100);
        const arr = []; HSL_KEYS.forEach(k => arr.push(P.hsl[k][0] / 100, P.hsl[k][1] / 100, P.hsl[k][2] / 100));
        gl.uniform3fv(U('hsl'), new Float32Array(arr));
        const g = P.grading;
        gl.uniform2f(U('gS'), g.shadows[0] / 360, g.shadows[1] / 100);
        gl.uniform2f(U('gM'), g.midtones[0] / 360, g.midtones[1] / 100);
        gl.uniform2f(U('gH'), g.highlights[0] / 360, g.highlights[1] / 100);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      toBlob(type, cb) { canvas.toBlob(cb, type, 0.95); },
    };
  }

  function scaled(P, s) {
    const q = clone(P), m = v => Math.round(v * s * 100) / 100;
    ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint', 'vibrance', 'saturation', 'texture', 'clarity', 'dehaze'].forEach(k => q[k] = m(P[k]));
    HSL_KEYS.forEach(k => q.hsl[k] = P.hsl[k].map(m));
    ['shadows', 'midtones', 'highlights'].forEach(k => q.grading[k] = [P.grading[k][0], m(P.grading[k][1])]);
    q.grading.balance = m(P.grading.balance);
    q.curve = P.curve.map(([x, y]) => [x, x + (y - x) * s]);
    return q;
  }

  function buildXMP(P, strength, name) {
    const q = scaled(P, strength), r = v => Math.round(v);
    const cap = s => s[0].toUpperCase() + s.slice(1);
    const a = {
      'crs:Version': '15.0', 'crs:ProcessVersion': '11.0', 'crs:PresetType': 'Normal', 'crs:HasSettings': 'True',
      'crs:Exposure2012': (q.exposure >= 0 ? '+' : '') + q.exposure.toFixed(2), 'crs:Contrast2012': r(q.contrast),
      'crs:Highlights2012': r(q.highlights), 'crs:Shadows2012': r(q.shadows), 'crs:Whites2012': r(q.whites), 'crs:Blacks2012': r(q.blacks),
      'crs:IncrementalTemperature': r(q.temperature), 'crs:IncrementalTint': r(q.tint), 'crs:Vibrance': r(q.vibrance), 'crs:Saturation': r(q.saturation),
      'crs:Texture': r(q.texture), 'crs:Clarity2012': r(q.clarity), 'crs:Dehaze': r(q.dehaze),
      'crs:ColorGradeShadowHue': r(q.grading.shadows[0]), 'crs:ColorGradeShadowSat': r(q.grading.shadows[1]),
      'crs:ColorGradeMidtoneHue': r(q.grading.midtones[0]), 'crs:ColorGradeMidtoneSat': r(q.grading.midtones[1]),
      'crs:ColorGradeHighlightHue': r(q.grading.highlights[0]), 'crs:ColorGradeHighlightSat': r(q.grading.highlights[1]),
      'crs:SplitToningBalance': r(q.grading.balance),
    };
    HSL_KEYS.forEach(k => { a['crs:HueAdjustment' + cap(k)] = r(q.hsl[k][0]); a['crs:SaturationAdjustment' + cap(k)] = r(q.hsl[k][1]); a['crs:LuminanceAdjustment' + cap(k)] = r(q.hsl[k][2]); });
    const attrs = Object.entries(a).map(([k, v]) => `    ${k}="${v}"`).join('\n');
    const curve = q.curve.slice().sort((x, y) => x[0] - y[0]).map(([x, y]) => `      <rdf:li>${r(x * 255)}, ${r(Math.max(0, Math.min(1, y)) * 255)}</rdf:li>`).join('\n');
    return `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Retone">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
${attrs}>
   <crs:Name><rdf:Alt><rdf:li xml:lang="x-default">${name}</rdf:li></rdf:Alt></crs:Name>
   <crs:ToneCurvePV2012><rdf:Seq>
${curve}
   </rdf:Seq></crs:ToneCurvePV2012>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`;
  }

  window.RetoneCore = { AUTO, HSL_KEYS, HSL_CENTERS, clone, curveFn, createRenderer, buildXMP, analyze, embeddedJpegs, exifOrientation };
})();
