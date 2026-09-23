// Upload: two independent slots (drag & drop + file picker), validation, progress, error states.
(function () {
  const KEYS = ['original', 'reference'];
  const OK_EXT = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'raw', 'dng', 'cr2', 'cr3', 'nef', 'arw', 'orf', 'rw2', 'raf'];
  const PREVIEW_EXT = ['jpg', 'jpeg', 'png'];
  const MAX = 50 * 1048576;
  const params = new URLSearchParams(location.search);
  const FAIL_UPLOAD = params.get('failUpload') === '1';
  const SAMPLES = {
    original: { name: 'IMG_2041.JPG', size: 4.2 * 1048576, ext: 'jpg', src: 'https://picsum.photos/id/1015/1600/1200' },
    reference: { name: 'reference_film.jpg', size: 2.8 * 1048576, ext: 'jpg', src: 'https://picsum.photos/id/1060/1600/1200' },
  };
  const ERR = {
    failed: ['업로드에 실패했어요', '연결이 잠시 끊겼어요. 네트워크를 확인하고 다시 시도해 주세요.', true],
    badType: ['지원하지 않는 형식이에요', 'JPG, PNG, HEIC, RAW 파일만 올릴 수 있어요.', false],
    tooBig: ['파일이 50MB를 넘어요', '파일당 최대 50MB까지 올릴 수 있어요. 용량을 줄이거나 다른 파일을 골라주세요.', false],
  };
  const STATE_TEXT = { empty: '비어 있음', uploading: '업로드 중', done: '완료', error: '다시 올려주세요' };

  const blank = () => ({ status: 'empty', name: '', size: 0, ext: '', src: null, view: null, pct: 0, err: null, note: '', file: null });
  const S = { original: blank(), reference: blank() };
  const timers = {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = b => b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';

  function set(k, patch) { Object.assign(S[k], patch); render(k); renderAside(); }

  function render(k) {
    const s = S[k], el = $('slot-' + k);
    el.dataset.status = s.status;
    const st = $('state-' + k); st.dataset.status = s.status; st.textContent = STATE_TEXT[s.status];
    const img = s.view || s.src;
    if (s.status === 'empty') {
      el.innerHTML = `<div class="slot-fill"><div class="plus"></div><button class="btn btn-outline" data-act="pick">파일 선택</button></div>`;
    } else if (s.status === 'uploading') {
      el.innerHTML = `${img ? `<div class="slot-blur" style="background-image:url('${img}')"></div>` : ''}
        <div class="slot-fill"><div class="slot-name">${esc(s.name)}</div>
        <div class="progress"><i style="width:${s.pct}%"></i></div>
        <div class="progress-row"><span>업로드 중</span><span>${s.pct}%</span></div>
        <button class="btn-link" data-act="remove" style="text-decoration:underline;text-underline-offset:3px">취소</button></div>`;
    } else if (s.status === 'done') {
      el.innerHTML = `${img ? `<div class="slot-photo" style="background-image:url('${img}')"></div>`
          : `<div class="slot-nopreview"><b>${esc(s.ext.toUpperCase())}</b><span>미리보기는 편집 화면에서 보여드려요</span></div>`}
        <span class="tag tag-dark tag-md tag-done">✓ 업로드 완료</span>
        ${s.note ? `<div class="slot-note">${esc(s.note)}</div>` : ''}
        <div class="file-bar"><div><b>${esc(s.name)}</b><span>${fmt(s.size)} · ${esc(s.ext.toUpperCase())}</span></div>
          <button class="btn btn-quiet btn-sm" data-act="pick">교체</button>
          <button class="btn btn-danger-quiet btn-sm" data-act="remove">삭제</button></div>`;
    } else {
      const e = ERR[s.err];
      el.innerHTML = `<div class="slot-fill slot-error">
        <div class="slot-error-title"><span class="err-icon">!</span>${e[0]}</div>
        <p>${e[1]}</p><small>${esc(s.name)} · ${fmt(s.size)}</small>
        <div class="row">${e[2] ? '<button class="btn btn-primary btn-sm" data-act="retry">다시 시도</button>' : ''}
          <button class="btn btn-outline btn-sm" data-act="pick">다른 파일 선택</button>
          <button class="btn-link" data-act="remove" style="font-size:13px">닫기</button></div></div>`;
    }
  }

  function renderAside() {
    KEYS.forEach(k => {
      const s = S[k], row = $('check-' + k);
      row.dataset.status = s.status;
      row.querySelector('span').textContent = { empty: '아직 올리지 않았어요', uploading: `업로드 중 ${s.pct}%`, done: `${s.name} · ${fmt(s.size)}`, error: s.err ? ERR[s.err][0] : '' }[s.status];
    });
    const ready = KEYS.every(k => S[k].status === 'done');
    $('startBtn').disabled = !ready;
    $('startHelp').textContent = ready ? '준비됐어요. 분석을 시작해 보세요' : '';
  }

  function makePreview(f) {
    return new Promise(res => {
      const url = URL.createObjectURL(f), im = new Image();
      im.onload = () => {
        const s = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.9)); // data URL is only used for the sessionStorage hand-off
      };
      im.onerror = () => res(null);
      im.src = url;
    });
  }

  function processFiles(k, list) {
    if (!list || !list.length) return;
    const f = list[0];
    const note = list.length > 1 ? '한 장만 올릴 수 있어서 첫 번째 파일만 사용했어요' : '';
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const base = { ...blank(), name: f.name, size: f.size, ext, note };
    clearInterval(timers[k]);
    if (!OK_EXT.includes(ext)) return set(k, { ...base, status: 'error', err: 'badType' });
    if (f.size > MAX) return set(k, { ...base, status: 'error', err: 'tooBig' });
    set(k, { ...base, status: 'uploading', file: f });
    if (PREVIEW_EXT.includes(ext)) { set(k, { view: URL.createObjectURL(f) }); makePreview(f).then(src => src && (S[k].src = src)); }
    runUpload(k);
  }

  // Simulated upload progress — replace with the real upload request (XHR/fetch upload progress).
  function runUpload(k) {
    clearInterval(timers[k]);
    let pct = 0;
    timers[k] = setInterval(() => {
      pct = Math.min(100, pct + 4 + Math.random() * 6);
      if (FAIL_UPLOAD && pct > 58) { clearInterval(timers[k]); return set(k, { status: 'error', err: 'failed', pct: 0 }); }
      if (pct >= 100) { clearInterval(timers[k]); return set(k, { status: 'done', pct: 100 }); }
      set(k, { pct: Math.round(pct) });
    }, 70);
  }

  const pick = k => { const i = $('file-' + k); i.value = ''; i.click(); };
  const remove = k => { clearInterval(timers[k]); $('file-' + k).value = ''; S[k] = blank(); render(k); renderAside(); };
  const retry = k => { if (S[k].file) { set(k, { status: 'uploading', pct: 0 }); runUpload(k); } else pick(k); };

  KEYS.forEach(k => {
    const el = $('slot-' + k);
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      ({ pick, remove, retry })[a.dataset.act](k);
    });
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('is-drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('is-drag'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('is-drag'); processFiles(k, e.dataTransfer.files); });
    $('file-' + k).addEventListener('change', e => processFiles(k, e.target.files));
  });

  $('startBtn').addEventListener('click', () => {
    if (!KEYS.every(k => S[k].status === 'done')) return;
    const pack = s => ({ name: s.name, size: s.size, ext: s.ext, src: s.src });
    try { sessionStorage.setItem('retone.session', JSON.stringify({ original: pack(S.original), reference: pack(S.reference) })); }
    catch (e) { sessionStorage.setItem('retone.session', JSON.stringify({ original: { ...pack(S.original), src: null }, reference: { ...pack(S.reference), src: null } })); }
    location.href = 'analyzing.html';
  });

  // ?demo= state previews
  const done = k => ({ ...blank(), ...SAMPLES[k], status: 'done', pct: 100 });
  const DEMO = {
    empty: [blank(), blank()],
    originalOnly: [done('original'), blank()],
    referenceOnly: [blank(), done('reference')],
    both: [done('original'), done('reference')],
    uploading: [done('original'), { ...blank(), ...SAMPLES.reference, status: 'uploading', pct: 62 }],
    failed: [done('original'), { ...blank(), ...SAMPLES.reference, src: null, status: 'error', err: 'failed' }],
    badType: [done('original'), { ...blank(), name: 'moodboard.gif', size: 3.1 * 1048576, ext: 'gif', status: 'error', err: 'badType' }],
    tooBig: [{ ...blank(), name: 'DSC_0092.CR3', size: 72.4 * 1048576, ext: 'cr3', status: 'error', err: 'tooBig' }, done('reference')],
  }[params.get('demo')];
  if (DEMO) { S.original = DEMO[0]; S.reference = DEMO[1]; }
  KEYS.forEach(render); renderAside();
})();
