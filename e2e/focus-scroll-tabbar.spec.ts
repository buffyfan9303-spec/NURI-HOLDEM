// 포커스가 옮겨간 입력칸이 하단 탭바 뒤로 들어가지 않는가 — **부류 게이트**(2026-09-15).
//
// ── 무엇이 문제였나 ───────────────────────────────────────────────────────────
// 브라우저가 '포커스된 요소를 보이게' 스크롤할 때는 **뷰포트만** 본다. 그 위에 떠 있는
// `position: fixed` 하단 탭바는 계산에 안 들어간다. 그래서 화면 밖 바로 아래 칸으로 포커스가 가면
// (소프트 키보드의 '다음', Tab, 검증 실패 포커스) 최소 스크롤(block:nearest)로 **화면 맨 아래 모서리**에
// 붙이는데, 그 자리가 정확히 탭바 뒤다.
//   실측 2026-09-15 (프로덕션 빌드 · 390×844 · 로그인 상태의 캘린더 기록 입력):
//     고치기 전  날짜·금액·메모 → 800~844 (탭바 top=770) = 완전히 가려짐
//     고친 뒤    →              695~739 = 완전히 드러남
//
// ── 왜 E2E 여야 하나 (소스 grep 으로는 못 잡는다) ─────────────────────────────
// 고침은 `src/index.css` 의 한 줄(form 컨트롤 scroll-margin-bottom)이다. 그런데 이 저장소에는
// **유틸 클래스가 태그 셀렉터를 이겨 규칙이 조용히 무효가 되는 부류**의 전력이 있다
// (같은 파일 `main { padding-bottom … !important }` 주석이 그 사고 기록이다).
// 소스에 그 줄이 있다는 것과 브라우저가 실제로 그렇게 스크롤한다는 것은 다른 명제다.
//
// ── 판정 둘. 탭바 자동숨김 상태에 의존하지 않는다 ────────────────────────────
// 탭바는 스크롤 방향에 따라 숨었다 나타난다. 그 상태를 기준으로 삼으면 게이트가 흔들린다.
// 그래서 '지금 탭바가 보이나' 가 아니라 **탭바 회피 예약 폭(--tabbar-safe)** 밖인가를 본다.
//   G1  화면에 실제로 있는 탭 평면 입력칸의 computed scroll-margin-bottom == 예약 폭
//       → 캐스케이드로 규칙이 무효화되면 여기서 걸린다.
//   G2  탭 평면 맨 아래에 **프로브 칸**을 심고 화면 밖 바로 아래에서 포커스를 준다.
//       착지 후  rect.bottom ≤ innerHeight − 예약 폭.
//       → 브라우저의 실제 포커스 스크롤 거동까지 재는 유일한 판정이다.
//       ⚠ 실제 폼만 보면 **비로그인 E2E 에서는 화면 아래쪽 칸이 아예 없어 통째로 헛돈다**
//         (실측: 6개 탭에서 찾은 칸 3개가 전부 bottom 124~280 = 이미 다 보이는 자리).
//         음성 대조에서 그걸로 한 번 거짓 통과했다 — 그래서 프로브를 심는다.
//
// 라이브 DB 에 쓰지 않는다 — `_fixtures` 가드.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

const TABS = ['home', 'browse', 'community', 'tools'] as const;

