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
};
/** 자기 스크롤 정책(섹션별 복원 — CommunityTab)이 있는 scope. 공용 스크롤 맞춤을 하지 않는다(이중 적용 금지). */
export const OWN_SCROLL_SCOPES: ReadonlySet<string> = new Set(['community-sec']);

const scroller = (el: Element): HTMLElement | null => {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null; // 창(window)
};
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
  const sel = SUB_PANEL[scope];
  if (!sel) return;
  const t = target instanceof Element ? target : null;
  // 레일 = 누른 요소의 조상 중, 부모가 판을 품는 첫 줄기(판의 형제). 판 안의 버튼(대시보드 바로가기 등)이면 레일 없음.
  let rail: Element | null = null;
  if (t) {
    for (let n: Element | null = t; n && n.parentElement; n = n.parentElement) {
      if (n.matches(sel) || n.querySelector(sel)) break;
      if (n.parentElement.querySelector(sel)) { rail = n; break; }
    }
  }
  const anchor: Element | null = rail ?? t;
  const find = (): Element | null => {
    for (let n: Element | null = anchor?.isConnected ? anchor.parentElement : null; n; n = n.parentElement) {
      const hit = [...n.querySelectorAll(sel)].find((e) => e.getClientRects().length > 0);
      if (hit) return hit;
    }
    return [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length > 0) ?? null;
  };
  requestAnimationFrame(() => {
    const root = find();
    if (!root) return;
    const own = root as HTMLElement;
    const oy = getComputedStyle(own).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && own.scrollTop > 0) { own.scrollTop = 0; return; }
    if (!rail?.isConnected) return;
    const d = root.getBoundingClientRect().top - rail.getBoundingClientRect().bottom;
    if (d >= -1) return;
    const sc = scroller(root);
    if (sc) sc.scrollTop += d;
    else { markProgrammaticScroll(); window.scrollTo({ top: Math.max(0, window.scrollY + d), behavior: 'instant' as ScrollBehavior }); notifyScrollNow(window.scrollY); }
  });
}

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
const LEAVE_FADE_MS = 240;
const FIRST_VISIT_HOLD_MAX_MS = 300;
/** 커밋이 끝내 안 오는 경우(같은 탭으로 되돌린 연타 등)에도 전환을 영원히 꺼 두지 않는 상한. */
const SWAP_GUARD_MS = 1500;

type Box = { top: number; left: number; width: number };
/** foot = 떠나기 직전 화면에 걸쳐 있던 사업자 푸터(판 밖 형제라 새 판 아래로 내려간다 — 그 자리를 복제본이 지킨다). */
type Leaving = { tab: string; el: HTMLElement; box: Box; foot: { el: HTMLElement; box: Box } | null; skip: boolean; first: boolean };
let leaving: Leaving | null = null;
let fading: (() => void) | null = null;
let swapTimer = 0;

function releaseSwap(): void {
  if (swapTimer) { clearTimeout(swapTimer); swapTimer = 0; }
  document.documentElement.removeAttribute('data-tab-swap');
}

/**
 * 메인 탭 커밋 **직전**(같은 이벤트 안, App commitTab)에 부른다 — 떠나는 판의 화면 자리를 적고 스왑 프레임 정적화를 켠다.
 * from === to 면(같은 배치에서 마지막 선택이 원래 탭) 적어 둔 것을 버린다. first = 목적지 첫 방문(lazy·스켈레톤 — 준비까지 붙잡는다).
 */
