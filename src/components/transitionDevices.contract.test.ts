// 화면 전환 장치 허용 목록 — 동작 보증 계약(2026-09-26 오너: "왜 여러 개냐, 꼭 필요하지 않으면 한 개로" · "수정할 때마다 회귀하지 않게 코드로 강제").
//
// 이 계약이 보증하는 동작:
//   (a) 앱 어디에서도 document View Transition(스냅샷 교차)이 돌지 않는다.
//       이 앱에서 스냅샷 교차는 라이트·다크 지면 휘도 차 때문에 열기·닫기 어느 쪽이든 ±10~33 번쩍였고(flick 실측 3회),
//       모바일에서는 삼성 인터넷이 스냅샷을 세로로 눌렀다(1862bb49). 경로마다 따로 고치다 한쪽이 남는 일이 반복됐다.
//   (b) 메인 탭은 **한 입구(commitTab)** 로만 바뀐다 — 그래야 모든 진입(하단바·뒤로가기·알림 링크·로그인 뒤 복원)이
//       판 교체 규칙(스왑 프레임 정적화 + 한 프레임 교체, src/lib/tabCover.ts 8차 절)을 똑같이 탄다.
//       직접 setActiveTab 은 그 규칙을 건너뛴다(2026-09-26 로그인 뒤 탭 복원이 실제로 그랬다).
//   (c) 화면 전환 키프레임·WAAPI 는 아래 목록뿐이다. 새 장치를 더하려면 이 목록에 **이유와 함께** 올려라 —
//       조용히 늘어나는 것을 막는 것이 목적이다(같은 전환이 두 방식으로 구현되면 그 자체가 결함).
//   (d) 하위 탭도 메인 탭과 **같은 장치·같은 수치**다(오너 2026-09-26 "메인 카테고리 이동 때의 부드러운 모션을 하위 탭에서도 동일하게").
//       goSubTab 한 입구가 커밋 전에 handOffSubPanel 을 부르고, 메인(handOffPane)·하위(handOffSubPanel) 모두 **한 프레임 교체**다
//       (2026-10-08 8차 INSTANT-SWAP — 떠나는 판 240ms 페이드를 걷었다: 두 판이 겹쳐 '블러'·'네모칸' 으로 보였다). 탭 레일(SegmentedTabs·UnderlineTabs·SlidingPill·tablist)을
//       그리는 화면은 goSubTab 을 쓰거나, 판이 아니라 카드 안 입력·차트만 바꾸는 컨트롤이면 아래 목록에 이유와 함께 올린다.
// 음성 대조(2026-09-26 실행): (a) src 에 startViewTransition 호출 한 줄 · (b) App.tsx 에 setActiveTab('home') 한 줄 ·
//   (c) index.css 에 새 @keyframes 한 개를 넣으면 각각 빨개진다(되돌린 뒤 해시 대조).
//   (d) goSubTab 의 handOffSubPanel 한 줄 삭제 · NuriSpotPanel 의 goSubTab 을 setTab 직접 호출로 되돌림 → 각각 빨개진다(되돌린 뒤 해시 대조).
// 실행: npx vitest run src/components/transitionDevices.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');
/** src/index.css 의 `@theme inline { … }` 블록 범위(중괄호 짝) — Tailwind v4 테마 keyframes 가 여기 산다. */
const themeRange = (): [number, number] => {
  const css = read('src/index.css'); const start = css.indexOf('@theme inline {');
  if (start < 0) throw new Error('src/index.css 에 @theme inline { 이 없다 — 파서를 고쳐라');
  let depth = 0; for (let i = css.indexOf('{', start); i < css.length; i++) { if (css[i] === '{') depth++; else if (css[i] === '}' && --depth === 0) return [start, i + 1]; }
  throw new Error('@theme 블록이 닫히지 않는다');
};
const themeBlock = () => { const [a, b] = themeRange(); return read('src/index.css').slice(a, b); };
const cssOutsideTheme = () => { const [a, b] = themeRange(); const css = read('src/index.css'); return css.slice(0, a) + css.slice(b); };
/** 주석을 지운 코드(줄 수는 유지) — 역사 기록 주석에 남은 이름은 세지 않는다. */
const codeOnly = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/gm, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));

