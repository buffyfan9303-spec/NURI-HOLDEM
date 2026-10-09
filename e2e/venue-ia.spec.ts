// Phase 10 게이트 — 매장 페이지 3계층 IA.
//
// 문서 검증 기준: ① 첫 뷰포트 인터랙티브 요소 ≤ 7 (콘텐츠 레벨 — 내비게이션인
// 뒤로가기·탭바는 제외하고 센다) ② 비로그인 사용자에게 단골 전용 UI(내 활동)가
// display:none 이 아니라 **DOM 미렌더**일 것.
//
// 상한 7 의 경위(2026-10-09 리드 결정 — 화면은 그대로, 예산을 바로잡음):
//   · d100209c(08-16) Tier1 = 오늘의 대회 카드 + QR 체크인 + 전화 + 길찾기 = 4, 헤더 팔로우·공유 = 6. 카카오는 Tier2(매장 정보)였다.
//   · 4c208dc6·1cf6f5dd(08-27~30) 카카오가 Tier1 행으로 돌아왔다(08-29 오너 '링크가 없어도 항상 보인다'). 링크 없는 카카오는
//     손님에게 비인터랙티브 칩이라 안 세지만 링크가 있으면 <a> 다. 그때 VenuePage 의 예산 주석이 카드를 빠뜨려 '=6' 으로 적혔다.
//   · 10-09 로티아레나에 카카오 링크가 등록되자 오늘 대회가 있는 운영 화면이 7 이 되어 이 게이트가 빨개졌다(PR #244·#247 e2e(4)).
//     오너: 레이아웃·카카오 Tier1 유지 → 예산 = 카드·QR·전화·길찾기·카카오 5 + 헤더 팔로우·공유 2 = 7.
//
// 운영 데이터에 묶지 않는다 — 매장 하나를 **최악 데이터**(전화·주소·카카오 링크·오늘 대회)로 목킹해서 잰다.
//   종전엔 공개 매장 하나를 익명 REST 로 골랐다(limit=1, 순서 없음). 그날 그 매장 데이터에 따라 5~7 이 나와,
//   상한을 넘는 화면도 '오늘 대회가 없는 날' 엔 조용히 초록이었다.
//   ⚠ 목을 빈 매장으로 바꾸지 마라 — 셀 것이 줄어 게이트가 무력화된다. 아래 '최악 데이터가 실제로 그려졌다' 단언이 그걸 막는다.
// 음성 대조(2026-10-09): Tier1 행에 행동 하나를 더 붙인 빌드 사본(8)에서 실패, 이 빌드(7)에서 통과.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';
import { mockScheduleRow } from './_mocks';
import { kstDay } from './_schedules';

const VID = '00000000-0000-4000-8000-0000000000c7';
const KAKAO = 'https://open.kakao.com/o/e2e-venue-ia';
/** 본문 링크 상한(2026-10-09 리드 결정 A — VEN-02 소개·공지 링크화).
 *  소개·공지 본문 안의 링크(<a data-linkify>)는 매장이 쓴 **글의 일부**라 Tier1 행동이 아니다 → 행동 요소 7 에서 빼고 따로 센다.
 *  ⚠ 우회 방지: data-linkify 는 소개·공지 본문(venue-description · venue-notice-content · venue-poster-notice) 안에서만 허용한다.
 *    그 밖에서 발견되면 실패 — 행동 버튼에 이 속성을 붙여 계수를 비우는 길을 막는다.
 *  음성 대조: 소개 첫 줄 링크를 3개로 늘린 사본에서 '본문 링크 3개' 로 실패, 이 사본(2개)에서 통과. */
const BODY_LINK_MAX = 2;
const BODY_LINKS_DESC = 'http://www.rotiarena.com · https://litt.ly/rotiarena\n목 매장 소개';
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
/** Tier1 이 가장 많이 그려지는 매장 — 전화·주소(길찾기)·카카오 링크가 다 있다.
 *  ⚠ kind 는 'venue' 여야 한다. venues 테이블에는 딜러팀·동호회 같은 커뮤니티 그룹도 같이 산다 —
 *    그룹이면 `/?v=` 는 VenuePage 가 아니라 GroupPage 를 연다(2026-08-30 실제로 그렇게 깨졌다). */
