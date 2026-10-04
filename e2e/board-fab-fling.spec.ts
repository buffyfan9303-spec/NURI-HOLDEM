// 게시판 피드 끝 '글쓰기 FAB ↔ 맨 위로' 빠른 플링 겹침(PR #171 독립 검증 P3, 2026-10-05).
//
// 규칙: **두 요소가 세로로 겹칠 수 있는 동안에는 '맨 위로'가 가로로 움직이지 않는다.**
//   예전 구현은 IntersectionObserver → React 상태 → 속성 → 0.32s 전환이라, 손가락을 빠르게 튕기면(≥25px/프레임)
//   FAB 가 '맨 위로' 세로 범위를 지나는 동안에도 '맨 위로'가 아직 같은 기둥에 있거나 옆으로 미끄러지는 중이라 겹쳤다.
// 잰 것: 피드 끝 구간을 80/40/25/15/8/4 px/프레임으로 내려가고(FAB 가 올라간다) 다시 올라오며(FAB 가 내려온다),
//   **매 프레임** 두 상자의 겹침 넓이와 FAB 중심 elementFromPoint 를 본다. 하네스 click 은 0ms 라 못 재므로 rAF 루프로 스크롤한다.
//   (rAF 안 scrollTo 직후 재므로 scroll 이벤트·rAF 가 한 프레임씩 늦는 실제 플링과 같은 지연을 포함한다.)
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

async function openBoard(page: Page) {
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await page.locator('[data-testid="sec-tab-board"]').first().waitFor({ timeout: 25_000 });
  await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-board"]') as HTMLElement).click());
  await expect(page.getByTestId('board-search-open'), '한 줄 검색 아이콘이 없다').toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

// 운영 익명 피드는 글이 적어 FAB 가 끝 칸에 내려앉는다 — 길게 목킹(board-oneline.spec 의 longFeed 와 같다)
const longFeed = (page: Page) => page.route(/\/rest\/v1\/community_posts\?/, (r) => {
  if (r.request().method() !== 'GET') return r.fallback();
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Array.from({ length: 24 }, (_, i) => ({
    id: `fling-${i}`, user_id: `u-fling-${i}`, user_name: `작성자${i}`, user_role: 'user', user_color: '#888', user_avatar: null,
    content: `본문 ${i}`, created_at: new Date(Date.UTC(2026, 8, 30, 12) - i * 3600_000).toISOString(),
    like_count: 0, comment_count: 0, view_count: 0, category: 'free', title: `목록 길이용 글 ${i}`, images: [],
    badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
  }))) });
});

const SPEEDS = [80, 40, 25, 15, 8, 4] as const;
const SIZES = [[390, 844], [360, 740], [360, 640], [320, 640]] as const;

for (const [w, h] of SIZES) {
  test(`⑬ ${w}×${h}: 피드 끝 플링 80/40/25/15/8/4 px/프레임(내림·올림) — 매 프레임 FAB 와 '맨 위로' 겹침 0 · FAB 중심 누름 = 글쓰기`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: w, height: h });
    await longFeed(page);
    await openBoard(page);
    const bad = await page.evaluate(async (speeds) => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const top = () => document.querySelector<HTMLElement>('.scroll-top-fab')!;
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const sample = (label: string, out: string[], st: { shown: number; both: number }) => {
        const t = top(); const op = Number(getComputedStyle(t).opacity);
        const fab = document.querySelector('[data-testid="board-write"]')!.getBoundingClientRect();
        const s = t.getBoundingClientRect();
        if (op < 0.05) return;                                  // '맨 위로'가 안 보이면 겹칠 게 없다
        st.shown++;
        const ox = Math.min(s.right, fab.right) - Math.max(s.left, fab.left);
        const oy = Math.min(s.bottom, fab.bottom) - Math.max(s.top, fab.top);
        const lift = (innerHeight - 80.75) - fab.bottom;
        if (lift > 2) st.both++;
        const cx = fab.left + fab.width / 2, cy = fab.top + fab.height / 2;
        const hit = cy > 0 && cy < innerHeight ? document.elementFromPoint(cx, cy) : null;
        const stolen = !!hit && !!hit.closest('.scroll-top-fab');
        if ((ox > 1 && oy > 1) || stolen) out.push(`${label} y=${Math.round(scrollY)} 겹침 ${ox.toFixed(1)}x${oy.toFixed(1)} 들림 ${lift.toFixed(0)}${stolen ? ' FAB중심→맨위로' : ''}`);
      };
      const res: Record<string, { bad: string[]; shown: number; lifted: number }> = {};
      for (const v of speeds) {
        const out: string[] = []; const st = { shown: 0, both: 0 };
        // 끝 구간 700px 앞에서 정착(전환·상태 정리) 후 끝까지 내리고, 정착하지 않은 채 곧바로 다시 올라온다 — 플링은 정착을 기다리지 않는다
        for (const dir of ['down', 'up'] as const) {
          const from = dir === 'down' ? Math.max(0, max - 900) : max;
          const to = dir === 'down' ? max : Math.max(0, max - 900);
          window.scrollTo({ top: from, behavior: 'instant' });
          await sleep(700);                                       // 정착(0.32s 전환 + 신호 지연)
          let y = from;
          while (y !== to) {
            y = dir === 'down' ? Math.min(to, y + v) : Math.max(to, y - v);
            window.scrollTo({ top: y, behavior: 'instant' });
            sample(`${v}px ${dir}`, out, st);
            await frame();
          }
          for (let i = 0; i < 40; i++) { sample(`${v}px ${dir}-settle`, out, st); await frame(); }
        }
        res[String(v)] = { bad: out, shown: st.shown, lifted: st.both };
      }
      return res;
    }, [...SPEEDS]);
    for (const v of SPEEDS) {
      const r = bad[String(v)];
      expect(r.shown, `${v}px: '맨 위로'를 한 프레임도 못 쟀다`).toBeGreaterThan(20);
      expect(r.lifted, `${v}px: FAB 가 떠난 프레임을 못 쟀다(피드 끝 전제 실패)`).toBeGreaterThan(5);
      expect(r.bad.slice(0, 5), `${w}x${h} ${v}px/프레임: 겹침·가로챔 ${r.bad.length}프레임`).toEqual([]);
    }
  });
}
