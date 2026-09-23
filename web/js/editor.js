// Editor: WebGL preview, parameter panel, strength, compare, reset, save (photo/XMP), preset, lightbox.
(function () {
  const C = window.RetoneCore;
  const A = (() => { try { return JSON.parse(sessionStorage.getItem('retone.auto')) || C.AUTO; } catch (e) { return C.AUTO; } })();
  const $ = id => document.getElementById(id);
  const q = new URLSearchParams(location.search);

  const LIGHT = [['exposure', '노출', 'Exposure', -5, 5, 0.05], ['contrast', '대비', 'Contrast', -100, 100, 1], ['highlights', '밝은 영역', 'Highlights', -100, 100, 1], ['shadows', '어두운 영역', 'Shadows', -100, 100, 1], ['whites', '흰색 계열', 'Whites', -100, 100, 1], ['blacks', '검은색 계열', 'Blacks', -100, 100, 1]];
  const COLOR = [['temperature', '색온도', 'Temperature', -100, 100, 1, 'linear-gradient(90deg,#4A7FD6,#D9DDE2,#E8B93A)'], ['tint', '색조', 'Tint', -100, 100, 1, 'linear-gradient(90deg,#4DAA4F,#D9DDE2,#C84FA8)'], ['vibrance', '활기', 'Vibrance', -100, 100, 1], ['saturation', '채도', 'Saturation', -100, 100, 1]];
  const MIX = [['red', '빨강', 'Red', '#E0443A'], ['orange', '주황', 'Orange', '#EE8A2E'], ['yellow', '노랑', 'Yellow', '#E6C43A'], ['green', '초록', 'Green', '#4DAA4F'], ['aqua', '청록', 'Aqua', '#3BB6B8'], ['blue', '파랑', 'Blue', '#3C6FD9'], ['purple', '보라', 'Purple', '#8A55D0'], ['magenta', '자홍', 'Magenta', '#D04AA5']];
  const GRADE = [['shadows', '어두운 영역'], ['midtones', '중간 영역'], ['highlights', '밝은 영역']];
  const RAINBOW = 'linear-gradient(90deg,hsl(0 75% 55%),hsl(60 75% 55%),hsl(120 75% 55%),hsl(180 75% 55%),hsl(240 75% 55%),hsl(300 75% 55%),hsl(360 75% 55%))';

  const S = {
    params: C.clone(A), strength: 100, rotate: 0, view: 'after', split: 0.5, holding: false,
    open: { light: true, color: true, mixer: false, grading: false, curve: false },
    mixer: 'orange', gradeTab: 'shadows', curveSel: -1, active: null,
    save: 'saved', session: null,
  };
  let renderer = null, img = null, raf = 0, saveT, toastT;

  /* ---------- helpers ---------- */
  const getAt = (P, path) => path.reduce((o, k) => o[k], P);
  const setAt = (path, v) => { let o = S.params; for (let i = 0; i < path.length - 1; i++) o = o[path[i]]; o[path[path.length - 1]] = v; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const fmtV = (v, step, unit) => unit === '°' ? Math.round(v) + '°' : (v > 0 ? '+' : v < 0 ? '−' : '') + (step < 1 ? Math.abs(v).toFixed(2) : String(Math.round(Math.abs(v))));
  const baseName = () => ((S.session && S.session.original.name) || 'photo').replace(/\.[^.]+$/, '');
  const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (renderer && img) renderer.render(S.params, S.strength / 100, S.view === 'split' ? S.split : S.holding ? 1.01 : 0); }); };

  function markDirty() {
    setSave('dirty'); clearTimeout(saveT);
    // Draft autosave (replace with server save when accounts exist)
    saveT = setTimeout(() => { setSave('saving'); saveT = setTimeout(() => { try { localStorage.setItem('retone.draft', JSON.stringify({ params: S.params, strength: S.strength, rotate: S.rotate })); } catch (e) {} setSave('saved'); }, 500); }, 1600);
  }
  function setSave(s) { S.save = s; const el = $('saveChip'); el.dataset.s = s; el.textContent = { saved: '저장됨', dirty: '저장되지 않은 변경사항', saving: '저장 중…' }[s]; }

  function toast(text, action, fn, kind = 'ok') {
    clearTimeout(toastT);
    const t = $('toast'); t.hidden = false; t.dataset.kind = kind;
    $('toastDot').textContent = kind === 'error' ? '!' : kind === 'info' ? 'i' : '✓';
    $('toastText').textContent = text;
    const b = $('toastAction'); b.hidden = !action; b.textContent = action || ''; b.onclick = () => { fn && fn(); hideToast(); };
    $('holdHint').hidden = true;
    toastT = setTimeout(hideToast, 4000);
  }
  function hideToast() { $('toast').hidden = true; syncStage(); }

  /* ---------- slider model ---------- */
  function sliderDefs() {
    const mx = MIX.find(m => m[0] === S.mixer), hc = C.HSL_CENTERS[C.HSL_KEYS.indexOf(S.mixer)];
    const gh = S.params.grading[S.gradeTab][0];
    return {
      light: LIGHT.map(d => ({ path: [d[0]], label: d[1], en: d[2], min: d[3], max: d[4], step: d[5] })),
      color: COLOR.map(d => ({ path: [d[0]], label: d[1], en: d[2], min: d[3], max: d[4], step: d[5], track: d[6] })),
      mixer: [
        { path: ['hsl', S.mixer, 0], label: '색상', en: 'Hue', min: -100, max: 100, step: 1, track: `linear-gradient(90deg,hsl(${hc - 30} 75% 55%),hsl(${hc} 75% 55%),hsl(${hc + 30} 75% 55%))` },
        { path: ['hsl', S.mixer, 1], label: '채도', en: 'Saturation', min: -100, max: 100, step: 1, track: `linear-gradient(90deg,#A7ACB2,${mx[3]})` },
        { path: ['hsl', S.mixer, 2], label: '휘도', en: 'Luminance', min: -100, max: 100, step: 1, track: `linear-gradient(90deg,#1E2227,${mx[3]},#F4F6F8)` },
      ],
      grading: [
        { path: ['grading', S.gradeTab, 0], label: '색상', en: 'Hue', min: 0, max: 360, step: 1, track: RAINBOW, unit: '°' },
        { path: ['grading', S.gradeTab, 1], label: '채도', en: 'Saturation', min: 0, max: 100, step: 1, track: `linear-gradient(90deg,#A7ACB2,hsl(${gh} 70% 55%))` },
        { path: ['grading', 'balance'], label: '균형', en: 'Balance', min: -100, max: 100, step: 1 },
      ],
    };
  }
  const defByPath = {};
  const sliderHtml = d => {
    const key = d.path.join('.'); defByPath[key] = d;
    return `<div class="sl" data-path="${key}">
      <div class="sl-row"><b>${d.label}</b><small>${d.en}</small><button class="sl-auto" data-reset="${key}" title="자동값으로 되돌리기" hidden></button><span class="sl-val"></span></div>
      <div class="sl-track" data-track="${key}" tabindex="0" role="slider" aria-label="${d.label}">
        <div class="bg" style="${d.track ? `background:${d.track}` : ''}"></div>${d.track ? '' : '<div class="fill"></div>'}<div class="auto"></div><div class="knob"></div>
      </div></div>`;
  };
  function syncSliders() {
    document.querySelectorAll('.sl').forEach(el => {
      const d = defByPath[el.dataset.path]; if (!d) return;
      const v = getAt(S.params, d.path), a = getAt(A, d.path), pct = (v - d.min) / (d.max - d.min) * 100, zero = d.min < 0 ? 50 : 0;
      const mod = Math.abs(v - a) > 1e-6;
      el.classList.toggle('is-mod', mod);
      el.querySelector('.sl-val').textContent = fmtV(v, d.step, d.unit);
      const ab = el.querySelector('.sl-auto'); ab.hidden = !mod; ab.textContent = `자동 ${fmtV(a, d.step, d.unit)} ↺`;
      const tr = el.querySelector('.sl-track'); tr.setAttribute('aria-valuenow', v); tr.classList.toggle('is-active', S.active === el.dataset.path);
      tr.querySelector('.knob').style.left = pct + '%';
      tr.querySelector('.auto').style.left = (a - d.min) / (d.max - d.min) * 100 + '%';
      const f = tr.querySelector('.fill'); if (f) { f.style.left = Math.min(zero, pct) + '%'; f.style.width = Math.abs(pct - zero) + '%'; }
    });
  }

  /* ---------- panel ---------- */
  const countMods = keys => keys.filter(k => !same(getAt(S.params, k), getAt(A, k))).length;
  const SECTIONS = [
    { key: 'light', title: '빛', en: 'Light', keys: LIGHT.map(d => [d[0]]), unit: '개 조정' },
    { key: 'color', title: '색', en: 'Color', keys: COLOR.map(d => [d[0]]), unit: '개 조정' },
    { key: 'mixer', title: '컬러 믹서', en: 'Color Mixer · HSL', keys: C.HSL_KEYS.map(k => ['hsl', k]), unit: '색 조정' },
    { key: 'grading', title: '컬러 그레이딩', en: 'Color Grading', keys: [['grading']], flag: true },
    { key: 'curve', title: '톤 커브', en: 'Tone Curve', keys: [['curve']], flag: true },
  ];

  function renderPanel() {
    const defs = sliderDefs();
    $('sections').innerHTML = SECTIONS.map(sec => {
      const open = S.open[sec.key];
      let body = '';
      if (open) {
        if (sec.key === 'mixer') {
          const mx = MIX.find(m => m[0] === S.mixer);
          body += `<div class="swatch-row">${MIX.map(m => `<button class="swatch${same(S.params.hsl[m[0]], A.hsl[m[0]]) ? '' : ' is-mod'}" data-mix="${m[0]}" aria-label="${m[1]}" aria-pressed="${m[0] === S.mixer}" style="background:${m[3]}"></button>`).join('')}</div>
            <div class="mixer-name">${mx[1]} · ${mx[2]}</div>`;
        }
        if (sec.key === 'grading') {
          const g = S.params.grading[S.gradeTab];
          body += `<div class="grade-row"><div class="seg seg-sm">${GRADE.map(t => `<button data-grade="${t[0]}" aria-pressed="${t[0] === S.gradeTab}">${t[1]}</button>`).join('')}</div>
            <div class="grade-swatch" id="gradeSwatch" style="background:hsl(${g[0]} ${Math.max(8, g[1])}% 58%)"></div></div>`;
        }
        if (defs[sec.key]) body += defs[sec.key].map(sliderHtml).join('');
        if (sec.key === 'curve') body += `<svg class="curve" id="curve" viewBox="0 0 100 100">
            <path d="M25 0V100M50 0V100M75 0V100M0 25H100M0 50H100M0 75H100" fill="none" stroke="#D0D5DB" stroke-width="0.4"/>
            <path d="M0 100L100 0" fill="none" stroke="#B4BAC1" stroke-width="0.4" stroke-dasharray="1.5 1.5"/>
            <path id="curveAuto" fill="none" stroke="#9AA0A8" stroke-width="0.6"/>
            <path id="curvePath" fill="none" stroke="#111418" stroke-width="1.2"/>
            <g id="curvePts"></g></svg>
          <div class="curve-meta"><span id="curveInfo"></span><button class="sl-auto" id="curveReset" hidden style="margin-left:0">자동 커브 ↺</button></div>
          <div class="curve-help">커브를 클릭해 점을 추가하고, 점을 더블클릭하면 삭제돼요. 회색 선이 자동 커브예요.</div>`;
        body = `<div class="sec-body">${body}</div>`;
      }
      return `<div class="sec" data-sec="${sec.key}"><button class="sec-head" data-toggle="${sec.key}" aria-expanded="${open}">
        <b>${sec.title}</b><small>${sec.en}</small><span class="badge" hidden></span><span class="sign">${open ? '−' : '+'}</span></button>${body}</div>`;
    }).join('');
    syncPanel();
  }
  function syncPanel() {
    syncSliders();
    SECTIONS.forEach(sec => {
      const n = countMods(sec.keys), b = document.querySelector(`[data-sec="${sec.key}"] .badge`);
      b.hidden = !n; b.textContent = sec.flag ? '조정됨' : `${n}${sec.unit}`;
    });
    document.querySelectorAll('.swatch').forEach(el => el.classList.toggle('is-mod', !same(S.params.hsl[el.dataset.mix], A.hsl[el.dataset.mix])));
    const gs = $('gradeSwatch'); if (gs) { const g = S.params.grading[S.gradeTab]; gs.style.background = `hsl(${g[0]} ${Math.max(8, g[1])}% 58%)`; }
    syncCurve(); syncToolbar();
  }

  /* ---------- tone curve ---------- */
  const pathOf = pts => { const f = C.curveFn(pts); let d = ''; for (let i = 0; i <= 64; i++) { const x = i / 64, y = Math.max(0, Math.min(1, f(x))); d += (i ? 'L' : 'M') + (x * 100).toFixed(2) + ' ' + ((1 - y) * 100).toFixed(2); } return d; };
  function syncCurve() {
    if (!$('curve')) return;
    const sorted = S.params.curve.slice().sort((a, b) => a[0] - b[0]);
    $('curveAuto').setAttribute('d', pathOf(A.curve));
    $('curvePath').setAttribute('d', pathOf(S.params.curve));
    $('curvePts').innerHTML = sorted.map((p, i) => `<circle cx="${(p[0] * 100).toFixed(2)}" cy="${((1 - p[1]) * 100).toFixed(2)}" r="2.4" fill="${i === S.curveSel ? '#111418' : '#fff'}" stroke="#111418" stroke-width="0.8"/>`).join('');
    const sel = sorted[S.curveSel];
    $('curveInfo').textContent = sel ? `입력 ${sel[0].toFixed(2)} → 출력 ${sel[1].toFixed(2)}` : `점 ${sorted.length}개`;
    $('curveReset').hidden = same(S.params.curve, A.curve);
  }
  const curvePt = e => { const r = $('curve').getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))]; };
  function curveDown(e) {
    const [x, y] = curvePt(e);
    let pts = S.params.curve.map(p => p.slice()).sort((a, b) => a[0] - b[0]);
    let idx = -1, bd = 0.07;
    pts.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; idx = i; } });
    if (idx < 0) { if (pts.length >= 10) return; const f = C.curveFn(pts); pts.push([x, f(x)]); pts.sort((a, b) => a[0] - b[0]); idx = pts.findIndex(p => p[0] === x); }
    const commit = () => { S.params.curve = pts; S.curveSel = idx; syncPanel(); draw(); markDirty(); };
    commit();
    const mv = ev => {
      const [nx, ny] = curvePt(ev), last = pts.length - 1;
      const lo = idx === 0 ? 0 : pts[idx - 1][0] + 0.02, hi = idx === last ? 1 : pts[idx + 1][0] - 0.02;
      pts = pts.map(p => p.slice()); pts[idx] = [idx === 0 ? 0 : idx === last ? 1 : Math.max(lo, Math.min(hi, nx)), ny];
      commit();
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  function curveDbl(e) {
    const [x, y] = curvePt(e), pts = S.params.curve.slice().sort((a, b) => a[0] - b[0]);
    const i = pts.findIndex(p => Math.hypot(p[0] - x, p[1] - y) < 0.07);
    if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); S.params.curve = pts; S.curveSel = -1; syncPanel(); draw(); markDirty(); }
  }

  /* ---------- generic drag ---------- */
  function dragTrack(e, min, max, step, onVal, key) {
    const r = e.currentTarget.getBoundingClientRect();
    const upd = ev => { const t = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); onVal(+(Math.round((min + t * (max - min)) / step) * step).toFixed(2)); };
    S.active = key; upd(e);
    const up = () => { removeEventListener('pointermove', upd); removeEventListener('pointerup', up); S.active = null; syncPanel(); syncStage(); };
    addEventListener('pointermove', upd); addEventListener('pointerup', up);
  }
  function setParam(key, v) {
    const d = defByPath[key]; setAt(d.path, Math.max(d.min, Math.min(d.max, v)));
    syncPanel(); syncStage(); draw(); markDirty();
  }

  $('sections').addEventListener('pointerdown', e => {
    const tr = e.target.closest('[data-track]');
    if (tr) { const d = defByPath[tr.dataset.track]; dragTrack({ currentTarget: tr, clientX: e.clientX }, d.min, d.max, d.step, v => setParam(tr.dataset.track, v), tr.dataset.track); return; }
    if (e.target.closest('#curve')) curveDown(e);
  });
  $('sections').addEventListener('dblclick', e => {
    const tr = e.target.closest('[data-track]');
    if (tr) setParam(tr.dataset.track, getAt(A, defByPath[tr.dataset.track].path));
    else if (e.target.closest('#curve')) curveDbl(e);
  });
  $('sections').addEventListener('keydown', e => {
    const tr = e.target.closest('[data-track]'); if (!tr) return;
    const d = defByPath[tr.dataset.track], dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (dir) { e.preventDefault(); setParam(tr.dataset.track, +(getAt(S.params, d.path) + dir * d.step * (e.shiftKey ? 10 : 1)).toFixed(2)); }
  });
  $('sections').addEventListener('click', e => {
    const t = e.target.closest('[data-toggle],[data-reset],[data-mix],[data-grade],#curveReset'); if (!t) return;
    if (t.dataset.toggle) { S.open[t.dataset.toggle] = !S.open[t.dataset.toggle]; renderPanel(); }
    else if (t.dataset.reset) setParam(t.dataset.reset, getAt(A, defByPath[t.dataset.reset].path));
    else if (t.dataset.mix) { S.mixer = t.dataset.mix; renderPanel(); }
    else if (t.dataset.grade) { S.gradeTab = t.dataset.grade; renderPanel(); }
    else { S.params.curve = C.clone(A.curve); S.curveSel = -1; syncPanel(); draw(); markDirty(); }
  });

  /* ---------- strength ---------- */
  const setStrength = v => { S.strength = Math.round(v); syncToolbar(); syncStage(); draw(); markDirty(); };
  $('strength').addEventListener('pointerdown', e => dragTrack(e, 0, 100, 1, setStrength, 'strength'));
  $('strength').addEventListener('keydown', e => { const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (d) { e.preventDefault(); setStrength(Math.max(0, Math.min(100, S.strength + d * (e.shiftKey ? 10 : 1)))); } });

  const allKeys = () => SECTIONS.flatMap(s => s.keys);
  const modCount = () => countMods(allKeys()) + (S.strength !== 100 ? 1 : 0);
  function syncToolbar() {
    const st = $('strength');
    st.querySelector('.fill').style.width = S.strength + '%';
    st.querySelector('.knob').style.left = S.strength + '%';
    st.setAttribute('aria-valuenow', S.strength);
    st.classList.toggle('is-active', S.active === 'strength');
    $('strengthVal').textContent = S.strength + '%';
    const n = modCount(); $('resetBtn').disabled = !n; $('modCount').textContent = n;
    document.querySelectorAll('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === S.view));
  }

  /* ---------- stage ---------- */
  function fit() {
    if (!img) return;
    const st = $('stage'), W = st.clientWidth - 56, H = st.clientHeight - 72;
    const swap = S.rotate % 180 !== 0;
    const ar = swap ? img.naturalHeight / img.naturalWidth : img.naturalWidth / img.naturalHeight;
    let w = W, h = W / ar; if (h > H) { h = H; w = H * ar; }
    w = Math.max(120, Math.round(w)); h = Math.max(90, Math.round(h));
    $('photo').style.width = w + 'px';
    $('photo').style.height = h + 'px';
    // 캔버스는 돌기 전 기준이라 가로세로를 반대로 줘야 회전 뒤 박스에 들어맞는다
    const cv = $('canvas');
    cv.style.position = 'absolute'; cv.style.left = '50%'; cv.style.top = '50%';
    cv.style.width = (swap ? h : w) + 'px';
    cv.style.height = (swap ? w : h) + 'px';
    cv.style.transform = `translate(-50%,-50%) rotate(${S.rotate}deg)`;
  }
  function activeLabel() {
    if (!S.active) return null;
    if (S.active === 'strength') return `강도 ${S.strength}%`;
    const d = defByPath[S.active]; return d ? `${d.label} ${fmtV(getAt(S.params, d.path), d.step, d.unit)}` : '조정 중';
  }
  function syncStage() {
    const split = S.view === 'split', al = activeLabel();
    $('photo').classList.toggle('is-split', split);
    $('splitUi').hidden = !split;
    $('splitLine').style.left = S.split * 100 + '%';
    const chip = $('chip');
    chip.textContent = split ? '드래그해서 비교해 보세요' : S.holding ? '원본' : al ? `조정 중 · ${al}` : modCount() ? '직접 조정한 결과' : '자동 보정 결과';
    chip.classList.toggle('is-active', !!al && !S.holding);
    chip.classList.toggle('is-visible', !!al || S.holding);
    $('holdHint').hidden = S.view !== 'after' || !$('toast').hidden;
  }
  $('photoHit').addEventListener('pointerdown', e => {
    if (S.view === 'split') {
      const r = e.currentTarget.getBoundingClientRect();
      const u = ev => { S.split = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); syncStage(); draw(); };
      u(e); const up = () => { removeEventListener('pointermove', u); removeEventListener('pointerup', up); };
      addEventListener('pointermove', u); addEventListener('pointerup', up);
    } else {
      S.holding = true; syncStage(); draw();
      const up = () => { S.holding = false; syncStage(); draw(); removeEventListener('pointerup', up); };
      addEventListener('pointerup', up);
    }
  });
  $('viewSeg').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) { S.view = b.dataset.view; syncToolbar(); syncStage(); draw(); } });

  /* ---------- reset ---------- */
  const pops = { reset: $('resetPop'), save: $('saveMenu') };
  const closePops = () => Object.values(pops).forEach(p => p.hidden = true);
  document.addEventListener('click', e => { if (e.target.closest('[data-close-pop]')) closePops(); });
  $('resetBtn').addEventListener('click', () => { if (modCount()) pops.reset.hidden = false; });
  $('doReset').addEventListener('click', () => {
    const prev = { params: C.clone(S.params), strength: S.strength };
    S.params = C.clone(A); S.strength = 100; S.curveSel = -1; closePops();
    renderPanel(); syncStage(); draw(); markDirty();
    toast('자동 보정 결과로 되돌렸어요', '실행 취소', () => { S.params = prev.params; S.strength = prev.strength; renderPanel(); syncStage(); draw(); markDirty(); });
  });

  /* ---------- save: photo / XMP ---------- */
  $('saveBtn').addEventListener('click', () => { pops.save.hidden = !pops.save.hidden; });
  function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  // 회전은 셰이더가 아니라 출력 단계에서 입힌다 — 미리보기는 CSS로 돌리므로 렌더러는 원래 방향 그대로 둔다
  function outputBlob(type, cb) {
    const src = $('canvas'), r = S.rotate;
    if (!r) return renderer.toBlob(type, cb);
    const swap = r % 180 !== 0, c = document.createElement('canvas');
    c.width = swap ? src.height : src.width;
    c.height = swap ? src.width : src.height;
    const x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2);
    x.rotate(r * Math.PI / 180);
    x.drawImage(src, -src.width / 2, -src.height / 2);
    c.toBlob(cb, type, 0.95);
  }

  function downloadPhoto(type) {
    if (!renderer) return;
    const ext = type === 'image/png' ? 'png' : 'jpg', name = `${baseName()}_retone.${ext}`;
    renderer.render(S.params, S.strength / 100, 0);
    outputBlob(type, b => {
      draw();
      if (!b) return toast('다운로드하지 못했어요. 다시 시도해 주세요', '다시 시도', () => downloadPhoto(type), 'error');
      downloadBlob(b, name); toast(`${name} 다운로드 완료`);
    });
    closePops();
  }
  document.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => downloadPhoto(b.dataset.dl)));
  $('xmpBtn').addEventListener('click', () => {
    const xmp = C.buildXMP(S.params, S.strength / 100, `Retone · ${baseName()}`);
    downloadBlob(new Blob([xmp], { type: 'application/rdf+xml' }), `${baseName()}_retone.xmp`);
    closePops(); toast('XMP Preset 다운로드 완료 · Lightroom에서 불러올 수 있어요');
  });

  $('rotateBtn').addEventListener('click', () => { S.rotate = (S.rotate + 90) % 360; fit(); markDirty(); });

  /* ---------- lightbox (split compare only) ---------- */
  let lb = { after: null, before: null, split: 0.5 };
  function lbFit() {
    const c = $('canvas'); if (!c.width) return;
    const swap = S.rotate % 180 !== 0;
    const W = innerWidth - 80, H = innerHeight - 150, ar = swap ? c.height / c.width : c.width / c.height;
    let w = W, h = W / ar; if (h > H) { h = H; w = H * ar; }
    $('lbFrame').style.width = Math.round(w) + 'px'; $('lbFrame').style.height = Math.round(h) + 'px';
  }
  function lbSync() { $('lbBefore').style.clipPath = `inset(0 ${((1 - lb.split) * 100).toFixed(2)}% 0 0)`; $('lbLine').style.left = lb.split * 100 + '%'; }
  $('expandBtn').addEventListener('click', () => {
    if (!renderer) return;
    renderer.render(S.params, S.strength / 100, 0);
    outputBlob('image/jpeg', after => {
      renderer.render(S.params, S.strength / 100, 1.01);
      outputBlob('image/jpeg', before => {
        draw(); if (!after || !before) return;
        lb = { after: URL.createObjectURL(after), before: URL.createObjectURL(before), split: 0.5 };
        $('lbAfter').style.backgroundImage = `url("${lb.after}")`; $('lbBefore').style.backgroundImage = `url("${lb.before}")`;
        $('lbName').textContent = S.session.original.name;
        $('lbSub').textContent = S.strength < 100 ? `보정 전 / 보정 후 · 강도 ${S.strength}%` : '보정 전 / 보정 후';
        lbFit(); lbSync(); $('lightbox').hidden = false;
      });
    });
  });
  const closeLb = () => { $('lightbox').hidden = true; [lb.after, lb.before].forEach(u => u && URL.revokeObjectURL(u)); };
  document.addEventListener('click', e => { if (e.target.closest('[data-close-lb]')) closeLb(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('lightbox').hidden) closeLb(); });
  addEventListener('resize', () => { if (!$('lightbox').hidden) lbFit(); });
  $('lbHit').addEventListener('pointerdown', e => {
    const r = e.currentTarget.getBoundingClientRect();
    const u = ev => { lb.split = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); lbSync(); };
    u(e); const up = () => { removeEventListener('pointermove', u); removeEventListener('pointerup', up); };
    addEventListener('pointermove', u); addEventListener('pointerup', up);
  });

  /* ---------- init ---------- */
  let s = null; try { s = JSON.parse(sessionStorage.getItem('retone.session') || 'null'); } catch (e) {}
  const FO = { name: 'IMG_2041.JPG', src: 'https://picsum.photos/id/1015/1600/1200' }, FR = { name: 'reference_film.jpg', src: 'https://picsum.photos/id/1060/1600/1200' };
  const o = (s && s.original) || FO, rf = (s && s.reference) || FR;
  S.session = { original: { ...o, src: o.src || FO.src }, reference: { ...rf, src: rf.src || FR.src } };
  $('origName').textContent = S.session.original.name; $('refName').textContent = S.session.reference.name;
  const thumb = (el, src) => { if (src.startsWith('data:')) fetch(src).then(r => r.blob()).then(b => el.style.backgroundImage = `url("${URL.createObjectURL(b)}")`); else el.style.backgroundImage = `url("${src}")`; };
  thumb($('origThumb'), S.session.original.src); thumb($('refThumb'), S.session.reference.src);

  renderer = C.createRenderer($('canvas'));
  const im = new Image(); im.crossOrigin = 'anonymous';
  im.onload = () => { img = im; renderer && renderer.setImage(im); fit(); draw(); };
  im.src = S.session.original.src;
  if (!o.src) setTimeout(() => toast(`${(o.ext || '').toUpperCase()} 미리보기를 지원하지 않아 샘플 사진으로 보여드려요`, null, null, 'info'), 600);
  new ResizeObserver(fit).observe($('stage'));
  renderPanel(); syncStage();
})();
