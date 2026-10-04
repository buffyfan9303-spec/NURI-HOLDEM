// 셸 작은 화면 튐(B2 · 2026-10-02) — 알림 창 Esc·끌기/휠 새어 나감, 내 정보 다시 열기 미끄러짐, 보안 탭 첫 진입 밀림,
//   관리자 '노출 관리' 재진입 스켈레톤.
//
// 원문: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\PLAN-1002c-remaining.md#B2 · audit-motion-1002.md(M-1·M-3·M-4·M-5)
//   · review-motion-revisit-1002.md '남은 것' 1·3(카드 머리줄 끌기 172px · Escape 로 안 닫힘).
// 음성 대조(2026-10-02): origin/main f51e78c7 빌드 7건 FAIL(머리줄 끌기 Δ172/357 · 스크림 휠 Δ384 · Esc 안 닫힘 ×2 ·
//   다시 열기 1810→1490 · 보안 칸 240→524 · 노출 관리 스켈레톤 20프레임) → 이 브랜치 8건 PASS. '목록 스크롤은 그대로' 는 과잉 차단 방지 가드라 양쪽 PASS.
// 순위 보드 클램프(M-2)는 여기 없다(미수정 · 설계상 허용 부류). 감사의 −111px 은 화면 밖(문서 600) 레일을 el.click() 으로
//   눌러 생긴 값이다(실제 손가락으로 도달 불가). 다만 손가락으로도 0px 은 아니다 — 독립 검토(review-shell-b2-1002 ⑥) 실측:
//   레일이 다 보이는 자리(scrollY 123)는 15쌍 모두 0, 레일 절반이 서브탭 바에 가린 자리에서 '순위 인증'으로 가면 13~19px 이
//   한 번 클램프된다(기준 빌드 f51e78c7 도 같은 값 — 이 브랜치와 무관). 짧은 탭의 데이터가 줄면 이 값은 커진다.
// 손가락 조건: 모바일 끌기·누름은 CDP Input.dispatchTouchEvent(Playwright click/tap 은 누름 0ms 라 실제 손가락과 다르다).
// 운영 쓰기 0 — 세션은 stubLogin(로컬), 이 스펙이 읽는 데이터는 page.route 로 준다(_fixtures 가드가 나머지 쓰기를 끊는다).
import type { Page, CDPSession } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function bootNotif(page: Page, w: number, nNotif: number) {
  await page.setViewportSize({ width: w, height: w < 768 ? 844 : 900 });
  const uid = await stubLogin(page);
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/notifications\?/, (r) => r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(
    Array.from({ length: nNotif }, (_, i) => ({
      id: `n${i}`, user_id: uid, type: 'system', title: `알림 제목 ${i}`, message: `알림 본문 ${i}`,
      read: true, created_at: new Date(Date.now() - i * 3600e3).toISOString(), link: '/x',
    })))));
  await page.route(/\/rest\/v1\/user_messages/, (r) => r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json([])));
  await page.goto('/?tab=home');
  const bell = page.locator('button[aria-label^="알림"]');
  await expect(bell).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await bell.evaluate((e: HTMLElement) => e.click());
  await expect(page.getByRole('dialog', { name: '알림' })).toBeVisible();
  await page.waitForTimeout(700);
}

async function drag(cdp: CDPSession, x: number, y0: number, dy: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (dy * i) / 12 }] });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 600));
}
const sy = (page: Page) => page.evaluate(() => Math.round(scrollY));

