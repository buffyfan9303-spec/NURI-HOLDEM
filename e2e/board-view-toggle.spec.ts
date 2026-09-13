// 게시판 보기 전환 버튼(UI-05) + 기본 보기(N08) — 실측 게이트 (2026-09-13).
//
// 이 파일이 보는 것
//   ① 두 버튼의 클릭 영역이 각각 ≥44×44 CSS px, **동일한 두 슬롯**(폭·높이·radius 같음), 아이콘 17~19px 중앙.
//   ② 선택 배경(면)은 슬롯 안 네 방향 inset 이 대칭(오차 ≤1px)이고 2~4px 범위 — 선택한 쪽에 따라 여백이 달라지지 않는다.
//   ③ 눌림 120ms 동안 트랙(부모)은 움직이지 않고, 놓은 뒤 60/150/300/600ms 를 지나 정지 상태에서 inset 이 원래대로다.
//   ④ aria-pressed · 접근 가능한 이름 · 클릭 결과 · 저장값(nuri:board-view) · 실제 렌더(PostCard/PostRow)가 일치한다.
//   ⑤ N08: 키 없음 / 손상 값 / 저장소 차단(throw) → compact(한 줄 목록). 저장값 feed → 카드 유지. 새로고침·탭 왕복 후 유지.
//   ⑥ 폭 320~1440 × 다크/라이트에서 트랙이 넘치지 않고 inset 대칭이 유지된다.
// 게시글은 운영 DB 읽기(_fixtures 가 쓰기를 막는다) — 글이 0건이면 렌더 판정만 skip 이 아니라 **실패**로 알린다.
// 실행: E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/board-view-toggle.spec.ts
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
  const track = page.locator('[data-board-view-toggle]');
  await expect(track, '보기 전환 트랙이 없다').toBeVisible({ timeout: 15_000 });
  return track;
}

type Geom = { track: DOMRect; btns: { x: number; y: number; w: number; h: number; radius: string; pressed: string | null; name: string | null; icon: { w: number; h: number; cx: number; cy: number } | null; sel: { top: number; right: number; bottom: number; left: number } | null }[] };
const geom = (page: Page): Promise<Geom> => page.evaluate(() => {
  const track = document.querySelector<HTMLElement>('[data-board-view-toggle]')!;
  const tr = track.getBoundingClientRect();
  const btns = Array.from(track.querySelectorAll<HTMLButtonElement>('button')).map((b) => {
    const r = b.getBoundingClientRect();
    const svg = b.querySelector('svg');
    const sr = svg?.getBoundingClientRect();
    // 선택 면 = 배경색이 칠해진 span
    const sel = Array.from(b.querySelectorAll<HTMLElement>('span')).find((s) => !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(s).backgroundColor));
    const s = sel?.getBoundingClientRect();
    return {
      x: r.left, y: r.top, w: r.width, h: r.height, radius: getComputedStyle(b).borderRadius,
      pressed: b.getAttribute('aria-pressed'), name: b.getAttribute('aria-label'),
      icon: sr ? { w: sr.width, h: sr.height, cx: sr.left + sr.width / 2 - r.left, cy: sr.top + sr.height / 2 - r.top } : null,
      sel: s ? { top: s.top - r.top, right: r.right - s.right, bottom: r.bottom - s.bottom, left: s.left - r.left } : null,
    };
  });
  return { track: tr.toJSON(), btns };
});

function expectSlots(g: Geom, label: string) {
  expect(g.btns, `${label}: 버튼 2개`).toHaveLength(2);
  for (const b of g.btns) {
    expect(b.w, `${label}: 클릭 폭 ${b.w}`).toBeGreaterThanOrEqual(44);
    expect(b.h, `${label}: 클릭 높이 ${b.h}`).toBeGreaterThanOrEqual(44);
    expect(b.icon, `${label}: 아이콘 없음`).not.toBeNull();
    expect(b.icon!.w, `${label}: 아이콘 폭 ${b.icon!.w}`).toBeGreaterThanOrEqual(17);
    expect(b.icon!.w).toBeLessThanOrEqual(19);
    expect(Math.abs(b.icon!.cx - b.w / 2), `${label}: 아이콘 가로 중심`).toBeLessThanOrEqual(1);
    expect(Math.abs(b.icon!.cy - b.h / 2), `${label}: 아이콘 세로 중심`).toBeLessThanOrEqual(1);
  }
  const [a, b] = g.btns;
  expect(Math.abs(a.w - b.w), `${label}: 두 슬롯 폭 다름 ${a.w}/${b.w}`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(a.h - b.h)).toBeLessThanOrEqual(0.5);
  expect(a.radius).toBe(b.radius);
  // 슬롯이 트랙을 채운다 — 좌우 end cap·빈 공간 없음(보더 1px 허용)
  expect(Math.abs(a.x - g.track.left), `${label}: 트랙 왼쪽 빈틈`).toBeLessThanOrEqual(1.5);
  expect(Math.abs((b.x + b.w) - g.track.right), `${label}: 트랙 오른쪽 빈틈`).toBeLessThanOrEqual(1.5);
  expect(Math.abs(a.y - g.track.top)).toBeLessThanOrEqual(1.5);
  expect(Math.abs((a.y + a.h) - g.track.bottom)).toBeLessThanOrEqual(1.5);
  // 선택 면은 정확히 하나, 네 방향 inset 대칭·2~4px
  const sels = g.btns.filter((x) => x.sel);
  expect(sels, `${label}: 선택 면이 정확히 하나여야 한다`).toHaveLength(1);
  const s = sels[0].sel!;
  const vals = [s.top, s.right, s.bottom, s.left];
  for (const v of vals) { expect(v, `${label}: inset ${JSON.stringify(s)}`).toBeGreaterThanOrEqual(2); expect(v).toBeLessThanOrEqual(4); }
  expect(Math.max(...vals) - Math.min(...vals), `${label}: inset 비대칭 ${JSON.stringify(s)}`).toBeLessThanOrEqual(1);
  return s;
}

