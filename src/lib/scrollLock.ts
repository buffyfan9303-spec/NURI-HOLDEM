// src/lib/scrollLock.ts — 오버레이 열림 중 배경 페이지 스크롤 잠금(ref-count).
// ⚠ 이 앱의 뷰포트 스크롤러는 body가 아니라 html(index.css의 html{overflow-y:scroll})이다.
//   body.style.overflow='hidden'만으로는 잠기지 않아(무효) 모달 뒤 배경이 그대로 스크롤됐다.
//   → documentElement+body를 함께 잠그고, 중첩 오버레이(포스터 상세 위 글쓰기 모달 등)가
//     안쪽을 닫을 때 바깥 잠금까지 풀지 않도록 카운트로 관리한다.
//   html은 scrollbar-gutter:stable이라 잠금/해제 시 레이아웃 흔들림 없음.
//
// 2026-08-30 자가복구(sweep) 추가 — 왜:
//   Modal·ImageLightbox 는 **포털을 쓰지 않아** 자기가 속한 탭 pane 안에 렌더된다.
//   최상위 탭은 언마운트 없이 display 토글로 keep-alive 되므로(App.tsx), 오버레이가 열린 채
//   탭이 감춰지면 **React 정리 함수가 돌지 않아 카운트가 1 이상으로 남는다.**
//   그 상태는 화면에 아무 단서도 없이 앱 전체 스크롤이 죽고, 새로고침 외엔 사용자가 못 푼다.
//   → 잠금 소유자는 자기 오버레이에 data-scroll-lock 을 달고, 탭 전환 때 sweep 이
//     '보이는 소유자가 하나도 없는데 잠겨 있는' 모순 상태만 골라 되돌린다.
//
// ══════════════════════════════════════════════════════════════════════════════
// 🔴 2026-09-19 — `keepViewport` 모드 추가 (오너 리포트: "게시판 글 클릭하면 한번 밑으로
//    쭉 내려갔다가 버벅이면서 올라가. 다 그래")
//
//   원인: 목록을 내려 **주소창이 접힌 상태**에서 오버레이를 열면 `html{overflow:hidden}` 때문에
//   문서가 스크롤 불가가 된다. 모바일 브라우저는 그 순간 **주소창을 도로 펼친다** — 뷰포트 높이가
//   줄고 `fixed inset-0` 오버레이가 그 높이로 다시 그려지면서 "쭉 내려갔다 올라오는" 움직임이 된다.
//
//   ⚠ 이 부류는 **테스트 하네스에서 재현되지 않는다.** Playwright 의 Pixel 7 에는 주소창이 없어
//     dvh==svh==lvh 다(CLAUDE.md). 그래서 게이트는 계속 초록이었다 — 재현 못 함 ≠ 없음.
//
//   해법: 문서를 '스크롤 못 하는 상태' 로 만들지 않는다. body 를 `position:fixed; top:-Y` 로
//   띄워 화면을 그 자리에 붙잡되, **html 의 overflow 는 건드리지 않는다.** 브라우저가 보기에
//   문서는 여전히 스크롤 가능하므로 주소창 상태가 흔들리지 않는다.
//
// ══════════════════════════════════════════════════════════════════════════════
// 🛡 방어 원칙 (오너: "1번 일단 하되 깨지는 것을 최대한 방어해")
//   이 모듈은 이미지 라이트박스·장부·클락·전체화면 클락까지 **공용**이다. 새 모드는 소비처가
//   명시적으로 요구할 때만 켜지고, 조금이라도 애매하면 **옛 동작으로 물러난다**:
//     ① 기본값은 옛 동작이다. `lockScroll()` 을 인자 없이 부르면 바이트 동일하게 옛 경로다.
//     ② **모드는 첫 잠금이 정한다.** 중첩 중에는 절대 바꾸지 않는다(글 상세 위 글쓰기 모달 등).
//        섞이면 옛 동작이 이긴다 — 새 모드가 옛 소비처의 전제를 깨지 않는 방향.
//     ③ 새 모드는 **스크롤이 실제로 내려가 있을 때만**(scrollY > 0) 켠다. 맨 위에서는 지킬
//        위치가 없어 옛 경로로 충분하고, 그만큼 새 코드에 노출되는 화면이 줄어든다.
//     ④ 해제는 **저장해 둔 인라인 스타일을 그대로 되돌린다**(빈 문자열로 지우지 않는다).
//        다른 코드가 body 에 position/top 을 이미 쓰고 있었다면 그 값을 살려 준다.
//     ⑤ sweep(미아 잠금 회수)도 어느 모드였든 똑같이 원상복구한다.
//     ⑥ 해제 시 `window.scrollTo(0, y)` 로 **위치를 정확히 되돌린다.** 이걸 빠뜨리면
//        닫을 때 목록이 맨 위로 튄다 — 고치려던 것보다 나쁜 증상이 된다.

