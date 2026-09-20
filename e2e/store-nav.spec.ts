// 내 매장 — 단계 바 하나로 왕복하는가.
//
// 막는 결함 ①(오너 2026-09-07): VenueManageTab 의 '내 매장 탭 재탭 → 대시보드' 효과가 deps 에
//   gotoSection 을 갖고 있었다. gotoSection ← firstSettingsTab ← canSettingsTab ← idOn(이용권
//   킬스위치, **비동기 도착**). 사용자가 장부·클락으로 옮긴 **뒤** 그 값이 도착하면 함수 정체성이
//   바뀌고 효과가 다시 돌아 화면이 대시보드로 되돌아갔다. 누르지도 않았는데.
//   그래서 이 스펙은 '이동 직후'가 아니라 **비동기가 다 도착한 뒤**를 본다 — 결함이 사는 창이다.
//
// 막는 결함 ②(오너 2026-09-08 "2번으로 통일시켜서 한 페이지에서 왔다갔다"):
//   단계 바가 **두 벌**이었다 — 대시보드엔 숫자 스트립, 게임 진행엔 알약 바. 스트립을 누르면
//   알약 바가 있는 다른 화면으로 넘어가, 거기서 또 눌러야 했다. 지금은 한 벌이고 대시보드에서도
//   같은 자리에 있다. 이 스펙이 그 '한 벌'과 '왕복'을 잠근다.
//
// 2026-09-12: 자격증명 게이트를 걷고 **목킹 업주**(e2e/_mockOwner)로 연다 — 은퇴한 E2E 계정 때문에
//   다섯 건이 통째로 꺼져 있었다. ⚠ 이 스펙은 **화면 렌더·이동 계약 전용**이다:
//   목킹 세션의 JWT 는 서명이 없고 권한은 하네스가 하드코딩한 boolean 이라,
//   여기 통과를 'RLS·서버 권한이 옳다' 의 근거로 쓰면 안 된다(실제로 그 결합은 2026-09-11 에 났다).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

const BAR = '[aria-label="매장 단계 이동"]';
const TAB = `${BAR} [role=tab]`;
// 🔴 2026-09-20 — 넘침은 **시각적 바**에서 재야 한다. `overflow-x-auto` 가 걸린 스크롤러는
//   이 바깥 div 고, `aria-label` 은 그 안의 tablist 로 내려갔다(이용권이 탭이 아니라서 분리했다).
//   BAR 로 재면 스크롤러가 아닌 요소를 재게 돼 **넘침이 항상 0 인 빈 검사**가 된다.
const RAIL = '[data-mystore-rail]';

/** 지금 활성인 알약의 글자. 요약이 활성이면 '요약' — 즉 대시보드를 보고 있다는 뜻이다. */
const activeTab = (page: import('@playwright/test').Page) =>
  page.locator(`${TAB}[aria-selected="true"]`).textContent();

/** 이 매장의 포스터 한 줄 — 목록이 비면 포스터 판이 EmptyState 로만 서서 실제 경로를 못 본다. */
const POSTER = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  title: '금요 딥스택 100K GTD', venue_id: MOCK_VENUE, owner_id: '11111111-1111-4111-8111-111111111111',
  pub_name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1',
  date: '2099-12-31', start_time: '19:00', duration: '', format: '홀덤',
  guaranteed: '', prize_pool: '', approved: true, display_order: 1,
  buy_in: { amount: 100_000 }, seats: null, structure: null, description: '',
  side_events: null, ranking_prizes: null, partners: null, promotions: null,
  payment_methods: null, rules: null, poster_url: null, poster_color: null,
  is_premium: false, premium_until: null, unread_qna_count: 0, view_count: 0,
};

/** 375 모바일 내 매장을 **계정 없이** 연다.
 *  ⚠ 반환 boolean(조용한 skip 통로)을 없앴다 — 못 열면 실패여야 한다.
 *    '내 매장 탭이 없으면 건너뛴다' 는 게이트가 꺼져도 초록이 되는 가장 흔한 구멍이다. */
