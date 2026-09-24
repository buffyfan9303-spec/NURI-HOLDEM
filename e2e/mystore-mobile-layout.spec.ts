// 내 매장 모바일 레이아웃 4건(오너 2026-09-24 S1·S2·V1·K1) — 모바일(<768)만 바꾸고 PC 는 그대로인가.
//
// S1 단계 바: 칸 폭이 달라 알약이 이동마다 커졌다 줄었다 했다(실측 360: 요약 51.14 · 나머지 42.64 → 알약 43↔51).
//    원인은 요약 칸만의 `!px-2` — flex-1 basis-0 은 패딩을 뺀 나머지를 나누므로 패딩 차(8.5px)가 그대로 폭 차가 된다.
// S2 장부 새 게임: 하단 고정 '장부 시작' 바가 '대회 시작 시각' 칸을 덮은 채 포커스돼도 스크롤되지 않았다(10px 가림).
// V1 이용권 발급: '아이디로 지정' 을 누르면 '받는 손님 필수' 라벨이 사라져 판 높이가 −20.19px 출렁였다.
// K1 클락: Level 줄과 Min·Sec 줄이 갈라져 있었고, 미리보기가 반응형 축소라 글자 쌍 20여 개가 겹쳤다(PC 는 3).
//
// ⚠ 목킹 업주(e2e/_mockOwner) — 화면 배치 계약 전용이다. 서버 권한의 근거로 쓰지 않는다.
// ⚠ 가상 키보드가 뜬 상태(visualViewport 축소)는 이 하네스가 재현하지 못한다 — S2 는 '포커스 순간' 만 본다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

const RAIL = '[data-mystore-rail]';
const CLOCK = {
  venue_id: MOCK_VENUE, game_seq: 1, session_date: null, title: '금요 딥스택 100K GTD',
  config: {
    title: '금요 딥스택 100K GTD', startStack: 50_000, rebuyStack: 70_000, addonStack: 0, isAddon: false,
    earlyBonus: 5_000, doubleEarlyBonus: 10_000, regCloseLevel: 3, maxLevel: 26,
    earlyDoubleLevel: 2, earlySingleLevel: 5, earlyDoubleMin: 40, earlySingleMin: 100, mysteryBounty: 0,
    prizes: [{ place: '1st', amount: 400 }, { place: '2nd', amount: 150 }],
    levels: [
      { kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 },
      { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 20 },
    ],
  },
  current_index: 0, running: false, ends_at: null, remaining_ms: 12 * 60_000 + 34_000,
  adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 24,
  live_stats: { entries: 42, rebuys: 6, alive: 18, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 },
};

async function open(page: Page, w: number, h: number) {
  await bootOwner(page, { viewport: { width: w, height: h }, appSettings: { identity_voucher_enabled: 'on' }, clock: CLOCK });
  await openMyStore(page);
  await expect(page.locator(RAIL), '목킹 업주로 내 매장 단계 바를 열지 못했다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500); // 권한·킬스위치가 늦게 오면 칸 수가 바뀐다
}
/** 레일 칸을 누른다 — Playwright click 의 자동 스크롤이 측정을 흔들지 않게 DOM click. 못 찾으면 실패. */
async function pick(page: Page, name: string) {
  const ok = await page.evaluate(([sel, n]) => {
    const b = [...document.querySelectorAll<HTMLElement>(`${sel} button`)].find((x) => getComputedStyle(x).display !== 'none' && x.textContent?.trim() === n);
    b?.click(); return !!b;
  }, [RAIL, name] as const);
  expect(ok, `레일에 «${name}» 칸이 없다`).toBe(true);
}

/** 미리보기 안 글자 잎끼리 겹친 쌍 수. */
const stageOverlaps = (page: Page) => page.evaluate(() => {
  const stage = document.querySelector<HTMLElement>('[data-testid="clk-rails"]')?.closest<HTMLElement>('.rounded-card');
  if (!stage) return -1;
  const leaves = [...stage.querySelectorAll<HTMLElement>('*')].filter((e) => e.children.length === 0 && (e.textContent ?? '').trim() && e.getBoundingClientRect().width > 0);
  let n = 0;
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i].getBoundingClientRect(), b = leaves[j].getBoundingClientRect();
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) n++;
  }
  return n;
});