export function notePaneLeaving(from: string, to: string, first = false): void {
  if (typeof document === 'undefined') return;
  // 연타 = 도는 퇴장이 있거나(fading) **아직 커밋 전인 앞선 탭**이 있다(leaving) — 후자를 빠뜨리면 70~150ms 연타에서
  //   페이드가 두 번 나가고 빠진 타일이 4프레임 났다(design-reviewer 실측). 둘 다 페이드 없이 한 프레임 교체.
  const rapid = fading !== null || leaving !== null;
  fading?.(); // 연타 — 도는 퇴장은 즉시 끝낸다(연출보다 응답)
  leaving = null;
  if (from === to) { releaseSwap(); return; }
  document.documentElement.setAttribute('data-tab-swap', '');
  if (swapTimer) clearTimeout(swapTimer);
  swapTimer = window.setTimeout(() => { leaving = null; releaseSwap(); }, SWAP_GUARD_MS);
  // 도는 부드러운 스크롤(같은 탭 재탭 = 맨 위로 smooth)을 지금 자리에서 멈춘다 — 합성 스크롤 애니가 돌면 새 판 래스터를 안 기다리고,
  //   떠나는 판도 커밋 전까지 계속 움직여 적어 둔 자리와 어긋난다(design-reviewer 연타 실측: 자리 어긋남 80~710px · 빠진 타일 4).
  window.scrollTo({ top: window.scrollY, behavior: 'instant' as ScrollBehavior });
  const el = document.querySelector<HTMLElement>(`.tab-pane[data-tab="${from}"]`);
  if (!el || el.getClientRects().length === 0) return;
  const box = (e: Element): Box => { const r = e.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width }; };
  // 이벤트 시점 — 레이아웃이 깨끗해 강제 레이아웃 비용이 없다
  const footEl = document.querySelector<HTMLElement>('footer');
  const fr = footEl?.getBoundingClientRect();
  leaving = {
    tab: from, el, box: box(el), first,
    foot: footEl && fr && fr.bottom > 0 && fr.top < window.innerHeight ? { el: footEl, box: box(footEl) } : null,
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
  const afterFirstFrame = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));
  if (!l || l.tab === to || !l.el.isConnected || l.skip) { afterFirstFrame(releaseSwap); return; }
  const el = l.el;
  const place = (e: HTMLElement, b: Box) => {
    e.style.setProperty('--leave-top', `${b.top}px`);
    e.style.setProperty('--leave-left', `${b.left}px`);
    e.style.setProperty('--leave-width', `${b.width}px`);
    e.setAttribute('data-pane-leaving', '');
  };
  place(el, l.box);
  // 푸터는 판 밖 형제라 새 판을 따라 내려간다 — 떠나기 직전 자리를 **복제본**이 지킨다(없으면 그 자리가 첫 프레임에 새 판으로 컷된다).
  //   판과 같은 부모(앱 셸) 안에 넣어 같은 쌓임 맥락에 둔다 — body 에 붙이면 헤더·하단바(셸 안 z-50) 위로 올라간다.
  //   복제본은 입력·보조기술·스냅샷 이름에서 뺀다(같은 이름 둘이면 진행 중 View Transition 이 통째로 실패한다).
  let clone: HTMLElement | null = null;
  if (l.foot?.el.isConnected && el.parentElement) {
    clone = l.foot.el.cloneNode(true) as HTMLElement;
    clone.setAttribute('aria-hidden', 'true');
    clone.inert = true;
    clone.style.viewTransitionName = 'none';
    place(clone, l.foot.box);
    el.parentElement.insertBefore(clone, el.nextSibling);
  }
  const parts = clone ? [el, clone] : [el];
  let alive = true;
  let anims: Animation[] = [];
  let stopWait = () => {};
  const stop = () => {
    if (!alive) return;
    alive = false;
    stopWait();
    el.removeAttribute('data-pane-leaving'); // React 가 준 display:none 이 그대로 다시 이긴다
    el.style.removeProperty('--leave-top');
    el.style.removeProperty('--leave-left');
    el.style.removeProperty('--leave-width');
    clone?.remove();
    anims.forEach((a) => a.cancel());
    if (fading === stop) fading = null;
  };
  fading = stop;
  const fade = () => {
    if (!alive) return;
    anims = parts.map((p) => p.animate([{ opacity: 0.999 }, { opacity: 0 }], { duration: LEAVE_FADE_MS, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }));
    anims[0].finished.then(stop, () => {});
  };
  afterFirstFrame(() => {
    releaseSwap();
    if (!alive) return;
    // 재방문은 이미 그려진 판이다 — 판 안의 새로고침 표시(aria-busy)를 기다리며 붙잡지 않는다(실측: 라이브 재방문이 300ms 늦게 보였다).
    const dest = () => document.querySelector(`.tab-pane[data-tab="${to}"]`);
    if (!l.first || isSettled(dest())) fade();
    else stopWait = waitSettled(dest, fade, undefined, false, FIRST_VISIT_HOLD_MAX_MS);
  });
}
