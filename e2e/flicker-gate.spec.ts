// FLICKER-GATE — 범용 깜빡임 게이트 (오너 2026-09-26 "메인은 왜 그런 거야, 철저하게 조사하고 재현되지 않게 해").
//
// 왜 이 게이트인가: 이 저장소의 '깜빡임' 수정은 두 번이나 다음 깜빡임을 만들었다.
//   · 2026-09-13 1516e2ed 폰트 활성화(optional→fallback) → fallback 의 100ms 차단 구간에 첫 React 커밋이 겹쳐 콜드 진입 글자 투명 프레임(FOIT)
//   · 2026-09-24 7359bc7c→a095b1e8→113c47ae→e1ea47e8 '하드컷' 을 덮개(지면색 판)로 부드럽게 → 그 덮개가 곧 '검정 판 → 콘텐츠' 깜빡임(PILL-FLASH)
//   둘 다 **이름 붙은 요소를 보는 검사**(덮개 opacity ≥ 0.9 를 '요구' 하기까지 했다)로는 못 막는다. 그래서 이 게이트는 **픽셀**만 본다:
//   판 전체가 한 색인 프레임(flat) · 화면 휘도가 한 번 튀었다 돌아오는 프레임(blink) · 앱 첫 페인트 뒤 글자가 없는 프레임(foit).
//   다음에 어떤 방식으로(덮개·페이드·폴백·폰트 정책) 빈 판을 다시 만들어도 같은 자리에서 빨개진다. 판정 세부는 e2e/_flicker.ts.
//
// 전환 목록은 **데이터**다(TRANSITIONS). 새 화면·새 전환이 생기면 한 줄 추가한다. 항목마다 요소를 못 찾으면 실패다(0개 초록 금지).
// 조건: 모바일 Pixel 7(하네스 기본) 다크 · PC 1280 라이트 · CPU 4배 · 실제 입력(CDP 터치 홀드 / 마우스 70ms 누름).
// 데이터: 일정은 목킹(mockSchedules), 로그인은 stubLogin(프로필 목킹). 나머지 읽기는 운영으로 간다(쓰기는 _fixtures 가드가 끊는다).
// 음성 대조(2026-09-26 실행): 옛 tabCover + font-display:fallback 빌드에 돌리면 탭 왕복(cover·flat/blink)·콜드(foit) 가 빨개진다 — 아래 보고 참고.
// 실행: E2E_BASE_URL=http://localhost:4710 npx playwright test e2e/flicker-gate.spec.ts
import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { ANON_KEY, stubLogin } from './_session';
import { mockSchedules } from './_schedules';
import { Cast, RECORDER, analyze, center, describe as fmt, press, FLAT_STD, type Finder, type Sample, type Verdict } from './_flicker';

const WIN_MS = 1200;
const COLD_WIN_MS = 3500;

/** 전환 한 줄 — nav(페이지 진입) 또는 tap(요소 누름). pre 는 측정 밖에서 먼저 누르는 요소(메뉴 열기 등). */
type Step = { id: string; nav?: string; tap?: Finder; pre?: Finder; settle?: number; kind?: 'modal' };
/** 메인 탭 — 글자 **정확히** 일치(includes 면 '홈' 이 헤더 로고 '홈으로' 에 먼저 걸린다). PC GNB 는 헤더 밖 sticky 줄이라 button 전체에서 찾는다. */
const TAB = (label: string, mobile: boolean): Finder => mobile ? { sel: 'nav[aria-label="하단 내비게이션"] button', text: label, exact: true } : { sel: 'button', text: label, exact: true, notIn: '.tab-pane' };
const CLOSE: Finder = { sel: '[aria-label="닫기"], [aria-label="뒤로 가기"]', last: true };
const ME_MENU: Finder = { sel: 'header [aria-label$="메뉴"]' };
const ME_ITEM: Finder = { sel: 'button, a, [role="menuitem"]', text: '내 정보' };

