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
// 기기별 스위치(localStorage 'nuri:fx'): `?fx=off` 로 이 기기만 끈다, `?fx=tabsoft` 는 켬을 명시 저장.
//   전체 끄기는 TAB_COVER_DEFAULT_ON 한 줄을 false 로. 이 스위치 하나가 메인 탭·하위 탭 덮개를 함께 켜고 끈다(4차).

import { markProgrammaticScroll, notifyScrollNow } from './useScrollY';

/** 전체 기본값 — 2026-09-24 리드 결정으로 켬(tabsoft). */
export const TAB_COVER_DEFAULT_ON = true;
export const TAB_COVER_STORAGE_KEY = 'nuri:fx';
export const TAB_COVER_MS = 280;
/** 목적지 판을 기다리는 상한 — 넘으면 준비 여부와 상관없이 걷는다. */
export const TAB_COVER_WAIT_MAX_MS = 700;
const SOFT = 'cubic-bezier(0.22, 0.61, 0.36, 1)'; // 감속 꼬리가 긴 곡선
const SOFT_HOLD_MS = 50;

const isSwitch = (v: string | null): v is 'tabsoft' | 'off' => v === 'tabsoft' || v === 'off';

/** URL 의 fx 값과 저장값으로 **새 저장값**을 정한다. 'tabsoft' | 'off' | null(미지정). 그 밖의 값(지운 'tabfade' 포함)은 무시. */
export function nextTabCoverValue(search: string, stored: string | null): string | null {
  const fx = new URLSearchParams(search).get('fx');
  if (isSwitch(fx)) return fx;
  return isSwitch(stored) ? stored : null;
}

/** 저장값 → 이 기기에서 켜짐 여부. 미지정은 기본값을 따른다. */
export function tabCoverOnFor(value: string | null, defaultOn = TAB_COVER_DEFAULT_ON): boolean {
  return value === 'tabsoft' || (defaultOn && value !== 'off');
}

/** 키프레임(순수) — 첫 키프레임은 언제나 opacity 1(전면을 덮은 상태, K-07). opacity 외 속성은 쓰지 않는다. */
export function tabCoverKeyframes(): Keyframe[] {
  return [{ opacity: 1 }, { opacity: 0.96, offset: SOFT_HOLD_MS / TAB_COVER_MS, easing: SOFT }, { opacity: 0 }];
}

let cached: boolean | null = null;
/** 이 기기에서 켜짐 여부. 첫 호출에서 URL 을 읽고 저장한다 — App 마운트 때 한 번 불러 두어라
 *  (그 뒤 딥링크 처리가 query 를 정리해도 결과가 같다). 저장소가 막힌 브라우저는 URL 값만 쓴다. */
export function isTabCoverOn(): boolean {
  if (cached !== null) return cached;
  let stored: string | null = null;
  try { stored = localStorage.getItem(TAB_COVER_STORAGE_KEY); } catch { /* 프라이빗·차단 */ }
  const next = nextTabCoverValue(typeof location === 'undefined' ? '' : location.search, stored);
  if (next !== stored) {
    try {
      if (next === null) localStorage.removeItem(TAB_COVER_STORAGE_KEY);
      else localStorage.setItem(TAB_COVER_STORAGE_KEY, next);
    } catch { /* 저장 실패 = 이번 세션만 */ }
  }
  cached = tabCoverOnFor(next);
  return cached;
}
/** 테스트 전용. */
export function resetTabCoverCache(): void { cached = null; }

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
 * 판(root)이 **준비될 때까지** rAF 로 기다렸다가 onReady 를 한 번 부른다 — 덮개 걷기와 판 높이 예약 해제
 * (VenueManageTab S6)가 같은 판정·같은 상한을 쓴다(MOTION-UNIFY: "한 곳을 고치면 전부 따라온다").
 * 준비 = isSettled(root) 이고 root 높이가 **두 프레임 연속** 같다. 상한 TAB_COVER_WAIT_MAX_MS 를 넘으면 그래도 부른다.
 * onFrame 은 매 프레임 판정 전에 불린다(덮개 자리 맞춤). whole 은 isSettled 와 같다. 돌려준 함수로 취소한다(연타·언마운트).
 */
export function waitSettled(root: () => Element | null, onReady: () => void, onFrame?: () => void, whole = false): () => void {
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
    if (!ready && performance.now() - t0 < TAB_COVER_WAIT_MAX_MS) { requestAnimationFrame(tick); return; }
    alive = false;
    onReady();
  };
  requestAnimationFrame(tick);
  return () => { alive = false; }; // 다음 프레임에 tick 이 alive 를 보고 멈춘다
}

