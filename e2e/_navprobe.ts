// e2e/_navprobe.ts — 내비게이션 계측 프로브(오너 지적 2건: '터치 먹통' · '뒤로가기가 홈으로')
//
// 왜 프로브가 필요한가: 두 증상 모두 **추측으로 고칠 수 없다**.
//   · '먹통' 은 스크린샷에 안 찍힌다 — 화면은 멀쩡하고 입력만 안 먹는다.
//     그래서 '탭바 좌표의 히트테스트 결과'를 프레임마다 샘플링해 **먹힌 ms** 를 숫자로 만든다.
//     View Transition 의 ::view-transition 스냅샷이 포인터를 먹으면 elementFromPoint 가
//     버튼이 아니라 <html>(pseudo 의 originating element) 또는 null 을 돌려준다 — 그게 증거다.
//   · '뒤로가기가 홈으로' 는 도착 화면을 문자열로 찍어야 표가 된다.
//     history push/pop/back 을 전부 기록해 '유령 항목'(pop 해도 아무 일 없는 칸)까지 센다.
//
// 앱 코드는 건드리지 않는다 — 전부 addInitScript 로 주입한다.
import type { Page } from '@playwright/test';

export interface NavSample {
  /** 브라우저가 살아 있는 DOM 의 히트테스트를 막아 둔 총 시간(ms) — 전환 지속시간의 상한 */
  blockedMs: number;
  /** 그 구간들 [{start, end, reason}] */
  blocked: { start: number; end: number; reason: string }[];
  /** 하단 탭바 버튼에 실제로 도달한 클릭 수(구조된 클릭 포함) — 보낸 탭 수와 같아야 한다 */
  tabClicks: number;
  /** <html>/<body> 로 새어 나가 아무 데도 닿지 않은 클릭 수(구조 전 원본 포함) */
  swallowed: number;
  pushes: number;
  pops: number;
  backs: number;
  /** startViewTransition 호출 수 / 그중 '이전 전환이 살아있는 동안 시작된' 중첩 수 */
  vtStarts: number;
  vtOverlaps: number;
}

declare global {
  interface Window {
    __NAV: {
      pushes: { t: number; layer: number | null }[];
      pops: { t: number; layer: number | null }[];
      backs: number[];
      vt: { start: number; end: number | null }[];
      vtOverlaps: number;
      blocked: { start: number; end: number; reason: string }[];
      tabClicks: number;
      swallowed: number;
      probe: { x: number; y: number } | null;
      setProbe: (x: number, y: number) => void;
      reset: () => void;
    };
  }
}

