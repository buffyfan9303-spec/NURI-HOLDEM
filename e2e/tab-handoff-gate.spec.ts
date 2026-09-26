// TAB-HANDOFF-GATE(2026-09-26, root-cause-debugger) — 메인 탭 판 교체를 **실사용 조건**에서 잠근다.
//
// 왜 따로 있나: 오늘 하루에 같은 자리(하단 메뉴 → 본문)에서 결함이 세 번 모양을 바꿨다.
//   B0 6db76831  지면색 가림막(tabCover)이 본문을 80~170ms 덮었다 걷힘 = 그 자체가 '검정 판 → 콘텐츠'(PILL-FLASH).
//   B1 80e50284  가림막을 지우자 그 밑에 있던 **빠진 타일**(래스터 전 프레임 = 지면색·검정)이 드러남 — 다크·라이트 각 3프레임(DPR3·CPU4·스크롤한 판).
//   B2 작업트리  떠나는 판 fixed 퇴장 페이드(PANE-HANDOFF) — 다크 0. **라이트는 flicker-gate 에 없고**, 떠나는 판이 새 판 위에 서는 동안
//               입력이 새 판에 닿는지(히트테스트)·연타/동작 줄이기 뒤 판·복제본이 남지 않는지도 아무 검사가 없었다.
//   세 번 다 "수정자가 잰 조건"(스크롤 0·다크·DOM 계약)에서만 초록이었다. 이 파일은 그 빈 칸만 채운다 — 다크 빠진 타일은 e2e/flicker-gate.spec.ts MISSING-TILES.
//
// 조건: Pixel 7 · DPR 3 · CPU 4배 · 출발 판을 끝까지 스크롤한 뒤 150px 위(자동 숨김 하단바 복귀) · CDP 터치 110ms 홀드.
// 음성 대조(2026-09-26 실행): B1 빌드 → ① 라이트 has_missing_content FAIL · B2 빌드 → 전부 PASS.
//   ② 히트테스트는 `[data-pane-leaving]{pointer-events:auto}` 를 주입한 B2 에서 빨개진다(입력을 삼키는 떠나는 판).
// 실행: E2E_BASE_URL=http://localhost:4782 npx playwright test e2e/tab-handoff-gate.spec.ts
import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { ANON_KEY, stubLogin } from './_session';
import { mockSchedules } from './_schedules';
import { Cast, RECORDER, center, press, FLAT_STD, type Finder } from './_flicker';

const MENUS = ['라이브', '커뮤니티', 'GTO', '캘린더', '홈'];
const TAB = (label: string): Finder => ({ sel: 'nav[aria-label="하단 내비게이션"] button', text: label, exact: true });
const NAV = 'nav[aria-label="하단 내비게이션"]';

async function boot(page: Page, scheme: 'dark' | 'light') {
  await page.route(/supabase\.co\/rest\/v1\//, (r) => r.continue({ headers: { ...r.request().headers(), authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY } }));
  await page.addInitScript((sch) => { try { localStorage.setItem('nuri-theme', sch); } catch { /* 차단 환경 */ } }, scheme);
  await page.addInitScript(RECORDER);
  // 캡처 단계 click 기록 — 떠나는 판이 새 판 위에 서 있는 동안 누른 입력이 **어느 판**에 닿았는지(마크업 무관).
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const w = window as unknown as { __clicks: string[] };
    w.__clicks = [];
    document.addEventListener('click', (e) => {
      const t = e.target as Element | null;
      const pane = t?.closest?.('.tab-pane');
      w.__clicks.push(`${t?.tagName ?? '?'}@${pane ? pane.getAttribute('data-tab') : 'none'}${t?.closest?.('[data-pane-leaving]') ? ' LEAVING' : ''}`);
    }, true);
  });
  await stubLogin(page);
  await mockSchedules(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/');
  await expect(page.getByTestId('home-schedule-title')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4000); // idle 프리마운트가 끝난 재방문 경로
  return cdp;
}

