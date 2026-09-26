// 화면 전환 장치 허용 목록 — 동작 보증 계약(2026-09-26 오너: "왜 여러 개냐, 꼭 필요하지 않으면 한 개로" · "수정할 때마다 회귀하지 않게 코드로 강제").
//
// 이 계약이 보증하는 동작:
//   (a) 앱 어디에서도 document View Transition(스냅샷 교차)이 돌지 않는다.
//       이 앱에서 스냅샷 교차는 라이트·다크 지면 휘도 차 때문에 열기·닫기 어느 쪽이든 ±10~33 번쩍였고(flick 실측 3회),
//       모바일에서는 삼성 인터넷이 스냅샷을 세로로 눌렀다(1862bb49). 경로마다 따로 고치다 한쪽이 남는 일이 반복됐다.
//   (b) 메인 탭은 **한 입구(commitTab)** 로만 바뀐다 — 그래야 모든 진입(하단바·뒤로가기·알림 링크·로그인 뒤 복원)이
//       판 교체 규칙(스왑 프레임 정적화 + 떠나는 판 페이드, src/lib/tabCover.ts 6차 절)을 똑같이 탄다.
//       직접 setActiveTab 은 그 규칙을 건너뛴다(2026-09-26 로그인 뒤 탭 복원이 실제로 그랬다).
//   (c) 화면 전환 키프레임·WAAPI 는 아래 목록뿐이다. 새 장치를 더하려면 이 목록에 **이유와 함께** 올려라 —
//       조용히 늘어나는 것을 막는 것이 목적이다(같은 전환이 두 방식으로 구현되면 그 자체가 결함).
//   (d) 하위 탭도 메인 탭과 **같은 장치·같은 수치**다(오너 2026-09-26 "메인 카테고리 이동 때의 부드러운 모션을 하위 탭에서도 동일하게").
//       goSubTab 한 입구가 커밋 전에 handOffSubPanel 을 부르고, 메인(handOffPane)·하위(handOffSubPanel)가 **같은 퇴장 함수**
//       (fadeAfterFirstFrame — 떠나는 판만 240ms 페이드, 새 판 무효과)를 쓴다. 탭 레일(SegmentedTabs·UnderlineTabs·SlidingPill·tablist)을
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
    expect(outside, 'commitTab 을 건너뛰는 탭 전환 — 스왑 프레임 정적화·떠나는 판 페이드·첫 방문 트랜지션을 잃는다. commitTab(t) 을 불러라').toEqual([]);
  });
  it('commitTab 은 커밋 전에 notePaneLeaving 을, 탭 layout effect 는 handOffPane 을 부른다', () => {
    const body = app.slice(app.indexOf('const commitTab = useCallback('), app.indexOf('const commitTab = useCallback(') + 2500);
    expect(body.indexOf('notePaneLeaving(')).toBeGreaterThan(0);
    expect(body.indexOf('notePaneLeaving(')).toBeLessThan(body.indexOf('setActiveTab('));
    expect(app).toMatch(/handOffPane\(activeTab\)/);
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
    'tab-in-r': '⚠ 사용처 0(죽은 규칙) — 다음 정리 대상',
    'vt-fade-out': '⚠ View Transition 잔재(사용처 0) — 다음 정리 대상',
    'vt-pc-in': '⚠ View Transition 잔재(사용처 0) — 다음 정리 대상',
    'vt-push-in-l': '⚠ View Transition 잔재(사용처 0) — 다음 정리 대상',
    'vt-push-in-r': '⚠ View Transition 잔재(사용처 0) — 다음 정리 대상',
    'vt-push-out-l': '⚠ View Transition 잔재(사용처 0) — 다음 정리 대상',
    'vt-push-out-r': '⚠ View Transition 잔재(사용처 0) — 다음 정리 대상',
  };
  /** tailwind.config.js keyframes — 오버레이·시트의 진입/퇴장 한 벌. */
  const TW_KEYFRAMES: Record<string, string> = {
    'fade-in': 'Modal page·가운데 모달·전면 오버레이 진입',
    'fade-out': '전면 오버레이·모달 퇴장(한 벌)',
    'slide-up': '가운데 모달 진입·팝오버',
    'sheet-up': '바텀 시트 진입',
    'slide-down': '바텀 시트 퇴장',
    'dim-in': '모달 딤',
    'badge-pulse': '안 읽음 배지 — 전환 아님',
  };
  /** Element.animate(WAAPI) 를 부르는 파일 — 이유. */
  const WAAPI_FILES: Record<string, string> = {
    'src/components/atoms/Modal.tsx': '시트 드래그 닫기 뒤 제자리 복귀',
    'src/lib/spring.ts': '시트 드래그 스프링',
    'src/lib/tabCover.ts': '떠나는 판 퇴장 페이드 — 메인 탭·하위 탭 공용(판 교체 규칙의 유일한 모션, fadeAfterFirstFrame 한 곳)',
  };
  it('index.css 의 @keyframes 는 목록에 있는 것뿐이다', () => {
    const names = [...read('src/index.css').matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(10);
    expect(names.filter((n) => !(n in CSS_KEYFRAMES)), '새 키프레임 — 목록에 이유와 함께 올리거나 기존 장치를 써라').toEqual([]);
  });
  it('tailwind.config.js 의 keyframes 는 목록에 있는 것뿐이다', () => {
    const tw = read('tailwind.config.js');
    const block = tw.slice(tw.indexOf('keyframes:'), tw.indexOf('animation:', tw.indexOf('keyframes:')));
    const names = [...block.matchAll(/^\s{6,8}'([\w-]+)':\s*\{/gm)].map((m) => m[1]);
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
  it('메인·하위가 같은 퇴장 함수(fadeAfterFirstFrame)를 쓰고, 퇴장 애니(.animate)는 그 한 곳뿐이다', () => {
    const fn = (name: string) => { const i = tc.indexOf(`export function ${name}(`); expect(i, `${name} 정의가 없다`).toBeGreaterThan(0); const rest = tc.slice(i); return rest.slice(0, rest.search(/\n}\r?\n/)); };
    expect(fn('handOffPane')).toMatch(/fadeAfterFirstFrame\(/);
    expect(fn('handOffSubPanel')).toMatch(/fadeAfterFirstFrame\(/);
    expect((tc.match(/\.animate\(/g) ?? []).length, '퇴장 페이드가 두 벌이 됐다 — fadeAfterFirstFrame 하나로').toBe(1);
    expect(tc).toMatch(/const LEAVE_FADE_MS = 240;/);
  });
  it('SlidingPill 은 판 교체 중(html[data-tab-swap]) 미끄러짐을 새 판 첫 프레임 뒤로 미룬다(스왑 프레임에 합성 애니 0)', () => {
    expect(codeOnly(read('src/components/atoms/SlidingPill.tsx'))).toMatch(/hasAttribute\('data-tab-swap'\)/);
  });
  /** 탭 레일을 그리지만 goSubTab 을 쓰지 않는 파일 — 판이 아니라 카드 안 입력·차트·정렬만 바꾼다(또는 부품 자신). */
  const NOT_SUBTAB: Record<string, string> = {
    'src/components/atoms/SegmentedTabs.tsx': '부품 — 입구는 쓰는 쪽이 부른다',
    'src/components/atoms/UnderlineTabs.tsx': '부품 — 입구는 쓰는 쪽이 부른다',
    'src/components/atoms/SlidingPill.tsx': '부품(인디케이터)',
    'src/components/atoms/ViewModeToggle.tsx': '부품 — 목록/격자 보기 토글(판 교체 아님)',
    'src/components/features/CalendarPanel.tsx': "'기록 추가' 폼의 입력 모드(결과/계획) — 입력칸 몇 개만 바뀐다",
    'src/components/features/ICMCalculator.tsx': '계산기 카드 안 모드(ICM/딜/팟 오즈) — 입력칸이 바뀐다',
    'src/components/features/LedgerStatsPanel.tsx': '통계 카드 안 기간·지표 토글 — 차트만 다시 그린다',
    'src/components/features/NuriPosLedger.tsx': '장부 목록 정렬 토글',
    'src/components/features/tools/PushFoldChart.tsx': '푸시/폴드 차트 보기(올인/콜) — 같은 차트 칸',
  };
  it('탭 레일을 그리는 화면은 goSubTab 을 쓴다(아니면 위 목록에 이유와 함께)', () => {
    const rail = /<SegmentedTabs|<UnderlineTabs|<SlidingPill|role="tablist"/;
    const hits = srcFiles.filter((f) => f.endsWith('.tsx') && rail.test(readFileSync(f, 'utf-8')))
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));
    expect(hits.length, '탭 레일 파일을 못 찾았다(공허한 초록 방지)').toBeGreaterThan(15);
    const bypass = hits.filter((f) => !(f in NOT_SUBTAB) && !/goSubTab\(/.test(codeOnly(read(f))));
    expect(bypass, '하위 탭을 goSubTab 없이 바꾼다 — 메인 탭과 같은 판 교체(떠나는 판 페이드)를 잃는다. goSubTab(scope, …) 으로 감싸고 SUB_PANEL 에 판 표식을 올려라').toEqual([]);
    expect(Object.keys(NOT_SUBTAB).filter((f) => !hits.includes(f)), '목록에 있는데 더는 탭 레일이 없다 — 목록에서 빼라').toEqual([]);
  });
});
