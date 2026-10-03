// 게시판 보기 전환 버튼 + 기본 보기(N08) — 실측 게이트.
//
// 2026-10-04 오너 결정(안 A — 상단 한 줄): 예전 '두 슬롯 트랙'(UI-05 · 오너 2026-10-02 좌 모아보기/우 펼쳐보기)을
//   **토글 버튼 하나**로 바꿨다. 지금 보기의 아이콘(☰ 모아보기 / ▭ 펼쳐보기)을 보이고, 누르면 다른 쪽으로 간다.
//   aria-pressed = 펼쳐보기 켜짐 · data-view = 지금 보기. 찾는 것은 라벨이 아니라 data-testid(board-view-toggle)다.
// 이 파일이 보는 것
//   ① 버튼 클릭 영역 ≥44×44 CSS px, 아이콘 17~19px 중앙. 폭 320~1440 × 다크/라이트에서 화면 밖으로 안 나간다.
//   ② 눌림 120ms 동안 줄(부모)은 움직이지 않고, 놓은 뒤 정지 상태에서 버튼 크기가 원래대로다.
//   ③ aria-pressed · data-view · 저장값(nuri:board-view) · 실제 렌더(PostCard/PostRow)가 일치한다.
//   ④ N08: 키 없음 / 손상 값 / 저장소 차단(throw) → compact(모아보기). 저장값 feed → 펼쳐보기(카드) 유지. 새로고침·탭 왕복 후 유지.
//   ⑤ 첫 프레임부터 모아보기 — 버튼이 처음 그려진 프레임부터 매 rAF 마다 상태·행 종류를 기록해 펼쳐보기가 한 번도 비치지 않았는지 본다.
// 게시글은 운영 DB 읽기(_fixtures 가 쓰기를 막는다) — 글이 0건이면 렌더 판정을 skip 이 아니라 **실패**로 알린다.
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

/** stored: null = 키 제거(미선택) · 문자열 = 그 값 · 생략 = 저장소를 건드리지 않는다(재진입 검사용 — init script 는 매 탐색마다 다시 돈다) */
async function openBoard(page: Page, opts: { theme?: 'dark' | 'light'; stored?: string | null; blockStorage?: boolean } = {}) {
  await page.addInitScript(({ theme, stored, blockStorage }) => {
    try { localStorage.setItem('nuri-theme', theme ?? 'dark'); } catch { /* 차단 */ }
    try {
      if (stored === undefined) { /* keep */ }
      else if (stored === null) localStorage.removeItem('nuri:board-view');
      else localStorage.setItem('nuri:board-view', stored);
    } catch { /* 차단 */ }
    if (blockStorage) {
      // 사생활 모드·차단 환경 재현 — localStorage **프로퍼티 접근 자체**가 throw 한다
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
    }
  }, { theme: opts.theme, stored: opts.stored, blockStorage: !!opts.blockStorage });
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  const btn = page.getByTestId('board-view-toggle');
  await expect(btn, '보기 전환 버튼이 없다').toBeVisible({ timeout: 15_000 });
  return btn;
}

const geom = (page: Page) => page.evaluate(() => {
  const b = document.querySelector<HTMLElement>('[data-testid="board-view-toggle"]')!;
  const r = b.getBoundingClientRect();
  const line = b.closest('[data-board-topline]')!.getBoundingClientRect();
  const sr = b.querySelector('svg')!.getBoundingClientRect();
  return {
    w: r.width, h: r.height, right: r.right, line: { top: line.top, left: line.left, width: line.width },
    icon: { w: sr.width, cx: sr.left + sr.width / 2 - r.left, cy: sr.top + sr.height / 2 - r.top },
    pressed: b.getAttribute('aria-pressed'), view: b.getAttribute('data-view'), name: b.getAttribute('aria-label'),
  };
});

const listMode = (page: Page) => page.evaluate(() => ({
  cards: document.querySelectorAll('.cv-row-lg').length, rows: document.querySelectorAll('.cv-row-sm').length,
  stored: (() => { try { return localStorage.getItem('nuri:board-view'); } catch { return '(blocked)'; } })(),
}));

