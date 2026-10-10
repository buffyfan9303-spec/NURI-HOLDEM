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
    // 실제 내용과 같은 높이로 그린 뼈대(게시판 BoardListSkeleton)는 이미 완성된 모양이다 — 기다리면 떠나는 판 복제본만
    //   300ms 더 겹친다(audit8 M8-02: 557ms vs 242~287ms). 표식을 단 뼈대만 빠진다 — 다른 판의 스켈레톤 판정은 그대로다.
    if (el.closest('[data-stable-skeleton]')) continue;
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
// 8차 INSTANT-SWAP(오너 2026-10-08: "대메뉴·소메뉴 콘텐츠 이동이 너무 느리다, 블러 처리되며 이동하는데 그 와중에 뒤에 살짝 네모칸이 보인다.
//   다른 효과가 더 효과적이면 그렇게 해라") — **떠나는 판 퇴장 페이드(6·7차)를 걷었다. 판은 한 프레임에 바뀐다.**
//   원인(프로덕션 빌드 · 390×844 다크 · CDP 스크린캐스트 프레임 실측, 홈 → 커뮤니티):
//     떠나는 판(복제본)이 새 판 **위에** 고정으로 서서 0.999 → 0 으로 걷히는 동안(누른 뒤 ~20 → ~300ms, 18프레임) 두 판이 겹쳐 보였다.
//     겹친 글자·카드 테두리가 이중 노출로 번져 '블러' 로 읽혔고, 옛 판의 카드 상자(예: 홈 '예정된 대회가 없습니다' 카드)가 새 판 위에
//     반투명 '네모칸' 으로 남았다. 첫 방문은 새 판 준비까지 최대 300ms 를 더 붙잡았다 — '느리다' 의 정체.
//   어떤 길이·곡선으로 줄여도 '두 판이 겹치는 구간' 은 남는다(교차 페이드의 본질). 새 판에 opacity/transform 을 거는 진입 효과는
//     §0-a25 삼성 밝기 점프 부류라 쓰지 않는다(R3 계약). 그래서 Ant Design·Radix·MUI 탭처럼 **본문은 즉시 교체**,
//     움직이는 것은 탭 표시(SlidingPill 알약)뿐이다.
//   남긴 것: ① 스왑 프레임 정적화(holdSwap · releaseSwap) — 판 교체 프레임에 크롬 전환(합성 애니)이 돌면 새 판 타일이 래스터되기 전에
//     프레임이 나가 빠진 타일(다크=검정)이 보였다(6차 원인). 즉시 교체에서도 같은 위험이라 그대로 둔다. ② 하위 탭 P2 스크롤(alignSubTabPanel).
//   🔴 되살리지 마라 — 새 판 위에 **옛 판**(복제본·스냅샷)을 겹쳐 두고 걷는 방식은 길이와 상관없이 '겹침·상자' 를 만든다.
//     src/components/transitionDevices.contract.test.ts (d) 와 e2e/tab-instant-swap.spec.ts 가 잠근다.
//     (9차는 옛 판이 아니라 **내용 없는 지면색 막**을 반투명에서 걷는다 — 겹치는 글자·상자가 없다. 아래 9차 절.)
// ─────────────────────────────────────────────────────────────────────────────
/** 헤더 계정 메뉴가 다른 화면을 열며 걷힐 때의 퇴장 길이·곡선(App AppHeader menuHandoff). 판 전환에는 더 이상 쓰지 않는다(8차). */
export const LEAVE_FADE_MS = 240;
export const LEAVE_EASE = 'cubic-bezier(.4,0,.2,1)';
/** 커밋이 끝내 안 오는 경우(같은 탭으로 되돌린 연타 등)에도 전환을 영원히 꺼 두지 않는 상한. */
const SWAP_GUARD_MS = 1500;

