// src/lib/viewTransition.ts — 화면 전환 마스킹의 단일 출처.
//
// 메이저 사이트의 '부드러움'은 전환 커밋 비용이 0이라서가 아니라, View Transition 이
// 이전 화면 스냅샷을 고정해 두고 그 '뒤에서' 무거운 커밋(마운트·display 토글·스크롤 복원)을
// 끝낸 뒤 완성된 화면으로 짧은 크로스페이드만 보여주기 때문이다 — 중간 과정이 화면에
// 노출될 수 없는 구조라 '투두둑'이 물리적으로 보이지 않는다.
//
// update 는 flushSync 로 감싼 동기 커밋이어야 스냅샷 뒤에서 끝난다(호출측 책임).
// 미지원 브라우저·모션 축소 설정에선 fallback(없으면 update)을 그대로 실행 — 점진적 향상.
//
// ── 2026-08-28: '전환 중 터치 먹통' 의 진범 ──────────────────────────────────
// 오너 지적 "메뉴를 조금 빠르게 이동하면 터치가 먹통이 된다" 를 헤드리스로 계측했다.
// 탭바 중심 좌표에서 프레임마다 document.elementFromPoint 를 찍었더니, 전환이 도는 동안
// 버튼이 아니라 **<html>** 이 돌아왔다 — ::view-transition 스냅샷 레이어가 포인터를 먹고
// 있었던 것이다. 전환 1회당 300~360ms, 연타 시나리오에선 누적 700~1400ms 동안
// 화면은 멀쩡한데 탭이 안 눌린다. 사용자에겐 정확히 '먹통' 으로 보인다.
//
// 스냅샷은 '보여주기' 전용이어야 한다 — 입력은 언제나 살아 있는 DOM 이 받아야 한다.
// 그래서 전환 의사 요소 전체에 pointer-events:none 을 못 박는다. 지원 브라우저의
// UA 스타일시트가 이걸 보장하지 않으므로 앱이 직접 선언한다.
//
// ⚠ 그런데 실측해 보니 **그것만으로는 부족했다.** pointer-events:none 이 계산값까지
//   먹은 상태에서도 elementFromPoint 는 여전히 <html> 을 돌려준다 — 전환에 캡처된
//   요소들은 브라우저가 히트테스트에서 통째로 빼기 때문이다(스냅샷으로 대체된 상태).
//   즉 "전환이 도는 동안에는 화면 어디를 눌러도 아무 데도 닿지 않는다".
//   같은 실측에서 skipTransition() 은 히트테스트를 **동기적으로** 되살렸다.
//   → 그래서 두 겹으로 막는다.
//     ① 입력이 들어오는 순간 전환을 걷어낸다(연출보다 응답이 먼저다).
//     ② 이미 <html> 로 새어 버린 그 한 번의 탭은 좌표로 대상을 다시 찾아 되돌려준다.
//   결과: 사용자 입장에서 '먹히는 탭' 이 0 이 된다(연출은 그 순간 잘릴 뿐이다).
type VTTransition = {
  ready?: Promise<void>;
  finished?: Promise<void>;
  updateCallbackDone?: Promise<void>;
  skipTransition?: () => void;
};
type VTDocument = Document & { startViewTransition?: (cb: () => void) => VTTransition | undefined };

export type VTDirection = 'forward' | 'back';

/** 전환이 어떤 이유로든 끝나지 않을 때의 상한 — 이 시간을 넘기면 스냅샷을 걷어낸다. */
const MAX_TRANSITION_MS = 500;

let styleInjected = false;
function ensurePointerPassthrough() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  // 셀렉터 하나가 구형 파서에서 무효가 되어도 나머지가 살아남도록 규칙을 분리한다.
  const rules = [
    '::view-transition',
    '::view-transition-group(*)',
    '::view-transition-image-pair(*)',
    '::view-transition-old(*)',
    '::view-transition-new(*)',
  ].map((sel) => `${sel} { pointer-events: none !important; }`);
  const el = document.createElement('style');
  el.dataset.source = 'view-transition-pointer-passthrough';
  el.textContent = rules.join('\n');
  document.head.appendChild(el);
}

/** 진행 중인 전환 — 새 전환을 시작하기 전에 이걸 먼저 걷어낸다(중첩 방지). */
let active: VTTransition | null = null;
let activeTimer = 0;

function endActive() {
  if (active) { try { active.skipTransition?.(); } catch { /* 이미 끝난 전환 */ } active = null; }
  if (activeTimer) { clearTimeout(activeTimer); activeTimer = 0; }
}

function release(t: VTTransition) {
  if (active !== t) return;
  active = null;
  if (activeTimer) { clearTimeout(activeTimer); activeTimer = 0; }
}

// ── 입력 구조(rescue) ───────────────────────────────────────────────────────
// 전환 중에 새어 나간 탭 한 번을 좌표로 되찾아 실제 대상에게 다시 보낸다.
// '되찾을 수 있는 것' 만 되찾는다: 원래 클릭이 <html>/<body> 에 떨어졌을 때(=먹혔다는 증거)만,
// 그리고 그 좌표에 실제 조작 대상(버튼·링크·입력)이 있을 때만.
const RESCUE_TARGETS = 'button, a[href], [role="button"], [role="tab"], input, select, textarea, label, summary';
let rescue: { x: number; y: number; at: number } | null = null;
let rescueInstalled = false;

