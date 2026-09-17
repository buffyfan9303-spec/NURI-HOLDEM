// 파트너 매장(연합 대회 매칭) — 375·320 에서 버튼 10종이 한 줄(텍스트 rect top 군집 1 · h≤44)이고 신청 입력칸 placeholder 가 안 잘린다.
// 운영 DB 에 쓰지 않는다 — 세션·매장·매칭 표 전부 page.route(포괄 목킹을 먼저 걸어 다른 표는 전부 []).
// 2026-09-17 실측(5175 dev): BTN 32px · btn-primary 41~42px · 320 에서 한마디 입력을 버튼과 한 줄에 두면 placeholder 잘림 → 전체 폭으로 고침.
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000ed';
const VENUE = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';
const OTHER2 = '77777777-7777-4777-8777-777777777777';
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'owner2@example.com', app_metadata: {}, user_metadata: { name: '업주' }, created_at: new Date().toISOString() },
};
const V = (id: string, name: string, region: string) => ({ id, name, region, contact_phone: '010-0000-0000' });
const MY_POST = { id: 'a1', venue_id: VENUE, event_date: '2026-10-03', note: '참가비 5만 · 40석 · 프리즈아웃', status: 'open', created_at: '2026-09-17T00:00:00Z', venues: V(VENUE, '테스트 라운지', '서울') };
const OTHER_POST = { id: 'b1', venue_id: OTHER, event_date: '2026-10-10', note: '참가비 10만 · 60석', status: 'open', created_at: '2026-09-16T00:00:00Z', venues: V(OTHER, '강남 홀덤', '강남') };
const OTHER_POST2 = { id: 'b2', venue_id: OTHER2, event_date: null, note: '날짜 협의', status: 'open', created_at: '2026-09-15T00:00:00Z', venues: V(OTHER2, '부산 홀덤', '부산') };
const RECV = [
  { id: 'r1', post_id: 'a1', venue_id: OTHER, message: '함께 해요', status: 'pending', created_at: '2026-09-17T01:00:00Z', venues: V(OTHER, '강남 홀덤', '강남') },
  { id: 'r2', post_id: 'a1', venue_id: OTHER2, message: null, status: 'accepted', created_at: '2026-09-17T02:00:00Z', venues: V(OTHER2, '부산 홀덤', '부산') },
];
const SENT = [
  { id: 's1', post_id: 'b2', venue_id: VENUE, message: null, status: 'pending', created_at: '2026-09-17T03:00:00Z', venues: V(VENUE, '테스트 라운지', '서울'), venue_match_posts: OTHER_POST2 },
  { id: 's2', post_id: 'c9', venue_id: VENUE, message: null, status: 'accepted', created_at: '2026-09-17T04:00:00Z', venues: V(VENUE, '테스트 라운지', '서울'), venue_match_posts: { id: 'c9', venue_id: OTHER, event_date: '2026-09-30', note: '마감된 글', status: 'closed', created_at: '2026-09-10T00:00:00Z', venues: V(OTHER, '강남 홀덤', '강남') } },
];