test.describe('B2 알림 창', () => {
  for (const w of [390, 1440]) {
    test(`Escape 로 닫힌다 ${w}`, async ({ page }) => {
      await bootNotif(page, w, 3);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: '알림' }), 'Escape 를 눌러도 알림 창이 그대로다').toHaveCount(0, { timeout: 2_000 });
    });
  }

  test('카드 머리줄(쪽지/알림 탭 줄)을 끌어도 뒤 화면이 안 굴러간다 390', async ({ page }) => {
    await bootNotif(page, 390, 3);
    // 뒤 문서 길이는 운영 데이터·문구 길이에 따라 바뀐다(10-03 설명 축약으로 400 밑으로 내려감) — 측정 전제(뒤가 굴러갈 수 있음)는 내용과 무관하게 고정한다.
    await page.evaluate(() => { const s = document.createElement('div'); s.setAttribute('data-testid', 'b2-test-spacer'); s.style.height = '1600px'; document.body.appendChild(s); });
    const doc = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    expect(doc, '뒤 문서가 스크롤될 만큼 길지 않다 — 측정이 공허하다').toBeGreaterThan(400);
    const hdr = (await page.getByRole('dialog', { name: '알림' }).locator('header').boundingBox())!;
    expect(hdr, '카드 머리줄을 못 찾았다').not.toBeNull();
    const cdp = await page.context().newCDPSession(page);
    const y0 = await sy(page);
    await drag(cdp, hdr.x + 30, hdr.y + hdr.height / 2 + 2, -200);
    const up = await sy(page) - y0;
    await drag(cdp, hdr.x + hdr.width - 30, hdr.y + hdr.height / 2 + 2, -200); // 오른쪽(모두 읽음·필터 줄) 위
    const right = await sy(page) - y0;
    console.log(`[b2-notif-drag] header-left Δ${up} · header-right Δ${right}`);
    expect([up, right], '머리줄을 끈 만큼 뒤 화면이 굴러갔다').toEqual([0, 0]);
    await expect(page.getByRole('dialog', { name: '알림' }), '끌기가 창을 닫았다').toBeVisible();
  });

  test('패널 아래 어두운 막(스크림) 위 휠 · 머리줄 위 휠이 뒤 화면을 굴리지 않는다 390', async ({ page }) => {
    await bootNotif(page, 390, 2);
    const card = (await page.getByRole('dialog', { name: '알림' }).boundingBox())!;
    expect(844 - card.y - card.height, '카드 아래 스크림 자리가 없다 — 측정이 공허하다').toBeGreaterThan(150);
    const y0 = await sy(page);
    await page.mouse.move(195, card.y + card.height + 80);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 300);
    await page.waitForTimeout(500);
    const scrim = await sy(page) - y0;
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })); // 앞 측정이 문서 끝까지 굴렸어도 다시 잴 수 있게
    await page.waitForTimeout(300);
    const y1 = await sy(page);
    const hdr = (await page.getByRole('dialog', { name: '알림' }).locator('header').boundingBox())!;
    await page.mouse.move(hdr.x + 30, hdr.y + hdr.height / 2);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 300);
    await page.waitForTimeout(500);
    const head = await sy(page) - y1;
    console.log(`[b2-notif-wheel] scrim Δ${scrim} · header Δ${head}`);
    expect([scrim, head], '휠이 알림 창 뒤 화면으로 새어 나갔다').toEqual([0, 0]);
  });

  // B2 후속(독립 검토 ① 관찰): 새 쪽지 검색칸에 글이 있는 채 Esc → 창째 닫혀 입력이 사라졌다. 첫 Esc 는 칸만 벗어난다.
  test('글을 쓰던 칸에서 Esc 는 창을 닫지 않고 칸만 벗어난다(두 번째 Esc 에 닫힌다) 390', async ({ page }) => {
    await page.route(/\/rest\/v1\/rpc\//, (r) => r.fulfill(json([]))); // 닉네임 검색 — 운영으로 안 보낸다
    await bootNotif(page, 390, 3);
    const dlg = page.getByRole('dialog', { name: '알림' });
    await dlg.locator('button', { hasText: /^쪽지$/ }).first().click();
    await dlg.locator('button', { hasText: '새 쪽지' }).click();
    const inp = dlg.getByRole('textbox', { name: '받는 사람 닉네임 검색' });
    await inp.fill('검색어');
    await expect(inp, '검색칸에 포커스가 없다 — 측정이 공허하다').toBeFocused();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await expect(dlg, '입력 중 Esc 가 창을 닫아 쓰던 글이 사라졌다').toBeVisible();
    await expect(inp).toHaveValue('검색어');
    await expect(inp, '첫 Esc 뒤에도 칸에 머문다').not.toBeFocused();
    // M4-03(audit4-motion-1004): 하위 화면(새 쪽지·대화)은 뒤로가기·Esc 한 번에 한 단계다 — 칸을 벗어난 뒤 Esc 는 쪽지 목록, 그다음 Esc 가 창을 닫는다.
    await page.keyboard.press('Escape');
    await expect(dlg.locator('button', { hasText: '새 쪽지' }), '칸을 벗어난 뒤의 Esc 는 쪽지 목록으로 한 단계 돌아가야 한다').toBeVisible({ timeout: 2_000 });
    await page.keyboard.press('Escape');
    await expect(dlg, '목록에서 Esc 는 창을 닫아야 한다').toHaveCount(0, { timeout: 2_000 });
  });

  test('목록 스크롤은 그대로 된다(끌기 막음이 목록까지 막지 않는다) 390', async ({ page }) => {
    await bootNotif(page, 390, 30);
    const list = page.getByRole('dialog', { name: '알림' }).locator('[data-notif-panel]');
    const box = (await list.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await drag(cdp, box.x + box.width / 2, box.y + box.height - 20, -(box.height - 60));
    const st = await list.evaluate((e) => Math.round(e.scrollTop));
    expect(st, '목록 위 끌기로 목록이 안 굴러간다').toBeGreaterThan(100);
  });
});