export async function installNavProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const N: Window['__NAV'] = {
      pushes: [], pops: [], backs: [], vt: [], vtOverlaps: 0, blocked: [], tabClicks: 0, swallowed: 0, probe: null,
      setProbe: (x: number, y: number) => { N.probe = { x, y }; },
      reset: () => {
        N.pushes = []; N.pops = []; N.backs = []; N.vt = []; N.vtOverlaps = 0;
        N.blocked = []; N.tabClicks = 0; N.swallowed = 0;
      },
    };
    window.__NAV = N;

    // 입력이 '실제로 어디에 닿았는지' — 먹통의 유일한 정직한 지표.
    //  · 탭바 버튼에 닿았다 = 입력이 살았다(전환 중 구조된 클릭도 여기 잡힌다)
    //  · <html>/<body> 에 닿았다 = 스냅샷이 먹어 아무 데도 안 닿았다
    // 버블 단계에서 센다 — 앱/구조 로직이 캡처 단계에서 손본 최종 결과를 봐야 하기 때문.
    window.addEventListener('click', (e) => {
      const t = e.target as Element | null;
      if (t && typeof t.closest === 'function' && t.closest('nav[aria-label="하단 내비게이션"] button')) N.tabClicks++;
      else if (t === document.documentElement || t === document.body) N.swallowed++;
    }, false);
    const layerOf = (s: unknown) => {
      const st = s as { __layer?: number } | null;
      return st && typeof st.__layer === 'number' ? st.__layer : null;
    };

    const _push = history.pushState.bind(history);
    history.pushState = function (s: unknown, t: string, u?: string | URL | null) {
      N.pushes.push({ t: performance.now(), layer: layerOf(s) });
      return _push(s as never, t, u as never);
    } as typeof history.pushState;
    const _back = history.back.bind(history);
    history.back = function () { N.backs.push(performance.now()); return _back(); };
    window.addEventListener('popstate', (e) => {
      N.pops.push({ t: performance.now(), layer: layerOf((e as PopStateEvent).state) });
    });

    // View Transition — 중첩(진행 중에 새 전환 시작) 카운트가 '먹통' 후보 1번의 직접 증거다.
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const _svt = d.startViewTransition?.bind(document);
    if (_svt) {
      d.startViewTransition = (cb: () => void) => {
        if (N.vt.some((v) => v.end === null)) N.vtOverlaps++;
        const rec = { start: performance.now(), end: null as number | null };
        N.vt.push(rec);
        const t = _svt(cb) as { finished?: Promise<void> };
        const done = () => { rec.end = performance.now(); };
        t?.finished?.then(done, done);
        return t as never;
      };
    }

    // 히트테스트 샘플러 — 프레임마다 프로브 좌표의 실제 타깃을 본다.
    let open: { start: number; reason: string } | null = null;
    const tick = () => {
      const p = N.probe;
      if (p) {
        const el = document.elementFromPoint(p.x, p.y);
        // 정상: 탭바 버튼(또는 그 자손). 비정상: null(아무것도 없음) · <html>(VT 스냅샷이 먹음) · 그 외 덮개
        const okBtn = el instanceof Element && !!el.closest('nav[aria-label="하단 내비게이션"] button');
        if (!okBtn) {
          const reason = !el ? 'null' : el === document.documentElement ? 'view-transition' : (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
          if (!open) open = { start: performance.now(), reason };
        } else if (open) {
          N.blocked.push({ start: open.start, end: performance.now(), reason: open.reason });
          open = null;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** 프로브 좌표를 하단 탭바의 특정 칸 중앙으로 맞춘다(모바일 뷰포트 기준) */
export async function aimProbeAtTab(page: Page, index: number): Promise<void> {
  const box = await page.locator('nav[aria-label="하단 내비게이션"] button').nth(index).boundingBox();
  if (!box) throw new Error('탭바 버튼을 찾지 못했다 — 프로브를 조준할 수 없다');
  await page.evaluate(([x, y]) => window.__NAV.setProbe(x, y), [box.x + box.width / 2, box.y + box.height / 2] as [number, number]);
}

export async function resetProbe(page: Page): Promise<void> {
  await page.evaluate(() => window.__NAV.reset());
}

export async function readProbe(page: Page): Promise<NavSample> {
  return page.evaluate(() => {
    const N = window.__NAV;
    const blocked = N.blocked.slice();
    return {
      blockedMs: Math.round(blocked.reduce((a, b) => a + (b.end - b.start), 0)),
      blocked: blocked.map((b) => ({ start: Math.round(b.start), end: Math.round(b.end), reason: b.reason })),
      tabClicks: N.tabClicks,
      swallowed: N.swallowed,
      pushes: N.pushes.length,
      pops: N.pops.length,
      backs: N.backs.length,
      vtStarts: N.vt.length,
      vtOverlaps: N.vtOverlaps,
    };
  });
}

/**
 * 지금 실제로 커밋된 화면 이름. 낙관적 aria-current 가 아니라 **display 가 켜진 pane** 을 본다
 * (탭바의 aria-current 는 클릭 즉시 낙관적으로 바뀌므로 '먹통' 판정에 쓰면 안 된다).
 * 오버레이가 떠 있으면 오버레이 이름이 우선 — 사용자가 보고 있는 것이 곧 화면이다.
 */
export async function currentScreen(page: Page): Promise<string> {
  return page.evaluate(() => {
    // ⚠ DOM 순서가 아니라 **쌓임 순서**로 최상단을 고른다.
    //   App 의 JSX 순서상 포스터 상세가 매장 페이지보다 앞에 있어서, DOM 마지막을 집으면
    //   포스터가 위에 떠 있는데도 '매장 페이지' 로 읽혀 테스트가 거짓 실패했다.
    const dlgs = Array.from(document.querySelectorAll('[role="dialog"]'))
      .filter((el) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed')
      .map((el, i) => {
        // 시트/센터 모달은 role=dialog 가 안쪽 콘텐츠라 z-index 가 부모(fixed 래퍼)에 있다 — 위로 훑는다.
        let z = 0;
        for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
          const v = Number(getComputedStyle(n).zIndex);
          if (!Number.isNaN(v)) z = Math.max(z, v);
        }
        return { el: el as HTMLElement, i, z };
      })
      .sort((a, b) => (a.z - b.z) || (a.i - b.i));
    if (dlgs.length) {
      const top = dlgs[dlgs.length - 1].el;
      const label = top.getAttribute('aria-label')
        ?? document.getElementById(top.getAttribute('aria-labelledby') ?? '')?.textContent
        ?? '이름없는 대화상자';
      return `overlay:${label.trim().slice(0, 24)}`;
    }
    const pane = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'))
      .find((el) => el.style.display !== 'none');
    return `tab:${pane?.dataset.tab ?? 'unknown'}`;
  });
}

/** 화면이 바뀔 때까지 기다리며 걸린 ms 를 잰다. 안 바뀌면 null(= 입력이 먹혔다). */
export async function awaitScreenChange(page: Page, from: string, timeout = 2500): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await currentScreen(page)) !== from) return Date.now() - t0;
    await page.waitForTimeout(16);
  }
  return null;
}
