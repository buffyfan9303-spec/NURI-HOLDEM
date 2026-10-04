// src/lib/tabCover.ts — 하단 대메뉴 전환 '덮개' (BOTTOM-TAB-SMOOTH, 2026-09-24)
//
// 오너: "알약 같은 건 상관없고 본문이 문제" — 탭을 누르면 본문이 한 프레임에 컷된다.
// 🔴 본문(.tab-pane)에 opacity/transform 을 걸지 않는다. 그건 본문 레이어를 승격했다 해제하는 것이고
//   (ActiveOpacityAnimation), §0-a25 의 삼성 '전 메뉴 밝기 점프' 부류를 그대로 되살린다.
//   e2e/mobile-tab-transition.spec.ts R3(본문 애니메이션 0)가 그걸 막고 있다.
// → 본문은 그대로 두고, 본문 영역 **위**에 지면색(surface-base) 덮개 한 장을 깔았다가 걷어낸다.
//   합성층이 생기는 것은 덮개 한 장뿐이고, 본문은 그 **아래**라 승격 사유가 생기지 않는다.
//
// 2차(오너 삼성 실기기 "밝기 변화는 없지만 딱딱해" → "제일 오류가 없는 모션으로"): 덮개 **opacity 만** 쓰고
//   첫 50ms 는 거의 불투명으로 머문 뒤 긴 감속으로 풀리는 tabsoft 280ms 를 **기본으로 켠다**.
//   오너가 tabsoft 를 채택해 1차 비교용 `?fx=tabfade`(160ms)는 3차에서 지웠다 — 저장돼 있던 값은 무시·정리한다.
//
// 3차(리드 실측: 프로덕션에서 GTO 첫 방문 4회 중 3회 '새 본문 첫 프레임에 덮개 없음'):
//   덮개를 **고정 시각**에 걷으면, 목적지 본문이 늦게 그려질 때(Suspense 폴백 뒤 공개 — React 폴백 스로틀 ~300ms,
//   느린 폰) 덮개가 먼저 걷혀 스피너·빈 판이 드러나고 새 본문은 덮개 없이 컷으로 나타난다.
//   → 커밋 때 덮개를 opacity 1 로 깔아 두고, rAF 마다 **목적지 판이 실제로 그려졌는지**(tabPaneReady) 본 뒤에야
//     걷기 시작한다. 상한 TAB_COVER_WAIT_MAX_MS 를 넘으면 그래도 걷는다(영원히 덮지 않는다). 덮개는
//     pointer-events-none 이라 기다리는 동안에도 조작을 막지 않는다. 연타면 새 이동이 이긴다.
//
// (기기별 스위치 localStorage 'nuri:fx' · `?fx=` 는 덮개와 함께 2026-09-26 에 걷었다 — 켤 것이 없다.)
//
// 🔴 5차 PILL-FLASH(2026-09-26) — **덮개를 없앴다.** 위 1~4차의 '지면색 한 장' 이 곧 오너가 말한
//   "검정색이 됐다가 다시 콘텐츠가 나와 깜빡인다" 였다. 아래 '5차' 절이 실측과 이유다.
//   2026-09-26 정리: App.tsx 의 덮개 요소·호출(playTabCover)·스위치(isTabCoverOn)를 걷었다. 남은 것은 준비 판정과 하위 탭 스크롤 규칙이다.

import { markProgrammaticScroll, notifyScrollNow } from './useScrollY';

/** 판 준비를 기다리는 상한(waitSettled) — 넘으면 준비 여부와 상관없이 onReady 를 부른다. */
export const TAB_COVER_WAIT_MAX_MS = 700;

// ─────────────────────────────────────────────────────────────────────────────
// 4차 MOTION-UNIFY(오너 2026-09-24: "하나를 부드럽게 바꾸면 나머지 모든 페이지에서도 동일하게") —
//   이 덮개가 **앱의 유일한 화면 전환 연출**이다. 메인 탭(모바일·PC), 하위 탭 25곳(goSubTab), 전부 여기를 탄다.
//   · '준비됐다' 판정도 하나(isSettled) — 판 **안의** 스켈레톤·aria-busy(invisible 예약 포함)까지 본다.
//     예전 tabPaneReady 는 App 의 `.pane-reserve` 만 봐서, 첫 방문 라이브(GET 400ms)는 덮개가 걷힌 뒤 스켈레톤이
//     드러나고 1220→893px 로 무너졌다(CLS 0.39, root-cause 실측).
//   · 높이가 두 번 연속 같아야 걷는다(늦은 붕괴를 덮개 아래서 끝낸다).
//   · PC 도 탄다 — 예전엔 PC 제외(View Transition 이 맡음)였고 PC 첫 방문은 가림막 0 하드컷이었다.
//     PC 는 GNB 밑·콘텐츠 열 폭만 덮는다(좌우 채움 배경·GNB 밑줄은 덮지 않는다 — 2026-09-19 오너 '좌우 깜빡').
// ─────────────────────────────────────────────────────────────────────────────

/** 판 모양이 아직 바뀌는 중이라는 표식. 버튼(동작 중)·인라인 글자(집계 중 숫자)는 판 모양을 안 바꾸므로 뺀다. */
const BUSY_SEL = '.skeleton, [aria-busy="true"]';
const inViewport = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
};

/**
 * 화면 전환 뒤 이 판(root)이 **완성된 모습**인가 — 덮개를 걷어도 되는가. 앱 전체의 단일 준비 판정.
 * ① App 의 탭 로딩 자리(`.pane-reserve[aria-busy="true"]`, Suspense 폴백)가 보이면 아직.
 * ② root 가 숨었거나(display none — 폴백 중 React 가 숨긴 자식) 높이 0 이면 아직.
 * ③ root 안 **화면에 걸친** 스켈레톤·aria-busy 가 있으면 아직. `invisible` 예약(visibility hidden)도 센다 —
 *    그건 곧 스켈레톤이나 실제 내용으로 바뀔 자리다. 화면 밖(아래쪽) 것은 안 본다(보이지 않는 로딩을 기다리지 않는다).
 * root 가 없는 목적지(event 처럼 판 없이 여는 탭)는 ①만 본다.
 * whole=true 면 ③을 화면 밖까지 본다 — 덮개가 아니라 **판 전체 높이**를 지키는 쪽(VenueManageTab 높이 예약)이 쓴다.
 *   화면 밖 목록이 늦게 붙어도 판 높이는 바뀌기 때문이다(예약을 먼저 풀면 줄었다 다시 자라는 오르내림).
 */
export function isSettled(root: Element | null, whole = false): boolean {
  for (const el of document.querySelectorAll('.pane-reserve[aria-busy="true"]')) {
    if (el.getClientRects().length > 0) return false;
  }
  if (!root) return true;
  const h = root as HTMLElement;
  if (h.style?.display === 'none' || h.offsetHeight === 0) return false;
  for (const el of root.querySelectorAll(BUSY_SEL)) {
    if (el.tagName === 'BUTTON' || el.tagName === 'SPAN') continue;
    if (el.getClientRects().length > 0 && (whole || inViewport(el))) return false;
  }
  return true;
}

/** 메인 탭 목적지 판의 준비 여부(옛 이름 유지 — isSettled 의 메인 탭 판). */
export function tabPaneReady(tab: string): boolean {
  return isSettled(document.querySelector(`.tab-pane[data-tab="${tab}"]`));
}

/**
 * 판(root)이 **준비될 때까지** rAF 로 기다렸다가 onReady 를 한 번 부른다 — 판 높이 예약 해제(VenueManageTab S6)가 쓴다
 * (5차 전엔 덮개 걷기도 같은 판정·같은 상한을 썼다).
 * 준비 = isSettled(root) 이고 root 높이가 **두 프레임 연속** 같다. 상한 TAB_COVER_WAIT_MAX_MS 를 넘으면 그래도 부른다.
 * onFrame 은 매 프레임 판정 전에 불린다(덮개 자리 맞춤). whole 은 isSettled 와 같다. 돌려준 함수로 취소한다(연타·언마운트).
 */
export function waitSettled(root: () => Element | null, onReady: () => void, onFrame?: () => void, whole = false, maxMs = TAB_COVER_WAIT_MAX_MS): () => void {
  const t0 = performance.now();
  let lastH = -1;
  let alive = true;
  const tick = () => {
    if (!alive) return;
    onFrame?.();
    const r = root();
    const h = r ? (r as HTMLElement).offsetHeight : 0;
    const ready = isSettled(r, whole) && h === lastH;
    lastH = h;
    if (!ready && performance.now() - t0 < maxMs) { requestAnimationFrame(tick); return; }
    alive = false;
    onReady();
  };
  requestAnimationFrame(tick);
  return () => { alive = false; }; // 다음 프레임에 tick 이 alive 를 보고 멈춘다
}

