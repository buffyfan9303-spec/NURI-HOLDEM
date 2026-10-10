// 그룹 만들기 → 그룹 화면 주요 동작 — 모바일 390 · PC 1440 (2026-10-02 오너 "그룹 기능 제대로 다 되는지").
//
// 서버는 **목킹**한다(page.route). 목은 라이브 정책을 흉내 낸다 — 2026-10-02 운영 DB 되돌림 리허설
// (Documents\누리홀덤_영상분석_0930\dummy-1002\40_groups.sql, 113 단언)에서 잰 그대로다:
//   · group_posts 에는 UPDATE 정책이 없다 → PATCH 는 0행(실서버와 같다) · DELETE 는 작성자/운영진 1행.
//   · getVenues 는 approved=true 만 읽는다 → 승인 대기 그룹은 앱 목록에 없다.
// 이 목으로 막는 회귀(🔴 = 수정 전 빌드에서 실패):
//   🔴 ① 그룹 게시판 글 삭제가 '권한이 없거나…' 로 실패(soft delete PATCH 0행).
//   🔴 ② '내 커뮤니티 관리'의 승인 대기 그룹을 누르면 '매장을 찾을 수 없습니다. 문을 닫았거나…'.
//   · 그룹 갤러리 업로드는 community_images 버킷(posters 아님 — 20261001n 영향 없음).
//   · 가로 넘침 0 · 탭 전환 때 탭바 위치 불변.
// ⚠ 화면 렌더 검증 전용이다. 권한 판정은 서버 몫이고 리허설 SQL 이 맡는다(stubLogin 토큰은 서버가 거부한다).
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stubLogin } from './_session';

const ME = '00000000-0000-4000-8000-0000000000f1';
const OTHER = '00000000-0000-4000-8000-0000000000f2';
const G_OPEN = '00000000-0000-4000-8000-00000000a001';   // 남이 만든 승인된 자동가입 동호회
const G_MINE = '00000000-0000-4000-8000-00000000a002';   // 내가 만든 승인된 딜러팀(운영 화면)

type Row = Record<string, unknown>;
const venueRow = (id: string, name: string, kind: string, owner: string, approved: boolean, joinApproval: boolean): Row => ({
  id, name, kind, owner_id: owner, approved, join_approval: joinApproval, status: 'active', region: '서울',
  description: `${name} 소개`, images: [], follower_count: 0, is_paid_ad: false, display_order: 0,
  verification_status: 'unverified', contact_phone: null, kakao_url: null, created_at: '2026-10-01T00:00:00Z',
});

