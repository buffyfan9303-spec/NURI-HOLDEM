// PC 폭 전용 회귀 — **실제로 PC 에서만 났던 결함**만 잠근다 (2026-09-21 · 요구 16-ⓑ)
//
// 왜 파일 단위 뷰포트인가: playwright.config 의 프로젝트는 `mobile-chromium`(Pixel 7) 하나다.
// 전체 PC 프로젝트를 붙이면 95개 스펙이 두 벌 돌아 CI 가 배로 는다(현재 E2E 6분).
// 여기서만 폭을 바꾸면 더해지는 비용이 이 파일의 런타임뿐이다.
//
// 🔴 넣지 않은 것 — **이미 잡히고 있다.** 중복은 CI 시간만 먹는다.
//   · PC 단계 바(칸 폭·글자·넘침·44px)      -> e2e/store-nav.spec.ts 'PC 단계 바' (1024·1280·1440 x 권한 3)
//   · PC 대시보드 가로 넘침·max-w·KPI 겹침  -> e2e/store-dashboard-responsive.spec.ts (1280·1440 포함 7폭)
//   · PC 진입 모션(root VT 겹침)            -> e2e/pc-chrome-no-blink.spec.ts (390·1440)
//   · 내 매장 PC 전환 CLS                   -> e2e/mystore-transition-cls.spec.ts ('PC 1440')
//   · 클락 송출 대형 화면                   -> e2e/clock-visual · clock-board · clock-stage-container (1920)
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore } from './_mockOwner';

/** SectionHeader(atoms/SectionHeader.tsx) 만 고른다 — 앱 셸 헤더도 border-b 라 h2.text-fluid-lg 로 좁힌다. */
const MEASURE = () => [...document.querySelectorAll<HTMLElement>('header')]
  .filter((h) => h.querySelector('h2.text-fluid-lg'))
  .map((h) => {
    const t2 = h.querySelector('h2')!.getBoundingClientRect();
    const tile = h.querySelector<HTMLElement>('span[aria-hidden]')?.getBoundingClientRect();
    return {
      제목: h.querySelector('h2')!.textContent?.trim() ?? '',
      높이: +h.getBoundingClientRect().height.toFixed(2),
      중심차: tile ? +(((tile.top + tile.bottom) / 2) - ((t2.top + t2.bottom) / 2)).toFixed(2) : null,
      액션: !!h.querySelector('button'),
    };
  });

/** 내 매장의 모든 섹션을 한 바퀴 돌며 헤더를 잰다. locator.click() 은 대상까지 자동 스크롤해
 *  측정을 오염시키므로(CLAUDE.md 참고 메모) evaluate 로 누른다. */
async function sweepSections(page: Page) {
  const out: ReturnType<typeof MEASURE> = [];
  for (const sel of ['[data-mystore-rail] [role=tab]', '[data-mystore-secbar] button']) {
    const n = await page.locator(sel).count();
    for (let i = 0; i < n; i++) {
      await page.evaluate(([s, k]) => { (document.querySelectorAll(s)[k as number] as HTMLElement | undefined)?.click(); },
        [sel, i] as [string, number]);
      await page.waitForTimeout(600);
      out.push(...(await page.evaluate(MEASURE)));
    }
  }
  return out;
}

