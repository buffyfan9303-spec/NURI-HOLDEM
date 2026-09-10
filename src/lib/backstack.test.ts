// backstack 리마운트 안전성 — 단위 테스트
//
// ── 왜 E2E 가 아니라 여기인가 ───────────────────────────────────────────────
// 이 결함은 **개발 모드에서만** 재현된다. React StrictMode 가 마운트 시 useEffect 를
// 실행→정리→재실행 으로 두 번 돌리는데, 그 순서와 `history.back()` 의 비동기성이
// 겹치면 방금 연 오버레이가 스스로 닫혔다.
//
// 그런데 E2E 는 (오늘부로) **프로덕션 빌드**를 물고 돈다 — 나가는 것을 검사해야 하니까.
// 프로덕션에는 StrictMode 이중 실행이 없으므로 E2E 로는 이 회귀를 영영 못 잡는다.
// 그래서 순서 의존성만 떼어내 여기서 못 박는다. 가짜 history 로 그 순서를 직접 만든다.
//
// 이건 StrictMode 만의 이야기가 아니다. "정리 함수가 되돌리려는 대상이, 되돌릴 때쯤
// 이미 남의 것이 되어 있을 수 있다" 는 일반적인 리마운트 문제고, 프로덕션에서도
// 컴포넌트가 빠르게 언마운트·재마운트되면 같은 순서가 나온다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** 최소한의 가짜 history — 항목 배열 + 현재 위치. back() 은 실제처럼 **비동기**다. */
function makeFakeWindow() {
  const entries: unknown[] = [null]; // 루트
  let index = 0;
  let overshoot = 0;
  let throttled = false;
  const popHandlers: (() => void)[] = [];
  const keyHandlers: ((e: unknown) => void)[] = [];

  const history = {
    get state() { return entries[index]; },
    get length() { return entries.length; },
    pushState(s: unknown) {
      // 브라우저는 단시간 과다 호출을 throttle 하며 **예외를 던진다**. 그때 항목은 늘지 않는다.
      if (throttled) throw new Error('SecurityError: pushState throttled');
      entries.splice(index + 1); // 앞쪽 항목은 잘려나간다(브라우저와 동일)
      entries.push(s);
      index += 1;
    },
    // 실제 시그니처와 같은 3인자 — 앱은 딥링크 정리 때 (state, '', url) 형태로 부른다.
    replaceState(s: unknown, ...rest: unknown[]) { void rest; entries[index] = s; },
    back() { history.go(-1); },
    go(delta: number) {
      // ⚠ 핵심: 실제 history.go() 는 즉시 반영되지 않는다. 다음 매크로태스크에 popstate 가 온다.
      //   이 지연이 바로 버그의 원인이었으므로, 가짜에서도 반드시 비동기여야 한다.
      setTimeout(() => {
        // 루트(0)보다 더 뒤로 가려는 시도 = **앱을 벗어난다**. 실제 브라우저에서는 이전 사이트나
        // 빈 탭으로 나가버리고 사용자에겐 '사이트가 완전히 튕김' 으로 보인다. 가짜에서는
        // 그 초과분을 기록만 하고 클램프한다(테스트가 그 사실을 단언할 수 있도록).
        const raw = index + delta;
        if (raw < 0) overshoot += -raw;
        index = Math.min(Math.max(raw, 0), entries.length - 1);
        popHandlers.forEach((h) => h());
      }, 0);
    },
  };
  return {
    history,
    addEventListener(type: string, h: (e: unknown) => void) {
      if (type === 'popstate') popHandlers.push(h as () => void);
      if (type === 'keydown') keyHandlers.push(h);
    },
    removeEventListener() { /* 이 테스트에서는 해제하지 않는다 */ },
    /** 사용자가 ESC 를 한 번 누른다 — 앱의 window keydown 리스너에 그대로 전달된다 */
    __esc() { keyHandlers.forEach((h) => h({ key: 'Escape', defaultPrevented: false, isComposing: false })); },
    get __index() { return index; },
    /** 루트보다 더 뒤로 되감으려 한 칸 수 — 0 이 아니면 사용자는 사이트 밖으로 나간다. */
    get __overshoot() { return overshoot; },
    /** pushState 를 브라우저 throttle 처럼 실패시킨다(Safari 가 엄격, Chrome 도 상한이 있다). */
    __throttlePush(on: boolean) { throttled = on; },
  };
}

type FakeWin = ReturnType<typeof makeFakeWindow>;
let win: FakeWin;