async function openStore(page: Page) {
  await bootOwner(page, {
    viewport: { width: 375, height: 812 },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/schedules\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([POSTER]) })
        : r.fallback()));
    },
  });
  await openMyStore(page);
  await expect(page.locator('[data-tab="my-store"]'), '목킹 업주로 내 매장을 열지 못했다').toBeVisible({ timeout: 20_000 });
}

/** 단계 알약 하나를 **반드시** 짚는다. 없으면 실패다(종전의 `count()===0 → continue` 대체). */
function stepTab(page: Page, name: string) {
  return page.locator(TAB).filter({ hasText: name });
}

test.describe('내 매장 — 이동 안정성(목킹 업주 · 계정 없이)', () => {

  test('🔴 게임 스텝으로 이동한 뒤 비동기 해제가 도착해도 대시보드로 되돌아가지 않는다', async ({ page }) => {
    test.setTimeout(120_000);
    // 🔴 결함의 방아쇠는 '이용권 킬스위치가 **늦게** 도착해 idOn 이 바뀌는 것' 이다.
    //   목킹은 즉답이라 그 창이 없다 — 미러를 미리 'on' 으로 심어 두고 서버가 null(=off)로 답하게 해
    //   부팅 뒤 true→false 전이를 만든다(identityFlag.ts: LS 미러 → 서버 응답 → commit).
    //   최종 상태가 운영 기본값(꺼짐)과 같다는 점도 이 방향이 낫다.
    await page.addInitScript(() => { try { localStorage.setItem('nuri:identity-gate', 'on'); } catch { /* 차단 */ } });
    // 서버 왕복이 실제로 일어났는지 센다. 미러만 보면 헐겁다 —
    //   씨앗을 안 심어도 null→'off' 라 최종값은 똑같이 'off' 이기 때문이다.
    //   '씨앗 on' + '서버가 답함' + '최종 off' 셋이 모여야 on→off 전이가 증명된다.
    let flagHits = 0;
    page.on('request', (r) => { if (r.url().includes('identity_voucher_enabled')) flagHits += 1; });
    await openStore(page);

    // 대시보드가 그려지자마자(= 비동기들이 아직 도착 중일 때) 곧바로 이동한다 — 결함이 사는 창.
    const clock = stepTab(page, '클락');
    await clock.first().waitFor({ timeout: 20_000 });
    await clock.first().click();

    // 비동기(권한·킬스위치·프리셋)가 전부 도착할 시간을 준 뒤에도 그 자리인지.
    await page.waitForTimeout(6000);
    // ⚠ 전제 단언 — 킬스위치가 **실제로 도착했는가**. 이게 없으면 route 가 한 번 어긋나도
    //   idOn 이 영영 그대로라 이 테스트는 '클락 누르면 클락 활성'(=아래 ②의 중복)으로
    //   실패 없이 의미만 사라진다. 같은 파일 ④는 layerOf() 로 전제를 잠그는데 ①만 빠져 있었다.
    expect(flagHits, '이용권 킬스위치를 서버에 묻지도 않았다 — 재려는 비동기 왕복 자체가 없다').toBeGreaterThan(0);
    expect(await page.evaluate(() => { try { return localStorage.getItem('nuri:identity-gate'); } catch { return null; } }),
      '킬스위치가 off 로 내려오지 않았다 — on→off 전이가 일어나지 않았다').toBe('off');
    const active = await activeTab(page);
    console.log('[nav] active =', JSON.stringify(active));
    expect(await page.locator(BAR).isVisible(), '단계 바가 사라졌다').toBe(true);
    expect(active, '이동한 뒤 대시보드(요약)로 되돌아갔다 — homeNonce 효과가 누르지 않았는데 돌고 있다').not.toContain('요약');
    expect(active, '활성 탭이 클락이 아니다').toContain('클락');
  });

  test('단계 바 각 단계가 그 판으로 전환된다(대시보드로 튀지 않는다)', async ({ page }) => {
    test.setTimeout(120_000);
    await openStore(page);
    await page.waitForTimeout(2500);
    await expect(page.locator(BAR)).toBeVisible({ timeout: 20_000 });

    for (const name of ['포스터', '클락', '순위', '장부']) {
      const tab = stepTab(page, name);
      // ⚠ 종전엔 `count()===0 → continue` 였다. 단계가 통째로 사라져도 루프가 전부 no-op 하고
      //   테스트는 초록이 된다 — 게이트가 꺼져도 안 보이는 형태다. 없으면 실패로 만든다.
      await expect(tab, `«${name}» 단계 알약이 없다`).toHaveCount(1);
      await tab.first().click();
      await page.waitForTimeout(1500);
      const active = await activeTab(page);
      expect(active, `${name} 를 눌렀는데 활성 탭이 «${active}» 다`).toContain(name);
    }
  });

  test('한 바에서 왕복한다 — 단계 → 요약 → 다른 단계로 가는 동안 바가 계속 같은 자리에 있다', async ({ page }) => {
    test.setTimeout(120_000);
    await openStore(page);
    await page.waitForTimeout(2500);
    const bar = page.locator(BAR);
    await expect(bar).toBeVisible({ timeout: 20_000 });

    // 바의 세로 위치가 왕복 내내 흔들리지 않아야 "페이지를 옮긴 게 아니라 판만 바뀐다"로 읽힌다.
    const topOf = async () => Math.round((await bar.boundingBox())!.y);
    const tops = [await topOf()];

    for (const name of ['클락', '요약', '순위', '요약']) {
      const tab = stepTab(page, name);
      // ②와 같은 이유 — 네 칸이 전부 건너뛰어지면 tops 원소가 1개라 spread 0 으로 **무조건** 통과한다.
      await expect(tab, `«${name}» 알약이 없다`).toHaveCount(1);
      await tab.first().click();
      await page.waitForTimeout(1200);
      await expect(bar, `${name} 로 간 뒤 단계 바가 사라졌다 — 다른 페이지로 넘어간 것이다`).toBeVisible();
      expect(await activeTab(page), `${name} 를 눌렀는데 활성이 다르다`).toContain(name);
      tops.push(await topOf());
    }
    console.log('[왕복] 바 top =', JSON.stringify(tops));
    // 단계 바는 **모든 섹션에서 맨 위 고정**이다(2026-09-08). 예전엔 게임 화면에만 있는 문맥 줄
    //   (매장 › 날짜 › 게임)이 바보다 위에 있어 대시보드 239 ↔ 게임 268 로 29px 튀었다.
    //   바를 그 줄 위로 올려 0 으로 만들었으니, 여기서 다시 벌어지면 그 배치가 되돌아간 것이다.
    const spread = Math.max(...tops) - Math.min(...tops);
    expect(spread, `왕복 중 단계 바가 ${spread}px 움직였다 — 문맥 줄이 다시 바 위로 올라갔는지 보라`).toBeLessThanOrEqual(4);
  });

  // F03(2026-09-10 감사): 내 매장 섹션 겹(useBackClose)이 tabActive 로 게이트되지 않았다. 이 탭은 keep-alive 라
  //   섹션에 들어간 뒤 하단 '홈'을 눌러도 숨은 내 매장이 겹을 계속 들고 있었고, 홈에서 뒤로가기를 누르면
  //   보이지 않는 곳에서 gotoSection('dashboard') 만 돌고 화면은 그대로 — 두 번이 통째로 죽었다.
  //   (nav-stability J-1 과 같은 기전. 커뮤니티 탭은 `active &&` 로 고쳐져 있었고 내 매장만 빠져 있었다.)
  test('🔴 섹션에 들어간 뒤 홈 탭을 누르면 숨은 내 매장이 뒤로가기 겹을 들고 있지 않다', async ({ page }) => {
    test.setTimeout(90_000);
    await openStore(page);
    // 겹이 하나라도 남아 있으면 history 현재 항목에 __layer 토큰이 찍힌다(backstack.spec · nav-stability J-1 과 같은 단언).
    const layerOf = () => page.evaluate(() => {
      const st = history.state as { __layer?: number } | null;
      return st && typeof st.__layer === 'number' ? st.__layer : 0;
    });
    const clock = stepTab(page, '클락');
    await clock.first().waitFor({ timeout: 20_000 });
    await clock.first().click();
    await page.waitForTimeout(1500);
    // 전제: 섹션 겹이 실제로 올라가 있다 — 0 이면 아래 단언이 공허하다.
    expect(await layerOf(), '클락 섹션이 뒤로가기 겹을 등록하지 않았다 — 전제부터 어긋남').not.toBe(0);

    await page.getByRole('navigation', { name: '하단 내비게이션' }).getByRole('button', { name: '홈', exact: true }).click();
    await expect(page.locator('[data-tab="home"]')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600); // dead-tail 정리(go(-k))가 반영될 시간 — backstack.spec 과 같은 대기
    // ⚠ 뒤로가기를 실제로 누르면 정상일 때 앱을 벗어나 페이지가 닫힌다 — 토큰으로 본다.
    expect(await layerOf(), '보이지도 않는 내 매장이 뒤로가기 겹을 들고 있다 — 홈에서 뒤로가기 2회가 화면 변화 없이 죽는다')
      .toBe(0);
  });

  test('375 에서 알약이 전부 한 화면에 들어온다(요약 + 5단계)', async ({ page }) => {
    test.setTimeout(90_000);
    await openStore(page);
    await page.waitForTimeout(2500);
    const bar = page.locator(RAIL);
    await expect(bar).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(BAR), 'tablist 가 사라졌다 — 키보드 탭 패턴이 통째로 없어진 것이다').toBeVisible({ timeout: 20_000 });

    const m = await bar.evaluate((el) => ({
      넘침: el.scrollWidth - el.clientWidth,
      // 🔴 칸은 **바 전체**에서 센다(탭 + 이용권 같은 비탭 지름길 포함). tablist 안에서만 세면
      //   탭이 아닌 칸이 늘어도 이 검사가 모른다 — 넘침을 만드는 건 '칸 개수'지 'role' 이 아니다.
      칸: [...el.querySelectorAll<HTMLElement>('button')].map((b) => ({
        글자: b.textContent?.trim() ?? '', 폭: Math.round(b.getBoundingClientRect().width),
      })),
    }));
    console.log('[375 알약]', JSON.stringify(m, null, 1));
    // 🔴 칸 개수를 먼저 못박는다. '넘침 ≤ 0'·'폭 ≥ 28' 은 칸이 **줄수록 쉽게** 통과한다 —
    //   제목이 말하는 '요약 + 5단계' 가 실제로 여섯인지 보지 않으면 알약이 빠질수록 초록이 된다.
    expect(m.칸.length, `알약이 ${m.칸.length}칸이다 — 제목의 '요약 + 5단계'(6칸)와 다르다`).toBe(6);
    // 마지막 단계(정산)가 잘려 스크롤해야 보이면, 그 단계가 있는 줄도 모른다(오너 2026-09-07).
    expect(m.넘침, '알약 바가 375 에서 넘친다 — 요약을 더하면서 넘겼다').toBeLessThanOrEqual(0);
    for (const c of m.칸) expect(c.폭, `«${c.글자}» 칸이 너무 좁다`).toBeGreaterThanOrEqual(28);

    // 🔴 2026-09-20 — 유효 터치 44px. **박스 높이만 보지 않는다**: 이 저장소는 의사요소로 표적을
    //   넓히는 자리가 여럿이라 높이만 재면 거짓 실패가 나고, 반대로 오버행이 **잘리는** 자리에서는
    //   거짓 통과가 난다(이 바가 정확히 그 경우였다 — `overflow-x-auto` 가 세로 오버행을 잘라
    //   `tap-y-44` 를 붙여도 아래쪽은 안 닿았다). `elementFromPoint` 로 실제 히트를 본다.
    const tap = await page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(sel)].map((b) => {
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const at = (y: number) => { const el = document.elementFromPoint(cx, y); return !!el && (b.contains(el) || el === b); };
      return { 글자: (b.textContent || '').trim().slice(0, 6), 높이: +r.height.toFixed(1), 위: at(cy - 21.5), 아래: at(cy + 21.5) };
    }), `${RAIL} [role=tab]`);
    console.log('[375 유효터치]', JSON.stringify(tap));
    expect(tap.length, '단계 탭이 하나도 없다 — 이 검사가 아무것도 재지 않았다').toBeGreaterThan(0);
    for (const t of tap) {
      expect(t.위 && t.아래, `«${t.글자}» 유효 터치가 44px 미만이다(높이 ${t.높이}px · 위 ${t.위} · 아래 ${t.아래})`).toBe(true);
    }
  });
});