// -- (1) 내 매장 섹션 헤더 정렬 (오너 스크린샷 2장 · 2026-09-18 `776c7a1`) --------------------
//
// 났던 결함(PC 에서만): `items-start` + 타일 `mt-0.5` 라 타일 중심이 제목 글자 중심보다 **4.5px 아래**였고,
// 행 높이를 글자(26.6)가 아니라 타일(31.9)이 잡아 제목 아래 5px 가 비었다 — "띠가 과하게 높다".
// 이어 `items-end` 로 고치자 **액션이 있는 포스터 섹션만** 헤더가 52 vs 45.6 으로 갈려 제목 y 가 6.4px 점프했다.
// 지금 계약: lg(1024 이상)부터 행을 액션 높이(min-h-8)로 예약하고 가운데 정렬 ->
//   **전 섹션 같은 높이 · 타일/제목 중심 일치**. 모바일(lg 미만)은 종전 그대로다.
// 고치는 파일은 공용 원자(`src/components/atoms/SectionHeader.tsx`)라 다른 팀이 만진다 — 그래서 계약이 필요하다.
test.describe('PC 내 매장 — 섹션 헤더는 액션 유무와 무관하게 같은 규격이다', () => {
  test('1440 — 전 섹션 헤더 높이 동일 · 타일/제목 중심 일치', async ({ page }) => {
    test.setTimeout(120_000);
    await bootOwner(page, { viewport: { width: 1440, height: 900 }, appSettings: { identity_voucher_enabled: 'on' } });
    await openMyStore(page);
    await expect(page.locator('[data-tab="my-store"]'), '목킹 업주로 내 매장을 열지 못했다').toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2000);

    const m = await sweepSections(page);
    console.log('[PC 1440 섹션 헤더]', JSON.stringify(m));

    // 아무것도 안 재고 초록인 것을 먼저 막는다.
    expect(m.length, '섹션 헤더를 한 개도 못 찾았다 — 셀렉터가 틀렸거나 화면이 안 열렸다').toBeGreaterThanOrEqual(10);
    expect(m.filter((x) => x.중심차 !== null).length, '타일이 붙은 헤더가 없다 — 중심차 단언이 빈 검사가 된다').toBeGreaterThan(0);
    // 🔴 액션(우측 버튼)이 있는 헤더가 한 개는 잡혀야 한다. 52 vs 45.6 으로 갈렸던 자리가 바로 거기다.
    expect(m.some((x) => x.액션), '액션 버튼이 있는 섹션 헤더를 한 번도 안 지나쳤다 — 갈림 결함을 못 잡는다').toBe(true);

    const 높이들 = [...new Set(m.map((x) => x.높이))];
    expect(높이들, '섹션마다 헤더 높이가 다르다 — 액션 유무로 갈리던 결함이다').toHaveLength(1);
    // 예전 값 45.6 / 52 를 둘 다 벗어나는 창. 1440 실측(2026-09-21) = 47.75px.
    expect(높이들[0], 'PC 섹션 헤더 높이가 예약된 행(min-h-8) 밖이다').toBeGreaterThanOrEqual(46);
    expect(높이들[0], 'PC 섹션 헤더 높이가 예약된 행(min-h-8) 밖이다').toBeLessThanOrEqual(50);

    for (const x of m) {
      if (x.중심차 == null) continue;
      expect(Math.abs(x.중심차), `타일 중심이 제목 글자 중심에서 ${x.중심차}px 어긋났다(변경 전 +4.5, 1440 실측 0) — ${x.제목}`).toBeLessThanOrEqual(0.5);
    }
  });

  // 🔴 반대쪽 반례 — PC 처방을 전 폭에 바르면 모바일이 깨진다. 실제로 그 시도가 한 번 반려됐다:
  //   모바일은 설명이 제목 아래로 내려가 블록이 64px 인데 거기서 가운데 정렬하면
  //   타일이 제목이 아니라 **설명 옆**에 뜬다(390 실측: 타일 top 2.1 -> 17.2).
  //   그래서 모바일에서는 타일이 제목보다 **아래에 남아 있어야** 정상이다(실측 +6.16px).
  test('390 — 모바일은 종전 정렬 유지(타일이 제목 위로 올라오지 않는다)', async ({ page }) => {
    test.setTimeout(120_000);
    await bootOwner(page, { viewport: { width: 390, height: 844 }, appSettings: { identity_voucher_enabled: 'on' } });
    await openMyStore(page);
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2000);

    const m = (await page.evaluate(MEASURE)).filter((x) => x.중심차 != null);
    console.log('[모바일 390 섹션 헤더]', JSON.stringify(m));
    expect(m.length, '모바일에서 타일 달린 섹션 헤더를 못 찾았다 — 이 반례가 빈 검사다').toBeGreaterThan(0);
    for (const x of m) {
      expect(x.중심차!, `모바일 타일이 제목 중심으로 올라왔다(${x.중심차}px) — lg 전용이어야 할 가운데 정렬이 샜다`).toBeGreaterThanOrEqual(3);
    }
  });
});


