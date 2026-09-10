import { test, expect } from './_fixtures';
import { loginAs } from './_session';

// 오너에게 보낸 전후 비교 이미지가 **실제 앱에서도 그런지** 재는 스펙(오너 지시 2026-09-06 "제대로 됐나 확인").
//
// 왜 따로 만드나: 그 이미지들은 같은 마크업을 실제 CSS 로 렌더한 '하네스' 였다.
// 하네스가 맞는 것과 앱이 맞는 것은 다른 명제다 — 컴포넌트가 그 사이에 바뀌었거나,
// 부모의 폭·패딩·다른 규칙이 끼어들면 하네스만 맞고 앱은 틀릴 수 있다. 여기서 그 간극을 없앤다.
//
// 로그인 화면이라 자격증명이 없으면 통째로 건너뛴다(다른 로그인 스펙과 같은 규약).
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.describe('오너 지적 레이아웃 — 실제 앱 실측', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 없음 — 로그인 화면은 잴 수 없다');

  test.beforeEach(async ({ page }) => {
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('C·D — 대시보드: 단계 바 노출·크기 · 헤더 날짜 위치', async ({ page }) => {
    const store = page.getByRole('button', { name: /^내 매장/ });
    test.skip(await store.count() === 0, '이 계정에는 내 매장 탭이 없다');
    await store.first().click();
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });

    // C — 진행 단계. 예전엔 대시보드 안의 숫자 스트립이었고, 오너 지적은 "동그라미가 칸에 붙었다"였다.
    //   2026-09-08 에 그 스트립을 없애고 게임 진행의 알약 바 하나로 합쳤다(한 페이지에서 왕복).
    //   그래서 여기서 재는 것도 바뀐다: 같은 지적의 알맹이는 **대시보드에서도 단계가 보이는가**와
    //   **손가락이 닿는 크기인가** 두 가지다. 기하(동그라미·연결선)는 잴 대상 자체가 사라졌다.
    const bar = page.locator('[aria-label="매장 단계 이동"]');
    await expect(bar, '대시보드에 단계 바가 없다 — 합친 뒤 대시보드에서 사라지면 통일이 아니라 삭제다').toBeVisible({ timeout: 20_000 });

    const m = await bar.evaluate((el) => ({
      넘침: el.scrollWidth - el.clientWidth,
      칸높이: Math.round(el.querySelector('[role=tab]')!.getBoundingClientRect().height),
      요약있음: [...el.querySelectorAll('[role=tab]')].some((b) => b.textContent?.trim() === '요약'),
    }));
    console.log('[C 단계 바]', JSON.stringify(m));
    expect(m.요약있음, '돌아오는 길(요약)이 바에 없다 — 그러면 왕복이 안 된다').toBe(true);
    expect(m.넘침, '단계 바가 넘쳐 마지막 단계가 잘린다').toBeLessThanOrEqual(0);
    expect(m.칸높이, '알약이 손가락에 비해 얇다').toBeGreaterThanOrEqual(32);

    // D — 스티키 헤더의 날짜가 매장명 옆에 붙어 있나(예전엔 619px 떨어져 있었다)
    // ⚠ '.truncate' 만으로는 페이지 제목('내 매장')이 잡힌다 — 매장명은 text-base·font-bold 다.
    //   날짜는 그 형제 span(text-2xs·tabular-nums). 둘 다 실제로 그려진 것만 잰다(left>0).
    const gap = await page.evaluate(() => {
      const name = [...document.querySelectorAll('[data-tab="my-store"] span.truncate.text-base')]
        .find((e) => e.getBoundingClientRect().width > 0);
      if (!name) return null;
      const date = [...(name.parentElement?.querySelectorAll('span') ?? [])]
        .find((s) => /\d{2}\.\d{2}/.test(s.textContent || '') && s.getBoundingClientRect().width > 0);
      if (!date) return null;
      return Math.round(date.getBoundingClientRect().left - name.getBoundingClientRect().right);
    });
    console.log('[D 헤더 날짜] 매장명→날짜 거리(px):', gap);
    expect(gap, '헤더의 매장명·날짜를 못 찾았다 — 셀렉터가 화면과 어긋났다').not.toBeNull();
    expect(gap!, '날짜가 아직 오른쪽 끝에 홀로 떨어져 있다(예전 619px)').toBeLessThan(60);
    expect(gap!, '날짜가 매장명과 겹친다').toBeGreaterThanOrEqual(0);
  });

  test('A·B — 매출·손님: StatCard 숫자 밑변 · Mini 숫자 시작점', async ({ page }) => {
    const store = page.getByRole('button', { name: /^내 매장/ });
    test.skip(await store.count() === 0, '이 계정에는 내 매장 탭이 없다');
    await store.first().click();
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });

    // 대시보드의 '최근 7일 추세' 카드가 통계 화면으로 가는 실제 진입점이다
    // (섹션 버튼은 접힌 메뉴 안이라 폭 0 — 실측으로 확인).
    // ⚠ 셀렉터를 배지 문구에 묶지 않는다: 여기는 폴백 없는 .first() + test.skip 이라
    //   문구가 바뀌면 **실패가 아니라 조용한 skip** 으로 게이트가 무력화된다(2026-09-11 실제로 그럴 뻔했다).
    const stats = page.locator('button:has([data-testid="dash-stats-link"])').first();
    test.skip(await stats.count() === 0, '통계 진입점을 못 찾았다');
    await stats.click();
    // 통계 패널의 표식
    const panel = page.getByText('총 바이인').first();
    await expect(panel).toBeVisible({ timeout: 25_000 });

    const m = await page.evaluate(() => {
      const sp = (a: number[]) => (a.length ? Math.round(Math.max(...a) - Math.min(...a)) : -1);
      const txtRect = (el: Element) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };

      // StatCard 한 행 = '총 바이인 / 할인 바인 / 총 할인액'
      const head = [...document.querySelectorAll('p')].find((p) => p.textContent?.trim() === '총 바이인');
      const row = head?.closest('.grid');
      const statVals = row ? [...row.querySelectorAll(':scope > div > p.text-lg')].map((e) => Math.round(e.getBoundingClientRect().bottom)) : [];

      // Mini 한 행 — text-base 값
      const miniRow = [...document.querySelectorAll('.grid')].find((g) =>
        g.querySelectorAll(':scope > div > p.text-base').length >= 3);
      const miniLefts = miniRow
        ? [...miniRow.querySelectorAll(':scope > div')].map((tile) => {
            const v = tile.querySelector('p.text-base');
            return v ? Math.round(txtRect(v).left - tile.getBoundingClientRect().left) : NaN;
          }).filter((n) => !Number.isNaN(n))
        : [];

      return { statCount: statVals.length, statBottomSpread: sp(statVals), miniCount: miniLefts.length, miniLeftSpread: sp(miniLefts), miniLefts };
    });
    console.log('[A StatCard]', JSON.stringify({ n: m.statCount, 밑변어긋남: m.statBottomSpread }));
    console.log('[B Mini]', JSON.stringify({ n: m.miniCount, 시작점어긋남: m.miniLeftSpread, lefts: m.miniLefts }));

    if (m.statCount >= 2) expect(m.statBottomSpread, 'StatCard 숫자 밑변이 어긋난다(하네스에선 18→0 이었다)').toBe(0);
    if (m.miniCount >= 2) expect(m.miniLeftSpread, 'Mini 숫자 시작점이 어긋난다(하네스에선 34→0 이었다)').toBe(0);
  });

  test('GTO 도구 — 공유 버튼이 제목줄에 있다(본문 위에 홀로 떠 있지 않다)', async ({ page }) => {
    await page.getByRole('navigation', { name: '하단 내비게이션' }).getByRole('button', { name: 'GTO', exact: true }).click();
    const card = page.getByRole('button', { name: /프리플랍 레인지 차트/ }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click();

    const share = page.getByRole('button', { name: /링크 공유/ });
    await expect(share, '공유 버튼이 없다').toBeVisible({ timeout: 20_000 });

    const m = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /링크 공유/.test(b.getAttribute('aria-label') || ''));
      if (!btn) return null;
      const hdr = btn.closest('header');
      const title = document.getElementById('modal-title');
      return {
        헤더안에있나: !!hdr,
        // 제목과 같은 줄인가(세로 중심이 12px 안)
        제목과같은줄: title ? Math.abs(
          (btn.getBoundingClientRect().top + btn.getBoundingClientRect().height / 2) -
          (title.getBoundingClientRect().top + title.getBoundingClientRect().height / 2)) : 999,
      };
    });
    console.log('[공유 버튼]', JSON.stringify(m));
    expect(m, '공유 버튼을 못 찾았다').not.toBeNull();
    expect(m!.헤더안에있나, '공유가 아직 본문에 있다 — 제목줄로 올라가야 한다').toBe(true);
    expect(m!.제목과같은줄, '공유가 제목과 다른 줄에 있다').toBeLessThanOrEqual(12);
  });

  test('캘린더 — 내가 적는 기록: 날짜·메모 오른쪽 변 일치 · 컨트롤 높이 통일', async ({ page }) => {
    // ⚠ 매장 계정에는 하단 '캘린더' 탭이 없다(5번째 칸이 '내 매장'). 대신 **내 매장 안의 '내 캘린더' 섹션**이
    //   같은 CalendarPanel 을 쓴다(VenueManageTab.tsx:165 — 중복 구현 금지). 그래서 판이 아니라 그 섹션에서 잰다.
    const store = page.getByRole('button', { name: /^내 매장/ });
    test.skip(await store.count() === 0, '이 계정에는 내 매장 탭이 없다');
    await store.first().click();
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });

    // ⚠ 섹션 버튼('내 캘린더' 등)은 접힌 메뉴 안에 있어 폭이 0이다 — 먼저 그 메뉴를 열어야 한다.
    //   (실측으로 알아냈다: 보이는 건 '대시보드 메뉴' 하나뿐이고 나머지는 전부 w=0이었다.)
    await page.evaluate(() => {
      const menu = [...document.querySelectorAll('[data-tab="my-store"] button')]
        .find((b) => /메뉴/.test(b.textContent || '') && b.getBoundingClientRect().width > 0);
      (menu as HTMLButtonElement | undefined)?.click();
    });
    const calChip = page.getByRole('button', { name: '내 캘린더' }).first();
    await expect(calChip, '내 매장 안에 "내 캘린더" 섹션이 없다').toBeVisible({ timeout: 20_000 });
    await calChip.click();

    const dateInput = page.locator('[data-tab="my-store"] input[type="date"][aria-label="날짜"]');
    await expect(dateInput, '내가 적는 기록 카드가 안 뜬다').toBeVisible({ timeout: 20_000 });

    const m = await page.evaluate(() => {
      const root = '[data-tab="my-store"] ';
      const d = document.querySelector(root + 'input[type="date"][aria-label="날짜"]') as HTMLElement;
      const memo = document.querySelector(root + 'input[aria-label="메모"], ' + root + 'input[aria-label="일정 내용"]') as HTMLElement;
      if (!d || !memo) return null;
      const dr = d.getBoundingClientRect(), mr = memo.getBoundingClientRect();
      const amt = document.querySelector(root + 'input[aria-label="금액"]') as HTMLElement | null;
      const minus = [...document.querySelectorAll(root + 'button')]
        .find((b) => b.getAttribute('aria-label') === '마이너스로 기록');
      return {
        오른쪽변_차이: Math.round(Math.abs(dr.right - mr.right)),
        날짜높이: Math.round(dr.height), 메모높이: Math.round(mr.height),
        // 6칸 그리드의 목적 — 윗줄 금액칸과 아랫줄 마지막 버튼의 오른쪽 변도 같아야 한다
        금액_마이너스_오른쪽차: amt && minus
          ? Math.round(Math.abs(amt.getBoundingClientRect().right - minus.getBoundingClientRect().right)) : null,
      };
    });
    console.log('[캘린더 기록 카드]', JSON.stringify(m));
    expect(m, '기록 카드를 못 찾았다').not.toBeNull();
    expect(m!.오른쪽변_차이, '날짜칸과 메모칸의 오른쪽 변이 어긋난다(하네스에선 11→0 이었다)').toBeLessThanOrEqual(1);
    expect(Math.abs(m!.날짜높이 - m!.메모높이), '컨트롤 높이가 줄마다 다르다').toBeLessThanOrEqual(1);
    expect(m!.날짜높이, '터치 타깃 44px 미만').toBeGreaterThanOrEqual(43);
    if (m!.금액_마이너스_오른쪽차 !== null) {
      expect(m!.금액_마이너스_오른쪽차, '두 줄의 오른쪽 끝이 안 맞는다').toBeLessThanOrEqual(1);
    }
  });
});
