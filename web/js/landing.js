// Landing: infinite checkerboard scroll of Before/After pairs + scroll-linked dial.
(function () {
  const PAIRS = [
    { id: 1015, title: '강가의 오후', file: 'IMG_2041.HEIC', mood: '필름', after: 'sepia(.28) saturate(1.25) contrast(1.06) hue-rotate(-10deg) brightness(1.04)' },
    { id: 1060, title: '아침 카페', file: 'DSC_0183.RAW', mood: '웜톤', after: 'sepia(.35) saturate(1.4) contrast(1.08) brightness(1.06)' },
    { id: 1036, title: '겨울 숲', file: 'IMG_0912.JPG', mood: '쿨톤', after: 'saturate(1.2) hue-rotate(12deg) contrast(1.1) brightness(1.05)' },
    { id: 29, title: '로드트립', file: 'IMG_3377.HEIC', mood: '시네마', after: 'contrast(1.22) saturate(.85) sepia(.18) hue-rotate(-18deg) brightness(.96)' },
    { id: 1080, title: '딸기 한 접시', file: 'IMG_5520.PNG', mood: '빈티지', after: 'sepia(.45) saturate(1.1) contrast(.95) brightness(1.08)' },
    { id: 1018, title: '능선', file: 'DSC_7710.RAW', mood: '필름', after: 'sepia(.2) saturate(1.35) contrast(1.12) hue-rotate(-6deg)' },
    { id: 42, title: '골목 카페', file: 'IMG_1188.JPG', mood: '웜톤', after: 'sepia(.3) saturate(1.3) contrast(1.05) brightness(1.05)' },
    { id: 1039, title: '폭포', file: 'IMG_6604.HEIC', mood: '쿨톤', after: 'saturate(1.25) hue-rotate(15deg) contrast(1.12)' },
  ];
  const BEFORE = 'saturate(.72) contrast(.9) brightness(1.03)';
  const MOODS = ['필름', '웜톤', '쿨톤', '시네마', '빈티지'];
  const COPIES = 3; // rendered 3× so we can loop from the middle copy
  const src = id => `https://picsum.photos/id/${id}/960/800`;
  const pad = n => String(n).padStart(2, '0');
  const $ = id => document.getElementById(id);

  const colA = $('colA'), colB = $('colB'), aside = $('aside');
  let a = '', b = '';
  for (let k = 0; k < COPIES; k++) PAIRS.forEach((p, i) => {
    a += `<div class="cell"><div class="cell-label"><b>Original</b><span>${p.file}</span></div></div>
      <div class="cell cell-photo" data-pair="${i}"><div class="img" role="img" aria-label="${p.title} 원본" style="background-image:url(${src(p.id)});filter:${BEFORE}"></div><span class="tag">Before</span></div>`;
    b += `<div class="cell"><div class="cell-label"><b>${p.title}</b><span>${p.mood} 레퍼런스 적용</span></div></div>
      <div class="cell cell-photo"><div class="img" role="img" aria-label="${p.title} 보정 후" style="background-image:url(${src(p.id)});filter:${p.after}"></div><span class="tag tag-dark">After</span></div>`;
  });
  colA.innerHTML = a; colB.innerHTML = b;
  $('moods').innerHTML = MOODS.map(m => `<span>${m}</span>`).join('');
  $('counterTotal').textContent = pad(PAIRS.length);

  let looped = false, active = -1, touched = false;
  const narrow = () => window.innerWidth < 860;

  function layoutAside() {
    const aw = aside.offsetWidth, ah = aside.offsetHeight, roomy = aw >= 560;
    const copy = $('copy'), foot = $('foot'), dial = $('dial'), moods = $('moods');
    aside.classList.toggle('compact', !roomy);
    aside.style.setProperty('--copy-indent', roomy ? Math.min(230, aw - 330) + 'px' : '0px');
    let top, scale = 1, showMoods = true;
    if (roomy) top = Math.round(ah * 0.55);
    else {
      const cb = copy.offsetTop + copy.offsetHeight, fb = foot.offsetTop, gap = fb - cb;
      scale = Math.max(0.45, Math.min(1, (gap - 24) / 190));
      top = Math.round((cb + fb) / 2);
      showMoods = scale >= 1 && gap >= 260;
    }
    dial.style.top = moods.style.top = top + 'px';
    dial.style.marginTop = '-210px';
    dial.style.transform = `scale(${scale})`;
    moods.style.display = showMoods ? 'flex' : 'none';
  }

  function onScroll() {
    const period = colA.offsetHeight / COPIES, y = window.scrollY;
    if (!narrow() && period > 0) {
      if (!looped) { looped = true; window.scrollTo(0, y + period); return; }
      if (y >= period * 2) { window.scrollTo(0, y - period); return; }
      if (y < period * 0.5) { window.scrollTo(0, y + period); return; }
    }
    const mid = window.innerHeight / 2;
    let best = 0, bd = Infinity;
    colA.querySelectorAll('[data-pair]').forEach((el, i) => { const r = el.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = i; } });
    best %= PAIRS.length;
    const progress = period > 0 && !narrow() ? ((((y - period) % period) + period) % period) / period : 0;
    $('dialArc').style.transform = `rotate(${-60 + progress * 300}deg)`;
    $('counterBar').style.width = Math.round(progress * 100) + '%';
    if (best !== active) {
      active = best;
      const p = PAIRS[best];
      $('counterNo').textContent = pad(best + 1);
      const ph = $('dialPhoto'); ph.style.backgroundImage = `url(${src(p.id)})`; ph.style.filter = p.after;
      const ai = MOODS.indexOf(p.mood), shades = ['#111418', '#8E959E', '#B4BAC1', '#CDD2D8', '#DCE0E4'];
      [...$('moods').children].forEach((el, i) => { const d = Math.abs(i - ai); el.style.color = shades[d]; el.style.fontWeight = d ? 500 : 700; el.style.transform = `translateX(${d * -8}px)`; });
    }
  }

  const markTouched = () => { if (!touched) { touched = true; $('cue').classList.add('gone'); } };
  ['wheel', 'touchmove', 'keydown'].forEach(ev => window.addEventListener(ev, markTouched, { passive: true }));
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { layoutAside(); onScroll(); });
  new ResizeObserver(() => { layoutAside(); onScroll(); }).observe(aside);
  if (document.fonts) document.fonts.ready.then(() => { layoutAside(); onScroll(); });
  layoutAside(); onScroll();
})();