let locks = 0;

/** 지금 잠금이 어느 방식인가. 첫 잠금이 정하고 마지막 해제까지 안 바뀐다(방어 원칙 ②). */
let mode: 'overflow' | 'viewport' = 'overflow';
/** viewport 모드에서 되돌릴 것들 — 스크롤 위치와 **원래 인라인 스타일 값**(방어 원칙 ④). */
let savedY = 0;
let savedStyle: { position: string; top: string; left: string; right: string; width: string } | null = null;

const applyOverflow = (on: boolean) => {
  document.documentElement.style.overflow = on ? 'hidden' : '';
  document.body.style.overflow = on ? 'hidden' : '';
};

const applyViewport = (on: boolean) => {
  const b = document.body.style;
  if (on) {
    savedY = window.scrollY;
    savedStyle = { position: b.position, top: b.top, left: b.left, right: b.right, width: b.width };
    b.position = 'fixed';
    b.top = `-${savedY}px`;
    b.left = '0';
    b.right = '0';
    b.width = '100%';
    return;
  }
  if (savedStyle) {
    b.position = savedStyle.position; b.top = savedStyle.top;
    b.left = savedStyle.left; b.right = savedStyle.right; b.width = savedStyle.width;
    savedStyle = null;
  }
  // ⚠ 스타일을 되돌린 **뒤에** 스크롤을 복원한다. 순서가 바뀌면 body 가 아직 fixed 라 무시된다.
  const y = savedY;
  window.scrollTo(0, y);
  // 🛡 몇 프레임 동안 **문서 높이가 돌아올 때까지** 다시 맞춘다.
  //   실측(2026-09-19): 되돌린 직후 192 → **179**(13px 어긋남). body 가 fixed 인 동안 문서가
  //   1036 → 844px 로 쪼그라들고, 목록이 `content-visibility` 라 높이가 **한 프레임에 안 돌아온다.**
  //   그 사이에 건 scrollTo 는 짧은 문서 기준으로 **클램프**된다(1023−844=179 가 그 값이었다).
  //   한 프레임만 기다리는 것으로는 부족했다 — 실측으로 확인하고 3프레임으로 늘렸다.
  // ⚠ **사용자가 만지면 즉시 그만둔다.** 계속 붙잡으면 닫자마자 스크롤하는 손가락과 싸운다.
  //   그게 이 보정에서 가장 위험한 실패 방식이라 먼저 막는다.
  let tries = 3;
  let stop = false;
  const giveUp = () => { stop = true; };
  window.addEventListener('touchstart', giveUp, { once: true, passive: true });
  window.addEventListener('wheel', giveUp, { once: true, passive: true });
  const fix = () => {
    if (stop || tries-- <= 0) {
      window.removeEventListener('touchstart', giveUp);
      window.removeEventListener('wheel', giveUp);
      return;
    }
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    requestAnimationFrame(fix);
  };
  requestAnimationFrame(fix);
};

const paint = () => {
  const on = locks > 0;
  if (mode === 'viewport') applyViewport(on);
  else applyOverflow(on);
};

/**
 * @param keepViewport 주소창이 흔들리지 않게 body 를 고정해 잠근다(전체화면 읽기 화면용).
 *   **첫 잠금일 때만** 반영된다 — 중첩 중에는 모드가 바뀌지 않는다(방어 원칙 ②).
 */
export function lockScroll(keepViewport = false) {
  locks += 1;
  if (locks === 1) {
    // 방어 ③: 맨 위(스크롤 0)에서는 지킬 위치가 없다 → 옛 경로로 간다.
    mode = keepViewport && window.scrollY > 0 ? 'viewport' : 'overflow';
    paint();
  }
}

export function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks === 0) {
    paint();
    mode = 'overflow'; // 다음 잠금이 자기 모드를 다시 정한다
  }
}

/**
 * 잠겨 있는데 화면에 보이는 잠금 소유자가 하나도 없으면 — 정리되지 못한 잠금이다. 되돌린다.
 * display:none 된 조상 아래의 요소는 getClientRects()가 비므로 fixed 오버레이도 정확히 걸러진다.
 * (정상 상태에선 보이는 소유자가 있으므로 아무 일도 하지 않는다 — 오작동 시 손해가 없는 방향.)
 * ⚠ 방어 ⑤: viewport 모드도 여기서 똑같이 원상복구된다(paint 가 모드를 보고 되돌린다).
 */
export function sweepScrollLocks() {
  if (locks === 0) return;
  const visible = [...document.querySelectorAll<HTMLElement>('[data-scroll-lock]')]
    .some((el) => el.getClientRects().length > 0);
  if (visible) return;
  locks = 0;
  paint();
  mode = 'overflow';
}
