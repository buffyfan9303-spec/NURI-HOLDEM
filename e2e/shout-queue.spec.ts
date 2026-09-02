// 외치기 20초 슬롯 · 색 선택 · 한 줄 송출 — 런타임 회귀 게이트.
//
// 왜 라이브 DB 를 쓰지 않나: 외침은 **전체 커뮤니티에 보이는** 글이라 테스트가 한 건이라도 심으면
//   실사용자 화면에 그대로 뜬다(잔존 0 을 증명해도 그 사이의 노출은 되돌릴 수 없다).
//   그래서 PostgREST 응답만 page.route 로 가로챈다 — 쓰기는 buy_shout RPC 하나뿐이고 그것도 가로챈다.
//   가로채는 경로는 외치기에 필요한 5개뿐이고 프로필·세션은 실제 서버를 그대로 쓴다
//   (그래야 '로그인한 사용자'의 렌더 경로가 진짜로 검증된다).
//
// 이 스펙이 잠그는 것 — ①~④는 2026-08-30 슬롯 전환, ⑤~⑦은 같은 날 오너 #4('한 줄만') 지점이다:
//   ① 지금 방송 중은 plays_at <= now < expires_at 창으로 고른다(구 floor(now/20s)%n 회귀 방지).
//      경계에서 자동으로 다음 차례로 넘어가는지까지 본다 — 모듈로였다면 그 시각에 안 넘어간다.
//   ② 전광판(shout_board)은 구매 화면에 뜨지 않는다(서버가 active=false 로 빼 줘도 화면도 막는다).
//   ③ 색은 하이라이트에서만 뜨고, 고른 색이 --tier-*-vivid **기존 토큰**으로 적용된다(새 팔레트 금지).
//   ④ 구매 요청이 p_tier/p_color 를 실제로 싣고, 구매 뒤 '내 차례'가 화면에 뜬다.
//   ⑤ **방송 중이 아닌 것은 그 무엇도 송출되지 않는다** — 끝난 외침도, 대기 중인 외침의 내용도,
//      '대기열 N개 보기' 펼치기도, '뒤에 N개 대기' 같은 개수 표기도 화면에 없다.
//      여기가 이번 회귀 감지의 핵심이다: 예전 화면은 대기열을 전부 펼쳐 볼 수 있었다.
//   ⑥ 방송 중인 외침이 하나도 없으면 **기본 안내 문구가 20초 격자로 롤링**한다(빈 자리 금지).
//   ⑦ 유일한 예외인 '내 차례'는 순번·시각만 말하고 **내 외침 내용은 싣지 않는다**(미리 송출 금지).
import { test, expect, type Page, type Route } from '@playwright/test';
import { loginAs, stabilizeBackstack, dismissOverlays, type E2ESession } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

// 20초 슬롯 창을 요청 시각 기준으로 만드는 스펙이라 느린 CI 러너에선 슬롯 경계를 넘겨 순번·시트 상태가 어긋난다
// (2026-09-03 CI 1차 실패 → 재실행 통과). sheet-spring·subtab-motion 과 같은 CI 전용 재시도.
test.describe.configure({ retries: process.env.CI ? 2 : 0 });

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** 외침 행 한 줄 — PostgREST 가 주는 snake_case 그대로 */
function row(o: {
  id: string; msg: string; nick: string; from: number; user?: string;
  tier?: string; color?: string | null;
}) {
  return {
    id: o.id, user_id: o.user ?? '00000000-0000-0000-0000-0000000000aa',
    nickname: o.nick, message: o.msg, cost: 50,
    tier: o.tier ?? 'basic', tier_rank: 1, color: o.color ?? null,
    created_at: iso(-60_000), plays_at: iso(o.from), expires_at: iso(o.from + 20_000),
  };
}