const srcFiles: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) srcFiles.push(p);
  }
};
walk(resolve(ROOT, 'src'));

describe('(a) View Transition 은 앱 어디에서도 돌지 않는다', () => {
  it('앵커 — src 파일을 실제로 읽었다(공허한 초록 방지)', () => {
    expect(srcFiles.length).toBeGreaterThan(100);
  });
  it('startViewTransition · withViewTransition 호출이 0 이다(허용 목록 없음)', () => {
    const hits: string[] = [];
    for (const f of srcFiles) {
      codeOnly(readFileSync(f, 'utf-8')).split('\n').forEach((line, i) => {
        if (/startViewTransition|withViewTransition/.test(line)) hits.push(`${f.slice(ROOT.length + 1)}:${i + 1} ${line.trim().slice(0, 90)}`);
      });
    }
    expect(hits, '스냅샷 교차를 되살렸다 — 이 앱에서 휘도가 튀는 부류다. 전면 전환은 판 교체 규칙(tabCover.ts)·Modal page 페이드를 써라').toEqual([]);
  });
});

describe('(b) 메인 탭은 commitTab 한 입구로만 바뀐다', () => {
  const app = codeOnly(read('src/App.tsx'));
  it('setActiveTab( 직접 호출은 commitTab 정의 안에만 있다', () => {
    const start = app.indexOf('const commitTab = useCallback(');
    expect(start, 'commitTab 정의를 못 찾았다 — 이름이 바뀌었으면 이 계약도 같이 고쳐라').toBeGreaterThan(0);
    const end = app.indexOf('\n  }, [', start);
    expect(end).toBeGreaterThan(start);
    const lines = app.split('\n');
    const outside: string[] = [];
    let pos = 0;
    lines.forEach((line, i) => {
      const at = pos;
      pos += line.length + 1;
      if (!/\bsetActiveTab\(/.test(line)) return;
      if (at > start && at < end) return;
      outside.push(`App.tsx:${i + 1} ${line.trim().slice(0, 90)}`);
    });
    expect(outside, 'commitTab 을 건너뛰는 탭 전환 — 스왑 프레임 정적화·첫 방문 트랜지션을 잃는다. commitTab(t) 을 불러라').toEqual([]);
  });
  it('commitTab 은 커밋 전에 notePaneLeaving 을, 탭 layout effect 는 handOffPane 을 부른다', () => {
    const body = app.slice(app.indexOf('const commitTab = useCallback('), app.indexOf('const commitTab = useCallback(') + 2500);
    expect(body.indexOf('notePaneLeaving(')).toBeGreaterThan(0);
    expect(body.indexOf('notePaneLeaving(')).toBeLessThan(body.indexOf('setActiveTab('));
    expect(app).toMatch(/handOffPane\(\)/);
  });
  it('부팅 링크(?tab·?nl) 정리는 탭 이력 effect 와 같은 layout 단계이고 그보다 먼저 선언된다', () => {
    // 이력 effect 가 먼저 돌면 `?nl=/admin` 칸을 밀어 넣어, 권한 없는 회원이 홈으로 되돌아갈 때 주소에 ?nl= 이 남는다
    //   (2026-09-26 e391fb2f 회귀 · auth-boot-gap G7b). 두 effect 가 서로 다른 단계면 선언 순서가 아무 의미가 없다.
    const clean = app.search(/use(Layout)?Effect\(\(\) => \{\s*try \{\s*const url = new URL\(window\.location\.href\);\s*if \(!url\.searchParams\.has\('tab'\)/);
    const trail = app.search(/use(Layout)?Effect\(\(\) => \{\s*const from = prevTabRef\.current;/);
    expect(clean, '부팅 링크 정리 effect 를 못 찾았다').toBeGreaterThan(0);
    expect(trail, '탭 이력 effect 를 못 찾았다').toBeGreaterThan(0);
    expect(app.slice(clean, clean + 16), '부팅 링크 정리가 layout 단계가 아니다').toMatch(/^useLayoutEffect/);
    expect(app.slice(trail, trail + 16), '탭 이력이 layout 단계가 아니다').toMatch(/^useLayoutEffect/);
    expect(clean, '부팅 링크 정리가 탭 이력보다 아래에 선언됐다').toBeLessThan(trail);
  });
  it('setActiveTab 은 App 밖으로 나가지 않는다(prop·컨텍스트로 내려보내지 않는다)', () => {
    expect(app.match(/[=({,]\s*setActiveTab\s*[,})]/g) ?? [], 'setActiveTab 을 값으로 넘겼다 — 받는 쪽이 입구를 우회한다').toEqual([]);
  });
});

describe('(c) 전환 장치 허용 목록 — 새 키프레임·WAAPI 는 이유와 함께 여기 올린다', () => {
  /** index.css @keyframes — 이름: 쓰는 곳·왜 따로 있어야 하는가. */
  const CSS_KEYFRAMES: Record<string, string> = {
    'reveal-up': '스크롤 구동 리빌(.reveal) — 전환이 아니라 스크롤 위치가 정하는 값',
    'marquee-loop': '긴 제목 흐름 — 상시 반복, 전환 아님',
    'confettiFall': '승급 축하 컨페티',
    'pointPop': '포인트 획득 튀어오름',
    'nuri-pop': '버튼 성공 피드백(anim-pop)',
    'nuri-heart': '좋아요 하트',
    'shake-x': '입력 오류 흔들림',
    'foil-sweep': '카드 광택 장식',
    'card-prize-in': '이용권 카드 연출',
    'card-strain': '이용권 찢기 연출',
    'card-tear-l': '이용권 찢기 연출',
    'card-tear-r': '이용권 찢기 연출',
    'shred-fly': '이용권 찢기 연출',
    'prize-burst': '상금 연출',
    'prize-pop': '상금 연출',
    // 아래 둘은 index.css 안의 죽은-규칙 삭제 기록 주석(예: `@keyframes tab-in-r/l`·`@keyframes vt-fade-out { to { opacity: 0 } }`) 자체가 이 정규식에 잡힌다(주석을 안 거르는 거친 검사) — 실제 @keyframes 는 0개.
    'tab-in-r': '⚠ 실제 규칙 0(2026-09-18 삭제) — index.css 주석의 삭제 기록 문구가 이 정규식에 잡힌다',
    'vt-fade-out': '⚠ 실제 규칙 0(2026-09-18 삭제) — index.css 주석의 삭제 기록 문구가 이 정규식에 잡힌다',
  };
  /** Tailwind 테마 keyframes(src/index.css 의 `@theme inline { … }` — 2026-09-28 v4 이관 전 tailwind.config.js) — 오버레이·시트의 진입/퇴장 한 벌. */
  const TW_KEYFRAMES: Record<string, string> = {
    'fade-in': '전면 판 열기 한 벌(atoms/pageMotion PAGE_ENTER — (e))·알림 스크림·라이트박스',
    'fade-out': '전면 판·모달 퇴장 한 벌(PAGE_LEAVE — (e))',
    'slide-up': '가운데 모달 진입·팝오버·축하 카드 — 전면 판에는 쓰지 않는다((e))',
    'sheet-up': '바텀 시트 진입',
    'slide-down': '바텀 시트 퇴장',
    'dim-in': '모달 딤',
    'nudge-down': '가운데 모달 퇴장의 본문 이동(slide-up 역방향 8px · 투명도는 래퍼 fade-out 한 겹) — M03 2026-10-08',
    'badge-pulse': '안 읽음 배지 — 전환 아님',
  };
  /** Element.animate(WAAPI) 를 부르는 파일 — 이유. */
  const WAAPI_FILES: Record<string, string> = {
    'src/components/atoms/Modal.tsx': '시트 드래그 닫기 뒤 제자리 복귀',
    'src/lib/spring.ts': '시트 드래그 스프링',
    'src/components/atoms/Fold.tsx': '본문 안 펼침/접힘 한 벌(높이 0↔실측 + 누른 요소 제자리) — 판 교체가 아니라 판 **안**의 조건부 렌더 ~40곳(2026-09-29 M단계)',
    'src/components/atoms/ToastView.tsx': '성공 토스트 체크 아이콘 획 그리기(stroke-dashoffset, 아이콘 한 개·1회) — 지연 청크 안이라 첫 화면 CSS 0B(2026-10-08 M04)',
    'src/components/features/gto/HandBoardPicker.tsx': '카드 슬롯 한 칸(36×48) 내려앉기 — 손으로 고른 순간만 transform·opacity 180ms, fill 없음(M06 2026-10-08 · 판 전환 아님)',
    'src/components/features/clock/levelCue.ts': '클락 레벨 경계 1회 빛(M07) — 레벨이 바뀔 때만 한 번, 타이머 로직과 무관(2026-10-08)',
    'src/lib/tabCover.ts': '9차 PANE-FADE(2026-10-09 오너 "너무 딱딱하다") — 메인·하위 판 교체 뒤 판 밖 지면색 막 한 장의 opacity 만 0.4→0 220ms. 앱의 유일한 판 전환 연출((d) 가 값·대상을 잠근다)',
  };
  it('index.css 의 @keyframes 는 목록에 있는 것뿐이다', () => {
    const names = [...cssOutsideTheme().matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(10);
    expect(names.filter((n) => !(n in CSS_KEYFRAMES)), '새 키프레임 — 목록에 이유와 함께 올리거나 기존 장치를 써라').toEqual([]);
  });
  it('Tailwind 테마(@theme)의 keyframes 는 목록에 있는 것뿐이다', () => {
    const names = [...themeBlock().matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(names.length, 'tailwind keyframes 를 못 읽었다(형식이 바뀌면 이 파서를 고쳐라)').toBeGreaterThan(3);
    expect(names.filter((n) => !(n in TW_KEYFRAMES)), '새 tailwind 키프레임 — 목록에 이유와 함께 올려라').toEqual([]);
  });
  it('Element.animate(WAAPI) 는 목록의 파일에서만 부른다', () => {
    const files = srcFiles.filter((f) => /\.animate\(/.test(codeOnly(readFileSync(f, 'utf-8'))))
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => !(f in WAAPI_FILES)), '새 WAAPI 전환 — 목록에 이유와 함께 올려라').toEqual([]);
  });
});

describe('(d) 하위 탭도 메인 탭과 같은 판 교체 장치를 탄다 — 한 입구 · 한 퇴장 함수 · 우회 금지', () => {
  const tc = codeOnly(read('src/lib/tabCover.ts'));
  const sub = codeOnly(read('src/lib/subTabTransition.ts'));
  it('goSubTab 은 commit() **전에** handOffSubPanel(떠나는 판 복제·스왑 정적화)을, 뒤에 alignSubTabPanel 을 부른다', () => {
    const body = sub.slice(sub.indexOf('export function goSubTab'));
    const h = body.indexOf('handOffSubPanel(scope'), c = body.indexOf('commit();'), a = body.indexOf('alignSubTabPanel(scope');
    expect(h, 'goSubTab 이 handOffSubPanel 을 안 부른다 — 하위 탭이 메인 탭과 다른(없는) 모션으로 바뀐다').toBeGreaterThan(0);
    expect(h).toBeLessThan(c);
    expect(c).toBeLessThan(a);
  });
  it('8차 INSTANT-SWAP — 메인·하위 판 교체는 한 프레임이다: 떠나는 판을 새 판 위에 겹쳐 걷는 장치(복제·퇴장 애니)가 없다', () => {
    // 오너 2026-10-08 "블러 처리되며 이동, 뒤에 살짝 네모칸" — 떠나는 판이 새 판 위에서 0.999→0 으로 걷히는 ~300ms 동안 두 판이 겹쳐 보였다.
    const fn = (name: string) => { const i = tc.indexOf(`export function ${name}(`); expect(i, `${name} 정의가 없다`).toBeGreaterThan(0); const rest = tc.slice(i); return rest.slice(0, rest.search(/\n}\r?\n/)); };
    // 9차 — 스왑 정적화 해제와 막 걷기는 **같은 콜백**(새 판 첫 프레임 다음)이다. 커밋 프레임에 걷기를 시작하면 빠진 타일(6차 원인).
    expect(fn('handOffPane'), '메인 탭 — 새 판 첫 프레임 다음 프레임에 정적화 해제 + 막 걷기').toMatch(/requestAnimationFrame\(\(\) => \{ releaseSwap\(gen\); fadeOut\(\); \}\)/);
    expect(fn('handOffPane'), '메인 탭 — 막은 첫 rAF(첫 페인트 전)에 깔고 둘째 rAF 에서 걷는다').toMatch(/requestAnimationFrame\(\(\) => \{\s*if \(armed\) fadeOut = coverAt\(/);
    expect(fn('handOffSubPanel'), '하위 탭 — 커밋 뒤 첫 프레임 다음 정적화 해제 + 막 걷기').toMatch(/afterFirstFrame\(\(\) => \{ releaseSwap\(gen\); fadeOut\(\); \}\)/);
    expect(tc, '떠나는 판 복제본이 돌아왔다').not.toMatch(/cloneNode\(|data-pane-leaving/);
    const cssCode = read('src/index.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(cssCode, 'index.css 에 떠나는 판 규칙([data-pane-leaving])이 돌아왔다').not.toMatch(/data-pane-leaving/);
    expect(cssCode, '스왑 프레임 정적화(빠진 타일 방지)는 남아야 한다').toMatch(/\[data-swap-freeze\], \[data-swap-freeze\] \* \{/);
  });
  it('9차 PANE-FADE — 판 전환 WAAPI 는 지면색 막 한 장의 opacity 뿐이고, 시작값 ≤ 0.6 · 붙잡지 않는다', () => {
    // 오너 2026-10-09 "블러모션을 없애라고 했더니 너무 딱딱해졌어". 5차(막 1.0 + 준비 대기 = 검정 깜빡임)·8차(떠나는 판 겹침 = 블러·네모칸)로 돌아가지 않게.
    expect((tc.match(/\.animate\(/g) ?? []).length, 'tabCover.ts 의 WAAPI 는 막 걷기 한 곳뿐이다').toBe(1);
    const call = tc.slice(tc.indexOf('.animate('), tc.indexOf('.animate(') + 160);
    expect(call, '막 걷기 keyframe 은 opacity 만(from → 0) · 길이 FADE_MS · 곡선 FADE_EASE').toMatch(/^\.animate\(\[\{ opacity: from \}, \{ opacity: 0 \}\], \{ duration: FADE_MS, easing: FADE_EASE, delay: -FADE_LEAD_MS \}\)/);
    // from = FADE_FROM, 연타로 걷히는 중인 막이 있으면 그 값(더 낮다 — 맥박 방지 P3-2). FADE_FROM 위로는 못 간다.
    expect(tc, '막 시작값(from)은 FADE_FROM 이하다').toMatch(/const from = cur > 0\.02 \? Math\.min\(FADE_FROM, cur\) : FADE_FROM;/);
    expect(Number(/const FADE_LEAD_MS = (\d+);/.exec(tc)?.[1]), '앞당김은 한 프레임까지(더 당기면 첫 프레임이 이미 거의 걷힌 컷이다)').toBeLessThanOrEqual(20);
    expect(tc, '막 이외에는 아무것도 움직이지 않는다 — filter·blur·transform 금지').not.toMatch(/\bfilter\s*[:=]|blur\(|transform|translate\(|scale\(/);
    const from = Number(/export const FADE_FROM = ([\d.]+);/.exec(tc)?.[1]);
    expect(from, '시작값 상한 0.6 — 0.85 는 운영 실측에서 빈 판 2프레임·번쩍 8.8(5차 검정 깜빡임 부류)').toBeLessThanOrEqual(0.6);
    expect(from, '시작값이 너무 낮으면 다시 딱딱하다').toBeGreaterThanOrEqual(0.4);
    const ms = Number(/export const FADE_MS = (\d+);/.exec(tc)?.[1]);
    expect(ms).toBeGreaterThanOrEqual(160); expect(ms).toBeLessThanOrEqual(260);
    expect(tc, '막은 판 밖 fixed 한 장이고 입력을 받지 않는다').toMatch(/data-pane-fade[\s\S]{0,200}position:fixed;pointer-events:none;/);
    // P2-1(design-reviewer 2026-10-09) — 막을 body 에 붙이면 앱 셸(relative z-1) 맥락 밖이라 셸 안 하단바(z-50)·누른 탭까지 흐린다.
    expect(tc, '막은 판과 같은 쌓임 맥락(앱 셸)에 붙는다 — body 직속 고정 금지').not.toMatch(/document\.body\.appendChild\(/);
    expect(tc).toMatch(/const hostFor = \(el: Element \| null\): Element => \(el \? el\.closest\(SHELL\) : document\.querySelector\(SHELL\)\) \?\? document\.body;/);
    expect(codeOnly(read('src/App.tsx')), '막이 붙는 셸 표식').toMatch(/<div data-app-shell="" className="relative z-1 /);
    const cover = tc.slice(tc.indexOf('function coverAt('), tc.indexOf('function mainRect('));
    expect(cover.length).toBeGreaterThan(200);
    expect(cover, '막은 판 준비를 기다리지 않는다(waitSettled·isSettled 금지 — 5차 원인)').not.toMatch(/waitSettled|isSettled|tabPaneReady/);
    expect(cover, '동작 줄이기·숨은 문서에서는 막 0').toMatch(/fadeOff\(\)/);
    expect(tc).toMatch(/const fadeOff = \(\): boolean => document\.hidden \|\| window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches;/);
  });
  it('SlidingPill 은 판 교체 중(html[data-tab-swap]) 미끄러짐을 새 판 첫 프레임 뒤로 미룬다(스왑 프레임에 합성 애니 0)', () => {
    expect(codeOnly(read('src/components/atoms/SlidingPill.tsx'))).toMatch(/hasAttribute\('data-tab-swap'\)/);
  });
  /** 탭 레일을 그리지만 goSubTab 을 쓰지 않는 파일 — 판이 아니라 카드 안 입력·차트·정렬만 바꾼다(또는 부품 자신). */
  const NOT_SUBTAB: Record<string, string> = {
    'src/App.tsx': 'PC 상단 대메뉴(GNB) 밑줄 — 메인 탭 레일이다. 판 교체 입구는 (b) 의 commitTab 한 곳이고(notePaneLeaving·handOffPane), SlidingPill 이 판 교체 중 FLIP 을 미룬다(PC-MOTION-1010)',
    'src/components/atoms/SegmentedTabs.tsx': '부품 — 입구는 쓰는 쪽이 부른다',
    'src/components/atoms/UnderlineTabs.tsx': '부품 — 입구는 쓰는 쪽이 부른다',
    'src/components/atoms/SlidingPill.tsx': '부품(인디케이터)',
    'src/components/atoms/ViewModeToggle.tsx': '부품 — 목록/격자 보기 토글(판 교체 아님)',
    'src/components/features/CalendarPanel.tsx': "'기록 추가' 폼의 입력 모드(결과/계획) — 입력칸 몇 개만 바뀐다",
    'src/components/features/ICMCalculator.tsx': '계산기 카드 안 모드(ICM/딜/팟 오즈) — 입력칸이 바뀐다',
    'src/components/features/LedgerStatsPanel.tsx': '통계 카드 안 기간·지표 토글 — 차트만 다시 그린다',
    'src/components/features/NuriPosLedger.tsx': '장부 목록 정렬 토글',
    'src/components/features/tools/PushFoldChart.tsx': '푸시/폴드 차트 보기(올인/콜) — 같은 차트 칸',
    'src/components/features/tools/RangeGuide.tsx': '레인지 차트 스택 깊이(25/40/60/100bb) — 같은 카드의 표 데이터만 바뀐다(2026-10-09)',
    'src/components/features/tools/StartingHandRankPanel.tsx': '순위 기준 토글(10인/헤즈업) — 같은 격자·목록의 값만 바뀐다(2026-10-01)',
  };
  it('탭 레일을 그리는 화면은 goSubTab 을 쓴다(아니면 위 목록에 이유와 함께)', () => {
    const rail = /<SegmentedTabs|<UnderlineTabs|<SlidingPill|role="tablist"/;
    const hits = srcFiles.filter((f) => f.endsWith('.tsx') && rail.test(readFileSync(f, 'utf-8')))
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));
    expect(hits.length, '탭 레일 파일을 못 찾았다(공허한 초록 방지)').toBeGreaterThan(15);
    const bypass = hits.filter((f) => !(f in NOT_SUBTAB) && !/goSubTab\(/.test(codeOnly(read(f))));
    expect(bypass, '하위 탭을 goSubTab 없이 바꾼다 — 메인 탭과 같은 판 교체(스왑 정적화·P2 스크롤)를 잃는다. goSubTab(scope, …) 으로 감싸고 SUB_PANEL 에 판 표식을 올려라').toEqual([]);
    expect(Object.keys(NOT_SUBTAB).filter((f) => !hits.includes(f)), '목록에 있는데 더는 탭 레일이 없다 — 목록에서 빼라').toEqual([]);
  });
});

// (e) 전면 판(화면 전체가 새로 열리는 곳)은 **한 벌**로 열고 닫는다 — 오너 2026-09-27 "여는 방식이 두 가지 — 통일해".
//   그전: 매장·그룹 = slide-up(8px 넛지 + 투명도 0→1, 0.25s) · Modal page(게시글·일정 상세·도구) = fade-in(0.45→1, 0.16s) ·
//   이벤트 목록·보드·내 정보 = 효과 없음(한 프레임 컷, 내 정보는 닫힘도 컷). 닫기는 이미 fade-out 한 벌이었다.
//   → atoms/pageMotion 의 PAGE_ENTER·PAGE_LEAVE 두 값만 쓴다. 판 루트(불투명 지면 `fixed inset-0`)를 찾아 전부 검사한다.
//   고른 근거(2026-09-27 실측 — 390·360 × 다크·라이트, DPR3 · CPU4 · 스크롤한 상태, 버튼·뒤로·드래그, 프로브 scratchpad ov/probe.cjs):
//     A = fade-in(0.45→1, 0.16s, 투명도만) · B = fade + 8px 떠오름(0.2s). 두 안 모두 blink·빈 판 0, missing-content 는 전과 같은 잡음 범위.
//     열기 정착(중앙값) 매장 A 128~132ms / B 215~222ms / 전 257~259ms · 이벤트 목록 A 131~149 / B 149~182 · 게시글 A 248 / B 295.
//     → 더 빨리 정착하고 이동(transform)이 없는 A. 이벤트 보드(카드 100장) 첫 프레임 LoAF 도 하드 컷 92~160 vs A 88~169 로 같다.
// 음성 대조(2026-09-27 실행): VenuePage(slide-up)·EventPage(효과 없음)·CustomerDashboardPage(열기·닫기 컷) 원본 3개로 되돌리면
//   아래 '열기'·'닫기' 두 단언이 빨개진다(되돌린 뒤 해시 대조). 실화면 단언은 e2e/motion-unify.spec.ts MU5.
describe('(e) 전면 판 열기·닫기는 한 벌 — atoms/pageMotion 의 PAGE_ENTER·PAGE_LEAVE', () => {
  it('한 벌의 값 — 투명도만(이동 없음)', () => {
    const pm = codeOnly(read('src/components/atoms/pageMotion.ts'));
    expect(pm).toMatch(/export const PAGE_ENTER = 'animate-fade-in';/);
    expect(pm).toMatch(/export const PAGE_LEAVE = 'animate-fade-out';/);
  });
  /** 전면 판 루트가 있는 파일 — 무엇인가. 루트는 PAGE_ENTER 로 열린다. */
  const FULL_PAGES: Record<string, string> = {
    'src/components/atoms/Modal.tsx': 'page 변형 — 게시글·일정 상세·GTO/매장/캘린더 도구·GTO 분석',
    'src/components/features/VenuePage.tsx': '매장 페이지',
    'src/components/features/GroupPage.tsx': '그룹 페이지',
    'src/components/features/EventPage.tsx': '이벤트 보드',
    'src/components/features/EventListPage.tsx': '이벤트 목록',
    'src/components/features/CustomerDashboardPage.tsx': '내 정보(대시보드) · 비로그인 로그인 랜딩',
    'src/components/features/AdminTab.tsx': '관리자 매장 장부/통계(PC)',
  };
  /** 닫기 페이드가 없어도 되는 전면 판 — 이유. */
  const NO_LEAVE: Record<string, string> = {
    'src/components/features/AdminTab.tsx': '관리자 PC 장부/통계 — 부모가 닫는 커밋에 언마운트한다(관리자 전용·별건)',
  };
  /** 불투명 지면 `fixed inset-0` 이지만 '앱 안에서 열리는 전면 판'이 아닌 것 — 이유. */
  const NOT_PAGE: Record<string, string> = {
    'src/App.tsx': 'OverlayFallback — 청크를 기다리는 Suspense 폴백(전환이 아니라 대기 화면, 곧 판으로 바뀐다)',
    'src/components/features/clock/ClockRemote.tsx': '클락 리모컨 — 전용 진입 주소(?remote)로 여는 독립 화면, 앱 안 전환 없음',
    'src/components/features/LedgerWorkspace.tsx': '장부 전체화면 — 브라우저 Fullscreen API 전환이 모션을 맡는다',
  };
  const roots = srcFiles.filter((f) => f.endsWith('.tsx')).flatMap((f) => {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
    const lines = codeOnly(readFileSync(f, 'utf-8')).split('\n');
    return lines.flatMap((l, i) => {
      if (!/fixed inset-0/.test(l)) return [];
      // 여는 태그 끝(`=>` 가 아닌 첫 `>`)까지만 — 안쪽 카드의 지면색(가운데 모달·시트)을 판 루트로 오인하지 않는다.
      const joined = lines.slice(i, i + 3).join('\n');
      const end = joined.search(/[^=]>/);
      const win = end < 0 ? joined : joined.slice(0, end + 1);
      return /bg-surface-(base|mid)\b(?!\/)/.test(win) ? [{ rel, at: `${rel}:${i + 1}`, win }] : [];
    });
  });
  it('앵커 — 전면 판 루트를 실제로 찾았다(공허한 초록 방지)', () => {
    expect(roots.length).toBeGreaterThanOrEqual(10);
    for (const f of Object.keys(FULL_PAGES)) expect(roots.some((r) => r.rel === f), `${f} 에서 전면 판 루트를 못 찾았다 — 모양이 바뀌었으면 이 스캐너를 고쳐라`).toBe(true);
  });
  it('모든 전면 판 루트는 목록에 있다(새 전면 판은 이유와 함께 올린다)', () => {
    expect(roots.filter((r) => !(r.rel in FULL_PAGES) && !(r.rel in NOT_PAGE)).map((r) => r.at), '목록에 없는 전면 판 — PAGE_ENTER·PAGE_LEAVE 로 열고 닫고 FULL_PAGES 에 올려라').toEqual([]);
  });
  it('전면 판 루트는 PAGE_ENTER 로 열고, 다른 진입 효과를 섞지 않는다', () => {
    const bad = roots.filter((r) => r.rel in FULL_PAGES).flatMap((r) => {
      const why: string[] = [];
      if (!/\bPAGE_ENTER\b/.test(r.win)) why.push('PAGE_ENTER 없음(한 프레임 컷이거나 다른 장치)');
      const other = r.win.match(/animate-(?:slide-up|sheet-up|fade-in|scale-in|zoom-in)|animationDuration/g);
      if (other) why.push(`다른 진입 효과: ${other.join(',')}`);
      return why.length ? [`${r.at} ${why.join(' · ')}`] : [];
    });
    expect(bad, '전면 판이 두 번째 여는 방식을 쓴다 — atoms/pageMotion 의 PAGE_ENTER 로').toEqual([]);
  });
  it('전면 판 루트는 PAGE_LEAVE 로 닫는다(한 프레임 컷 금지 — NO_LEAVE 는 이유와 함께)', () => {
    const bad = roots.filter((r) => r.rel in FULL_PAGES && !(r.rel in NO_LEAVE) && !/\bPAGE_LEAVE\b/.test(r.win)).map((r) => r.at);
    expect(bad, '닫기가 페이드가 아니다 — PAGE_LEAVE 로 닫고 useDelayedUnmount 로 220ms 붙잡아라').toEqual([]);
  });
});
