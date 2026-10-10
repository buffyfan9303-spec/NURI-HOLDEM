// 제목 줄 정렬 회귀 게이트(2026-10-02, 오너 원문: 내 매장 모바일 요약 '최근 7일 흐름' 의 '통계 →' 가 제목보다 아래 —
// "정렬이 이런 부분도 찾아서 전체 다 수정해줘").
//
// 측정 정의는 `e2e/_align.ts` 머리말. 결함 = 제목 글자 vs 오른쪽 액션(F1)·옆 글자(F3) 세로 중심 차 > 1px,
// 또는 items-baseline 행의 실제 기준선 퍼짐(F2) > 1px.
//
// 화면 12곳(모바일 390 = 유저 탭, PC 1440 = 관리자·내 매장). 각 화면은 **꼭 잡혀야 하는 행**을 이름으로 단언한다 —
// 측정 대상이 사라져 0건으로 통과하는 것을 막는다(데이터는 전부 목킹: 일정·클락·매장·후기).
//
// 수정 전 실측(base 빌드): 라이브 '진행 중 대회' vs 정렬/새로고침 390 5.53px·1440 2.97px(items-start) ·
//   GTO 레인 머리줄 기준선 2.13px(아이콘으로 시작하는 inline-flex 제목 — '자주 쓰는 도구' 는 10-06 부터 아이콘 없는 기준선 행) · 내 매장 모바일 섹션 머리줄(공용 SectionHeader)
//   제목 vs ⓘ·새로고침 5.44px · 매장 후기 '방문 후기' vs 평점(별 아이콘으로 시작하는 flex).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { kstToday } from '../src/lib/kst';
import { dismissOverlays, stubLogin } from './_session';
import { bootOwner } from './_mockOwner';
import { measureAlign, misaligned, type AlignRow } from './_align';

const VENUE = '44444444-4444-4444-8444-444444444444';
const TODAY = kstToday(Date.now());
const ROWS = [0, 1].map((i) => ({
  id: `align-sched-${i}`, title: i ? '정렬 측정 데일리' : '정렬 측정 메인', venue_id: VENUE, pub_name: '정렬 측정 홀덤펍',
  region: '서울', address: '서울 강남구 1', date: TODAY, start_time: i ? '19:00:00' : '18:00:00', duration: '6시간',
  format: 'NLH', guaranteed: true, prize_pool: 1_000_000, prize_percent: null, is_competition: false, grade: 'daily',
  blinds: null, poster_url: null, poster_color: null, buy_in: { amount: 50_000, gameType: '홀덤' },
  display_order: i, is_premium: false, owner_id: VENUE, approved: true, unread_qna_count: 0, view_count: 1,
  premium_until: null, reg_close_time: null, structure: { lateRegLevels: 8, startingChips: 30_000 },
}));
/** 진행 중 클락 2개 — 홈 '지금 등록 가능' 과 라이브 '진행 중 대회'(2개 이상이라 정렬 칩도 뜬다)를 만든다. */
const CLOCKS = ROWS.map((s, i) => ({
  venue_id: VENUE, game_seq: i + 1, session_date: TODAY, title: s.title, current_index: 0, running: true,
  ends_at: new Date(Date.now() + 20 * 60_000).toISOString(), remaining_ms: 20 * 60_000,
  adj_entries: 12, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 3, live_stats: null,
  config: { title: s.title, regCloseLevel: 5, levels: Array.from({ length: 12 }, (_, k) => ({ kind: 'level', sb: 100 * (k + 1), bb: 200 * (k + 1), ante: 0, minutes: 25 })) },
}));
const VENUE_ROW = {
  id: VENUE, name: '정렬 측정 홀덤펍', region: '서울', address: '서울 강남구 1', approved: true, status: 'active',
  kind: 'venue', is_paid_ad: false, display_order: 1, follower_count: 3, rating: 4.5, owner_id: VENUE,
};
const REVIEWS = [5, 4].map((rating, i) => ({
  id: `align-rev-${i}`, venue_id: VENUE, user_id: `00000000-0000-4000-8000-00000000r${i}0`, nickname: `후기${i}`,
  rating, content: '좋아요', created_at: '2026-09-20T10:00:00Z', updated_at: '2026-09-20T10:00:00Z',
}));