// ─────────────────────────────────────────────────────────────────────────────
// 5차 PILL-FLASH(오너 2026-09-26: "내 매장에서 대메뉴 pill 을 눌러 이동하면 검정색이 됐다가 다시 콘텐츠가 나와 깜빡인다.
//   이런 부분 전부 다 찾아서") — **덮개를 그리지 않는다.**
//   덮개는 목적지 판 위에 지면색(다크=검정 · 라이트=흰) 한 장을 opacity 1 로 깔았다가, 판이 준비된 뒤(높이 정지 두 프레임)
//   50ms 머물고 280ms 에 걷었다. **판이 이미 완성된 재방문에서도** 그 순서를 그대로 탔으므로, 이미 그려진 콘텐츠를
//   ~100ms 빈 지면으로 가렸다가 돌려줬다 — 그게 '검정 → 콘텐츠' 깜빡임 그 자체다(덮개가 원인이지 증상의 마개가 아니었다).
//   실측(프로덕션 빌드 · 목킹 업주 · 내 매장 단계 알약 7칸 첫/재방문 · 1440/1280/390 · 다크/라이트 · CPU 1/4배, 2026-09-26):
//     덮개 opacity≥0.5 구간 = 재방문 94~123ms, 첫 방문 98~471ms. 판 영역 평균 휘도가 다크 7.9(지면색 그대로),
//     라이트 247.4(흰 판)까지 갔다. 동작 줄이기(덮개 꺼짐) 대조군은 같은 이동에서 지면색 판이 한 번도 없었다.
//     Suspense 폴백 0 · 재방문 스켈레톤 0 — 재마운트·재조회·청크 스로틀은 원인이 아니었다(반증).
//   메인 탭(App.tsx)·하위 탭 25곳(goSubTab)이 전부 이 파일 하나를 타서, 앱 전체가 같은 증상이었다
//     (메인 탭·커뮤니티 섹션·순위 보드·GTO 레인·내 매장 단계 실측: 재방문마다 ~100ms 지면색 판).
//   → 이미 그려진 판은 그대로 보인다(재방문 0ms). 첫 방문은 판의 스켈레톤(모양 예약)이 보이고,
//     startTransition 경로(내 매장 사이드바 등)는 새 판이 커밋될 때까지 **이전 판**이 보인다 — 어느 쪽도 빈 지면 판이 아니다.
//   남긴 것: 준비 판정(isSettled·waitSettled — VenueManageTab 높이 예약 해제가 쓴다), 하위 탭 P2 스크롤 규칙(alignSubTabPanel).
//   🔴 되살리지 마라 — 판 위에 불투명 한 장을 까는 방식은 판이 이미 그려져 있어도 가린다. 거리·시간을 줄여도
//     '가렸다 보여 준다' 는 그대로다. e2e/pill-flash.spec.ts 가 잠근다(덮개가 보이는 프레임 0 · 판 휘도가 지면색으로 떨어지는 프레임 0).
// ─────────────────────────────────────────────────────────────────────────────

// ── 하위 탭(goSubTab) ─────────────────────────────────────────────────────────
/** goSubTab 의 scope → 그 하위 탭이 바꾸는 판. **새 하위 탭을 만들면 여기 한 줄**(계약 테스트가 전 호출부를 대조한다). */
export const SUB_PANEL: Readonly<Record<string, string>> = {
  'community-sec': '[data-community-secpanel]',
  'mystore-sec': '[data-mystore-secpanel]',
  'usermgmt-sec': '[data-usermgmt-panel]',
  'tools-lane': '[data-tools-lanepanel]',
  'sched-tab': '[data-sched-panel]',
  'notif-tab': '[data-notif-panel]',
  'notif-filter': '[data-notif-panel]',
  'market-cat': '[data-market-panel]',
  'live-sort': '[data-live-panel]',
  'legal-tab': '[data-legal-panel]',
  'group-tab': '[data-group-panel]',
  'dealer-kind': '[data-dealer-panel]',
  'profile-tab': '[data-profile-panel]',
  'crm-range': '[data-crm-panel]',
  'adminpos-tab': '[data-adminpos-panel]',
  'admin-sec': '[data-admin-secpanel]',
  'rank-tab': '[data-rank-panel]',
  'venue-tab': '[data-venue-tabpanel]',
  'spot-tab': '[data-spot-pane]',
};
/** 자기 스크롤 정책(섹션별 복원 — CommunityTab · 탭별 기억 — NuriSpotPanel · 알림 창 탭별 기억 — NotificationPanel)이 있는 scope.
 *  공용 스크롤 맞춤을 하지 않는다(이중 적용 금지 — 공용 맞춤은 판 스크롤 상자를 맨 위로 되돌려 기억한 자리를 지운다). */
export const OWN_SCROLL_SCOPES: ReadonlySet<string> = new Set(['community-sec', 'spot-tab', 'notif-tab', 'notif-filter']);
/** 떠나는 판 복제본 없이 **한 프레임에** 바꾸는 scope — 알림 창(뜨는 카드 안 목록). 오너 2026-10-02 결정:
 *  행 높이가 다른 두 목록(쪽지 65px · 알림 81px)이 240ms 겹쳐 걷히면 행이 계단처럼 내려가 보였다("드르륵").
 *  이미 본 목록이고 카드 높이도 두 탭이 같다 — 겹칠 이유가 없다. 다른 하위 탭은 기존 퇴장 페이드 그대로. */
export const INSTANT_SUB_SCOPES: ReadonlySet<string> = new Set(['notif-tab', 'notif-filter']);

const scroller = (el: Element): HTMLElement | null => {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null; // 창(window)
};
/**
 * 하위 탭의 레일(누른 탭바)과 판 찾기 — alignSubTabPanel(스크롤 규칙)과 handOffSubPanel(판 교체)이 같은 규칙을 쓴다.
 * 레일 = 누른 요소의 조상 중, 부모가 판을 품는 첫 줄기(판의 형제). 판 안의 버튼(대시보드 바로가기 등)이면 레일 없음.
 * find() = 레일 가까이에서 **보이는** 판(두 화면이 동시에 DOM 에 있어도 누른 레일 옆 판). 커밋 전이면 떠나는 판, 뒤면 새 판.
 */
function subPanelOf(scope: string, target: EventTarget | null): { rail: Element | null; find: () => HTMLElement | null } | null {
  const sel = SUB_PANEL[scope];
  if (!sel) return null;
  const t = target instanceof Element ? target : null;
  let rail: Element | null = null;
  if (t) {
    for (let n: Element | null = t; n && n.parentElement; n = n.parentElement) {
      if (n.matches(sel) || n.querySelector(sel)) break;
      if (n.parentElement.querySelector(sel)) { rail = n; break; }
    }
  }
  const anchor: Element | null = rail ?? t;
  const find = (): HTMLElement | null => {
    for (let n: Element | null = anchor?.isConnected ? anchor.parentElement : null; n; n = n.parentElement) {
      const hit = [...n.querySelectorAll<HTMLElement>(sel)].find((e) => e.getClientRects().length > 0);
      if (hit) return hit;
    }
    return [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.getClientRects().length > 0) ?? null;
  };
  return { rail, find };
}

/**
 * 하위 탭 전환 — goSubTab 이 commit() **직후** 부른다(같은 이벤트 안). 5차부터 덮개 없이 **P2 스크롤 규칙만** 남았다.
 * ① 누른 버튼이 든 레일(탭바)과 목적지 판을 찾는다(판은 커밋으로 바뀔 수 있어 첫 rAF 에서 다시 찾는다).
 * ② 첫 rAF(커밋 뒤·첫 페인트 전): 판 윗변이 레일 밑으로 말려 올라가 있으면 **레일 바로 밑**으로 맞춘다.
 *    판 자체가 스크롤 상자면(내 정보·알림·약관) 그 상자를 맨 위로 — 새 탭 내용이 중간부터 보이지 않게.
 *    섹션별 복원이 있는 scope(OWN_SCROLL_SCOPES)는 그쪽 정책을 따른다(이중 적용 금지).
 * 동작 줄이기·`?fx=off` 와 무관하다 — 스크롤 규칙이지 연출이 아니다.
 */
