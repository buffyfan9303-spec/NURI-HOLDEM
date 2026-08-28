// e2e/nav-stability.spec.ts — 내비게이션 안정성 게이트
//
// 오너가 "가장 문제가 큰 것 2개" 로 지목한 증상을 **숫자로** 못 박는다.
//   ① 콘텐츠 이동 중 터치가 먹통이 된다  → 보낸 탭 중 실제로 버튼에 닿은 수를 센다(유실 0)
//   ② 뒤로가기가 홈으로 튄다            → 각 시나리오의 '도착 화면'을 기대값과 대조한다(100%)
//
// ── '먹통' 을 어떻게 숫자로 만들었나 ────────────────────────────────────────
// View Transition 이 도는 동안 브라우저는 **살아 있는 DOM 의 히트테스트를 통째로 막는다**
// (실측: 탭바 좌표의 elementFromPoint 가 버튼이 아니라 <html> 을 돌려준다).
// 그래서 두 지표를 나눠 잰다.
//   · 차단ms  — 브라우저가 히트테스트를 막아 둔 시간. 전환 연출을 쓰는 한 0 이 될 수 없다.
//               (앱은 입력이 들어오면 전환을 즉시 걷어내므로, 이 값은 '입력이 없던 구간'이다)
//   · 유실탭  — 보낸 탭 중 어떤 버튼에도 닿지 못한 것. **이게 사용자가 말하는 먹통이고 목표는 0.**
// 유실탭만 단정하고 차단ms 는 표에 남긴다 — 회귀 시 원인을 짚기 위한 값이다.
//
// ⚠ 클릭은 Playwright 의 actionability 재시도(locator.click)를 쓰지 않고 raw mouse.click 을 쓴다.
//   재시도는 '먹통' 을 자동으로 기다려 주기 때문에 — 즉 이 스펙이 잡아야 할 바로 그 증상을 지워버린다.
import { test, expect } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';
import { installNavProbe, aimProbeAtTab, resetProbe, readProbe, currentScreen } from './_navprobe';

type Row = { id: string; scenario: string; expected: string; got: string; blockedMs: number; lost: number; ok: boolean };

const TAB_INDEX = { home: 0, live: 1, community: 2, tools: 3, me: 4 } as const;
type TabKey = keyof typeof TAB_INDEX;

