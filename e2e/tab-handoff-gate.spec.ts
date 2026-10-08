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
// 🔵 2026-10-08 8차 INSTANT-SWAP(src/lib/tabCover.ts) — 떠나는 판·복제본을 걷었다. ①②③(빠진 타일·입력·잔여물)은 그대로 지키고,
//   ④⑤⑥ 의 '떠나는 판이 선다' 는 '서지 않는다' 로 뒤집었다(옛 판이 새 판 위에서 걷히는 겹침이 오너가 본 '블러·네모칸').
// 실행: E2E_BASE_URL=http://localhost:4782 npx playwright test e2e/tab-handoff-gate.spec.ts
// ⑤(2026-09-27) 로딩 중 탭 — 복제본이 떠나는 판의 늦은 변화가 아니라 실제 커밋에 맞춰 서는가. 6edb9738 빌드 FAIL(PC 사이드바 이른 복제본 · 모바일 메뉴 복제본 0).
import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { ANON_KEY, stubLogin } from './_session';
import { mockSchedules } from './_schedules';
import { Cast, RECORDER, center, press, FLAT_STD, type Finder } from './_flicker';
import { normalizedCut } from './_cutNorm';

/** 떠나는 판의 퇴장 페이드(WAAPI)가 시작된 시각을 window.__fade(performance.now)에 쌓는다 — 컷 판정의 기준 시각(e2e/_cutNorm.ts). 읽기만 한다. */
function installFadeSpy() {
  const w = window as unknown as { __fade: number[] };
  w.__fade = [];
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, ...a: Parameters<Element['animate']>) {
    if (this.closest('[data-pane-leaving]')) w.__fade.push(performance.now());
    return orig.apply(this, a);
  };
}
import { bootOwner, openMyStore } from './_mockOwner';
import type { Frame } from './_flicker';
import { FRAME_MS } from './_cutNorm';

