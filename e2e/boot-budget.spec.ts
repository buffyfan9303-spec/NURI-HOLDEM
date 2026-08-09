// 부팅 예산 게이트 — '첫 화면에 필요 없는 것'이 앱과 경쟁하지 않는지 실측한다.
//
// 라이브에서 이랬다: adsbygoogle.js 가 t=23ms 로 앱 번들과 '같은 순간' 출발해 decoded 665KB 를
// 파싱했고(앱 셸 839KB 의 80%), 정작 src 에 광고 슬롯은 0개였다(Auto Ads 전용).
// 그리고 idle 프리페치가 역할 게이팅 없이 업주 전용 청크(VenueManageTab 306KB +
// LedgerStatsPanel 155KB)를 **비로그인 손님에게도** 내려받았다.
//
// 이런 종류는 코드를 읽어서는 '언제 시작하는지'를 알 수 없다 — 네트워크 타임라인으로만 보인다.
import { test, expect } from '@playwright/test';
import { dismissOverlays } from './_session';

test.describe('부팅 예산 — 첫 화면과 경쟁하는 것이 없어야 한다', () => {
  test('🔴 서드파티(GA·AdSense)가 사용자 데이터보다 먼저 출발하지 않는다', async ({ page }) => {
    // ⚠ 절대 시간(예: 3초)으로 단언하지 않는다 — 머신 속도에 따라 흔들리는 테스트가 된다.
    //   의미 있는 불변식은 '경주 순서'다: 사용자가 기다리는 것이 먼저 출발했는가.
    //   빠른 로컬에서도 느린 실기기에서도 똑같이 참이어야 하는 조건이다.
    let firstData = Infinity;
    let firstThird = Infinity;
    const t0 = Date.now();
    page.on('request', (r) => {
      const u = r.url();
      const t = Date.now() - t0;
      if (/\/rest\/v1\/schedules/.test(u)) firstData = Math.min(firstData, t);
      else if (/googletagmanager|pagead2\.googlesyndication|doubleclick/.test(u)) firstThird = Math.min(firstThird, t);
    });

    await page.goto('/');
    await dismissOverlays(page);
    await page.waitForTimeout(4000);

    // 서드파티가 아예 안 왔으면 그것도 통과(차단 환경 등)
    test.skip(firstData === Infinity, '첫 화면 데이터 요청이 관측되지 않음');
    expect(
      firstThird,
      `서드파티(${firstThird}ms)가 첫 화면 데이터(${firstData}ms)보다 먼저 출발했다 — <head> 로 되돌아갔는지 확인`,
    ).toBeGreaterThan(firstData);
  });

  test('index.html <head> 에 서드파티 스크립트가 없다(정적 회귀 방지)', async ({ page }) => {
    // 위 순서 테스트는 타이밍에 의존하므로, '되돌아감' 자체는 정적으로도 못 박는다.
    const res = await page.request.get('/');
    const html = await res.text();
    const head = html.split('</head>')[0];
    for (const bad of ['googletagmanager.com/gtag', 'pagead2.googlesyndication.com']) {
      expect(head, `<head> 에 ${bad} 스크립트가 다시 들어왔다 — main.tsx 의 지연 주입을 쓸 것`)
        .not.toContain(bad);
    }
  });

  test('🔴 비로그인 손님에게 업주 전용 청크가 내려가지 않는다', async ({ page }) => {
    const ownerChunks: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (/\/assets\/(VenueManageTab|LedgerStatsPanel|StaffPayroll|VoucherManage)-/.test(u)) {
        ownerChunks.push(u.split('/assets/')[1]);
      }
    });

    await page.goto('/');           // 로그인하지 않은 상태
    await dismissOverlays(page);
    await page.waitForTimeout(6000); // idle 프리페치가 돌 시간을 충분히 준다

    expect(ownerChunks, `손님에게 업주 청크가 내려갔다(수백 KB 낭비):\n${ownerChunks.join('\n')}`)
      .toEqual([]);
  });

  test('첫 화면 데이터 요청이 프리페치보다 먼저 나간다', async ({ page }) => {
    const marks: { t: number; kind: 'data' | 'prefetch' }[] = [];
    const t0 = Date.now();
    page.on('request', (r) => {
      const u = r.url();
      if (/\/rest\/v1\/schedules/.test(u)) marks.push({ t: Date.now() - t0, kind: 'data' });
      else if (/\/assets\/(CommunityTab|MarketplaceTab|ToolsPanel|VenuePage)-/.test(u)) marks.push({ t: Date.now() - t0, kind: 'prefetch' });
    });

    await page.goto('/');
    await dismissOverlays(page);
    await page.waitForTimeout(6000);

    const firstData = marks.find((m) => m.kind === 'data');
    const firstPrefetch = marks.find((m) => m.kind === 'prefetch');
    test.skip(!firstData || !firstPrefetch, '데이터 또는 프리페치 요청이 관측되지 않음');
    expect(firstData!.t, `프리페치(${firstPrefetch!.t}ms)가 첫 화면 데이터(${firstData!.t}ms)보다 먼저 나갔다`)
      .toBeLessThan(firstPrefetch!.t);
  });
});