export function alignSubTabPanel(scope: string, target: EventTarget | null): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function' || OWN_SCROLL_SCOPES.has(scope)) return;
  const sp = subPanelOf(scope, target);
  if (!sp) return;
  const { rail, find } = sp;
  // 커밋을 기다리는 판 교체(handOffSubPanel)가 있으면 **그 커밋 순간**(복제본을 세우기 직전 · 첫 페인트 전)에 맞춘다.
  //   종전엔 첫 rAF 에 맞춰, 커밋이 늦는 경로(내 매장 PC 사이드바 = startTransition)는 옛 판이 먼저 스크롤된 채 페인트되고
  //   복제본은 그 전 자리(rAF 로 잰 scrollY)에 서서 판 밖(배너·사이드바)과 찢겼다(root-cause 2026-09-28).
  const run = () => {
    const root = find();
    if (!root) return;
    const own = root as HTMLElement;
    const oy = getComputedStyle(own).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && own.scrollTop > 0) { own.scrollTop = 0; return; }
    if (!rail?.isConnected) return;
    // 판 위에 가로로 걸친 레일(탭바)은 밑변, 판 **옆**에 선 레일(PC 세로 사이드바 — sticky 머리)은 윗변에 맞춘다.
    //   종전엔 세로 사이드바도 밑변을 써서 판을 사이드바 아래로 끌어내리려다 문서 맨 위(0)까지 올렸다 — 판 위의 배너·레벨바가 드러났다.
    const p = root.getBoundingClientRect(), q = rail.getBoundingClientRect();
    const d = p.top - (q.right > p.left && q.left < p.right ? q.bottom : q.top);
    if (d >= -1) return;
    const sc = scroller(root);
    if (sc) sc.scrollTop += d;
    else { markProgrammaticScroll(); window.scrollTo({ top: Math.max(0, window.scrollY + d), behavior: 'instant' as ScrollBehavior }); notifyScrollNow(window.scrollY); }
  };
  if (atCommit) atCommit(run); else requestAnimationFrame(run);
}
/** 커밋을 기다리는 하위 탭 판 교체가 있으면 그 커밋 순간에 fn 을 부르도록 맡긴다(handOffSubPanel 이 세운다). */
let atCommit: ((fn: () => void) => void) | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// 6차 PANE-HANDOFF(오너 2026-09-26: "하단 메뉴로 메인 탭을 옮기면 본문이 검은색이 됐다가 올라온다 — 검은색 없이 부드럽게").
//   원인(root-cause 실측 · main 2f2a7dcf · Pixel7 DPR3 · CPU4 · 출발 판을 스크롤한 뒤 탭):
//     판 교체(display 토글)와 **같은 커밋**에 하단바 알약 opacity·아이콘 transform·FAB opacity 전환(합성 애니)이 시작된다.
//     합성 애니가 돌면 Chromium 은 부드러움을 우선해 새 판 타일 래스터를 기다리지 않고 프레임을 낸다 →
//     아직 래스터 안 된 타일 = 문서 배경색(다크 #06080F). 트레이스 PipelineReporter.has_missing_content 16프레임,
//     그 전환만 끄면 0. 원점 스크롤 0(하네스 기본)이면 0 이라 기존 게이트가 못 봤다.
//   처방 두 겹:
//     ① 스왑 프레임 정적화 — `html[data-tab-swap]` 동안 하단바·헤더·GNB·맨 위로 FAB 의 transition 을 끈다(index.css).
//        새 판의 첫 프레임이 나간 **다음** 프레임에 푼다. 모든 폭·모든 경로(동작 줄이기·연타 포함) 공통.
//     ② 떠나는 판 퇴장 페이드 — 떠나는 판을 **떠나기 직전 화면 자리 그대로** fixed 로 새 판 위에 세운다(opacity .999 —
//        완전 불투명이면 가려진 새 판 타일을 래스터하지 않는다). 새 판 첫 제출 다음 rAF 에 **떠나는 판만** opacity→0(240ms)
//        하고 걷는다(2026-09-26 240ms 로 조정). 새 판에는 opacity·transform·filter 를 절대 걸지 않는다(§0-a25 삼성 밝기 점프 부류 · R3 계약).
//        떠나는 판 배경은 지면(지면색 + body::before 결 + .aura-bg 블룸)과 같은 그림을 fixed 로 깐다 — 투명이면 새 판 글자가
//        첫 프레임부터 비쳐 두 벌로 겹친다(2026-08-29 부류).
//        첫 방문(스켈레톤)은 새 판이 준비될 때까지(상한 300ms) 떠나는 판을 붙잡은 뒤 걷는다. 동작 줄이기·연타·전면 오버레이·
//        숨은 문서는 페이드 없이 한 프레임 교체(①만).
//   ⚠ View Transition 을 쓰지 않는다 — 모바일 document 스냅샷은 삼성에서 눌렸고(1862bb49) 교차 페이드는 휘도가 튀었다(+23/−11).
// ─────────────────────────────────────────────────────────────────────────────
// 2026-09-26 오너 "드르륵, 더 부드럽게" — design-reviewer 최종 수치: 240ms · cubic-bezier(.4,0,.2,1). 160ms 는 두 프레임에 절반이 사라져
//   '컷+꼬리'로 보였다(최대 프레임 낙폭 .53 → .19). 블러는 넣지 않는다(옛 판이 번져 남아 '겹쳐 보임'이 는다). 첫 방문 대기(300ms)는 그대로.
export const LEAVE_FADE_MS = 240;
/** 떠나는 판 퇴장 곡선. (헤더 계정 메뉴는 M4-04 부터 이 값이 아니라 알림 패널과 같은 animate-fade-out 0.18s 로 닫힌다.) */
export const LEAVE_EASE = 'cubic-bezier(.4,0,.2,1)';
const FIRST_VISIT_HOLD_MAX_MS = 300;
/** 커밋이 끝내 안 오는 경우(같은 탭으로 되돌린 연타 등)에도 전환을 영원히 꺼 두지 않는 상한. */
const SWAP_GUARD_MS = 1500;

type Box = { top: number; left: number; width: number };
/** foot = 떠나기 직전 화면에 걸쳐 있던 사업자 푸터(판 밖 형제라 새 판 아래로 내려간다 — 그 자리를 복제본이 지킨다). */
type Leaving = { tab: string; el: HTMLElement; box: Box; foot: { el: HTMLElement; box: Box } | null; skip: boolean; first: boolean };
let leaving: Leaving | null = null;
/** 도는(또는 하위 탭 커밋을 기다리는) 판 교체를 끝낸다 — 메인 탭·하위 탭 공용. 있으면 다음 이동은 연타다. */
let fading: (() => void) | null = null;
let swapTimer = 0;
/** 스왑 동안 전환을 끄는 상시 크롬(index.css [data-swap-freeze]) — 하단바·헤더·PC GNB·맨 위로 FAB. 하위 탭은 누른 버튼도 더한다
 *  (전역 button 프레스의 opacity·transform 0.2s 복귀가 스왑 프레임에 돈다). */
const FREEZE = 'nav[aria-label="하단 내비게이션"], [data-stack-header], [data-stack-tabbar], .scroll-top-fab';

function releaseSwap(): void {
  if (swapTimer) { clearTimeout(swapTimer); swapTimer = 0; }
  document.documentElement.removeAttribute('data-tab-swap');
  document.querySelectorAll('[data-swap-freeze]').forEach((e) => e.removeAttribute('data-swap-freeze'));
}
/** 스왑 프레임 정적화를 켠다 — 커밋이 끝내 안 와도 SWAP_GUARD_MS 뒤엔 푼다(onGuard 로 기다리던 것도 버린다). */
function holdSwap(onGuard?: () => void, press?: Element | null): void {
  document.documentElement.setAttribute('data-tab-swap', '');
  document.querySelectorAll(FREEZE).forEach((e) => e.setAttribute('data-swap-freeze', ''));
  press?.setAttribute('data-swap-freeze', '');
  if (swapTimer) clearTimeout(swapTimer);
  swapTimer = window.setTimeout(() => { swapTimer = 0; onGuard?.(); releaseSwap(); }, SWAP_GUARD_MS);
}
const afterFirstFrame = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));
const boxOf = (e: Element): Box => { const r = e.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width }; };
const place = (e: HTMLElement, b: Box) => {
  e.style.setProperty('--leave-top', `${b.top}px`);
  e.style.setProperty('--leave-left', `${b.left}px`);
  e.style.setProperty('--leave-width', `${b.width}px`);
  e.setAttribute('data-pane-leaving', '');
};
/** 떠나기 직전 화면에 걸친 사업자 푸터(판 밖 형제라 새 판을 따라 내려간다) — 없으면 null. 이벤트 시점(레이아웃이 깨끗할 때)에 잰다. */
const visibleFooter = (): { el: HTMLElement; box: Box } | null => {
  const el = document.querySelector<HTMLElement>('footer');
  const r = el?.getBoundingClientRect();
  return el && r && r.bottom > 0 && r.top < window.innerHeight ? { el, box: boxOf(el) } : null;
};
/** 푸터 복제본 — 떠나기 직전 자리를 지킨다. 입력·보조기술·스냅샷 이름에서 뺀다(같은 이름 둘이면 진행 중 View Transition 이 통째로 실패한다). */
const cloneFooter = (foot: { el: HTMLElement; box: Box }, parent: Node, before: Node | null): HTMLElement => {
  const c = foot.el.cloneNode(true) as HTMLElement;
  stripIdentity(c);
  c.setAttribute('data-footer-clone', ''); // e2e 가 복제본과 진짜 푸터를 구별한다(skeleton-no-shift)
  c.setAttribute('aria-hidden', 'true');
  c.inert = true;
  c.style.viewTransitionName = 'none';
  place(c, foot.box);
  parent.insertBefore(c, before);
  return c;
};