// 자리 판정(2026-10-03 rca-handoff-6px-1003) — 떠나는 판 복제본은 **페이드가 시작되기 전에도** 원본 자리여야 한다.
//   normalizedCut 은 onset 앞 걸음을 세지 않는다. 그 빈 구간에서 복제본 내용이 10.6px 내려앉아(위 껍데기의 마진 겹침 소실 · 커뮤니티 홀덤펍 → 게시판)
//   목록이 한 번에 툭 떨어진 채 페이드됐다. 두 단언으로 막는다:
//   A. DOM — 누르기 직전 본문 글자 칸(제 글자를 가진 요소 ≤16개)의 윗변 ↔ 복제본이 처음 페인트된 뒤(두 번째 rAF)의 같은 글자 칸. 차 중앙값 ≤ 0.5px · 최댓값 ≤ 3px.
//   B. 픽셀 — 누른 뒤 ~ onset 앞(1프레임 여유) 프레임은 누르기 직전 프레임과 같다(본문 크롭 썸네일 차 ≤ 1.5).
function installAlignSpy() {
  const w = window as unknown as { __al: { sig: { t: string; y: number }[]; worst: number; med: number; seen: boolean; detail: string } | null };
  w.__al = null;
  const own = (e: Element) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim();
  new MutationObserver((rs) => {
    const al = w.__al; if (!al || al.seen) return;
    for (const r of rs) for (const n of r.addedNodes) {
      if (!(n instanceof HTMLElement) || !n.hasAttribute('data-pane-leaving') || n.classList.contains('tab-pane') || n.tagName === 'FOOTER') continue;
      al.seen = true;
      // 두 번째 rAF = 복제본이 처음 페인트된 뒤. 첫 rAF 는 content-visibility:auto 행(.cv-row-*)의 화면 근접 판정 **전**이라
      //   행이 contain-intrinsic-size 로 서 있어 1~3px 씩 밀려 보인다(그려지지 않는 값 — B 의 픽셀 차 0.00 으로 확인).
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!n.isConnected) return;
        const pool = [...n.querySelectorAll('*')].map((e) => ({ t: own(e), y: e.getBoundingClientRect().top })).filter((x) => x.t);
        const ds: number[] = [];
        for (const s of al.sig) {
          const c = pool.filter((p) => p.t === s.t).sort((a, b) => Math.abs(a.y - s.y) - Math.abs(b.y - s.y))[0];
          if (!c) continue;
          const d = Math.abs(c.y - s.y); ds.push(d);
          if (d > 0.5) al.detail += ` '${s.t.slice(0, 10)}' ${s.y.toFixed(1)}→${c.y.toFixed(1)}`;
          if (d > al.worst) al.worst = d;
        }
        ds.sort((a, b) => a - b); al.med = ds.length ? ds[Math.floor(ds.length / 2)] : 0;
      }));
      return;
    }
  }).observe(document, { subtree: true, childList: true });
}
/** 누르기 직전 서명 — 판 안의 보이는 본문(crop 세로 구간) 글자 칸 윗변. 서명 개수를 돌려준다. */
const armAlign = (page: Page, panel: string, crop: { top: number; bottom: number }) => page.evaluate(([panel, top, bottom]) => {
  const own = (e: Element) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim();
  const p = [...document.querySelectorAll(panel as string)].find((e) => e.getClientRects().length);
  const sig = p ? [...p.querySelectorAll('*')].filter((e) => e.getClientRects().length && own(e)).map((e) => ({ t: own(e), y: e.getBoundingClientRect().top }))
    .filter((s) => s.y > (top as number) && s.y < (bottom as number)).slice(0, 16) : [];
  (window as unknown as { __al: unknown }).__al = { sig, worst: 0, med: 0, seen: false, detail: '' };
  return sig.length;
}, [panel, crop.top, crop.bottom] as [string, number, number]);
/** A·B 판정 — 행 꼬리(row)와 실패 문구(bad), 잰 복제본 수(measured 0/1). */
async function alignVerdict(page: Page, id: string, nsig: number, pre: Frame | undefined, post: Frame[], onset: number | null, d: (a: Frame, b: Frame) => number) {
  const al = await page.evaluate(() => (window as unknown as { __al: { worst: number; med: number; seen: boolean; detail: string } }).__al);
  const before = onset ? post.filter((f) => f.t + FRAME_MS < onset) : [];
  const preDrift = pre ? Math.max(0, ...before.map((f) => d(pre, f))) : 0;
  const bad: string[] = [];
  const measured = al.seen && nsig > 0 ? 1 : 0;
  if (measured && (al.med > 0.5 || al.worst > 3)) bad.push(`${id} 복제본 내용이 원본과 어긋났다(중앙값 ${al.med.toFixed(1)}px · 최대 ${al.worst.toFixed(1)}px:${al.detail})`);
  if (preDrift > 1.5) bad.push(`${id} 페이드 시작 전 본문이 바뀌었다(차 ${preDrift.toFixed(2)} > 1.5)`);
  const fade = onset ? post.filter((f) => f.t >= onset && f.t < onset + 260).length : 0; // 퇴장 페이드(240ms) 동안 나온 프레임 수 — 진단용
  return { row: ` sig=${nsig} dom=${measured ? `${al.med.toFixed(1)}/${al.worst.toFixed(1)}` : '-'} pre=${before.length}f/${preDrift.toFixed(2)} fade=${fade}f`, bad, measured };
}

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

  // ④ 하위 탭(goSubTab) — 메인 탭과 **같은 판 교체**(오너 2026-09-26 "메인 카테고리 이동 때의 부드러운 모션을 하위 탭에서도 동일하게",
  //   src/lib/tabCover.ts 7차 SUB-HANDOFF). 하위 판은 조건부 마운트라 커밋 전에 떠나는 판을 복제해 세우고 240ms 에 걷는다.
  //   판정(탭마다 · 판을 스크롤한 뒤 · 실제 손가락 110ms):
  //     leave — 판 그림이 바뀐 이동이면 떠나는 판([data-pane-leaving], 메인 탭 판·푸터 복제본 제외)이 섰다
  //     cut   — 본문 영역(레일 아래) 썸네일의 **연속 두 프레임 차** 최댓값 ≤ 6(한 프레임에 판이 통째로 바뀌는 컷이 없다).
  //             프레임 간격으로 정규화한다(차 ÷ 간격/16.7ms — 2026-10-03 L-3, 느린 러너가 같은 페이드를 6.2 로 찍던 것). 규칙은 e2e/_cutNorm.ts 머리말.
  //     missing — 트레이스 has_missing_content 0 · hit — 복제본이 서 있는 동안 본문 중앙 입력이 복제본에 닿지 않는다 · stuck — 정착 뒤 남은 것 0
  // 음성 대조(2026-09-26 실행): 9433f190 빌드(하위 탭 즉시 교체) → leave 0/N · cut 9~17 로 FAIL, SUB-HANDOFF 빌드 → PASS.
  test('④ 하위 탭 — 떠나는 판이 서지 않는다(한 프레임 교체) · 빠진 타일 0 · 입력은 새 판', async ({ page }) => {
    const cdp = await boot(page, 'dark');
    await page.evaluate(installFadeSpy);
    await page.evaluate(installAlignSpy);
    await page.evaluate(() => {
      const w = window as unknown as { __lv: number[] };
      w.__lv = [];
      new MutationObserver((rs) => {
        for (const r of rs) for (const n of [r.target, ...Array.from(r.addedNodes)]) {
          if (n instanceof Element && n.hasAttribute('data-pane-leaving') && !n.classList.contains('tab-pane') && n.tagName !== 'FOOTER') w.__lv.push(performance.now());
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-pane-leaving'] });
    });
    const cast = new Cast(cdp);
    await cdp.send('Tracing.start', { categories: 'cc,benchmark,blink.user_timing', transferMode: 'ReturnAsStream' });
    const SCOPES = [
      { nav: '커뮤니티', rail: '[data-community-secbar] button', panel: '[data-community-secpanel]', lim: 900 },
      { nav: 'GTO', rail: '[data-tools-lanebar] button', panel: '[data-tools-lanepanel]', lim: 60 },
    ];
    const rows: string[] = []; const bad: string[] = []; let changed = 0; let taps = 0; let aligned = 0;
    for (const sc of SCOPES) {
      await tapTab(page, cdp, sc.nav, sc.nav);
      await page.waitForTimeout(2000);
      const n = await page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).length, sc.rail);
      expect(n, `${sc.nav}: 하위 탭 버튼을 못 찾았다`).toBeGreaterThan(2);
      const K = Math.min(n, 5);
      // 순방향 K칸 + **역방향 2칸**(#1 → #0): 2026-10-03 design-reviewer — 게시판 → 홀덤펍이 −3px(기준점으로 뽑힌 인라인 배지 하나가 판 전체를 끌어올림)였는데
      //   순방향만 돌던 이 게이트는 그 방향을 재지 않았다. 마지막 두 걸음이 (… → #1 → #0) 역방향이다.
      for (let i = 0; i < K + 2; i++) {
        const idx = i < K ? (i + 1) % K : i === K ? 1 : 0;
        // 판 위쪽(커뮤니티 홀덤펍의 필터 칩 줄)이 화면 위로 나가야 복제본에 위 껍데기가 생긴다(자리 판정 A·B 의 대상). 운영 데이터가 짧은 날엔
        //   끝까지 스크롤해도 그 줄이 화면 안에 남아 결함이 가려졌다(2026-10-03 오후 실측: 문서 1244px · scrollY 255 · 칩 줄 y=49) — 문서 끝에 300px 여유를 준다.
        //   2026-10-05: 모바일 푸터 정돈으로 푸터가 449 → 571px 로 길어졌다. 이 식은 '문서 끝 − 150' 이라 푸터가 길어진 만큼 판 본문을 더 지나쳐
        //   레일이 하단바 밑으로 가거나 판 밖으로 나갔다(누름이 하단바에 닿아 메인 탭이 바뀜 — '누를 하위 탭 0'). 푸터가 늘어난 만큼 빼서
        //   **판 본문 기준 위치는 2026-10-04 와 같게** 둔다(푸터 높이와 무관한 같은 기하).
        await page.evaluate((lim) => {
          const html = document.documentElement;
          html.style.minHeight = ''; html.style.minHeight = `${html.scrollHeight + 300}px`;
          const foot = document.querySelector('[data-testid="business-footer"]')?.getBoundingClientRect().height ?? 449;
          scrollTo({ top: Math.max(0, Math.min(lim, html.scrollHeight - innerHeight - 150 - Math.max(0, foot - 449))), behavior: 'instant' as ScrollBehavior });
        }, sc.lim);
        await page.waitForTimeout(700);
        const b = await page.evaluate(([rail, panel, k]) => {
          const x = [...document.querySelectorAll(rail as string)].filter((e) => e.getClientRects().length)[k as number];
          const p = [...document.querySelectorAll(panel as string)].find((e) => e.getClientRects().length);
          if (!x || !p) return null;
          const r = x.getBoundingClientRect(); const pr = p.getBoundingClientRect();
          const nv = document.querySelector('nav[aria-label="하단 내비게이션"] > div:not([aria-hidden])')!.getBoundingClientRect().top;
          const top = Math.max(r.bottom + 2, pr.top, document.querySelector('[data-stack-header]')!.getBoundingClientRect().bottom + 2);
          const bottom = Math.max(top + 60, Math.min(pr.bottom, (nv > 0 ? nv : innerHeight) - 14));
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: (x.textContent ?? '').trim().slice(0, 8), vh: innerHeight, crop: { top, bottom, w: innerWidth }, mid: { x: innerWidth / 2, y: (top + bottom) / 2 } };
        }, [sc.rail, sc.panel, idx] as [string, string, number]);
        expect(b, `${sc.nav}#${i}: 누를 하위 탭을 못 찾았다`).not.toBeNull();
        const id = `${sc.nav}#${i}:${b!.label}`;
        const lv0 = await page.evaluate(() => (window as unknown as { __lv: number[] }).__lv.length);
        const fd0 = await page.evaluate(() => (window as unknown as { __fade: number[] }).__fade.length);
        const nsig = await armAlign(page, sc.panel, b!.crop);
        await cast.start(b!.crop);
        await page.waitForTimeout(120);
        const t0 = Date.now();
        await page.evaluate((m) => performance.mark(m), `tap:${id}`);
        await press(page, cdp, b!.x, b!.y, true);
        const hit = await page.evaluate(([x, y]) => new Promise<string | null>((res) => setTimeout(() => {
          const el = document.elementFromPoint(x, y);
          res(el?.closest('[data-pane-leaving]') ? `${el.tagName} LEAVING` : null);
        }, 40)), [b!.mid.x, b!.mid.y] as [number, number]);
        await page.waitForTimeout(1000);
        const frames = await cast.stop();
        taps += 1;
        // 본문 영역 썸네일(Cast.th 는 화면 전체 20칸 — 레일 아래 크롭 줄만 쓴다)
        const pre = frames.filter((f) => f.t < t0).pop();
        const post = frames.filter((f) => f.t >= t0);
        const rowsOf = (f: typeof frames[number]) => {
          const TW = 20, TH = f.th.length / TW;
          const r0 = Math.floor((b!.crop.top / b!.vh) * TH), r1 = Math.max(r0 + 1, Math.ceil((b!.crop.bottom / b!.vh) * TH));
          return Array.from(f.th.slice(r0 * TW, Math.min(TH, r1) * TW));
        };
        const d = (a: typeof frames[number], c: typeof frames[number]) => { const x = rowsOf(a), y = rowsOf(c); let s = 0; for (let q = 0; q < x.length; q++) s += Math.abs(x[q] - y[q]); return s / (x.length || 1); };
        // 프레임 간격 정규화(e2e/_cutNorm.ts) — 떠나는 판의 퇴장 페이드가 시작된 시각(onset, epoch ms)부터 잰다. 그 전에는 불투명한 복제본이 새 판을 가리고 있어
        // 새 판이 한 번에 드러나는 컷이 있을 수 없다. 느린 러너의 같은 페이드가 6 을 넘던 것을 보정하고, 떠나는 판이 안 선 즉시 교체(onset 없음)는 원값 그대로 잡는다.
        const onset = await page.evaluate((k) => { const l = (window as unknown as { __fade: number[] }).__fade; return l.length > k ? performance.timeOrigin + l[k] : null; }, fd0);
        const cut = normalizedCut(pre, post, d, onset ?? undefined);
        const total = pre && post.length ? d(pre, post[post.length - 1]) : 0;
        const lv = await page.evaluate((k) => (window as unknown as { __lv: number[] }).__lv.length - k, lv0);
        const stuck = await page.evaluate(() => ({ n: document.querySelectorAll('[data-pane-leaving]').length, swap: document.documentElement.hasAttribute('data-tab-swap') }));
        const al = await alignVerdict(page, id, nsig, pre, post, onset, d);
        aligned += al.measured; bad.push(...al.bad);
        rows.push(`${id} total=${total.toFixed(1)} cut=${cut.toFixed(1)} leave=${lv}${al.row}${hit ? ' hit=' + hit : ''}`);
        // 2026-10-08 8차 INSTANT-SWAP — 판 교체는 한 프레임이다. 옛 계약(떠나는 판이 서고 컷 ≤ 6)을 뒤집는다: 떠나는 판이 서면 실패.
        if (total > 3) changed += 1;
        if (lv > 0) bad.push(`${id} 떠나는 판이 ${lv}번 섰다 — 두 판이 겹쳐 '블러·네모칸' 으로 보인다(8차 INSTANT-SWAP)`);
        if (hit) bad.push(`${id} +40ms 본문 입력이 떠나는 판에 닿았다(${hit})`);
        if (stuck.n || stuck.swap) bad.push(`${id} 정착 뒤 남았다: 떠나는 판 ${stuck.n} · data-tab-swap ${stuck.swap}`);
        await page.waitForTimeout(300);
      }
      // 여유를 걷고 하단바가 보이는 자리(끝에서 150px 위)로 — 다음 범위의 메인 탭을 누를 수 있게
      await page.evaluate(() => { const html = document.documentElement; html.style.minHeight = ''; scrollTo({ top: Math.max(0, html.scrollHeight - innerHeight - 150), behavior: 'instant' as ScrollBehavior }); });
      await page.waitForTimeout(700);
    }
    const done = new Promise<{ stream: string }>((res) => cdp.once('Tracing.tracingComplete', (e) => res(e as { stream: string })));
    await cdp.send('Tracing.end');
    const { stream } = await done;
    let json = '';
    for (;;) { const r = await cdp.send('IO.read', { handle: stream, size: 1 << 22 }); json += r.data; if (r.eof) break; }
    await cdp.send('IO.close', { handle: stream });
    type Ev = { name: string; ts: number; cat?: string; args?: { frame_reporter?: { has_missing_content?: boolean } } };
    const ev = (JSON.parse(json) as { traceEvents?: Ev[] }).traceEvents ?? [];
    const tapsTr = ev.filter((e) => e.cat?.includes('blink.user_timing') && e.name.startsWith('tap:')).sort((a, b) => a.ts - b.ts);
    const near = (ts: number) => { let best: Ev | null = null; for (const m of tapsTr) if (m.ts <= ts && (!best || m.ts > best.ts)) best = m; return best ? { tap: best.name.slice(4), dt: Math.round((ts - best.ts) / 1000) } : null; };
    const missing = ev.filter((e) => e.name === 'PipelineReporter' && e.args?.frame_reporter?.has_missing_content).map((e) => near(e.ts)).filter((n): n is { tap: string; dt: number } => !!n && n.dt <= 1100);
    console.log(`[handoff-sub] taps=${taps} changed=${changed} aligned=${aligned} missing=${missing.length}\n  ${rows.join('\n  ')}`);
    expect(tapsTr.length, '트레이스에서 탭 표식을 못 찾았다').toBe(taps);
    expect(changed, '판 그림이 바뀐 이동이 거의 없다 — 게이트가 공허해진다(데이터·선택자 확인)').toBeGreaterThanOrEqual(6);
    expect.soft(missing.map((m) => `${m.tap} +${m.dt}ms`), '새 판 타일이 래스터되기 전 프레임이 나갔다').toEqual([]);
    expect(bad).toEqual([]);
  });
});