// ─────────────────────────────────────────────────────────────────────────────
// 9차 PANE-FADE(오너 2026-10-09: "블러모션을 없애라고 했더니 너무 딱딱해졌어. 웹앱이 콘텐츠 이동할 때 이렇게 딱딱한게 어디있어") —
//   8차의 한 프레임 교체는 그대로 두고(떠나는 판 겹침 0), 새 판 **위**에 지면색 막 한 장을 **반투명(FADE_FROM)에서 시작해 곧바로** 걷는다.
//   새 판은 첫 프레임부터 보이고(0.45 만큼), 220ms 감속으로 또렷해진다 — '바로 바뀌는데 부드럽다'.
//   이력의 네 칸(새 판 효과=삼성 밝기 · 불투명 막 붙잡기=검정 깜빡임 · 떠나는 판 겹침=블러·네모칸 · 무효과=딱딱함) 중 안 써 본 칸이다
//   (분석: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit12\owner-1009b\motion-history.md ③).
//   · 5차 덮개와 다른 점: 1.0 이 아니라 0.55 에서 시작하고, 판 준비를 기다리지 않고, 붙잡지 않는다(≥0.5 는 많아야 2~3프레임).
//     운영 주입 실측: 0.6 → 빈 판 0·번쩍 지표 ≤6.5 / 0.85 → 빈 판 2프레임·번쩍 8.8(기준 8 초과). 그래서 시작값 상한 0.6.
//   · 막은 판의 **형제**(body 에 붙는 fixed 한 장)다 — 새 판·조상에는 여전히 opacity/transform 0(R3 · 삼성 밝기 점프 부류).
//   · 막은 **커밋 순간** 정지값으로 깔고(클릭 때 깔면 옛 판을 먼저 흐린다), 페이드는 **새 판 첫 프레임 다음**(releaseSwap 과 같은 콜백)에
//     시작한다 — 스왑 프레임에 합성 애니가 돌면 새 판 타일 래스터를 안 기다려 빠진 타일(다크=검정)이 나온다(6차 원인).
//   · 동작 줄이기 · 숨은 문서 · 전면 판(html[data-overlay]) 열림 · 앱 첫 마운트(이동이 아님)에는 막 0 — 8차 한 프레임 교체 그대로.
//   · 막은 **방금 누른 버튼이 든 줄**(하단바·하위 탭 레일·판 안 단계 알약)을 덮지 않는다(design-reviewer 2026-10-09 P2-1·P2-2 —
//     첫 판은 하단바와 내 매장 단계 알약까지 0.2초 절반 밝기로 흐렸다. 09-26 오너 "알약을 누르면 검정이 됐다가 다시 나온다" 와 같은 자리).
//     ① 막은 앱 셸(`[data-app-shell]`, relative z-1 — 쌓임 맥락) **안**에 붙는다. body 에 붙이면 셸 전체(z=1) 위라 셸 안 하단바(z-50)까지 덮었다.
//     ② 모바일 아래끝은 하단바 윗변(navTop). ③ 하위 탭은 누른 줄(pressRow)을 판에서 빼고 남은 쪽만 덮는다 — 레일이 판 **안**에 있어
//        subPanelOf 가 레일을 못 찾는 내 매장 단계 알약([data-mystore-rail] ⊂ [data-mystore-secpanel])도 여기서 잡힌다.
//     잠금: e2e/pane-fade-press-row.spec.ts(막 rect ∩ 누른 줄 = 0 · 누른 줄 밝기 하강).
//   · 연타 — 걷히는 중인 막이 있으면 지금 값에서 이어 걷는다(0.55 로 다시 깔면 탭마다 맥박 — 같은 판정 P3-2).
//   🔴 막 시작값을 0.6 위로 올리거나, 막을 판 준비까지 붙잡거나, 떠나는 판을 겹치지 마라 — 각각 5차·8차 증상이 돌아온다.
//     잠금: src/components/transitionDevices.contract.test.ts (d) · e2e/tab-instant-swap.spec.ts · e2e/pill-flash.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────
export const FADE_FROM = 0.4; // 10-09 22:40 0.55→0.4 — 반복 빛(SpotHeroSheen)이 지나가는 밝은 GTO 에서 홈으로 갈 때 0.55 막이 첫 프레임을 홈보다 8 어둡게 해 flicker-gate:133 이 걸렸다. 부드러움은 남기는 하한(계약 ≥0.4)
export const FADE_MS = 220;
export const FADE_EASE = 'cubic-bezier(.22,.61,.36,1)';
/** 걷기를 한 프레임(60Hz)만큼 진행한 자리에서 시작한다 — 아래 coverAt 주석. */
const FADE_LEAD_MS = 16;