// ── 내 정보(390) — 다시 열기 · 보안 탭 첫 진입 ──────────────────────────────────
const clickBy = (page: Page, re: string) => page.evaluate((r) => {
  const b = [...document.querySelectorAll<HTMLElement>('button')].find((e) => (e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
    && new RegExp(r).test(e.getAttribute('aria-label') || (e.textContent || '').trim()));
  if (!b) return false; b.click(); return true;
}, re);
async function openMe(page: Page) {
  expect(await clickBy(page, '검증계정 메뉴'), '계정 메뉴를 못 찾았다').toBe(true);
  await page.waitForTimeout(400);
  expect(await clickBy(page, '^내 정보 열기'), '내 정보 열기를 못 찾았다').toBe(true);
  await expect(page.locator('[data-profile-panel]').filter({ visible: true })).toHaveCount(1, { timeout: 10_000 });
}
const PANEL = '[data-profile-panel]';

test.describe('B2 내 정보 390', () => {
  test('맨 아래까지 읽다 닫고 다시 열어도 판이 미끄러지지 않는다(스켈레톤으로 다시 그리지 않는다)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubLogin(page);
    await stabilizeBackstack(page);
    await page.goto('/?tab=home');
    await expect(page.locator('button[aria-label^="알림"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    await openMe(page);
    await page.waitForTimeout(2500); // 첫 조회가 끝나 정착
    const bottom = await page.evaluate((s) => { const p = [...document.querySelectorAll<HTMLElement>(s)].find((e) => e.offsetParent !== null)!; p.scrollTop = 1e6; return Math.round(p.scrollTop); }, PANEL);
    expect(bottom, '판이 스크롤될 만큼 길지 않다 — 측정이 공허하다').toBeGreaterThan(600);
    await page.waitForTimeout(400);
    expect(await clickBy(page, '^닫기$'), '닫기 버튼을 못 찾았다').toBe(true);
    await page.waitForTimeout(900);
    expect(await clickBy(page, '검증계정 메뉴')).toBe(true);
    await page.waitForTimeout(400);
    await page.evaluate((s) => {
      const o: { st: number; sk: number }[] = []; (window as unknown as { __me: typeof o }).__me = o; const t0 = performance.now();
      const tick = () => {
        const p = [...document.querySelectorAll<HTMLElement>(s)].find((e) => e.offsetParent !== null);
        if (p) o.push({ st: Math.round(p.scrollTop), sk: p.querySelectorAll('.skeleton').length });
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
      };
      tick();
    }, PANEL);
    expect(await clickBy(page, '^내 정보 열기')).toBe(true);
    await page.waitForTimeout(1700);
    const f = await page.evaluate(() => (window as unknown as { __me: { st: number; sk: number }[] }).__me);
    const sts = [...new Set(f.map((x) => x.st))];
    const skel = f.filter((x) => x.sk > 0).length;
    console.log(`[b2-me-reopen] 닫기 전 ${bottom} · 다시 열기 scrollTop ${sts.join('→')} · 스켈레톤 프레임 ${skel}/${f.length}`);
    expect(f.length, '다시 연 판을 한 프레임도 못 쟀다').toBeGreaterThan(20);
    expect(skel, '이미 받은 내역을 다시 스켈레톤으로 그렸다').toBe(0);
    expect(Math.max(...f.map((x) => Math.abs(x.st - bottom))), `다시 열 때 판이 미끄러졌다(${sts.join('→')})`).toBeLessThanOrEqual(2);
  });

  test('보안 탭 첫 진입에서 약관 동의 이력·위치정보 칸이 아래를 밀지 않는다(요청은 한 번씩)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const uid = await stubLogin(page);
    await stabilizeBackstack(page);
    const hits = { consents: 0, loc: 0 };
    const slow = (ms: number) => new Promise((z) => setTimeout(z, ms));
    await page.route(/\/rest\/v1\/legal_consents\?/, async (r) => {
      if (r.request().method() !== 'GET') return r.fallback();
      hits.consents++; await slow(250);
      return r.fulfill(json(Array.from({ length: 3 }, (_, i) => ({
        id: `lc${i}`, user_id: uid, legal_version: 2 - (i > 0 ? 1 : 0), agreed_at: new Date(Date.now() - i * 86400e3 * 30).toISOString(), source: i ? 'gate' : 'settings',
        agreed_to_terms: true, agreed_to_privacy: true, agreed_to_anti_gambling: true, agreed_to_marketing: i === 0,
      }))));
    });
    await page.route(/\/rest\/v1\/rpc\/get_my_location_consent/, async (r) => {
      hits.loc++; await slow(250);
      return r.fulfill(json({ state: 'granted', terms_version: 2, granted_at: '2026-09-27T00:00:00Z', revoked_at: null }));
    });
    await page.goto('/?tab=home');
    await expect(page.locator('button[aria-label^="알림"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    await openMe(page);
    await page.waitForTimeout(1800);
    const tab = page.locator('[data-profile-tabbar] [role=tab]').filter({ hasText: /^보안$/ });
    const b = (await tab.boundingBox())!;
    expect(b, '보안 탭을 못 찾았다').not.toBeNull();
    await page.evaluate(() => {
      const o: { card: number | null; busy: number }[] = []; (window as unknown as { __sec: typeof o }).__sec = o; const t0 = performance.now();
      const tick = () => {
        const c = [...document.querySelectorAll<HTMLElement>('[data-testid="location-privacy-card"]')].find((e) => e.offsetParent !== null);
        const p = [...document.querySelectorAll<HTMLElement>('[data-profile-panel]')].find((e) => e.offsetParent !== null);
        o.push({ card: c ? Math.round(c.getBoundingClientRect().top) : null, busy: p ? p.querySelectorAll('[aria-busy="true"]').length : -1 });
        if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
      };
      tick();
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
    await page.waitForTimeout(110);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1400);
    const f = await page.evaluate(() => (window as unknown as { __sec: { card: number | null; busy: number }[] }).__sec).then((a) => a.filter((x) => x.card !== null));
    const tops = [...new Set(f.map((x) => x.card))];
    const busy = f.filter((x) => x.busy > 0).length;
    console.log(`[b2-sec] 위치정보 칸 윗변 ${tops.join('→')} · 불러오는 중 프레임 ${busy}/${f.length} · 요청 consents ${hits.consents} loc ${hits.loc}`);
    expect(f.length, '보안 판을 한 프레임도 못 쟀다').toBeGreaterThan(20);
    await expect(page.locator('[data-testid="location-consent-state"]').filter({ visible: true }), '위치정보 동의 상태가 안 그려졌다').toHaveCount(1);
    expect(busy, '보안 탭에 들어간 뒤 \'불러오는 중…\' 이 보였다').toBe(0);
    expect(tops, `위치정보 칸이 밀렸다(${tops.join('→')})`).toHaveLength(1);
    expect(hits, '같은 열림에서 두 번 받았다(미리 받기 + 칸이 또 받기)').toEqual({ consents: 1, loc: 1 });
  });

  // B2 후속(독립 검토 ④-b · zz-b2r 'S390-stale' 재현 조건): 대시보드로 열어 미리 받기만 하고 보안 탭은 안 간 채 닫는다 →
  //   서버 동의가 바뀐다 → 본인인증 안내에서 보안 탭으로 **바로** 연다. 미리 받은 옛 값('미동의')을 쓰면 안 된다.
  test('미리 받은 동의 상태는 그 열림에서만 쓴다 — 닫았다가 보안으로 바로 열면 새로 받는다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const uid = await stubLogin(page);
    await stabilizeBackstack(page);
    let server: 'none' | 'granted' = 'none';
    const hits = { consents: 0, loc: 0 };
    await page.route(/\/rest\/v1\/legal_consents\?/, async (r) => {
      if (r.request().method() !== 'GET') return r.fallback();
      hits.consents++;
      return r.fulfill(json([{ id: 'lc0', user_id: uid, legal_version: 2, agreed_at: new Date().toISOString(), source: 'settings',
        agreed_to_terms: true, agreed_to_privacy: true, agreed_to_anti_gambling: true, agreed_to_marketing: false }]));
    });
    await page.route(/\/rest\/v1\/rpc\/get_my_location_consent/, async (r) => {
      hits.loc++;
      return r.fulfill(json(server === 'granted'
        ? { state: 'granted', terms_version: 2, granted_at: '2026-09-27T00:00:00Z', revoked_at: null }
        : { state: 'none', terms_version: null, granted_at: null, revoked_at: null }));
    });
    await page.goto('/?tab=home');
    await expect(page.locator('button[aria-label^="알림"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    await openMe(page);                                   // ① 대시보드로 열기 → 미리 받기('미동의')
    await page.waitForTimeout(1500);
    expect(hits, '열 때 미리 받지 않았다 — 재현 전제가 없다(측정이 공허하다)').toEqual({ consents: 1, loc: 1 });
    expect(await clickBy(page, '^닫기$'), '닫기 버튼을 못 찾았다').toBe(true);   // 보안 탭은 안 간다
    await page.waitForTimeout(800);
    server = 'granted';                                   // ② 다른 곳(출석 흐름 등)에서 동의함
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:require-verify', { detail: { reason: '대회 예약' } })));
    await page.getByRole('button', { name: '휴대폰 본인인증 하기' }).click();   // ③ 보안 탭으로 바로 열기
    await expect(page.locator('[data-profile-tabbar] [role=tab][aria-selected=true]'), '보안 탭으로 바로 열리지 않았다').toHaveText(/보안/, { timeout: 10_000 });
    const st = page.locator('[data-testid="location-consent-state"]').filter({ visible: true });
    await expect(st, '서버는 동의함인데 미리 받아 둔 옛 상태를 그렸다').toHaveText(/^동의함 · 제2판/, { timeout: 5_000 });
    expect(hits, '보안 칸들이 새로 받지 않았다(묵은 미리 받기 값을 썼다)').toEqual({ consents: 2, loc: 2 });
  });
});

// ── 관리자 노출 관리(1440) ────────────────────────────────────────────────────
const AKEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const AUID = '00000000-0000-4000-8000-00000000ad11';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const AJWT = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: AUID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.');
const AFAKE = { access_token: AJWT, refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: AUID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
const BANNERS = Array.from({ length: 4 }, (_, i) => ({
  id: `bbbbbbbb-0000-4000-8000-00000000000${i}`, title: `배너 ${i + 1}`, subtitle: '', image_url: '/favicon.png', link_url: '', sort_order: i,
  starts_at: null, ends_at: null, active: true, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
}));

/** setting: app_settings GET 마다 (key, 그 키의 몇 번째 조회) → { 값, 지연 }. 저장 RPC(set_app_setting)는 로컬 204 로 끊고 writes 에 남긴다. */
async function bootAdmin(page: Page, setting: (key: string, n: number) => { v: string; delay: number } = () => ({ v: 'on', delay: 0 })) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, [AKEY, JSON.stringify(AFAKE)] as [string, string]);
  const slow = (ms: number) => new Promise((z) => setTimeout(z, ms));
  const n = new Map<string, number>(); const writes: string[] = [];
  await page.route(/supabase\.co\/rest\/v1\//, async (r) => {
    const req = r.request(); const m = req.method();
    if (/\/rpc\/set_app_setting/.test(req.url())) { writes.push(req.postData() ?? ''); await slow(150); return r.fulfill({ status: 204, body: '' }); }
    if (/\/app_settings/.test(req.url()) && m === 'GET') {
      const key = decodeURIComponent((req.url().match(/key=eq\.([^&]+)/) ?? [])[1] ?? '?');
      const c = (n.get(key) ?? 0) + 1; n.set(key, c);
      const s = setting(key, c); await slow(300 + s.delay);
      return r.fulfill(json({ value: s.v }));
    }
    await slow(300);
    if (m === 'HEAD') return r.fulfill({ status: 200, headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }, body: '' });
    if (req.url().includes('/rest/v1/rpc/')) return r.fulfill(json([]));
    if (m !== 'GET') return r.fallback();
    if (/\/home_banners\?/.test(req.url())) return r.fulfill(json(BANNERS));
    if (/\/profiles\?/.test(req.url())) return r.fulfill(json(/order=/.test(req.url()) ? [] : {
      id: AUID, name: '운영자', nickname: '운영자', email: 'admin@example.com', role: 'admin', approved: true, status: 'active', venue_id: null,
      activity_points: 0, created_at: '2026-01-01T00:00:00Z', agreed_to_terms: true, consented_legal_version: 2,
    }));
    return r.fulfill(json((req.headers()['accept'] ?? '').includes('pgrst.object') ? null : []));
  });
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(AFAKE.user)));
  page.on('dialog', (d) => { void d.dismiss(); });
  await stabilizeBackstack(page);
  await page.goto('/?tab=admin');
  await page.waitForSelector('[data-tab="admin"] button:has-text("운영 분석")', { timeout: 25_000 });
  await page.waitForTimeout(1500);
  return { writes };
}
const adminNav = (page: Page, label: string) => page.evaluate((l) => {
  const b = [...document.querySelectorAll<HTMLElement>('[data-tab="admin"] button')].find((e) => e.offsetParent !== null && (e.textContent ?? '').trim().startsWith(l));
  if (!b) return false; b.click(); return true;
}, label);

