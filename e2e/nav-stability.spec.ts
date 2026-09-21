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
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack } from './_session';
import { installNavProbe, aimProbeAtTab, resetProbe, readProbe, currentScreen } from './_navprobe';
import { mockSchedules } from './_schedules';

// 특정 매장 이름에 의존하지 않고 매장 페이지를 연다 — 커뮤니티 '홀덤펍' 목록의 첫 카드를
  // 누른다(딥링크는 공개 매장 목록에서만 대상을 찾으므로 비공개 E2E 매장으로는 열리지 않는다).
  // 매장이 하나도 없으면 이 검사는 성립하지 않으므로 호출부가 skip 한다.
  const openVenue = async (p: import('@playwright/test').Page): Promise<boolean> => {
    // 특정 매장 이름에 의존하지 않는다 — 커뮤니티 '홀덤펍' 목록의 첫 카드를 누른다.
    // 🔴 2026-09-21 — 예전엔 전체를 try/catch 로 감싸 **어떤 단계가 막혀도 false** 를 돌렸다.
    //   그러면 셀렉터가 낡아도 호출부가 '공개 매장이 없다' 며 데이터 탓을 하고 조용히 skip 한다.
    //   이 저장소가 제일 자주 밟는 함정이다(`if (!count) return` 부류 — docs/HANDOFF.md §0-a22).
    //   → **경로가 살아 있는지는 단언으로 잠그고**, '매장 수 0' 만 false 로 돌린다.
    //   셀렉터도 라벨('홀덤펍') 대신 data-testid 로 좁힌다 — '홀덤펍' 은 **섹션 탭과 분류 칩**
    //   두 곳에 있어 .first() 가 엉뚱한 것을 누를 수 있다(CommunityTab.tsx:372 · :1153).
    const nav = p.getByRole('navigation', { name: '하단 내비게이션' });
    await nav.getByRole('button', { name: '커뮤니티', exact: true }).click({ timeout: 10_000 });
    const tab = p.getByTestId('sec-tab-venues');
    await expect(tab, "커뮤니티 '홀덤펍' 섹션 탭이 없다 — data-testid=sec-tab-venues 가 사라졌다")
      .toBeVisible({ timeout: 15_000 });
    await tab.click();
    const sec = p.locator('[data-sec="venues"]');
    await expect(sec, "'홀덤펍' 섹션이 안 열렸다 — 탭을 눌렀는데 판이 안 바뀌었다").toBeVisible({ timeout: 15_000 });
    // 여기까지 왔으면 경로는 살아 있다. 이제만 '매장 0곳' 을 데이터 조건으로 인정한다.
    // 🔴 `sec.locator('button')` 은 쓰면 안 된다 — 이 섹션 맨 위에 분류 칩 5개
    //   (전체·홀덤펍·딜러팀·동호회·유튜버, 44×47px)가 있어 .first() 가 '전체' 칩을 누른다.
    //   2026-09-21 실측: 공개 매장은 3곳이나 있었는데, 칩을 누르니 매장 페이지가 안 열리고
    //   옛 코드의 catch 가 false 를 돌려 **'공개 매장이 없다'로 위장**됐다. 게이트 2개가 그렇게 잠들었다.
    const cards = sec.getByTestId('venue-card');
    if ((await cards.count()) === 0) return false;
    await cards.first().click({ timeout: 10_000 });
    await expect(p.locator('[role="dialog"][aria-label*="매장 페이지"]'),
      '매장 카드를 눌렀는데 매장 페이지가 안 열렸다').toHaveCount(1, { timeout: 15_000 });
    return true;
  };


type Row = { id: string; scenario: string; expected: string; got: string; blockedMs: number; lost: number; ok: boolean };

// 5번째 칸은 2026-09-04 오너 지시로 '내 정보' → '캘린더' 로 바뀌었다(내 정보는 헤더 아바타가 유일 진입점).
// 인덱스 4는 그대로 — 칸 수 5도 그대로다.
const TAB_INDEX = { home: 0, live: 1, community: 2, tools: 3, calendar: 4 } as const;
type TabKey = keyof typeof TAB_INDEX;