type Rect = { top: number; left: number; width: number; bottom: number };
let fadeEl: HTMLElement | null = null;
let fadeGen = 0;
/** 메인 탭 이동이 시작됐다(notePaneLeaving) — 첫 마운트·같은 탭 재렌더의 handOffPane 은 막을 깔지 않는다. */
let mainArmed = false;

const SHELL = '[data-app-shell]';
/** 막을 붙일 자리 — 판과 같은 쌓임 맥락. 셸 안 판(메인 탭·그 안 하위 탭·셸 안 시트)은 셸, body 로 포털된 전면 판 안 하위 탭만 body.
 *  셸에 붙으면 z 는 셸 안에서 겨룬다 — 판 위(45)·헤더·하단바(z-50)·시트(z-55+) 아래. 옛 덮개 자리(5a3674d3^ App.tsx)와 같다. */
const hostFor = (el: Element | null): Element => (el ? el.closest(SHELL) : document.querySelector(SHELL)) ?? document.body;
const fadeNode = (host: Element): HTMLElement => {
  if (!fadeEl?.isConnected) {
    const d = document.createElement('div');
    d.setAttribute('aria-hidden', 'true');
    d.setAttribute('data-pane-fade', '');
    // will-change — 정지값으로 깔리는 커밋 프레임부터 막이 제 층이다. 걷기 시작 때 승격되면 그 순간 아래 판 전체를 막 없이 다시 래스터해야 한다.
    d.style.cssText = 'position:fixed;pointer-events:none;display:none;opacity:0;will-change:opacity;';
    fadeEl = d;
  }
  // fixed 라 셸의 흐름에 안 낀다(자식이 하나 늘어도 레이아웃 0). 다른 맥락의 판이면 그쪽으로 옮긴다.
  if (fadeEl.parentNode !== host) host.appendChild(fadeEl);
  return fadeEl;
};
const hideFade = (): void => {
  if (!fadeEl) return;
  fadeEl.getAnimations?.().forEach((a) => a.cancel());
  fadeEl.style.display = 'none';
};
const fadeOff = (): boolean => document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPc = (): boolean => window.matchMedia('(min-width: 1024px)').matches;

/**
 * 커밋 순간 — 막을 r 자리에 정지값(FADE_FROM)으로 깐다(애니가 아니다 — 스왑 프레임 래스터 대기를 깨지 않는다).
 * 돌려준 함수를 새 판 첫 프레임 **다음**에 부르면 FADE_MS 동안 0 으로 걷고 숨긴다. 새 이동이 오면(연타) 이전 막은 버린다.
 */
function coverAt(r: Rect | null, z: string, bg: string, host: Element): () => void {
  const my = ++fadeGen;
  // 연타 — 걷히는 중인 막(이전 이동)이 있으면 지금 값에서 이어 걷는다. 0.55 로 다시 깔면 0.3초 5탭에 막이 다섯 번 짙어졌다 옅어진다(맥박 — P3-2).
  //   다 걷힌(≤0.02) 막은 이어 갈 것이 없다 — 새 이동으로 FADE_FROM 부터.
  const cur = fadeEl?.isConnected && fadeEl.style.display !== 'none' ? Number(getComputedStyle(fadeEl).opacity) || 0 : 0;
  const from = cur > 0.02 ? Math.min(FADE_FROM, cur) : FADE_FROM;
  hideFade();
  if (!r || r.bottom - r.top < 1 || r.width < 1 || fadeOff()) return () => {};
  const el = fadeNode(host);
  const s = el.style;
  s.top = `${r.top}px`; s.left = `${r.left}px`; s.width = `${r.width}px`; s.height = `${r.bottom - r.top}px`;
  s.zIndex = z; s.background = bg; s.opacity = String(from); s.display = 'block';
  window.setTimeout(() => { if (my === fadeGen) hideFade(); }, SWAP_GUARD_MS); // 안전망 — rAF 가 멈춰도 막이 눌러앉지 않는다
  return () => {
    if (my !== fadeGen) return;
    if (typeof el.animate !== 'function') { hideFade(); return; }
    s.opacity = '0'; // 애니가 끝난 프레임에 정지값(FADE_FROM)으로 되돌아 번쩍이지 않게 — 도는 동안은 애니가 이긴다
    // delay −FADE_LEAD_MS — 첫 걷기 프레임이 정지값(FADE_FROM)을 한 번 더 그리지 않게 한 프레임만큼 진행한 자리에서 시작한다
    //   (막 ≥0.5 = 커밋 프레임 하나. CPU 4배 실측에서 시작 프레임까지 세면 4프레임이 나와 A5(≤3)를 넘었다).
    const a = el.animate([{ opacity: from }, { opacity: 0 }], { duration: FADE_MS, easing: FADE_EASE, delay: -FADE_LEAD_MS });
    a.onfinish = () => { if (my === fadeGen) hideFade(); };
  };
}