const venueRow = {
  id: VID, name: 'E2E 목 매장', kind: 'venue', owner_id: '00000000-0000-4000-8000-0000000000b7', approved: true, join_approval: true,
  // 소개 첫 줄에 링크 2개(최악 데이터 — 2026-10-09 리드 결정 A: 본문 링크는 행동 7 과 따로 세고 상한 2).
  status: 'active', region: '서울', address: '서울 강남구 테헤란로 1', description: BODY_LINKS_DESC, images: [], image_url: null,
  follower_count: 0, is_paid_ad: false, display_order: 1, verification_status: 'verified',
  contact_phone: '010-0000-0000', contact_phones: [{ label: '대표', phone: '010-0000-0000' }], business_hours: 'OPEN 17:00',
  kakao_url: KAKAO, created_at: '2026-10-01T00:00:00Z',
};
/** 매장 목록·단건과 일정 목록을 이 매장 + 오늘 대회 1건으로 답한다(PostgREST: 단건은 Accept 에 pgrst.object). */
const mockWorstVenue = async (page: Page) => {
  const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
  await page.route(/\/rest\/v1\/venues\?/, (r: Route) => {
    const url = r.request().url();
    if (r.request().method() !== 'GET' || (url.includes('id=eq.') && !url.includes(`id=eq.${VID}`))) return r.fallback();
    return r.fulfill(json(single(r) ? venueRow : [venueRow]));
  });
  await page.route(/\/rest\/v1\/schedules\?/, (r: Route) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const row = { ...mockScheduleRow(), venue_id: VID, pub_name: venueRow.name, date: kstDay(0), start_time: '23:00:00' };
    return r.fulfill(json(single(r) ? row : [row]));
  });
};