/** 핸들러 하나로 앱 밖 요청을 전부 끝낸다(실네트워크 0 — home-flow-fit 과 같은 조리법). */
async function mockAll(page: Page) {
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const single = /vnd\.pgrst\.object/.test(req.headers()['accept'] ?? '');
    const json = (b: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (req.method() !== 'GET' && !/\/rpc\//.test(url)) return route.abort('blockedbyclient');
    if (/\/rest\/v1\/schedules/.test(url)) return json(single ? ROWS[0] : ROWS);
    if (/\/rest\/v1\/clock_states/.test(url)) return json(CLOCKS);
    if (/\/rest\/v1\/venues/.test(url)) return json(single ? VENUE_ROW : [VENUE_ROW]);
    if (/\/rest\/v1\/venue_reviews/.test(url)) return json(REVIEWS);
    if (/\/rest\/v1\//.test(url)) return json(single ? null : []);
    if (/supabase\.co/.test(url)) return json({});
    return route.abort('blockedbyclient');
  });
}

async function open(page: Page, width: number, q: string) {
  await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 });
  await page.goto(`/?${q}`);
  await dismissOverlays(page);
}

function report(rows: AlignRow[]) {
  return rows.map((r) => `${r.kind} ${r.diff}px · ${r.title} ↔ ${r.other} · ${r.cls}`).join('\n');
}

/** 화면 하나를 재고: 꼭 있어야 할 행(이름)이 잡혔는지 + 어긋난 행이 0 인지. */
async function check(page: Page, must: { kind: AlignRow['kind']; title: RegExp }[], f3: string[] = []) {
  const rows = await measureAlign(page, f3);
  // 수집 전량을 주석으로 남긴다(json 리포터로 전후 측정표를 뽑을 때 쓴다 — 통과해도 숫자가 보이게).
  test.info().annotations.push({ type: 'align-rows', description: report(rows) });
  for (const m of must) {
    expect(rows.some((r) => r.kind === m.kind && m.title.test(r.title)),
      `측정 대상 '${m.title}'(${m.kind}) 이 안 잡혔다 — 0건 통과 방지\n수집:\n${report(rows)}`).toBe(true);
  }
  expect(misaligned(rows), `제목 줄 정렬 어긋남(>1px)\n${report(misaligned(rows))}`).toEqual([]);
  return rows;
}