test.describe('보기 전환 버튼 — 치수·눌림 계약', () => {
  test('🔴 390: 44×44 · 아이콘 17~19 중앙 · 누르면 모아보기↔펼쳐보기 · 이름 고정', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const btn = await openBoard(page, { stored: null });
    await page.waitForTimeout(300);
    const g0 = await geom(page);
    expect(g0.w).toBeGreaterThanOrEqual(44); expect(g0.h).toBeGreaterThanOrEqual(44);
    expect(g0.icon.w).toBeGreaterThanOrEqual(17); expect(g0.icon.w).toBeLessThanOrEqual(19);
    expect(Math.abs(g0.icon.cx - g0.w / 2), '아이콘 가로 중심').toBeLessThanOrEqual(1);
    expect(Math.abs(g0.icon.cy - g0.h / 2), '아이콘 세로 중심').toBeLessThanOrEqual(1);
    expect(g0).toMatchObject({ pressed: 'false', view: 'compact', name: '펼쳐보기' });
    await btn.click();
    await page.waitForTimeout(300);
    const g1 = await geom(page);
    expect(g1).toMatchObject({ pressed: 'true', view: 'feed', name: '펼쳐보기' });
    expect(Math.abs(g1.w - g0.w)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(g1.line.top - g0.line.top), '줄이 움직였다').toBeLessThanOrEqual(0.5);
  });

  test('🔴 눌림 120ms · 놓은 뒤 정지 — 줄 불변, 정지 시 버튼 크기 원복', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const btn = await openBoard(page, { stored: 'compact' });
    await page.waitForTimeout(300);
    const rest0 = await geom(page);
    for (let k = 0; k < 2; k++) {
      const bb = (await btn.boundingBox())!;
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(120);
      const held = await geom(page);
      expect(Math.abs(held.line.top - rest0.line.top), '눌림: 줄이 움직였다').toBeLessThanOrEqual(0.5);
      expect(Math.abs(held.line.width - rest0.line.width)).toBeLessThanOrEqual(0.5);
      expect(held.w, '눌림: 버튼이 0.97 근처로 줄어야 프레스가 살아 있는 것').toBeLessThan(rest0.w);
      await page.mouse.up();
      await page.waitForTimeout(800);
      const rest = await geom(page);
      expect(Math.abs(rest.w - rest0.w), '정지: 버튼 폭 원복').toBeLessThanOrEqual(0.5);
      expect(Math.abs(rest.line.top - rest0.line.top)).toBeLessThanOrEqual(0.5);
    }
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`🔴 폭 8종 × ${theme}: 화면 안 · 44px · 아이콘 중앙`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 390, height: 844 });
      await openBoard(page, { theme, stored: null });
      for (const w of [320, 360, 390, 412, 430, 768, 1280, 1440]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(250);
        const g = await geom(page);
        expect(g.right, `${theme} ${w}px: 버튼이 뷰포트 밖`).toBeLessThanOrEqual(w + 1);
        expect(g.w, `${theme} ${w}px`).toBeGreaterThanOrEqual(44);
        expect(g.h, `${theme} ${w}px`).toBeGreaterThanOrEqual(44);
        expect(Math.abs(g.icon.cx - g.w / 2)).toBeLessThanOrEqual(1);
      }
    });
  }
});