test('포커스 스크롤이 입력칸을 하단 탭바 뒤에 내려놓지 않는다', async ({ page }) => {
  const real: { tab: string; name: string; sm: number; reserve: number }[] = [];
  const probes: { tab: string; bottom: number; limit: number }[] = [];

  for (const tab of TABS) {
    await page.goto(`/?tab=${tab}`);
    await stabilizeBackstack(page);
    await dismissOverlays(page);
    await page.waitForTimeout(500);

    const out = await page.evaluate(() => {
      // --tabbar-safe 는 calc() 라 문자열로 읽으면 숫자가 아니다 — 프로브로 실제 px 을 받는다.
      const ruler = document.createElement('div');
      ruler.style.cssText = 'position:absolute;visibility:hidden;height:var(--tabbar-safe)';
      document.body.appendChild(ruler);
      const reserve = Math.round(ruler.getBoundingClientRect().height);
      ruler.remove();

      const nav = document.querySelector('nav[aria-label="하단 내비게이션"]');
      const inOverlay = (el: HTMLElement) => {
        for (let n: HTMLElement | null = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const c = getComputedStyle(n);
          if (c.position === 'fixed' && (parseInt(c.zIndex) || 0) >= 40 && n !== nav) return true;
        }
        return false;
      };

      // ── G1 화면에 실제로 있는 탭 평면 칸의 computed 값 ──
      const real: { name: string; sm: number }[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('input:not([type=hidden]),textarea'))) {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (inOverlay(el)) continue;
        real.push({
          name: el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.tagName,
          sm: Math.round(parseFloat(cs.scrollMarginBottom) || 0),
        });
      }

      // ── G2 탭 평면 맨 아래에 프로브 칸을 심고 실제 포커스 스크롤을 재현한다 ──
      // ⚠ 최상위 탭은 언마운트되지 않고 display 로 토글된다(App.tsx 탭 keep-alive) — `main` 이 여러 개고
      //   그중 **안 보이는 것**을 집으면 프로브가 display:none 안에 들어가 포커스가 안 간다(실측).
      const host = Array.from(document.querySelectorAll<HTMLElement>('main'))
        .find((m) => m.getBoundingClientRect().height > 0) ?? document.body;
      const box = document.createElement('div');
      box.setAttribute('data-e2e-focus-probe', '');
      const input = document.createElement('input');
      input.type = 'text';
      input.style.cssText = 'width:100%;height:44px';
      box.appendChild(input);
      host.appendChild(box);

      const docY = input.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, docY - window.innerHeight + 6)); // 칸 윗변이 화면 아래 모서리 바로 밑
      input.focus();                                                 // 브라우저의 '보이게' 스크롤이 여기서 돈다
      const focused = document.activeElement === input;
      const bottom = Math.round(input.getBoundingClientRect().bottom);
      box.remove();

      return { reserve, real, probe: { focused, bottom, limit: window.innerHeight - reserve } };
    });

    expect(out.probe.focused, `${tab}: 프로브 칸에 포커스가 안 갔다 — 판정기가 죽었다`).toBe(true);
    expect(out.reserve, `${tab}: --tabbar-safe 예약 폭을 못 읽었다`).toBeGreaterThan(40);
    for (const r of out.real) real.push({ tab, ...r, reserve: out.reserve });
    probes.push({ tab, ...out.probe });
  }

  // 앵커 — 아무 칸도 못 보면 이 테스트는 아무것도 안 본 것이다(조용한 무력화 방지).
  expect(real.length, '탭 평면 입력칸을 하나도 못 찾았다 — 판정기가 죽었다').toBeGreaterThanOrEqual(3);

  // soft — G1 이 먼저 던지면 G2 가 아예 안 돌아 **음성 대조에서 G2 가 무는지 확인할 수 없다**(실제로 막혔다).
  //   둘은 서로 다른 것을 보므로 한 번에 둘 다 보고한다.
  const noMargin = real.filter((r) => r.sm < r.reserve);
  expect.soft(
    noMargin.map((r) => `${r.tab}/${r.name}: scroll-margin-bottom=${r.sm} < 예약=${r.reserve}`),
    'G1 실패 — 탭 평면 입력칸에 하단 탭바 회피 여백이 안 걸려 있다.\n'
      + 'src/index.css 의 모바일 블록(form 컨트롤 scroll-margin-bottom)이 사라졌거나 다른 규칙에 졌다.',
  ).toEqual([]);

  // 1px 여유: 예약 폭이 소수(5.5rem@17px + 12px = 105.5px)라 반올림 방향에 따라 1px 이 남는다.
  // 이 게이트는 '한 칸 높이만큼 가려졌나' 를 보는 것이지 서브픽셀을 보는 것이 아니다.
  const covered = probes.filter((p) => p.bottom > p.limit + 1);
  expect.soft(
    covered.map((p) => `${p.tab}: 착지 bottom=${p.bottom} > 허용=${p.limit}`),
    'G2 실패 — 포커스가 옮겨간 칸이 하단 탭바 예약 폭 안에 착지했다.\n'
      + '실기기에서는 그 자리가 탭바 뒤라 방금 포커스된 칸이 안 보인다.',
  ).toEqual([]);
});