test.describe('내비게이션 안정성 — 입력 유실 0 · 뒤로가기 도착 100%', () => {
  test.beforeEach(async ({ page }) => {
    await installNavProbe(page);
    await stabilizeBackstack(page);
    await page.goto('/');
    await dismissOverlays(page);
    await page.waitForSelector('[data-tab="home"]', { timeout: 20_000 });
  });

  /** 탭바 각 칸의 중심 좌표 — raw 클릭용(actionability 우회) */
  async function tabPoints(page: import('@playwright/test').Page) {
    const btns = page.locator('nav[aria-label="하단 내비게이션"] button');
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const b = await btns.nth(i).boundingBox();
      if (!b) throw new Error(`탭바 ${i}번 칸을 못 찾았다`);
      pts.push({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    }
    return pts;
  }

  async function tap(page: import('@playwright/test').Page, pts: { x: number; y: number }[], tab: TabKey) {
    await page.mouse.click(pts[TAB_INDEX[tab]].x, pts[TAB_INDEX[tab]].y);
  }

  async function back(page: import('@playwright/test').Page) {
    await page.evaluate(() => window.history.back());
    await page.waitForTimeout(500); // 전환 + VT 종료까지
  }

  const rows: Row[] = [];
  const record = (r: Row) => { rows.push(r); };

  test.afterAll(() => {
    if (!rows.length) return;
    const w = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n);
    console.log('\n┌── 내비게이션 계측 ' + '─'.repeat(78));
    console.log('│ ' + w('ID', 12) + w('시나리오', 40) + w('기대', 20) + w('실제', 20) + w('차단ms', 8) + w('유실탭', 7) + 'OK');
    for (const r of rows) {
      console.log('│ ' + w(r.id, 12) + w(r.scenario, 40) + w(r.expected, 20) + w(r.got, 20) + w(String(r.blockedMs), 8) + w(String(r.lost), 7) + (r.ok ? 'O' : 'X'));
    }
    const lost = rows.reduce((a, b) => a + b.lost, 0);
    const bad = rows.filter((r) => !r.ok).length;
    console.log('└── 합계: 유실탭 ' + lost + ' · 도착 오류 ' + bad + '/' + rows.length + ' ' + '─'.repeat(40) + '\n');
  });

  // ── ① 탭 연타 — 200~400ms 간격 ──────────────────────────────────────────
  for (const gap of [400, 300, 200]) {
    test(`연타 ${gap}ms — 홈→라이브→커뮤니티→GTO 순서대로 도착한다`, async ({ page }) => {
      const pts = await tabPoints(page);
      await aimProbeAtTab(page, TAB_INDEX.community);
      await resetProbe(page);
      const seq: TabKey[] = ['live', 'community', 'tools'];
      for (const t of seq) { await tap(page, pts, t); await page.waitForTimeout(gap); }
      await page.waitForTimeout(900);
      const got = await currentScreen(page);
      const probe = await readProbe(page);
      const lost = seq.length - probe.tabClicks;
      const expected = 'tab:tools';
      record({ id: `A-${gap}`, scenario: `탭 연타 ${gap}ms 간격 3회`, expected, got, blockedMs: probe.blockedMs, lost, ok: got === expected && lost === 0 });
      expect(lost, `보낸 탭 ${seq.length}회 중 ${lost}회가 어떤 버튼에도 닿지 않았다(먹통)`).toBe(0);
      expect(got, '연타 끝 도착 탭이 마지막으로 누른 탭이 아니다').toBe(expected);
    });

    test(`연타 ${gap}ms — 왕복(라이브↔GTO) 4회 뒤에도 마지막 탭에 있다`, async ({ page }) => {
      const pts = await tabPoints(page);
      await aimProbeAtTab(page, TAB_INDEX.live);
      await resetProbe(page);
      const seq: TabKey[] = ['live', 'tools', 'live', 'tools'];
      for (const t of seq) { await tap(page, pts, t); await page.waitForTimeout(gap); }
      await page.waitForTimeout(900);
      const got = await currentScreen(page);
      const probe = await readProbe(page);
      const lost = seq.length - probe.tabClicks;
      const expected = 'tab:tools';
      record({ id: `B-${gap}`, scenario: `탭 왕복 연타 ${gap}ms 4회`, expected, got, blockedMs: probe.blockedMs, lost, ok: got === expected && lost === 0 });
      expect(lost, `왕복 연타에서 ${lost}회가 먹혔다`).toBe(0);
      expect(got).toBe(expected);
    });
  }

  // ── ② 뒤로가기 도착 화면 — 탭 이동 이력을 되짚는다 ──────────────────────
  test('뒤로가기 1회 — 직전 탭으로 돌아간다(홈이 아니다)', async ({ page }) => {
    const pts = await tabPoints(page);
    await tap(page, pts, 'live'); await page.waitForTimeout(500);
    await tap(page, pts, 'community'); await page.waitForTimeout(700);
    await back(page);
    const got = await currentScreen(page);
    record({ id: 'C-1', scenario: '홈→라이브→커뮤니티 후 back', expected: 'tab:live', got, blockedMs: 0, lost: 0, ok: got === 'tab:live' });
    expect(got, '뒤로가기가 직전 탭(라이브)이 아니라 다른 곳으로 갔다').toBe('tab:live');
  });

  test('뒤로가기 연속 — 이력을 역순으로 되짚어 홈까지 온다', async ({ page }) => {
    const pts = await tabPoints(page);
    for (const t of ['live', 'community', 'tools'] as TabKey[]) { await tap(page, pts, t); await page.waitForTimeout(500); }
    await back(page);
    const s1 = await currentScreen(page);
    record({ id: 'C-2', scenario: '3단계 이동 후 back ①', expected: 'tab:community', got: s1, blockedMs: 0, lost: 0, ok: s1 === 'tab:community' });
    await back(page);
    const s2 = await currentScreen(page);
    record({ id: 'C-3', scenario: '3단계 이동 후 back ②', expected: 'tab:live', got: s2, blockedMs: 0, lost: 0, ok: s2 === 'tab:live' });
    await back(page);
    const s3 = await currentScreen(page);
    record({ id: 'C-4', scenario: '3단계 이동 후 back ③', expected: 'tab:home', got: s3, blockedMs: 0, lost: 0, ok: s3 === 'tab:home' });
    expect([s1, s2, s3]).toEqual(['tab:community', 'tab:live', 'tab:home']);
  });

  test('홈 탭을 직접 누르면 이력이 비워진다 — 되돌아온 뒤 다시 앞으로 갈 수 있다', async ({ page }) => {
    const pts = await tabPoints(page);
    for (const t of ['live', 'community'] as TabKey[]) { await tap(page, pts, t); await page.waitForTimeout(500); }
    await tap(page, pts, 'home'); await page.waitForTimeout(700);
    await tap(page, pts, 'tools'); await page.waitForTimeout(700);
    await back(page);
    const got = await currentScreen(page);
    record({ id: 'C-5', scenario: '홈 재진입 후 GTO → back', expected: 'tab:home', got, blockedMs: 0, lost: 0, ok: got === 'tab:home' });
    expect(got, '홈을 눌러 이력을 비운 뒤의 한 단계 이동이 제대로 되짚어지지 않았다').toBe('tab:home');
  });

  // ── ③ 오버레이 열고 즉시 뒤로가기 ──────────────────────────────────────
  // delay 0 은 '앱이 내비게이션을 커밋하기도 전' 이라 사람 손으로는 만들 수 없는 조건이다.
  // 그래도 표에 남긴다 — 이때 **홈으로 튀지만 않으면** 된다(오버레이 유지 또는 원래 화면).
  const overlays: { id: string; name: string; open: (p: import('@playwright/test').Page) => Promise<void> }[] = [
    { id: 'auth', name: '로그인 모달', open: async (p) => { await p.locator('button[aria-label="로그인"]').first().click(); } },
    { id: 'poster', name: '포스터 상세', open: async (p) => { await p.locator('[data-tab="home"] button:has-text("1000만 GTD")').first().click(); } },
    { id: 'venue', name: '매장 페이지', open: async (p) => { await p.locator('[data-tab="home"] button:has-text("로티아레나")').first().click(); } },
  ];

  for (const ov of overlays) {
    for (const delay of [0, 150, 400]) {
      test(`${ov.name} 열고 ${delay}ms 뒤 back — 열기 전 화면으로 정확히 돌아온다`, async ({ page }) => {
        const pts = await tabPoints(page);
        await tap(page, pts, 'live');
        await page.waitForTimeout(700);
        // 포스터·매장 오버레이는 홈 화면 카드에서만 열 수 있다 → 홈으로 돌아가 연다
        const needHome = ov.id === 'poster' || ov.id === 'venue';
        if (needHome) { await tap(page, pts, 'home'); await page.waitForTimeout(700); }
        const baseline = await currentScreen(page);
        await resetProbe(page);
        await ov.open(page);
        await page.waitForTimeout(delay);
        await back(page);
        await page.waitForTimeout(300);
        const got = await currentScreen(page);
        const probe = await readProbe(page);
        // 0ms 는 커밋 이전이라 '오버레이가 그대로 떠 있음' 도 정상(뒤로 갈 대상이 아직 없었다)
        const ok = got === baseline || (delay === 0 && got.startsWith('overlay:'));
        record({ id: `D-${ov.id}-${delay}`, scenario: `${ov.name} 열고 ${delay}ms 후 back`, expected: delay === 0 ? `${baseline}|overlay` : baseline, got, blockedMs: probe.blockedMs, lost: 0, ok });
        expect(ok, `${ov.name}를 닫았더니 열기 전 화면(${baseline})이 아니라 ${got} 로 갔다`).toBe(true);
      });
    }
  }

  // ── ④ 오버레이 위 오버레이 ─────────────────────────────────────────────
  test('오버레이 위 오버레이 — back 은 한 겹만 벗긴다', async ({ page }) => {
    await page.locator('[data-tab="home"] button:has-text("로티아레나")').first().click();
    await page.waitForTimeout(900);
    const venueScreen = await currentScreen(page);
    expect(venueScreen, '매장 페이지가 안 열렸다').toContain('매장 페이지');
    // 매장 페이지 안의 포스터를 눌러 상세를 겹쳐 연다(있을 때만)
    const inner = page.locator('[role="dialog"] button:has-text("GTD")').first();
    if (await inner.count()) {
      await inner.click();
      await page.waitForTimeout(800);
      const stacked = await currentScreen(page);
      if (stacked !== venueScreen) {
        await back(page);
        const got = await currentScreen(page);
        record({ id: 'E-1', scenario: '매장→포스터 겹쳐 열고 back', expected: venueScreen, got, blockedMs: 0, lost: 0, ok: got === venueScreen });
        expect(got, '겹친 오버레이에서 back 이 두 겹을 한꺼번에 닫았다').toBe(venueScreen);
      }
    }
    await back(page);
    const home = await currentScreen(page);
    record({ id: 'E-2', scenario: '매장 페이지에서 back', expected: 'tab:home', got: home, blockedMs: 0, lost: 0, ok: home === 'tab:home' });
    expect(home).toBe('tab:home');
  });

  // ── ⑤ 전환 중 다른 탭 클릭 ─────────────────────────────────────────────
  for (const mid of [30, 90, 160]) {
    test(`전환 시작 ${mid}ms 뒤 다른 탭 클릭 — 나중에 누른 탭에 도착한다`, async ({ page }) => {
      const pts = await tabPoints(page);
      await aimProbeAtTab(page, TAB_INDEX.tools);
      await resetProbe(page);
      await tap(page, pts, 'community');
      await page.waitForTimeout(mid);
      await tap(page, pts, 'tools');
      await page.waitForTimeout(1200);
      const got = await currentScreen(page);
      const probe = await readProbe(page);
      const lost = 2 - probe.tabClicks;
      record({ id: `F-${mid}`, scenario: `전환 중(${mid}ms) 다른 탭 클릭`, expected: 'tab:tools', got, blockedMs: probe.blockedMs, lost, ok: got === 'tab:tools' && lost === 0 });
      expect(lost, `전환 중 클릭 ${lost}회가 스냅샷에 먹혀 아무 데도 닿지 않았다`).toBe(0);
      expect(got, '전환 중 클릭이 무시됐다(먹통) — 첫 탭에 그대로 남았다').toBe('tab:tools');
    });
  }

  // ── ⑥ 오버레이를 ESC 로 닫은 직후의 뒤로가기(예전 가드가 삼키던 구간) ────
  test('오버레이 ESC 로 닫고 즉시 back — 죽은 입력 없이 직전 탭으로', async ({ page }) => {
    const pts = await tabPoints(page);
    await tap(page, pts, 'live'); await page.waitForTimeout(500);
    await tap(page, pts, 'community'); await page.waitForTimeout(700);
    await page.locator('button[aria-label="로그인"]').first().click();
    await expect(page.locator('[role="dialog"]').filter({ has: page.locator('input[type="email"]') })).toHaveCount(1, { timeout: 10_000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200); // 예전 가드(600ms) 창 안에서 back — 이 입력이 통째로 죽었다
    await back(page);
    const got = await currentScreen(page);
    record({ id: 'G-1', scenario: '로그인 ESC 닫고 200ms 뒤 back', expected: 'tab:live', got, blockedMs: 0, lost: 0, ok: got === 'tab:live' });
    expect(got, '오버레이를 닫은 직후의 뒤로가기가 죽었거나 엉뚱한 곳으로 갔다').toBe('tab:live');
  });

  // ── ⑦ 뒤로가기 연타 ────────────────────────────────────────────────────
  test('뒤로가기 연타 — 이력만큼만 되짚고 앱을 벗어나지 않는다', async ({ page }) => {
    const pts = await tabPoints(page);
    for (const t of ['live', 'community'] as TabKey[]) { await tap(page, pts, t); await page.waitForTimeout(450); }
    await page.evaluate(() => { window.history.back(); window.history.back(); });
    await page.waitForTimeout(900);
    const got = await currentScreen(page);
    record({ id: 'H-1', scenario: '뒤로가기 2연타', expected: 'tab:home', got, blockedMs: 0, lost: 0, ok: got === 'tab:home' });
    await expect(page.locator('#root')).not.toBeEmpty();
    expect(got).toBe('tab:home');
  });

  // ── ⑦-b 숨은(프리마운트) 탭이 뒤로가기를 삼키지 않는다 ────────────────────
  // 이 앱은 idle 에 커뮤니티·라이브·GTO 탭을 **화면에 보이지 않는 채** 미리 마운트한다.
  // 그때 숨은 탭이 뒤로가기 겹을 등록해 버리면, 사용자가 뒤로가기를 눌러도 화면은 그대로인 채
  // 입력만 소진된다 — 실제로 커뮤니티 탭이 그랬다(진입 섹션은 'venues' 인데 기준이 'board' 라
  // 마운트 즉시 조건이 참). 부팅 ~10초 뒤부터 모든 사용자에게 '죽은 뒤로가기' 가 하나 깔려 있었다.
  test('프리마운트된 숨은 탭이 뒤로가기 겹을 들지 않는다', async ({ page }) => {
    test.setTimeout(90_000);
    // 홈에 가만히 있는다 — 아무것도 열지 않았으니 뒤로가기 겹은 0이어야 한다.
    expect(await currentScreen(page)).toBe('tab:home');
    // 숨은 프리마운트가 끝날 때까지 기다린다(커뮤니티 pane 이 DOM 에 생기면 완료)
    await page.waitForSelector('[data-tab="community"]', { state: 'attached', timeout: 60_000 });
    await page.waitForTimeout(1_500); // 프리마운트 이펙트가 모두 정착할 시간
    // 겹이 하나라도 등록됐다면 history 현재 항목에 __layer 토큰이 찍힌다.
    // ⚠ 이걸 '뒤로가기를 눌러 본다' 로 검사하면 안 된다 — 정상일 때는 그 back 이 앱을 벗어나
    //   페이지가 닫히고, 그러면 테스트가 '실패' 가 아니라 '죽는다'.
    const layer = await page.evaluate(() => {
      const st = history.state as { __layer?: number } | null;
      return st && typeof st.__layer === 'number' ? st.__layer : 0;
    });
    const got = layer === 0 ? '겹 0' : `겹 ${layer}`;
    record({ id: 'J-1', scenario: '홈에서 숨은 탭 프리마운트 완료 후', expected: '겹 0', got, blockedMs: 0, lost: 0, ok: layer === 0 });
    expect(layer, '보이지도 않는 탭이 뒤로가기 겹을 들고 있다 — 사용자의 다음 뒤로가기가 화면 변화 없이 통째로 죽는다')
      .toBe(0);
    // 화면은 그대로여야 한다(프리마운트가 보이는 탭을 바꾸지 않는다)
    expect(await currentScreen(page)).toBe('tab:home');
  });

  // ── ⑧ 오버레이가 떠 있을 때 탭 이동 → 뒤로가기 ─────────────────────────
  test('매장 페이지를 연 채 다른 탭으로 이동한 뒤 back — 유령 항목 없이 직전 탭으로', async ({ page }) => {
    const pts = await tabPoints(page);
    await tap(page, pts, 'live'); await page.waitForTimeout(600);
    await tap(page, pts, 'home'); await page.waitForTimeout(600);
    await page.locator('[data-tab="home"] button:has-text("로티아레나")').first().click();
    await page.waitForTimeout(900);
    expect(await currentScreen(page), '매장 페이지가 안 열렸다').toContain('매장 페이지');
    await tap(page, pts, 'community'); // 탭 이동 = 오버레이 닫힘 + 탭 전환
    await page.waitForTimeout(900);
    expect(await currentScreen(page)).toBe('tab:community');
    await back(page);
    const got = await currentScreen(page);
    record({ id: 'I-1', scenario: '매장 연 채 탭 이동 후 back', expected: 'tab:home', got, blockedMs: 0, lost: 0, ok: got === 'tab:home' });
    expect(got, '닫힌 오버레이가 유령 history 항목을 남겨 뒤로가기가 헛돌았다').toBe('tab:home');
  });
});