/**
 * 떠나는 판(parts)을 새 판 첫 프레임 **뒤에** 걷는다 — 메인 탭·하위 탭이 같은 함수·같은 수치(LEAVE_FADE_MS·곡선)를 쓴다.
 * 첫 프레임 뒤 스왑 정적화를 풀고, 새 판(dest)이 준비 전이면(hold — 스켈레톤·Suspense) 최대 FIRST_VISIT_HOLD_MAX_MS 붙잡는다.
 * cleanup 은 걷을 때(끝남·연타·취소) 한 번 부른다.
 */
function fadeAfterFirstFrame(parts: HTMLElement[], cleanup: () => void, dest: () => Element | null, hold: boolean): void {
  let alive = true;
  let anims: Animation[] = [];
  let stopWait = () => {};
  const stop = () => {
    if (!alive) return;
    alive = false;
    stopWait();
    cleanup();
    anims.forEach((a) => a.cancel());
    if (fading === stop) fading = null;
  };
  fading = stop;
  const fade = () => {
    if (!alive) return;
    anims = parts.map((p) => p.animate([{ opacity: 0.999 }, { opacity: 0 }], { duration: LEAVE_FADE_MS, easing: LEAVE_EASE, fill: 'forwards' }));
    anims[0].finished.then(stop, () => {});
  };
  afterFirstFrame(() => {
    releaseSwap();
    if (!alive) return;
    if (!hold || isSettled(dest())) fade();
    else stopWait = waitSettled(dest, fade, undefined, false, FIRST_VISIT_HOLD_MAX_MS);
  });
}

/**
 * 메인 탭 커밋 **직전**(같은 이벤트 안, App commitTab)에 부른다 — 떠나는 판의 화면 자리를 적고 스왑 프레임 정적화를 켠다.
 * from === to 면(같은 배치에서 마지막 선택이 원래 탭) 적어 둔 것을 버린다. first = 목적지 첫 방문(lazy·스켈레톤 — 준비까지 붙잡는다).
 */
