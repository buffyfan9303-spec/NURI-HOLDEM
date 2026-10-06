// 내 매장 섹션 전환 — "말려 올라가거나 말려 내려간다"(오너 리포트, 2026-09-19) 회귀 게이트.
//
// 원인(다른 팀원 실측, 4173·목킹 업주·1440×900·CPU4배·rAF 시계열):
//   A) 판이 데이터 파도마다 계단식으로 자라 **빈 채로 먼저 서고** 그때마다 전 화면 하단 상시인
//      BusinessFooter 가 그 자리로 올라왔다가 다음 파도가 밀어낸다(매장 설정 LS 0.24, 게임 진행 LS 0.18).
//   B) lazy 섹션(내 캘린더·파트너 매장·이벤트 신청)은 지역 Suspense 경계가 없어 첫 방문 시
//      `<main data-tab="my-store">` 전체(사이드바·헤더까지)가 App.tsx 최상위 폴백에 300~400ms 덮였다.
// 고침: VenueManageTab.tsx — (A) [data-mystore-secpanel] 에 전환 직전 높이를 min-height 로 예약했다가
//   콘텐츠 실측이 그 높이를 **디바운스**로 따라잡으면 푸는 lockPane/secInnerRef(2026-09-19 2차: "따라잡은
//   첫 순간"에 바로 풀면 부족했다 — 게임 진행은 906→1174(스켈레톤, 예약보다 큼)→1082(실제, 더 작음) 로
//   한 번 넘쳤다가 줄어드는 패턴이라 잠잠해진 뒤에만 푼다), (B) 세 lazy 판에 지역 Suspense.
//
// 이 스펙은 두 원인의 대표 사례를 각각 하나씩, PC 사이드바와 모바일 아코디언 양쪽에서 잰다
// (내 매장은 폭에 따라 nav 경로가 갈린다 — 리드 지적) — 9개 전 섹션 전수는 이미 실측 리포트가 있고,
// 회귀 게이트는 대표 사례 × 두 폭으로 충분하다.
//
// 되돌리면 실패해야 한다: lockPane 호출(goStep/gotoSection)이나 secInnerRef 래퍼를 빼면 (b)(c) 가,
// 이벤트 신청의 <Suspense> 를 빼면 (a) 가 빨개진다.
//
// ⚠ 2026-09-19 3차 — 'A' 대표를 게임 진행 → **매장 설정**으로 바꿨다(리드 요청: "추측 말고 재라").
//   시계열 진단(`_ms-s6diag.spec.ts`, 삭제됨 — 아래가 그 결과):
//     매장 설정: 1448(예약,고정) → 105 → 540 → **2747(예약 넘김, 그 순간부터 panelH 도 같이 자람)**
//               → 3085(정착) → 661ms 디바운스로 예약 해제. panelH 는 전 구간 **1448 밑으로 단 한 번도 안 내려갔다.**
//     게임 진행(사이드바, 시드 없음): 1082(예약,고정) → innerH 134→665→**554(정착, 예약 밑)**
//               → 1289ms 안전망으로 예약 해제 → panelH 1082→554 로 뚝 떨어짐(554/1082=51%, 60% 미달).
//   게임 진행이 더 짧게 정착하는 건 버그가 아니라 **제품 설계**다 — 시드 없이 사이드바로 들어간
//   장부는 오늘 보드가 아니라 '목록(검색) 모드'로 연다(이 파일 위쪽, goStep/gotoSection 주석: "장부는
//   기본이 목록 모드다 — 시작 전이면 날짜를 싣지 않아 목록에서 고르게 두고"). 목록 모드는 원래 짧은
//   화면이라 **어떤 예약 메커니즘으로도** 대시보드(카드 여러 장)의 60% 를 채울 이유가 없다 — 채우면
//   그게 오히려 빈 여백을 강제로 만드는 역버그다(실측 재확인: 장부 세션·바인 데이터를 채워 넣어도
//   442 로 오히려 더 짧아졌다 — "데이터가 없어서 짧다" 가 아니라 "목록 모드라 짧다" 는 뜻).
//   그래서 높이 바닥 검사는 '진짜로 계단식 성장하는' 매장 설정으로 옮기고, 게임 진행은 아래 별도
//   테스트로 **main 소실만** 본다(높이 바닥·CLS 제외 — 임계값을 낮춘 게 아니라 이 전환엔 그 잣대
//   자체가 안 맞는다고 판단해 제외했다. 되돌릴 근거가 필요하면 위 시계열을 근거로 삼아라).
//
// ⚠ 2026-09-19 4차 — 리드가 원래 준 '전환당 CLS<0.05' 기준을 리드 본인이 되돌아보고 수정했다:
//   "'붕괴' 와 '성장' 을 구분하지 않은 건 내 실수다. 오너가 신고한 증상은 오르내림(진동)이지,
//   사용자가 직접 눌러서 한 방향으로 자라는 것(1448→3085)이 아니다. 최종 높이를 미리 알 수 없으니
//   예약으로 못 막는다." 실측으로도 확인됨: 매장 설정 전환은 min-height 가 전 구간 한 번도 안
//   내려갔는데도(=진동 없음) 전체 CLS 는 0.11~0.28 이었다 — 그 대부분이 진짜 성장(1448→3085, 그
//   아래 BusinessFooter 가 일반 흐름이라 실제로 밀려 내려간다)에서 나왔고, 이건 어떤 예약으로도
//   못 줄인다. 그래서 기준을 **증상(오르내림)에 맞게** 셋으로 바꾼다.
//
//   ⚠ **처음엔 "①패널 높이가 전환 도중 한 번도 줄지 않는다(단조 비감소)"로 짰다가 바로 실측에서
//   깨졌다** — 이벤트 신청(B)·게임 진행(A2) 둘 다 1082→(고정)→753/554 로 **딱 한 번, 깨끗하게
//   내려간다**(진단: 1082.03 → 고정 → t=1247ms 754.84 로 한 번 떨어지고 그 뒤로 안 변함).
//   이건 예약이 풀리며 **원래 더 짧은 목적지**로 정확히 내려앉는 것뿐이지 "말려 올라감/내려감"이
//   아니다 — 오너가 신고한 건 **오르락내리락(방향이 여러 번 바뀜)**이지 "한 방향으로 한 번 정착"이
//   아니다. 그래서 "한 번도 안 줄어든다"가 아니라 **"오르내림이 섞이지 않는다"(증가와 감소가 같은
//   전환 안에 함께 나타나지 않는다)**로 고쳤다 — 옛 버그(매장 설정)의 실제 패턴이 906→(줄었다가)
//   →1022→(줄었다가)→3229→3585 처럼 **증가와 감소가 섞여 있었던 것**과 정확히 대응한다.
//     ① 전환 중 높이 변화가 **한 방향으로만** 일어난다(증가만, 또는 감소만 — 섞이면 오르내림).
//     ② main 이 한 프레임도 안 사라진다(그대로).
//     ③ 높이가 마지막으로 바뀐 시점 이후 300ms 동안 layout-shift 가 거의 0(<0.02) — 성장/수렴이 다
//        끝난 뒤에도 계속 흔들리면 그건 다른 문제(예: 뒤늦게 사라지는 요소)다. 그 구간엔 성장이 섞이지
//        않으므로 임계값을 둬도 안전하다.
//
// ⚠ 5차(리드 요청) — 오르내림 검출·정착 판정은 **순수 함수**라 브라우저·리빌드 없이도 결정적으로
//   검증할 수 있다("손으로 검토했다"로 끝내면 다음 사람에게 안 남는다는 지적). `src/lib/paneTransitionShape.ts`
//   로 뽑고 옛 버그·오늘의 정상 정착·성장 꼬리 지터 세 시계열을 합성 대조로 고정했다
//   (`src/lib/paneTransitionShape.test.ts` — `npx vitest run src/lib/paneTransitionShape.test.ts`).
//   여기서는 그 함수를 import 해서 쓰기만 한다(중복 정의 금지 — nuri-single-source).
import { test, expect, type Page } from '@playwright/test';
import { bootOwner, openMyStore } from './_mockOwner';
import { findOscillation, settleAt as computeSettleAt } from '../src/lib/paneTransitionShape';

