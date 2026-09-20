// 하단 대메뉴로 탭을 옮겼을 때 **새 탭의 본문 콘텐츠가 한 번 들어오는** 진입 모션.
//
// 🔴 오너 정정(2026-09-21): "부드럽지 않다" 고 한 대상은 하단바 필이 아니라
//    **하단 대메뉴를 누른 뒤 나타나는 새 페이지의 body 콘텐츠**다.
//    하단바만 움직이고 본문이 정적이면 실패다.
//
// 계약(실행 설계서 §0·N1):
//  - 모바일(<1024px) 에서만. PC 는 기존 View Transition 경로 그대로.
//  - 첫 viewport 에 **함께 보이는 주요 일반 흐름 블록 전부**가 **같은 타이밍**에
//    `translateY(8px) → 0` 을 약 170ms 감속으로 **한 번** 움직인다.
//    일부만 움직여 분절되면 실패다 — 그래서 대상을 한 프레임에 모아 **같은 시각에** 시작한다.
//  - `opacity` 는 1 고정, `filter`·`scale` 없음. **순수 y 이동만** 한다.
//
// 🔴 왜 `.tab-pane` 전체를 움직이지 않는가
//    CSS `transform` 이 걸린 요소는 `position: fixed` 자손의 **컨테이닝 블록이 된다.**
//    이 저장소가 실제로 밟았다 — 헤더에 유리 효과를 걸었더니 헤더 안 `fixed inset-0` 스크림이
//    68px 헤더 안에 갇혀 바깥 클릭이 안 닿았다(CLAUDE.md 참고 메모).
//    그래서 판·헤더·sticky·fixed 의 **조상**은 절대 대상이 아니고,
//    **`data-main-enter` 로 명시한 일반 흐름 블록**만 움직인다.
//    ⚠ 새 블록을 만들면 그 요소에도 표식을 붙여라. 안 붙이면 그 블록만 정적으로 남아
//      바로 그 '분절' 이 된다(라이브의 '내 토너' 카드처럼 **조건부로만 뜨는 블록**이 특히 그렇다).
//
// 🔴 왜 document/root View Transition 을 안 쓰는가
//    삼성 인터넷에서 본문이 세로 약 0.838배로 눌리고 Chrome 에서 화면이 밝아졌다 돌아왔다.
//    모바일 재방문 탭의 document VT 는 `App.tsx` 의 `commitTab` 가드로 이미 제거됐고(호출 0회 실측),
//    이 모듈은 그 계약을 **되살리지 않는다** — 스냅샷을 만들지 않고 실제 DOM 요소만 움직인다.

/** 시작 오프셋(px). 설계서가 허용한 조정 범위는 6~10px 다. */
const DIST = 8;
/** 지속(ms). 설계서 선언값. */
const DUR = 170;
/** 감속 곡선 — `src/index.css:43` 의 `--ease` 와 같은 값이다. */
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** 대상이 아직 안 붙었을 때(첫 방문 lazy) 기다리는 상한(ms). 타이머로 '추측해서 재생' 하지 않고,
 *  **DOM 이 실제로 붙는 것을 관찰**해서 재생한다. 이 값은 관찰을 언제 포기할지의 상한일 뿐이다. */
const WAIT_MS = 4000;

type Pending = { gen: number; tab: string; deadline: number };

let gen = 0;
let pending: Pending | null = null;
let mo: MutationObserver | null = null;
/** 이 모듈이 건 애니메이션만 취소하려고 따로 들고 있는다 — 남의 애니메이션을 끊지 않는다. */
let playing: Animation[] = [];

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function mql(q: string) {
  return typeof window.matchMedia === 'function' ? window.matchMedia(q) : null;
}

/** PC 이거나 사용자가 모션을 줄이라고 했으면 이 모션은 **아예 시작하지 않는다**. */
function blocked(): boolean {
  if (mql('(min-width: 1024px)')?.matches) return true;
  if (mql('(prefers-reduced-motion: reduce)')?.matches) return true;
  return false;
}

/** 관찰 중단. 🔴 rAF 예약은 더 이상 없다 — M1(2026-09-21) 이후 `attempt` 는 항상 **동기로** 불린다
 *  (`startTabEnter` 에서 한 번, 그 뒤 MutationObserver 콜백에서. 둘 다 페인트 전이다). */
