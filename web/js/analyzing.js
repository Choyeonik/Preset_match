// Analyzing: simulated 3-step analysis with scan → palette extraction → preset reveal.
// Replace run() with real API progress (e.g. SSE / polling) in production.
(function () {
  const $ = id => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const DUR = 7000, FAIL = q.get('fail') === '1';
  const STEPS = [
    ['이미지 분석', '이미지 분석 중', '두 사진의 밝기와 색 분포를 읽고 있어요'],
    ['색감 비교', '색감 비교 중', 'Reference의 톤과 색을 Original과 비교하고 있어요'],
    ['Preset 생성', 'Preset 생성 중', '내 사진에 맞는 보정값을 만들고 있어요'],
  ];
  let stage = 'running', pct = 0, raf, palO = [], palR = [], imO = null;

  const loadImg = src => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const viewUrl = src => src && src.startsWith('data:') ? fetch(src).then(r => r.blob()).then(b => URL.createObjectURL(b)) : Promise.resolve(src);

  function palette(im) {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 48;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0, 48, 48);
      const d = x.getImageData(0, 0, 48, 48).data, bins = {};
      for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5); const b = bins[k] || (bins[k] = { n: 0, r: 0, g: 0, b: 0 }); b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; }
      const out = [];
      Object.values(bins).sort((a, b) => b.n - a.n).forEach(b => { const col = [b.r / b.n, b.g / b.n, b.b / b.n]; if (out.length < 5 && out.every(o => Math.hypot(o[0] - col[0], o[1] - col[1], o[2] - col[2]) > 48)) out.push(col); });
      return out.map(c => `rgb(${c.map(Math.round).join(',')})`);
    } catch (e) { return []; }
  }

  function fit() {
    if (!imO) return;
    const st = $('stage'), W = st.clientWidth - 56, H = st.clientHeight - 56, ar = imO.naturalWidth / imO.naturalHeight;
    let w = W, h = W / ar; if (h > H) { h = H; w = H * ar; }
    $('photo').style.width = Math.max(120, Math.round(w)) + 'px';
    $('photo').style.height = Math.max(90, Math.round(h)) + 'px';
  }

  function paint() {
    const step = pct < 34 ? 0 : pct < 70 ? 1 : 2, failed = stage === 'failed', done = stage === 'done';
    $('running').hidden = stage !== 'running'; $('failed').hidden = !failed; $('done').hidden = !done;
    $('pct').textContent = pct;
    $('stepTitle').textContent = STEPS[step][1]; $('stepDesc').textContent = STEPS[step][2];
    $('remain').textContent = `약 ${Math.max(1, Math.ceil((100 - pct) / 100 * DUR / 1000))}초 남음`;
    $('failStep').textContent = `오류 코드 ANL-502 · ${STEPS[step][0]} 단계에서 멈췄어요`;
    [...$('steps').children].forEach((el, i) => {
      const s = done || i < step ? 'done' : failed && i === step ? 'error' : i === step ? 'active' : 'wait';
      el.dataset.s = s;
      el.querySelector('.step-dot').textContent = s === 'done' ? '✓' : s === 'error' ? '!' : '';
      el.querySelector('.step-state').textContent = { done: '완료', error: '실패', active: '진행 중', wait: '대기' }[s];
    });
    const local = step === 0 ? pct / 34 : step === 1 ? (pct - 34) / 36 : (pct - 70) / 30;
    const reveal = done ? 1 : step === 2 ? Math.min(1, local) : 0;
    $('canvas').style.clipPath = `inset(0 ${((1 - reveal) * 100).toFixed(2)}% 0 0)`;
    const scanning = !failed && !done && step < 2, y = ((local * 100 * 1.15) % 115).toFixed(1) + '%';
    $('scanLine').hidden = $('scanGlow').hidden = !scanning;
    $('scanLine').style.top = $('scanGlow').style.top = y;
    const rl = $('revealLine'); rl.hidden = failed || done || step !== 2; rl.style.left = reveal * 100 + '%';
    $('photo').classList.toggle('is-failed', failed);
    const chip = $('chip');
    chip.textContent = done ? '자동 보정 미리보기' : failed ? '분석이 멈췄어요' : step === 2 ? '미리보기 적용 중' : 'Original';
    chip.classList.toggle('tag-dark', done || step === 2); chip.classList.toggle('is-red', failed);
    const showO = done || step >= 1 ? 5 : Math.floor(local * 6), showR = done || step >= 2 ? 5 : step === 1 ? Math.floor(local * 6) : 0;
    const sw = (el, list, n) => { el.innerHTML = [0, 1, 2, 3, 4].map(i => `<i class="${i < n ? 'on' : ''}" style="background:${list[i] || ''}"></i>`).join(''); };
    sw($('swO'), palO, showO); sw($('swR'), palR, showR);
    $('statusO').textContent = showO >= 5 ? '색 추출 완료' : '색을 읽는 중';
    $('statusR').textContent = showR >= 5 ? '색 추출 완료' : showR > 0 ? '색을 비교하는 중' : '대기 중';
  }

  function run() {
    cancelAnimationFrame(raf);
    stage = 'running';
    const t0 = performance.now() - (pct / 100) * DUR;
    const tick = now => {
      const p = Math.min(100, ((now - t0) / DUR) * 100);
      pct = Math.round(p);
      if (FAIL && pct >= 58) { stage = 'failed'; return paint(); }
      if (p >= 100) { stage = 'done'; pct = 100; paint(); return setTimeout(() => { location.href = 'editor.html'; }, 1100); }
      paint(); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  $('retry').addEventListener('click', () => { pct = 0; run(); });

  (async function init() {
    let s = null; try { s = JSON.parse(sessionStorage.getItem('retone.session') || 'null'); } catch (e) {}
    const O = (s && s.original && s.original.src) || 'https://picsum.photos/id/1015/1600/1200';
    const R = (s && s.reference && s.reference.src) || 'https://picsum.photos/id/1060/1600/1200';
    const [vo, vr] = await Promise.all([viewUrl(O), viewUrl(R)]);
    $('orig').style.backgroundImage = $('thumbO').style.backgroundImage = `url("${vo}")`;
    $('thumbR').style.backgroundImage = `url("${vr}")`;
    const [a, b] = await Promise.all([loadImg(O), loadImg(R)]);
    imO = a;
    if (a) palO = palette(a);
    if (b) palR = palette(b);
    fit(); new ResizeObserver(fit).observe($('stage'));
    if (a) { const r = RetoneCore.createRenderer($('canvas')); if (r) { r.setImage(a); r.render(RetoneCore.AUTO, 1, 0); } }
    const demo = { step1: ['running', 18], step2: ['running', 52], step3: ['running', 84], failed: ['failed', 58], done: ['done', 100] }[q.get('demo')];
    if (demo) { stage = demo[0]; pct = demo[1]; paint(); } else run();
  })();
})();