function wasSwallowed(t: EventTarget | null): boolean {
  return t === document.documentElement || t === document.body;
}

function onInputDown(e: Event) {
  if (!active) return;
  // 연출보다 응답이 먼저다 — 전환을 즉시 걷어내 히트테스트를 되살린다.
  endActive();
  const p = e as PointerEvent & { touches?: TouchList };
  const pt = p.touches && p.touches.length ? p.touches[0] : p;
  const x = (pt as { clientX?: number }).clientX;
  const y = (pt as { clientY?: number }).clientY;
  if (typeof x !== 'number' || typeof y !== 'number') return;
  // 이 입력은 이미 <html> 로 라우팅됐다 — 뒤따라올 click 을 구조할 좌표를 남긴다.
  rescue = wasSwallowed(e.target) ? { x, y, at: performance.now() } : null;
}

function onClickCapture(e: MouseEvent) {
  const r = rescue;
  rescue = null;
  // 브라우저가 제대로 전달했으면 손대지 않는다. <html>/<body> 로 떨어졌다는 건 먹혔다는 증거다.
  if (!wasSwallowed(e.target)) return;

  // ⚠ 2026-08-29: 예전엔 `if (!r) return;` 이라 **pointerdown 시점에 이미 전환이 돌고 있을 때만**
  //   구조했다. 그런데 순서가 반대인 경우가 실재한다 —
  //   pointerdown 은 멀쩡히 들어가고, 그 직후 탭 전환이 시작돼 **click 만 삼켜지는** 것이다.
  //   그때 r 이 null 이라 여기서 그냥 돌아갔고, 그 탭은 아무 데도 닿지 않은 채 사라졌다.
  //   느린 기기·부하 상황에서만 순서가 이렇게 갈리므로 빠른 기기에서는 재현되지 않는다
  //   (CI 2워커에서만 tools 스펙이 간헐 실패하던 것의 정체 — 실패 순간 화면이 런처 그대로였다).
  //   → r 이 없으면 click 자신의 좌표로 구조한다. 클릭 이벤트도 화면 좌표를 들고 있다.
  //   전환이 아직 돌고 있을 수 있으니 히트테스트부터 되살린다(스냅샷은 연출일 뿐 입력의 주인이 아니다).
  endActive();
  const fresh = r && performance.now() - r.at <= 700;
  const x = fresh ? r!.x : e.clientX;
  const y = fresh ? r!.y : e.clientY;
  if (typeof x !== 'number' || typeof y !== 'number') return;

  const el = document.elementFromPoint(x, y);
  const target = el?.closest(RESCUE_TARGETS) as HTMLElement | null;
  if (!target) return;
  e.stopPropagation(); // 먹힌 원본은 여기서 끝내고, 아래에서 진짜 대상에게 다시 보낸다
  target.click();
}

function ensureInputRescue() {
  if (rescueInstalled || typeof window === 'undefined') return;
  rescueInstalled = true;
  // 캡처 단계 — 전환 중 이벤트는 <html> 이 타깃이라 버블 경로가 짧다.
  window.addEventListener('pointerdown', onInputDown, true);
  window.addEventListener('mousedown', onInputDown, true);
  window.addEventListener('touchstart', onInputDown, { capture: true, passive: true });
  window.addEventListener('click', onClickCapture, true);
}

export function withViewTransition(update: () => void, fallback?: () => void, dir?: VTDirection): void {
  const d = document as VTDocument;
  // document.hidden: 숨긴 문서에서 startViewTransition 은 InvalidStateError 로 abort 되고,
  // 그 ready/finished 거부가 unhandledrejection 으로 새어 에러 수집망(Sentry)을 오염시킨다.
  // 안 보이는 화면에 전환 연출은 무의미하므로 폴백 경로로 우회.
  if (d.startViewTransition && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    ensurePointerPassthrough();
    ensureInputRescue();
    // 연타 = 이전 전환이 아직 도는 중에 새 전환 시작. 브라우저도 알아서 취소하지만,
    // 명시적으로 걷어내야 스냅샷이 한 프레임도 겹치지 않는다(겹치는 동안이 곧 먹통 구간).
    endActive();
    // 방향 마커 — 탭 전환은 애플식 '밀어내기'(패럴랙스 슬라이드), 오버레이는 기본 크로스페이드.
    // 속성은 남아 있어도 다음 호출이 덮으므로 정리 타이머가 필요 없다.
    if (dir) document.documentElement.dataset.vtDir = dir;
    else delete document.documentElement.dataset.vtDir;
    const t = d.startViewTransition.call(document, update);
    if (t) {
      active = t;
      // 상한 — 애니메이션이 어떤 이유로든 안 끝나도 스냅샷이 화면에 눌러앉지 않게 한다.
      activeTimer = window.setTimeout(() => {
        if (active === t) { try { t.skipTransition?.(); } catch { /* 무시 */ } active = null; }
        activeTimer = 0;
      }, MAX_TRANSITION_MS);
      // 전환 자체의 취소(연타로 다음 전환이 이번 것을 대체, 탭 백그라운드 전환 등)는 정상 동작 —
      // 거부를 소비해 unhandledrejection 소음을 차단한다(update 커밋은 어느 경우에도 실행됨).
      t.ready?.catch(() => {});
      t.finished?.then(() => release(t), () => release(t));
      t.updateCallbackDone?.catch(() => {});
    }
  } else {
    (fallback ?? update)();
  }
}
