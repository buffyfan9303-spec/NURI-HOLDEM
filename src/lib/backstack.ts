// src/lib/backstack.ts
// ─────────────────────────────────────────────────────────────────────────────
// 중앙 집중식 "뒤로가기(Back) 스택" 매니저
//
// 문제: 모달·풀스크린 페이지마다 제각각 history.pushState/popstate 를 달면
//   1) 한 번의 뒤로가기에 여러 리스너가 동시에 반응해 여러 겹이 한꺼번에 닫히고
//   2) history 항목 수와 열린 오버레이 수가 어긋나 결국 "뒤로가기 → 앱이 꺼짐"
//   이 발생한다.
//
// 해결: 단 하나의 popstate 리스너 + LIFO(마지막에 연 것 먼저 닫힘) 스택.
//   - 오버레이가 "열릴 때" pushLayer() → history 항목 1개 push + 스택에 등록
//   - 사용자가 Back → 최상단 한 겹만 닫는다
//   - X/ESC/배경클릭 등 프로그램적으로 닫을 때 → disposer 가 history 를 1개 정리
//
// 모든 오버레이는 useBackClose(open, onClose) 훅만 쓰면 된다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';

type CloseFn = () => void;
interface Layer {
  id: number;
  close: CloseFn;
}

const layers: Layer[] = [];
let seq = 0;
let initialized = false;
// 마지막으로 오버레이가 닫힌(dispose) 시각. 모달 닫힘이 부르는 history.back() 이
// (탭 레이어의 pushState 가 브라우저에 throttle 되어 누락된 경우) 루트까지 되돌아가
// 탭 back-close(예: changeTab('browse'))를 잘못 발동시키는 것을 막는 디바운스용.
let lastDisposeAt = 0;
/** 직전 ~ms 내에 오버레이가 닫혔으면 true — 탭 back-close 가 잘못 발동하는 것을 억제한다. */
export function overlayJustClosed(withinMs = 600): boolean {
  return lastDisposeAt > 0 && Date.now() - lastDisposeAt < withinMs;
}
// 현재 history 위치의 레이어 토큰(없으면 0 = 앱 루트).
function currentLayerId(): number {
  const st = window.history.state as { __layer?: number } | null;
  return st && typeof st.__layer === 'number' ? st.__layer : 0;
}

function handlePop() {
  // 현재 history 위치(__layer)보다 "위에" 쌓여 있는 레이어를 전부 닫는다.
  //  - 한 번 뒤로가기 → 최상단 한 겹만 닫힘(다음 레이어 id ≤ 현재이므로 멈춤)
  //  - 여러 번 빠르게 뒤로가기 → 각 popstate 마다 해당 위치까지 정리
  // history.state 토큰만 보고 판단하므로 프로그램적 back 과의 경쟁(suppress 플래그)이 없다.
  const cur = currentLayerId();
  while (layers.length && layers[layers.length - 1].id > cur) {
    const top = layers.pop()!;
    try { top.close(); } catch { /* 닫기 콜백 오류는 무시하고 스택 정리 계속 */ }
  }
  // 스택이 비어 있으면(열린 오버레이 없음) 진짜 앱-레벨 뒤로가기이므로 그대로 둔다.
}

function init() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('popstate', handlePop);
}

/**
 * 오버레이 한 겹을 연다. history 항목 1개를 push 하고 스택에 등록한다.
 * @returns disposer — X/ESC 등으로 닫을 때 호출하면 history 를 균형 있게 정리한다.
 */
export function pushLayer(close: CloseFn): () => void {
  init();
  const id = ++seq;
  layers.push({ id, close });
  try {
    window.history.pushState({ __layer: id }, '');
  } catch {
    /* 일부 환경(파일 프로토콜 등)에서 pushState 가 막혀 있어도 앱은 계속 동작 */
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const idx = layers.findIndex((l) => l.id === id);
    if (idx === -1) return; // 이미 Back 으로 제거됨 → 추가 정리 불필요(브라우저 back이므로 디바운스 불필요)
    layers.splice(idx, 1);
    // 현재 history 위치가 바로 이 레이어라면(최상단을 X/ESC/배경클릭으로 닫음)
    // history 항목을 하나 되돌려 균형을 맞춘다. 레이어를 먼저 제거했으므로,
    // 그로 인해 발생하는 popstate→handlePop 은 이 레이어를 중복으로 닫지 않는다.
    if (currentLayerId() === id) {
      // 프로그램적 close(history.back 호출)만 디바운스 대상 — 이 back이 throttle된 탭 레이어를 과열 pop해
      // 탭 back-close(예: changeTab('browse'))를 잘못 발동시키는 것을 overlayJustClosed()로 억제.
      lastDisposeAt = Date.now();
      // ⚠ back() 을 여기서 바로 부르면 안 된다.
      //   history.back() 은 **비동기**다(popstate 는 다음 태스크에 온다). 그런데 정리 직후
      //   같은 커밋 안에서 레이어가 다시 push 되는 경우가 있다 — React StrictMode 의 이중 이펙트
      //   (실행→정리→재실행)와 리마운트가 그렇다. 그러면 순서가 이렇게 꼬인다.
      //     정리: back() 예약  →  재실행: pushState({__layer:2})  →  뒤늦게 back() 도착
      //   back() 이 도착했을 때 history 최상단은 이미 새 레이어(2)이므로, 한 칸 뒤로 가면
      //   handlePop 이 "2 는 현재 위치보다 위" 라고 판단해 **방금 연 모달을 닫아버린다.**
      //   실제로 `{open && <Modal open/>}` 형태의 모달이 개발 모드에서 전부
      //   '떴다가 즉시 사라지는' 증상을 보였다(프로덕션은 이중 실행이 없어 멀쩡했다).
      //
      //   그래서 back() 을 마이크로태스크로 미루고, 그 사이 최상단이 바뀌었으면 취소한다.
      //   최상단이 더는 내 레이어가 아니라는 건 내가 되돌릴 항목이 이미 아래로 밀렸다는 뜻이고,
      //   그때 back() 은 남의 레이어를 닫는 짓이 된다. 플래그·타이머 없이 토큰만으로 판정된다.
      queueMicrotask(() => {
        if (currentLayerId() !== id) return; // 그 사이 새 레이어가 올라왔다 → 되돌릴 것이 없다
        try { window.history.back(); } catch { /* pushState 불가 환경 — 무시 */ }
      });
    }
    // 중간 겹을 순서 어긋나게 닫은 경우: 해당 history 항목은 그대로 두되(다음 Back 때
    // 무해하게 소비됨) 스택에서만 제거한다. 실사용에서 오버레이는 LIFO 로 닫히므로 드묾.
  };
}

/**
 * 훅: `open` 인 동안 브라우저/모바일 뒤로가기로 이 오버레이만 닫는다.
 * 모든 모달/풀스크린 페이지가 이 훅 하나로 동일하게 동작한다.
 */
export function useBackClose(open: boolean, onClose: CloseFn): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return;
    const dispose = pushLayer(() => ref.current());
    return dispose;
  }, [open]);
}