/**
 * 모바일 하단바 윗변 — 막 아래끝 상한(방금 누른 탭이 든 줄을 덮지 않는다). 하단바가 그 자리에 **실제로 그려질 때만** —
 * 없음(PC lg:hidden)·자동 숨김(화면 밖)·전면 판이 그 위를 덮음(히트 테스트가 하단바가 아님)이면 Infinity(그 판은 끝까지 덮는다).
 * 막은 pointer-events:none 이라 히트 테스트에 안 걸린다.
 */
function navTop(): number {
  const nav = document.querySelector('nav[aria-label="하단 내비게이션"]');
  if (!nav) return Infinity;
  const q = nav.getBoundingClientRect();
  if (q.height < 1 || q.top >= window.innerHeight) return Infinity;
  const hit = document.elementFromPoint(q.left + q.width / 2, Math.min(q.bottom, window.innerHeight) - 2);
  return hit && nav.contains(hit) ? q.top : Infinity;
}
/** 메인 탭 막 자리 — 모바일: 헤더 밑 전폭 ~ 하단바 위 · PC: GNB 밑 · 콘텐츠 열 폭 · 판 아래끝까지(좌우 채움·푸터는 안 덮는다 — 2026-09-19 '좌우 깜빡'). */
function mainRect(): Rect | null {
  if (document.documentElement.hasAttribute('data-overlay')) return null;
  const p = [...document.querySelectorAll<HTMLElement>('.tab-pane')].find((e) => e.style.display !== 'none' && e.getClientRects().length > 0);
  if (!p) return null;
  const bottomOf = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().bottom ?? 0;
  const top = Math.max(0, bottomOf('[data-stack-header]'), isPc() ? bottomOf('[data-stack-tabbar]') : 0);
  if (!isPc()) return { top, left: 0, width: window.innerWidth, bottom: Math.min(window.innerHeight, navTop()) };
  const r = p.getBoundingClientRect();
  return { top, left: r.left, width: r.width, bottom: Math.min(window.innerHeight, Math.max(r.bottom, top)) };
}
/**
 * 방금 누른 버튼이 든 줄 — 누른 요소에서 위로 올라가며 **한 줄**(높이 ≤ 누른 요소의 1.75배+8)·**한 열**(폭 ≤ 1.75배+8)로 남는 동안 넓힌 상자 중 큰 쪽.
 * 판(root)이나 판을 품은 조상 앞에서 멈춘다. 커밋 뒤 안 보이면(떠난 판 안의 바로가기 버튼) 줄이 아니다 — null.
 * 예: 내 매장 단계 알약(32~44px 칸) → tablist → [data-mystore-rail](46~50px) 까지가 한 줄이고, 단계 머리를 품은 래퍼에서 멈춘다.
 */