// ── PC 단계 바 (2026-09-20 오너 지시 · D1) ─────────────────────────────────────
//
// 오너가 보낸 PC 사진의 지적: "넓은 PC 패널에서 7항목이 **작은 글씨로 왼쪽에 몰리고**
//   이용권의 역할이 섞여 보인다."
//
// 🔴 실측이 전제를 하나 정정했다 — **넘침이 아니다.** 변경 전 1024/1280/1440 다섯 권한 조합
//   전부 `scrollWidth - clientWidth === 0` 이었다. 문제는 잘림이 아니라 **안 쓰는 폭**이었다:
//     1024 바 748px 중 칩이 431px(58%) · 1280·1440 바 946px 중 431px(**46%**) ·
//     권한이 적으면 12%(포스터만). 글자는 어느 폭에서나 12.75px 로 고정이었다.
//
// ⚠ 실행문의 A안(`lg:flex-1 lg:basis-0` 만 주기)은 **실측으로 반증했다**: 단계가 1개인 권한에서
//   그 칸 하나가 바 전체로 늘어난다. 그래서 `lg:max-w-[9rem]` 상한이 함께 있어야 한다.
//   → 이 검사는 '비율' 이 아니라 **칸 폭과 글자 크기**를 잰다. 비율로 잠그면 단계가 적은 권한에서
//     통과할 방법이 '한 칸을 900px 로 늘리기' 뿐이라 잘못된 것을 강제하게 된다.
//
// ⚠ 375px 6칸 계약(위)은 그대로 둔다. 여긴 **lg(≥1024) 전용**이고 모바일은 한 줄도 안 바뀐다.
test.describe('PC 단계 바 — 넓은 패널에서 단계가 읽히는 크기로 퍼진다', () => {
  // 🔴 `canVoucher = idOn && (manageOk || voucherView)`(VenueManageTab.tsx:370) 이다.
  //   `idOn` 은 app_settings 의 `identity_voucher_enabled` 라 **권한만 켜도 이용권은 안 뜬다.**
  //   처음 이 검사를 썼을 때 세 조합 전부 이용권이 없어 `이용권오른쪽여백: null` 이었고,
  //   '오른쪽 끝에 붙는다' 단언이 **한 번도 실행되지 않았다**(빈 검사). 킬스위치를 켜서 실제로 띄운다.
  //   ⚠ 두 번째 정정: '이용권 없음' 은 **권한으로 못 만든다.** 업주 픽스처는 `manageOk` 가 참이라
  //   `can_view_vouchers: false` 를 줘도 `manageOk || voucherView` 가 통과한다(실측: 세 폭 전부 떴다).
  //   실제로 이용권이 없는 상태는 **킬스위치가 꺼진 것**이고, 그게 운영 기본값이다 — 그걸 검사한다.
  const IDENTITY_ON = { identity_voucher_enabled: 'on' };
  const PERMS = [
    { name: '전체권한', appSettings: IDENTITY_ON, perms: undefined, 이용권: true },
    { name: '킬스위치off', appSettings: {}, perms: undefined, 이용권: false },
    { name: '장부계열만', appSettings: IDENTITY_ON, perms: { can_manage_venue_schedules: false }, 이용권: true },
  ] as const;

  for (const W of [1024, 1280, 1440] as const) {
    for (const P of PERMS) {
      test(`${W}px ${P.name} — 단계 칸 폭·글자·넘침·활성 하나`, async ({ page }) => {
        test.setTimeout(90_000);
        await bootOwner(page, {
          viewport: { width: W, height: 900 },
          appSettings: P.appSettings,
          ...(P.perms ? { perms: P.perms } : {}),
          extra: async (p) => {
            await p.route(/\/rest\/v1\/schedules\?/, (r) => (r.request().method() === 'GET'
              ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([POSTER]) })
              : r.fallback()));
          },
        });
        await openMyStore(page);
        await expect(page.locator('[data-tab="my-store"]'), '목킹 업주로 내 매장을 열지 못했다').toBeVisible({ timeout: 20_000 });
        await expect(page.locator(RAIL)).toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(1500); // 권한 RPC 가 늦게 도착하면 칸 수가 바뀐다 — 정착 후에 잰다

        const m = await page.evaluate((sel) => {
          const rail = document.querySelector<HTMLElement>(sel.rail)!;
          const rr = rail.getBoundingClientRect();
          const steps = [...rail.querySelectorAll<HTMLElement>('[role=tab]')]
            .filter((b) => /^\d+\./.test(b.textContent?.trim() ?? ''));
          const voucher = [...rail.querySelectorAll<HTMLElement>('button')]
            .find((b) => /이용권/.test(b.textContent ?? '') && !b.getAttribute('role'));
          const pill = rail.querySelector<HTMLElement>('[data-sliding-pill]');
          const act = rail.querySelector<HTMLElement>('[data-pill-active]');
          return {
            넘침: rail.scrollWidth - rail.clientWidth,
            바폭: +rr.width.toFixed(1),
            단계수: steps.length,
            단계폭: steps.map((b) => +b.getBoundingClientRect().width.toFixed(1)),
            글자: steps.map((b) => parseFloat(getComputedStyle(b).fontSize)),
            높이: steps.map((b) => +b.getBoundingClientRect().height.toFixed(1)),
            이용권오른쪽여백: voucher ? +(rr.right - voucher.getBoundingClientRect().right).toFixed(1) : null,
            활성수: rail.querySelectorAll('[role=tab][aria-selected="true"]').length,
            알약: pill && act ? {
              중심차: +Math.abs((pill.getBoundingClientRect().left + pill.getBoundingClientRect().right) / 2
                - (act.getBoundingClientRect().left + act.getBoundingClientRect().right) / 2).toFixed(2),
              폭차: +Math.abs(pill.getBoundingClientRect().width - act.getBoundingClientRect().width).toFixed(2),
            } : null,
            // tablist 안에 탭이 아닌 것이 섞여 있으면 ARIA 위반이다(이용권이 그랬다).
            탭아닌자식: [...document.querySelectorAll<HTMLElement>(`${sel.bar} > *`)]
              .filter((el) => el.tagName === 'BUTTON' && el.getAttribute('role') !== 'tab')
              .map((el) => el.textContent?.trim() ?? '?'),
          };
        }, { rail: RAIL, bar: BAR });
        console.log(`[PC ${W} ${P.name}]`, JSON.stringify(m));

        expect(m.넘침, '단계 바가 PC 에서 넘친다 — 마지막 단계가 잘린다').toBeLessThanOrEqual(0);
        expect(m.활성수, '활성 탭이 정확히 하나가 아니다').toBe(1);
        expect(m.단계수, '단계가 하나도 없다 — 이 검사가 아무것도 재지 않았다').toBeGreaterThan(0);

        // 🔴 오너 지적의 알맹이 — 칸이 작아서 왼쪽에 몰려 보였다. 변경 전 실측은 60~68px 였다.
        for (const w of m.단계폭) {
          expect(w, `단계 칸이 ${w}px 다 — PC 에서 이렇게 좁으면 '작은 글씨로 몰려' 보인다(변경 전 60~68px)`).toBeGreaterThanOrEqual(100);
          expect(w, `단계 칸이 ${w}px 다 — 상한이 풀렸다. 권한이 적을 때 한 칸이 바 전체로 늘어난다`).toBeLessThanOrEqual(170);
        }
        for (const f of m.글자) expect(f, `PC 단계 글자가 ${f}px 다(변경 전 12.75px)`).toBeGreaterThanOrEqual(14);
        // 🔴 44px 유효 터치 계약(2026-09-20 히트테스트로 미달 확정). `h-[44px]` 로 못박았다 —
        //   `h-11` 은 루트 17px 에서 46.75px 이라 44 가 아니다.
        for (const h of m.높이) expect(h, `단계 버튼 높이가 ${h}px 다 — 44px 유효 터치 계약 미달`).toBeGreaterThanOrEqual(44);

        // 이용권은 '단계'가 아니라 지름길 — 오른쪽 끝에 서고 tablist 밖이어야 한다.
        // ⚠ `if (여백 !== null)` 로 감싸면 안 된다 — 이용권이 안 뜨는 순간 단언이 통째로 사라져
        //   초록인 채로 아무것도 안 잰다. 그래서 **있어야 할 때 없으면 실패**로 못박는다.
        if (P.이용권) {
          expect(m.이용권오른쪽여백, '이용권이 안 떴다 — 이 조합에서는 떠야 한다(킬스위치 on + 권한 있음). 이 단언이 빈 검사가 됐다')
            .not.toBeNull();
          expect(m.이용권오른쪽여백!, '이용권이 오른쪽 끝에 안 붙었다 — 단계들과 붙어 역할이 섞여 보인다')
            .toBeLessThanOrEqual(12);
        } else {
          expect(m.이용권오른쪽여백, '권한이 없는데 이용권이 떴다').toBeNull();
        }
        expect(m.탭아닌자식, `tablist 안에 탭이 아닌 버튼이 있다 — ARIA 위반: ${JSON.stringify(m.탭아닌자식)}`).toEqual([]);

        if (m.알약) {
          expect(m.알약.중심차, '알약이 활성 탭 중심에서 벗어났다').toBeLessThanOrEqual(1);
          expect(m.알약.폭차, '알약 폭이 활성 탭과 다르다').toBeLessThanOrEqual(1);
        }
      });
    }
  }

  test('1440 — 요약↔단계 왕복에도 같은 바가 같은 자리에 있다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootOwner(page, { viewport: { width: 1440, height: 900 } });
    await openMyStore(page);
    await expect(page.locator(RAIL)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    const topOf = () => page.locator(RAIL).evaluate((el) => el.getBoundingClientRect().top);

    const t0 = await topOf();
    await page.locator(TAB).filter({ hasText: '클락' }).first().click();
    await page.waitForTimeout(800);
    const t1 = await topOf();
    expect(await activeTab(page), '클락을 눌렀는데 활성이 안 바뀌었다').toContain('클락');

    await page.locator(TAB).filter({ hasText: '요약' }).first().click();
    await page.waitForTimeout(800);
    const t2 = await topOf();
    expect(await activeTab(page), '요약으로 못 돌아왔다').toContain('요약');

    console.log('[PC 1440 왕복 top]', JSON.stringify({ 요약: t0, 클락: t1, 요약복귀: t2 }));
    expect(Math.abs(t1 - t0), '단계로 갈 때 바가 세로로 움직인다').toBeLessThanOrEqual(4);
    expect(Math.abs(t2 - t0), '요약으로 돌아올 때 바가 세로로 움직인다').toBeLessThanOrEqual(4);
  });
});