export function notePaneLeaving(from: string, to: string, first = false): void {
  if (typeof document === 'undefined') return;
  // 연타 = 도는 퇴장이 있거나(fading — 하위 탭이 커밋을 기다리는 중 포함) **아직 커밋 전인 앞선 탭**이 있다(leaving) — 후자를 빠뜨리면
  //   70~150ms 연타에서 페이드가 두 번 나가고 빠진 타일이 4프레임 났다(design-reviewer 실측). 둘 다 페이드 없이 한 프레임 교체.
  const rapid = fading !== null || leaving !== null;
  fading?.(); // 연타 — 도는 퇴장은 즉시 끝낸다(연출보다 응답)
  leaving = null;
  if (from === to) { releaseSwap(); return; }
  // 재기(떠나는 판·푸터 자리)를 **먼저** — html[data-tab-swap] 을 켠 뒤에 재면 그 무효화로 문서 전체 스타일 재계산이 이벤트 안에서 강제된다.
  const el = document.querySelector<HTMLElement>(`.tab-pane[data-tab="${from}"]`);
  const shown = !!el && el.getClientRects().length > 0;
  const box = shown ? boxOf(el!) : null;
  const foot = shown ? visibleFooter() : null;
  holdSwap(() => { leaving = null; });
  // 도는 부드러운 스크롤(같은 탭 재탭 = 맨 위로 smooth)을 지금 자리에서 멈춘다 — 합성 스크롤 애니가 돌면 새 판 래스터를 안 기다리고,
  //   떠나는 판도 커밋 전까지 계속 움직여 적어 둔 자리와 어긋난다(design-reviewer 연타 실측: 자리 어긋남 80~710px · 빠진 타일 4).
  window.scrollTo({ top: window.scrollY, behavior: 'instant' as ScrollBehavior });
  if (!el || !box) return;
  // 이벤트 시점 — 레이아웃이 깨끗해 강제 레이아웃 비용이 없다
  leaving = {
    tab: from, el, box, first, foot,
    skip: rapid || document.hidden || document.documentElement.hasAttribute('data-overlay')
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/**
 * 메인 탭이 커밋된 layout effect(첫 페인트 전)에서 부른다 — 떠나는 판을 제자리에 세우고, 새 판 첫 프레임 뒤에 걷는다.
 */
export function handOffPane(to: string): void {
  if (typeof document === 'undefined') return;
  const l = leaving;
  leaving = null;
  if (!l || l.tab === to || !l.el.isConnected || l.skip) { afterFirstFrame(releaseSwap); return; }
  const el = l.el;
  place(el, l.box);
  // 푸터는 판 밖 형제라 새 판을 따라 내려간다 — 떠나기 직전 자리를 **복제본**이 지킨다(없으면 그 자리가 첫 프레임에 새 판으로 컷된다).
  //   판과 같은 부모(앱 셸) 안에 넣어 같은 쌓임 맥락에 둔다 — body 에 붙이면 헤더·하단바(셸 안 z-50) 위로 올라간다.
  //   푸터는 탭마다 새 노드(App.tsx key=activeTab)라 떠나는 시점의 옛 푸터는 이미 떨어져 있다 — cloneNode 는 떨어진 노드도 복제하므로 isConnected 를 보지 않는다.
  const foot = l.foot && el.parentElement ? cloneFooter(l.foot, el.parentElement, el.nextSibling) : null;
  // 재방문은 이미 그려진 판이다 — 판 안의 새로고침 표시(aria-busy)를 기다리며 붙잡지 않는다(실측: 라이브 재방문이 300ms 늦게 보였다).
  fadeAfterFirstFrame(foot ? [el, foot] : [el], () => {
    el.removeAttribute('data-pane-leaving'); // React 가 준 display:none 이 그대로 다시 이긴다
    el.style.removeProperty('--leave-top');
    el.style.removeProperty('--leave-left');
    el.style.removeProperty('--leave-width');
    foot?.remove();
  }, () => document.querySelector(`.tab-pane[data-tab="${to}"]`), l.first);
}

/**
 * M3-02(2026-10-04) — 숨은 keep-alive 판(display:none)을 **한 번** 화면 밖에서 배치했다가 즉시 되돌린다(App 프리마운트 idle 이 부른다).
 * 왜: 첫 진입의 긴 프레임은 판 배치가 아니라 그 판이 처음 쓰는 글꼴 조합(서브셋 × 굵기 × 크기)의 인스턴스 생성이었다
 *   (CPU4 트레이스 GTO→캘린더: 클릭 처리 안 Layout 514ms 중 FontDataManager::onMakeFromStreamArgs 314ms · 재방문 Layout 15ms).
 *   글꼴 캐시는 문서 전역이라 여기서 치르면 탭을 누른 프레임에서 빠진다(같은 폭 → 같은 줄바꿈·컨테이너 쿼리 → 같은 크기 조합).
 * 같은 동기 작업 안에서 켰다 끄므로 페인트·ResizeObserver·IntersectionObserver·rAF 는 아무것도 못 본다(렌더 단계 전에 원복).
 *   React 가 쥔 inline style(display:none)은 cssText 를 통째로 되돌려 바이트까지 그대로다.
 * 반환: 'done' = 배치했다 · 'skip' = 필요 없다(보이는 중 — 이미 배치돼 있다) ·
 *   'later' = 지금은 못 한다(판이 아직 마운트 전 · 떠나는 중 · 판 교체 중(html[data-tab-swap] — 하위 탭 MutationObserver 가 style 변화를 본다) · 숨은 문서).
 *   ⚠ 'later' 를 버리면 안 된다 — 프리마운트는 startTransition 이라 마지막 판(캘린더)이 idle 보다 늦게 커밋돼 영영 안 데워졌다(하네스 실측).
 */
export function warmHiddenPane(tab: string): 'done' | 'skip' | 'later' {
  if (typeof document === 'undefined') return 'skip';
  if (document.hidden || document.documentElement.hasAttribute('data-tab-swap')) return 'later';
  const el = document.querySelector<HTMLElement>(`.tab-pane[data-tab="${tab}"]`);
  if (!el || el.hasAttribute('data-pane-leaving')) return 'later';
  if (el.style.display !== 'none') return 'skip';
  const ref = [...document.querySelectorAll<HTMLElement>('.tab-pane')].find((p) => p.style.display !== 'none' && !p.hasAttribute('data-pane-leaving'));
  const w = ref?.offsetWidth || el.parentElement?.clientWidth || window.innerWidth;
  const prev = el.style.cssText;
  el.style.cssText = `${prev};display:block;position:fixed;top:0;left:0;width:${w}px;visibility:hidden;pointer-events:none;z-index:-1`;
  void el.offsetHeight;
  el.style.cssText = prev;
  return 'done';
}

// ─────────────────────────────────────────────────────────────────────────────
// 7차 SUB-HANDOFF(오너 2026-09-26: "메인 카테고리 이동 때의 부드러운 모션을 카테고리 메뉴(하위 탭)에서 이동할 때도 동일한 모션으로") —
//   하위 탭(goSubTab 한 입구)도 메인 탭과 **같은 장치·같은 수치**다: ① 스왑 프레임 정적화(html[data-tab-swap]) ② 떠나는 판만
//   240ms 페이드(fadeAfterFirstFrame) — 새 판에는 아무것도 걸지 않는다. 알약 FLIP(SlidingPill)은 스왑 동안 Invert 만 하고
//   새 판 첫 프레임 뒤에 미끄러진다(스왑 프레임에 합성 애니 0). 누른 컨트롤의 누름 복귀 전환도 스왑 동안 끈다.
//   다른 점 하나 — 하위 판은 조건부 마운트라 떠나는 DOM 이 커밋과 함께 사라진다. 그래서 커밋 **직전**(이벤트 시점, 레이아웃이
//   깨끗할 때) 떠나는 판을 복제해 두고, 커밋(MutationObserver — goSubTab 에는 커밋 layout effect 가 없고, startTransition·Suspense 로
//   늦게 커밋되기도 한다) 직후·첫 페인트 전에 그 자리에 세운다(푸터 복제본과 같은 방식 — inert·aria-hidden·입력 없음).
//   복제본은 그림일 뿐이다: id·testid·판 표식·라디오 이름을 지우고(검색·선택 가로채기 방지), 재생되는 애니는 끝 상태로 세운다.
//   배경 = 판 뒤에 실제로 깔린 것(조상 배경을 판 쪽부터 쌓고, 불투명한 조상이 없으면 지면 그림 — 메인 탭 떠나는 판과 같은 값).
//   복제본은 fixed 라 조상의 자르기를 벗어난다 — 뷰포트·자르는 조상·판 위에 가로로 겹친 레일(sticky 탭바) 밖은 clip-path 로 자른다.
//   메인 페이지 판(지면 위·자르는 조상 없음)은 메인 탭처럼 화면 바닥까지 늘리고 푸터 복제본을 세운다.
//   건너뛰기(한 프레임 교체 — ①만): 연타 · 동작 줄이기 · 숨은 문서 · 전면 오버레이 아래의 메인 판 · 화면에 안 보이는 판.
// ─────────────────────────────────────────────────────────────────────────────

/** SUB_PANEL 의 판 표식 속성 이름('[data-x]' → 'data-x') — 복제본에서 지워 판 찾기가 복제본을 잡지 않게 한다. */
const SUB_MARKS = [...new Set(Object.values(SUB_PANEL))].map((s) => s.slice(1, -1));
const SUB_MARK_SEL = SUB_MARKS.map((m) => `[${m}]`).join(', ');
/** 계산된 배경색의 알파(rgb/rgba/color()/oklab… 끝의 '/ a' 또는 rgba 4번째 값). */
const alphaOf = (c: string): number => {
  if (!c || c === 'transparent') return 0;
  const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(c);
  if (slash) return parseFloat(slash[1]) * (slash[2] ? 0.01 : 1);
  const rgba = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(c);
  return rgba ? parseFloat(rgba[1]) : 1;
};

/** 문서 스타일시트가 선택자로 읽는 data-·aria-·role 속성 이름 — 복제본에서 남길 것(모양). 시트 수가 바뀌면(지연 청크 CSS) 다시 모은다. */
let styledAttrs: { n: number; set: Set<string> } | null = null;
const styledAttrSet = (): Set<string> => {
  const sheets = document.styleSheets;
  if (styledAttrs && styledAttrs.n === sheets.length) return styledAttrs.set;
  const set = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const r of rules) {
      const sel = (r as CSSStyleRule).selectorText;
      if (sel) for (const m of sel.matchAll(/\[((?:data-|aria-)[\w-]+|role)\b/g)) set.add(m[1]);
      const inner = (r as CSSGroupingRule).cssRules;
      if (inner) walk(inner);
    }
  };
  for (const sh of sheets) { try { walk(sh.cssRules); } catch { /* 다른 출처 시트(글꼴) — 읽을 수 없다 */ } }
  styledAttrs = { n: sheets.length, set };
  return set;
};
/** 복제본(떠나는 판·푸터)을 **그림**으로 만든다 — id·for·name·testid·표식(data-*)·aria-*·role 을 뗀다(모양에 쓰이는 것만 남김).
 *  테스트 선택자·접근성 트리·판 찾기·라벨 연결이 복제본을 원본으로 잡지 않게. inert·aria-hidden 은 호출부가 붙인다. */
function stripIdentity(root: HTMLElement): void {
  const keep = styledAttrSet();
  for (const x of [root, ...root.querySelectorAll('*')]) {
    for (const a of [...x.attributes]) {
      const n = a.name;
      if (n === 'id' || n === 'for' || n === 'name' || ((n.startsWith('data-') || n.startsWith('aria-') || n === 'role') && !keep.has(n))) x.removeAttribute(n);
    }
  }
}

type SubSnap = {
  el: HTMLElement; box: Box; page: boolean; scroll: [HTMLElement, number, number][]; canvas: [HTMLCanvasElement, HTMLCanvasElement][];
  /** 레일 밑변(뷰포트 y — 레일이 판과 가로로 안 겹치면 null)을 받아 복제본을 자른다. 레일은 커밋 뒤에도 움직인다(헤더 접힘·스크롤 깎임). */
  clipBelow: (railBottom: number | null) => void;
  /** 판을 세로로 자르는 가장 가까운 그릇(뜨는 카드·시트)과 이벤트 시점 높이 — 없으면 null(지면 위 판). */
  frame: { el: HTMLElement; h: number } | null;
  /** 보이는 글자 칸(제 글자를 가진 요소, 최대 ANCHOR_MAX)의 복제 요소와 그 원본의 이벤트 시점 윗변 — 붙인 뒤 내용이 원본 자리인지 잰다.
   *  글자 칸이 적으면 보이는 첫 요소가 하나 더 든다(아이콘뿐인 판). 한 요소가 아니라 여럿의 차 중앙값으로 판단한다(contentShift). */
  anchors: { c: Element; top: number }[];
  /** 복제본을 d 만큼 위로 옮겼을 때 자르는 선은 화면에 그대로 둔다. */
  nudge: (d: number) => void;
};
/** 레일이 판과 가로로 겹치면 그 밑변(뷰포트 y), 아니면 null — 세로 사이드바(PC)는 판과 가로로 안 겹친다. */
const railBottomOver = (rail: Element | null, box: { left: number; width: number }): number | null => {
  if (!rail?.isConnected) return null;
  const q = rail.getBoundingClientRect();
  return q.height > 0 && q.right > box.left && q.left < box.left + box.width ? q.bottom : null;
};
/** 기준점으로 모으는 글자 칸 상한 · 이보다 적으면 보이는 첫 요소를 더한다(contentShift 가 과반 합의를 요구한다). */
const ANCHOR_MAX = 12;
const ANCHOR_MIN = 3;
/** 제 글자를 가진 요소인가(자식 요소의 글자는 안 센다) — 칸 하나가 곧 글자 한 덩이. */
const hasOwnText = (e: Element): boolean => { for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent?.trim()) return true; return false; };
/**
 * 붙인 복제본의 내용이 원본 자리에서 벗어난 거리 — 기준점들의 (복제본 윗변 − 원본 윗변) **중앙값**.
 * 과반(60%)이 중앙값 1px 안에 모이지 않으면 0 이다: 요소 하나만 다른 것(인라인 배지·세로 가운데 정렬 칸의 반 픽셀)은 판 전체가 어긋난 게 아니다.
 * 종전엔 첫 요소 하나로 판 전체를 옮겨, 그 요소만 3px(질문 배지)·1.5px(CI 의 글자 폭 차) 어긋나 있으면 멀쩡한 판을 끌어올렸다(2026-10-03).
 */
