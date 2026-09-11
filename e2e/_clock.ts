// 클락 TV(ClockDisplay) 스펙 공용 픽스처 — **실재하는 매장 없이** TV 화면을 띄운다.
//
// 왜 이 파일이 생겼나: 클락 TV 스펙 28개가 `E2E_CLOCK_VENUE` 가 없으면 통째로 skip 이었다.
//   그 변수는 2026-09-10 'E2E 계정 은퇴' 로 사라졌고, 그 뒤로 TV 화면은 **한 번도 검사되지 않았다**.
//   실제로 그 사이에 회귀가 하나 들어갔다(스테이지 루트의 container-type 누락 → 프라이즈·지표 열 소실).
//
// 그런데 TV 화면은 계정이 필요 없다 — 읽는 것이 셋뿐이고 전부 목킹 가능하다:
//   clock_states(진행 상태) · venue_page_configs(테마) · app_settings(스폰서 광고).
//   venueName 은 App 이 venues 목록에서 찾아 넘기는데, 못 찾으면 '홀덤 라이브' 로 떨어진다(정상 경로).
//   따라서 **매장 id 는 실재할 필요가 없다**. 합성 UUID 하나면 스펙이 CI 에서 영구히 돈다.
//   (E2E_CLOCK_VENUE 가 주어지면 그걸 쓴다 — 실매장으로 눈으로 볼 때를 위해 남긴다.)
import type { Page } from '@playwright/test';

/** TV 스펙용 매장 id. 실재하지 않아도 된다 — 모든 읽기를 목킹한다. */
export const TV_VENUE = process.env.E2E_CLOCK_VENUE ?? '00000000-0000-4000-8000-00000000e2e2';

export type ClockShotLevel = { kind: 'level' | 'break'; sb: number; bb: number; ante: number; minutes: number; label?: string };

/**
 * clock_states 조회를 이 상태로 고정한다(쓰기 없음).
 * ⚠ TV 화면은 getVenueClocks() 로 읽는다 — `.select('*').eq('venue_id',…)` 라 **배열**이다.
 *    단일 객체로 주면 supabase-js 가 조용히 빈 목록으로 읽어 '진행 중인 클락이 없습니다' 가 된다.
 */
export async function serveClock(page: Page, body: unknown): Promise<void> {
  await page.route(/\/rest\/v1\/clock_states/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([body]) }));
}
