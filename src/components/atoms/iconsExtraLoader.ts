// src/components/atoms/iconsExtraLoader.ts — 첫 화면 밖 lucide 아이콘(iconsExtra.ts) 청크를 받는 곳(2026-10-07 번들 감축 PR A ③).
//
// 깜빡임을 막는 세 겹:
//   ① lazyWithReload 가 화면 청크와 **같이** 이 청크를 기다린다 → lazy 화면은 첫 프레임부터 아이콘이 있다.
//   ② 첫 화면이 다 뜬 뒤(load + 유휴) 미리 받는다 → 사용자가 무엇을 누르기 전에 대개 끝나 있다.
//   ③ 그래도 아직이면 Icon 이 **같은 크기의 빈 svg** 를 그렸다가 도착하면 채운다(레이아웃 이동 0) —
//      그 순간은 DOM 에 data-icon-pending 이 남아 측정·e2e 가 셀 수 있다.
// 첫 화면 파일이 여기 아이콘을 쓰면 ③ 으로 떨어진다 → iconsCore.contract.test.ts 가 막는다.
import type { LucideIcon } from 'lucide-react';
import type { IconName } from './Icon';

type Extra = Partial<Record<IconName, LucideIcon>>;
let extra: Extra | undefined;
let pending: Promise<void> | undefined;
const subs = new Set<() => void>();

export const getIconsExtra = (): Extra | undefined => extra;

export function subscribeIconsExtra(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

/** 한 번만 받는다. 실패하면 비워 다음 호출이 다시 시도한다(던지는 것은 호출부가 삼킨다). */
export function loadIconsExtra(): Promise<void> {
  return (pending ??= import('./iconsExtra').then(
    (m) => { extra = m.EXTRA; subs.forEach((fn) => fn()); },
    (err) => { pending = undefined; throw err; },
  ));
}

// ② 미리 받기 — 첫 화면 데이터 요청과 다투지 않게 load 뒤 유휴에. 브라우저에서만.
if (typeof window !== 'undefined') {
  type IdleWin = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const w = window as IdleWin;
  const go = () => { loadIconsExtra().catch(() => {}); };
  const schedule = () => (w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 2000 }) : setTimeout(go, 1000));
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}