function contentShift(pts: SubSnap['anchors'], dy: number): number {
  const ds = pts.map((p) => p.c.getBoundingClientRect().top - (p.top - dy)).sort((a, b) => a - b);
  if (!ds.length) return 0;
  const med = ds[ds.length >> 1];
  return ds.filter((d) => Math.abs(d - med) <= 1).length >= Math.ceil(ds.length * 0.6) ? med : 0;
}
/** 떠나는 하위 판의 복제본을 만든다(아직 붙이지 않는다) — 이벤트 시점에 잰다. 화면에 안 걸치면 null. */
function snapSubPanel(root: HTMLElement, rail: Element | null): SubSnap | null {
  const r = root.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= vh) return null;
  let top = Math.max(r.top, 0), bottom = Math.min(r.bottom, vh), left = Math.max(r.left, 0), right = Math.min(r.right, vw);
  let clipY = false;
  let frame: SubSnap['frame'] = null;
  const layers: string[] = [];
  let base: string | null = null;
  for (let n: HTMLElement | null = root; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (n !== root && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
      const q = n.getBoundingClientRect();
      if (cs.overflowX !== 'visible') { left = Math.max(left, q.left); right = Math.min(right, q.right); }
      if (cs.overflowY !== 'visible') { top = Math.max(top, q.top); bottom = Math.min(bottom, q.bottom); clipY = true; frame ??= { el: n, h: q.height }; }
    }
    if (base !== null) continue;
    if (cs.backgroundImage !== 'none') layers.push(cs.backgroundImage);
    const a = alphaOf(cs.backgroundColor);
    if (a >= 1) base = cs.backgroundColor;
    else if (a > 0) layers.push(`linear-gradient(${cs.backgroundColor}, ${cs.backgroundColor})`);
  }
  // 판 위에 가로로 겹친 레일(sticky 탭바 밑으로 판이 말려 올라간 경우 · 판 안의 단계 바) — 그 위는 레일·헤더 자리다.
  const top0 = top;
  const rb = railBottomOver(rail, r);
  if (rb !== null && rb > top) top = rb;
  const page = base === null && !clipY && !!root.closest('.tab-pane');
  if (page) bottom = vh; // 메인 탭 떠나는 판처럼 화면 바닥까지(판 끝~푸터 틈으로 새 판이 비치지 않게)
  if (bottom <= top || right <= left) return null;
  const h = page ? Math.max(r.height, vh - r.top) : r.height;

  // 보이는 것만 복제한다 — 보이는 사각형 밖 자식은 같은 태그·클래스의 빈 칸(여백·배치 그대로, 높이만 고정)으로 둔다.
  //   긴 목록(게시판 수십 줄)을 통째로 복제하면 그 스타일·레이아웃 비용이 탭 응답에 그대로 얹힌다(실측: 첫 버전 INP 중앙값 72→136ms).
  const scroll: [HTMLElement, number, number][] = [];
  const canvas: [HTMLCanvasElement, HTMLCanvasElement][] = [];
  const HEAVY = 'iframe, video, audio, object, embed';
  const SC = '[class*="overflow-"]';
  const blank = (o: Element, hgt: number): HTMLElement => {
    const s = document.createElement('div');
    s.style.cssText = `width:${(o as HTMLElement).offsetWidth ?? 0}px;height:${hgt}px`;
    return s;
  };
  const deep = (o: Element): Node => {
    if (o.matches(HEAVY)) return blank(o, (o as HTMLElement).offsetHeight ?? 0); // 다시 불러오는 것(iframe·미디어)은 같은 크기 빈 칸 — 요청·재생을 만들지 않는다
    const c = o.cloneNode(true) as Element;
    const ho = o.querySelectorAll(HEAVY);
    c.querySelectorAll(HEAVY).forEach((x, i) => x.replaceWith(blank(ho[i] ?? x, (ho[i] as HTMLElement | undefined)?.offsetHeight ?? 0)));
    const pair = <T extends Element>(sel: string, fn: (o2: T, c2: T) => void) => {
      const os = o.matches(sel) ? [o as T, ...o.querySelectorAll<T>(sel)] : [...o.querySelectorAll<T>(sel)];
      const cs2 = c.matches(sel) ? [c as T, ...c.querySelectorAll<T>(sel)] : [...c.querySelectorAll<T>(sel)];
      cs2.forEach((x, i) => { if (os[i]) fn(os[i], x); });
    };
    pair<HTMLCanvasElement>('canvas', (o2, c2) => canvas.push([o2, c2]));
    pair<HTMLElement>(SC, (o2, c2) => { if (o2.scrollTop || o2.scrollLeft) scroll.push([c2, o2.scrollTop, o2.scrollLeft]); });
    return c;
  };
  const cut = (o: Element, depth: number): Node => {
    if (depth >= 8 || !o.firstElementChild || o.matches(`canvas, ${HEAVY}`)) return deep(o);
    const c = o.cloneNode(false) as Element;
    const oh = o as HTMLElement;
    if (oh.scrollTop || oh.scrollLeft) scroll.push([c as HTMLElement, oh.scrollTop, oh.scrollLeft]);
    for (const ch of o.childNodes) {
      if (!(ch instanceof Element)) { c.appendChild(ch.cloneNode(true)); continue; }
      const q = ch.getBoundingClientRect();
      // 숨은 자식(keep-alive 판·접힌 목록 — display:none)은 그리지 않으니 **속은 비운** 껍데기만 둔다. 통째로 복제하면 숨은 판의 id·표식·글자가
      //   문서에 두 벌이 된다(배포 게이트 2026-09-27: [data-rank-tabbar] 2개 · '약관 버전' 글자 2개). 껍데기는 형제 선택자(space-y)의 자리만 지킨다.
      if (q.width === 0 && q.height === 0 && getComputedStyle(ch).display === 'none') { c.appendChild(ch.cloneNode(false)); continue; }
      if (q.height > 0 && (q.bottom < top0 || q.top > bottom)) { // 레일 위(top0~top)는 남긴다 — 레일이 올라가면 드러난다
        const s = ch.cloneNode(false) as HTMLElement;
        // 원본의 display·마진을 고정한다 — 비운 껍데기는 내용에 기대는 스타일(empty:hidden 의 :empty · :has())에 걸려 숨으면 그 높이만큼
        //   아래 내용이 올라갔다(2026-10-03 내 매장 등급 배너 래퍼 −76px). 자손이 경계 밖으로 넘기던 마진 겹침은 여기서 못 지킨다 —
        //   그건 붙인 뒤 기준점(anchor)으로 바로잡는다(handOffSubPanel).
        if (s.style) {
          const cs = getComputedStyle(ch);
          s.style.setProperty('display', cs.display, 'important');
          s.style.setProperty('margin', `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`, 'important');
          s.style.height = `${q.height}px`; s.style.minHeight = '0'; s.style.maxHeight = 'none';
        }
        c.appendChild(s);
      } else {
        const cc = cut(ch, depth + 1);
        // 기준점 수집 — sticky·fixed 판정(조상 스타일 읽기)은 필요할 때만 한다(탭 응답 비용).
        if (q.height > 0 && q.bottom > top && q.top < bottom && (!firsts.length || (anchors.length < ANCHOR_MAX && hasOwnText(ch))) && !stuck(ch)) {
          const pt = { c: cc as Element, top: q.top };
          if (!firsts.length) firsts.push(pt);
          if (anchors.length < ANCHOR_MAX && hasOwnText(ch)) anchors.push(pt);
        }
        c.appendChild(cc);
      }
    }
    return c;
  };
  // 위 껍데기는 제 상자(높이·display·마진)만 지킨다 — 자손이 껍데기 경계로 넘기던 마진 겹침(-my-2.5 등)은 사라져 그 아래 내용이 통째로 밀린다(2026-10-03 커뮤니티
  //   홀덤펍 → 게시판 +10.6px). 겹침 규칙을 다시 짜지 않고, 붙인 뒤 보이는 첫 요소의 자리를 재서 판을 그만큼 되돌린다(아래 handOffSubPanel).
  //   sticky·fixed 안의 요소는 복제본에서 자리가 달라 기준점으로 쓰지 않는다.
  const anchors: SubSnap['anchors'] = [];
  const firsts: SubSnap['anchors'] = []; // 보이는 첫 요소(최대 1개) — 글자 칸이 적은 판의 대비책
  const stuck = (e: Element): boolean => {
    for (let n: Element | null = e; n && n !== root; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'sticky' || p === 'fixed') return true; }
    return false;
  };
  const el = cut(root, 0) as HTMLElement;
  el.setAttribute('aria-hidden', 'true');
  el.inert = true;
  // 복제본은 그림일 뿐이다 — 판 찾기·id·testid·표식 검색에 걸리지 않게 식별 속성을 모두 뗀다(stripIdentity). 모양에 쓰이는 것(CSS 선택자가 읽는
  //   data-·aria-·role)만 남긴다 — 떼면 그 순간 복제본 모양이 원본과 달라진다(아우라·알약 등).
  stripIdentity(el);
  // content-visibility:auto 행(.cv-row-* · .cv-card-*)은 갓 붙은 복제본에서 '건너뜀' 상태로 먼저 배치된다 — 행 높이가 contain-intrinsic-size 라
  //   세로 가운데 정렬 칸이 실제 높이와의 차 절반만큼(0.5~1.5px) 어긋나 보이고, 그 값으로 판 전체를 옮기면 화면이 정말 어긋난다(2026-10-03 CI 게시판→실시간
  //   1.5px). 복제본은 보이는 행만 든 그림이라 건너뛸 이유가 없다 — 처음부터 펼친다(자리가 첫 프레임부터 원본과 같다).
  for (const x of [el, ...el.querySelectorAll<HTMLElement>('[class*="cv-"]')]) x.style.setProperty('content-visibility', 'visible', 'important');
  // 판 표식은 CSS 가 읽어도 뗀다 — 남으면 판 찾기(subPanelOf)가 보이는 복제본을 판으로 잡는다.
  for (const x of [el, ...el.querySelectorAll(SUB_MARK_SEL)]) SUB_MARKS.forEach((m) => x.removeAttribute(m));

  el.style.setProperty('display', getComputedStyle(root).display, 'important'); // [data-pane-leaving] 의 block 이 판의 flex·grid 를 깨지 않게
  el.style.height = `${r.height}px`;
  if (page) el.style.minHeight = `${h}px`;
  let shift = 0; // nudge 로 옮긴 거리 — 자르는 선의 원점을 그만큼 되돌려 화면 자리에 고정한다
  let lastRb = rb;
  const clipBelow = (railBottom: number | null) => {
    lastRb = railBottom;
    const t = Math.min(bottom, Math.max(top0, railBottom ?? top0));
    const o = r.top - shift;
    el.style.clipPath = `inset(${t - o}px ${r.right - right}px ${o + h - bottom}px ${left - r.left}px)`;
  };
  const nudge = (d: number) => { shift += d; clipBelow(lastRb); };
  clipBelow(rb);
  if (base === null) {
    const ground = window.matchMedia('(prefers-reduced-transparency: reduce)').matches
      ? ['var(--grad-surface)', 'var(--glow-layer)'] : ['var(--aura-layers)', 'var(--grad-surface)', 'var(--glow-layer)'];
    el.style.backgroundColor = 'rgb(var(--surface-base))';
    el.style.backgroundImage = [...layers, ...ground].join(', ');
  } else {
    el.style.backgroundColor = base;
    el.style.backgroundImage = layers.length ? layers.join(', ') : 'none';
    el.style.backgroundAttachment = 'scroll';
  }
  place(el, { top: r.top, left: r.left, width: r.width });
  // 글자 칸이 3개 미만이면 보이는 첫 요소를 더한다 — 그래도 한 요소만 다르면 contentShift 가 보정을 하지 않는다.
  if (anchors.length < ANCHOR_MIN && firsts.length && !anchors.includes(firsts[0])) anchors.push(firsts[0]);
  return { el, box: { top: r.top, left: r.left, width: r.width }, page, scroll, canvas, clipBelow, frame, anchors, nudge };
}