function transitions(mobile: boolean): Step[] {
  const tab = (l: string) => TAB(l, mobile);
  const list: Step[] = [
    { id: 'cold', nav: '/' },
    { id: 'tab→라이브', tap: tab('라이브') }, { id: '라이브→홈', tap: tab('홈') },
    { id: 'tab→커뮤니티', tap: tab('커뮤니티') },
  ];
  if (mobile) list.push({ id: '커뮤니티 하위탭 2', tap: { sel: '[data-community-secbar] button' , last: true } }, { id: '커뮤니티 하위탭 1', tap: { sel: '[data-community-secbar] button' } });
  list.push(
    { id: '커뮤니티→홈', tap: tab('홈') },
    { id: 'tab→GTO', tap: tab('GTO') }, { id: 'GTO→홈', tap: tab('홈') },
  );
  if (mobile) list.push({ id: 'tab→캘린더', tap: tab('캘린더') }, { id: '캘린더→홈', tap: tab('홈') });
  list.push(
    // 모달·시트 개폐(kind: 'modal')는 스크림 때문에 화면 휘도가 정당하게 바뀐다 — blink 판정에서 뺀다(flat·덮개·폴백은 본다).
    //   ⚠ 실측(2026-09-26): 이용권 시트 열기의 스크림(bg-black/80)이 시트(200ms 슬라이드)보다 먼저 완전히 어두워져 라이트 테마에서
    //   2프레임 동안 화면 휘도 197→104 로 떨어졌다 돌아온다. 디자인 판단(스크림을 시트와 같은 곡선으로)은 home-team 몫이라 여기서 빨갛게 하지 않는다.
    { id: '일정 상세 열기', tap: { sel: '[data-testid="home-schedule"] [role="button"]' }, kind: 'modal' }, { id: '일정 상세 닫기', tap: CLOSE, kind: 'modal' },
    { id: '이용권 시트 열기', tap: { sel: '[data-testid="home-quick-checkin"]' }, kind: 'modal' }, { id: '이용권 시트 닫기', tap: CLOSE, kind: 'modal' },
    { id: '이벤트 열기', tap: { sel: '[data-testid="home-quick-event"]' }, kind: 'modal' }, { id: '이벤트 닫기', tap: CLOSE, kind: 'modal' },
    { id: '내 정보 열기', pre: ME_MENU, tap: ME_ITEM, kind: 'modal' }, { id: '내 정보 닫기→홈', tap: CLOSE, kind: 'modal' },
    { id: '테마 전환', tap: { sel: '[aria-label$="모드로 전환"]' } }, { id: '테마 복귀', tap: { sel: '[aria-label$="모드로 전환"]' } },
  );
  return list;
}