function pressRow(press: Element | null, root: Element): DOMRect | null {
  if (!press?.isConnected || press.getClientRects().length === 0) return null;
  const p = press.getBoundingClientRect();
  let row = p, col = p, inRow = true, inCol = true;
  for (let n = press.parentElement; n && n !== root && !n.contains(root) && (inRow || inCol); n = n.parentElement) {
    const q = n.getBoundingClientRect();
    if (inRow) { if (q.height <= p.height * 1.75 + 8) row = q; else inRow = false; }
    if (inCol) { if (q.width <= p.width * 1.75 + 8) col = q; else inCol = false; }
  }
  return row.width * row.height >= col.width * col.height ? row : col;
}
/** r 에서 줄 q 를 뺀 네 쪽(아래·위·오른쪽·왼쪽) 중 가장 넓은 쪽 — 판 맨 위 가로 레일이면 그 아래, 판 옆 세로 열이면 그 옆. 안 겹치면 r 그대로. */
function clipOut(r: Rect, q: DOMRect | null): Rect | null {
  const right = r.left + r.width;
  if (!q || q.right <= r.left || q.left >= right || q.bottom <= r.top || q.top >= r.bottom) return r;
  const area = (x: Rect) => Math.max(0, x.width) * Math.max(0, x.bottom - x.top);
  const best = [
    { ...r, top: q.bottom },
    { ...r, bottom: q.top },
    { ...r, left: q.right, width: right - q.right },
    { ...r, width: q.left - r.left },
  ].reduce((a, b) => (area(b) > area(a) ? b : a));
  return area(best) < 1 ? null : best;
}
/** 하위 탭 막 자리 — 판의 화면 영역만(레일·누른 줄·헤더·PC GNB·하단바·판을 품은 스크롤 상자 밖은 안 덮는다). 옛 하위 덮개(5a3674d3^)의 자리 규칙. */
function subRect(sp: { rail: Element | null }, root: Element, press: Element | null): Rect | null {
  const r = root.getBoundingClientRect();
  const sc = scroller(root);
  const box = sc?.getBoundingClientRect();
  const bottomOf = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().bottom ?? 0;
  let top = box ? box.top : Math.max(bottomOf('[data-stack-header]'), isPc() ? bottomOf('[data-stack-tabbar]') : 0);
  // 판 **위**에 가로로 걸친 레일만 윗변을 민다 — 판 옆에 선 PC 세로 사이드바는 가로로 안 겹치니 무시(alignSubTabPanel 과 같은 판정).
  const q = sp.rail?.isConnected ? sp.rail.getBoundingClientRect() : null;
  if (q && q.right > r.left && q.left < r.right) top = Math.max(top, q.bottom);
  top = Math.max(top, r.top);
  const bottom = Math.min(window.innerHeight, box ? box.bottom : Infinity, r.bottom, navTop());
  // 레일이 판 **안**이면(내 매장 단계 알약 · 설정 하위 탭) 위 레일 판정에 안 걸린다 — 누른 줄을 직접 뺀다(P2-2).
  return bottom - top < 1 ? null : clipOut({ top, left: r.left, width: r.width, bottom }, pressRow(press, root));
}
/** 판이 속한 전면 화면(fixed 오버레이)의 z-index — 막이 그 위·그 영역에만 깔리게. 없으면 메인 막과 같은 45. */
function zFor(el: Element): string {
  let z = '45';
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.position === 'fixed' && cs.zIndex !== 'auto') z = cs.zIndex; // 가장 바깥 fixed 가 층을 정한다
  }
  return z;
}
/** 판 뒤로 실제로 보이는 불투명 배경색 — 막이 그 색이어야 '반투명 지면 → 내용' 이 한 장으로 풀린다(시트 안 판은 시트 색). */
function bgFor(el: Element): string {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(n).backgroundColor);
    if (m) { const a = m[1].split(/[ ,/]+/).filter(Boolean); if (a.length < 4 || Number(a[3]) >= 1) return `rgb(${a.slice(0, 3).join(',')})`; }
  }
  return 'rgb(var(--surface-base))';
}

/** 커밋을 기다리는 하위 탭 판 교체를 끝낸다. 있으면 다음 이동은 연타다(새 이동이 이긴다). */
let pending: (() => void) | null = null;
let swapTimer = 0;
/** 스왑 동안 전환을 끄는 상시 크롬(index.css [data-swap-freeze]) — 하단바·헤더·PC GNB·맨 위로 FAB. 하위 탭은 누른 버튼도 더한다
 *  (전역 button 프레스의 opacity·transform 0.2s 복귀가 스왑 프레임에 돈다). */
const FREEZE = 'nav[aria-label="하단 내비게이션"], [data-stack-header], [data-stack-tabbar], .scroll-top-fab';

/** holdSwap 이 세운 비행 중 밑줄 — 세우기 전 inline 전환·목표값과 세운 값. releaseSwap 이 그 목표로 다시 띄운다(SAMEKEY-1010). */
const pinned = new Map<HTMLElement, { transition: string; before: [string, string][]; at: [string, string][] }>();