// ── 커밋 판정(2026-09-27 COMMIT-SIGNAL) ─────────────────────────────────────────
// 종전엔 '판 DOM 이 바뀐 첫 배치'를 커밋으로 봤다. 그런데 떠나는 판은 커밋 전까지 **살아 있다** — 제 데이터가 늦게 오거나 실시간 갱신이
//   들어오면 그것도 판 DOM 변화다. 실측(root-cause · 내 매장 PC 사이드바 · CPU4 · 누른 뒤 떠나는 판에 늦은 도착): 복제본 47~58ms,
//   실제 전환 115~166ms — 옛 그림이 먼저 걷히고 진짜 전환은 복제본 없이 컷(3/3). 모바일 메뉴는 시트가 먼저 닫혀(레일만 바뀜) 늘 컷이었다.
// 이제 커밋은 **활성 판이 실제로 바뀐 신호**로만 본다:
//   ① 판 식별자가 있는 판(keep-alive — 판마다 [data-pane]=id, 숨김은 인라인 display:none. 내 매장) — 목적지([data-pane=to])가 보이거나
//      보이는 판 목록이 바뀐 배치. 전환(startTransition)·Suspense 로 커밋이 늦어도, 그 사이 떠나는 판이 바뀌어도 속지 않는다.
//      기다리는 동안 떠나는 판이 바뀌면 그 자리에서 다시 복제한다 — 복제본은 커밋 직전에 보이던 모습이어야 한다(옛 스켈레톤이 걷히면 안 된다).
//   ② 식별자가 없는 판(조건부 마운트 — 나머지 전부) — React 는 이산 이벤트(탭·클릭·키)의 상태 변경을 **같은 태스크의 마이크로태스크**에서
//      동기 반영한다. 그러니 이벤트 태스크 안에 온 판 변화만 커밋이다. 태스크가 끝날 때까지 판이 안 바뀌었으면 판 교체가 없던 것이다
//      (같은 결과를 다시 그린 필터 · 레일만 바뀜) — 복제본을 버리고 스왑을 푼다. 늦게 오는 판 변화는 데이터 도착이지 전환이 아니다.
//   이벤트 밖에서 불린(프로그램) 식별자 없는 전환은 커밋 시점을 알 수 없어 복제본을 세우지 않는다(한 프레임 교체 — 스왑 정적화만).
const PANE_ID = 'data-pane';
/** 판 안에서 지금 보이는 keep-alive 판 id 목록('' = 식별자 없는 판). 인라인 display 만 본다 — 레이아웃을 강제하지 않는다. */
const shownPanes = (root: Element): string =>
  [...root.querySelectorAll<HTMLElement>(`[${PANE_ID}]`)].filter((e) => e.style.display !== 'none').map((e) => e.getAttribute(PANE_ID)).join('|');
/** 이벤트 태스크의 마이크로태스크 체크포인트 **뒤**에 fn — React 의 동기 반영(마이크로태스크 한두 겹)과 그 커밋의 MutationObserver 콜백보다
 *  늦게 돈다(마이크로태스크는 같은 태스크 안에서 다 돈다 — 다른 태스크(네트워크 응답·전환 커밋)가 끼어들 수 없다). */
const afterEventTask = (fn: () => void, hops = 8): void => { queueMicrotask(hops > 0 ? () => afterEventTask(fn, hops - 1) : fn); };

/**
 * 하위 탭 판 교체 — goSubTab 이 commit() **직전**(같은 이벤트 안)에 부른다. 메인 탭의 notePaneLeaving + handOffPane 한 벌.
 * to = goSubTab 이 아는 목적지 값(판 식별자가 있는 판은 [data-pane=to] 가 보이는 순간이 커밋이다).
 */
