// e2e/venue-points-anon.spec.ts — F5(2026-09-24) 개인정보 클라이언트 단계 회귀 가드.
//
// 배경: 리드가 이 배포 뒤 anon 의 venue_score_entries.reason · created_by 컬럼 SELECT 를 회수한다.
//   그때 공개 매장 페이지(비로그인)가 여전히 reason 을 SELECT 하면 PostgREST 가 **조회 전체를 권한 오류**로 돌려주고,
//   화면은 catch 로 빈 배열을 받아 순위표의 수동 포인트가 **조용히 통째로 사라진다**(에러도 안 보인다).
// 이 스펙은 서버 회수 **이후** 모양을 미리 흉내 낸다: SELECT 목록에 reason·created_by 가 있으면 401(42501)로 답한다.
//   → 비로그인 매장 페이지의 '순위' 탭에 수동 포인트가 보여야 한다(점수 보드).
// 음성 대조: VenuePage 의 getScoreEntries(…, { withReason: false }) 를 기본 호출로 되돌리면(= 수정 전 코드) 포인트가 사라져 빨개진다
//   (격리 스냅샷 d8de4f95 에서 실측 — 보고서).
// ⚠ 운영 DB 무접촉 — 필요한 조회는 전부 page.route 로 답한다. 로그인 없음(비로그인이 대상이다).
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

const VENUE_ID = '88888888-2222-4222-8222-888888888888';
const VENUE_ROW = {
  id: VENUE_ID, name: '포인트 공개 홀덤', region: '서울', address: '서울 1', approved: true, status: 'active',
  verification_status: 'verified', is_paid_ad: false, display_order: 1, follower_count: 0, rating: null,
  page_config: { rankMetrics: ['score'] },
};
const ENTRIES = [
  { id: 'e1', name: '포인트왕', points: 1234, entry_date: '2026-09-20', board_key: null, created_at: '2026-09-20T10:00:00Z' },
];
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

test('🔴 F5 — anon 의 reason·created_by 회수 뒤에도 비로그인 매장 페이지 순위에 수동 포인트가 보인다', async ({ page }) => {
  test.setTimeout(90_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const selects: string[] = [];
  await page.route(/\/rest\/v1\/venue_score_entries/, (r) => {
    if (r.request().method() !== 'GET') return r.fulfill(json({ message: 'blocked' }, 403));
    const sel = decodeURIComponent(new URL(r.request().url()).searchParams.get('select') ?? '');
    selects.push(sel);
    // 서버 회수 이후의 모양 — 권한 없는 컬럼을 고르면 조회 전체가 42501 이다.
    if (/\b(reason|created_by)\b/.test(sel)) return r.fulfill(json({ code: '42501', message: 'permission denied for table venue_score_entries' }, 401));
    return r.fulfill(json(ENTRIES));
  });
  await page.route(/\/rest\/v1\/venues\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    return r.fulfill(json(single ? VENUE_ROW : [VENUE_ROW]));
  });

  await page.goto(`/?venue=${VENUE_ID}`);
  const dlg = page.getByRole('dialog', { name: /매장 페이지/ });
  await expect(dlg).toBeVisible({ timeout: 20_000 });
  await dlg.getByRole('tab', { name: '순위' }).or(dlg.getByRole('button', { name: '순위', exact: true })).first().click();
  await expect(dlg.getByText('포인트왕').first(), '수동 포인트가 순위표에서 사라졌다 — 공개 화면이 회수된 컬럼(reason)을 아직 고른다')
    .toBeVisible({ timeout: 15_000 });
  expect(selects.length, 'venue_score_entries 를 한 번도 안 읽었다 — 검사가 대상에 도달 못 했다').toBeGreaterThan(0);
  expect(selects.filter((s) => /\b(reason|created_by)\b/.test(s)), `공개 화면이 회수 대상 컬럼을 고른다: ${selects.join(' | ')}`).toEqual([]);
});
