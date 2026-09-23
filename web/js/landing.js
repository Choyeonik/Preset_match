// Landing: infinite checkerboard scroll of Before/After pairs + scroll-linked dial.
(function () {
  const PAIRS = [1, 2, 3, 4, 5, 7].map(n => ({ before: `assets/pairs/original_${n}.jpg`, after: `assets/pairs/after_${n}.jpg` }));
  const COPIES = 3; // rendered 3× so we can loop from the middle copy
  const pad = n => String(n).padStart(2, '0');
  const $ = id => document.getElementById(id);

  const colA = $('colA'), colB = $('colB'), aside = $('aside');
  let a = '', b = '';
  for (let k = 0; k < COPIES; k++) PAIRS.forEach((p, i) => {
    a += `<div class="cell"></div>
      <div class="cell cell-photo" data-pair="${i}"><div class="img" role="img" aria-label="원본" style="background-image:url(${p.before})"></div></div>`;
    b += `<div class="cell"></div>
      <div class="cell cell-photo"><div class="img" role="img" aria-label="보정 후" style="background-image:url(${p.after})"></div></div>`;
  });
  colA.innerHTML = a; colB.innerHTML = b;
  $('counterTotal').textContent = pad(PAIRS.length);

  let looped = false, active = -1, touched = false;
  const narrow = () => window.innerWidth < 860;

  function layoutAside() {
    const aw = aside.offsetWidth, ah = aside.offsetHeight, roomy = aw >= 560;
    const copy = $('copy'), foot = $('foot'), dial = $('dial');
    aside.classList.toggle('compact', !roomy);
    aside.style.setProperty('--copy-indent', roomy ? Math.min(230, aw - 330) + 'px' : '0px');
    let top, scale = 1;
    if (roomy) top = Math.round(ah * 0.55);
    else {
      const cb = copy.offsetTop + copy.offsetHeight, fb = foot.offsetTop, gap = fb - cb;
      scale = Math.max(0.45, Math.min(1, (gap - 24) / 190));
      top = Math.round((cb + fb) / 2);
    }
    dial.style.top = top + 'px';
    dial.style.marginTop = '-210px';
    dial.style.transform = `scale(${scale})`;
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
      const ph = $('dialPhoto'); ph.style.backgroundImage = `url(${p.after})`; ph.style.filter = '';
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