export function handOffSubPanel(scope: string, target: EventTarget | null, to?: string): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  const rapid = fading !== null || leaving !== null;
  fading?.();
  leaving = null;
  const sp = subPanelOf(scope, target);
  const root = sp?.find() ?? null;
  let alive = true;
  let raf = 0;
  let mo: MutationObserver | null = null;
  const queued: (() => void)[] = [];
  const hook = (fn: () => void) => { queued.push(fn); };
  /** 커밋 순간 할 일(P2 스크롤) — 복제본 자리를 정하기 **전에** 부른다. */
  const flush = () => { if (atCommit === hook) atCommit = null; queued.splice(0).forEach((f) => f()); };
  const cancel = () => {
    if (!alive) return;
    alive = false;
    mo?.disconnect();
    cancelAnimationFrame(raf);
    if (atCommit === hook) atCommit = null;
    // 커밋 없이 끝나면(연타·1.5s 안전망) 맡겨 둔 P2 스크롤은 종전처럼 다음 프레임에 — 버리지 않는다.
    queued.splice(0).forEach((f) => requestAnimationFrame(f));
    if (fading === cancel) fading = null;
  };
  const t = target instanceof Element ? target : null;
  const inEvent = !!(globalThis as { event?: Event }).event;
  const key0 = root ? shownPanes(root) : '';
  const keyed = key0 !== '';
  const skip = !root || rapid || INSTANT_SUB_SCOPES.has(scope) || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || (document.documentElement.hasAttribute('data-overlay') && !!root.closest('.tab-pane'))
    || (!keyed && !inEvent);
  // 레일이 판 **안**에 있으면(내 매장 단계 바) 누른 탭바(tablist)를 레일로 본다 — 그 위·그 자신은 복제본에서 잘라 살아 있는 알약이 보이게.
  const railIn = sp?.rail ?? (t && root?.contains(t) ? t.closest('[role="tablist"]') : null);
  // 재기 **먼저**, 스왑 정적화는 그 뒤 — html[data-tab-swap] 을 먼저 켜면 그 무효화로 문서 스타일 재계산(PC 내 매장 #2415 요소 ·
  //   CPU4 40~90ms)이 여기서 강제된다. 뒤에 켜면 커밋 뒤 한 번의 재계산에 합쳐진다(메인 탭 notePaneLeaving 도 같은 순서).
  let snap = skip ? null : snapSubPanel(root!, railIn);
  const foot = snap?.page ? visibleFooter() : null;
  holdSwap(cancel, t?.closest('button, a, [role="button"], [role="tab"]'));
  if (!root) { afterFirstFrame(releaseSwap); return; }
  const parent = root.parentElement;
  const rail = sp!.rail;
  /** 활성 판이 실제로 바뀌었는가(위 ①). */
  const paneSwapped = (): boolean => {
    if (!root.isConnected) return true;
    const k = shownPanes(root);
    return (!!to && k.split('|').includes(to)) || k !== key0;
  };
  // 커밋이 늦는 동안(전환·Suspense) 떠나는 판은 화면에 그대로라 사용자가 스크롤할 수 있다 — 커밋 직전 프레임의 자리를 쓴다.
  let y0 = window.scrollY;
  let yLast = y0;
  const track = () => {
    if (!alive) return;
    yLast = window.scrollY;
    raf = requestAnimationFrame(track);
  };
  raf = requestAnimationFrame(track);
  fading = cancel;
  atCommit = hook;
  // ② 식별자 없는 판 — 이벤트 태스크가 끝날 때까지 커밋(판 변화)이 없었으면 판 교체가 없던 것이다.
  if (!keyed && inEvent) afterEventTask(() => { if (alive) { flush(); cancel(); releaseSwap(); } });
  mo = new MutationObserver((recs) => {
    if (!alive) return;
    if (keyed) {
      if (!paneSwapped()) {
        // 커밋 전 떠나는 판의 변화(늦은 데이터·실시간) — 지금 모습으로 다시 복제한다(레일만 바뀌었으면 판 그림은 그대로다).
        if (snap && !(rail && recs.every((r) => rail.contains(r.target)))) {
          const s2 = snapSubPanel(root, railIn);
          if (s2) { snap = s2; y0 = yLast = window.scrollY; }
        }
        return;
      }
    } else if (rail && recs.every((r) => rail.contains(r.target))) return; // 레일만 바뀜 — 판 변화를 태스크 끝까지 기다린다
    flush(); // P2 스크롤 — 커밋과 같은 순간. 복제본 자리(yLast = 마지막으로 페인트된 스크롤)는 이 스크롤을 넣지 않는다(페인트된 적 없다)
    cancel();
    if (!snap || !parent?.isConnected) { afterFirstFrame(releaseSwap); return; }
    const s = snap;
    // 🔴 2026-10-02 오너 "쪽지함과 알림을 왔다갔다하면 드르륵 내려가는 모션" — 판을 자르는 그릇(내용 높이를 따라가는 뜨는 카드)이
    //   커밋에서 높이가 바뀌면, 이벤트 시점 모양의 복제본은 새 그릇과 맞지 않는다. fixed 라 그릇의 overflow 도 안 받는다:
    //   알림(8건)→쪽지(3건)에서 카드는 679→254px 로 줄었는데 알림 목록 복제본(619px)이 카드 밑으로 425px 늘어진 채 240ms 걷혔고,
    //   반대 방향은 커진 카드 아래 새 목록이 먼저 보이고 위만 겹쳐 걷혔다(390 · 프레임 실측). 이미 본 목록이다 — 한 프레임에 바꾼다.
    //   그릇이 그대로인 판(내 정보·약관 — 고정 높이 판, 지면 위 판)은 종전 그대로 떠나는 판이 선다.
    if (s.frame && Math.abs(s.frame.el.getBoundingClientRect().height - s.frame.h) > 0.5) { afterFirstFrame(releaseSwap); return; }
    const { el } = s;
    const dy = s.page ? yLast - y0 : 0;
    if (dy) el.style.setProperty('--leave-top', `${s.box.top - dy}px`);
    parent.insertBefore(el, root.parentNode === parent ? root.nextSibling : null);
    // 조상에 transform·filter 가 있으면(시트·모달) fixed 의 기준이 뷰포트가 아니다 — 붙인 뒤 어긋난 만큼 되돌린다.
    const q = el.getBoundingClientRect();
    const ox = q.left - s.box.left, oy = q.top - (s.box.top - dy);
    if (Math.abs(ox) > 0.5) el.style.setProperty('--leave-left', `${s.box.left - ox}px`);
    if (Math.abs(oy) > 0.5) el.style.setProperty('--leave-top', `${s.box.top - dy - oy}px`);
    for (const [x, st, sl] of s.scroll) { x.scrollTop = st; x.scrollLeft = sl; }
    for (const [o, c] of s.canvas) { try { c.getContext('2d')?.drawImage(o, 0, 0); } catch { /* 그리지 못하면 빈 칸 */ } }
    // 복제본 안에서 CSS 애니가 처음부터 다시 돈다(진입 페이드·스켈레톤·스크롤 리빌) — 원본이 이미 도달한 끝 상태로 세운다.
    for (const a of el.getAnimations({ subtree: true })) {
      try { if (a.timeline === document.timeline && Number.isFinite(Number(a.effect?.getComputedTiming().endTime))) a.finish(); else a.cancel(); } catch { a.cancel(); }
    }
    // 내용이 원본 자리인가(snapSubPanel 의 껍데기 마진 겹침) — 어긋난 만큼 판을 옮기고 자르는 선은 화면에 둔다.
    //   스크롤 복원·애니 정지 **뒤**에 잰다 — 판 자신이 스크롤 상자(내 정보)면 복원 전 기준점은 scrollTop 만큼 아래에 있고(앞에 두면 −200px 로
    //   끌려 올라갔다), 다시 돈 진입 애니(translate)가 기준점을 잠깐 옮겨 둔다.
    const ax = contentShift(s.anchors, dy);    if (Math.abs(ax) > 0.5) { el.style.setProperty('--leave-top', `${s.box.top - dy - oy - ax}px`); s.nudge(ax); }
    // 푸터 복제본은 메인 탭과 같은 자리(앱 셸 = 판(.tab-pane)의 부모)에 넣는다 — 푸터의 부모(.reveal)는 스크롤 리빌 transform 이라
    //   fixed 의 기준·쌓임 맥락이 바뀌어 복제본이 엉뚱한 자리·판 복제본 **아래**에 섰다(실측: 545 → 1120).
    const pane = root.closest('.tab-pane');
    const fc = foot?.el.isConnected && pane?.parentElement ? cloneFooter(foot, pane.parentElement, pane.nextSibling) : null;
    // 레일은 커밋 뒤에도 움직인다(섹션 스크롤 복원 → 헤더 접힘/펼침 → sticky 레일 이동 · 짧아진 문서의 scrollY 깎임) —
    //   복제본(z-35)이 레일(z-30)을 덮지 않게 걷힐 때까지 매 프레임 레일 밑으로 자른다(바뀔 때만 다시 쓴다).
    let lastRb: number | null = null;
    const follow = () => {
      if (!el.isConnected) return;
      const rb = railBottomOver(railIn, s.box);
      if (rb !== null && (lastRb === null || Math.abs(rb - lastRb) > 0.5)) { lastRb = rb; s.clipBelow(rb); }
      requestAnimationFrame(follow);
    };
    if (railIn) follow();
    fadeAfterFirstFrame(fc ? [el, fc] : [el], () => { el.remove(); fc?.remove(); }, () => sp!.find(), true);
  });
  mo.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  if (parent) mo.observe(parent, { childList: true });
  if (rail) mo.observe(rail, { childList: true, subtree: true, attributes: true, characterData: true });
}