// -- (2) 이벤트 오버레이가 PC 에서 혼자 풀블리드였다 (오너 2026-09-18 · `45934b6`) --------------
//
// 오너: "PC 버젼에서 모든 탭이 제대로 잘 움직이다가 이벤트만 가면 갑자기 전체화면으로 바뀌면서
//        지혼자서 이상하게 돼 이 부분도 수정 다른 탭들처럼".
// 원인: 이벤트는 탭 pane 이 아니라 `fixed inset-0` 오버레이라 App 셸의 `max-w-6xl` 을 안 받았다.
// 지금 계약: 오버레이 자체는 inset-0 이되 **본문은 셸과 같은 폭**(max-w-6xl = 루트 17px 에서 1224px)이고 가운데다.
// 모바일에서는 셸도 오버레이도 화면 폭이라 이 결함은 **PC 에서만** 보인다.
//
// 🔴 **두 판을 다 잰다.** 같은 계약이 두 파일에 복제돼 있다 —
//    `EventListPage.tsx`(목록, aria-label='이벤트 목록') · `EventPage.tsx`(보드, aria-label='이벤트').
//    목록만 재면 한쪽을 지워도 초록이다(음성 대조에서 실제로 그렇게 **거짓 통과**했다).
test('PC 1440 — 이벤트 목록·보드 본문은 앱 셸과 같은 폭이다(풀블리드 금지)', async ({ page }) => {
  test.setTimeout(120_000);
  const j = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  // 라이브 이벤트 유무에 검사가 좌우되지 않게 목킹한다(라이브가 0건이면 조용히 안 열린다).
  // 🔴 절대 날짜를 박지 않는다 — Date.now() 기준 상대값이다(HANDOFF 0-a19 '픽스처의 시한폭탄').
  const SLUG = 'e2e-pc-ev';
  await page.route(/\/rest\/v1\/event_campaigns\?/, (r) => r.fulfill(j([{
    id: 'e2e-ev-1', slug: SLUG, title: '목킹 이벤트', subtitle: null, status: 'live',
    starts_at: new Date(Date.now() - 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 86_400_000).toISOString(), hidden_at: null,
  }])));
  await page.route(/\/rest\/v1\/rpc\/event_board/, (r) => r.fulfill(j({
    slug: SLUG, title: '목킹 이벤트', subtitle: null, status: 'live',
    venueId: '00000000-0000-0000-0000-000000000000', startsAt: null, endsAt: null,
    voucherTitle: '매장이용권',
    cards: [{ idx: 1, opened: true, tier: 1, count: 1, by: '누군가' }],
    myTickets: 0, remainByTier: {}, totalByTier: { 1: 1 }, voucherByTier: { 1: 1 },
  })));

  /** 오버레이 본문 = 오버레이의 직계 자식 중 가장 넓은 것(그립 같은 장식은 0~40px 라 걸리지 않는다). */
  const shellOf = (label: string) => {
    const o = document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${label}"]`);
    if (!o) return null;
    const body = [...o.children].map((c) => c.getBoundingClientRect()).reduce((a, b) => (b.width > a.width ? b : a));
    return {
      오버레이폭: +o.getBoundingClientRect().width.toFixed(1),
      본문폭: +body.width.toFixed(1),
      왼여백: +body.left.toFixed(1),
      오른여백: +(window.innerWidth - body.right).toFixed(1),
    };
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const evt = page.locator('[data-stack-tabbar]').getByRole('tab', { name: /이벤트/ });
  await expect(evt, 'PC GNB 에 이벤트 칸이 없다 — 이 검사가 아무것도 못 연다').toBeVisible({ timeout: 20_000 });
  await evt.first().click();
  await expect(page.locator('[data-testid="event-list-page"]'), '이벤트 목록이 안 열렸다').toBeVisible({ timeout: 20_000 });
  const 목록 = await page.evaluate(shellOf, '이벤트 목록');

  await page.getByTestId('event-list-item').first().click();
  await expect(page.locator('[role="dialog"][aria-label="이벤트"]'), '목록에서 보드로 못 들어갔다').toBeVisible({ timeout: 20_000 });
  const 보드 = await page.evaluate(shellOf, '이벤트');

  console.log('[PC 1440 이벤트 오버레이]', JSON.stringify({ 목록, 보드 }));

  for (const [이름, m] of [['목록', 목록], ['보드', 보드]] as const) {
    expect(m, `${이름} 오버레이를 못 찾았다 — 이 검사가 아무것도 안 쟀다`).not.toBeNull();
    expect(m!.오버레이폭, `${이름} 오버레이 자체는 inset-0 이어야 한다(스크림이 화면을 다 덮는다)`).toBe(1440);
    // 🔴 결함 당시 값은 1440(= 화면 폭 그대로). 지금은 max-w-6xl = 72rem x 17px = 1224px.
    expect(m!.본문폭, `${이름} 본문이 ${m!.본문폭}px 다 — 셸(max-w-6xl 약 1224)을 벗어나 혼자 풀블리드다`).toBeLessThanOrEqual(1230);
    expect(m!.본문폭, `${이름} 본문이 비정상적으로 좁다 — 셸 폭 계약이 아니라 다른 것을 재고 있다`).toBeGreaterThanOrEqual(1100);
    expect(Math.abs(m!.왼여백 - m!.오른여백), `${이름} 본문이 가운데가 아니다(좌 ${m!.왼여백} / 우 ${m!.오른여백})`).toBeLessThanOrEqual(1);
  }
});
