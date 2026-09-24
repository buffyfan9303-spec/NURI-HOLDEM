// HOME-DENSITY(2026-09-24 오너: "'9월 24일 (목) 일정' 글씨 크기 줄여주고 나머지 공백들도 조금 줄여서
// 한 페이지에 들어가는 콘텐츠 양을 조금 늘려줘") 재발 방지 계약.
//
// 실측(390×844 · 오늘 5건 목킹 · dev): 첫 화면에 온전히 보이는 일정 카드 3 → 4장(320: 2 → 4).
// 화면 수치는 브라우저 몫이다(scratchpad 하네스). 여기서는 그 결과를 만든 **조리법**이 자리에 있는지만 본다.
// 실행: npx vitest run src/components/features/homeDensity.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'src', 'components', 'features');
const HOME = readFileSync(join(dir, 'HomeTab.tsx'), 'utf8');
const PC = readFileSync(join(dir, 'PosterCarousel.tsx'), 'utf8');

describe('배너 제어 — 별도 줄이 아니라 프레임 안', () => {
  const ctrl = PC.slice(PC.indexOf('data-testid="home-banner-dots"') - 200, PC.indexOf('data-testid="home-banner-dots"') + 2200);
  it('제어 묶음이 프레임(relative) 안의 absolute 다 — 배너 밑에 줄을 다시 만들지 않는다', () => {
    expect(PC).toMatch(/poster-frame relative/);
    expect(ctrl).toMatch(/absolute inset-x-0 bottom-0[^"]*" data-testid="home-banner-dots"/);
  });
  it('화살표 실박스가 44×44 다(종전 32×32)', () => {
    const arrows = ctrl.match(/aria-label="(이전|다음) 배너"\s*\n\s*className="[^"]*"/g) ?? [];
    expect(arrows.length).toBe(2);
    for (const a of arrows) expect(a).toMatch(/h-\[44px\] w-\[44px\]/);
  });
  it('여러 장일 때 슬라이드 글자가 제어 띠 위로 올라간다', () => {
    expect(PC).toMatch(/multi \? 'pb-8' : 'pb-3'/);
    expect(PC.match(/multi \? 'pb-6' : ''/g)?.length).toBe(2);
  });
});

describe('일정 목록 스켈레톤 — 실제와 같은 높이', () => {
  it('행 높이를 토큰으로 고정한다(min-h 면 안쪽 막대가 토큰을 넘어 행마다 +8px)', () => {
    expect(HOME).toMatch(/className="flex h-\[var\(--card-h-list\)\] items-center gap-3 overflow-hidden px-3 py-1\.5"/);
  });
  it('끝의 "전체 일정 보기"(44px) 자리를 예약한다', () => {
    const skel = HOME.slice(HOME.indexOf('aria-busy="true"'), HOME.indexOf(') : failed ? ('));
    expect(skel).toMatch(/min-h-\[44px\]/);
  });
  it('다음 방문 행 수는 **화면에 그린** 목록 길이다(오늘+내일 수가 아니다)', () => {
    expect(HOME).toMatch(/writeSeenCount\(UPCOMING_SEEN, \(useFallback \? nextUp : dayVisible\)\.length/);
  });
});

// ── HOME-LAYOUT-STRETCH(2026-09-24 오너: "메인 홈이 글씨부터 가로로 너무 늘어진 느낌 · 메인 배너 가로폭을 늘리고 싶다") ──
// 실측(scratchpad hl/before·after stretch.json · fit-v3.json): PC 1440 카드 본문 끝→시각 771~810px → 74~113px,
// 날짜 칩 208px/글자 25px(8.4배) → 55/29(1.9배), 일정 머리 제목↔건수 956px → 8.5px, 모바일 배너 341 → 375px(375 기준).
const CARD = readFileSync(join(dir, 'ScheduleCard.tsx'), 'utf8');
const INDEX = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const TT = CARD.slice(CARD.indexOf('function TimetableCard('), CARD.indexOf('// ── 익스포트'));

describe('홈 일정 카드 — [로고][본문][우측 열] 시간표형', () => {
  it('홈만 timetable 배치를 쓴다(일정 탐색·라이브 ListCard 는 그대로)', () => {
    expect(HOME).toMatch(/<ScheduleCard mode="list" layout="timetable"/);
    expect(CARD).toMatch(/layout === 'timetable' \? <TimetableCard \{\.\.\.rest\} \/> : <ListCard \{\.\.\.rest\} \/>/);
  });
  it('우측 열은 고정 폭(minmax rem) · md~ 본문 17rem 상한 + justify-start — 시각이 카드 끝으로 떨어지지 않는다', () => {
    expect(TT).toMatch(/grid-cols-\[auto_minmax\(0,1fr\)_minmax\(2\.75rem,auto\)\]/);
    expect(TT).toMatch(/md:grid-cols-\[auto_minmax\(0,17rem\)_minmax\(3\.25rem,auto\)\] md:justify-start/);
  });
  it('시각은 제목과 같은 줄(2행)에서 시작하고, 로고는 맨 왼쪽 3행 전체다', () => {
    expect(TT).toMatch(/col-start-1 row-span-3 row-start-1/);
    expect(TT).toMatch(/col-start-3 row-span-2 row-start-2[^"]*self-start/);
    expect(TT).toMatch(/<h3 className="col-start-2 row-start-2/);
  });
  it('글자를 말줄임으로 숨기지 않는다 — 제목에 line-clamp·truncate 가 없다', () => {
    const h3 = TT.slice(TT.indexOf('<h3'), TT.indexOf('</h3>'));
    expect(h3).not.toMatch(/line-clamp|truncate/);
    expect(h3).toMatch(/\[overflow-wrap:anywhere\]/);
  });
  it('매장·지역 줄은 본문+우측 열 두 칸에 걸친다(320 에서 실제 최장 매장명 17자가 한 줄에 서는 근거)', () => {
    expect(TT).toMatch(/col-span-2 col-start-2 row-start-1/);
  });
  it('오른쪽 끝에 떨어진 꺾쇠가 없다', () => {
    expect(TT).not.toMatch(/chevron-right/);
  });
  it('게임 종류는 매장·지역 줄(우측 열 밖) · 우측 열 = 시각 + 상태 한 줄(생존/엔트리 또는 현재 레벨, 11px = 시각 17px 의 0.65)', () => {
    const grp = TT.indexOf('data-testid="schedule-start-group"');
    expect(TT.indexOf('data-testid="schedule-grade-badge"')).toBeLessThan(TT.indexOf('<h3'));
    expect(TT.indexOf('data-testid="schedule-game-type"')).toBeLessThan(TT.indexOf('<h3'));
    expect(TT.indexOf('data-testid="schedule-current-level"')).toBeGreaterThan(grp);
    expect(TT.indexOf('data-testid="schedule-field-count"')).toBeGreaterThan(grp);
    expect(TT).toMatch(/regInfo\?\.hasField \? \(/);
    expect(TT.match(/text-\[10px\] font-bold leading-none tabular-nums text-ink-secondary min-\[360px\]:text-\[11px\]/g)?.length).toBe(2);
    expect(TT).toMatch(/regInfo\.onBreak \? '휴식' : regInfo\.levelNo \? `L\$\{regInfo\.levelNo\}` : '진행 중'/);
    expect(TT).toMatch(/=== 'upcoming' \? '시작 전' : 'L —'/);
    // 시각은 leading-none 이 지켜져야 한다 — text-base 유틸은 lineHeight 를 같이 실어 카드가 82px 로 부풀었다(실측).
    expect(TT).toMatch(/min-\[360px\]:text-\[1rem\]/);
    expect(TT).not.toMatch(/min-\[360px\]:text-base/);
  });
  it('일정 탭(browse) 목록도 시간표형이다 — 라이브 탭은 종전 그대로', () => {
    const APP = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(APP.match(/layout="timetable"/g)?.length).toBe(2);
    const LIVE = readFileSync(join(dir, 'LiveGamesTab.tsx'), 'utf8');
    expect(LIVE).not.toMatch(/layout="timetable"/);
  });
  it('계측 손잡이(testid·data-metrics)를 그대로 단다', () => {
    for (const id of ['schedule-start-group', 'schedule-start-time', 'schedule-grade-badge', 'schedule-field-count']) expect(TT).toContain(`data-testid="${id}"`);
    expect(TT).toMatch(/data-metrics/);
  });
});

describe('PC 일정 목록 2열 · 머리 줄', () => {
  it('목록·스켈레톤·지금 등록 가능이 같은 lg~ 2열 격자다(폴백 갈래는 한 열 · md 는 지표가 접혀 제외 — 근거는 HomeTab 주석)', () => {
    expect(HOME).toMatch(/const HOME_LIST_GRID = 'lg:grid lg:grid-cols-2 lg:divide-y-0 lg:\[&>\*\]:shadow-\[0_0_0_0\.5px_rgb\(var\(--border-subtle\)\)\]'/);
    expect(HOME.match(/card-aura \$\{HOME_LIST_GRID\}`\}/g)?.length, '지금 등록 가능(목록·스켈레톤)과 일정 스켈레톤').toBe(3);
    expect(HOME).toMatch(/card-aura \$\{HOME_LIST_GRID\}`\} aria-busy="true"/);
    expect(HOME).toMatch(/card-aura \$\{useFallback \? '' : HOME_LIST_GRID\}`\}/);
    expect(HOME).toMatch(/data-testid="home-upcoming-all"\s*\n\s*className="flex min-h-\[44px\] w-full lg:col-span-2/);
  });
  it('일정 탐색(browse) 목록·스켈레톤도 PC 2열 · 날짜 머리말은 두 칸 전체', () => {
    const APP = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(APP.match(/lg:grid lg:grid-cols-2 lg:divide-y-0 lg:\[&>\*\]:shadow-\[0_0_0_0\.5px_rgb\(var\(--border-subtle\)\)\]/g)?.length).toBe(2);
    expect(APP).toMatch(/text-ink-secondary lg:col-span-2">\{h\}<\/p>/);
  });
  it('건수가 제목 바로 뒤에 붙는다(양끝 정렬 금지)', () => {
    const hdr = HOME.slice(HOME.indexOf('data-testid="home-schedule-title"') - 120, HOME.indexOf('data-testid="home-schedule-title"'));
    expect(hdr).toMatch(/<header className="flex flex-wrap items-baseline gap-x-2 pb-2">/);
  });
});

describe('날짜 스트립', () => {
  const rail = HOME.slice(HOME.indexOf('data-testid="home-date-rail"'), HOME.indexOf('{/* ② 선택일 제목'));
  it('9주 스트립 · 한 화면 7칸(칩 = 1/7, 최소 44px · md~ 3.25rem×7) · 스냅 가로 스크롤', () => {
    expect(HOME).toMatch(/const STRIP_DAYS = 64;/);
    expect(HOME).toMatch(/const STRIP_PAST = 3;/);   // 첫 화면에서 오늘이 7칸의 가운데
    expect(rail).toMatch(/data-testid="home-date-strip"[\s\S]{0,300}snap-x snap-mandatory overflow-x-auto[^"]*px-\[max\(0px,min\(16px,calc\(\(100%-308px\)\/2\)\)\)\] md:w-\[calc\(22\.75rem\+32px\)\] md:flex-none md:px-\[16px\]/);
    expect(rail).toMatch(/min-h-\[44px\] w-\[calc\(100%\/7\)\] min-w-\[44px\] shrink-0 snap-center[^']*md:w-\[3\.25rem\]/);
  });
  it('PC 에서만 화살표 · 달력 버튼과 네이티브 날짜 선택은 없다(2차 오너 지시로 제거)', () => {
    expect(rail).toMatch(/data-testid="home-date-prev"[\s\S]{0,300}hidden[^"]*md:grid/);
    expect(HOME).not.toMatch(/type="date"|home-date-calendar|showPicker/);
  });
  it('양끝 페이드(mask-image) — 스크롤 끝이면 그쪽을 끈다(오너 2026-09-24)', () => {
    expect(rail).toMatch(/style=\{\{ maskImage: stripMask, WebkitMaskImage: stripMask \}\}/);
    expect(HOME).toMatch(/const l = sc\.scrollLeft > 1;/);
    expect(HOME).toMatch(/const r = sc\.scrollLeft \+ sc\.clientWidth < sc\.scrollWidth - 1;/);
    // 페이드 폭 = 온전한 칩 묶음 바깥 남는 폭(최대 16px) — 7칸 창 안의 끝 칩은 흐려지지 않는다(design-reviewer 2026-09-24, hl/strip2 fadedFull 0)
    expect(HOME).toMatch(/Math\.max\(0, Math\.min\(16, \(sc\.clientWidth - n \* cw\) \/ 2\)\)/);
    expect(HOME).toMatch(/stripEdge\.l \? `transparent 0, #000 \$\{stripEdge\.f\}px` : '#000 0'/);
  });
  it('좁은 폭 첫 배치는 스트립 scrollLeft 만(다음 프레임) — 창 스크롤 API 를 쓰지 않는다', () => {
    const first = HOME.slice(HOME.indexOf('if (!stripPlaced.current) {'), HOME.indexOf('return () => cancelAnimationFrame(id);'));
    expect(first).toMatch(/requestAnimationFrame/);
    expect(first).toMatch(/sc\.scrollLeft = target/);
    expect(first).not.toMatch(/scrollIntoView|window\.scroll|getBoundingClientRect/);
  });
  it('대회 있는 날 점은 이미 받은 schedules 로만 센다(새 조회 0)', () => {
    expect(HOME).toMatch(/const gameDays = useMemo\(\s*\(\) => new Set\(schedules\.filter/);
  });
});

describe('배너 가로폭', () => {
  it('모바일(≤767) 풀블리드 — 좌우 여백·좌우 테두리·둥근 모서리를 뺀다, md~ 종전 카드', () => {
    expect(PC).toMatch(/poster-frame relative overflow-hidden border card-aura max-md:rounded-none max-md:border-x-0 md:mx-page-x md:rounded-aura lg:mx-0/);
    expect(PC).toMatch(/'relative min-h-\[132px\] w-full/);   // 2026-09-24 오너 지시 116 → 132
  });
  it('정적 셸 배너 예약이 같은 모양이다(첫 페인트 CLS)', () => {
    expect(INDEX).toMatch(/<div class="pt-0 md:pt-2\.5"><div class="border border-transparent max-md:rounded-none max-md:border-x-0 md:mx-page-x md:rounded-aura"><div class="skeleton min-h-\[132px\]/);
    expect(INDEX).toMatch(/<div class="max-md:-mt-\[5px\]" style="height:44px;display:flex;align-items:center"><div class="skeleton" style="height:26px;width:230px"><\/div><\/div>/);
    // React 쪽도 같은 여백이다(모바일 상단 공백 축소 — 오너 2026-09-24)
    expect(PC).toMatch(/<div className="pt-0 md:pt-2\.5 lg:pt-0">/);
    expect(HOME).toMatch(/data-testid="home-today" className="px-page-x pt-1 md:pt-1\.5/);
    expect(HOME).toMatch(/data-testid="home-today-line" className="flex h-\[44px\] items-center max-md:-mt-\[5px\]/);
  });
  it('PC 두 칸 비율 4:8 — 배너 칸이 넓어진다(구조는 그대로)', () => {
    expect(HOME).toMatch(/data-testid="home-today" className="[^"]*lg:col-span-4/);
    expect(HOME).toMatch(/<div className="lg:col-span-8">/);
  });
});

describe('첫 줄 = GTO 진입(오너 H2)', () => {
  it('문구일 때 줄 전체가 onTools 버튼 · 44px 고정 · 글로우 박스 없이 글씨만 네온', () => {
    expect(HOME).toMatch(/data-testid="home-today-line" className="flex h-\[44px\] items-center/);
    const btn = HOME.slice(HOME.indexOf('data-testid="home-gto-entry"') - 80, HOME.indexOf('data-testid="home-gto-entry"') + 900);
    expect(btn).toMatch(/onClick=\{onTools\}/);
    expect(btn).toMatch(/h-\[44px\]/);
    expect(btn).not.toMatch(/className="[^"]*stat-pill/);   // 주석의 기록 말고 **걸린 클래스**만 본다
    expect(btn).toMatch(/dark:\[text-shadow:/);
  });
});

describe('빠른 카드 두 개', () => {
  it('md~ 칸 20rem 로 묶고 행동 줄을 제목 옆 같은 줄로', () => {
    expect(HOME).toMatch(/md:grid-cols-\[repeat\(2,minmax\(0,20rem\)\)\]/);
    expect(HOME.match(/md:flex-row md:items-center md:gap-3/g)?.length).toBe(2);
    expect(HOME.match(/md:mt-0 md:border-l md:border-t-0 md:pl-3 md:pt-0/g)?.length).toBe(2);
  });
  it('설명 줄이 없다 · 제목/행동 줄은 앞 정렬', () => {
    const q = HOME.slice(HOME.indexOf('data-testid="home-quick"'), HOME.indexOf('── 지금 등록 가능'));
    // 주석에는 옛 문구가 기록으로 남아 있다 — **렌더되는 JSX** 만 본다(설명 줄 p 의 자리 예약 클래스·값 삽입).
    expect(q).not.toMatch(/min-h-\[1\.15rem\]|QR 출석 매일 1회\s*<\/p>|\{quickEventDesc\}/);
    expect(q).not.toMatch(/justify-between/);
  });
  it('이벤트 조회 실패 안내는 행동 줄로 옮겨 남는다', () => {
    expect(HOME).toMatch(/const quickEventFailed = eventLoaded && eventFailed && eventShown !== 'banner';/);
    expect(HOME).toMatch(/\{quickEventFailed \? '불러오기 실패 · 다시' : '이벤트 보기'\}/);
  });
});

describe('일정 제목', () => {
  it('섹션 제목이 15/22 다(종전 18/26)', () => {
    expect(HOME).toMatch(/const H3_CLS = 'font-display text-\[15px\] font-bold leading-\[22px\]/);
  });
});