// ⑤ 로딩 중 탭(2026-09-27 COMMIT-SIGNAL, root-cause-debugger) — 떠나는 판은 커밋 전까지 **살아 있다**. 그 판 자신의 늦은 데이터 도착·실시간 갱신
//   (판 DOM 변화)을 커밋으로 오인하면 옛 그림이 먼저 걷히고 진짜 전환은 복제본 없이 컷이다.
//   6edb9738 빌드 실측: 내 매장 PC 사이드바(전환 레인 커밋) 3/3 — 복제본 47~72ms · 실제 커밋 118~169ms, 모바일 메뉴 6/6 — 복제본 0(시트가 먼저 닫혀 레일만 바뀜).
//   여기서는 누른 뒤 떠나는 판에 칸을 붙여 '늦은 도착'을 결정적으로 만들고, 복제본이 **실제 커밋과 같은 태스크**에서 **한 번만**,
//   그 도착까지 담은 모습으로 서는지 본다. 커밋 판정은 구현과 독립이다(보이는 [data-pane] 가 바뀜 · 누른 칸이 활성 표식을 얻음).
//   커뮤니티·GTO 는 판을 연 직후(아직 불러오는 중) 누른다 — 동기 커밋 경로가 그대로 복제본을 세우는지.
async function armCommitWatch(page: Page, btnSel: string, text: string | null, idx: number, panelSel: string, inject: boolean) {
  return page.evaluate(([btnSel, text, idx, panelSel, inject]) => {
    const vis = (e: Element) => e.getClientRects().length > 0;
    const pool = [...document.querySelectorAll<HTMLElement>(btnSel as string)].filter(vis);
    const b = text ? pool.find((x) => (x.textContent ?? '').trim().includes(text as string)) : pool[idx as number];
    const panel = [...document.querySelectorAll(panelSel as string)].find(vis) as HTMLElement | undefined;
    if (!b || !panel) return null;
    const panes = () => [...panel.querySelectorAll<HTMLElement>('[data-pane]')].filter(vis).map((e) => e.getAttribute('data-pane')).join('|');
    const p0 = panes();
    const act = (e: Element) => [e, ...e.querySelectorAll('*')].some((x) => x.hasAttribute('data-pill-active') || x.getAttribute('aria-selected') === 'true' || x.getAttribute('aria-pressed') === 'true');
    const was = act(b);
    // 누를 때마다 새 표식 — keep-alive 판(숨은 판)에 남은 앞선 칸을 세지 않게
    const mark = `h5-late-${Math.round(performance.now())}`;
    const w = { clones: [] as { same: boolean; late: number }[], committed: false, inC: false };
    (window as unknown as { __h5: typeof w }).__h5 = w;
    const mo = new MutationObserver((rs) => {
      if (!w.committed && ((p0 && panes() !== p0) || (!was && b.isConnected && act(b)))) {
        w.committed = true; w.inC = true; setTimeout(() => { w.inC = false; }, 0);
      }
      for (const r of rs) for (const n of [r.target, ...r.addedNodes]) {
        if (n instanceof Element && n.hasAttribute('data-pane-leaving') && !n.classList.contains('tab-pane') && n.tagName !== 'FOOTER'
          && (r.type === 'childList' || r.attributeName === 'data-pane-leaving')) w.clones.push({ same: w.inC, late: n.querySelectorAll(`.${mark}`).length });
      }
    });
    mo.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-pane-leaving', 'style', 'data-pill-active', 'aria-selected', 'aria-pressed'] });
    setTimeout(() => mo.disconnect(), 2500);
    if (inject) b.addEventListener('click', () => setTimeout(() => {
      const host = [...panel.querySelectorAll('[data-pane]')].find(vis);
      if (host) { const s = document.createElement('div'); s.className = mark; s.style.height = '6px'; host.appendChild(s); }
    }, 0), { capture: true, once: true });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: (b.textContent ?? '').trim().slice(0, 10) };
  }, [btnSel, text, idx, panelSel, inject] as const);
}

