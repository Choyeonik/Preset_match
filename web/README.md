# Retone — 웹 프로토타입 (HTML · CSS · JS)

사진의 색감을 Reference 이미지처럼 자동 보정하는 웹 서비스의 UI 프로토타입입니다.
빌드 도구 없이 바로 실행되는 순수 HTML / CSS / JavaScript로 되어 있어요.

## 실행

VS Code에서 폴더를 열고 **Live Server** 확장으로 `index.html`을 여세요.
(사진을 WebGL로 처리하고 sessionStorage로 페이지 간 이미지를 넘기기 때문에 `file://`보다 로컬 서버를 권장합니다.)

```
npx serve .        # 또는 python3 -m http.server
```

## 폴더 구조

```
index.html        F1 랜딩 — 고정 정보 패널 + 무한 스크롤 Before/After 체크무늬 그리드
upload.html       F2 업로드 — Original / Reference 슬롯 (위아래)
analyzing.html    F3 분석 로딩 — 3단계 진행, 스캔 → 색 추출 → 미리보기 리빌
editor.html       F4–F7, F9 편집 — WebGL 미리보기, 파라미터 패널, 강도, 비교, 되돌리기, 저장, Preset
css/
  base.css        디자인 토큰(:root 변수), 리셋, 공통 컴포넌트(버튼·드로어·세그먼트·토스트·모달·태그)
  landing.css / upload.css / analyzing.css / editor.css   화면별 스타일
js/
  core.js         RetoneCore — 자동 보정 기본값(AUTO), WebGL 렌더러, 톤 커브 보간, XMP 생성
  drawer.js       오른쪽 메뉴 드로어 (data-menu-open / data-menu-close)
  landing.js / upload.js / analyzing.js / editor.js      화면별 동작
```

## 화면 흐름

`index.html` → 업로드 시작하기 → `upload.html` → 분석 시작 → `analyzing.html` → (완료 시 자동 이동) → `editor.html`

페이지 간 데이터는 `sessionStorage['retone.session']`에 저장합니다.
`{ original: {name,size,ext,src}, reference: {...} }` — `src`는 최대 2000px로 줄인 JPEG data URL (HEIC/RAW는 `null` → 편집 화면에서 샘플 사진으로 대체).
편집 초안은 `localStorage['retone.draft']`에 자동 저장됩니다.

## 상태 미리보기 (URL 파라미터)

| 화면 | 파라미터 |
|---|---|
| upload.html | `?demo=empty · originalOnly · referenceOnly · both · uploading · failed · badType · tooBig`, `?failUpload=1` |
| analyzing.html | `?demo=step1 · step2 · step3 · failed · done`, `?fail=1` |
| editor.html | `?loggedIn=1`, `?saveFails=1` |

## 디자인 토큰 (css/base.css)

- 배경 `--bg #EDF0F3`, 잉크 `--ink #111418`, 보조 텍스트 `--ink-2 #3A4048` / `--muted #7A828C` / `--faint #9AA0A8`
- 구분선 `--line #D9DDE2`, 슬라이더 트랙 `--track #D3D8DE`, 세그먼트 `--seg #DDE2E7`, 사진 스테이지 `--stage #E3E7EB`
- 상태: 오류 `--danger #C23B3B`(배경 `#F6ECEC`), 저장됨 `--ok #2F8F5B`, 미저장 `--warn #D08A1E`
- 폰트: Pretendard Variable (CDN). 디스플레이 800 / -0.045em, 본문 14px / 1.7
- 모서리: pill 999px · 24 · 20 · 16 · 12 · 10px
- 레이아웃: 오른쪽 레일 76px, 편집 패널 360px, 업로드/분석 좌측 정보 영역 360px

## 핵심 컴포넌트

- **버튼** `.btn` + `.btn-primary / .btn-outline / .btn-quiet / .btn-link`, 크기 `.btn-sm / .btn-lg / .btn-xl`
- **파라미터 슬라이더** `.sl` — 라벨(한글 + 영문), 현재값, 자동값 눈금(회색), 수정 시 `자동 +12 ↺` 버튼, 더블클릭/방향키 지원, 중앙 기준 채움(양극성) 또는 그라디언트 트랙(색온도·색조·색상)
- **강도 슬라이더** `.strength` — 흰 캡슐, 굵은 트랙·검은 노브로 세부 파라미터와 구분
- **섹션 아코디언** `.sec` — 빛·색(기본 열림), 컬러 믹서·컬러 그레이딩·톤 커브(기본 닫힘), 수정 개수 배지
- **톤 커브** SVG, 0–1 정규화 포인트 배열. 클릭 추가, 드래그 이동, 더블클릭 삭제, 끝점 x 고정, 최대 10점
- **업로드 슬롯** `.slot[data-status=empty|uploading|done|error]`
- **세그먼트** `.seg`, **토스트** `.toast[data-kind=ok|error|info]`, **팝오버** `.popover`, **모달** `.modal`, **드로어** `.drawer`, **라이트박스** `.lightbox`(밀어서 비교)

## 백엔드 연결 지점 (현재 시뮬레이션)

- `upload.js › runUpload()` — 업로드 진행률 (XHR upload progress로 교체)
- `analyzing.js › run()` — 분석 진행/단계 (SSE 또는 폴링으로 교체), 결과 파라미터를 `RetoneCore.AUTO` 대신 서버 응답으로
- `editor.js › markDirty()` — 초안 자동 저장
- `editor.js › savePresetBtn` — `POST /presets`, 로그인은 `[data-login]` 버튼

## 참고

- 미리보기 색 보정은 `core.js`의 WebGL 셰이더로 근사한 것으로, Lightroom 결과와 동일하지 않습니다.
- XMP는 `crs:` 네임스페이스(Exposure2012, HSL, ColorGrade, ToneCurvePV2012 등)로 생성되며, 강도(%)는 값에 곱해 반영합니다.
- 랜딩/샘플 사진은 picsum.photos 임시 이미지입니다.