/** 콘솔 라벨(Level·Min·Sec)의 top. */
const stepperTops = (page: Page) => page.evaluate(() => {
  const box = document.querySelector<HTMLElement>('[data-testid="clk-main-action"]')!.parentElement!;
  const t: Record<string, number> = {};
  for (const s of box.querySelectorAll<HTMLElement>('span')) {
    const m = /^(Level|Min|Sec)$/.exec((s.textContent ?? '').trim());
    if (m) t[m[1]] = s.getBoundingClientRect().top;
  }
  return t;
});

test.describe('내 매장 모바일 — S1·S2·V1·K1', () => {
  for (const [W, H] of [[360, 780], [390, 844], [412, 915]] as const) {
    test(`${W}px — 칸 폭 균등·알약 폭 불변 · 클락 한 줄·미리보기 겹침 0 · 장부 포커스 가림 0 · 발급 높이 변화 0`, async ({ page }) => {
      test.setTimeout(150_000);
      await open(page, W, H);

      // ── S1 ──
      const rail = await page.evaluate((sel) => {
        const r = document.querySelector<HTMLElement>(sel)!;
        const bs = [...r.querySelectorAll<HTMLElement>('button')].filter((b) => getComputedStyle(b).display !== 'none');
        return { h: r.getBoundingClientRect().height, w: bs.map((b) => b.getBoundingClientRect().width), bh: bs.map((b) => b.getBoundingClientRect().height) };
      }, RAIL);
      expect(rail.w.length, '레일 칸이 7개가 아니다').toBe(7);
      expect(Math.max(...rail.w) - Math.min(...rail.w), `칸 폭이 서로 다르다: ${rail.w.map((x) => x.toFixed(2))}`).toBeLessThanOrEqual(0.5);
      for (const h of rail.bh) expect(h, '칸 높이가 44px 유효 터치 미만').toBeGreaterThanOrEqual(44);
      expect(rail.h, `레일 높이 ${rail.h}px — 모바일은 칸 높이(44)로 줄였다(종전 50.25)`).toBeLessThanOrEqual(44.5);
      const pills: number[] = [];
      for (const n of ['포스터', '장부', '순위', '정산', '이용권', '요약']) {
        await pick(page, n);
        await page.waitForTimeout(600);
        pills.push(await page.evaluate((sel) => document.querySelector<HTMLElement>(`${sel} [data-sliding-pill]`)?.getBoundingClientRect().width ?? -1, RAIL));
      }
      expect(Math.min(...pills), '알약을 못 찾았다 — 빈 검사').toBeGreaterThan(0);
      expect(Math.max(...pills) - Math.min(...pills), `알약 폭이 칸마다 바뀐다: ${pills.map((x) => x.toFixed(1))}`).toBeLessThanOrEqual(1);

      // ── V1 ── (지금 요약 → 이용권)
      await pick(page, '이용권');
      const hdr = page.getByRole('button', { name: /매장이용권 발급/ }).first();
      await expect(hdr, '이용권 발급 섹션이 없다').toBeVisible({ timeout: 15_000 });
      await expect(hdr.getByText(/업주\s*·\s*공동운영자/), '모바일 제목 옆 «업주·공동운영자» 가 남아 있다').toBeHidden();
      await hdr.evaluate((b) => (b as HTMLElement).click());
      const panel = hdr.locator('..');
      await expect(panel.getByRole('button', { name: /아이디\(닉네임\)로 지정/ })).toBeVisible();
      for (const mode of [/아이디\(닉네임\)로 지정/, /전화번호로 지정/]) {
        const h0 = await panel.evaluate((p) => p.getBoundingClientRect().height);
        await panel.getByRole('button', { name: mode }).evaluate((b) => (b as HTMLElement).click());
        await page.waitForTimeout(300);
        const h1 = await panel.evaluate((p) => p.getBoundingClientRect().height);
        expect(Math.abs(h1 - h0), `«${mode.source}» 를 누르자 발급 판 높이가 ${(h1 - h0).toFixed(2)}px 변했다`).toBeLessThanOrEqual(0.5);
        await expect(panel.getByText('받는 손님', { exact: false }).first(), '«받는 손님 필수» 라벨이 사라졌다').toBeVisible();
        await panel.getByRole('button', { name: '취소', exact: true }).evaluate((b) => (b as HTMLElement).click());
        await page.waitForTimeout(300);
      }

      // ── K1 ──
      await pick(page, '클락');
      await expect(page.getByTestId('clk-main-action')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1200);
      const t = await stepperTops(page);
      expect(Object.keys(t).sort(), 'Level·Min·Sec 라벨을 못 찾았다').toEqual(['Level', 'Min', 'Sec']);
      expect(Math.abs(t.Level - t.Min), `Level(${t.Level}) 과 Min(${t.Min}) 이 다른 줄이다`).toBeLessThanOrEqual(1);
      expect(Math.abs(t.Sec - t.Min)).toBeLessThanOrEqual(1);
      await expect(page.locator('[data-clk-stage-slot="scaled"]'), '모바일 미리보기가 PC 캔버스 축소가 아니다').toHaveCount(1);
      expect(await stageOverlaps(page), '미리보기 글자가 서로 겹친다').toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '문서가 가로로 넘친다').toBeLessThanOrEqual(0);

      // ── S2 ──
      await pick(page, '장부');
      await page.waitForTimeout(2000);
      const today = page.getByRole('button', { name: /오늘 장부/ }).first();
      if (await today.isVisible().catch(() => false)) await today.evaluate((b) => (b as HTMLElement).click());
      await expect(page.getByRole('button', { name: '장부 시작', exact: true }), '장부 새 게임 폼이 안 열렸다').toBeVisible({ timeout: 15_000 });
      const s2 = await page.evaluate(() => new Promise<{ before: number; after: number }>((resolve) => {
        const lab = [...document.querySelectorAll<HTMLElement>('span')].find((e) => e.textContent?.trim().startsWith('대회 시작 시각'))!;
        const field = lab.parentElement!.querySelector<HTMLElement>('input,select,button')!;
        const bar = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === '장부 시작')!.parentElement!;
        const cover = () => Math.max(0, Math.min(field.getBoundingClientRect().bottom, bar.getBoundingClientRect().bottom) - Math.max(field.getBoundingClientRect().top, bar.getBoundingClientRect().top));
        window.scrollBy(0, field.getBoundingClientRect().bottom - bar.getBoundingClientRect().top - 10); // 오너 캡처: 칸 아래 10px 가 바 밑
        setTimeout(() => { const before = cover(); field.focus(); setTimeout(() => resolve({ before, after: cover() }), 500); }, 200);
      }));
      expect(s2.before, '재현 실패 — 칸이 바 밑으로 들어가지 않았다(빈 검사)').toBeGreaterThan(5);
      expect(s2.after, `포커스한 칸이 여전히 고정 바에 ${s2.after}px 가려진다`).toBe(0);
    });
  }

  // PC 는 한 글자도 안 바뀌어야 한다 — 모바일 전용 처방이 새지 않았는지의 음성 쪽 계약.
  test('1440 — PC 는 종전 그대로(바 50.25 · Level 따로 · 미리보기 반응형 · 발급 제목 배지 유지)', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, 1440, 900);
    expect(await page.locator(RAIL).evaluate((r) => r.getBoundingClientRect().height)).toBeCloseTo(50.25, 1);
    await pick(page, '클락');
    await expect(page.getByTestId('clk-main-action')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    const t = await stepperTops(page);
    expect(t.Min - t.Level, 'PC 에서 Level 이 Min 과 같은 줄로 올라왔다 — 모바일 처방이 샜다').toBeGreaterThan(30);
    await expect(page.locator('[data-clk-stage-slot="scaled"]')).toHaveCount(0);
    await pick(page, '이용권');
    const hdr = page.getByRole('button', { name: /매장이용권 발급/ }).first();
    await expect(hdr).toBeVisible({ timeout: 15_000 });
    await expect(hdr.getByText(/업주\s*·\s*공동운영자/)).toBeVisible();
  });
});
