// 파트너 매장(연합 대회 매칭) 흐름 — 신청 → (서버 알림) → 수락 → 연락처(전화하기).
// 2026-09-28: vmr_insert 정책이 자기참조로 항상 거짓이라 신청 INSERT 가 전부 거절됐다(라이브 행 0). 리드가 20260928a 로 서버를 고쳤다.
// 이 스펙은 **화면 쪽 사슬**만 잰다 — 보내는 본문이 서버 정책이 보는 칸(post_id·venue_id)을 제대로 싣는가, 성공 뒤 재조회로
// 보낸/받은 신청 상태가 바뀌는가, 수락되면 전화하기가 뜨는가. 운영 DB 쓰기 0(표 전부 page.route 상태 목킹).
// 서버 RLS·알림 트리거 판정은 여기서 증명하지 않는다 — 20260928a 의 롤백 리허설이 정본이다.
import { test, expect } from './_fixtures';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_UID } from './_mockOwner';

const OTHER = '66666666-6666-4666-8666-666666666666';
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const V = (id: string, name: string) => ({ id, name, region: '서울', contact_phone: id === OTHER ? '010-1111-2222' : '010-3333-4444' });

test('파트너 매장: 신청 보내기 → 보낸 신청 대기 · 받은 신청 수락 → 전화하기', async ({ page }) => {
  const posts = [
    { id: 'p-mine', venue_id: MOCK_VENUE, event_date: '2026-10-03', note: '참가비 5만 · 40석', status: 'open', created_at: '2026-09-27T00:00:00Z', venues: V(MOCK_VENUE, '테스트 홀덤펍') },
    { id: 'p-other', venue_id: OTHER, event_date: '2026-10-10', note: '참가비 10만 · 60석', status: 'open', created_at: '2026-09-26T00:00:00Z', venues: V(OTHER, '강남 홀덤') },
  ];
  const recv = [{ id: 'r1', post_id: 'p-mine', venue_id: OTHER, message: '함께 해요', status: 'pending', created_at: '2026-09-27T01:00:00Z', venues: V(OTHER, '강남 홀덤') }];
  const sent: Record<string, unknown>[] = [];
  const bodies: { method: string; body: unknown }[] = [];

  await bootOwner(page, {
    viewport: { width: 1280, height: 900 },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/venue_match_posts\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        return r.fulfill(json(/venue_id=eq\./.test(r.request().url()) ? posts.filter((x) => x.venue_id === MOCK_VENUE) : posts));
      });
      await p.route(/\/rest\/v1\/venue_match_responses/, (r) => {
        const m = r.request().method();
        const u = r.request().url();
        if (m === 'GET') return r.fulfill(json(/post_id=eq\./.test(u) ? recv : sent));
        if (m === 'POST') {
          const b = r.request().postDataJSON() as Record<string, unknown>;
          bodies.push({ method: m, body: b });
          sent.push({ id: 's-new', ...b, status: 'pending', created_at: new Date().toISOString(), venues: V(MOCK_VENUE, '테스트 홀덤펍'), venue_match_posts: posts[1] });
          return r.fulfill(json([], 201));
        }
        if (m === 'PATCH') {
          const b = r.request().postDataJSON() as { status: string };
          bodies.push({ method: m, body: b });
          const id = /id=eq\.([^&]+)/.exec(u)?.[1];
          const row = recv.find((x) => x.id === id);
          if (row) row.status = b.status;
          return r.fulfill(json(row ? [row] : []));
        }
        return r.fallback();
      });
    },
  });
  await openMyStore(page);
  const tab = page.locator('[data-tab="my-store"]');
  await page.locator('[data-mystore-secbar]').getByRole('button', { name: '파트너 매장', exact: true }).click();
  await expect(tab.getByText('참가비 10만 · 60석')).toBeVisible({ timeout: 20_000 });

  // ① 신청 — 본문이 정책이 보는 칸(post_id·venue_id·created_by)을 싣는다
  await tab.getByRole('button', { name: '신청하기', exact: true }).click();
  await tab.getByRole('button', { name: '신청 보내기', exact: true }).click();
  await expect.poll(() => bodies.find((x) => x.method === 'POST')?.body).toMatchObject({ post_id: 'p-other', venue_id: MOCK_VENUE, created_by: MOCK_UID });
  // 성공 뒤 재조회 — 보낸 신청 목록에 대기 중으로 선다(취소하기 = pending 의 유일한 행동)
  await expect(tab.getByRole('button', { name: '취소하기', exact: true })).toBeVisible({ timeout: 10_000 });

  // ② 받은 신청 수락 → 전화하기(상대 연락처)
  await tab.getByRole('button', { name: '수락하기', exact: true }).click();
  await expect.poll(() => bodies.find((x) => x.method === 'PATCH')?.body).toEqual({ status: 'accepted' });
  await expect(tab.locator('a[href="tel:010-1111-2222"]'), '수락했는데 상대 매장 연락처(전화하기)가 안 뜬다').toBeVisible({ timeout: 10_000 });
});
