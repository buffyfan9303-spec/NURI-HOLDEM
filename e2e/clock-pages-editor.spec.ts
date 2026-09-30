// 진행 중 [TV 페이지] 편집(K단계, 2026-09-30) — 레벨·인원은 그대로 두고 config(prizes·extraPages)만 바꾼다.
// 요구 원문: .claude/handoff/specs-0930/PLAN-AB-exec.md §5-1 · W-defects.md#W-11. PC 1440(업주 기준).
// 쓰기는 가짜 서버가 받는다(운영 쓰기 0). 단언: PATCH 본문 = config 한 칸 · 미리보기 보드에 새 페이지가 뜬다 · 콘솔 오류 0.
import { test, expect } from './_fixtures';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

const RAIL = '[data-mystore-rail]';
const level = (sb: number, bb: number) => ({ kind: 'level', sb, bb, ante: bb, minutes: 20 });
const clockRow = () => ({
  venue_id: MOCK_VENUE, game_seq: 1, session_date: null, title: '깐부 팀전',
  config: {
    title: '깐부 팀전', startStack: 50_000, rebuyStack: 0, addonStack: 0, isAddon: false,
    earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 0, maxLevel: 3,
    earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0,
    prizes: [], levels: [level(100, 200), level(200, 400)],
  },
  current_index: 0, running: false, ends_at: null, remaining_ms: 20 * 60_000,
  adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0, live_stats: null,
  updated_at: new Date().toISOString(),
});

test('TV 페이지 — 팀 점수 페이지를 켜면 config 만 저장되고 미리보기 보드에 팀 순위가 뜬다', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  // 목 업주 환경은 가짜 토큰이라 목킹하지 않은 운영 조회가 401·차단으로 콘솔에 찍힌다(이 기능과 무관한 하네스 잡음).
  //   그래서 '리소스 로드 실패' 줄은 URL 로 따로 모아 **클락 관련 URL 이 없는지**만 본다 — 앱 오류(console.error·pageerror)는 0 이어야 한다.
  const badUrls: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) badUrls.push(`${r.status()} ${r.url().split('?')[0]}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  const writes: Record<string, unknown>[] = [];
  let row: Record<string, unknown> = clockRow();
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 }, clock: row,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/clock_ads/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await p.route(/\/rest\/v1\/clock_states/, async (r) => {
        const m = r.request().method();
        if (m === 'GET') {
          const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) });
        }
        if (m === 'PATCH') {
          const b = r.request().postDataJSON() as Record<string, unknown>;
          writes.push(b);
          row = { ...row, ...b };
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([row]) });
        }
        return r.fallback();
      });
    },
  });
  await openMyStore(page);
  await expect(page.locator(RAIL)).toBeVisible({ timeout: 20_000 });
  await page.evaluate((sel) => {
    [...document.querySelectorAll<HTMLElement>(`${sel} button`)].find((x) => getComputedStyle(x).display !== 'none' && x.textContent?.trim() === '클락')?.click();
  }, RAIL);
  await expect(page.getByTestId('clk-edit-pages')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('clk-edit-pages').click();
  await page.getByTestId('clk-extra-add').click();
  await page.getByLabel('추가 페이지 1 종류').selectOption('team');
  await page.getByLabel('추가 페이지 1 제목').fill('깐부 팀 순위');
  await page.getByLabel('페이지 1 1줄 이름표').fill('A팀');
  await page.getByLabel('페이지 1 1줄 내용').fill('2, 9');
  await page.getByRole('button', { name: '+ 줄' }).click();
  await page.getByLabel('페이지 1 2줄 이름표').fill('B팀');
  await page.getByLabel('페이지 1 2줄 내용').fill('1');
  await expect(page.getByText('팀 순위 미리보기 · 1위 A팀 16점 · 2위 B팀 14점')).toBeVisible();
  await page.screenshot({ path: 'test-results/clock-shots/k-editor-1440.png' });
  // 44px 누름 영역 · 적용 버튼은 모달 아래에 붙어 스크롤 없이 보인다(design-reviewer ⑤)
  for (const name of ['+ 줄', '+ 추가 페이지', '+ 상금']) {
    const all = page.getByRole('button', { name, exact: true });
    const n = await all.count();
    for (let i = 0; i < n; i++) expect((await all.nth(i).boundingBox())!.height, `${name} 높이`).toBeGreaterThanOrEqual(44);
  }
  const apply = page.getByTestId('clk-pages-apply');
  expect((await apply.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const inView = await apply.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  expect(inView, 'TV 에 적용 버튼이 화면 밖이다').toBe(true);
  // ④ 문구를 넣으면 금액 칸이 비워지고 잠긴다 · §28 금칙 표현이면 적용이 막힌다
  await page.getByRole('button', { name: '+ 상금', exact: true }).click();
  await page.getByLabel('1번째 줄 금액').fill('500000');
  await page.getByLabel('1번째 줄 시상 문구').fill('시드권');
  await expect(page.getByLabel('1번째 줄 금액')).toBeDisabled();
  await expect(page.getByLabel('1번째 줄 금액')).toHaveValue('');
  await page.getByLabel('1번째 줄 메모').fill('칩 환전 가능');
  await expect(page.getByTestId('clk-pages-blocked')).toBeVisible();
  await expect(apply).toBeDisabled();
  await page.getByLabel('1번째 줄 메모').fill('결승 직행');
  await expect(apply).toBeEnabled();
  await page.getByTestId('clk-pages-apply').click();

  await expect.poll(() => writes.length).toBeGreaterThan(0);
  const w = writes[writes.length - 1];
  // 바뀐 칸 = config 한 칸(레벨·시간·인원 칸을 건드리지 않는다)
  expect(Object.keys(w).filter((k) => k !== 'updated_at')).toEqual(['config']);
  const cfg = w.config as { extraPages: { kind: string; title: string; points: number[]; rows: { label: string }[] }[]; levels: unknown[] };
  expect(cfg.extraPages[0]).toMatchObject({ kind: 'team', title: '깐부 팀 순위' });
  expect(cfg.extraPages[0].points.slice(0, 3)).toEqual([14, 12, 10]);
  expect(cfg.levels).toHaveLength(2);
  // 미리보기(= TV 축소판)에 팀 순위가 뜬다 — 시상이 없어 이 페이지 한 장뿐이다.
  const prizes = page.getByTestId('clk-prizes').first();
  await expect(prizes).toContainText('1. A팀');
  await expect(prizes).toContainText('16 PTS');
  expect(errors, errors.join('\n')).toEqual([]);
  console.log('[bad-urls]', JSON.stringify([...new Set(badUrls)]));
  expect(badUrls.filter((u) => /clock/.test(u)), '클락 조회가 실패했다').toEqual([]);
});