const runs = new WeakMap<HTMLElement, number>();
const waits = new WeakMap<HTMLElement, () => void>();
type Rect = { top: number; left: number; width: number; bottom: number };
/**
 * 덮개 한 장을 opacity 1 로 깔고, 목적지(root)가 준비된 프레임에 280ms 동안 걷는다. 모든 전환이 이 함수 하나를 탄다.
 * · rect 를 주면 매 프레임 그 자리(판의 화면 위치)로 덮개를 맞춘다 — 판이 커밋·스크롤로 움직여도 따라간다.
 * · 연타 — 같은 덮개의 새 이동이 이긴다(이전 대기·애니메이션은 버린다).
 */
function lift(el: HTMLElement, root: () => Element | null, rect?: () => Rect | null, defer = false): void {
  const my = (runs.get(el) ?? 0) + 1;
  runs.set(el, my);
  waits.get(el)?.(); // 연타 — 이전 대기는 버린다
  for (const a of el.getAnimations()) a.cancel();
  const place = () => {
    const r = rect?.();
    if (!r) return;
    const s = el.style;
    s.top = `${r.top}px`; s.left = `${r.left}px`; s.width = `${r.width}px`; s.height = `${Math.max(0, r.bottom - r.top)}px`;
  };
  // defer: 호출 시점엔 아직 커밋 전 DOM 이다(하위 탭 — 이벤트 안) → 자리는 첫 rAF(커밋 뒤·첫 페인트 전)에 잡고 그때 보인다.
  if (!defer) { place(); el.style.display = 'block'; } else el.style.display = 'none';
  el.style.opacity = '1';
  waits.set(el, waitSettled(root, () => {
    if (runs.get(el) !== my) return;
    const anim = el.animate(tabCoverKeyframes(), { duration: TAB_COVER_MS, easing: 'linear' });
    // 끝나면 쉬는 상태로 — 메인 덮개는 클래스(hidden opacity-0)로 돌아가고, 하위 탭 덮개(defer)는 클래스가 없어 인라인으로 숨긴다.
    //   ⚠ 하위 탭 덮개에서 display 를 '' 로 지우면 div 기본값(block)·opacity 1 로 **화면에 눌러앉는다**(2026-09-24 첫 측정에서 밟았다).
    anim.onfinish = () => { if (runs.get(el) === my) { el.style.display = defer ? 'none' : ''; el.style.opacity = defer ? '0' : ''; } };
  }, () => {
    if (runs.get(el) !== my) return;
    place();
    el.style.display = 'block';
  }));
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPc = () => window.matchMedia('(min-width: 1024px)').matches;
/** App 의 메인 탭 덮개 기본 윗변(모바일) — App.tsx 가 이 값을 인라인으로 준다. */
export const TAB_COVER_TOP = 'calc(var(--header-now) + 1px)';

/**
 * 메인 탭 커밋 직후(**useLayoutEffect 안**) 부른다 — 첫 페인트부터 덮개가 opacity 1 로 깔린다(K-07).
 * 걷기는 rAF 에서 목적지 판이 준비된(isSettled + 높이 정지) 프레임에 시작한다(상한 TAB_COVER_WAIT_MAX_MS).
 * 모바일: 헤더 밑 전폭(인라인 top). PC: GNB 밑 · 콘텐츠 열 폭 · 판 아래끝까지(푸터·좌우 채움 배경은 안 덮는다).
 * 덮개의 기본 클래스는 `hidden opacity-0` 이다 — 끝나면 인라인 display·opacity 를 지워 클래스로 돌아간다.
 */
export function playTabCover(el: HTMLElement | null, tab: string): void {
  if (!el || typeof el.animate !== 'function') return;
  if (!isTabCoverOn() || reduced()) return;
  const pane = () => document.querySelector(`.tab-pane[data-tab="${tab}"]`);
  if (!isPc()) {
    // 모바일은 CSS 자리(헤더 밑 전폭) 그대로 — PC 에서 줄였던 인라인 치수를 되돌린다.
    const s = el.style;
    if (s.left) { s.top = TAB_COVER_TOP; s.left = ''; s.width = ''; s.height = ''; }
    lift(el, pane);
    return;
  }
  lift(el, pane, () => {
    const p = pane() as HTMLElement | null;
    const gnb = document.querySelector('[data-stack-tabbar]');
    const top = Math.max(gnb?.getBoundingClientRect().bottom ?? 0, 0);
    if (!p || p.offsetHeight === 0) return { top, left: 0, width: window.innerWidth, bottom: window.innerHeight };
    const r = p.getBoundingClientRect();
    return { top, left: r.left, width: r.width, bottom: Math.min(window.innerHeight, Math.max(r.bottom, top)) };
  });
}

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
/** 판이 속한 전면 화면(fixed 오버레이)의 z-index — 덮개가 그 위·그 안 영역에만 깔리게. 없으면 메인 덮개와 같은 45. */
const zFor = (el: Element): string => {
  let z = '45';
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.position === 'fixed' && cs.zIndex !== 'auto') z = cs.zIndex; // 가장 바깥 fixed 가 층을 정한다
  }
  return z;
};
/** 판 뒤로 실제로 보이는 불투명 배경색 — 덮개가 그 색이어야 '빈 판 → 내용' 이 한 장으로 풀린다. */
const bgFor = (el: Element): string => {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) { const a = m[1].split(/[ ,/]+/).filter(Boolean); if (a.length < 4 || Number(a[3]) >= 1) return c; }
  }
  return 'rgb(var(--surface-base))';
};