/** 모듈 전역 상태(layers/seq/initialized)를 매 테스트마다 새로 만든다 */
async function freshBackstack() {
  vi.resetModules();
  return import('./backstack');
}

/** 예약된 마이크로태스크 + setTimeout(0) 을 모두 소진한다 */
const flush = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  win = makeFakeWindow();
  vi.stubGlobal('window', win);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('backstack · 리마운트/StrictMode 순서', () => {
  it('🔴 정리 직후 같은 태스크에서 다시 열면, 새로 연 레이어가 닫히지 않는다', async () => {
    const { pushLayer } = await freshBackstack();
    const closeA = vi.fn();
    const closeB = vi.fn();

    // React StrictMode 의 이중 이펙트: 실행 → 정리 → 재실행 (전부 같은 커밋 = 같은 태스크)
    const disposeA = pushLayer(closeA);
    disposeA();
    pushLayer(closeB);

    await flush(); // 여기서 A 의 정리가 예약한 back() 이 도착한다

    // 예전 구현은 이 시점에 B 를 닫아버렸다 — 사용자에겐 '모달이 뜨자마자 사라짐' 이었다.
    expect(closeB, '방금 연 레이어가 이전 레이어의 정리 때문에 닫혔다').not.toHaveBeenCalled();
    expect(closeA, '이미 정리된 레이어의 close 가 뒤늦게 불렸다').not.toHaveBeenCalled();
  });

  it('평범하게 열고 닫으면 history 위치가 제자리로 돌아온다(균형)', async () => {
    const { pushLayer } = await freshBackstack();
    const start = win.__index;

    const dispose = pushLayer(vi.fn());
    expect(win.__index, '열 때 history 항목을 안 밀어넣었다. 뒤로가기로 못 닫는다').toBe(start + 1);

    dispose();
    await flush();
    expect(win.__index, '닫았는데 history 가 제자리로 안 왔다. 다음 뒤로가기가 헛돈다').toBe(start);
  });

  it('뒤로가기는 최상단 한 겹만 닫는다(LIFO)', async () => {
    const { pushLayer } = await freshBackstack();
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    pushLayer(closeOuter);
    pushLayer(closeInner);

    win.history.back(); // 사용자가 뒤로가기 1회
    await flush();

    expect(closeInner, '뒤로가기로 최상단이 안 닫혔다').toHaveBeenCalledTimes(1);
    expect(closeOuter, '뒤로가기 한 번에 두 겹이 한꺼번에 닫혔다').not.toHaveBeenCalled();
  });

  it('여닫기를 반복해도 죽은 history 항목이 쌓이지 않는다', async () => {
    const { pushLayer } = await freshBackstack();
    const start = win.__index;
    for (let i = 0; i < 3; i++) {
      const d = pushLayer(vi.fn());
      d();
      await flush();
    }
    expect(win.__index, '여닫을 때마다 항목이 쌓여 뒤로가기가 헛돈다').toBe(start);
  });
});