test.describe('제목 줄 정렬 — 제목 글자와 오른쪽 액션·옆 글자의 세로 중심/기준선', () => {
  test('① 홈 390 — 지금 등록 가능 | 라이브', async ({ page }) => {
    await mockAll(page);
    await open(page, 390, 'tab=home');
    await expect(page.getByRole('heading', { name: /지금 등록 가능/ })).toBeVisible({ timeout: 15_000 });
    await check(page, [{ kind: 'F1', title: /지금 등록 가능/ }, { kind: 'F2', title: /일정/ }]);
  });

  test('② 홈 1440', async ({ page }) => {
    await mockAll(page);
    await open(page, 1440, 'tab=home');
    await expect(page.getByRole('heading', { name: /지금 등록 가능/ })).toBeVisible({ timeout: 15_000 });
    await check(page, [{ kind: 'F1', title: /지금 등록 가능/ }]);
  });

  for (const w of [390, 1440]) {
    test(`③ 라이브 ${w} — 진행 중 대회 | 정렬·새로고침`, async ({ page }) => {
      await mockAll(page);
      await open(page, w, 'tab=live');
      await expect(page.getByRole('heading', { name: /진행 중 대회/ })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[data-live-sortbar]')).toBeVisible();
      await check(page, [{ kind: 'F1', title: /진행 중 대회/ }]);
    });
  }

  for (const w of [390, 1440]) {
    // 2026-10-06 오너 시안(PR #191): '자주 쓰는 도구' 머리줄은 아이콘 없이 제목 18 | 개수 14 | 부제 12.75 를 **기준선**에 맞춘 한 줄이다
    //   (글자 크기가 달라 세로 중심은 원래 다르다 — 계약은 기준선 일치). items-baseline 행이라 F2(실제 기준선 퍼짐)로 잰다.
    //   나머지 레인 머리줄(아이콘으로 시작하는 inline-flex 제목 | N개)은 종전대로 F3 로 3곳 이상.
    test(`④ GTO ${w} — 자주 쓰는 도구(제목 | 개수 | 부제 기준선) · 레인 머리줄(아이콘 제목 | N개)`, async ({ page }) => {
      await mockAll(page);
      await open(page, w, 'tab=tools');
      await expect(page.locator('[data-tools-lanepanel]')).toBeVisible({ timeout: 15_000 });
      const head = page.getByTestId('tools-featured').locator('[data-lane-head]');
      await expect(head.getByRole('heading', { name: '자주 쓰는 도구' })).toBeVisible();
      const rows = await check(page, [{ kind: 'F2', title: /^자주 쓰는 도구$/ }], ['[data-lane-head]:has(> h2.inline-flex)']);
      const feat = rows.filter((r) => r.kind === 'F2' && /^자주 쓰는 도구$/.test(r.title));
      expect(feat.length, "'자주 쓰는 도구' 머리줄이 기준선 행(F2)으로 정확히 한 번 잡혀야 한다").toBe(1);
      // 같은 줄에 개수·부제가 **둘 다** 들어와야 '세 요소 기준선 일치' 가 측정된 것이다(하나만 재고 통과하는 것 방지).
      expect(feat[0].other, `개수·부제가 제목과 같은 줄에서 재이지 않았다: ${feat[0].other}`).toMatch(/^\d+ \/ (스팟|즐겨찾기)/); // 개수 숫자 "4" · 부제
      expect(Math.abs(feat[0].diff), `제목·개수·부제 기준선이 어긋났다(${feat[0].diff}px)`).toBeLessThanOrEqual(1);
      expect(rows.filter((r) => r.kind === 'F3').length, '레인 머리줄이 3곳 이상 잡혀야 한다').toBeGreaterThanOrEqual(3);
    });
  }

  test('⑤ 커뮤니티 390', async ({ page }) => {
    await mockAll(page);
    await open(page, 390, 'tab=community');
    // 처음 섹션은 게시판(오너 2026-10-10)이다 — 매장 머리줄('전체' | N개 | 정렬 안내, items-baseline)은 홀덤펍에 있어 직접 연다.
    const venuesTab = page.locator('[data-community-secbar]').getByTestId('sec-tab-venues');
    await venuesTab.click();
    await expect(venuesTab, '홀덤펍이 열리지 않았다').toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-sec="venues"] h2', { hasText: /^전체$/ }).filter({ visible: true }), "홀덤펍 머리줄 '전체' 가 안 그려졌다").toHaveCount(1, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    const rows = await check(page, [{ kind: 'F2', title: /^전체$/ }]);
    expect(rows.length, '커뮤니티 머리줄이 잡혀야 한다').toBeGreaterThan(0);
  });

  test('⑥ 캘린더 390(로그인 — 날짜 기록 머리줄)', async ({ page }) => {
    await mockAll(page);
    await stubLogin(page);
    await open(page, 390, 'tab=calendar');
    await page.waitForTimeout(1500);
    const rows = await check(page, [{ kind: 'F2', title: /기록/ }]);
    expect(rows.length, '캘린더 기록 머리줄이 잡혀야 한다').toBeGreaterThan(0);
  });

  test('⑦ 매장 페이지 390 — 방문 후기 | 평점', async ({ page }) => {
    await mockAll(page);
    await open(page, 390, `venue=${VENUE}`);
    const head = page.getByRole('heading', { name: '방문 후기' });
    await head.scrollIntoViewIfNeeded({ timeout: 15_000 });
    await expect(page.getByText('4.5', { exact: true })).toBeVisible();
    await check(page, [{ kind: 'F3', title: /방문 후기/ }], ['section div:has(> h3 + span)']);
  });

  for (const w of [390, 1440]) {
    test(`⑧ 내 매장 ${w} — 공용 SectionHeader 제목 | 액션`, async ({ page }) => {
      // 일정(schedules)은 '조회 성공·0건'으로 고정한다 — 목이 없으면 가짜 인증으로 실제 조회가 나가 실패 상태가 생길 수 있어 '게임 목록을(를) 불러오지 못했어요'
      //   오류 카드(모바일 2줄 span)가 정상 화면에 끼어든다(실패 상태 자체는 store-dashboard-schedules-error-1009 가 잰다).
      let scheduleGets = 0;
      await bootOwner(page, {
        viewport: { width: w, height: w > 1000 ? 900 : 844 }, goto: false,
        extra: async (p) => {
          await p.route(/\/rest\/v1\/schedules\?/, (r) => {
            if (r.request().method() !== 'GET') return r.fallback();
            scheduleGets += 1;
            return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
          });
        },
      });
      await page.goto('/?tab=my-store');
      await dismissOverlays(page);
      await expect(page.locator('main header h2:visible').first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      // 정상 조회가 실제로 끝났고(목 응답을 받았고) 오류 카드가 없는 화면에서 잰다 — 오류 화면을 정렬 결함으로 오판하지 않게.
      expect(scheduleGets, '일정 조회(schedules GET)가 한 번도 나가지 않았다 — 목이 안 걸렸다').toBeGreaterThan(0);
      await expect(page.getByText('게임 목록을(를) 불러오지 못했어요', { exact: false })).toHaveCount(0);
      await expect(page.getByText('대회 일정을 불러오지 못했어요')).toHaveCount(0);
      // 모바일은 '오늘 장부 요약' 머리줄 + 새로고침(⟳) 이 꼭 잡혀야 한다. PC 는 대시보드 머리줄(매장명 + 새로고침).
      await check(page, [{ kind: 'F1', title: w < 1024 ? /오늘 장부 요약/ : /테스트 홀덤펍/ }]);

      // 🔴 공용 SectionHeader(atoms/SectionHeader.tsx) — '포스터' 단계는 액션(ⓘ·+ 새 게임)이 붙는 유일한 레일 단계다.
      //   예전엔 이 줄이 대시보드만 열어서 SectionHeader 의 제목↔액션이 한 번도 재이지 않았다(PC 는 `/./` 가 엉뚱한 행으로 채워졌다).
      //   (2026-10-02 독립 검토: 설명 두 줄 헤더·ⓘ 펼침에서 액션이 제목 첫 줄이 아니라 묶음 가운데로 21.58px 어긋난 결함을 못 잡았다.)
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-mystore-rail] [role=tab]')].find((b) => b.textContent?.trim() === '포스터')?.click());
      await expect(page.locator('[data-tab="my-store"] h2:visible', { hasText: '포스터' }).first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(800);
      await check(page, [{ kind: 'F1', title: /^포스터$/ }]);
      if (w < 1024) {
        // 모바일 ⓘ 펼침 = 설명이 제목 아래로 두 줄 내려간 헤더 — 그래도 ⓘ 는 제목 첫 줄 가운데에 있어야 한다.
        await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-desc-toggle]')].find((x) => x.getBoundingClientRect().height > 0)?.click());
        await expect(page.locator('[data-desc-toggle][aria-expanded="true"]:visible').first()).toBeVisible();
        await page.waitForTimeout(800);
        const open = await check(page, [{ kind: 'F1', title: /^포스터$/ }]);
        expect(open.filter((r) => r.kind === 'F1' && /^포스터$/.test(r.title)).length, 'ⓘ 펼침 헤더가 F1 에서 빠졌다(제외 규칙이 SectionHeader 를 삼켰다)').toBeGreaterThan(0);
      }
    });
  }

  test('⑨ 관리자 1440', async ({ page }) => {
    await mockAll(page);
    await stubLogin(page, { role: 'admin' });
    await open(page, 1440, 'tab=admin');
    await expect(page.locator('[data-admin-secbar]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    // 공용 SectionHeader(제목 + 설명, 같은 줄)의 기준선 — '운영 분석' 이 첫 섹션이라 꼭 잡힌다(`/./` 는 다른 행이 채워도 통과했다).
    await check(page, [{ kind: 'F2', title: /운영 분석/ }]);
  });
});