/** holdSwap 세대 — 새 hold 마다 올라간다. 예약된 해제(rAF·타이머)는 자기 세대를 들고 있어 새 hold 가 시작된 뒤에는 아무것도 건드리지 않는다(STALE-RELEASE). */
let swapGen = 0;

/** gen 없이 부르면 강제 해제(연타·같은 탭 복귀) — 예약된 옛 해제도 함께 무효로 만든다. */
function releaseSwap(gen?: number): void {
  if (gen !== undefined && gen !== swapGen) return;
  swapGen++;
  if (swapTimer) { clearTimeout(swapTimer); swapTimer = 0; }
  document.documentElement.removeAttribute('data-tab-swap');
  document.querySelectorAll('[data-swap-freeze]').forEach((e) => e.removeAttribute('data-swap-freeze'));
  // 세운 밑줄을 세우기 전 목표로 다시 띄운다 — 같은 대메뉴 안 하위 탭(activeKey 불변)은 SlidingPill 이펙트가 안 돌아 아무도 안 풀었고,
  //   자기교정 verify 가 '어긋남' 으로 보고 목표로 순간이동시켰다(실측 103px/1프레임). 세운 값이 그대로일 때만 — 그사이 SlidingPill 이
  //   다시 썼으면(재측정·리사이즈) 그쪽이 주인이다. 대메뉴 이동은 이어서 SlidingPill flip 이 지금 자리에서 새 목표로 덮는다.
  pinned.forEach((p, el) => {
    el.removeAttribute('data-swap-pinned');
    if (!el.isConnected || el.style.transition !== 'none' || p.at.some(([k, v]) => el.style.getPropertyValue(k) !== v)) return;
    el.style.transition = p.transition;
    p.before.forEach(([k, v]) => el.style.setProperty(k, v));
  });
  pinned.clear();
}
/** 스왑 프레임 정적화를 켠다 — 커밋이 끝내 안 와도 SWAP_GUARD_MS 뒤엔 푼다(onGuard 로 기다리던 것도 버린다). */
function holdSwap(onGuard?: () => void, press?: Element | null): number {
  const gen = ++swapGen;
  // 비행 중인 [data-swap-pin](PC 대메뉴 스프링 밑줄)은 동결 표식보다 먼저 지금 그려진 행렬에 세운다 — 동결이 전환을 취소하면 목표로 튄다(RAPID-1010).
  document.querySelectorAll<HTMLElement>('[data-swap-pin]').forEach((el) => {
    const props = (el.getAnimations?.() ?? []).map((a) => (a as CSSTransition).transitionProperty).filter(Boolean);
    if (!props.length) return;
    const cs = getComputedStyle(el);
    const now = props.map((p) => [p, cs.getPropertyValue(p)] as [string, string]);
    if (!pinned.has(el)) pinned.set(el, { transition: el.style.transition, before: props.map((p) => [p, el.style.getPropertyValue(p)]), at: now });
    el.style.transition = 'none';
    now.forEach(([p, v]) => el.style.setProperty(p, v));
    pinned.get(el)!.at = now.map(([p]) => [p, el.style.getPropertyValue(p)]);
    el.setAttribute('data-swap-pinned', '');
  });
  document.documentElement.setAttribute('data-tab-swap', '');
  document.querySelectorAll(FREEZE).forEach((e) => e.setAttribute('data-swap-freeze', ''));
  press?.setAttribute('data-swap-freeze', '');
  if (swapTimer) clearTimeout(swapTimer);
  swapTimer = window.setTimeout(() => { if (gen !== swapGen) return; swapTimer = 0; onGuard?.(); releaseSwap(gen); }, SWAP_GUARD_MS);
  return gen;
}
const afterFirstFrame = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));

/**
 * 메인 탭 커밋 **직전**(같은 이벤트 안, App commitTab)에 부른다 — 스왑 프레임 정적화를 켠다.
 * from === to 면(같은 배치에서 마지막 선택이 원래 탭) 정적화를 푼다.
 */
