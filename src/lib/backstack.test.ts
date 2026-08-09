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
  const popHandlers: (() => void)[] = [];

  const history = {
    get state() { return entries[index]; },
    get length() { return entries.length; },
    pushState(s: unknown) {
      entries.splice(index + 1); // 앞쪽 항목은 잘려나간다(브라우저와 동일)
      entries.push(s);
      index += 1;
    },
    replaceState(s: unknown) { entries[index] = s; },
    back() {
      // ⚠ 핵심: 실제 history.back() 은 즉시 반영되지 않는다. 다음 매크로태스크에 popstate 가 온다.
      //   이 지연이 바로 버그의 원인이었으므로, 가짜에서도 반드시 비동기여야 한다.
      setTimeout(() => {
        if (index > 0) index -= 1;
        popHandlers.forEach((h) => h());
      }, 0);
    },
  };
  return {
    history,
    addEventListener(type: string, h: () => void) { if (type === 'popstate') popHandlers.push(h); },
    removeEventListener() { /* 이 테스트에서는 해제하지 않는다 */ },
    get __index() { return index; },
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

describe('backstack — 리마운트/StrictMode 순서', () => {
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
    expect(win.__index, '열 때 history 항목을 안 밀어넣었다 — 뒤로가기로 못 닫는다').toBe(start + 1);

    dispose();
    await flush();
    expect(win.__index, '닫았는데 history 가 제자리로 안 왔다 — 다음 뒤로가기가 헛돈다').toBe(start);
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
