// 캐시 퍼스트(Phase 6) E2E — '재방문은 스켈레톤을 보지 않는다' 를 실브라우저로 못 박는다.
//
// 1차 방문: 네트워크로 데이터를 받고 스냅샷이 localStorage 에 남는다.
// 2차 방문(새로고침): 스냅샷이 있으므로 schedulesLoaded 가 처음부터 true —
//   React 가 마운트되는 순간부터 스켈레톤(aria-busy) 없이 콘텐츠가 그려져야 한다.
import { test, expect } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

const SNAP_KEY = 'nuri:snap:schedules:v1';

test.describe('캐시 퍼스트 — 재방문 즉시 콘텐츠', () => {
  test('🔴 1차 방문이 스냅샷을 남기고, 2차 방문은 스켈레톤 없이 시작한다', async ({ page }) => {
    await stabilizeBackstack(page);

    // ── 1차 방문: 스냅샷이 실제로 저장되는가 ──────────────────────────────
    await page.goto('/');
    await dismissOverlays(page);
    await page.waitForFunction(
      (k) => { try { return localStorage.getItem(k) != null; } catch { return false; } },
      SNAP_KEY, { timeout: 15_000 },
    );
    const snap = await page.evaluate((k) => {
      const raw = localStorage.getItem(k)!;
      const env = JSON.parse(raw) as { t: number; data: unknown[] };
      return { hasT: typeof env.t === 'number', rows: Array.isArray(env.data) ? env.data.length : -1 };
    }, SNAP_KEY);
    expect(snap.hasT, '스냅샷 봉투에 타임스탬프가 없다 — TTL 판정 불가').toBe(true);
    expect(snap.rows, '스냅샷 data 가 배열이 아니다').toBeGreaterThanOrEqual(0);

    // ── 2차 방문: 마운트 직후부터 스켈레톤이 없어야 한다 ──────────────────
    await page.reload();
    // React 마운트 완료(루트에 내용) 를 기다렸다가 — 그 첫 순간을 검사한다
    await page.waitForFunction(() => (document.querySelector('#root')?.children.length ?? 0) > 0);
    const busyAtMount = await page.evaluate(() => document.querySelectorAll('[aria-busy="true"]').length);
    expect(busyAtMount, '스냅샷이 있는데도 마운트 직후 스켈레톤이 떴다 — 캐시 복원이 안 걸린 것').toBe(0);

    // 재검증(네트워크) 구간에도 스켈레톤으로 되돌아가면 안 된다 — 값만 조용히 바뀌어야 한다.
    // '보이는' 것만 센다: idle 프리마운트가 숨김(display:none) 탭을 미리 깔아두는데,
    // 그 안의 로딩 상태는 사용자에게 안 보이므로 이 계약(가시 화면의 스켈레톤 회귀 금지) 밖이다.
    await page.waitForTimeout(1500);
    const busyLater = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-busy="true"]'))
        .filter((el) => (el as HTMLElement).offsetParent !== null).length);
    expect(busyLater, '재검증 중 (보이는) 스켈레톤으로 회귀했다 — 캐시 페인트가 무의미해진다').toBe(0);
  });

  test('깨진 스냅샷은 앱을 죽이지 못한다 — 스켈레톤 경로로 조용히 물러난다', async ({ page }) => {
    await stabilizeBackstack(page);
    // ⚠ addInitScript 는 **모든 프레임**에서 실행된다. AdSense 가 만드는 same-origin
    //   (about:blank) 광고 iframe 은 부모와 localStorage 를 공유하므로, 최상위 조건이 없으면
    //   앱이 새 스냅샷을 쓴 '뒤에' iframe 쪽 스크립트가 깨진 값을 도로 덮어쓴다 —
    //   그래서 이 테스트가 '앱 결함' 처럼 3/3 실패했다(실제 범인은 테스트 자신이었다).
    await page.addInitScript((k) => {
      if (window !== window.top) return;
      try { localStorage.setItem(k, '{깨진 JSON'); } catch { /* noop */ }
    }, SNAP_KEY);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await dismissOverlays(page);
    // 정상 부팅해서 데이터가 로드되면 그만이다(깨진 캐시 = 캐시 없음과 동일해야 한다)
    await page.waitForFunction(
      (k) => { try { const r = localStorage.getItem(k); return r != null && r.startsWith('{"t"'); } catch { return false; } },
      SNAP_KEY, { timeout: 15_000 },
    );
    expect(errors, `깨진 스냅샷이 예외를 던졌다: ${errors.join(' | ')}`).toEqual([]);
  });
});