/** 출발 판 끝까지 → 150px 위(문서 끝에 붙으면 하단바가 숨는다). 전제가 빠지면 실패다. */
async function scrollOrigin(page: Page, id: string) {
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight - innerHeight, behavior: 'instant' as ScrollBehavior }));
  await page.waitForTimeout(300);
  await page.evaluate(() => scrollTo({ top: Math.max(0, document.documentElement.scrollHeight - innerHeight - 150), behavior: 'instant' as ScrollBehavior }));
  await page.waitForTimeout(700);
  const pre = await page.evaluate((nav) => ({ y: scrollY, nav: getComputedStyle(document.querySelector(nav)!).transform }), NAV);
  expect(pre.y, `${id}: 출발 판이 스크롤되지 않았다 — 이 게이트의 전제(원점 스크롤)가 빠진다`).toBeGreaterThan(0);
  expect(pre.nav === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(pre.nav), `${id}: 하단바가 숨어 있다(${pre.nav})`).toBe(true);
}

async function tapTab(page: Page, cdp: CDPSession, label: string, id: string) {
  const hit = await center(page, TAB(label));
  expect(hit, `${id}: 하단바 '${label}' 버튼을 못 찾았다`).not.toBeNull();
  await press(page, cdp, hit!.x, hit!.y, true);
}