export function notePaneLeaving(from: string, to: string): void {
  if (typeof document === 'undefined') return;
  pending?.(); // 연타 — 커밋을 기다리던 하위 탭 교체는 버린다(연출보다 응답)
  if (from === to) { mainArmed = false; releaseSwap(); return; }
  mainArmed = true;
  holdSwap();
  // 도는 부드러운 스크롤(같은 탭 재탭 = 맨 위로 smooth)을 지금 자리에서 멈춘다 — 합성 스크롤 애니가 돌면 새 판 래스터를 안 기다린다.
  window.scrollTo({ top: window.scrollY, behavior: 'instant' as ScrollBehavior });
}

/**
 * 메인 탭이 커밋된 layout effect(첫 페인트 전)에서 부른다 — 새 판 첫 프레임이 나간 **다음** 프레임에 정적화를 푼다.
 * 9차: 이동(notePaneLeaving 이 켠 것)이면 첫 rAF(같은 layout effect 의 맨 위 스크롤·헤더 반영 뒤 · 첫 페인트 전)에 막을 정지값으로 깔고,
 *   정적화를 푸는 같은 콜백에서 걷기 시작한다.
 */
export function handOffPane(): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  const armed = mainArmed;
  mainArmed = false;
  const gen = swapGen; // 이 이동의 hold(notePaneLeaving) 세대 — 둘째 rAF 에서 그사이 새 hold 가 시작됐으면 풀지 않는다
  if (armed) fadeGen++; // 연타 — 아직 걷기를 시작 안 한 이전 막은 지금 버린다(다음 rAF 에서 이 이동의 막이 덮는다)
  let fadeOut = () => {};
  requestAnimationFrame(() => {
    if (armed) fadeOut = coverAt(mainRect(), '45', 'rgb(var(--surface-base))', hostFor(null));
    requestAnimationFrame(() => { releaseSwap(gen); fadeOut(); });
  });
}

/**
 * M3-02(2026-10-04) — 숨은 keep-alive 판(display:none)을 **한 번** 화면 밖에서 배치했다가 즉시 되돌린다(App 프리마운트 idle 이 부른다).
 * 왜: 첫 진입의 긴 프레임은 판 배치가 아니라 그 판이 처음 쓰는 글꼴 조합(서브셋 × 굵기 × 크기)의 인스턴스 생성이었다
 *   (CPU4 트레이스 GTO→캘린더: 클릭 처리 안 Layout 514ms 중 FontDataManager::onMakeFromStreamArgs 314ms · 재방문 Layout 15ms).
 *   글꼴 캐시는 문서 전역이라 여기서 치르면 탭을 누른 프레임에서 빠진다(같은 폭 → 같은 줄바꿈·컨테이너 쿼리 → 같은 크기 조합).
 * 같은 동기 작업 안에서 켰다 끄므로 페인트·ResizeObserver·IntersectionObserver·rAF 는 아무것도 못 본다(렌더 단계 전에 원복).
 *   React 가 쥔 inline style(display:none)은 cssText 를 통째로 되돌려 바이트까지 그대로다.
 * 반환: 'done' = 배치했다 · 'skip' = 필요 없다(보이는 중 — 이미 배치돼 있다) ·
 *   'later' = 지금은 못 한다(판이 아직 마운트 전 · 판 교체 중(html[data-tab-swap] — 하위 탭 MutationObserver 가 style 변화를 본다) · 숨은 문서).
 *   ⚠ 'later' 를 버리면 안 된다 — 프리마운트는 startTransition 이라 마지막 판(캘린더)이 idle 보다 늦게 커밋돼 영영 안 데워졌다(하네스 실측).
 */
export function warmHiddenPane(tab: string): 'done' | 'skip' | 'later' {
  if (typeof document === 'undefined') return 'skip';
  if (document.hidden || document.documentElement.hasAttribute('data-tab-swap')) return 'later';
  const el = document.querySelector<HTMLElement>(`.tab-pane[data-tab="${tab}"]`);
  if (!el) return 'later';
  if (el.style.display !== 'none') return 'skip';
  const ref = [...document.querySelectorAll<HTMLElement>('.tab-pane')].find((p) => p.style.display !== 'none');
  const w = ref?.offsetWidth || el.parentElement?.clientWidth || window.innerWidth;
  const prev = el.style.cssText;
  el.style.cssText = `${prev};display:block;position:fixed;top:0;left:0;width:${w}px;visibility:hidden;pointer-events:none;z-index:-1`;
  void el.offsetHeight;
  el.style.cssText = prev;
  return 'done';
}