test.describe('외치기 — 20초 슬롯 대기열', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 없음 — 로그인 필요 경로');

  let session: E2ESession;
  /** buy_shout 로 실제로 나간 인자 — 색이 서버까지 실려 가는지 확인하는 유일한 증거 */
  let sent: Record<string, unknown> | null = null;

  /** @param queue 대기열 응답을 갈아 끼운다(빈 배열 = 방송 중 0건). 생략하면 기본 4건 픽스처. */
  async function mount(page: Page, queue?: unknown[]) {
    sent = null;
    session = await loginAs(page, EMAIL!, PASSWORD!);
    const myId = (session.user as { id: string }).id;
    await stabilizeBackstack(page);

    let fetches = 0;
    let bought = false;

    // ── 대기열 ────────────────────────────────────────────────────────────
    // 시각은 **요청이 들어온 순간** 기준으로 만든다. 고정 타임스탬프를 쓰면 부팅이 느린 러너에서
    // 픽스처가 이미 만료된 채 도착해 '데이터가 없어서 통과'하는 가짜 통과가 된다.
    await page.route('**/rest/v1/community_shouts*', async (route) => {
      fetches += 1;
      if (bought) {
        // 구매 뒤 재조회 — 앞사람 하나가 방송 중이고 내 것이 바로 뒤에 붙는다
        return json(route, [
          row({ id: 'cur', msg: '재조회 방송 중', nick: '앞사람', from: -2_000 }),
          row({ id: 'mine', msg: '내가 산 외침', nick: '나', from: 18_000, user: myId, tier: 'gold', color: 'blue' }),
        ]);
      }
      return json(route, queue ?? [
        // 이미 끝난 것 — 화면에 남으면 안 된다(서버도 걸러 주지만 화면도 걸러야 한다)
        row({ id: 'done', msg: '이미 끝난 외침', nick: '지난이', from: -40_000 }),
        // 지금 방송 중 — 약 6초 뒤 경계
        row({ id: 'onair', msg: '지금 방송 중인 외침', nick: '현재', from: -14_000 }),
        // 그 다음 차례
        row({ id: 'next', msg: '다음 차례 외침', nick: '다음', from: 6_000 }),
        row({ id: 'last', msg: '마지막 대기 외침', nick: '끝', from: 26_000 }),
      ]);
    });

    // ── 가격표 — 전광판을 **일부러 섞어 보낸다**(화면이 스스로 거르는지 보려고) ──
    await page.route('**/rest/v1/shop_skus*', (route) => json(route, [
      { key: 'shout_basic', kind: 'shout', label: '외치기', descr: '20초 1회 방송 · 대기열 순서대로', price: 50, duration_hours: 0, duration_seconds: 20, tier_rank: 1, sort: 1 },
      { key: 'shout_gold', kind: 'shout', label: '하이라이트', descr: '20초 1회 방송 · 색을 골라 눈에 띄게', price: 150, duration_hours: 0, duration_seconds: 20, tier_rank: 2, sort: 2 },
      { key: 'shout_board', kind: 'shout', label: '전광판', descr: '판매 중지', price: 2000, duration_hours: 24, duration_seconds: 0, tier_rank: 3, sort: 3 },
    ]));
    await page.route('**/rest/v1/rpc/shout_rules', (route) => json(route,
      [{ cost: 50, cooldown_minutes: 10, daily_cap: 3, max_len: 60, min_len: 2, ttl_hours: 0 }]));
    await page.route('**/rest/v1/rpc/my_point_balance', (route) => json(route,
      [{ total: 9000, spent: 100, available: 8900 }]));

    // ── 구매 — DB 에 쓰지 않는다. 인자만 기록하고 서버가 줬을 행을 흉내 낸다 ──
    await page.route('**/rest/v1/rpc/buy_shout', (route) => {
      sent = JSON.parse(route.request().postData() ?? '{}');
      bought = true;
      return json(route, row({
        id: 'mine', msg: '내가 산 외침', nick: '나', from: 18_000,
        user: myId, tier: 'gold', color: 'blue',
      }));
    });

    await page.goto('/');
    await dismissOverlays(page);
    // 세션이 실제로 붙은 뒤에만 진행 — 아직이면 '외치기' 가 구매 시트 대신 로그인 모달을 열어
    // '하이라이트 버튼 없음' 으로 실패했다(2026-09-03 로컬 재현 스크린샷 = 로그인 모달). clock-watchdog 과 같은 마커.
    await expect(page.getByRole('button', { name: '로그인' })).toHaveCount(0, { timeout: 20_000 });
    await page.getByRole('navigation', { name: '하단 내비게이션' })
      .getByRole('button', { name: '커뮤니티', exact: true }).click();
    await expect.poll(() => fetches, { timeout: 15_000 }).toBeGreaterThan(0);
  }

  test('방송 중인 한 줄만 — 끝난 것도 대기 중인 것도 송출되지 않는다', async ({ page }) => {
    await mount(page);
    const bar = page.getByTestId('shout-live');
    await expect(bar).toBeVisible();

    // ① 창 안에 있는 것만 뜬다.
    await expect(bar).toContainText('지금 방송 중인 외침');
    await expect(bar).toContainText('방송 중');

    // ② 나머지는 **전부** 화면에 없다 — 끝난 것도, 아직 방송 전인 것도.
    //    대조군이 ①이다: 같은 응답에 4건이 왔는데 그중 하나만 보인다는 뜻이라 '데이터가 없어서 0건'이 아니다.
    await expect(page.getByText('이미 끝난 외침')).toHaveCount(0);
    await expect(page.getByText('다음 차례 외침')).toHaveCount(0);
    await expect(page.getByText('마지막 대기 외침')).toHaveCount(0);
    // ③ 대기열을 여는 문(펼치기 버튼)도, 개수 표기도 없다 — 있으면 다시 '남의 외침'이 송출된다.
    await expect(bar.getByRole('button', { name: /대기열/ })).toHaveCount(0);
    await expect(bar).not.toContainText('대기');

    // ④ 경계(약 6초 뒤)에서 스스로 다음 차례로 넘어간다.
    //    구 모듈로(floor(now/20s)%n)였다면 이 시각에 넘어갈 이유가 없다 — 여기가 회귀 감지점이다.
    await expect(bar).toContainText('다음 차례 외침', { timeout: 20_000 });
    // 넘어가고 나면 앞엣것이 사라진다(둘이 동시에 떠 있으면 '한 줄만'이 깨진 것이다)
    await expect(page.getByText('지금 방송 중인 외침')).toHaveCount(0);
    await expect(page.getByText('마지막 대기 외침')).toHaveCount(0);
  });

  test('방송 중이 없으면 기본 안내 문구가 20초 격자로 롤링한다', async ({ page }) => {
    // 격자 한 칸(20초)이 실제로 넘어가는 것을 보려면 한 슬롯을 기다려야 한다 — 로그인 시간까지 감안해 늘린다.
    test.setTimeout(90_000);
    await mount(page, []);   // 대기열 빈 응답

    const idle = page.getByTestId('shout-idle');
    await expect(idle).toBeVisible();
    await expect(idle).toContainText('누리홀덤 안내');
    // 외치기로 들어가는 문은 남아 있어야 한다(빈 상태에서 유일한 진입점이다)
    await expect(idle.getByRole('button', { name: /외치기/ })).toBeVisible();

    const line = page.getByTestId('shout-idle-line');
    const first = (await line.textContent())?.trim() ?? '';
    expect(first.length).toBeGreaterThan(0);

    // 20초 격자의 다음 칸에서 **문구가 바뀐다**. 대조군은 first 자신이다 —
    // 바뀌지 않으면(롤링이 죽었으면) 여기서 그대로 실패한다.
    await expect
      .poll(async () => (await line.textContent())?.trim() ?? '', { timeout: 40_000 })
      .not.toBe(first);
  });

  test('색 선택 → 구매 → 대기열 — 전광판은 없고 색은 기존 토큰으로 실려 간다', async ({ page }) => {
    await mount(page);
    await page.getByTestId('shout-live').getByRole('button', { name: '외치기' }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    // ① 판매 중인 등급 둘뿐 — 전광판은 응답에 섞여 와도 화면에 없다
    await expect(sheet.getByRole('button', { name: /하이라이트/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /전광판/ })).toHaveCount(0);
    // ② 기간이 아니라 1회다
    await expect(sheet).toContainText('20초 동안 한 번');
    await expect(sheet).toContainText('하루 10번(구매 합산)');

    // ③ 색은 기본 등급에는 없고 하이라이트에서만 나온다
    await expect(sheet.getByRole('radiogroup', { name: '외침 색' })).toHaveCount(0);
    await sheet.getByRole('button', { name: /하이라이트/ }).click();
    const colors = sheet.getByRole('radiogroup', { name: '외침 색' });
    await expect(colors).toBeVisible();
    await colors.getByRole('radio', { name: '블루' }).click();

    // ④ 고른 색이 **기존 --tier-*-vivid 토큰**으로 미리보기에 적용된다(새 팔레트 금지)
    const style = await sheet.getByTestId('shout-preview').getAttribute('style');
    expect(style ?? '').toContain('--tier-blue-vivid');

    // ⑤ 구매 — 요청에 등급·색이 실려야 한다
    await sheet.getByRole('textbox').fill('색 선택 런타임 확인용 외침');
    await sheet.getByRole('button', { name: /점으로 외치기/ }).click();

    await expect.poll(() => sent, { timeout: 15_000 }).not.toBeNull();
    expect(sent).toMatchObject({ p_tier: 'gold', p_color: 'blue' });

    // ⑥ 구매 뒤 '내 차례'가 화면에 뜬다 — 산 사람이 가장 궁금한 한 줄
    const mine = page.getByTestId('shout-mine');
    await expect(mine).toBeVisible({ timeout: 15_000 });
    await expect(mine).toContainText('내 외침은');
    await expect(mine).toContainText('대기 1번째');
    // ⑦ 순번만 말한다 — 내 외침 '내용'은 아직 내 20초가 아니므로 화면 어디에도 없다(미리 송출 금지).
    //    대조군: 같은 순간 앞사람의 방송 중 외침은 정상적으로 보인다.
    await expect(page.getByText('내가 산 외침')).toHaveCount(0);
    await expect(page.getByTestId('shout-live')).toContainText('재조회 방송 중');
  });
});