async function boot(page: Page, scheme: 'dark' | 'light') {
  // stub 토큰은 서버가 401 → 읽기는 anon 으로 통과시킨다. **stubLogin 보다 먼저** 걸어야 한다(나중 route 가 이긴다).
  await page.route(/supabase\.co\/rest\/v1\//, (r) => r.continue({ headers: { ...r.request().headers(), authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY } }));
  await page.addInitScript((sch) => { try { localStorage.setItem('nuri-theme', sch); } catch { /* 차단 환경 */ } }, scheme);
  await page.addInitScript(RECORDER);
  await stubLogin(page);
  await mockSchedules(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return cdp;
}

async function run(page: Page, cdp: CDPSession, steps: Step[], mobile: boolean): Promise<Verdict[]> {
  const cast = new Cast(cdp);
  const out: Verdict[] = [];
  for (const st of steps) {
    if (st.pre) {
      const p = await center(page, st.pre);
      expect(p, `'${st.id}' 의 사전 요소를 못 찾았다(${JSON.stringify(st.pre)}) — 측정이 공허해진다`).not.toBeNull();
      await press(page, cdp, p!.x, p!.y, mobile); await page.waitForTimeout(500);
    }
    let hit: { x: number; y: number; label: string } | null = null;
    if (st.tap) {
      hit = await center(page, st.tap);
      expect(hit, `'${st.id}' 의 요소를 못 찾았다(${JSON.stringify(st.tap)}) — 셀렉터가 낡았으면 여기서 고쳐라, 목록에서 빼지 마라`).not.toBeNull();
      if (!hit) continue;
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => { const R = (window as unknown as { __fk?: { on: boolean; f: Sample[] } }).__fk; if (R) { R.on = true; R.f = []; } }).catch(() => {});
    await cast.start();
    await page.waitForTimeout(120);
    const t0 = Date.now();
    if (st.nav) await page.goto(st.nav, { waitUntil: 'commit' });
    else await press(page, cdp, hit!.x, hit!.y, mobile);
    const win = st.nav ? COLD_WIN_MS : WIN_MS;
    await page.waitForTimeout(win);
    const frames = await cast.stop();
    const R = await page.evaluate(() => { const R = (window as unknown as { __fk: { on: boolean; f: Sample[]; shellAt: number; fontsAt: number } }).__fk; R.on = false; return { f: R.f, shellAt: R.shellAt, fontsAt: R.fontsAt }; }).catch(() => ({ f: [] as Sample[], shellAt: 0, fontsAt: 0 }));
    const v = analyze(st.id, frames, R.f, t0, t0 + win + 200, st.nav && R.shellAt > t0 ? R.shellAt : 0, st.nav && R.fontsAt > t0 ? R.fontsAt : 0);
    out.push(v);
    if (process.env.FLICKER_LOG) console.log('[flicker] ' + fmt(v) + (hit ? ` (${hit.label})` : ''));
    if (st.nav) await expect(page.getByTestId('home-schedule-title')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(st.settle ?? (st.nav ? 2500 : 400));
  }
  return out;
}

function judge(rows: Verdict[], steps: Step[], tag: string) {
  // 얼마나 잰 것인지 항상 남긴다(초록일 때도) — 0개 초록·엉뚱한 요소 측정을 사람이 검토할 수 있게.
  expect(rows, `${tag}: 잰 전환 수가 목록과 다르다`).toHaveLength(steps.length);
  // 공허 방지 — 전환마다 화면 프레임을 실제로 받았고, 정착 화면은 평평하지 않다(글자·카드가 있다).
  // 깨끗한 한 프레임 교체(내 정보 닫기 등)는 프레임이 1장뿐이다 — 0장이면 누름이 안 먹었거나 캐스트가 죽은 것.
  expect.soft(rows.filter((r) => r.frames < 1).map((r) => `${r.id} frames=${r.frames}`), `${tag}: 스크린캐스트 프레임을 못 받은 전환 — 누름이 안 먹었거나 캐스트가 죽었다`).toEqual([]);
  console.log(`[flicker-gate ${tag}] ` + rows.map(fmt).join(String.fromCharCode(10) + '  '));
  expect.soft(rows.filter((r) => r.lastStd >= 0 && r.lastStd < FLAT_STD).map((r) => r.id), `${tag}: 정착 화면이 평평하다 — 측정 대상이 틀렸다`).toEqual([]);
  expect.soft(rows.filter((r) => r.flat.length).map((r) => `${r.id} @${r.flat.slice(0, 4).join(',')}ms`), `${tag}: 판 전체가 한 색인 프레임(빈 지면 판·검정/흰 판) — '검정 → 콘텐츠' 깜빡임`).toEqual([]);
  const modal = new Set(steps.filter((s) => s.kind === 'modal').map((s) => s.id));
  expect.soft(rows.filter((r) => !modal.has(r.id) && r.blink.length).map((r) => `${r.id} ${r.blink.join('|')}`), `${tag}: 화면 휘도가 튀었다 돌아온 프레임 — 한 번 번쩍`).toEqual([]);
  expect.soft(rows.filter((r) => r.coverFrames).map((r) => `${r.id} ${r.coverFrames}프레임`), `${tag}: 전환용 덮개([data-tab-cover]/[data-sub-cover])가 보였다 — 5차에서 없앤 그 덮개`).toEqual([]);
  expect.soft(rows.filter((r) => r.ovFrames).map((r) => `${r.id} ${r.ovFrames}프레임`), `${tag}: 불투명 전면 폴백(fixed inset-0 aria-busy)이 커밋됐다 — startTransition/preload 를 잃었다`).toEqual([]);
  const cold = rows.filter((r) => r.firstApp !== undefined || r.id === 'cold');
  expect.soft(cold.map((r) => r.id).filter((id) => rows.find((r) => r.id === id)!.firstApp === undefined), `${tag}: 콜드 진입에서 앱 첫 페인트를 못 잡았다 — 셸 교체 hook 이 낡았다`).toEqual([]);
  expect.soft(cold.filter((r) => r.foit.length > 2).map((r) => `${r.id} ${r.foit.length}프레임 @${r.foit.slice(0, 4).join(',')}ms (fonts@${r.fontsAt})`), `${tag}: 앱 첫 페인트 뒤 글자가 투명한 프레임 — 폰트 차단(FOIT). font-display 는 swap 이어야 한다`).toEqual([]);
}

test.describe('FLICKER-GATE — 화면 이동에 빈 판·번쩍임·글자 없는 프레임이 없다(CPU 4배)', () => {
  test.describe.configure({ timeout: 240_000 });

  // eslint-disable-next-line playwright/expect-expect -- 단언은 judge() 안의 expect.soft 들이다(규칙이 도우미 안을 못 본다 · 판정은 그대로)
  test('모바일(Pixel 7) 다크 — 콜드 진입 · 메인 탭 왕복 · 커뮤니티 하위 탭 · 모달 개폐 · 내 정보 · 테마', async ({ page }) => {
    const cdp = await boot(page, 'dark');
    const steps = transitions(true);
    const rows = await run(page, cdp, steps, true);
    judge(rows, steps, '모바일 다크');
  });

  test.describe('PC 1280 라이트', () => {
    test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
    // eslint-disable-next-line playwright/expect-expect -- 단언은 judge() 안의 expect.soft 들이다(규칙이 도우미 안을 못 본다 · 판정은 그대로)
    test('콜드 진입 · GNB 왕복 · 모달 개폐 · 내 정보 · 테마', async ({ page }) => {
      const cdp = await boot(page, 'light');
      const steps = transitions(false);
      const rows = await run(page, cdp, steps, false);
      judge(rows, steps, 'PC 라이트');
    });
  });
});

// ── MISSING-TILES(2026-09-26) — 출발 판을 스크롤한 뒤의 메인 탭 이동 ─────────────────────────────────────
// 오너: "하단 메뉴로 메인 탭을 옮기면 모바일에서 **본문 콘텐츠 영역 전체**가 검은색이 됐다가 올라온다."
// 원인(root-cause 실측): 판 교체 프레임에 하단바 알약·아이콘·FAB 전환(합성 애니)이 같이 돌면 Chromium 이 새 판 타일 래스터를
//   기다리지 않고 프레임을 낸다 — 빠진 타일은 문서 배경(지면색 = 다크에서 검정)으로 칠해진다. 출발 판이 원점(스크롤 0)이면 안 나서
//   위 게이트(스크롤 0 에서 탭)는 0 이었다.
// 픽셀만으로는 못 잡는다 — 하네스에선 빠진 면적이 작아 휘도가 −0.4 만 움직인다(실기기의 판 전체 검정은 NOT_RUN).
//   그래서 **트레이스**를 본다: 컴포지터 프레임마다 PipelineReporter.frame_reporter.has_missing_content(탭 뒤 1.1초 안).
//   본문 영역(헤더 아래~하단바 위)이 지면색으로 평평해진 프레임도 같이 센다(오너 정정: 판정 대상은 본문 전체, 탭바는 뺀다).
// 음성 대조(2026-09-26 실행): main 2f2a7dcf 빌드 → has_missing_content 프레임 FAIL / PANE-HANDOFF 빌드 → 0 PASS(보고 참고).
// 처방: src/lib/tabCover.ts 6차 절(스왑 프레임 정적화 + 떠나는 판 퇴장 페이드).
test.describe('MISSING-TILES — 스크롤한 판에서 메인 탭 이동(모바일 · CPU 4배 · DPR 3)', () => {
  test.use({ deviceScaleFactor: 3 });
  test.describe.configure({ timeout: 240_000 });

  test('다크 — 새 판 타일이 빠진 프레임 0 · 본문이 평평한 프레임 0', async ({ page }) => {
    const cdp = await boot(page, 'dark');
    await page.goto('/');
    await expect(page.getByTestId('home-schedule-title')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(4000); // idle 프리마운트가 끝난 재방문 경로 — root-cause 실측과 같은 조건
    const MENUS = ['라이브', '커뮤니티', 'GTO', '캘린더', '홈'];
    const cast = new Cast(cdp);
    await cdp.send('Tracing.start', { categories: 'cc,benchmark,blink.user_timing', transferMode: 'ReturnAsStream' });
    const flatRows: string[] = [];
    const castRows: string[] = [];
    for (const pass of [1, 2]) {
      for (const label of MENUS) {
        const id = `p${pass}→${label}`;
        // 출발 판 끝까지 → 150px 위로(문서 끝에 붙으면 하단바가 자동으로 숨는다 — 올려야 돌아온다).
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight - innerHeight, behavior: 'instant' as ScrollBehavior }));
        await page.waitForTimeout(300);
        await page.evaluate(() => scrollTo({ top: Math.max(0, document.documentElement.scrollHeight - innerHeight - 150), behavior: 'instant' as ScrollBehavior }));
        await page.waitForTimeout(700);
        const pre = await page.evaluate(() => ({ y: scrollY, nav: getComputedStyle(document.querySelector('nav[aria-label="하단 내비게이션"]')!).transform }));
        expect(pre.y, `${id}: 출발 판이 스크롤되지 않았다 — 이 게이트의 전제(원점 스크롤)가 빠진다`).toBeGreaterThan(0);
        expect(pre.nav === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(pre.nav), `${id}: 하단바가 숨어 있다(${pre.nav}) — 누를 수 없다`).toBe(true);
        const hit = await center(page, TAB(label, true));
        expect(hit, `${id}: 하단바 '${label}' 버튼을 못 찾았다`).not.toBeNull();
        const crop = await page.evaluate(() => ({
          top: document.querySelector('[data-stack-header]')!.getBoundingClientRect().bottom + 2,
          bottom: document.querySelector('nav[aria-label="하단 내비게이션"] > div:not([aria-hidden])')!.getBoundingClientRect().top - 14,
          w: innerWidth,
        }));
        await cast.start(crop);
        await page.waitForTimeout(100);
        await page.evaluate((m) => performance.mark(m), `tap:${id}`);
        await press(page, cdp, hit!.x, hit!.y, true);
        await page.waitForTimeout(1100);
        const frames = await cast.stop();
        const flat = frames.filter((f) => f.bStd !== undefined && f.bStd < FLAT_STD);
        castRows.push(`${id} frames=${frames.length} bodyL ${frames.map((f) => (f.bL ?? 0).toFixed(0)).join(',')}`);
        if (flat.length) flatRows.push(`${id} ${flat.length}프레임(bL ${flat.map((f) => (f.bL ?? 0).toFixed(0)).join(',')})`);
        await page.waitForTimeout(400);
      }
    }
    const done = new Promise<{ stream: string }>((res) => cdp.once('Tracing.tracingComplete', (e) => res(e as { stream: string })));
    await cdp.send('Tracing.end');
    const { stream } = await done;
    let json = '';
    for (;;) { const r = await cdp.send('IO.read', { handle: stream, size: 1 << 22 }); json += r.data; if (r.eof) break; }
    await cdp.send('IO.close', { handle: stream });
    type Ev = { name: string; ts: number; cat?: string; args?: { frame_reporter?: { has_missing_content?: boolean; checkerboarded_needs_raster?: boolean } } };
    const ev = (JSON.parse(json) as { traceEvents?: Ev[] }).traceEvents ?? [];
    const taps = ev.filter((e) => e.cat?.includes('blink.user_timing') && e.name.startsWith('tap:')).sort((a, b) => a.ts - b.ts);
    const pipeline = ev.filter((e) => e.name === 'PipelineReporter' && e.args?.frame_reporter);
    const near = (ts: number) => { let best: Ev | null = null; for (const m of taps) if (m.ts <= ts && (!best || m.ts > best.ts)) best = m; return best ? { tap: best.name.slice(4), dt: Math.round((ts - best.ts) / 1000) } : null; };
    const missing = pipeline.filter((e) => e.args!.frame_reporter!.has_missing_content).map((e) => near(e.ts)).filter((n): n is { tap: string; dt: number } => !!n && n.dt <= 1100);
    const needsRaster = pipeline.filter((e) => e.args!.frame_reporter!.checkerboarded_needs_raster).map((e) => near(e.ts)).filter((n) => !!n && n.dt <= 1100).length;
    console.log(`[missing-tiles] taps=${taps.length} pipelineFrames=${pipeline.length} missing=${missing.length} needsRaster=${needsRaster} bodyFlat=${flatRows.length}`
      + String.fromCharCode(10) + '  ' + castRows.join(String.fromCharCode(10) + '  '));
    // 공허 방지 — 탭 표식 10개를 트레이스에서 찾았고, 컴포지터 프레임 보고를 실제로 받았다.
    expect(taps.length, '트레이스에서 탭 표식을 못 찾았다 — blink.user_timing 범주가 빠졌거나 mark 가 안 찍혔다').toBe(MENUS.length * 2);
    expect(pipeline.length, 'PipelineReporter 가 0 — 트레이스 범주(cc)가 빠져 이 게이트가 공허해진다').toBeGreaterThan(50);
    expect.soft(missing.map((m) => `${m.tap} +${m.dt}ms`), '새 판 타일이 래스터되기 전 프레임이 나갔다(빠진 타일 = 지면색·검정) — 판 교체 프레임에 합성 애니가 돌고 있다').toEqual([]);
    expect.soft(flatRows, '본문 영역이 한 색으로 평평해진 프레임(지면색 판)').toEqual([]);
  });
});
