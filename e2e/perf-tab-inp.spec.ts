// 느린 기기에서 탭을 누를 때마다 멈추던 것 (R-03 · audit-regress-1001 · 2026-10-01) — 성능 계약.
//
// 원인(리드 A/B 확정 · rcd\out\ab-matrix.jsonl):
//   ① 재방문 — 떠나는 판(PANE-HANDOFF ②)이 방금 숨긴 옛 판을 display:block·fixed 로 되살려 같은 프레임에 두 판을 그렸다.
//      → 오너 결정: 재방문은 떠나는 판 연출 없이 즉시 교체(첫 방문 연출 유지). src/lib/tabCover.ts notePaneLeaving.
//   ② 캘린더 첫 표시 — Pretendard Variable 조판 한 번의 Layout 이 650~927ms. → 오너 결정: 날짜 숫자 영역만 시스템 글꼴.
// 잠그는 것(Pixel 7 · CPU 6배 · CDP 터치 110ms · 다크 · 목 로그인 · 미리 마운트 뒤, 새 페이지 3회의 중앙값):
//   재 홈→커뮤니티 · 재 커뮤니티→홈 ≤ 160ms, 첫 홈→캘린더 ≤ 800ms.
//   지표 = Event Timing duration(입력 → 다음 프레임 표시) 중 그 이동 창의 최댓값.
// 음성 대조: 수정 전 빌드(b7ad649c)에서 FAIL(재방문 240~300 · 캘린더 1100~1900).
import { test, expect } from './_fixtures';
import { ANON_KEY, stubLogin } from './_session';
import { mockSchedules } from './_schedules';
import { press, center } from './_flicker';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
// @boot — 단일 워커로 따로 돈다(npm run test:e2e:boot). CPU 6배 측정은 병렬 러너 부하를 그대로 세어 흔들린다
//   (실측: 병렬 전체 실행에서 첫 홈→캘린더 808/952/936 FAIL · 같은 빌드 단독 3회 800/736/760 PASS).
test.describe.configure({ mode: 'serial' });

const TAB = (l: string) => ({ sel: 'nav[aria-label="하단 내비게이션"] button', text: l, exact: true });
const PATH: [string, string][] = [['홈', '캘린더'], ['캘린더', '홈'], ['홈', '커뮤니티'], ['커뮤니티', '홈'], ['홈', '커뮤니티'], ['커뮤니티', '홈']];

async function oneRun(page: Page): Promise<Record<string, number>> {
  // 목 로그인 세션은 서명이 없어 조회가 401 이 된다 — 읽기 요청만 공개 키로 돌려 실제 화면 크기로 잰다(쓰기는 _fixtures 가 끊는다).
  await page.route(/supabase\.co\/rest\/v1\//, (r) => r.continue({ headers: { ...r.request().headers(), authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY } }));
  await stubLogin(page);
  await mockSchedules(page);
  await page.addInitScript(() => {
    if (window.top !== window) return;
    try { localStorage.setItem('nuri-theme', 'dark'); } catch { /* 저장소 차단 */ }
    const w = window as unknown as { __ev: [number, number][] };
    w.__ev = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__ev.push([performance.timeOrigin + e.startTime, e.duration]); })
        .observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    } catch { /* 미지원 */ }
  });
  const cdp = await page.context().newCDPSession(page);
  await page.goto('/');
  await page.getByTestId('home-schedule-title').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(8000); // idle 미리 마운트가 끝난 뒤(감사 A/B 와 같은 조건)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const out: Record<string, number> = {};
  const seen = new Set<string>();
  try {
    for (const [from, to] of PATH) {
      const h = await center(page, TAB(to));
      expect(h, `${to} 버튼`).not.toBeNull();
      await page.waitForTimeout(400);
      const t0 = await page.evaluate(() => performance.timeOrigin + performance.now());
      await press(page, cdp, h!.x, h!.y, true);
      await page.waitForTimeout(1600);
      const max = await page.evaluate((t) => Math.max(0, ...(window as unknown as { __ev: [number, number][] }).__ev
        .filter((e) => e[0] >= t - 50 && e[0] <= t + 1600).map((e) => e[1])), t0);
      const key = `${from}→${to}`;
      out[`${seen.has(key) ? '재' : '첫'} ${key}`] = Math.round(max);
      seen.add(key);
      await page.waitForTimeout(600);
    }
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  return out;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test('🔴 CPU 6배 — 탭 재방문 ≤ 160ms · 캘린더 첫 표시 ≤ 800ms (3회 중앙값) @boot', async ({ context }) => {
  test.setTimeout(300_000);
  const runs: Record<string, number>[] = [];
  // 새 문서 3개 — 같은 컨텍스트(_fixtures 의 쓰기 차단 가드가 걸린 것)에서 연다. 첫 방문 경로는 문서마다 새로 생긴다.
  for (let i = 0; i < 3; i++) {
    const page = await context.newPage();
    try { runs.push(await oneRun(page)); } finally { await page.close(); }
  }
  const m = (k: string) => median(runs.map((r) => r[k] ?? Infinity));
  const report = `실측 ${JSON.stringify(runs)}`;
  console.log('[perf-tab-inp]', report);
  expect.soft(m('재 홈→커뮤니티'), `재 홈→커뮤니티 중앙값 · ${report}`).toBeLessThanOrEqual(160);
  expect.soft(m('재 커뮤니티→홈'), `재 커뮤니티→홈 중앙값 · ${report}`).toBeLessThanOrEqual(160);
  expect(m('첫 홈→캘린더'), `첫 홈→캘린더 중앙값 · ${report}`).toBeLessThanOrEqual(800);
});