function clearWatch() {
  if (mo) { mo.disconnect(); mo = null; }
}

/** 진행 중인 진입을 취소하고 예약도 무효화한다.
 *  오버레이가 열리거나(설계서 N6) 언마운트·resize→PC 에서 호출한다. */
export function cancelTabEnter() {
  pending = null;
  clearWatch();
  for (const a of playing) { try { a.cancel(); } catch { /* 이미 끝난 애니메이션 */ } }
  playing = [];
}

/**
 * 대상 수집 — **판 안에서 `data-main-enter` 로 명시한 요소**만.
 *
 * 🔴 M1(2026-09-21) — **cohort 준비 신호가 먼저다.**
 *   종전에는 표식이 **한 개만 붙어도** 그 즉시 재생하고 observer 를 끊었다. 그래서 외치기가 먼저 붙고
 *   검색·목록이 늦게 붙으면 **외치기 하나만 움직였다** — 그게 오너가 본 '본문 1·2·3 분절'이다.
 *   이제는 판 안에 `data-main-enter-ready`(그 탭의 실제 콘텐츠 루트)가 **있을 때만** 대상을 모은다.
 *   ready 가 붙는 커밋에는 그 안의 표식이 **모두 같이** 들어 있으므로 cohort 가 원자적으로 모인다.
 *   표식 한 개 도착을 준비 완료로 해석하지 않는다. 준비가 기한 안에 안 오면 **전부 정적**으로 둔다
 *   (`attempt` 의 deadline) — 부분 애니메이션은 대안이 아니다.
 *
 *   ⚠ 이 게이트가 **rect 를 읽기 전에** 끝나는 것이 중요하다. `attempt` 는 MutationObserver 콜백에서도
 *     불리는데, 거기서 `getBoundingClientRect` 를 돌리면 DOM 이 바뀔 때마다 강제 레이아웃이 걸린다.
 *     ready 가 없으면 여기서 즉시 빠져나가므로 그 비용이 안 생긴다.
 *
 * 걸러내는 것:
 *  - 안 그려진 것(`offsetParent === null`): 숨은 판·`display:none` 서브탭. 여기에 재생하면 잔재가 남는다.
 *  - 첫 viewport 밖: 화면 아래 블록을 움직여 봐야 사용자는 못 본다. 비용만 든다.
 */
function collect(tab: string): HTMLElement[] {
  const pane = document.querySelector<HTMLElement>(`[data-tab="${CSS.escape(tab)}"]`);
  if (!pane) return [];
  // cohort 준비 신호 — 없으면 아직 '이 커밋' 이 아니다. rect 를 읽지 않고 돌아간다.
  const ready = pane.querySelector<HTMLElement>('[data-main-enter-ready]');
  if (!ready || ready.offsetParent === null) return [];
  const vh = window.innerHeight || 0;
  const out: HTMLElement[] = [];
  for (const el of Array.from(pane.querySelectorAll<HTMLElement>('[data-main-enter]'))) {
    if (el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) continue;
    if (r.top >= vh) continue;
    out.push(el);
  }
  return out;
}

function play(targets: HTMLElement[]) {
  // 같은 프레임에 한꺼번에 시작한다 — 이래야 카드들이 제각각 낙하하지 않는다.
  for (const el of targets) {
    const a = el.animate(
      [{ transform: `translateY(${DIST}px)` }, { transform: 'translateY(0)' }],
      // `fill: 'none'` — 끝나면 인라인 효과를 남기지 않는다. 잔재 transform 이 남으면
      // 그 요소가 계속 fixed 자손의 컨테이닝 블록이 된다.
      { duration: DUR, easing: EASE, fill: 'none' },
    );
    playing.push(a);
    a.finished.then(() => { playing = playing.filter((x) => x !== a); }).catch(() => {
      // cancel() 하면 `finished` 가 reject 된다 — 정상 경로다(취소가 곧 '두 번 재생 안 함' 보장).
      playing = playing.filter((x) => x !== a);
    });
  }
}

