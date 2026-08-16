// 부팅 예산 게이트 — '첫 화면에 필요 없는 것'이 앱과 경쟁하지 않는지 실측한다.
//
// 라이브에서 이랬다: adsbygoogle.js 가 t=23ms 로 앱 번들과 '같은 순간' 출발해 decoded 665KB 를
// 파싱했고(앱 셸 839KB 의 80%), 정작 src 에 광고 슬롯은 0개였다(Auto Ads 전용).
// 그리고 idle 프리페치가 역할 게이팅 없이 업주 전용 청크(VenueManageTab 306KB +
// LedgerStatsPanel 155KB)를 **비로그인 손님에게도** 내려받았다.
//
// 이런 종류는 코드를 읽어서는 '언제 시작하는지'를 알 수 없다 — 네트워크 타임라인으로만 보인다.
// ⚠ @boot 태그가 붙은 두 테스트는 **단일 워커로 따로 돌린다**(npm run test:e2e:boot).
//   '무엇이 먼저 출발했는가' 를 재는 테스트라, 워커 6개가 CPU 를 다투는 상태에서는
//   측정 대상 자체가 왜곡된다(실제로 세 번 중 한두 번 뒤집혔다).
//   간헐 실패를 방치하면 사람들이 재실행으로 넘기기 시작하고, 그러면 진짜 회귀도 같이 넘어간다.
//   그렇다고 skip 으로 꺼두면 '조용히 안 도는 테스트' 가 된다 — 그래서 끄지 않고 **분리**했다.
//   나머지 정적·결정적 검사(<head> 확인, 손님에게 업주 청크 금지)는 기본 스위트에 그대로 남는다.
import { test, expect } from '@playwright/test';
import { dismissOverlays } from './_session';

test.describe('부팅 예산 — 첫 화면과 경쟁하는 것이 없어야 한다', () => {
  test('🔴 서드파티(GA·AdSense)가 사용자 데이터보다 먼저 출발하지 않는다 @boot', async ({ page }) => {
    // ⚠ 측정 방법을 두 번 갈아엎었다 — 무엇을 재는지가 이 테스트의 전부다.
    //   1차 Date.now(): 재는 쪽(테스트 프로세스)이 부하를 받으면 시각이 어긋났다.
    //   2차 request 이벤트 순서: 로컬 프리뷰가 너무 빨라 부팅 전체가 한 145ms 배치에 들어가고,
    //     Playwright 는 같은 배치 안에서 발행 순서를 보존하지 않았다(fetch 보다 <script> 가
    //     먼저 찍힘 — 실제로는 데이터가 먼저 나갔는데도 실패했다).
    //   3차(현재): **브라우저 자신의 Resource Timing** 을 읽는다. startTime 은 요청을 개시한
    //     시각을 서브 ms 로 기록하므로, 같은 밀리초에 몰려도 순서가 정확하다.
    //     재는 자가 밖(테스트 프로세스)에 있으면 흔들린다 — 안(브라우저)의 시계를 믿는다.
    await page.goto('/');
    await dismissOverlays(page);
    await page.waitForTimeout(4000); // 서드파티가 출발할 시간(신호 게이트 + 유휴)을 준다

    const t = await page.evaluate(() => {
      const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const first = (re: RegExp) => {
        const hit = res.filter((r) => re.test(r.name)).sort((a, b) => a.startTime - b.startTime)[0];
        return hit ? Math.round(hit.startTime * 100) / 100 : null;
      };
      return {
        data: first(/\/rest\/v1\/schedules/),
        third: first(/googletagmanager|pagead2\.googlesyndication|doubleclick/),
      };
    });

    expect(t.data, '첫 화면 데이터(schedules) 요청이 아예 관측되지 않았다').not.toBeNull();
    if (t.third === null) return; // 서드파티가 아예 안 왔다(차단 환경 등) — 경쟁 자체가 없으니 통과
    expect(
      t.data!,
      `서드파티(${t.third}ms)가 첫 화면 데이터(${t.data}ms)보다 먼저 출발했다 — main.tsx 신호 게이트 확인`,
    ).toBeLessThan(t.third!);
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

  test('첫 화면 데이터 요청이 프리페치보다 먼저 나간다 @boot', async ({ page }) => {
    // ⚠ 처음엔 Date.now() 로 두 요청의 시각을 재서 비교했다. 단독 실행에서는 통과하는데
    //   전체 스위트를 워커 6개로 돌리면 간헐 실패했다 — 재는 쪽(테스트 프로세스)이 부하를 받아
    //   타임스탬프가 실제 요청 순서와 어긋났기 때문이다. 순서를 물으면서 시계를 재고 있었던 셈이다.
    //   request 이벤트는 이미 발생 순서대로 도착하므로 **배열에 담긴 순서 자체**를 보면 된다.
    //   (간헐 실패는 '가끔 빨간 테스트' 로 끝나지 않는다 — 사람들이 재실행으로 넘기기 시작하면
    //    진짜 회귀도 같은 방식으로 넘어간다.)
    //   …인데 그 '배열 순서' 도 로컬 프리뷰에서는 무너졌다 — 부팅 전체가 한 145ms 배치에
    //   들어가면 Playwright 는 배치 안 발행 순서를 보존하지 않는다(서드파티 테스트와 동일 결함).
    //   최종형: **브라우저 자신의 Resource Timing**(서브 ms startTime)을 읽는다.
    await page.goto('/');
    await dismissOverlays(page);
    await page.waitForTimeout(6000);

    const t = await page.evaluate(() => {
      const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const first = (re: RegExp) => {
        const hit = res.filter((r) => re.test(r.name)).sort((a, b) => a.startTime - b.startTime)[0];
        return hit ? Math.round(hit.startTime * 100) / 100 : null;
      };
      return {
        data: first(/\/rest\/v1\/schedules/),
        prefetch: first(/\/assets\/(CommunityTab|MarketplaceTab|ToolsPanel|VenuePage)-/),
      };
    });
    expect(t.data, '첫 화면 데이터(schedules) 요청이 아예 관측되지 않았다').not.toBeNull();
    if (t.prefetch === null) return; // 프리페치가 아직 안 돌았다면 순서를 따질 것도 없이 통과
    expect(t.data!, `프리페치(${t.prefetch}ms)가 첫 화면 데이터(${t.data}ms)보다 먼저 나갔다`)
      .toBeLessThan(t.prefetch!);
  });
});