/** 모바일은 nav 가 아코디언 뒤에 숨어 있다 — '메뉴' 버튼이 있으면(=lg:hidden 이 걸린 폭) 먼저 연다.
 *  PC 폭에서는 그 버튼이 display:none(offsetParent null)이라 조용히 넘어간다. */
async function openMobileMenuIfPresent(page: Page): Promise<void> {
  // 버튼 textContent 는 아이콘 자리 + 현재 섹션 라벨 + '메뉴'/'닫기' 가 이어붙어 있다
  // (예: "대시보드메뉴") — 그래서 정확히 일치가 아니라 끝문자로 판정한다. PC 폭에서는 이 버튼이
  // display:none(offsetParent null)이라 아무 것도 못 찾고 조용히 넘어간다.
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => (b as HTMLElement).offsetParent !== null && (b.textContent ?? '').trim().endsWith('메뉴'));
    if (!btn) return false;
    (btn as HTMLElement).click();
    return true;
  });
  if (clicked) await expect(page.locator('.animate-slide-up').first()).toBeVisible();
}

interface RawSeries {
  /** old — 그 표본에서 떠나는 대시보드 판이 아직 보였는가 · locked — 판에 높이 예약(inline min-height)이 걸려 있었는가. */
  heights: { t: number; h: number; old: boolean; locked: boolean; painted: boolean }[];
  shifts: { t: number; value: number }[];
  mainMissingFrames: number;
  /** 대시보드 판이 아직 보인 표본 수 — 커밋 전(전환 대기) 구간을 실제로 봤는가(A3 의 거짓 통과 방지). */
  oldFrames: number;
  /** growOldPx 를 실제로 넣었는가 — 커밋 전(대시보드가 아직 보이는) rAF 가 한 번은 와야 넣을 수 있다. */
  grew?: boolean;
  error?: string;
}

