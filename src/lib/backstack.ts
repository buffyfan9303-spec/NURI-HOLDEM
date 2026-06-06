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
// 프로그램적으로 history.back() 을 호출할 때, 그로 인해 발생하는 popstate 가
// 또 다른 닫기를 유발하지 않도록 한 번만 무시하기 위한 플래그.
let suppress = false;

function handlePop() {
  if (suppress) {
    suppress = false;
    return;
  }
  const top = layers.pop();
  if (top) {
    top.close();
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
    if (idx === -1) return; // 이미 Back 으로 제거됨 → 추가 정리 불필요
    layers.splice(idx, 1);
    // 최상단(자기 자신이 마지막)일 때만 history 항목을 되돌려 균형을 맞춘다.
    if (idx === layers.length) {
      suppress = true;
      try {
        window.history.back();
      } catch {
        suppress = false;
      }
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