// ── 2026-08-28 근치: '뒤로가기가 아무 일도 안 한다 / 홈으로 튄다' 의 실제 기전들 ──────
describe('backstack · 항목·레이어 1:1 불변식', () => {
  it('🔴 화면 교체(닫으면서 같은 커밋에 다른 겹 열기)에 유령 항목이 남지 않는다', async () => {
    // 실제 경로: 포스터 상세에서 매장명을 누르면 상세를 닫고 매장 페이지를 연다(handleVenueClick).
    // 예전 구현은 상세의 항목을 그대로 남겨서, 매장 페이지를 닫은 뒤의 뒤로가기 한 번이
    // 통째로 죽었다('먹통'). 항목 수는 교체 전후로 같아야 한다.
    const { pushLayer } = await freshBackstack();
    const start = win.__index;

    const closeA = vi.fn();
    const disposeA = pushLayer(closeA);
    expect(win.__index).toBe(start + 1);

    const closeB = vi.fn();
    disposeA();                 // 상세 닫힘(같은 커밋)
    const disposeB = pushLayer(closeB); // 매장 페이지 열림
    await flush();

    expect(win.__index, '겹을 교체했는데 history 항목이 늘었다. 죽은 칸이 뒤로가기를 삼킨다')
      .toBe(start + 1);
    expect(closeB, '교체 직후 새 겹이 스스로 닫혔다').not.toHaveBeenCalled();

    disposeB();
    await flush();
    expect(win.__index, '교체된 겹을 닫았는데 제자리로 안 왔다').toBe(start);
  });

  it('🔴 한 커밋에 여러 겹을 닫으면 history 도 그만큼 되돌아온다', async () => {
    // 실제 경로: 로고 클릭 = 모든 모달/패널 닫기. 겹마다 back() 을 부르던 예전 구현은
    // 순서가 어긋나 한 칸 더 돌아가거나(앱 이탈) 덜 돌아갔다(유령 칸).
    const { pushLayer } = await freshBackstack();
    const start = win.__index;
    const d1 = pushLayer(vi.fn());
    const d2 = pushLayer(vi.fn());
    expect(win.__index).toBe(start + 2);
    d2(); d1();
    await flush();
    expect(win.__index, '두 겹을 닫았는데 history 가 두 칸 되돌아오지 않았다').toBe(start);
  });

  it('🔴 replaceState({}) 가 현재 항목의 __layer 토큰을 지우지 않는다', async () => {
    // 실제 경로: 딥링크 정리(?tab=·#tool=·?checkin= 제거)가 `replaceState({}, '', url)` 를 부른다.
    // 토큰이 지워지면 위치가 루트로 오인되어 다음 뒤로가기가 열린 겹을 **전부** 닫는다 → '홈으로 튐'.
    const { pushLayer } = await freshBackstack();
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    pushLayer(closeOuter);
    // 딥링크 정리는 '지금 서 있는 항목' 의 토큰을 지운다. 피해는 그 항목으로 **되돌아올 때** 터진다.
    win.history.replaceState({}, '', '/some/url'); // 앱 곳곳의 URL 정리와 동일한 호출
    pushLayer(closeInner);

    win.history.back(); // inner 한 겹만 닫혀야 한다
    await flush();

    expect(closeInner, '뒤로가기로 최상단이 안 닫혔다').toHaveBeenCalledTimes(1);
    expect(closeOuter, 'replaceState 가 토큰을 지워 두 겹이 한꺼번에 닫혔다. 홈으로 튀는 그 버그')
      .not.toHaveBeenCalled();
  });

  it('🔴 예약(adoptable) 칸을 lazy 컴포넌트가 물려받아도 항목이 늘지 않는다', async () => {
    // 실제 경로: App 이 openSchedule 을 커밋하는 순간 자리를 예약하고, lazy 청크가 도착해
    // 마운트된 ScheduleDetailModal 의 useBackClose 가 그 자리를 물려받는다.
    // 예약이 없으면 청크 로딩 동안의 뒤로가기가 아래 겹(탭)을 닫아 홈으로 튀었다.
    const { pushLayer } = await freshBackstack();
    const start = win.__index;
    const ownerClose = vi.fn();
    const childClose = vi.fn();

    const disposeOwner = pushLayer(ownerClose, { adoptable: true });
    expect(win.__index, '예약이 history 항목을 안 잡았다. 로딩 중 뒤로가기가 아래 겹을 닫는다')
      .toBe(start + 1);

    const disposeChild = pushLayer(childClose); // 뒤늦게 마운트한 컴포넌트
    expect(win.__index, '입양이 안 되고 항목이 하나 더 늘었다. 뒤로가기 한 번이 죽는다')
      .toBe(start + 1);

    win.history.back();
    await flush();
    expect(childClose, '입양한 자식의 onClose 가 아니라 예약자의 close 가 불렸다').toHaveBeenCalledTimes(1);
    expect(ownerClose).not.toHaveBeenCalled();

    disposeChild(); disposeOwner();
    await flush();
    expect(win.__index, '닫은 뒤 history 가 제자리로 안 왔다').toBe(start);
  });
});