let subCover: HTMLElement | null = null;
const subCoverEl = (): HTMLElement => {
  if (subCover?.isConnected) return subCover;
  const d = document.createElement('div');
  d.setAttribute('aria-hidden', 'true');
  d.dataset.subCover = '';
  d.style.cssText = 'position:fixed;pointer-events:none;display:none;opacity:0;';
  document.body.appendChild(d);
  subCover = d;
  return d;
};

/**
 * 하위 탭 전환 — goSubTab 이 commit() **직후** 부른다(같은 이벤트 안). 메인 탭과 **같은 lift()** 를 탄다.
 * ① 누른 버튼이 든 레일(탭바)과 목적지 판을 찾는다(판은 커밋으로 바뀔 수 있어 매 프레임 다시 찾는다).
 * ② 첫 rAF(커밋 뒤·첫 페인트 전): 판 윗변이 레일 밑으로 말려 올라가 있으면 **레일 바로 밑**으로 맞춘다(P2 스크롤 규칙).
 *    짧은 판으로 가며 브라우저가 scrollY 를 깎는 클램프도 이 프레임 안에서 끝난다 — 덮개가 이미 깔려 있다.
 * ③ 덮개 = 판의 화면 영역(레일 밑 ~ 화면 아래)만. 레일·알약(SlidingPill)·헤더는 덮지 않는다.
 */
export function playSubTabCover(scope: string, target: EventTarget | null): void {
  if (typeof document === 'undefined' || !isTabCoverOn() || reduced()) return;
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
  const el = subCoverEl();
  let first = true;
  const safeTop = (root: Element): number => {
    const sc = scroller(root);
    let top = sc ? sc.getBoundingClientRect().top : Math.max(
      document.querySelector('[data-stack-header]')?.getBoundingClientRect().bottom ?? 0,
      isPc() ? (document.querySelector('[data-stack-tabbar]')?.getBoundingClientRect().bottom ?? 0) : 0,
    );
    if (rail?.isConnected) top = Math.max(top, rail.getBoundingClientRect().bottom);
    return top;
  };
  lift(el, find, () => {
    const root = find();
    if (!root) return null;
    if (first) {
      first = false;
      el.style.zIndex = zFor(root);
      el.style.background = bgFor(root);
      // P2 — 판 윗변을 레일 밑으로(말려 올라가 있을 때만). 섹션별 복원이 있는 scope 는 그쪽 정책을 따른다.
      //   판 자체가 스크롤 상자면(내 정보·알림·약관) 그 상자를 맨 위로 — 새 탭 내용이 중간부터 보이지 않게.
      if (!OWN_SCROLL_SCOPES.has(scope)) {
        const own = root as HTMLElement;
        const oy = getComputedStyle(own).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && own.scrollTop > 0) own.scrollTop = 0;
        else if (rail?.isConnected) {
          const d = root.getBoundingClientRect().top - rail.getBoundingClientRect().bottom;
          if (d < -1) {
            const sc = scroller(root);
            if (sc) sc.scrollTop += d;
            else { markProgrammaticScroll(); window.scrollTo({ top: Math.max(0, window.scrollY + d), behavior: 'instant' as ScrollBehavior }); notifyScrollNow(window.scrollY); }
          }
        }
      }
    }
    const r = root.getBoundingClientRect();
    const top = Math.max(r.top, safeTop(root));
    return { top, left: r.left, width: r.width, bottom: Math.max(top, Math.min(window.innerHeight, r.bottom)) };
  }, true);
}
