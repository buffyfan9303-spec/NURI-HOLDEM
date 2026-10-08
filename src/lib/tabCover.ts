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
//   🔴 되살리지 마라 — 판 위에 옛 판(또는 지면색 한 장)을 겹쳐 두고 걷는 방식은 길이와 상관없이 '겹침·상자' 를 만든다.
//     src/components/transitionDevices.contract.test.ts (d) 와 e2e/tab-instant-swap.spec.ts 가 잠근다.
// ─────────────────────────────────────────────────────────────────────────────
/** 헤더 계정 메뉴가 다른 화면을 열며 걷힐 때의 퇴장 길이·곡선(App AppHeader menuHandoff). 판 전환에는 더 이상 쓰지 않는다(8차). */
export const LEAVE_FADE_MS = 240;
export const LEAVE_EASE = 'cubic-bezier(.4,0,.2,1)';
/** 커밋이 끝내 안 오는 경우(같은 탭으로 되돌린 연타 등)에도 전환을 영원히 꺼 두지 않는 상한. */
const SWAP_GUARD_MS = 1500;

/** 커밋을 기다리는 하위 탭 판 교체를 끝낸다. 있으면 다음 이동은 연타다(새 이동이 이긴다). */
let pending: (() => void) | null = null;
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

/**
 * 메인 탭 커밋 **직전**(같은 이벤트 안, App commitTab)에 부른다 — 스왑 프레임 정적화를 켠다.
 * from === to 면(같은 배치에서 마지막 선택이 원래 탭) 정적화를 푼다.
 */
export function notePaneLeaving(from: string, to: string): void {
  if (typeof document === 'undefined') return;
  pending?.(); // 연타 — 커밋을 기다리던 하위 탭 교체는 버린다(연출보다 응답)
  if (from === to) { releaseSwap(); return; }
  holdSwap();
  // 도는 부드러운 스크롤(같은 탭 재탭 = 맨 위로 smooth)을 지금 자리에서 멈춘다 — 합성 스크롤 애니가 돌면 새 판 래스터를 안 기다린다.
  window.scrollTo({ top: window.scrollY, behavior: 'instant' as ScrollBehavior });
}

/** 메인 탭이 커밋된 layout effect(첫 페인트 전)에서 부른다 — 새 판 첫 프레임이 나간 **다음** 프레임에 정적화를 푼다. */
export function handOffPane(): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  afterFirstFrame(releaseSwap);
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
  holdSwap(cancel, t?.closest('button, a, [role="button"], [role="tab"]'));
  if (!root) { afterFirstFrame(releaseSwap); return; }
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
  if (!keyed && inEvent) afterEventTask(() => { if (alive) { flush(); cancel(); releaseSwap(); } });
  mo = new MutationObserver((recs) => {
    if (!alive) return;
    if (keyed) { if (!paneSwapped()) return; } // 커밋 전 떠나는 판의 변화(늦은 데이터·실시간)는 전환이 아니다
    else if (rail && recs.every((r) => rail.contains(r.target))) return; // 레일만 바뀜 — 판 변화를 태스크 끝까지 기다린다
    flush(); // P2 스크롤 — 커밋과 같은 순간(첫 페인트 전)
    cancel();
    afterFirstFrame(releaseSwap);
  });
  mo.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  if (root.parentElement) mo.observe(root.parentElement, { childList: true });
  if (rail) mo.observe(rail, { childList: true, subtree: true, attributes: true, characterData: true });
}