test.describe('TAB-HANDOFF-GATE ⑤ — 로딩 중 탭', () => {
  test.describe.configure({ timeout: 240_000 });
  test('⑤ 로딩 중 탭 — 커밋은 일어나고 복제본은 한 번도 서지 않는다(8차 INSTANT-SWAP)', async ({ page }) => {
    const bad: string[] = []; const rows: string[] = [];
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const judge = async (id: string, late: boolean) => {
      await page.waitForTimeout(1500);
      const w = await page.evaluate(() => (window as unknown as { __h5: { clones: { same: boolean; late: number }[]; committed: boolean } }).__h5);
      rows.push(`${id} committed=${w.committed} clones=${JSON.stringify(w.clones)}`);
      if (!w.committed) bad.push(`${id} 커밋을 못 봤다 — 누른 것이 판을 바꾸지 않았다(선택자·데이터 확인)`);
      // 2026-10-08 8차 INSTANT-SWAP — 떠나는 판 복제본을 걷었다. 늦은 도착(late)이 있어도 복제본은 0개여야 한다.
      else if (w.clones.length) bad.push(`${id} 복제본 ${w.clones.length}개(0 이어야 한다 — 판 교체는 한 프레임${late ? ' · 늦은 도착 주입' : ''})`);
    };
    const mouse = async (x: number, y: number) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up(); };
    const touch = async (x: number, y: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
      await page.waitForTimeout(110);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    // 내 매장 PC — 사이드바(startTransition 커밋)
    await bootOwner(page, { viewport: { width: 1440, height: 900 } });
    await openMyStore(page);
    await expect(page.locator('[data-mystore-secpanel] [data-pane="dashboard"]')).toBeVisible();
    await page.waitForTimeout(1000); // 내 매장을 연 메인 탭 전환이 끝난 뒤(도는 중이면 연타로 보고 한 프레임 교체한다 — 정상)
    for (const to of ['게임 진행', '매장 설정', '대시보드']) {
      const a = await armCommitWatch(page, '[data-mystore-secbar] button', to, 0, '[data-mystore-secpanel]', true);
      expect(a, `사이드바 '${to}' 를 못 찾았다`).not.toBeNull();
      await mouse(a!.x, a!.y);
      await judge(`PC 사이드바 → ${a!.label}`, true);
    }
    // 내 매장 모바일 — 전체 메뉴 시트(시트는 즉시 닫히고 판은 전환 레인에서 늦게 커밋)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    for (const to of ['게임 진행', '대시보드']) {
      const t = await page.getByTestId('mystore-menu-toggle').boundingBox();
      expect(t, '모바일 메뉴 버튼을 못 찾았다').not.toBeNull();
      await touch(t!.x + t!.width / 2, t!.y + t!.height / 2);
      await expect(page.locator('.animate-slide-up').first()).toBeVisible();
      const a = await armCommitWatch(page, '.animate-slide-up button', to, 0, '[data-mystore-secpanel]', true);
      expect(a, `메뉴 '${to}' 를 못 찾았다`).not.toBeNull();
      await touch(a!.x, a!.y);
      await judge(`모바일 메뉴 → ${a!.label}`, true);
    }
    // 커뮤니티·GTO — 판을 연 직후(불러오는 중) 누른다
    for (const sc of [{ nav: '커뮤니티', rail: '[data-community-secbar] button', panel: '[data-community-secpanel]' },
      { nav: 'GTO', rail: '[data-tools-lanebar] button', panel: '[data-tools-lanepanel]' }]) {
      const n = await center(page, TAB(sc.nav));
      expect(n, `하단바 '${sc.nav}' 를 못 찾았다`).not.toBeNull();
      await touch(n!.x, n!.y);
      await page.waitForTimeout(600);
      for (let i = 1; i <= 3; i++) {
        const a = await armCommitWatch(page, sc.rail, null, i, sc.panel, false);
        expect(a, `${sc.nav} 하위 탭 #${i} 를 못 찾았다`).not.toBeNull();
        await touch(a!.x, a!.y);
        await judge(`${sc.nav} → ${a!.label}`, false);
      }
    }
    console.log(`[handoff-loading]\n  ${rows.join('\n  ')}`);
    expect(rows.length, '잰 탭이 모자라다 — 게이트가 공허해진다').toBe(11);
    expect(bad).toEqual([]);
  });
});