const listMode = (page: Page) => page.evaluate(() => ({
  cards: document.querySelectorAll('.cv-row-lg').length, rows: document.querySelectorAll('.cv-row-sm').length,
  stored: (() => { try { return localStorage.getItem('nuri:board-view'); } catch { return '(blocked)'; } })(),
}));

test.describe('보기 전환 버튼 — 두 슬롯 치수 계약(UI-05)', () => {
  test('🔴 390: 44×44 슬롯 · 아이콘 17~19 중앙 · 선택 inset 대칭 · 양쪽 선택에서 여백 동일', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const track = await openBoard(page, { stored: null });
    await page.waitForTimeout(300);
    const g0 = await geom(page);
    const s0 = expectSlots(g0, '초기(compact)');
    expect(g0.btns.map((b) => b.pressed)).toEqual(['false', 'true']);
    expect(g0.btns.map((b) => b.name)).toEqual(['카드 보기', '한 줄 목록']);

    await track.getByRole('button', { name: '카드 보기' }).click();
    await page.waitForTimeout(700);
    const g1 = await geom(page);
    const s1 = expectSlots(g1, 'feed 선택');
    expect(g1.btns.map((b) => b.pressed)).toEqual(['true', 'false']);
    // 선택한 쪽이 바뀌어도 inset 값이 같다
    expect(Math.abs(s1.left - s0.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(s1.top - s0.top)).toBeLessThanOrEqual(1);
    // 트랙 자체는 움직이지 않았다
    expect(Math.abs(g1.track.left - g0.track.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(g1.track.width - g0.track.width)).toBeLessThanOrEqual(0.5);
  });

  test('🔴 눌림 120ms · 놓은 뒤 60/150/300/600ms · 정지 — 트랙 불변, 정지 시 inset 원복(좌·우 각각)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const track = await openBoard(page, { stored: 'compact' });
    await page.waitForTimeout(300);
    const rest0 = await geom(page);
    for (const name of ['카드 보기', '한 줄 목록'] as const) {
      const btn = track.getByRole('button', { name });
      const bb = (await btn.boundingBox())!;
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(120);
      const held = await geom(page);
      const hb = held.btns.find((b) => b.name === name)!;
      // 전역 프레스(scale .97)는 버튼(아이콘+선택면 함께)에만 — 트랙은 제자리
      expect(Math.abs(held.track.left - rest0.track.left), `${name} 눌림: 트랙이 움직였다`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(held.track.width - rest0.track.width)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(held.track.top - rest0.track.top)).toBeLessThanOrEqual(0.5);
      expect(hb.w, `${name} 눌림: 버튼이 0.97 근처로 줄어야 프레스가 살아 있는 것`).toBeLessThan(rest0.btns[0].w);
      await page.mouse.up();
      const timeline: Record<number, ReturnType<typeof expectSlots> | null> = {};
      let t = 0;
      for (const at of [60, 150, 300, 600]) {
        await page.waitForTimeout(at - t); t = at;
        const g = await geom(page);
        timeline[at] = g.btns.find((b) => b.sel)?.sel ?? null;
        expect(Math.abs(g.track.left - rest0.track.left), `${name} +${at}ms: 트랙`).toBeLessThanOrEqual(0.5);
      }
      await page.waitForTimeout(400);
      const rest = await geom(page);
      const s = expectSlots(rest, `${name} 정지`);
      console.log(`[${name}] held=${JSON.stringify(hb.sel)} timeline=${JSON.stringify(timeline)} rest=${JSON.stringify(s)}`);
      for (const b of rest.btns) expect(Math.abs(b.w - rest0.btns[0].w), `${name} 정지: 버튼 폭 원복`).toBeLessThanOrEqual(0.5);
    }
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`🔴 폭 8종 × ${theme}: 트랙 넘침 없음 · inset 대칭 유지 · 선택/비선택 색 구분`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 390, height: 844 });
      await openBoard(page, { theme, stored: null });
      for (const w of [320, 360, 390, 412, 430, 768, 1280, 1440]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(250);
        const g = await geom(page);
        expectSlots(g, `${theme} ${w}px`);
        expect(g.track.right, `${theme} ${w}px: 트랙이 뷰포트 밖`).toBeLessThanOrEqual(w + 1);
        const colors = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-board-view-toggle] button')).map((b) => getComputedStyle(b).color));
        expect(colors[0], `${theme} ${w}px: 선택/비선택 글자색이 같다`).not.toBe(colors[1]);
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
      const track = await openBoard(page, { stored: c.stored });
      await page.waitForTimeout(500);
      const pressed = await track.getByRole('button', { name: c.expect === 'feed' ? '카드 보기' : '한 줄 목록' }).getAttribute('aria-pressed');
      expect(pressed).toBe('true');
      const m = await listMode(page);
      expect(m.cards + m.rows, '게시글이 0건이라 렌더 판정을 할 수 없다(운영 DB 읽기 실패?)').toBeGreaterThan(0);
      if (c.expect === 'feed') { expect(m.cards).toBeGreaterThan(0); expect(m.rows).toBe(0); }
      else { expect(m.rows).toBeGreaterThan(0); expect(m.cards).toBe(0); }
    });
  }

  test('🔴 저장소 접근이 throw 해도 compact 로 뜨고 버튼이 동작한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const track = await openBoard(page, { blockStorage: true });
    await page.waitForTimeout(500);
    await expect(track.getByRole('button', { name: '한 줄 목록' })).toHaveAttribute('aria-pressed', 'true');
    await track.getByRole('button', { name: '카드 보기' }).click();
    await expect(track.getByRole('button', { name: '카드 보기' })).toHaveAttribute('aria-pressed', 'true');
    expect((await listMode(page)).cards).toBeGreaterThan(0);
  });

  test('🔴 클릭 → 저장 → 새로고침·탭 왕복·뒤로가기 뒤에도 선택이 유지되고 aria·렌더가 일치한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // 첫 진입 전에만 키를 지운다(init script 에 넣으면 재진입마다 사용자의 저장값까지 지워 거짓 실패가 난다 — 실측)
    await page.goto('/');
    await page.evaluate(() => { try { localStorage.removeItem('nuri:board-view'); } catch { /* 차단 */ } });
    const track = await openBoard(page);
    await expect(track.getByRole('button', { name: '한 줄 목록' })).toHaveAttribute('aria-pressed', 'true');
    await track.getByRole('button', { name: '카드 보기' }).click();
    await page.waitForTimeout(300);
    let m = await listMode(page);
    expect(m.stored).toBe('feed'); expect(m.cards).toBeGreaterThan(0); expect(m.rows).toBe(0);
    // 새로고침(앱이 진입 URL 을 `/` 로 정리하므로 reload 대신 같은 진입 URL 로 다시 연다 — 저장값만 남은 새 부팅)
    await page.goto('/?tab=community');
    await dismissOverlays(page);
    const bar = page.locator('[data-community-secbar]');
    await expect(bar).toBeVisible({ timeout: 20_000 });
    await bar.getByRole('button', { name: '게시판', exact: true }).click();
    await expect(page.locator('[data-board-view-toggle]').getByRole('button', { name: '카드 보기' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    m = await listMode(page); expect(m.cards).toBeGreaterThan(0);
    // 탭 왕복(홈 → 커뮤니티) — keep-alive 라도 상태가 그대로
    await page.getByRole('tab', { name: '홈', exact: true }).or(page.getByRole('button', { name: '홈', exact: true })).first().click();
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: '커뮤니티', exact: true }).or(page.getByRole('button', { name: '커뮤니티', exact: true })).first().click();
    await expect(page.locator('[data-board-view-toggle]').getByRole('button', { name: '카드 보기' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    // 뒤로가기 → 앞으로가기 — 앱의 history 층은 탭/모달 단위라 게시판 하위탭이 자동 복원되지 않을 수 있다.
    // 여기서 보는 것은 '이력 이동 뒤에도 저장된 선택(feed)이 다시 열린 게시판에 그대로 반영되는가' 다.
    await page.goBack();
    await page.waitForTimeout(300);
    await page.goForward();
    await page.waitForTimeout(300);
    if (!(await page.locator('[data-board-view-toggle]').isVisible())) {
      await page.getByRole('tab', { name: '커뮤니티', exact: true }).or(page.getByRole('button', { name: '커뮤니티', exact: true })).first().click();
      await page.getByRole('tab', { name: '게시판', exact: true }).or(page.getByRole('button', { name: '게시판', exact: true })).first().click();
    }
    await expect(page.locator('[data-board-view-toggle]').getByRole('button', { name: '카드 보기' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    // 다시 한 줄로 — 저장값도 따라간다
    await page.locator('[data-board-view-toggle]').getByRole('button', { name: '한 줄 목록' }).click();
    await page.waitForTimeout(300);
    m = await listMode(page);
    expect(m.stored).toBe('compact'); expect(m.rows).toBeGreaterThan(0); expect(m.cards).toBe(0);
  });
});