function attempt() {
  const p = pending;
  if (!p || p.gen !== gen) return;
  const targets = collect(p.tab);
  if (targets.length > 0) {
    pending = null;
    clearWatch();
    play(targets);
    return;
  }
  // 아직 안 붙었다 — 첫 방문 lazy 청크가 준비 중일 수 있다.
  // **타이머로 추측해 재생하지 않고**, DOM 이 붙는 것을 관찰한다. 스켈레톤에는 표식이 없으므로
  // 여기서 재생되는 일도 없다(설계서: fallback/skeleton 에 재생 금지).
  if (Date.now() > p.deadline) { pending = null; clearWatch(); return; }
  if (!mo) {
    mo = new MutationObserver(() => {
      if (!pending || pending.gen !== gen) { clearWatch(); return; }
      // 🔴 M1(2026-09-21) — 여기서 `requestAnimationFrame` 으로 미루지 않는다.
      //   MutationObserver 콜백은 **그 변경을 만든 태스크의 마이크로태스크**로 돌아, 아직 페인트 전이다.
      //   rAF 로 미루면 그 사이 한 프레임이 **정착 위치로 페인트**되고 다음 프레임에 +8 로 점프한다 —
      //   첫 방문 lazy 콘텐츠에서 오너가 본 '0→+8 역행'이 정확히 이 경로였다.
      //   즉시 부르면 붙은 그 커밋의 페인트 전에 애니메이션이 서서, 첫 프레임부터 +8→0 한 방향이다.
      attempt();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
}

/**
 * 탭 커밋 직후 호출한다. 같은 세대를 **한 번만** 소비한다.
 *
 * ⚠ 앱 최초 로드에서는 부르지 않는다(호출부가 첫 커밋을 건너뛴다) — 설계서는 앱 부팅에
 *   이 모션을 재생하지 말라고 못박았다.
 */
export function startTabEnter(tab: string) {
  if (!isBrowser()) return;
  // 이전 진입이 남아 있으면 **취소**한다 — 연타에서 옛 애니메이션이 새 화면을 건드리면 안 된다.
  cancelTabEnter();
  if (blocked()) return;
  gen += 1;
  pending = { gen, tab, deadline: Date.now() + WAIT_MS };
  // 🔴 M1(2026-09-21) — **다음 프레임으로 미루지 않는다. 지금, 페인트 전에 시작한다.**
  //   종전에는 `requestAnimationFrame(attempt)` 였다. 호출부(`App.tsx` 의 `useLayoutEffect`)는 커밋 직후라
  //   페인트 전인데, rAF 로 미루면 **그 한 프레임이 정착 위치로 페인트되고** 다음 프레임에 +8 로 점프한다.
  //   390px 로컬 DOM 샘플에서 검색 y 가 `정착 → +8 → 정착` 순서로 나온 것이 그 증거다.
  //   사용자에겐 "내려갔다 올라온다"(역행)로 보이고, 같은 화면의 다른 박스와 시작 시각도 어긋난다.
  //   여기서 바로 부르면 첫 페인트가 곧 +8 이라 **첫 프레임부터 +8→0 한 방향**이다.
  //
  //   ⚠ 비용 균형: `collect` 가 `getBoundingClientRect` 를 읽어 이 시점에 레이아웃을 강제한다.
  //     브라우저는 어차피 이 페인트 전에 레이아웃을 하므로 **없던 레이아웃이 새로 생기는 게 아니라 앞당겨진다.**
  //     그리고 cohort 준비 신호(`collect` 머리말)가 rect 를 읽기 **전에** 거르므로, 콘텐츠가 아직
  //     안 붙은 흔한 경우에는 측정 자체가 일어나지 않는다.
  //     그래도 Long Animation Frame 이 늘거나 첫 페인트가 여전히 0→+8 이면, 같은 React 커밋에서
  //     초기 위치를 CSS 로 주는 안으로 갈아타고 이 코드를 제거한다(설계서 B안 — 두 방식을 함께 두지 않는다).
  attempt();
}

/** 테스트·검증용 — 선언값을 밖에서 확인할 수 있게 연다(계약 테스트가 이 숫자를 잠근다). */
export const TAB_ENTER = { DIST, DUR, EASE } as const;