test.describe('TAB-HANDOFF-GATE — 스크롤한 판에서 메인 탭 이동(모바일 · CPU 4배 · DPR 3)', () => {
  test.use({ deviceScaleFactor: 3 });
  test.describe.configure({ timeout: 240_000 });

  // ① 라이트 — 다크와 같은 판정(flicker-gate MISSING-TILES). 지면이 밝아 빠진 타일은 '흰 판' 이지만 기전은 같다(B1 라이트 3프레임 실측).
  test('① 라이트 — 새 판 타일이 빠진 프레임 0 · 본문이 평평한 프레임 0', async ({ page }) => {
    const cdp = await boot(page, 'light');
    const cast = new Cast(cdp);
    await cdp.send('Tracing.start', { categories: 'cc,benchmark,blink.user_timing', transferMode: 'ReturnAsStream' });
    const flatRows: string[] = [];
    for (const pass of [1, 2]) {
      for (const label of MENUS) {
        const id = `p${pass}→${label}`;
        await scrollOrigin(page, id);
        const crop = await page.evaluate((nav) => ({
          top: document.querySelector('[data-stack-header]')!.getBoundingClientRect().bottom + 2,
          bottom: document.querySelector(`${nav} > div:not([aria-hidden])`)!.getBoundingClientRect().top - 14,
          w: innerWidth,
        }), NAV);
        await cast.start(crop);
        await page.waitForTimeout(100);
        await page.evaluate((m) => performance.mark(m), `tap:${id}`);
        await tapTab(page, cdp, label, id);
        await page.waitForTimeout(1100);
        const frames = await cast.stop();
        const flat = frames.filter((f) => f.bStd !== undefined && f.bStd < FLAT_STD);
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
    type Ev = { name: string; ts: number; cat?: string; args?: { frame_reporter?: { has_missing_content?: boolean } } };
    const ev = (JSON.parse(json) as { traceEvents?: Ev[] }).traceEvents ?? [];
    const taps = ev.filter((e) => e.cat?.includes('blink.user_timing') && e.name.startsWith('tap:')).sort((a, b) => a.ts - b.ts);
    const pipeline = ev.filter((e) => e.name === 'PipelineReporter' && e.args?.frame_reporter);
    const near = (ts: number) => { let best: Ev | null = null; for (const m of taps) if (m.ts <= ts && (!best || m.ts > best.ts)) best = m; return best ? { tap: best.name.slice(4), dt: Math.round((ts - best.ts) / 1000) } : null; };
    const missing = pipeline.filter((e) => e.args!.frame_reporter!.has_missing_content).map((e) => near(e.ts)).filter((n): n is { tap: string; dt: number } => !!n && n.dt <= 1100);
    console.log(`[handoff-light] taps=${taps.length} pipelineFrames=${pipeline.length} missing=${missing.length} bodyFlat=${flatRows.length}`);
    expect(taps.length, '트레이스에서 탭 표식을 못 찾았다').toBe(MENUS.length * 2);
    expect(pipeline.length, 'PipelineReporter 가 0 — 트레이스 범주(cc)가 빠져 게이트가 공허해진다').toBeGreaterThan(50);
    expect.soft(missing.map((m) => `${m.tap} +${m.dt}ms`), '새 판 타일이 래스터되기 전 프레임이 나갔다(빠진 타일 = 지면색)').toEqual([]);
    expect.soft(flatRows, '본문 영역이 한 색으로 평평해진 프레임').toEqual([]);
  });

  // ② 히트테스트 — 떠나는 판(·푸터 복제본)이 새 판 위에 서 있는 동안 입력은 **새 판**에 닿아야 한다.
  //   샘플: 누른 뒤 +20/+60/+120/+200/+400ms 에 본문 중앙 elementFromPoint. 그리고 커뮤니티로 옮긴 직후(+80ms) 하위 탭을 실제로 눌러
  //   캡처 단계 click 의 target 이 커뮤니티 판 안이었는지 본다(마크업 무관 — 어떤 하위 탭이 활성인지는 묻지 않는다).
  test('② 다크 — 떠나는 판이 서 있는 동안에도 입력은 새 판에 닿는다 · 판/복제본은 걷힌다', async ({ page }) => {
    const cdp = await boot(page, 'dark');
    const bad: string[] = [];
    let leavingSeen = 0;
    const sample = (tab: string, d: number) => page.evaluate(([tab, d, nav]) => {
      const h = document.querySelector('[data-stack-header]')!.getBoundingClientRect().bottom;
      const n = document.querySelector(nav)!.getBoundingClientRect().top;
      const el = document.elementFromPoint(innerWidth / 2, (h + n) / 2);
      const pane = el?.closest('.tab-pane')?.getAttribute('data-tab') ?? null;
      const leaving = !!document.querySelector('[data-pane-leaving]');
      const hitsLeaving = !!el?.closest('[data-pane-leaving]');
      const hitsClone = !!el?.closest('footer[aria-hidden="true"]');
      const desc = `${el?.tagName ?? 'none'}.${String((el as HTMLElement | null)?.className ?? '').split(' ').slice(0, 2).join('.')}`;
      return { leaving, bad: hitsLeaving || hitsClone || (pane !== null && pane !== tab) ? `+${d}ms ${desc} pane=${pane}${hitsLeaving ? ' LEAVING' : ''}${hitsClone ? ' CLONE' : ''}` : null };
    }, [tab, d, NAV] as [string, number, string]);
    for (const [label, tab] of [['라이브', 'live'], ['커뮤니티', 'community'], ['GTO', 'tools'], ['캘린더', 'calendar'], ['홈', 'home']] as const) {
      const id = `→${label}`;
      await scrollOrigin(page, id);
      await tapTab(page, cdp, label, id);
      const t0 = Date.now();
      for (const d of [20, 60, 120, 200, 400]) {
        while (Date.now() - t0 < d) await page.waitForTimeout(5);
        const s = await sample(tab, d);
        if (s.leaving) leavingSeen += 1;
        if (s.bad) bad.push(`${id} ${s.bad}`);
      }
      await page.waitForTimeout(1000);
      const stuck = await page.evaluate(() => [...document.querySelectorAll('[data-pane-leaving], footer[aria-hidden="true"]')].map((e) => e.tagName + ':' + (e.getAttribute('data-tab') ?? 'clone')).join(','));
      if (stuck) bad.push(`${id} 정착 뒤에도 남았다: ${stuck}`);
      const swap = await page.evaluate(() => document.documentElement.hasAttribute('data-tab-swap'));
      if (swap) bad.push(`${id} html[data-tab-swap] 이 풀리지 않았다(상시 크롬 전환이 영원히 꺼진다)`);
    }
    // 실제 입력 — 홈 → 커뮤니티 누르고 80ms 뒤 하위 탭 바의 마지막 버튼을 누른다(그때 떠나는 판이 위에 서 있다).
    await scrollOrigin(page, 'functional');
    await tapTab(page, cdp, '커뮤니티', 'functional');
    await page.waitForTimeout(80);
    const leavingOnTop = await page.evaluate(() => !!document.querySelector('[data-pane-leaving]'));
    await page.evaluate(() => { (window as unknown as { __clicks: string[] }).__clicks.length = 0; });
    const sub = await center(page, { sel: '[data-community-secbar] button', last: true });
    expect(sub, 'functional: 커뮤니티 하위 탭 버튼을 못 찾았다').not.toBeNull();
    await press(page, cdp, sub!.x, sub!.y, true);
    await page.waitForTimeout(800);
    const clicks = await page.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks);
    console.log(`[handoff-hit] leavingSeen=${leavingSeen} leavingOnTopAtFunctional=${leavingOnTop} clicks=${JSON.stringify(clicks)}`);
    expect(clicks.length, 'functional: 하위 탭을 눌렀는데 click 이 한 번도 안 왔다(입력이 삼켜졌다)').toBeGreaterThan(0);
    expect(clicks.filter((c) => !/@community$/.test(c)), 'functional: click 이 커뮤니티 판이 아닌 곳(떠나는 판 등)에 닿았다').toEqual([]);
    expect(bad, '떠나는 판/복제본이 입력을 가로챘거나 걷히지 않았다').toEqual([]);
  });

  // ③ 연타 · 동작 줄이기 — 퇴장이 끊겨도 판·복제본·data-tab-swap 이 남지 않는다(남으면 이후 모든 탭 전환의 크롬 전환이 죽는다).
  test('③ 연타·동작 줄이기 뒤에도 떠나는 판·복제본·스왑 표식이 남지 않는다', async ({ page }) => {
    const cdp = await boot(page, 'dark');
    const left: string[] = [];
    const check = async (id: string) => {
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => ({
        stuck: [...document.querySelectorAll('[data-pane-leaving], footer[aria-hidden="true"]')].map((e) => e.tagName + ':' + (e.getAttribute('data-tab') ?? 'clone')).join(','),
        swap: document.documentElement.hasAttribute('data-tab-swap'),
        visible: [...document.querySelectorAll<HTMLElement>('.tab-pane')].filter((p) => p.style.display !== 'none').map((p) => p.getAttribute('data-tab')),
      }));
      if (r.stuck) left.push(`${id} 남음: ${r.stuck}`);
      if (r.swap) left.push(`${id} data-tab-swap 남음`);
      if (r.visible.length !== 1) left.push(`${id} 보이는 판이 ${r.visible.length}개(${r.visible.join(',')})`);
    };
    // 연타 — 라이브 → 커뮤니티 를 40ms 간격으로
    await scrollOrigin(page, '연타');
    const a = await center(page, TAB('라이브')); const b = await center(page, TAB('커뮤니티'));
    expect(a && b, '연타: 하단바 버튼을 못 찾았다').toBeTruthy();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a!.x, y: a!.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b!.x, y: b!.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await check('연타');
    // 같은 탭 되돌림 — 홈 → 커뮤니티(이미 커뮤니티) 연타
    await tapTab(page, cdp, '홈', '되돌림'); await page.waitForTimeout(30); await tapTab(page, cdp, '커뮤니티', '되돌림');
    await check('되돌림');
    // 동작 줄이기 — 페이드 없이 한 프레임 교체여야 하고 아무것도 남지 않는다
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await scrollOrigin(page, '동작줄이기');
    await tapTab(page, cdp, 'GTO', '동작줄이기');
    const rmLeaving = await page.evaluate(() => !!document.querySelector('[data-pane-leaving]'));
    await check('동작줄이기');
    if (rmLeaving) left.push('동작줄이기: 떠나는 판이 섰다(페이드가 돌았다)');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(left).toEqual([]);
  });
});