// ── 2026-08-28 · "PC 홈을 눌렀더니 사이트가 완전히 튕김"(오너 보고) ────────────────
// entries 배열은 "1칸 = history 1칸" 이라는 가정 위에 서 있다. 그 가정이 깨지는 유일한
// 지점은 **삼켜진 pushState 예외**였다. 브라우저는 단시간 과다 호출(탭 연타)을 throttle 하며
// 예외를 던지는데, 예전 코드는 그걸 무시하고 항목만 남겼다.
//
// 그러면 나중에 여러 겹이 한꺼번에 정리될 때(홈 클릭 = 쌓인 탭 겹 전부 dispose) go(-k) 의
// k 가 실제 소유한 칸보다 커진다. 한 칸만 초과해도 앱 진입 이전으로 나가 **사이트를 이탈**한다.
// 오차가 누적되지 않고 곧바로 이탈로 나타나므로 증상이 '갑자기 튕김' 이다.
describe('backstack · history 칸 회계(사이트 이탈 방지)', () => {
  it('🔴 pushState 가 throttle 로 실패한 겹은 되감지 않는다. 앱 밖으로 나가면 안 된다', async () => {
    const { pushLayer } = await freshBackstack();

    // 정상적으로 칸을 잡은 겹 2개(탭 이동으로 쌓인 것)
    const d1 = pushLayer(vi.fn());
    const d2 = pushLayer(vi.fn());
    expect(win.__index, '정상 push 가 칸을 안 잡았다').toBe(2);

    // 여기서부터 브라우저가 throttle 을 건다 — 칸은 안 늘어나는데 예전 코드는 항목만 쌓았다
    win.__throttlePush(true);
    const d3 = pushLayer(vi.fn());
    const d4 = pushLayer(vi.fn());
    expect(win.__index, 'throttle 중인데 칸이 늘었다. 가짜 history 가 실제와 다르다').toBe(2);
    win.__throttlePush(false);

    // 홈 클릭 = 쌓인 겹을 한 커밋에 전부 정리(오너가 튕김을 본 바로 그 동작)
    d4(); d3(); d2(); d1();
    await flush();

    expect(win.__overshoot, '소유하지 않은 칸까지 되감아 사이트 밖으로 나갔다').toBe(0);
    expect(win.__index, '정리 후 루트로 정확히 돌아와야 한다').toBe(0);
  });

  it('뒤로가기로 소비된 칸을 dispose 가 또 되감지 않는다', async () => {
    const { pushLayer } = await freshBackstack();
    const close = vi.fn();
    const dispose = pushLayer(close);

    win.history.back();   // 사용자가 뒤로가기로 닫음 → 칸은 이미 소비됐다
    await flush();
    expect(close).toHaveBeenCalledTimes(1);

    dispose();            // 컴포넌트 언마운트가 뒤늦게 정리를 부른다
    await flush();

    expect(win.__overshoot, '이미 소비된 칸을 한 번 더 되감았다. 한 칸씩 밀려 결국 이탈한다').toBe(0);
    expect(win.__index).toBe(0);
  });

  it('깊게 쌓았다 한 번에 정리해도 정확히 시작 위치로만 돌아온다', async () => {
    const { pushLayer } = await freshBackstack();
    const disposers = Array.from({ length: 12 }, () => pushLayer(vi.fn()));
    expect(win.__index).toBe(12);

    for (let i = disposers.length - 1; i >= 0; i--) disposers[i]();
    await flush();

    expect(win.__overshoot, '12겹을 정리하면서 앱 진입 지점을 넘어 되감았다').toBe(0);
    expect(win.__index).toBe(0);
  });
});