test.describe('매장 페이지 — 3계층 IA', () => {
  test('🔴 비로그인 첫 뷰포트(최악 데이터): 행동 요소 ≤7 · 본문 링크 ≤2 · QR 체크인 존재 · 내 활동 미렌더', async ({ page }) => {
    test.setTimeout(90_000);
    await mockWorstVenue(page);
    await stabilizeBackstack(page);
    await page.goto(`/?v=${VID}`);
    const dlg = page.getByRole('dialog', { name: /매장 페이지/ });
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    // 다이얼로그가 뜬 '뒤에' 오버레이를 걷는다 — 2026-08-28 dismissOverlays 의 1.6s 선대기 제거로
    // goto 직후 호출은 아직 안 뜬 다이얼로그에 no-op 이 됐다. 이 정리는 첫 방문 코치마크(확인 버튼)를
    // 계수 전에 걷어내던 종전 게이트 의미를 유지한다(코치마크는 1회성 팁이지 IA 행동 요소가 아니다).
    await dismissOverlays(page);
    await page.waitForTimeout(1200);

    // Tier1 프라이머리 — QR 체크인이 스크롤 없이 보인다
    const checkin = page.getByTestId('venue-checkin');
    await expect(checkin, 'Tier1 [QR 체크인] 이 없다').toBeVisible();
    const box = await checkin.boundingBox();
    expect(box!.y, 'QR 체크인이 첫 뷰포트(915px) 밖이다 — Tier1 이 아니다').toBeLessThan(915);

    // 최악 데이터가 실제로 그려졌다 — 목이 안 먹어 행동이 덜 그려지면 아래 상한이 거짓 통과한다
    await expect(dlg.getByRole('button', { name: /오늘의 대회/ }), '오늘의 대회 카드가 없다(일정 목이 안 먹음)').toBeVisible();
    await expect(dlg.locator('a[href^="tel:"]').first(), '전화가 없다').toBeVisible();
    await expect(dlg.locator('a[href*="map.kakao.com/link/search"]').first(), '길찾기가 없다').toBeVisible();
    await expect(dlg.locator(`a[href="${KAKAO}"]`).first(), '카카오톡 링크가 없다(칩으로 그려짐)').toBeVisible();

    // 첫 뷰포트 콘텐츠 레벨 인터랙티브 ≤ 7 (뒤로가기·탭바 role=tab 제외)
    const { count, navShuttles, bodyLinks, strayLinkify, bodyLinksInDom } = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"][aria-label*="매장 페이지"]');
      if (!dlg) return { count: -1, navShuttles: 0, bodyLinks: 0, strayLinkify: 0, bodyLinksInDom: 0 };
      const BODY = '[data-testid="venue-description"], [data-testid="venue-notice-content"], [data-testid="venue-poster-notice"]';
      // data-linkify 는 본문 안에서만 허용 — 화면 어디든(첫 뷰포트 밖 포함) 본문 밖에 있으면 우회다.
      const stray = [...document.querySelectorAll('[data-linkify]')].filter((el) => !el.closest(BODY)).length;
      const inDom = dlg.querySelectorAll('[data-testid="venue-description"] a[data-linkify]').length;
      let n = 0, shuttles = 0, body = 0;
      for (const el of dlg.querySelectorAll<HTMLElement>('button, a, [role="button"]')) {
        // ⚠ 크기 0 필터만으로는 부족해졌다 — Chrome 148+ 는 닫힌 <details> 내부(::details-content
        //   content-visibility:hidden)도 rect 를 반환한다(hidden=until-found 계열 변경).
        //   checkVisibility() 가 '사용자에게 보이는가'의 정본 — 게이트 의미(보이는 행동 요소 ≤7)는 동일.
        if (el.checkVisibility && !el.checkVisibility()) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.top >= 915 || r.bottom <= 0) continue;               // 첫 뷰포트 밖
        if (el.getAttribute('role') === 'tab') continue;            // 내비게이션 탭
        if (el.getAttribute('aria-label') === '뒤로 가기') continue; // 내비게이션
        if (el.closest('summary')) continue;                         // 계층을 여는 손잡이 = 디스클로저(행동 아님)
        // 페이지 '자기 탭'으로의 셔틀(예: 시즌 선두 배너 → 랭킹 탭) — 행동이 탭 전환뿐이라
        // role=tab 제외와 동일 근거의 내비게이션 레벨. 앱이 data-nav="venue-tab" 으로 명시 선언한
        // 요소만 제외한다(콘텐츠 행동 버튼에 이 속성을 붙이는 것은 게이트 무력화 — 금지).
        if (el.getAttribute('data-nav') === 'venue-tab') { shuttles += 1; continue; }
        if (el.hasAttribute('data-linkify') && el.closest(BODY)) { body += 1; continue; } // 본문 링크 — 따로 센다(상한 2)
        n += 1;
      }
      return { count: n, navShuttles: shuttles, bodyLinks: body, strayLinkify: stray, bodyLinksInDom: inDom };
    });
    console.log(`[venue-ia] 행동 ${count} · 본문 링크 ${bodyLinks}(DOM ${bodyLinksInDom}) · 본문 밖 data-linkify ${strayLinkify} · 셔틀 ${navShuttles}`);
    // 최악 데이터: 목 소개의 링크 2개가 실제로 <a data-linkify> 로 그려져 첫 뷰포트에서 세어졌다(아니면 상한이 거짓 통과)
    expect(bodyLinksInDom, '목 소개의 링크 2개가 링크로 그려지지 않았다(링크화 미동작 또는 목 미적용)').toBeGreaterThanOrEqual(2);
    expect(bodyLinks, '본문 링크가 첫 뷰포트에서 세어지지 않았다 — 소개가 첫 뷰포트 밖이면 이 최악 데이터 단언을 다시 설계하라').toBeGreaterThanOrEqual(2);
    expect(strayLinkify, `data-linkify 가 소개·공지 본문 밖에 ${strayLinkify}개 — 계수 우회다`).toBe(0);
    expect(bodyLinks, `첫 뷰포트 본문 링크 ${bodyLinks}개 — ${BODY_LINK_MAX}개 이하여야 한다`).toBeLessThanOrEqual(BODY_LINK_MAX);
    // 제외 자체에도 상한을 둔다 — 이 속성을 여기저기 붙여 게이트를 비우는 우회를 원천 차단.
    // (탭 셔틀은 설계상 '시즌 선두 배너' 하나뿐이다)
    expect(navShuttles, `탭 셔틀(data-nav) 이 ${navShuttles}개 — 1개를 넘으면 게이트 우회다`).toBeLessThanOrEqual(1);
    expect(count, `첫 뷰포트 행동 요소가 ${count}개 — 7개 이하여야 한다(계층이 무너짐)`).toBeLessThanOrEqual(7);
    expect(count).toBeGreaterThan(0);

    // Tier3 '내 활동' 은 비로그인에게 DOM 자체가 없다(미렌더 원칙)
    // ⚠ 종전 셀렉터는 `text=🙋 내 활동` 이었다 — 이모지에 결합돼 있어서, 아이콘 교체(ICON-2)만으로도
    //   무조건 0건이 되어 **이 단언이 조용히 항상 통과**하게 된다(게이트 무력화). 앱이 명시 선언한
    //   data-testid 로 옮긴다(셀렉터를 느슨하게 푸는 게 아니라 결합 지점을 바꾸는 것).
    expect(await page.getByTestId('venue-my-activity').count(), '비로그인인데 내 활동 블록이 DOM 에 있다').toBe(0);
  });
});