/** 한 전환을 rAF 로 1.9s 관찰하며 (시각, 패널높이) 시계열과 layout-shift 이벤트를 통째로 가져온다.
 *  판정(단조 비감소·정착 후 300ms CLS)은 Node 쪽에서 한다 — 브라우저 evaluate 안에서 판정 로직까지
 *  넣으면 사람이 못 읽는다. Node↔브라우저 왕복 지연이 순간적인 변화를 놓칠 수 있어, 관찰 루프와
 *  클릭을 **같은 동기 턴**에서 시작한다. */
async function watchTransition(page: Page, label: string, durationMs = 1900, shrinkOldPx = 0, growOldPx = 0): Promise<RawSeries> {
  return page.evaluate(({ label, durationMs, shrinkOldPx, growOldPx }) => new Promise<RawSeries>((resolve) => {
    // shrinkOldPx — 떠나는 판이 **커밋 전에** 스스로 줄어드는 순간(늦은 데이터 도착: 대시보드 스켈레톤→실데이터 −28px)을
    //   결정적으로 만든다. 누르기 전 판 안쪽에 그만큼 칸을 넣어 두고(예약이 그 높이를 잰다) 누른 **같은 턴**에 뺀다.
    // growOldPx — 반대로 **커밋 전에 자라는** 순간(대시보드 로딩 중 1272→1314, 2026-10-06 실측)을 만든다. 누른 뒤 **첫 rAF**(커밋 전이면)에
    //   떠나는 대시보드 판 안에 그만큼 칸을 넣는다 — 판이 커밋으로 숨으면 그 칸도 같이 사라지므로 '늦게 자란 옛 판' 과 같다.
    //   ⚠ 누른 같은 턴(동기)에 넣으면 안 된다: 그 높이가 **한 번도 그려지지 않은 채** 커밋될 수 있어(부하 12워커 100회 중 1회),
    //   화면에 없던 높이를 '최고점' 으로 세는 거짓 실패가 났다. rAF 안에서 넣으면 그 프레임의 레이아웃·그리기에 반드시 들어간다.
    const inner = document.querySelector('[data-mystore-secpanel]')?.firstElementChild;
    let spacer: HTMLElement | null = null;
    if (shrinkOldPx > 0 && inner) {
      spacer = document.createElement('div');
      spacer.style.height = `${shrinkOldPx}px`;
      inner.appendChild(spacer);
      void (inner as HTMLElement).offsetHeight;
    }
    const heights: RawSeries['heights'] = [];
    const shifts: { t: number; value: number }[] = [];
    const start = performance.now();
    // 🔴 2026-09-24 — 모바일 메뉴 시트 닫힘은 **원인으로** 가려낸다(시각으로 면제하지 않는다).
    //   evaluate 의 합성 click 은 입력으로 안 찍혀(hadRecentInput=false) 시트가 닫히며 판이 시트 높이만큼
    //   올라가는 이동(390 실측 0.2768, 수정 전·후 코드 동일)이 CLS 로 잡힌다. 실제 손가락 탭이면 정의상 빠지는 이동이다.
    //   제외 조건: 클릭 전에 잰 시트 변위 D 가 있고, 그 이동의 **옮겨진 모든 source 가 정확히 D(±2px) 만큼 위로** 갔으며,
    //   이런 제외는 **한 번뿐**이다. 같은 프레임에 다른 크기의 이동이 섞이면 제외하지 않는다(→ 진짜 회귀는 그대로 잡힌다).
    const toggle = [...document.querySelectorAll<HTMLElement>('button[aria-expanded="true"]')].find((b) => b.offsetParent !== null);
    const sheet = toggle?.nextElementSibling as HTMLElement | null | undefined;
    const sheetShift = sheet ? sheet.getBoundingClientRect().bottom - toggle!.getBoundingClientRect().bottom : 0;
    let sheetExcused = 0;
    const po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] };
        if (s.hadRecentInput) continue;
        const moved = (s.sources ?? []).filter((x) => x.previousRect.width * x.previousRect.height > 0);
        const bySheet = sheetShift > 0 && sheetExcused === 0 && moved.length > 0
          && moved.every((x) => Math.abs((x.previousRect.y - x.currentRect.y) - sheetShift) <= 2);
        if (bySheet) { sheetExcused++; continue; }
        // 프레임 시각(startTime) — rAF 표본(heights)과 같은 시계.
        shifts.push({ t: s.startTime - start, value: s.value });
      }
    });
    try { po.observe({ type: 'layout-shift', buffered: false }); } catch { /* 미지원 브라우저 — shifts 비워서 진행 */ }
    let mainMissingFrames = 0;
    let oldFrames = 0;
    let grew = false;
    const measure = (painted: boolean) => {
      if (!document.querySelector('[data-tab="my-store"]')) mainMissingFrames++;
      const old = !!document.querySelector('[data-mystore-secpanel] [data-pane="dashboard"]')?.getClientRects().length;
      if (old) oldFrames++;
      const panel = document.querySelector<HTMLElement>('[data-mystore-secpanel]');
      heights.push({ t: Math.round(performance.now() - start), h: panel ? panel.getBoundingClientRect().height : 0, old, locked: !!panel?.style.minHeight, painted });
    };
    const sample = () => {
      if (growOldPx > 0 && !grew) {
        const pane = document.querySelector('[data-mystore-secpanel] [data-pane="dashboard"]');
        if (pane?.getClientRects().length) { const g = document.createElement('div'); g.style.height = `${growOldPx}px`; pane.appendChild(g); grew = true; }
        else growOldPx = 0; // 첫 rAF 에 이미 커밋됨 — 이번 실행은 '커밋 전 성장' 을 만들 수 없다(grew=false 로 알린다)
      }
      measure(true);
      if (performance.now() - start < durationMs) requestAnimationFrame(sample);
      else { po.disconnect(); resolve({ heights, shifts, mainMissingFrames, oldFrames, grew }); }
    };
    const btn = [...document.querySelectorAll('button')]
      .find((b) => (b as HTMLElement).offsetParent !== null && (b.textContent ?? '').trim().includes(label));
    if (!btn) { resolve({ heights: [], shifts: [], mainMissingFrames: -1, oldFrames: 0, error: `버튼을 못 찾음: ${label}` }); return; }
    // 🔴 2026-10-06 — 누르기 직전과 누른 직후(같은 턴)를 **동기로** 한 번씩 잰다. 첫 rAF 만 기다리면, 부하가 걸린 러너에서
    //   전환 렌더가 그 프레임보다 먼저 커밋돼 '누른 순간' 의 판을 한 번도 못 보는 실행이 있었다(A3 PC oldFrames 0 — 3회 중 1회).
    //   동기 측정은 강제 레이아웃이라 '그 순간 그려질 판' 그대로다. 전환이 동기로 커밋되는 경로면 직후 표본에 이미 새 판이 잡힌다.
    measure(false);
    (btn as HTMLElement).click();
    spacer?.remove();
    measure(false);
    requestAnimationFrame(sample);
  }), { label, durationMs, shrinkOldPx, growOldPx });
}