async function openPartners(page: Page) {
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k as string, v as string); } catch { /* */ } }, [KEY, JSON.stringify(FAKE)] as [string, string]);
  // 포괄 목킹을 먼저 — 나중에 건 것이 이긴다(역순).
  await page.route(/\/rest\/v1\//, (r) => r.fulfill(json([])));
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({ id: UID, name: '업주', nickname: '업주', role: 'venue_owner', approved: true, status: 'active', venue_id: VENUE, activity_points: 0, created_at: FAKE.user.created_at, agreed_to_terms: true, consented_legal_version: 2 })));
  await page.route(/\/rest\/v1\/venues\?/, (r) => r.fulfill(json([{ id: VENUE, name: '테스트 라운지', region: '서울', address: '서울 1', owner_id: UID, approved: true, status: 'active', verification_status: 'verified', is_paid_ad: false, display_order: 1, follower_count: 0 }])));
  await page.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_manage_venue|can_view_vouchers|can_manage_venue_staff|can_manage_venue_schedules)/, (r) => r.fulfill(json(true)));
  await page.route(/\/rest\/v1\/venue_match_posts\?/, (r) => {
    const u = r.request().url();
    return r.fulfill(json(/venue_id=eq\./.test(u) ? [MY_POST] : [MY_POST, OTHER_POST, OTHER_POST2]));
  });
  await page.route(/\/rest\/v1\/venue_match_responses\?/, (r) => {
    const u = r.request().url();
    return r.fulfill(json(/post_id=eq\./.test(u) ? RECV : SENT));
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('button:visible').filter({ hasText: '내 매장' }).first().click({ timeout: 15_000 });
  const tab = page.locator('[data-tab="my-store"]');
  await expect(tab).toBeVisible({ timeout: 20_000 });
  const nav = tab.getByRole('button', { name: '파트너 매장' });
  if (!(await nav.first().isVisible().catch(() => false))) {
    await tab.getByRole('button', { name: /대시보드/ }).first().click();
  }
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-tab="my-store"] button')].find((x) => x.textContent?.trim() === '파트너 매장') as HTMLButtonElement | undefined; b?.click(); });
  await expect(tab.getByText('함께 열 매장 찾기')).toBeVisible({ timeout: 20_000 });
}
/** 신청 입력줄을 열어 '신청 보내기·입력 닫기' 도 잰다('신청하기' 는 열리면 사라지므로 먼저 잰 뒤 연다) */
async function openApply(page: Page) {
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-tab="my-store"] button')].find((x) => x.textContent?.trim() === '신청하기') as HTMLButtonElement | undefined; b?.click(); });
  await expect(page.locator('[data-tab="my-store"]').getByText('신청 보내기')).toBeVisible();
}
/** 텍스트 노드만 잰다 — 아이콘 svg 는 줄 상자와 top 이 달라 '두 줄' 로 오탐한다 */
type M = { label: string; h: number; rects: number; w: number };
async function measure(page: Page, labels: string[]): Promise<{ out: M[]; over: number }> {
  return page.evaluate((labels) => {
    const out: M[] = [];
    for (const el of document.querySelectorAll('[data-tab="my-store"] button, [data-tab="my-store"] a')) {
      const t = el.textContent?.trim() ?? '';
      if (!labels.includes(t)) continue;
      const tops = new Set<number>();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        for (const r of range.getClientRects()) tops.add(Math.round(r.top));
      }
      out.push({ label: t, h: (el as HTMLElement).offsetHeight, rects: tops.size, w: (el as HTMLElement).offsetWidth });
    }
    return { out, over: document.body.scrollWidth - document.documentElement.clientWidth };
  }, labels);
}

const LABELS = ['게시하기', '마감하기', '삭제하기', '수락하기', '거절하기', '전화하기', '신청하기', '신청 보내기', '입력 닫기', '취소하기'];

test('파트너 매장 — 375·320 에서 버튼 전부 한 줄', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await openPartners(page);
  const rows: string[] = [];
  const bad: string[] = [];
  for (const w of [375, 320]) {
    await page.setViewportSize({ width: w, height: 812 });
    await page.waitForTimeout(250);
    const before = await measure(page, ['신청하기']);
    await openApply(page);
    const after = await measure(page, LABELS.filter((l) => l !== '신청하기'));
    const found = { out: [...before.out, ...after.out], over: Math.max(before.over, after.over) };
    const seen = new Set(found.out.map((o) => o.label));
    for (const l of LABELS) if (!seen.has(l)) bad.push(`${w}: '${l}' 버튼이 화면에 없음`);
    for (const o of found.out) {
      rows.push(`${w}\t${o.label}\t h=${o.h}\t w=${o.w}\t lines=${o.rects}`);
      // 한 줄 = 텍스트 rect top 군집 1. 높이 44 = 루트 17px 기준 btn-primary(≈42) 까지 허용, 두 줄이면 60+ 가 된다.
      if (o.h > 44 || o.rects > 1) bad.push(`${w}: '${o.label}' h=${o.h} lines=${o.rects}`);
    }
    if (found.over > 1) bad.push(`${w}: 페이지 가로 넘침 ${found.over}px`);
    // 신청 한마디 입력칸 — 320 에서 버튼 둘과 한 줄이면 placeholder 가 잘렸다('한마디(선틱'). 글자 공간을 실측한다.
    const inputRoom = await page.evaluate(() => {
      const el = document.querySelector('[data-tab="my-store"] input[placeholder="한마디(선택)"]') as HTMLInputElement | null;
      if (!el) return -1;
      const cs = getComputedStyle(el);
      const c = document.createElement('canvas').getContext('2d')!; c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - c.measureText(el.placeholder).width;
    });
    rows.push(`${w}\t한마디 입력 여유 ${inputRoom.toFixed(1)}px`);
    if (inputRoom < 8) bad.push(`${w}: 한마디 입력칸 여유 ${inputRoom.toFixed(1)}px (placeholder 잘림)`);
    await page.screenshot({ path: `test-results/partners-${w}.png`, fullPage: true });
    // 다음 폭을 위해 입력줄을 닫는다
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-tab="my-store"] button')].find((x) => x.textContent?.trim() === '입력 닫기') as HTMLButtonElement | undefined; b?.click(); });
  }
  console.log('MEASURE\n' + rows.join('\n'));
  expect(bad, bad.join('\n')).toEqual([]);
});