test.describe('내비게이션 안정성 — 입력 유실 0 · 뒤로가기 도착 100%', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // 포스터 상세 케이스가 라이브 일정 0건으로 skip 되던 것을 막는다(2026-09-21).
    // 🔴 **포스터 케이스에만 건다.** 파일 전체에 걸었더니 홈이 카드를 그리느라 렌더 부담이 늘어
    //   시간에 민감한 검사가 러너 부하에서 흔들렸다 — 실측(2026-09-21):
    //   '로그인 모달 열고 0ms 뒤 back' 이 **전체 실행에서만 두 번** 떨어졌고,
    //   단독 5회 반복은 5/5 통과했다. 로그인·매장 케이스는 일정이 필요 없다.
    if (/포스터/.test(testInfo.title)) await mockSchedules(page);
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
    // 홈 일정 목록의 첫 카드(ScheduleCard ListCard = article.cv-card-list). 예전엔 하드코딩 포스터('1000만 GTD')를
    // 눌렀는데 2026-09-10 런칭 정리로 그 포스터·일정이 사라졌다 — 일정이 0건이면 아래에서 skip 한다.
    // 정중앙 클릭은 카드 높이가 바뀌면 중첩 버튼(매장) 위로 옮겨간다 — 제목으로 좁힌다(2026-09-17).
    { id: 'poster', name: '포스터 상세', open: async (p) => { await p.locator('[data-tab="home"] article.cv-card-list').first().getByRole('heading').click(); } },
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
        if (ov.id === 'poster') {
          // 예전엔 0건이면 test.skip 이었다 — 라이브 일정이 비면 이 게이트가 조용히 꺼졌다(2026-09-21).
          //   beforeEach 의 mockSchedules 가 카드를 보장하므로 0건은 이제 **결함**이다.
          // 🔴 고정 시점 count 는 경합이다(카드는 일정 조회 후에 붙는다) — 나타날 때까지 기다린다.
          await expect(page.locator('[data-tab="home"] article.cv-card-list').first(),
            '홈에 일정 카드가 0건 — 목킹이 안 먹혔거나 홈 목록 렌더가 깨졌다').toBeVisible({ timeout: 15_000 });
        }
        const baseline = await currentScreen(page);
        await resetProbe(page);
        // 뒤로가기 겹의 현재 깊이 — 오버레이가 '커밋'됐는지 판정하는 유일한 사실이다(backstack.ts __layer).
        const baseLayer = await page.evaluate(() => {
          const st = history.state as { __layer?: number } | null;
          return st && typeof st.__layer === 'number' ? st.__layer : 0;
        });
        await ov.open(page);
        // ⚠ delay 를 '커밋까지 걸리는 시간'으로 대신 쓰면 안 된다(2026-09-10 CI 2회 연속 실패).
        //   GitHub 러너는 로컬보다 느려 150ms 안에 pushState 가 끝나지 않는다 → 150ms 케이스가
        //   0ms 케이스와 같아져 '아직 뒤로 갈 대상이 없는데 back' 이 되고, 한 겹 아래로 내려가
        //   열기 전 화면이 아닌 곳에 도착한다. 이건 제품 결함이 아니라 계측 오류다.
        //   그래서 delay>0 은 **커밋을 관측한 뒤** 그만큼 더 기다린다 — 잠그려는 계약
        //   ('커밋된 뒤 back 은 정확히 열기 전 화면')은 그대로 두고 경주만 없앤다.
        //   delay===0 은 의도적으로 커밋 이전을 노리는 케이스라 기다리지 않는다.
        if (delay > 0) {
          await page.waitForFunction((b) => {
            const st = history.state as { __layer?: number } | null;
            return !!st && typeof st.__layer === 'number' && st.__layer > b;
          }, baseLayer, { timeout: 5000 }).catch(() => { /* 겹을 안 쌓는 오버레이면 아래 delay 로만 간다 */ });
        }
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
    const opened = await openVenue(page);
    test.skip(!opened, '공개 매장이 없어 이 검사는 성립하지 않는다(데이터 조건부)');
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
    const afterBack = await currentScreen(page);
    // 🔴 2026-09-21 — 예전 기대값은 'tab:home' 이었고 변수 이름도 `home` 이었다. **틀렸다.**
    //   openVenue 는 홈 → **커뮤니티** → 매장 페이지로 들어간다. 한 겹만 벗기면 커뮤니티다.
    //   'tab:home' 을 기대하는 것은 back 이 두 겹을 닫으라는 뜻이라 **이 테스트 제목과 정면으로 모순**이었다.
    //   이 검사는 셀렉터 문제로 계속 skip 돼 있어 그 모순이 드러난 적이 없었다(§0-a22).
    record({ id: 'E-2', scenario: '매장 페이지에서 back', expected: 'tab:community', got: afterBack, blockedMs: 0, lost: 0, ok: afterBack === 'tab:community' });
    expect(afterBack, 'back 이 매장 페이지 한 겹만 벗기지 않았다 — 들어온 커뮤니티로 돌아와야 한다').toBe('tab:community');
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
    // 🔴 2026-09-21 — **이 시나리오는 지금 제품에서 성립하지 않는다.** 측정으로 확인했다:
    //   ① openVenue 는 **커뮤니티 탭을 거쳐** 매장 페이지로 들어간다. 그래서 여기서 '커뮤니티' 로
    //      가는 것은 '다른 탭' 이 아니다(이 검사가 쓰였을 땐 홈에서 바로 열었다).
    //   ② 매장 페이지는 `[0,0,412,839]` **전체 화면 다이얼로그라 하단 탭바를 덮는다.**
    //      탭바 중심(206,805)의 elementFromPoint 가 다이얼로그 안의 SECTION 이다
    //      — nav 의 z-index 50 이 dialog 40 보다 큰데도 그렇다(z-index 는 같은 쌓임 맥락에서만 겨룬다).
    //      즉 `tap()` 의 좌표 누름이 탭바에 **닿지 않는다.**
    //   그동안 이 모순이 안 드러난 이유는 openVenue 의 셀렉터 결함으로 **계속 skip** 돼 있었기 때문이다.
    //   ⚠ 기대값만 고쳐 초록으로 만들면 '유령 history 항목' 이라는 **잡으려던 결함을 안 잡는 검사**가 된다.
    //      시나리오를 다시 설계해야 한다 — docs/HANDOFF.md §0-a22 의 오너 결정 대기 항목.
    test.fixme(true, '시나리오가 낡았다 — 탭바가 매장 오버레이에 덮여 좌표 누름이 닿지 않는다(측정 첨부)');
    const pts = await tabPoints(page);
    await tap(page, pts, 'live'); await page.waitForTimeout(600);
    await tap(page, pts, 'home'); await page.waitForTimeout(600);
    const opened = await openVenue(page);
    test.skip(!opened, '공개 매장이 없어 이 검사는 성립하지 않는다(데이터 조건부)');
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

// ── H1(2026-09-20 오너 사진): 스크롤된 대메뉴에서 다른 대메뉴로 가면 헤더가 눌렸다 펴진다 ──────
//
// 🔴 원인(390×844 실측): `App.tsx` 의 탭 커밋 `useLayoutEffect` 는 `scrollTo(0)` 을 **즉시** 부르는데,
//   헤더의 `shrunk` 는 `src/lib/useScrollY.ts` 의 **다음 rAF 방송**을 기다린다.
//   전환 직전 scrollY≈387·헤더 47.75px → 첫 새 화면 rAF 에서 scrollY=0 인데 높이가 **47.75px 로 남고**
//   → 다음 rAF 에 60.5px. `--header-now` 는 그보다 또 한 프레임 늦었다(일반 useEffect 였다).
//
// ⚠ 이 검사는 **클릭 전에** 프레임 기록기를 설치한다. Playwright `click()` 이 반환한 뒤에 만들면
//   문제의 **첫 프레임을 놓친다** — 그게 이 버그가 오래 안 잡힌 이유다.
// ⚠ 단순 '전환 끝나고 500ms 뒤' 검사는 이 버그를 못 잡는다. 최종 상태는 원래 정상이다.
test.describe('H1 — 스크롤된 대메뉴 전환에서 헤더가 첫 프레임부터 펴져 있다', () => {
  for (const to of ['live', 'community'] as const) {
    test(`🔴 홈(스크롤됨) → ${to}: 첫 새 프레임부터 헤더가 축소 상태가 아니다`, async ({ page }) => {
      test.setTimeout(120_000);
      await stabilizeBackstack(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await page.waitForSelector('[data-stack-header]', { timeout: 20_000 });

      // keep-alive 경로를 만든다 — 전환 연출은 **이미 방문한 탭**으로 갈 때 돈다.
      for (const t of [to, 'home']) {
        await page.evaluate((x) => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: x })), t);
        await page.waitForTimeout(700);
      }
      // 홈을 충분히 내려 헤더를 접는다.
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(600);

      const before = await page.evaluate(() => ({
        y: Math.round(window.scrollY),
        h: +(document.querySelector('[data-stack-header]') as HTMLElement).getBoundingClientRect().height.toFixed(2),
        shrunk: document.documentElement.dataset.headerShrunk ?? null,
        now: getComputedStyle(document.documentElement).getPropertyValue('--header-now').trim(),
      }));
      // 전제 — 실제 결함 경로를 탔는지 못박는다. 안 접혔으면 이 검사는 아무것도 재지 않는다.
      expect(before.y, '헤더가 접힐 만큼 안 내려갔다 — 이 검사가 결함 경로를 못 탔다').toBeGreaterThan(56);
      expect(before.shrunk, '스크롤했는데 헤더가 축소 상태가 아니다 — 전제가 안 섰다').toBe('1');

      // 🔴 클릭 **전에** 기록기를 설치한다.
      const frames = await page.evaluate(async (tab) => {
        const out: { i: number; y: number; h: number; shrunk: string | null; now: string }[] = [];
        let n = 0;
        const snap = () => {
          const el = document.querySelector('[data-stack-header]') as HTMLElement | null;
          out.push({
            i: n,
            y: Math.round(window.scrollY),
            h: el ? +el.getBoundingClientRect().height.toFixed(2) : -1,
            shrunk: document.documentElement.dataset.headerShrunk ?? null,
            now: getComputedStyle(document.documentElement).getPropertyValue('--header-now').trim(),
          });
        };
        const tick = () => { snap(); if (++n < 14) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: tab }));
        await new Promise((r) => setTimeout(r, 900));
        return out;
      }, to);

      console.log(`[H1 ${to}] 전:`, JSON.stringify(before));
      console.log(`[H1 ${to}] 프레임:`, JSON.stringify(frames.slice(0, 6)));

      // 스크롤이 0으로 간 뒤의 프레임은 **전부** 펴진 상태여야 한다.
      const afterScrollZero = frames.filter((f) => f.y === 0);
      expect(afterScrollZero.length, 'scrollY가 0이 된 프레임이 없다 — scrollTo(0) 이 안 돌았다').toBeGreaterThan(0);
      const bad = afterScrollZero.filter((f) => f.shrunk === '1' || (f.h > 0 && f.h < before.h + 1));
      expect(bad,
        `scrollY=0 인데 헤더가 아직 축소 상태인 프레임이 ${bad.length}개다 — 이게 "눌렸다 펴짐" 으로 보인다: ${JSON.stringify(bad.slice(0, 3))}`)
        .toEqual([]);

      // `--header-now` 도 같은 프레임에서 따라와야 한다(서브바가 헤더와 같은 높이를 본다).
      const nowMismatch = afterScrollZero.filter((f) => f.now === before.now && before.now !== '');
      expect(nowMismatch,
        `--header-now 가 축소 값(${before.now}) 그대로인 프레임이 있다 — 서브바가 헤더와 다른 높이를 본다`)
        .toEqual([]);
    });
  }

  test('🔴 빠른 연속 탭에도 옛 스크롤 값이 헤더를 다시 접지 않는다', async ({ page }) => {
    test.setTimeout(120_000);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('[data-stack-header]', { timeout: 20_000 });
    for (const t of ['live', 'community', 'home']) {
      await page.evaluate((x) => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: x })), t);
      await page.waitForTimeout(600);
    }
    let shrunkSeen = 0;
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(250);
      const tab = i % 2 === 0 ? 'live' : 'home';
      const after = await page.evaluate(async (t) => {
        window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: t }));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { y: Math.round(window.scrollY), shrunk: document.documentElement.dataset.headerShrunk ?? null };
      }, tab);
      if (after.y === 0 && after.shrunk === '1') shrunkSeen += 1;
    }
    expect(shrunkSeen, `연속 탭 6회 중 ${shrunkSeen}회에서 scrollY=0 인데 헤더가 접혀 있었다 — 예약된 옛 rAF 가 살아 있다`).toBe(0);
  });

  // 🔴 H1 반례(실행문이 지정한 것) — **브라우저 뒤로가기**로 탭이 바뀌는 경로.
  //   버튼 클릭과 달리 뒤로가기는 popstate 로 `activeTab` 을 바꾼다. 같은 커밋 이펙트를 타므로
  //   구조상 함께 고쳐지지만, "구조상 그럴 것" 은 증거가 아니다 — 실제로 프레임을 재서 못박는다.
  //   (오너가 실제로 쓰는 경로이기도 하다: 라이브를 읽다가 뒤로가기로 홈에 돌아온다.)
  test('🔴 브라우저 뒤로가기로 탭이 바뀔 때도 첫 프레임부터 헤더가 펴져 있다', async ({ page }) => {
    test.setTimeout(120_000);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('[data-stack-header]', { timeout: 20_000 });

    // 🔴 2026-09-21 — 여기는 원래 **라이브 탭 고정**이었는데, 라이브 탭 길이는 그때그때의
    //   **운영 데이터**(진행 중인 클락 수)가 정한다. 실측: 라이브 최대 스크롤 **55px** 인데
    //   아래 전제는 56 초과를 요구한다 — **1px 차이로** 코드 변경 0 인데 빨개졌다
    //   (CLAUDE.md: "코드를 안 바꿨는데 빨개지면 회귀보다 운영 데이터 변경을 먼저 의심하라").
    //   → 탭을 **고정하지 않고**, 헤더를 실제로 접을 수 있는 첫 탭을 골라 그 경로를 검사한다.
    //   ⚠ 느슨하게 푼 것이 아니다: **어느 탭도 전제를 못 세우면 아래에서 크게 실패**한다.
    //     조용히 skip 하면 이 검사는 그날부터 아무것도 재지 않는다.
    const CANDS = ['tools', 'browse', 'home', 'community', 'live'] as const;
    const tried: string[] = [];
    let before: { y: number; h: number; shrunk: string | null; tab: string | null } | null = null;
    for (const t of CANDS) {
      await page.goto('/');
      await page.waitForSelector('[data-stack-header]', { timeout: 20_000 });
      // 홈 → 대상 탭(이력 1칸). 돌아갈 곳이 있어야 뒤로가기가 탭 전환이 된다.
      await page.evaluate((tab) => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: tab })), t);
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(600);
      const m = await page.evaluate(() => ({
        y: Math.round(window.scrollY),
        h: +(document.querySelector('[data-stack-header]') as HTMLElement).getBoundingClientRect().height.toFixed(2),
        shrunk: document.documentElement.dataset.headerShrunk ?? null,
        tab: document.querySelector('[data-tab]')?.getAttribute('data-tab') ?? null,
      }));
      tried.push(`${t}: y=${m.y} shrunk=${m.shrunk}`);
      // ⚠ `m.tab` 은 `[data-tab]` **첫 요소**라 keep-alive 로 살아 있는 홈 판을 집는다 — 활성 탭이 아니다.
      //   고른 탭 이름은 루프 변수 `t` 로 적는다(로그가 거짓말하면 다음 사람이 엉뚱한 탭을 본다).
      if (m.y > 56 && m.shrunk === '1') { before = { ...m, tab: t }; break; }
    }
    // 전제 — 하나도 못 세우면 이 검사는 아무것도 재지 않는다. 그럴 땐 **크게 실패**한다.
    expect(before, `어느 탭에서도 헤더를 접을 만큼 스크롤하지 못했다 — 결함 경로를 못 탄다: ${tried.join(' | ')}`).not.toBeNull();
    console.log('[H1 back] 고른 탭:', before!.tab, '| 후보 실측:', tried.join(' | '));

    const frames = await page.evaluate(async () => {
      const out: { i: number; y: number; h: number; shrunk: string | null }[] = [];
      let n = 0;
      const tick = () => {
        const el = document.querySelector('[data-stack-header]') as HTMLElement | null;
        out.push({
          i: n, y: Math.round(window.scrollY),
          h: el ? +el.getBoundingClientRect().height.toFixed(2) : -1,
          shrunk: document.documentElement.dataset.headerShrunk ?? null,
        });
        if (++n < 14) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      history.back();
      await new Promise((r) => setTimeout(r, 1200));
      return out;
    });
    console.log('[H1 back] 전:', JSON.stringify(before), '프레임:', JSON.stringify(frames.slice(0, 6)));

    const zero = frames.filter((f) => f.y === 0);
    expect(zero.length, '뒤로가기 뒤 scrollY 가 0 이 된 프레임이 없다 — 탭 전환 자체가 안 일어났다').toBeGreaterThan(0);
    const bad = zero.filter((f) => f.shrunk === '1' || (f.h > 0 && f.h < before!.h + 1));
    expect(bad,
      `뒤로가기 뒤 scrollY=0 인데 헤더가 아직 축소 상태인 프레임이 ${bad.length}개다: ${JSON.stringify(bad.slice(0, 3))}`)
      .toEqual([]);
  });
});