/** 아주 작은 PostgREST 흉내 — eq/neq/in 필터와 Accept(object) 만. */
function applyFilters(rows: Row[], url: URL): Row[] {
  let out = rows;
  for (const [k, raw] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
    const [op, ...rest] = raw.split('.');
    const v = rest.join('.');
    if (op === 'eq') out = out.filter((r) => String(r[k]) === v);
    else if (op === 'neq') out = out.filter((r) => String(r[k]) !== v);
    else if (op === 'in') { const set = v.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/"/g, '')); out = out.filter((r) => set.includes(String(r[k]))); }
  }
  return out;
}

async function bootGroups(page: Page) {
  await stubLogin(page, { id: ME, nickname: '검증계정', name: '검증계정' });
  // 실시간: 응답만 하고 아무것도 밀지 않는 소켓(운영 realtime 으로 나가지 않게)
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    ws.onMessage((raw) => {
      try {
        const [jr, ref, topic] = JSON.parse(String(raw)) as [string, string, string];
        ws.send(JSON.stringify([jr, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }]));
      } catch { /* 무시 */ }
    });
  });
  const db = {
    venues: [venueRow(G_OPEN, '새벽 홀덤 동호회', 'club', OTHER, true, false), venueRow(G_MINE, '검증 딜러팀', 'dealer_team', ME, true, true)],
    group_members: [
      { id: 'm-own', group_id: G_MINE, user_id: ME, role: 'manager', status: 'approved', member_name: '검증계정', created_at: '2026-10-01T00:00:00Z' },
      { id: 'm-app', group_id: G_MINE, user_id: OTHER, role: 'member', status: 'pending', member_name: '신청자', created_at: '2026-10-01T01:00:00Z' },
    ] as Row[],
    group_messages: [] as Row[],
    group_posts: [] as Row[],
    venue_notices: [] as Row[],
  };
  const calls: string[] = [];
  const uploads: string[] = [];
  let seq = 1;
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(/\/rest\/v1\/(venues|group_members|group_messages|group_posts|venue_notices)(\?|$)/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop() as keyof typeof db;
    const method = req.method();
    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    calls.push(`${method} ${table}`);
    const rows = db[table];
    if (method === 'GET' || method === 'HEAD') {
      const hit = applyFilters(rows, url);
      return wantsObject ? (hit[0] ? json(route, hit[0]) : json(route, { code: 'PGRST116', message: 'no rows' }, 406)) : json(route, hit);
    }
    if (method === 'POST') {
      const body = req.postDataJSON() as Row | Row[];
      const list = (Array.isArray(body) ? body : [body]).map((b) => ({
        id: `${table}-${seq++}`, created_at: new Date().toISOString(), deleted: false, ...b,
        // 서버 트리거(_tg_force_author_nickname)처럼 작성자 이름은 닉네임으로
        ...(table === 'group_messages' ? { user_name: '검증계정' } : {}), ...(table === 'group_posts' ? { author_name: '검증계정' } : {}),
      }));
      rows.unshift(...list);
      return wantsObject ? json(route, list[0], 201) : json(route, list, 201);
    }
    if (method === 'PATCH') {
      // 라이브: group_posts 에는 UPDATE 정책이 없다 → 0행
      if (table === 'group_posts') return json(route, []);
      const patch = req.postDataJSON() as Row;
      const hit = applyFilters(rows, url);
      for (const r of hit) Object.assign(r, patch);
      return json(route, hit);
    }
    if (method === 'DELETE') {
      const hit = applyFilters(rows, url);
      db[table] = rows.filter((r) => !hit.includes(r)) as never;
      return json(route, hit);
    }
    return route.continue();
  });

  await page.route(/\/rest\/v1\/rpc\/(create_group|join_group|group_activity_ranking|update_group_profile|set_group_join_approval|set_group_member_role)/, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    const body = (route.request().postDataJSON() ?? {}) as Row;
    calls.push(`rpc ${name}`);
    if (name === 'create_group') {
      const id = `00000000-0000-4000-8000-0000000b${String(seq++).padStart(4, '0')}`;
      db.venues.push(venueRow(id, String(body.p_name), String(body.p_kind), ME, false, Boolean(body.p_join_approval)));
      db.group_members.push({ id: `m-${id}`, group_id: id, user_id: ME, role: 'manager', status: 'approved', member_name: '검증계정', created_at: new Date().toISOString() });
      return json(route, id);
    }
    if (name === 'join_group') {
      const g = db.venues.find((v) => v.id === body.p_group)!;
      const st = g.join_approval ? 'pending' : 'approved';
      db.group_members.push({ id: `m-${seq++}`, group_id: g.id, user_id: ME, role: 'member', status: st, member_name: '검증계정', created_at: new Date().toISOString() });
      return json(route, st);
    }
    if (name === 'group_activity_ranking') {
      return json(route, db.group_members.filter((m) => m.group_id === body.p_group && m.status === 'approved').map((m) => {
        const posts = db.group_posts.filter((p) => p.group_id === m.group_id && p.author_id === m.user_id).length;
        const msgs = db.group_messages.filter((x) => x.group_id === m.group_id && x.user_id === m.user_id).length;
        return { user_id: m.user_id, member_name: m.member_name, member_color: null, member_role: m.role, post_count: posts, message_count: msgs, score: posts * 3 + msgs, joined_at: m.created_at };
      }));
    }
    return json(route, null);
  });

  await page.route(/\/storage\/v1\/object\//, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/storage\/v1\/object\//, '');
    uploads.push(path);
    return json(route, { Key: path, Id: 'x' });
  });
  return { db, calls, uploads };
}

