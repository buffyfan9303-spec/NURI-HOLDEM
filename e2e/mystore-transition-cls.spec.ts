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
  heights: { t: number; h: number }[];
  shifts: { t: number; value: number }[];
  mainMissingFrames: number;
  error?: string;
}

/** 한 전환을 rAF 로 1.9s 관찰하며 (시각, 패널높이) 시계열과 layout-shift 이벤트를 통째로 가져온다.
 *  판정(단조 비감소·정착 후 300ms CLS)은 Node 쪽에서 한다 — 브라우저 evaluate 안에서 판정 로직까지
 *  넣으면 사람이 못 읽는다. Node↔브라우저 왕복 지연이 순간적인 변화를 놓칠 수 있어, 관찰 루프와
 *  클릭을 **같은 동기 턴**에서 시작한다. */
async function watchTransition(page: Page, label: string, durationMs = 1900): Promise<RawSeries> {
  return page.evaluate(({ label, durationMs }) => new Promise<RawSeries>((resolve) => {
    const heights: { t: number; h: number }[] = [];
    const shifts: { t: number; value: number }[] = [];
    const start = performance.now();
    const po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
        // 2026-09-24: 콜백 시각이 아니라 **프레임 시각(startTime)** 으로 적는다 — 아래 settleThenCls 가
        //   '탭 직후 첫 프레임' 을 가려내려면 rAF 표본과 같은 시계여야 한다.
        if (!s.hadRecentInput) shifts.push({ t: s.startTime - start, value: s.value });
      }
    });
    try { po.observe({ type: 'layout-shift', buffered: false }); } catch { /* 미지원 브라우저 — shifts 비워서 진행 */ }
    let mainMissingFrames = 0;
    const sample = () => {
      if (!document.querySelector('[data-tab="my-store"]')) mainMissingFrames++;
      const panel = document.querySelector('[data-mystore-secpanel]');
      heights.push({ t: Math.round(performance.now() - start), h: panel ? panel.getBoundingClientRect().height : 0 });
      if (performance.now() - start < durationMs) requestAnimationFrame(sample);
      else { po.disconnect(); resolve({ heights, shifts, mainMissingFrames }); }
    };
    requestAnimationFrame(sample);
    const btn = [...document.querySelectorAll('button')]
      .find((b) => (b as HTMLElement).offsetParent !== null && (b.textContent ?? '').trim().includes(label));
    if (!btn) resolve({ heights: [], shifts: [], mainMissingFrames: -1, error: `버튼을 못 찾음: ${label}` });
    else (btn as HTMLElement).click();
  }), { label, durationMs });
}

/** ③ 정착 후 300ms CLS — '정착' 시각(settleAt)은 순수 함수(paneTransitionShape.ts)가 계산하고,
 *  여기서는 그 시각 뒤 300ms 안의 layout-shift 합만 더한다(이 합산은 Playwright 의 shifts 배열에만
 *  의미가 있어 순수 모듈로 안 뽑았다). */
function settleThenCls(heights: { t: number; h: number }[], shifts: { t: number; value: number }[]): { settleAt: number; cls: number } {
  // 🔴 2026-09-24 — 탭의 **동기 커밋**(모바일 메뉴 시트 닫힘 305px)이 만든 첫 프레임 이동은 창에서 뺀다.
  //   실제 손가락 탭이면 CLS 정의상 hadRecentInput 으로 빠지는 이동인데, 여기선 evaluate 의 합성 click 이라
  //   **입력 없음**으로 찍힌다(0.2768 — 수정 전·후 코드 모두 같은 값, 실측). 종전엔 뒤이은 헤더 높이 변화가
  //   정착 시각을 우연히 그 뒤로 밀어 가려졌을 뿐이고, 모바일 대시보드 헤더를 숨기자 정착이 앞당겨져 드러났다.
  //   첫 프레임(heights[1] 이전)만 빼므로 lazy 청크 도착 뒤의 붕괴(S6, 수백 ms 뒤)는 그대로 잡힌다.
  const at = Math.max(computeSettleAt(heights), heights[1]?.t ?? 0);
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