test.describe('B2 관리자 노출 관리 1440', () => {
  test('다시 들어가도 스켈레톤으로 다시 그리지 않고, 입력 없이 스크롤이 움직이지 않는다', async ({ page }) => {
    await bootAdmin(page);
    expect(await adminNav(page, '노출 관리'), '노출 관리 메뉴를 못 찾았다').toBe(true);
    await page.waitForTimeout(1800); // 첫 방문 — 받아서 그린다
    const rows0 = await page.locator('[data-tab="admin"] li:has(button:text-is("수정"))').count();
    expect(rows0, '배너 목록이 그려지지 않았다 — 측정 대상 0').toBe(BANNERS.length);
    expect(await adminNav(page, '기능 스위치')).toBe(true);
    await page.waitForTimeout(1500);
    await page.evaluate(() => scrollTo({ top: 600, behavior: 'instant' as ScrollBehavior }));
    await page.waitForTimeout(500);
    const y0 = await sy(page);
    await page.evaluate(() => {
      const out: { sy: number; sk: number; dh: number }[] = [];
      (window as unknown as { __b2: typeof out }).__b2 = out;
      const t0 = performance.now();
      const tick = () => {
        const pane = document.querySelector('[data-tab="admin"]');
        out.push({ sy: Math.round(scrollY), sk: pane ? pane.querySelectorAll('.skeleton,[aria-busy="true"]').length : -1, dh: document.documentElement.scrollHeight });
        if (performance.now() - t0 < 1600) requestAnimationFrame(tick);
      };
      tick();
    });
    expect(await adminNav(page, '노출 관리')).toBe(true);
    await page.waitForTimeout(1800);
    const f = await page.evaluate(() => (window as unknown as { __b2: { sy: number; sk: number; dh: number }[] }).__b2);
    const sys = [...new Set(f.map((x) => x.sy))];
    const skel = f.filter((x) => x.sk > 0).length;
    console.log(`[b2-admin] y0=${y0} scrollY ${sys.join('→')} · 스켈레톤 프레임 ${skel}/${f.length} · 문서 ${[...new Set(f.map((x) => x.dh))].join('→')}`);
    expect(f.length, '프레임 표본이 없다').toBeGreaterThan(30);
    expect(skel, '이미 본 노출 관리를 다시 스켈레톤으로 그렸다').toBe(0);
    // 진입 때 판 윗변 정렬(한 번)은 허용 — 그 뒤 입력 없이 움직이면 안 된다
    const settledFrom = f.findIndex((x, i) => i > 0 && x.sy === f[i - 1].sy);
    const after = [...new Set(f.slice(Math.max(1, settledFrom)).map((x) => x.sy))];
    expect(after, `정렬 뒤에도 스크롤이 움직였다(${sys.join('→')})`).toHaveLength(1);
  });

  // B2 후속(독립 검토 ⑤-b · zz-b2r 'A1440-race' 재현 조건): 재진입 첫 조회(옛 값 off)가 1.5초 늦게 오는 사이 스위치를 켠다.
  //   저장 뒤 조회는 on — 늦게 온 옛 조회가 화면을 '숨김'으로 되돌리면 안 된다.
  test('재진입 직후 스위치를 켜도 늦게 온 옛 조회가 덮지 않는다', async ({ page }) => {
    let server = 'off'; let phase: 'boot' | 'reentry' | 'after' = 'boot'; const held = new Set<string>();
    const { writes } = await bootAdmin(page, (key) => {
      if (phase === 'reentry' && !held.has(key)) { held.add(key); return { v: 'off', delay: 1500 }; } // 재진입 첫 조회 = 옛 값, 늦게
      return { v: server, delay: 0 };
    });
    expect(await adminNav(page, '노출 관리')).toBe(true);
    await page.waitForTimeout(1800);
    const sw = page.locator('[data-tab="admin"] [role=switch]').first();
    await expect(sw, '첫 방문 스위치가 옛 값(off)이 아니다 — 재현 전제가 없다').toHaveAttribute('aria-checked', 'false');
    expect(await adminNav(page, '기능 스위치')).toBe(true);
    await page.waitForTimeout(1000);
    phase = 'reentry';
    expect(await adminNav(page, '노출 관리')).toBe(true);
    await page.waitForTimeout(250);
    await expect(sw, '재진입 직후 스위치가 눌리지 않는다 — 경합을 재지 못했다').toBeEnabled();
    phase = 'after'; server = 'on';
    await sw.click();
    const seq: (string | null)[] = [];
    for (let i = 0; i < 12; i++) { seq.push(await sw.getAttribute('aria-checked')); await page.waitForTimeout(200); }
    console.log(`[b2-admin-race] aria-checked ${seq.join(',')} · 저장 ${writes.length}`);
    expect(writes.length, '저장 RPC 가 안 나갔다 — 측정이 공허하다').toBe(1);
    const firstOn = seq.indexOf('true');
    expect(firstOn, '저장 뒤에도 켜짐이 한 번도 안 그려졌다').toBeGreaterThanOrEqual(0);
    expect(seq.slice(firstOn), `늦게 온 옛 조회가 켜짐을 숨김으로 되돌렸다(${seq.join(',')})`).not.toContain('false');
  });

  // 배너 목록도 같은 구조(지난 목록으로 먼저 그림 + 재조회) — 재진입 첫 목록 조회가 늦게 오는 사이 배너를 끄면 옛 목록이 덮으면 안 된다.
  test('재진입 직후 배너를 꺼도 늦게 온 옛 목록이 덮지 않는다', async ({ page }) => {
    await bootAdmin(page);
    let active = true; let phase: 'boot' | 'reentry' = 'boot'; let held = false; let patches = 0;
    const slow = (ms: number) => new Promise((z) => setTimeout(z, ms));
    await page.route(/\/rest\/v1\/home_banners/, async (r) => {
      const m = r.request().method();
      if (m === 'PATCH') { patches++; active = false; return r.fulfill(json([{ ...BANNERS[0], active: false }])); }
      if (m !== 'GET') return r.fallback();
      const snap = BANNERS.map((b, i) => (i === 0 ? { ...b, active } : b)); // 요청 시점의 서버 값
      if (phase === 'reentry' && !held) { held = true; await slow(1500); return r.fulfill(json(snap)); }
      await slow(150); return r.fulfill(json(snap));
    });
    expect(await adminNav(page, '노출 관리')).toBe(true);
    await page.waitForTimeout(1800);
    const btn = page.locator('[data-tab="admin"] li').filter({ has: page.locator('button:text-is("수정")') }).first().getByRole('button', { name: /^(켜짐|꺼짐)$/ });
    await expect(btn, '첫 배너가 켜짐이 아니다 — 재현 전제가 없다').toHaveText('켜짐');
    expect(await adminNav(page, '기능 스위치')).toBe(true);
    await page.waitForTimeout(1000);
    phase = 'reentry';
    expect(await adminNav(page, '노출 관리')).toBe(true);
    await page.waitForTimeout(250);
    await btn.click();
    const seq: string[] = [];
    for (let i = 0; i < 12; i++) { seq.push((await btn.textContent()) ?? ''); await page.waitForTimeout(200); }
    console.log(`[b2-admin-banner-race] ${seq.join(',')} · 저장 ${patches}`);
    expect(patches, '배너 저장이 안 나갔다 — 측정이 공허하다').toBe(1);
    const firstOff = seq.indexOf('꺼짐');
    expect(firstOff, '저장 뒤에도 꺼짐이 한 번도 안 그려졌다').toBeGreaterThanOrEqual(0);
    expect(seq.slice(firstOff), `늦게 온 옛 목록이 꺼짐을 켜짐으로 되돌렸다(${seq.join(',')})`).not.toContain('켜짐');
  });
});