const toast = (page: Page, text: RegExp | string) => page.getByText(text).first();
/** 가로 넘침 — 루트 문서와 그룹 화면 스크롤러 둘 다 */
async function hOverflow(page: Page) {
  return page.evaluate(() => {
    const dlg = document.querySelector<HTMLElement>('[role=dialog][aria-label$="그룹 페이지"]');
    const sc = dlg?.querySelector<HTMLElement>('.overflow-y-auto');
    return {
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      page: sc ? sc.scrollWidth - sc.clientWidth : -1,
    };
  });
}

for (const vp of [{ name: 'mobile-390', width: 390, height: 844 }, { name: 'pc-1440', width: 1440, height: 900 }]) {
  test.describe(`그룹 흐름 ${vp.name}`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: vp.width, height: vp.height }); });

    test('그룹 만들기 → 승인 대기 안내(🔴②)', async ({ page }) => {
      const { calls } = await bootGroups(page);
      await page.goto('/?tab=community');
      await page.getByTestId('sec-tab-venues').click(); // 2026-10-10 기본 섹션이 게시판 — 그룹·매장 카드는 홀덤펍에 있다
      const create = page.getByRole('button', { name: '+ 그룹 만들기' });
      await expect(create).toBeVisible({ timeout: 20_000 });
      await create.click();
      const dlg = page.getByRole('dialog', { name: '그룹 만들기' });
      await expect(dlg).toBeVisible();
      await dlg.getByPlaceholder('예: 강남 딜러팀').fill('검증 새 딜러팀');
      await dlg.getByPlaceholder(/어떤 사람들이 무엇을 하려고/).fill('강남 딜러들이 근무 정보를 나누는 모임입니다');
      await dlg.getByRole('button', { name: '개설 신청' }).click();
      await expect(toast(page, '그룹 개설을 신청했습니다. 관리자 승인 후 공개됩니다.')).toBeVisible();
      expect(calls).toContain('rpc create_group');

      // 내 커뮤니티 관리 → 승인 대기 그룹
      await page.getByRole('button', { name: /내 커뮤니티 관리/ }).click();
      const pending = page.getByRole('button', { name: /검증 새 딜러팀.*승인 대기/ });
      await expect(pending).toBeVisible();
      await pending.click();
      await expect(toast(page, '관리자 승인 후 그룹 페이지를 열 수 있습니다'), '승인 대기 그룹을 누르면 이유를 말해야 한다').toBeVisible();
      await expect(page.getByText(/매장을 찾을 수 없습니다/)).toHaveCount(0);
      await page.screenshot({ path: `test-results/group-flow/${vp.name}-create.png` });
    });

    test('가입 → 채팅 → 게시판 글쓰기·삭제(🔴①) → 순위', async ({ page }) => {
      const { calls } = await bootGroups(page);
      page.on('dialog', (d) => d.accept());
      await page.goto('/?tab=community');
      await page.getByTestId('sec-tab-venues').click(); // 2026-10-10 기본 섹션이 게시판 — 그룹·매장 카드는 홀덤펍에 있다
      const card = page.getByTestId('venue-card').filter({ hasText: '새벽 홀덤 동호회' });
      await expect(card).toBeVisible({ timeout: 20_000 });
      await card.click();
      const dlg = page.getByRole('dialog', { name: '새벽 홀덤 동호회 그룹 페이지' });
      await expect(dlg).toBeVisible();
      await expect(dlg.getByText('멤버 전용 공간')).toBeVisible();
      await dlg.getByRole('button', { name: '가입하기' }).click();
      await expect(toast(page, '가입되었습니다')).toBeVisible();
      await expect(dlg.getByRole('button', { name: '가입됨 · 탈퇴' })).toBeVisible();

      // 채팅
      await dlg.getByPlaceholder('메시지 입력…').fill('안녕하세요 반갑습니다');
      await dlg.getByRole('button', { name: '전송' }).click();
      await expect(dlg.getByText('안녕하세요 반갑습니다')).toBeVisible();

      // 탭 전환 때 탭바가 튀지 않는다
      const bar = dlg.locator('[data-group-tabbar]');
      const y0 = await bar.evaluate((e) => e.getBoundingClientRect().top);
      await dlg.getByRole('tab', { name: '게시판' }).or(dlg.getByRole('button', { name: '게시판' })).first().click();
      await expect(dlg.getByRole('button', { name: '+ 글쓰기' })).toBeVisible();
      await page.waitForTimeout(300);
      const y1 =await bar.evaluate((e) => e.getBoundingClientRect().top);
      expect(Math.abs(y1 - y0), `탭바 이동 ${y0}→${y1}`).toBeLessThanOrEqual(1);

      // 글쓰기 → 삭제
      await dlg.getByRole('button', { name: '+ 글쓰기' }).click();
      await dlg.getByPlaceholder('제목(선택)').fill('첫 모임 공지');
      await dlg.getByPlaceholder('내용').fill('토요일 저녁 7시 모입니다');
      await dlg.getByRole('button', { name: '등록' }).click();
      await expect(toast(page, '등록되었습니다')).toBeVisible();
      const post = dlg.locator('li').filter({ hasText: '토요일 저녁 7시 모입니다' });
      await expect(post).toBeVisible();
      await post.getByRole('button', { name: '삭제' }).click();
      await expect(post, '내 글 삭제가 서버에서 거부되면 글이 남는다').toHaveCount(0);
      await expect(page.getByText(/권한이 없거나 이미 바뀐 항목입니다/)).toHaveCount(0);
      expect(calls).toContain('DELETE group_posts');
      expect(calls).not.toContain('PATCH group_posts');

      // 순위 — 글쓰기 입력칸 포커스가 스크롤을 옮겼을 수 있으니 **누르기 직전**을 기준으로 잰다
      const yb = await bar.evaluate((e) => e.getBoundingClientRect().top);
      await dlg.getByRole('tab', { name: '순위' }).or(dlg.getByRole('button', { name: '순위' })).first().click();
      await expect(dlg.getByText(/팀 활동 순위입니다/)).toBeVisible();
      await page.waitForTimeout(300);
      const y2 = await bar.evaluate((e) => e.getBoundingClientRect().top);
      expect(Math.abs(y2 - yb), `탭바 이동 ${yb}→${y2}`).toBeLessThanOrEqual(1);

      const ov = await hOverflow(page);
      expect(ov.doc, '문서 가로 넘침').toBeLessThanOrEqual(0);
      expect(ov.page, '그룹 화면 가로 넘침').toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/group-flow/${vp.name}-member.png` });
    });

    test('운영 화면: 가입 승인 · 갤러리 업로드는 community_images', async ({ page }) => {
      const { calls, uploads } = await bootGroups(page);
      await page.goto('/?tab=community');
      await page.getByTestId('sec-tab-venues').click(); // 2026-10-10 기본 섹션이 게시판 — 그룹·매장 카드는 홀덤펍에 있다
      const card = page.getByTestId('venue-card').filter({ hasText: '검증 딜러팀' });
      await expect(card).toBeVisible({ timeout: 20_000 });
      await card.click();
      const dlg = page.getByRole('dialog', { name: '검증 딜러팀 그룹 페이지' });
      await expect(dlg.getByText('운영 중인 그룹')).toBeVisible();

      await dlg.getByRole('button', { name: /멤버 관리/ }).click();
      await expect(dlg.getByText('가입 신청 (1)')).toBeVisible();
      await dlg.getByRole('button', { name: '승인', exact: true }).click();
      await expect(toast(page, '신청자 님을 승인했습니다')).toBeVisible();
      expect(calls).toContain('PATCH group_members');

      await dlg.locator('input[type=file]').setInputFiles({ name: 'a.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
      await expect(toast(page, /이미지를 추가했습니다/)).toBeVisible();
      expect(uploads.length).toBe(1);
      expect(uploads[0], '그룹 갤러리는 community_images/venues/<그룹id>/ 로 올라간다(posters 아님)').toMatch(new RegExp(`^community_images/venues/${G_MINE}/`));
      expect(calls).toContain('PATCH venues');

      const ov = await hOverflow(page);
      expect(ov.doc).toBeLessThanOrEqual(0);
      expect(ov.page).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/group-flow/${vp.name}-manager.png` });
    });
  });
}