// ⑥ 내 정보 하위 탭(대시보드·프로필·설정·보안) — 다른 하위 탭과 **같은 판 교체**(오너 2026-09-27 요청 1).
//   내 정보는 전면 판(fixed) 안의 스크롤 상자([data-profile-panel])이고 판 넷이 keep-alive(hidden 토글)다.
//   판정은 ④와 같다: 판 그림이 바뀐 이동이면 떠나는 판([data-pane-leaving])이 서고(leave) · 한 프레임 컷 ≤ 6 · 정착 뒤 남은 것 0.
//   더해서 keep-alive 계약: 두 바퀴 도는 동안 대시보드 판 노드가 같은 노드이고(재마운트 0) · 약관 이력 조회가 첫 보안 진입 뒤 늘지 않는다(재조회 0).
//   390·360 × 다크·라이트 · CPU 4배 · 실제 손가락 110ms · 판을 스크롤한 뒤 누른다.
test.describe('TAB-HANDOFF-GATE ⑥ — 내 정보 하위 탭', () => {
  test.describe.configure({ timeout: 300_000 });
  for (const [w, scheme] of [[390, 'dark'], [390, 'light'], [360, 'dark'], [360, 'light']] as const) {
    test(`⑥ 내 정보 ${w} ${scheme} — 떠나는 판이 서지 않는다(한 프레임 교체) · 재마운트·재조회 0`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      let consentReads = 0;
      page.on('request', (r) => { if (r.method() === 'GET' && /\/rest\/v1\/legal_consents\?/.test(r.url())) consentReads += 1; });
      const cdp = await boot(page, scheme);
      await page.evaluate(installFadeSpy);
      await page.evaluate(installAlignSpy);
      await page.evaluate(() => {
        const g = window as unknown as { __lv: number[] };
        g.__lv = [];
        new MutationObserver((rs) => {
          for (const r of rs) for (const n of [r.target, ...Array.from(r.addedNodes)]) {
            if (n instanceof Element && n.hasAttribute('data-pane-leaving') && !n.classList.contains('tab-pane') && n.tagName !== 'FOOTER') g.__lv.push(performance.now());
          }
        }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-pane-leaving'] });
      });
      await page.getByRole('button', { name: '검증계정 메뉴' }).click();
      await page.getByRole('button', { name: '내 정보 열기' }).click();
      await expect(page.locator('div.fixed.inset-0:has(> header h1:text-is("내 정보"))')).toHaveJSProperty('inert', false);
      await page.waitForTimeout(1500);
      // 대시보드 판 노드에 표식 — 두 바퀴 뒤 같은 노드여야 한다(keep-alive)
      const marked = await page.evaluate(() => {
        const p = document.querySelector('[data-profile-panel]');
        const d = p?.lastElementChild?.firstElementChild as (Element & { __keep?: boolean }) | null | undefined;
        if (!d) return false;
        d.__keep = true;
        (window as unknown as { __dash: Element }).__dash = d;
        return true;
      });
      expect(marked, '대시보드 판을 못 찾았다').toBe(true);
      const cast = new Cast(cdp);
      // '@…' = 판 안의 이동 버튼(대시보드 '프로필 편집' → 설정 탭) — 탭바가 아닌 두 번째 입구도 같은 장치를 타야 한다.
      const ORDER = ['프로필', '설정', '보안', '대시보드', '@프로필 편집', '보안', '프로필', '대시보드'];
      const DEST: Record<string, string> = { '@프로필 편집': '설정' };
      const rows: string[] = []; const bad: string[] = []; let changed = 0; let readsAfterSec = -1; let aligned = 0;
      for (let i = 0; i < ORDER.length; i++) {
        const name = ORDER[i];
        // 판을 스크롤한 뒤(가능하면 200px) 누른다 — 원점 스크롤 0 은 실사용이 아니다
        // '@' 입구(대시보드 머리의 버튼)는 판 맨 위에 있어 스크롤하면 화면 밖이다 — 그 이동만 원점에서 누른다.
        await page.evaluate((top) => { const p = document.querySelector<HTMLElement>('[data-profile-panel]'); if (p) p.scrollTop = top ? 0 : Math.min(200, Math.max(0, p.scrollHeight - p.clientHeight)); }, name.startsWith('@'));
        await page.waitForTimeout(500);
        const b = await page.evaluate((label) => {
          const x = label.startsWith('@')
            ? [...document.querySelectorAll<HTMLElement>('[data-profile-panel] button')].find((e) => e.getClientRects().length > 0 && (e.textContent ?? '').trim() === label.slice(1))
            : [...document.querySelectorAll<HTMLElement>('[data-profile-tabbar] [role="tab"]')].find((e) => (e.textContent ?? '').trim() === label);
          const p = document.querySelector('[data-profile-panel]');
          if (!x || !p) return null;
          const r = x.getBoundingClientRect(); const pr = p.getBoundingClientRect();
          const top = Math.max(r.bottom + 2, pr.top + 2);
          const bottom = Math.max(top + 60, Math.min(pr.bottom, innerHeight) - 8);
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, vh: innerHeight, crop: { top, bottom, w: innerWidth }, mid: { x: innerWidth / 2, y: (top + bottom) / 2 }, on: x.getAttribute('aria-selected') === 'true' };
        }, name);
        expect(b, `${name}: 탭을 못 찾았다`).not.toBeNull();
        const id = `${w}${scheme[0]}#${i}:${name}`;
        const lv0 = await page.evaluate(() => (window as unknown as { __lv: number[] }).__lv.length);
        const fd0 = await page.evaluate(() => (window as unknown as { __fade: number[] }).__fade.length);
        const nsig = await armAlign(page, '[data-profile-panel]', b!.crop);
        await cast.start(b!.crop);
        await page.waitForTimeout(120);
        const t0 = Date.now();
        await press(page, cdp, b!.x, b!.y, true);
        const hit = await page.evaluate(([x, y]) => new Promise<string | null>((res) => setTimeout(() => {
          const el = document.elementFromPoint(x, y);
          res(el?.closest('[data-pane-leaving]') ? `${el.tagName} LEAVING` : null);
        }, 40)), [b!.mid.x, b!.mid.y] as [number, number]);
        await page.waitForTimeout(1000);
        const frames = await cast.stop();
        await expect(page.locator('[data-profile-tabbar] [role="tab"]', { hasText: DEST[name] ?? name })).toHaveAttribute('aria-selected', 'true');
        const pre = frames.filter((f) => f.t < t0).pop();
        const post = frames.filter((f) => f.t >= t0);
        const rowsOf = (f: typeof frames[number]) => {
          const TW = 20, TH = f.th.length / TW;
          const r0 = Math.floor((b!.crop.top / b!.vh) * TH), r1 = Math.max(r0 + 1, Math.ceil((b!.crop.bottom / b!.vh) * TH));
          return Array.from(f.th.slice(r0 * TW, Math.min(TH, r1) * TW));
        };
        const d = (a: typeof frames[number], c: typeof frames[number]) => { const x = rowsOf(a), y = rowsOf(c); let s = 0; for (let q = 0; q < x.length; q++) s += Math.abs(x[q] - y[q]); return s / (x.length || 1); };
        // 프레임 간격 정규화(e2e/_cutNorm.ts) — 떠나는 판의 퇴장 페이드가 시작된 시각(onset, epoch ms)부터 잰다. 그 전에는 불투명한 복제본이 새 판을 가리고 있어
        // 새 판이 한 번에 드러나는 컷이 있을 수 없다. 느린 러너의 같은 페이드가 6 을 넘던 것을 보정하고, 떠나는 판이 안 선 즉시 교체(onset 없음)는 원값 그대로 잡는다.
        const onset = await page.evaluate((k) => { const l = (window as unknown as { __fade: number[] }).__fade; return l.length > k ? performance.timeOrigin + l[k] : null; }, fd0);
        const cut = normalizedCut(pre, post, d, onset ?? undefined);
        const total = pre && post.length ? d(pre, post[post.length - 1]) : 0;
        const lv = await page.evaluate((k) => (window as unknown as { __lv: number[] }).__lv.length - k, lv0);
        const stuck = await page.evaluate(() => ({ n: document.querySelectorAll('[data-pane-leaving]').length, swap: document.documentElement.hasAttribute('data-tab-swap') }));
        const al = await alignVerdict(page, id, nsig, pre, post, onset, d);
        aligned += al.measured; bad.push(...al.bad);
        rows.push(`${id} total=${total.toFixed(1)} cut=${cut.toFixed(1)} leave=${lv}${al.row}${hit ? ' hit=' + hit : ''}`);
        // 2026-10-08 8차 INSTANT-SWAP — 판 교체는 한 프레임이다. 옛 계약(떠나는 판이 서고 컷 ≤ 6)을 뒤집는다: 떠나는 판이 서면 실패.
        if (total > 3) changed += 1;
        if (lv > 0) bad.push(`${id} 떠나는 판이 ${lv}번 섰다 — 두 판이 겹쳐 '블러·네모칸' 으로 보인다(8차 INSTANT-SWAP)`);
        if (hit) bad.push(`${id} +40ms 본문 입력이 떠나는 판에 닿았다(${hit})`);
        if (stuck.n || stuck.swap) bad.push(`${id} 정착 뒤 남았다: 떠나는 판 ${stuck.n} · data-tab-swap ${stuck.swap}`);
        if (name === '보안' && readsAfterSec < 0) { await page.waitForTimeout(1500); readsAfterSec = consentReads; }
        await page.waitForTimeout(300);
      }
      const same = await page.evaluate(() => { const d = (window as unknown as { __dash: Element & { __keep?: boolean } }).__dash; return !!d?.isConnected && d.__keep === true; });
      console.log(`[handoff-me ${w} ${scheme}] changed=${changed} aligned=${aligned} consentReads=${consentReads} (after first 보안 ${readsAfterSec})\n  ${rows.join('\n  ')}`);
      expect(changed, '판 그림이 바뀐 이동이 거의 없다 — 게이트가 공허해진다').toBeGreaterThanOrEqual(6);
        expect(same, 'keep-alive: 대시보드 판이 다시 마운트됐다').toBe(true);
      expect(readsAfterSec, '보안 탭 진입을 못 쟀다').toBeGreaterThanOrEqual(0);
      expect(consentReads, 'keep-alive: 첫 보안 진입 뒤 약관 이력을 다시 불렀다').toBe(readsAfterSec);
      expect(bad).toEqual([]);
    });
  }
});
