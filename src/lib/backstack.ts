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
//
// ── 2026-08-28 근치(오너 지적: "뒤로가기를 누르기 무서워") ────────────────────
// 오너가 겪은 두 증상은 같은 뿌리에서 나온다: **history 항목과 레이어가 1:1 이 아니었다.**
//
//   ⓐ 유령 항목 → 뒤로가기가 '아무 일도 안 하는' 죽은 입력이 된다
//      예전 정리 로직은 "내가 최상단일 때만 back()" 이었다. 그래서 포스터 상세를 닫으면서
//      같은 커밋에 매장 페이지를 여는 흐름(handleVenueClick)에선 상세의 항목이 그대로 남았다.
//      사용자에겐 '뒤로가기를 눌렀는데 화면이 그대로' 로 보인다 — 이게 '먹통' 의 절반이다.
//      → 이제 항목 배열(entries)을 직접 들고, 죽은 꼬리는 microtask 에서 go(-k) 로 한 번에
//        정리한다. 정리 직후 새 레이어가 오면 **그 칸을 replaceState 로 재사용**한다(칸 증식 0).
//
//   ⓑ __layer 토큰 유실 → 뒤로가기가 여러 겹을 한꺼번에 닫아 '홈으로' 튄다
//      앱 곳곳이 딥링크 정리용으로 `history.replaceState({}, '', url)` 를 부르는데,
//      그 호출은 **현재 항목의 __layer 토큰을 지워** 위치를 루트(0)로 오인하게 만든다.
//      그러면 다음 popstate 에서 "현재 위치보다 위" 판정에 걸려 열린 겹이 전부 닫힌다.
//      → replaceState 를 한 겹 감싸 토큰만 보존한다(URL·나머지 state 는 손대지 않는다).
//
//   ⓒ lazy 오버레이의 '등록 지연' → 열자마자 누른 뒤로가기가 엉뚱한 겹을 닫는다
//      오버레이 컴포넌트는 대부분 lazy 청크다. 상태는 이미 '열림' 인데 컴포넌트가 아직
//      마운트되지 않아 레이어가 없다 — 그 사이의 뒤로가기는 아래 겹(탭)을 닫아 홈으로 튄다.
//      → App 이 '열림 상태' 를 커밋하는 순간 { adoptable: true } 로 자리를 **예약**하고,
//        뒤늦게 마운트한 컴포넌트의 pushLayer 가 그 자리를 **물려받는다**(항목을 새로 밀지 않음).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';

type CloseFn = () => void;

interface Layer {
  id: number;
  /** 뒤로가기/정리가 호출할 닫기 콜백 — 입양되면 자식의 onClose 로 바뀐다 */
  close: CloseFn;
  /** App 이 '열림 상태' 커밋과 동시에 예약한 칸인가(= lazy 컴포넌트가 물려받을 수 있는가) */
  adoptable: boolean;
  /** 입양한 자식의 close (없으면 null) */
  adoptedBy: CloseFn | null;
  /** 예약자(App)의 원래 close — 자식이 언마운트하면 여기로 되돌린다 */
  ownerClose: CloseFn;
  /** false = 닫혔지만 history 칸이 아직 남아 있는 '죽은 꼬리' */
  live: boolean;
}

/** history 항목과 1:1. 배열 순서 = history 순서(뒤로 갈수록 앞). */
const entries: Layer[] = [];
let seq = 0;
let initialized = false;

/** 현재 history 위치의 레이어 토큰(없으면 0 = 앱 루트). */
function currentLayerId(): number {
  const st = window.history.state as { __layer?: number } | null;
  return st && typeof st.__layer === 'number' ? st.__layer : 0;
}

function handlePop() {
  // 현재 history 위치(__layer)보다 "위에" 쌓여 있는 항목은 전부 소비된 것이다.
  //  - 한 번 뒤로가기 → 최상단 한 겹만 닫힘(다음 항목 id ≤ 현재이므로 멈춤)
  //  - 여러 번 빠르게 뒤로가기 → 각 popstate 마다 해당 위치까지 정리
  // history.state 토큰만 보고 판단하므로 프로그램적 back 과의 경쟁(suppress 플래그)이 없다.
  const cur = currentLayerId();
  while (entries.length && entries[entries.length - 1].id > cur) {
    const top = entries.pop()!;
    if (!top.live) continue; // 이미 닫힌 죽은 칸 — 소비만 하고 넘어간다
    top.live = false;
    try { top.close(); } catch { /* 닫기 콜백 오류는 무시하고 스택 정리 계속 */ }
  }
}

// 죽은 꼬리 정리는 마이크로태스크 1회로 모은다.
//   · 한 커밋에서 여러 겹이 동시에 닫히면(예: 로고 클릭 = 전부 닫기) go(-k) 한 번으로 끝난다.
//     겹마다 back() 을 부르면 순서가 어긋나 '한 칸 더' 돌아가는 사고가 난다.
//   · 정리와 같은 커밋에서 새 레이어가 올라오면(StrictMode 이중 이펙트·화면 교체 전환)
//     아래 pushEntry 가 그 칸을 재사용하므로 여기서 할 일이 없어진다.
let balanceQueued = false;
function scheduleBalance() {
  if (balanceQueued) return;
  balanceQueued = true;
  queueMicrotask(() => {
    balanceQueued = false;
    let k = 0;
    while (entries.length && !entries[entries.length - 1].live) { entries.pop(); k++; }
    if (k > 0) {
      try { window.history.go(-k); } catch { /* pushState 불가 환경 — 무시 */ }
    }
  });
}

