// 첫 화면 게이트 — '앱을 처음 켠 사람이 보는 것'을 못 박는다.
//
// 라이브에서 실제로 이랬다: 승인된 일정 5건이 전부 과거인데 날짜·종료 필터가 없어서,
// 첫 화면이 '종료' 카드 5장이었고 그중 두 달 전 대회가 TOP 에서 '🔥 마감 임박' 배지를 달고 있었다.
// 처음 온 사람은 '여긴 대회가 안 열리는 앱'이라고 판단하고 나간다 — 런칭 첫날의 모습이 앱의 최악 상태였다.
import { test, expect } from './_fixtures';
import { dismissOverlays } from './_session';
import { mockSchedules, MOCK_DISTINCT_DATES, MOCK_ENDED_TITLE } from './_schedules';

test.describe('첫 화면 — 앱을 막 켠 사람이 보는 것', () => {
  test.beforeEach(async ({ page }) => {
    // 라이브 일정이 0건이면 아래 정렬 검사가 통째로 skip 된다 — 고정 픽스처로 전제를 만든다(2026-09-21).
    await mockSchedules(page);
    await page.goto('/');
    // ⚠ 온보딩 시트(첫 페인트 +700ms 지연 등장)를 '클릭 전에' 걷는다 — 클릭을 먼저 하면
    //   goto(load 대기)가 홈 풀폭 배너 이미지(960 썸네일)로 모달 등장보다 늦게 풀리는 날
    //   클릭이 오버레이에 가로채여 30s 행이 된다(검증 대상과 무관한 경합 — 게이트 불변).
    await dismissOverlays(page);
    // P1: 기본 화면이 홈으로 바뀜 — 이 스펙의 대상(일정 탐색)으로 이동
    await page.getByRole('button', { name: /전체 일정/ }).first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await dismissOverlays(page);
    await page.waitForTimeout(1500);
  });

  test('🔴 아무 조건도 안 걸린 첫 화면에 끝난 대회가 카드로 뜨지 않는다', async ({ page }) => {
    // '지난 대회' 전용 섹션(🏁)은 예외 — 거기서만 보여야 한다.
    // 🔴 2026-09-21 — 이 검사는 오래 **아무것도 재지 않았다.** `toEqual([])` 형태라 목록에 끝난 대회가
    //   애초에 없으면 항상 참이고, 라이브 `schedules` 에 끝난 대회가 없었다. 그래서 픽스처에
    //   끝난 대회 1건(`_schedules.ts` 의 `d: -2`)을 일부러 넣고, 아래 **전제**를 먼저 단언한다.
    const r = await page.evaluate(() => {
      // ICON-1: 🏁 이모지 마커가 Icon 글리프로 바뀌어 텍스트 결합 셀렉터를 data-testid 로 교체(동커밋 규칙)
      const past = document.querySelector('[data-testid="past-tournaments"]')?.closest('section, div');
      const all = Array.from(document.querySelectorAll('article'));
      const main = all.filter((el) => !(past && past.contains(el)));
      return {
        mainCount: main.length,
        body: (document.body.textContent || '').replace(/\s+/g, ' '),
        ended: main.filter((el) => /종료/.test(el.textContent || ''))
          .map((el) => (el.textContent || '').replace(/\s+/g, ' ').slice(0, 60)),
      };
    });
    // 전제 ①: 목킹이 실제로 걸렸다(카드가 그려졌다). 안 걸리면 아래 단언이 공허하게 통과한다.
    expect(r.mainCount, '본문에 카드가 0장이다 — 목킹이 안 걸렸거나 화면이 안 그려졌다').toBeGreaterThan(0);
    // 전제 ②: 픽스처의 끝난 대회가 페이지에 도달했다(지난 대회 섹션이든 어디든).
    //   이게 없으면 '끝난 대회가 본문에 없다' 는 잴 대상이 없어 참이 된다.
    expect(r.body, `픽스처의 끝난 대회('${MOCK_ENDED_TITLE}')가 페이지 어디에도 없다 — 목킹이 안 걸렸다`)
      .toContain(MOCK_ENDED_TITLE);
    const endedInMain = r.ended;
    expect(endedInMain, `첫 화면 목록에 종료된 대회 카드가 있다:\n${endedInMain.join('\n')}`).toEqual([]);
  });

  test('🔴 끝난 대회에 "마감 임박" 배지가 붙지 않는다', async ({ page }) => {
    const res = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('article'));
      const out: string[] = [];
      for (const el of all) {
        const t = (el.textContent || '').replace(/\s+/g, ' ');
        if (/마감 임박/.test(t) && /종료/.test(t)) out.push(t.slice(0, 80));
      }
      return { count: all.length, out };
    });
    // 전제: 카드가 실제로 그려졌다. 0장이면 아래 단언은 아무것도 재지 않는다(2026-09-21).
    expect(res.count, '카드가 0장이다 — 목킹이 안 걸렸다').toBeGreaterThan(0);
    const bad = res.out;
    expect(bad, `종료된 대회에 '마감 임박'이 붙었다 — 거짓 긴박감:\n${bad.join('\n')}`).toEqual([]);
  });

  test('빈 화면이어도 다음에 누를 것이 있다(막다른 길이 아니다)', async ({ page }) => {
    // 🔴 2026-09-21 — beforeEach 의 mockSchedules 가 목록을 항상 채우므로 예전 형태(`test.skip(!isEmpty)`)
    //   그대로 두면 이 검사는 **영원히 건너뛴다**. 빈 상태를 일부러 만들어 실제로 재게 한다.
    //   page.route 는 **나중에 등록한 핸들러가 먼저** 걸리므로 빈 목록이 이긴다.
    await mockSchedules(page, []);
    await page.reload();
    await dismissOverlays(page);
    await page.getByRole('button', { name: /전체 일정/ }).first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await dismissOverlays(page);
    await page.waitForTimeout(1500);

    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    // 전제: 빈 화면이 실제로 나왔다. 안 나오면 아래 검사는 아무것도 재지 않는다.
    // 🔴 문구로 재지 않는다. 예전 정규식은 '예정된 대회가 없어요' 였는데 실제 문구엔 '아직' 이
    //   들어가 있어(2026-08-27 cd8ec73) **낱말 하나로 이 검사가 25일간 잠들어 있었다.**
    //   카피는 앞으로도 바뀐다 — 그래서 data-testid="schedules-empty" 로 잠근다(CLAUDE.md 처방).
    await expect(page.getByTestId('schedules-empty').first(),
      `일정 0건으로 목킹했는데 빈 상태가 안 나왔다 — 목킹이 안 걸렸거나 빈 상태가 사라졌다:\n${body.slice(0, 400)}`)
      .toBeVisible({ timeout: 15_000 });
    // 빈 상태라면 반드시 (a) 다음 행동 버튼이 있거나 (b) 지난 대회로 안내해야 한다
    const hasWayOut = /조건 초기화|전체 매장 보기|지난 대회/.test(body);
    expect(hasWayOut, `빈 화면에 다음 행동이 없다 — 막다른 길:\n${body.slice(0, 500)}`).toBe(true);
  });

  test('목록이 시간순으로 정렬된다(업주 진열 순서가 아니라)', async ({ page }) => {
    // ⚠ 첫 화면은 '오늘' 이 기본 선택이라 카드가 0~1장인 날이 많다. 그러면 정렬을 판단할 수 없어
    //   테스트가 매번 skip 됐다 — 게이트가 사실상 꺼져 있었던 것이다.
    //   날짜 조건을 풀어 예정된 대회 전체를 보이게 한 뒤에 정렬을 본다.
    // ⚠ /초기화/ 정규식은 검색창의 '검색어 초기화' X 버튼도 잡는다(그쪽이 DOM 상 먼저) —
    //   전체 초기화만 정확 매칭해야 날짜 필터가 실제로 풀린다.
    const reset = page.getByRole('button', { name: '초기화', exact: true });
    if (await reset.count()) {
      await reset.click().catch(() => {});
      await page.waitForTimeout(1500);
    }

    // ⚠ 2026-09-21 실측 — 이 추출기는 **두 가지 이유로** 항상 0장을 돌려줘 게이트가 잠들어 있었다.
    //   ① 기본 보기는 '목록 보기' 라 행이 <article> 이 아니고, 날짜는 묶음 머리글에 따로 있다.
    //   ② 실제 표기는 `9/21 (월)` 라 영카를 박은 /(\d{2})\/(\d{2})\(/ 가 영원히 안 맞는다.
    //   그래서 화면에 **보이는 그대로** 날짜 묶음 머리글을 DOM 순서대로 읽는다(= 진열 순서).
    // 🔴 2026-09-21 음성 대조가 잡은 것 — '지난 대회' 섹션을 **반드시 빼야 한다.**
    //   본문 아래의 지난 대회 묶음의 날짜 머리글까지 주워 담으면 목록 끝에 과거 날짜가 붙어,
    //   본문이 한 날짜로 줄어드는 순간 전체가 '미래→과거 역순'으로 보여 **엉뚱한 단언이 빨개진다**
    //   (실측: 목킹을 전부 같은 날로 바꿨더니 distinct 가드가 아니라 역순 단언이 터졌다).
    //   위 첫 번째 검사는 이미 past.contains 로 빼고 있었는데 여기만 빠져 있었다.
    const dates = await page.evaluate(() => {
      const past = document.querySelector('[data-testid="past-tournaments"]')?.closest('section, div');
      const out: string[] = [];
      for (const el of document.querySelectorAll('main *')) {
        if (past && past.contains(el)) continue;   // 지난 대회 아카이브는 진열 순서가 아니다
        const t = (el.textContent || '').trim();
        if (t.length > 12) continue;            // 카드 본문은 길다 — 머리글만 남긴다
        const m = /^(\d{1,2})\/(\d{1,2})\s*\(/.exec(t);
        if (!m) continue;
        const key = `${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}`;
        // 머리글을 감싼 부모도 같은 텍스트라 두 번 잡힌다 — 연속 중복만 접는다.
        if (out[out.length - 1] !== key) out.push(key);
      }
      return out;
    });
    // 데이터가 없어서 못 도는 것과 코드가 틀린 것은 다르다 — 이유를 정확히 남긴다.
    // (조건을 다 풀었는데도 2장 미만이면 DB 에 예정 대회 자체가 없다는 뜻이다.)
    // ⚠ 2026-09-21 — 예전엔 test.skip 이었고, 라이브 일정이 0건이 되자 게이트가
    //   빨개지지 않고 **조용히 꺼졌다**. mockSchedules 가 서로 다른 날짜를 보장하므로,
    //   카드가 모자라는 것은 데이터 문제가 아니라 목록이 안 그려진 결함이다.
    expect(dates.length, `정렬을 판단할 카드가 ${dates.length}장뿐이다 — 목킹한 일정이 목록에 안 나온다`)
      .toBeGreaterThanOrEqual(2);
    // ⚠ 2026-09-18 — **동점(모든 카드가 같은 날)** 을 걸러야 한다.
    //   날짜가 전부 같으면 오름차순 배열과 내림차순 배열이 **문자열까지 똑같아서**,
    //   '역순이 아니다' 라는 단언이 정상 화면에서도 무조건 실패한다(실측: dates=['0918','0918']).
    //   판단 불가와 결함은 다른 말이어야 한다.
    //   ⚠ 이 검사는 오랫동안 잠들어 있었다: 목록 줄에서 날짜가 빠져 있던 동안 dates.length 가 0 이라
    //     위 test.skip 이 항상 걸렸다. 날짜를 되돌리면서 다시 살아났다.
    const distinct = new Set(dates);
    expect(distinct.size, `보이는 카드의 날짜가 ${[...distinct].join('·')} 뿐이다 — 목킹은 서로 다른 날짜 ${MOCK_DISTINCT_DATES}종을 준다`)
      .toBeGreaterThanOrEqual(2);
    // 프리미엄 고정이 앞에 올 수 있으므로 '전체가 내림차순은 아니다' 정도로 약하게 본다:
    // 최소한 '뒤로 갈수록 과거'인 역순이면 안 된다.
    const reversed = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates.join(','), '목록이 과거→미래 역순으로 보인다').not.toBe(reversed.join(','));
  });
});
