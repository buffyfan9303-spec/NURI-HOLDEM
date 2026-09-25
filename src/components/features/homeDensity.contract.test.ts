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
  // 🔴 2026-09-25 HOME-BANNER-REDESIGN(오너 결정 B) — 가운데 점+화살표 알약 → 오른쪽 아래 '‹ i / N ›' 칩, 글자는 왼쪽 아래.
  //   종전 계약('여러 장일 때 글자를 제어 띠 위로 pb-8/pb-6')은 제어가 가운데 아래 띠를 다 쓰던 시절의 것이라 대체했다.
  it('제어는 오른쪽 아래 숫자 칩이다 — 장 수가 늘어도 폭이 같다', () => {
    expect(ctrl).toMatch(/flex justify-end[^"]*" data-testid="home-banner-dots"/);
    expect(ctrl).toMatch(/data-testid="home-banner-counter"/);
    expect(ctrl).toMatch(/data-testid="home-banner-counter" role="img" aria-label=\{`배너 \$\{n\}장 중 \$\{idx \+ 1\}번째`\}/);
    expect(ctrl).toMatch(/\{idx \+ 1\}<span className="mx-\[3px\] font-medium text-white\/90">\/<\/span><span className="font-medium text-white\/90">\{n\}<\/span>/);
    // 알약 배경이 숫자 칩 **자신**이다(형제 레이어면 대비 검사가 지면색과 비교한다) · 불투명도 0.6 초과
    expect(ctrl).toMatch(/data-testid="home-banner-counter"[^>]*\n\s*className="pointer-events-none relative -mx-\[34px\] flex h-\[24px\] items-center rounded-full bg-black\/65 px-\[34px\]/);
    // 화살표를 알약 밖으로 오버행(-my)시키지 않는다 — 행 높이 = 화살표 높이
    expect(ctrl).not.toMatch(/-my-\[10px\]/);
  });
  it('점 버튼은 DOM 에 남되 display:none 이다(1×1 sr-only 는 히트 게이트 28px 에 걸린다)', () => {
    expect(ctrl).toMatch(/aria-label=\{`\$\{i \+ 1\}번째 배너`\} aria-current=\{i === idx \? 'true' : undefined\}\s*\n\s*className="hidden" \/>/);
    expect(ctrl).not.toMatch(/sr-only" \/>/);
  });
  it('슬라이드 글자는 왼쪽 아래, 오른쪽 36% 는 칩 자리다(이벤트·브랜드·관리자 세 갈래)', () => {
    expect(PC.match(/flex-col justify-end gap-[\d.]+ px-4 pb-4 pr-\[36%\]/g)?.length).toBe(3);
    // 이벤트 슬라이드만 글자가 흐름 안이다 — 200% 확대에서 프레임이 같이 자라야 한다(absolute 면 min-h 에 갇혀 잘린다)
    expect(PC).toMatch(/<span className="relative flex h-full min-h-\[inherit\] flex-col justify-end/);
  });
  it('브랜드 아트는 원본 + 볼거리 쪽 초점(400 변형본 ~3.8배 확대 흐림 재발 방지)', () => {
    expect(PC).toMatch(/src=\{b\.img\}\s*\n\s*alt=""\s*\n\s*className="absolute inset-0 h-full w-full object-cover object-\[72%_50%\]"/);
    expect(PC).not.toMatch(/thumbUrl\(b\.img, 400\)/);
  });
});

describe('빈 상태 이벤트 슬라이드가 첫 장을 먹지 않는다(2026-09-25 오너 결정)', () => {
  it('참여 가능(live)이 아니면 맨 뒤, live 면 관리자 배너 바로 뒤', () => {
    expect(PC).toMatch(/return eventSlide\?\.live \? \[\.\.\.posters, \.\.\.events, \.\.\.brands\] : \[\.\.\.posters, \.\.\.brands, \.\.\.events\];/);
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
  // 🔴 2026-09-25 SCHEDULE-ROW-E(오너 확정 E안) — [로고 56] [제목 / 매장·지역 / 시작·레지] ┃ [보장 금액 / 참가비].
  //   종전 계약(우측 열 = 시각 + 상태, 게임 종류는 매장 줄)을 **교체**했다. 화면 수치(12자 제목·최장 금액 한 줄,
  //   세로선 x 동일)는 e2e/schedule-card-fit 'SCHEDULE-ROW-E' 가 브라우저에서 잰다. 여기서는 조리법만 잠근다.
  it('오른쪽 금액 칸은 고정 폭 + 왼쪽 세로선 — 가운데가 1fr 이라 세로선 x 가 줄마다 같다 · md~ 본문 17rem 상한', () => {
    expect(TT).toMatch(/grid-cols-\[auto_minmax\(0,1fr\)_auto\] md:grid-cols-\[auto_minmax\(0,17rem\)_auto\] md:justify-start/);
    expect(TT).toMatch(/data-testid="schedule-money"[\s\S]{0,300}className="flex w-\[5\.125rem\] min-w-0 flex-col[^"]*border-l border-border-subtle/);
  });
  it('로고 56px · 가운데 세 줄 순서 = 제목 → 매장·지역 → 시작·레지', () => {
    expect(TT).toMatch(/className="h-\[56px\] w-\[56px\] shrink-0/);
    const h3 = TT.indexOf('<h3'), venue = TT.indexOf('<VenueLink'), start = TT.indexOf('data-testid="schedule-start-group"');
    expect(h3).toBeGreaterThan(0);
    expect(venue).toBeGreaterThan(h3);
    expect(start).toBeGreaterThan(venue);
    expect(TT).toMatch(/\{' 시작'\}/);
    expect(TT).toMatch(/<span data-testid="schedule-reg-close">레지 \{reg\}<\/span>/);  // 저장값 그대로(regCloseRaw)
    expect(TT).toMatch(/const reg = regCloseRaw\(schedule\)/);
  });
  it('글자를 말줄임으로 숨기지 않는다 — 제목에 line-clamp·truncate 가 없다', () => {
    const h3 = TT.slice(TT.indexOf('<h3'), TT.indexOf('</h3>'));
    expect(h3).not.toMatch(/line-clamp|truncate/);
    expect(h3).toMatch(/\[overflow-wrap:anywhere\]/);
  });
  it('오른쪽 끝에 떨어진 꺾쇠가 없다 · 게임 형식(format)·등급 배지를 그리지 않는다(오너 E안)', () => {
    expect(TT).not.toMatch(/chevron-right/);
    expect(TT).not.toMatch(/schedule\.format/);
    expect(TT).not.toMatch(/data-testid="schedule-(game-type|grade-badge)"/);
  });
  it('금액 칸: 보장(guaranteed && prizePool)이면 금색 금액, 아니면 초록 "데일리" · 아래 참가비 · 라벨 글자 없음', () => {
    expect(TT).toMatch(/const gtd = schedule\.guaranteed && schedule\.prizePool \? formatPrize\(schedule\.prizePool\) : null;/);
    expect(TT).toMatch(/data-testid="schedule-prize" className=\{`[^`]*text-gold-300`\}>\{gtd\}/);
    // 억 단위 금액은 한 단계 작게(대체 폰트에서도 한 줄) — 2026-09-25 CI 리눅스 실측
    expect(TT).toMatch(/gtd\.includes\('억'\) \? 'text-\[0\.75rem\]'/);
    expect(TT).toMatch(/data-testid="schedule-daily" data-kind=\{kind\.text\} className=\{`[^`]*\$\{kind\.cls\}`\}>\{kind\.text\}</);
    // 오너 2026-09-25: 보장이 없으면 새틀 → '새틀', 시리즈·대회 → '대회', 나머지 → '데일리'
    expect(CARD).toMatch(/grade === 'satellite'\) return \{ text: '새틀'/);
    expect(CARD).toMatch(/grade === 'series' \|\| s\.isCompetition\) return \{ text: '대회'/);
    expect(CARD).toMatch(/return \{ text: '데일리', cls: 'text-emerald-300' \};/);
    expect(TT).toMatch(/data-testid="schedule-buyin"[\s\S]{0,300}\{buyInText\(schedule\.buyIn\?\.amount\)\}/);
    expect(TT).not.toMatch(/<Metric/);
    // 제목 끝 GTD 표기는 금액 칸이 보장 금액을 보여 줄 때만 뗀다(엔트리 게임 제목의 'GTD' 는 정보다)
    expect(TT).toMatch(/titleWithoutGtd\(schedule\.title, !!gtd\)/);
  });
  it('라이브 상태(생존/엔트리 · 현재 레벨 · 휴식 · 진행 중 · L —)는 ③ 줄에 남는다(기능 유지)', () => {
    const grp = TT.slice(TT.indexOf('data-testid="schedule-start-group"'), TT.indexOf('</p>', TT.indexOf('data-testid="schedule-start-group"')));
    expect(grp).toMatch(/regInfo\?\.hasField \? \(/);
    expect(grp).toMatch(/data-testid="schedule-field-count"/);
    expect(grp).toMatch(/data-testid="schedule-current-level"/);
    expect(TT).toMatch(/regInfo\.onBreak \? '휴식' : regInfo\.levelNo \? `L\$\{regInfo\.levelNo\}` : '진행 중'/);
    expect(TT).toMatch(/=== 'upcoming' \? null : 'L —'/);
  });
  it('일정 탭(browse) 목록도 시간표형이다 — 라이브 탭은 종전 그대로', () => {
    const APP = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(APP.match(/layout="timetable"/g)?.length).toBe(2);
    const LIVE = readFileSync(join(dir, 'LiveGamesTab.tsx'), 'utf8');
    expect(LIVE).not.toMatch(/layout="timetable"/);
  });
  it('계측 손잡이(testid·data-metrics)를 그대로 단다', () => {
    for (const id of ['schedule-start-group', 'schedule-start-time', 'schedule-field-count', 'schedule-current-level', 'schedule-money', 'schedule-prize', 'schedule-daily', 'schedule-buyin']) expect(TT).toContain(`data-testid="${id}"`);
    expect(TT).toMatch(/data-metrics/);
  });
});

describe('PC 일정 목록 2열 · 머리 줄', () => {
  it('목록·스켈레톤·지금 등록 가능이 같은 lg~ 2열 격자다(폴백 갈래는 한 열 · md 는 지표가 접혀 제외 — 근거는 HomeTab 주석)', () => {
    expect(HOME).toMatch(/const HOME_LIST_GRID = 'lg:grid lg:grid-cols-2 lg:divide-y-0 lg:\[&>\*\]:shadow-\[0_0_0_0\.5px_rgb\(var\(--border-subtle\)\)\] lg:\[&>article:nth-of-type\(odd\):last-of-type\]:col-span-2'/);
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
    const hdr = HOME.slice(HOME.indexOf('data-testid="home-schedule-title"') - 200, HOME.indexOf('data-testid="home-schedule-title"'));
    expect(hdr).toMatch(/<header className="flex flex-wrap items-baseline gap-x-2 pb-2(?: lg:col-start-1 lg:row-start-1 lg:mb-2 lg:pb-0)?">/);
  });
});

describe('날짜 스트립', () => {
  const rail = HOME.slice(HOME.indexOf('data-testid="home-date-rail"'), HOME.indexOf('{/* ② 선택일 제목'));
  it('9주 스트립 · 한 화면 7칸(칩 = 1/7, 최소 44px · md~ 3.25rem×7) · 스냅 가로 스크롤', () => {
    expect(HOME).toMatch(/const STRIP_DAYS = 64;/);
    expect(HOME).toMatch(/const STRIP_PAST = 3;/);   // 첫 화면에서 오늘이 7칸의 가운데
    expect(rail).toMatch(/data-testid="home-date-strip"[\s\S]{0,300}snap-x snap-mandatory overflow-x-auto[^"]*md:w-\[22\.75rem\] md:flex-none/);
    expect(rail).toMatch(/min-h-\[44px\] w-\[calc\(100%\/7\)\] min-w-\[44px\] shrink-0 snap-center[^']*md:w-\[3\.25rem\]/);
  });
  it('PC 에서만 화살표 · 달력 버튼과 네이티브 날짜 선택은 없다(2차 오너 지시로 제거)', () => {
    expect(rail).toMatch(/data-testid="home-date-prev"[\s\S]{0,300}hidden[^"]*md:grid/);
    expect(HOME).not.toMatch(/type="date"|home-date-calendar|showPicker/);
  });
  it('휠 피커 입체감(오너 2차 2026-09-24) — 가운데에서 멀수록 양쪽 점진 흐림 · 선택일 선명 · 오늘은 블러 없이 · 안쪽 얼굴에만', () => {
    // 가장자리 마스크(1차)는 철회됐다 — 되살아나면 끝 칩만 흐리고 안쪽은 평평해진다.
    expect(HOME).not.toMatch(/maskImage: stripMask|stripEdge/);
    expect(HOME).toMatch(/Math\.abs\(p\.offsetLeft \+ p\.offsetWidth \/ 2 - mid\) \/ half/);
    expect(HOME).toMatch(/if \(p\.getAttribute\('aria-pressed'\) === 'true'\) t = 0;/);
    // 강도(오너 3차 2026-09-24 "조금만 덜 흐리게"): 투명도 최소 0.6 · 블러 최대 0.8px · 크기 최소 0.94 · 오늘 투명도 최소 0.8
    expect(HOME).toMatch(/const op = 1 - \(today \? 0\.2 : 0\.4\) \* t;/);
    expect(HOME).toMatch(/const blur = today \? 0 : Math\.round\(8 \* t\) \/ 10;/);
    expect(HOME).toMatch(/scale\(\$\{\(1 - 0\.06 \* t\)\.toFixed\(3\)\}\)/);
    expect(HOME).toMatch(/requestAnimationFrame\(paint\)/);
    expect(rail).toMatch(/<span data-pill-face className="flex flex-col items-center">/);
    // React 상태를 쓰지 않는다(스크롤마다 리렌더 금지) — style 을 직접 쓴다
    expect(HOME).toMatch(/face\.style\.filter = /);
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
    // 2026-09-25 — 모바일은 위아래 헤어라인·그림자도 뺀다(border-0 · shadow-none, 154 → 152)
    expect(PC).toMatch(/poster-frame relative overflow-hidden border card-aura max-md:rounded-none max-md:border-0 max-md:shadow-none \[mask-image:linear-gradient\(to_bottom,transparent,#000_8px,#000_calc\(100%-8px\),transparent\)\] md:mx-page-x md:rounded-aura lg:mx-0/);
    expect(PC).toMatch(/'relative min-h-\[152px\] w-full/);   // 2026-09-24 오너 지시 116 → 132 → 152(2차)
  });
  it('정적 셸 배너 예약이 같은 모양이다(첫 페인트 CLS)', () => {
    expect(INDEX).toMatch(/<div class="pt-0 md:pt-2\.5"><div class="border border-transparent max-md:rounded-none max-md:border-0 md:mx-page-x md:rounded-aura"><div class="skeleton min-h-\[152px\]/);
    expect(INDEX).toMatch(/<div class="max-md:-mt-\[5px\]" style="height:44px;display:flex;align-items:center"><div class="skeleton" style="height:26px;width:230px"><\/div><\/div>/);
    // React 쪽도 같은 여백이다(모바일 상단 공백 축소 — 오너 2026-09-24)
    expect(PC).toMatch(/<div className="pt-0 md:pt-2\.5 lg:pt-0">/);
    expect(HOME).toMatch(/data-testid="home-today" className="px-page-x pt-1 md:pt-1\.5/);
    expect(HOME).toMatch(/data-testid="home-today-line" className="flex h-\[44px\] items-center max-md:-mt-\[5px\]/);
  });
  it('PC 두 칸 비율 4:8 — 배너 칸이 넓어진다(구조는 그대로)', () => {
    expect(HOME).toMatch(/data-testid="home-today" className="[^"]*lg:col-span-4/);
    expect(HOME).toMatch(/<div className="lg:col-span-8 lg:col-start-5 lg:row-span-2 lg:row-start-1">/);
  });
  // 🔴 2026-09-25 오너("PC 쪽 레이아웃 이상하니까 수정해", 결정 P): 왼쪽 4칸이 비고(글자 두 줄) 퀵 줄·날짜 레일이 반쪽에서 끝났다.
  it('PC 왼쪽 4칸 = 오늘 안내(위) + 퀵 카드(아래) — 퀵 섹션이 첫 줄 그리드 안이다', () => {
    const grid = HOME.slice(HOME.indexOf('lg:grid lg:grid-cols-12'), HOME.indexOf('── 지금 등록 가능'));
    expect(grid).toMatch(/data-testid="home-quick"/);
    expect(HOME).toMatch(/className="px-page-x pt-3 lg:col-span-4 lg:col-start-1 lg:row-start-2 lg:self-end lg:pt-0" data-testid="home-quick"/);
    // DOM 순서 = 모바일 흐름: 오늘 → 배너 → 퀵
    const iToday = HOME.indexOf('data-testid="home-today"'), iBanner = HOME.indexOf('<PosterCarousel'), iQuick = HOME.indexOf('data-testid="home-quick"');
    expect(iToday).toBeLessThan(iBanner);
    expect(iBanner).toBeLessThan(iQuick);
  });
  it('PC 일정 머리 = 제목(왼쪽) · 날짜 레일(오른쪽) 한 줄, 나머지 자식은 두 칸', () => {
    expect(HOME).toMatch(/data-testid="home-schedule" className="[^"]*lg:grid lg:grid-cols-\[minmax\(0,1fr\)_auto\][^"]*lg:\[&>\*:nth-child\(n\+3\)\]:col-span-2"/);
    expect(HOME).toMatch(/data-testid="home-date-rail" className="[^"]*lg:col-start-2 lg:row-start-1"/);
    expect(HOME).toMatch(/<header className="[^"]*lg:col-start-1 lg:row-start-1/);
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
    expect(HOME).toMatch(/\{quickEventFailed \? '불러오기 실패 · 다시' : eventShown === 'menu' \? '진행 중 이벤트 없음' : '이벤트 보기'\}/);
  });
  it('진행 이벤트가 없으면 행동 줄이 흐린 글자로 사실을 말한다(2026-09-25) — 진입 버튼은 그대로', () => {
    expect(HOME).toMatch(/eventShown === 'menu' && !quickEventFailed \? 'text-ink-muted' : 'text-gold-300'/);
    expect(HOME).toMatch(/<button type="button" onClick=\{\(\) => onEvent\(\)\} data-testid="home-quick-event"/);
  });
});

describe('일정 제목', () => {
  it('섹션 제목이 15/22 다(종전 18/26)', () => {
    expect(HOME).toMatch(/const H3_CLS = 'font-display text-\[15px\] font-bold leading-\[22px\]/);
  });
});