function init() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('popstate', handlePop);

  // ⓑ __layer 토큰 보존 — 딥링크 정리(`replaceState({}, '', url)`)가 현재 항목의 토큰을
  //   지우면 위치가 루트로 오인되어 다음 뒤로가기가 열린 겹을 전부 닫는다('홈으로 튐').
  //   호출자가 __layer 를 직접 주지 않는 한, 지금 항목의 토큰을 그대로 얹어 준다.
  try {
    const raw = window.history.replaceState.bind(window.history);
    window.history.replaceState = function (state: unknown, unused: string, url?: string | URL | null) {
      let next = state;
      if (!(state && typeof state === 'object' && '__layer' in (state as object))) {
        const cur = currentLayerId();
        if (cur) next = { ...(state as object | null ?? {}), __layer: cur };
      }
      return raw(next as never, unused, url as never);
    } as typeof window.history.replaceState;
  } catch { /* 일부 환경에서 history 를 재정의할 수 없어도 앱은 계속 동작 */ }

  // 새로고침·bfcache 복원으로 예전 세션의 __layer 토큰이 남아 있을 수 있다.
  // 그 값보다 작은 id 로 새 레이어를 쌓으면 "현재 위치보다 위" 판정이 영영 성립하지 않아
  // 뒤로가기가 아무것도 못 닫는다 — 시퀀스를 복원값 위에서 시작한다.
  seq = Math.max(seq, currentLayerId());
}

function pushEntry(layer: Layer) {
  const top = entries.length ? entries[entries.length - 1] : null;
  // 죽은 꼬리가 바로 지금 위치라면 그 칸을 **재사용**한다 — 새 항목을 밀지 않으므로
  // (정리 back + 새 push) 가 만들던 유령 칸이 아예 생기지 않는다.
  if (top && !top.live && currentLayerId() === top.id) {
    entries.pop();
    entries.push(layer);
    try { window.history.replaceState({ __layer: layer.id }, ''); } catch { /* 무시 */ }
    return;
  }
  entries.push(layer);
  try { window.history.pushState({ __layer: layer.id }, ''); } catch { /* 무시 */ }
}

export interface PushLayerOptions {
  /**
   * true = '자리 예약'. lazy 오버레이는 상태가 열린 뒤 한참 있다가 마운트되므로,
   * App 이 상태 커밋과 동시에 이 옵션으로 칸을 잡아 둔다. 뒤늦게 마운트한 컴포넌트의
   * pushLayer 가 이 칸을 물려받아(입양) history 항목이 두 개로 불어나지 않는다.
   */
  adoptable?: boolean;
}

/**
 * 오버레이 한 겹을 연다. history 항목 1개를 push 하고 스택에 등록한다.
 * @returns disposer — X/ESC 등으로 닫을 때 호출하면 history 를 균형 있게 정리한다.
 */
export function pushLayer(close: CloseFn, opts?: PushLayerOptions): () => void {
  init();

  // ⓒ 입양: 최상단이 '아직 주인 없는 예약 칸' 이면 새 항목을 밀지 않고 그 칸의 close 만 넘겨받는다.
  //   칸의 수명은 예약자(App 상태)가 갖는다 — 자식이 잠시 언마운트해도 뒤로가기가 죽지 않는다.
  const top = entries.length ? entries[entries.length - 1] : null;
  if (!opts?.adoptable && top && top.live && top.adoptable && !top.adoptedBy) {
    top.adoptedBy = close;
    top.close = close;
    let reverted = false;
    return () => {
      if (reverted) return;
      reverted = true;
      if (top.adoptedBy === close) { top.adoptedBy = null; top.close = top.ownerClose; }
    };
  }

  const id = ++seq;
  const layer: Layer = {
    id, close, adoptable: !!opts?.adoptable, adoptedBy: null, ownerClose: close, live: true,
  };
  pushEntry(layer);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const l = entries.find((e) => e.id === id);
    if (!l || !l.live) return; // 이미 Back 으로 소비됨 → 추가 정리 불필요
    l.live = false;
    scheduleBalance();
  };
}

/**
 * 훅: `open` 인 동안 브라우저/모바일 뒤로가기로 이 오버레이만 닫는다.
 * 모든 모달/풀스크린 페이지가 이 훅 하나로 동일하게 동작한다.
 *
 * @param opts.adoptable App 이 소유한 오버레이 상태에서 쓴다 — lazy 컴포넌트가 마운트되면
 *        그 컴포넌트의 useBackClose 가 이 칸을 물려받는다(항목 중복 없음).
 */
export function useBackClose(open: boolean, onClose: CloseFn, opts?: PushLayerOptions): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  const adoptable = !!opts?.adoptable;
  useEffect(() => {
    if (!open) return;
    const dispose = pushLayer(() => ref.current(), adoptable ? { adoptable: true } : undefined);
    return dispose;
  }, [open, adoptable]);
}

/** 테스트 전용 — 현재 살아 있는 레이어 수(항목 수가 아니라 '열린 겹'). */
export function __liveLayerCount(): number {
  return entries.filter((e) => e.live).length;
}