/** 떠나는 대시보드 판이 로딩을 마칠 때까지 — 판 안 스켈레톤·aria-busy 가 0 이고 높이가 300ms 동안 그대로.
 *  🔴 2026-10-06 — 전환 측정의 출발 상태를 고정한다. 그전엔 beforeEach 직후 바로 눌러, 대시보드가 아직 로딩 중
 *  (1200→1272→1314: 인증 카드 늦은 삽입 +72, 카드 격자 스켈레톤 409→450.5)인 실행만 측정 창 안에 **떠나는 판 자신의
 *  로딩 성장**이 섞였다(부하 걸린 전체 실행에서만 B PC '증가 뒤 감소 1313.89→1272.39'). 그 '커밋 전 성장' 경우는 아래 A4 가
 *  결정적으로 따로 잰다 — 여기서 빼는 것이 아니라 우연에 맡기지 않는 것이다. */
async function waitDashboardSettled(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() =>
    document.querySelectorAll('[data-mystore-secpanel] .skeleton, [data-mystore-secpanel] [aria-busy="true"]').length)).toBe(0);
  await expect.poll(async () => {
    const h = () => page.evaluate(() => document.querySelector('[data-mystore-secpanel]')?.getBoundingClientRect().height ?? -1);
    const a = await h();
    await page.waitForTimeout(300);
    return a === await h();
  }).toBe(true);
}