test.describe('기본 보기(N08) — 미선택·손상·차단은 compact, 명시적 feed 는 유지', () => {
  for (const c of [
    { label: '키 없음', stored: null, expect: 'compact' },
    { label: '손상 값 grid', stored: 'grid', expect: 'compact' },
    { label: '저장값 feed', stored: 'feed', expect: 'feed' },
    { label: '저장값 compact', stored: 'compact', expect: 'compact' },
  ] as const) {
    test(`🔴 ${c.label} → ${c.expect}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const btn = await openBoard(page, { stored: c.stored });
      await page.waitForTimeout(500);
      await expect(btn).toHaveAttribute('data-view', c.expect);
      await expect(btn).toHaveAttribute('aria-pressed', String(c.expect === 'feed'));
      const m = await listMode(page);
      expect(m.cards + m.rows, '게시글이 0건이라 렌더 판정을 할 수 없다(운영 DB 읽기 실패?)').toBeGreaterThan(0);
      if (c.expect === 'feed') { expect(m.cards).toBeGreaterThan(0); expect(m.rows).toBe(0); }
      else { expect(m.rows).toBeGreaterThan(0); expect(m.cards).toBe(0); }
    });
  }

  test('🔴 저장소 접근이 throw 해도 compact 로 뜨고 버튼이 동작한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const btn = await openBoard(page, { blockStorage: true });
    await page.waitForTimeout(500);
    await expect(btn).toHaveAttribute('data-view', 'compact');
    await btn.click();
    await expect(btn).toHaveAttribute('data-view', 'feed');
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect((await listMode(page)).cards).toBeGreaterThan(0);
  });

  test('🔴 클릭 → 저장 → 새로고침·탭 왕복·뒤로가기 뒤에도 선택이 유지되고 aria·렌더가 일치한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // 첫 진입 전에만 키를 지운다(init script 에 넣으면 재진입마다 사용자의 저장값까지 지워 거짓 실패가 난다 — 실측)
    await page.goto('/');
    await page.evaluate(() => { try { localStorage.removeItem('nuri:board-view'); } catch { /* 차단 */ } });
    const btn = await openBoard(page);
    await expect(btn).toHaveAttribute('data-view', 'compact');
    await btn.click();
    await page.waitForTimeout(300);
    let m = await listMode(page);
    expect(m.stored).toBe('feed'); expect(m.cards).toBeGreaterThan(0); expect(m.rows).toBe(0);
    // 새로고침(앱이 진입 URL 을 `/` 로 정리하므로 reload 대신 같은 진입 URL 로 다시 연다 — 저장값만 남은 새 부팅)
    await page.goto('/?tab=community');
    await dismissOverlays(page);
    const bar = page.locator('[data-community-secbar]');
    await expect(bar).toBeVisible({ timeout: 20_000 });
    await bar.getByRole('button', { name: '게시판', exact: true }).click();
    await expect(btn).toHaveAttribute('data-view', 'feed', { timeout: 15_000 });
    m = await listMode(page); expect(m.cards).toBeGreaterThan(0);
    // 탭 왕복(홈 → 커뮤니티) — keep-alive 라도 상태가 그대로
    await page.getByRole('tab', { name: '홈', exact: true }).or(page.getByRole('button', { name: '홈', exact: true })).first().click();
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: '커뮤니티', exact: true }).or(page.getByRole('button', { name: '커뮤니티', exact: true })).first().click();
    await expect(btn).toHaveAttribute('data-view', 'feed', { timeout: 15_000 });
    // 뒤로가기 → 앞으로가기 — 이력 이동 뒤에도 저장된 선택(feed)이 다시 열린 게시판에 그대로 반영되는가
    await page.goBack();
    await page.waitForTimeout(300);
    await page.goForward();
    await page.waitForTimeout(300);
    if (!(await btn.isVisible())) {
      await page.getByRole('tab', { name: '커뮤니티', exact: true }).or(page.getByRole('button', { name: '커뮤니티', exact: true })).first().click();
      await page.getByRole('tab', { name: '게시판', exact: true }).or(page.getByRole('button', { name: '게시판', exact: true })).first().click();
    }
    await expect(btn).toHaveAttribute('data-view', 'feed', { timeout: 15_000 });
    // 다시 한 줄로 — 저장값도 따라간다
    await btn.click();
    await page.waitForTimeout(300);
    m = await listMode(page);
    expect(m.stored).toBe('compact'); expect(m.rows).toBeGreaterThan(0); expect(m.cards).toBe(0);
  });
});

// ⑤ 첫 프레임부터 모아보기 — 펼쳐보기로 그려졌다가 모아보기로 바뀌는 깜빡임이 없다.
//   대조군: 저장값 feed 는 같은 프로브에서 모든 프레임이 feed 여야 한다 — 프로브가 아무것도 못 보는 거짓 통과를 막는다.
for (const c of [
  { label: '미선택 → 모든 프레임이 모아보기', stored: null, want: 'compact' },
  { label: '대조군: 저장값 feed → 모든 프레임이 펼쳐보기', stored: 'feed', want: 'feed' },
] as const) {
  test(`🔴 첫 프레임 프로브(rAF) — ${c.label}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      if (window.top !== window) return;
      const frames: { view: string | null; rows: number; cards: number }[] = [];
      (window as unknown as { __bvFrames: typeof frames }).__bvFrames = frames;
      const tick = () => {
        const b = document.querySelector('[data-testid="board-view-toggle"]');
        if (b) frames.push({ view: b.getAttribute('data-view'), rows: document.querySelectorAll('.cv-row-sm').length, cards: document.querySelectorAll('.cv-row-lg').length });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await openBoard(page, { stored: c.stored });
    await page.waitForTimeout(1500);
    const frames = await page.evaluate(() => (window as unknown as { __bvFrames: { view: string | null; rows: number; cards: number }[] }).__bvFrames);
    expect(frames.length, '버튼이 그려진 프레임을 못 잡았다').toBeGreaterThan(10);
    const bad = frames.map((f, i) => ({ i, ...f })).filter((f) => (c.want === 'compact'
      ? f.view !== 'compact' || f.cards > 0
      : f.view !== 'feed' || f.rows > 0));
    expect(bad, `${c.want} 가 아닌 프레임 ${bad.length}/${frames.length}: ${JSON.stringify(bad.slice(0, 3))}`).toEqual([]);
    const last = frames[frames.length - 1];
    expect(c.want === 'compact' ? last.rows : last.cards, '게시글이 0건이라 렌더 판정을 할 수 없다(운영 DB 읽기 실패?)').toBeGreaterThan(0);
  });
}