// ── 하위 탭 커밋 판정(2026-09-27 COMMIT-SIGNAL) ──────────────────────────────────
// 하위 탭(goSubTab 한 입구)도 메인 탭과 같은 장치다: 스왑 프레임 정적화 → 커밋 → 새 판 첫 프레임 다음에 해제. 커밋 순간에 P2 스크롤을 맞춘다.
// 커밋은 **활성 판이 실제로 바뀐 신호**로만 본다(떠나는 판에 늦은 데이터가 와도 속지 않는다):
//   ① 판 식별자가 있는 판(keep-alive — 판마다 [data-pane]=id, 숨김은 인라인 display:none. 내 매장) — 목적지([data-pane=to])가 보이거나
//      보이는 판 목록이 바뀐 배치. 전환(startTransition)·Suspense 로 커밋이 늦어도 기다린다.
//   ② 식별자가 없는 판(조건부 마운트 — 나머지 전부) — React 는 이산 이벤트(탭·클릭·키)의 상태 변경을 **같은 태스크의 마이크로태스크**에서
//      동기 반영한다. 그러니 이벤트 태스크 안에 온 판 변화만 커밋이다. 태스크가 끝날 때까지 판이 안 바뀌었으면 판 교체가 없던 것이다.
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
  pending?.();
  const sp = subPanelOf(scope, target);
  const root = sp?.find() ?? null;
  let alive = true;
  let mo: MutationObserver | null = null;
  const queued: (() => void)[] = [];
  const hook = (fn: () => void) => { queued.push(fn); };
  /** 커밋 순간 할 일(P2 스크롤). */
  const flush = () => { if (atCommit === hook) atCommit = null; queued.splice(0).forEach((f) => f()); };
  const cancel = () => {
    if (!alive) return;
    alive = false;
    mo?.disconnect();
    if (atCommit === hook) atCommit = null;
    // 커밋 없이 끝나면(연타·1.5s 안전망) 맡겨 둔 P2 스크롤은 종전처럼 다음 프레임에 — 버리지 않는다.
    queued.splice(0).forEach((f) => requestAnimationFrame(f));
    if (pending === cancel) pending = null;
  };
  const t = target instanceof Element ? target : null;
  const inEvent = !!(globalThis as { event?: Event }).event;
  const press = t?.closest('button, a, [role="button"], [role="tab"]') ?? null;
  const gen = holdSwap(cancel, press);
  if (!root) { afterFirstFrame(() => releaseSwap(gen)); return; }
  const key0 = shownPanes(root);
  const keyed = key0 !== '';
  const rail = sp!.rail;
  /** 활성 판이 실제로 바뀌었는가(위 ①). */
  const paneSwapped = (): boolean => {
    if (!root.isConnected) return true;
    const k = shownPanes(root);
    return (!!to && k.split('|').includes(to)) || k !== key0;
  };
  pending = cancel;
  atCommit = hook;
  // ② 식별자 없는 판 — 이벤트 태스크가 끝날 때까지 커밋(판 변화)이 없었으면 판 교체가 없던 것이다.
  if (!keyed && inEvent) afterEventTask(() => { if (alive) { flush(); cancel(); releaseSwap(gen); } });
  mo = new MutationObserver((recs) => {
    if (!alive) return;
    if (keyed) { if (!paneSwapped()) return; } // 커밋 전 떠나는 판의 변화(늦은 데이터·실시간)는 전환이 아니다
    else if (rail && recs.every((r) => rail.contains(r.target))) return; // 레일만 바뀜 — 판 변화를 태스크 끝까지 기다린다
    flush(); // P2 스크롤 — 커밋과 같은 순간(첫 페인트 전)
    cancel();
    const fadeOut = coverAt(subRect(sp!, root, press), zFor(root), bgFor(root), hostFor(root)); // 9차 — 커밋 순간 막(P2 스크롤 뒤 자리 · 누른 줄 제외)
    afterFirstFrame(() => { releaseSwap(gen); fadeOut(); });
  });
  mo.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  if (root.parentElement) mo.observe(root.parentElement, { childList: true });
  if (rail) mo.observe(rail, { childList: true, subtree: true, attributes: true, characterData: true });
}