/** ③ 정착 후 300ms CLS — '정착' 시각(settleAt)은 순수 함수(paneTransitionShape.ts)가 계산하고,
 *  여기서는 그 시각 뒤 300ms 안의 layout-shift 합만 더한다(이 합산은 Playwright 의 shifts 배열에만
 *  의미가 있어 순수 모듈로 안 뽑았다). */
function settleThenCls(heights: { t: number; h: number }[], shifts: { t: number; value: number }[]): { settleAt: number; cls: number } {
  // 메뉴 시트 닫힘 이동은 watchTransition 이 원인으로 이미 걸렀다 — 창은 종전 계약 그대로.
  const at = computeSettleAt(heights);
  const cls = shifts.filter((s) => s.t > at && s.t <= at + 300).reduce((sum, s) => sum + s.value, 0);
  return { settleAt: at, cls };
}

const VIEWPORTS = [
  { name: 'PC 1440', width: 1440, height: 900 },
  { name: '모바일 390', width: 390, height: 844 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`내 매장 섹션 전환 — 판 붕괴(오르내림) 없이 정적으로 선다(${vp.name})`, () => {
    test.beforeEach(async ({ page }) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // 실기기 가까이 — 리드 실측과 같은 조건
      await bootOwner(page, { viewport: { width: vp.width, height: vp.height } });
      await openMyStore(page);
      await expect(page.locator('[data-mystore-secpanel]')).toBeVisible();
      await waitDashboardSettled(page); // 출발 상태 고정(위 함수 주석) — 커밋 전 성장은 A4, 커밋 전 줄어듦은 A3 가 결정적으로 잰다
    });

    test('A — 매장 설정(계단식 성장): 오르내림 없음 · main 안 사라짐 · 정착 후 300ms CLS<0.02', async ({ page }) => {
      await openMobileMenuIfPresent(page);
      const r = await watchTransition(page, '매장 설정');
      expect(r.error, r.error).toBeUndefined();
      expect(r.mainMissingFrames, 'main 이 사라진 프레임').toBe(0);
      const osc = findOscillation(r.heights);
      expect(osc, osc ? `t=${osc.t}ms 에 ${osc.kind}(${osc.from}→${osc.to})` : '').toBeNull();
      const { settleAt, cls } = settleThenCls(r.heights, r.shifts);
      expect(cls, `정착(t=${settleAt}ms) 후 300ms CLS ${cls}`).toBeLessThan(0.02);
    });

    // 게임 진행은 목적지가 원래 짧다(위 3차 주석) — 높이 바닥·CLS 는 안 재고 main 소실 + 오르내림만 본다.
    test('A2 — 게임 진행(짧은 목적지, 참고): 오르내림 없음 · main 안 사라짐', async ({ page }) => {
      await openMobileMenuIfPresent(page);
      const r = await watchTransition(page, '게임 진행');
      expect(r.error, r.error).toBeUndefined();
      expect(r.mainMissingFrames, 'main 이 사라진 프레임').toBe(0);
      const osc = findOscillation(r.heights);
      expect(osc, osc ? `t=${osc.t}ms 에 ${osc.kind}(${osc.from}→${osc.to})` : '').toBeNull();
    });

    // 🔴 2026-09-27 — A2·B(PC)·A(모바일)의 간헐 실패(×8 에 2~4건)는 모두 같은 한 가지였다(root-cause 실측, 하위 탭 handoff 전 빌드에도 있음):
    //   사이드바·메뉴는 startTransition 안에서 lockPane 을 불러, 예약(setLockPx)이 **커밋 때에야** 걸렸다. 그 사이 떠나는 대시보드가
    //   제 데이터 도착으로 1121→1093 줄고, 커밋에서 옛 높이 예약이 다시 부풀려 '줄었다 다시 자람'이 됐다. 대시보드가 로딩 중일 때
    //   누른 판만 걸려 우연에 기댔다 — 여기서는 커밋 전 줄어듦(−60px)을 직접 만들어 **매번** 잰다. 예약을 누른 순간 걸지 않으면 빨개진다.
    test('A3 — 떠나는 판이 커밋 전에 줄어도(늦은 데이터 도착) 예약이 누른 순간부터 버틴다: 오르내림 없음', async ({ page }) => {
      // 대시보드 로딩은 beforeEach 가 끝내 둔다 — 줄어듦이 아래에서 만드는 한 번뿐이게
      await openMobileMenuIfPresent(page);
      const r = await watchTransition(page, '게임 진행', 1900, 60);
      expect(r.error, r.error).toBeUndefined();
      expect(r.oldFrames, '커밋 전(대시보드가 아직 보이는) 프레임을 못 봤다 — 이 검사가 아무것도 안 잰 것').toBeGreaterThan(0);
      const osc = findOscillation(r.heights);
      expect(osc, osc ? `t=${osc.t}ms 에 ${osc.kind}(${osc.from}→${osc.to})` : '').toBeNull();
    });

    // 🔴 2026-10-06 — A3 의 반대 방향. 업주가 대시보드 로딩 중에 누르면 떠나는 판이 **커밋 전에 자란다**(1272→1314, 늦은 카드 데이터).
    //   예약은 누른 순간 높이(1272)로만 걸려 있어, 커밋에서 새 판이 짧게 서는 순간 판이 1314→1272 로 41px 떨어졌다가(푸터가 올라옴)
    //   해제 때 목적지 높이로 다시 움직였다(부하 걸린 전체 실행에서 B PC 'increase 뒤 감소 1313.89→1272.39' 로만 보이던 간헐 실패).
    //   판정: 예약이 걸려 있는 동안(커밋 뒤 ~ 해제 전) 판은 커밋 전 최고 높이 밑으로 내려가지 않는다. 해제 때 목적지로 한 번 내려앉는 것은
    //   정상이다(목적지가 원래 더 짧다 — 위 3차 주석). 예약이 누른 순간 높이에 머물면 빨개진다.
    test('A4 — 떠나는 판이 커밋 전에 자라도(로딩 중 클릭) 예약이 그 높이를 따라간다: 커밋 뒤 예약 중 하강 없음', async ({ page }) => {
      // 첫 rAF 전에 커밋돼 버린 실행(부하)은 '커밋 전 성장' 을 만들 수 없다 — 판정을 건너뛰지 않고 새로 열어 다시 만든다(최대 4번).
      let r: RawSeries | null = null;
      for (let i = 0; i < 4; i++) {
        if (i > 0) {
          await page.reload();
          await openMyStore(page);
          await expect(page.locator('[data-mystore-secpanel]')).toBeVisible();
          await waitDashboardSettled(page);
        }
        await openMobileMenuIfPresent(page);
        r = await watchTransition(page, '이벤트 신청', 1900, 0, 60);
        if (r.error || r.grew) break;
      }
      expect(r!.error, r!.error).toBeUndefined();
      expect(r!.grew, '4번 모두 첫 프레임 전에 커밋돼 커밋 전 성장을 만들지 못했다 — 이 검사가 아무것도 안 잰 것').toBe(true);
      expect(r!.mainMissingFrames, 'main 이 사라진 프레임').toBe(0);
      const before = r!.heights[0]?.h ?? 0;
      // 그려진 프레임만 — 강제 레이아웃(동기 표본)은 화면에 안 나간 높이일 수 있다
      const oldPeak = Math.max(...r!.heights.filter((s) => s.old && s.painted).map((s) => s.h));
      expect(oldPeak, `커밋 전 판이 자란 표본이 없다(출발 ${before}) — 이 검사가 아무것도 안 잰 것`).toBeGreaterThanOrEqual(before + 59);
      const lockedAfter = r!.heights.filter((s) => !s.old && s.locked);
      expect(lockedAfter.length, '커밋 뒤 예약이 걸린 표본이 없다 — 이 검사가 아무것도 안 잰 것').toBeGreaterThan(0);
      const dip = lockedAfter.find((s) => s.h < oldPeak - 1);
      expect(dip, dip ? `t=${dip.t}ms 예약 중인데 판이 ${oldPeak}→${dip.h} 로 내려갔다(예약이 누른 순간 높이에 머묾)` : '').toBeUndefined();
    });

    test('B — 이벤트 신청(첫 방문 lazy 청크): 오르내림 없음 · main 안 사라짐 · 정착 후 300ms CLS<0.02', async ({ page }) => {
      await openMobileMenuIfPresent(page);
      const r = await watchTransition(page, '이벤트 신청');
      expect(r.error, r.error).toBeUndefined();
      expect(r.mainMissingFrames, 'main 이 사라진 프레임 — 지역 Suspense 가 없으면 여기서 걸린다').toBe(0);
      const osc = findOscillation(r.heights);
      expect(osc, osc ? `t=${osc.t}ms 에 ${osc.kind}(${osc.from}→${osc.to})` : '').toBeNull();
      const { settleAt, cls } = settleThenCls(r.heights, r.shifts);
      expect(cls, `정착(t=${settleAt}ms) 후 300ms CLS ${cls}`).toBeLessThan(0.02);
    });
  });
}