// ── 2026-09-10 · ESC 는 뒤로가기와 같은 규칙(MODAL-01) ────────────────────────────
// 예전엔 Modal·라이트박스·매장 페이지·장부 오버레이가 저마다 window 에 ESC 리스너를 달아,
// 겹쳐 열린 상태(포스터 상세 위 글쓰기 시트)에서 ESC 한 번에 **전부** 닫혔다.
// 이제 리스너는 backstack 하나뿐이고 최상단 살아 있는 한 겹만 닫는다 — 단 escape 로 등록한 겹만.
describe('backstack · ESC 는 최상단 한 겹만(escape 등록 겹만)', () => {
  it('🔴 겹친 두 모달에서 ESC 한 번은 위 겹만 닫는다', async () => {
    const { pushLayer } = await freshBackstack();
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    pushLayer(closeOuter, { escape: true }); // 포스터 상세(page Modal)
    pushLayer(closeInner, { escape: true }); // 그 위 글쓰기 시트

    win.__esc();
    expect(closeInner, 'ESC 로 최상단이 안 닫혔다').toHaveBeenCalledTimes(1);
    expect(closeOuter, 'ESC 한 번에 두 겹이 한꺼번에 닫혔다 — 개별 ESC 리스너 시절의 그 버그').not.toHaveBeenCalled();
  });

  it('🔴 최상단이 escape 아닌 겹(탭 이력·섹션 상태)이면 ESC 는 아무것도 닫지 않는다', async () => {
    // 실제 경로: 내 매장 → 장부 섹션(useBackClose 로 등록, ESC 대상 아님)에서 ESC 를 눌렀는데
    // 대시보드로 튀면 안 된다. 그 아래에 있는 모달까지 대신 닫아서도 안 된다(LIFO 를 건너뛰면 뒤로가기와 어긋난다).
    const { pushLayer } = await freshBackstack();
    const closeModal = vi.fn();
    const closeTrail = vi.fn();
    pushLayer(closeModal, { escape: true });
    pushLayer(closeTrail); // escape 기본값 false — 탭 이력이 직접 pushLayer 하는 형태와 같다

    win.__esc();
    expect(closeTrail, '탭 이력·섹션 겹이 ESC 로 닫혔다(화면이 튄다)').not.toHaveBeenCalled();
    expect(closeModal, 'escape 아닌 최상단을 건너뛰고 아래 겹을 닫았다').not.toHaveBeenCalled();
  });

  it('예약(adoptable) 칸은 ESC 대상이다(오버레이 취소) — 입양한 자식의 규칙을 따르고, 자식이 떠나면 예약자 규칙으로 돌아간다', async () => {
    // 실제 경로: App 이 openSchedule 을 커밋하며 자리를 예약(청크 로딩 중, 화면 아직 없음) → lazy 청크가 마운트되며 Modal 이 입양.
    // 예약 칸을 ESC 대상에서 빼면(2026-09-10 이전 계약) 아래 '자식 이펙트가 먼저' 케이스에서 ESC 가 통째로 죽는다.
    const { pushLayer } = await freshBackstack();
    const ownerClose = vi.fn();
    const childClose = vi.fn();
    pushLayer(ownerClose, { adoptable: true });

    win.__esc();
    expect(ownerClose, '청크 로딩 중 ESC 는 열림 상태를 취소해야 한다(예약 칸 = 오버레이)').toHaveBeenCalledTimes(1);

    const disposeChild = pushLayer(childClose, { escape: true });
    win.__esc();
    expect(childClose, '입양한 Modal 이 ESC 로 안 닫혔다').toHaveBeenCalledTimes(1);
    expect(ownerClose, '입양된 뒤엔 자식 close 만 불려야 한다').toHaveBeenCalledTimes(1);

    disposeChild(); // 자식 언마운트 — 칸은 예약자에게 돌아간다(예약자 규칙 = ESC 대상)
    win.__esc();
    expect(ownerClose, '자식이 떠난 뒤 예약자 칸이 ESC 대상으로 돌아오지 않았다').toHaveBeenCalledTimes(2);
  });

  it('🔴 자식 이펙트가 부모보다 먼저 돌아(청크가 이미 로드된 두 번째 열기) 자식 겹 위에 예약 칸이 얹혀도 ESC 가 닫는다', async () => {
    // React 규칙: 같은 커밋에서 자식 useEffect 가 부모보다 먼저 실행된다. 청크가 로드돼 있으면 Modal(자식)이 먼저
    // 자기 겹을 밀고, 그 위에 App(부모)의 예약 칸이 올라온다. 예약 칸이 ESC 대상이 아니면 최상단이 예약 칸이라
    // ESC 가 아무것도 닫지 않는다 — 포스터 상세·매장 페이지·로그인 등 예약형 오버레이 13종 전부에서 ESC 가 죽던 회귀.
    const { pushLayer } = await freshBackstack();
    const ownerClose = vi.fn();
    const childClose = vi.fn();
    pushLayer(childClose, { escape: true });      // 자식(Modal) 먼저
    pushLayer(ownerClose, { adoptable: true });   // 그 위에 App 의 예약 칸

    win.__esc();
    expect(ownerClose, '최상단 예약 칸이 ESC 를 받아 열림 상태를 취소해야 한다').toHaveBeenCalledTimes(1);
    expect(childClose, 'ESC 한 번에 두 겹이 닫히면 안 된다').not.toHaveBeenCalled();
  });

  it('ESC 로 닫은 겹의 dispose 가 history 를 한 칸만 되돌린다(균형)', async () => {
    const { pushLayer } = await freshBackstack();
    const start = win.__index;
    let dispose: () => void = () => {};
    // 실제 Modal 처럼 close → 상태 닫힘 → 언마운트 → dispose 순서
    dispose = pushLayer(() => dispose(), { escape: true });
    expect(win.__index).toBe(start + 1);

    win.__esc();
    await flush();
    expect(win.__index, 'ESC 로 닫았는데 history 가 제자리로 안 왔다').toBe(start);
    expect(win.__overshoot).toBe(0);
  });
});
