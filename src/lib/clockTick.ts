// src/lib/clockTick.ts — 클락 초 갱신 한 벌 (K9, 2026-09-29 실측).
//
// 왜: 컴포넌트마다 마운트 시점에 따라 위상이 다른 1초 setInterval 을 돌렸다(ClockStage 안에만 다섯 개).
//   그래서 같은 순간 TV 와 리모컨이 최대 1초 달랐고, 레벨 경계에서 TV 는 +800ms · 리모컨은 +651ms 에 바뀌었다.
//   여기서는 **전역 100ms 틱 하나**를 모든 구독자가 공유하고, 각자 '보여 줄 초' 가 바뀔 때만 다시 그린다(같은 값 setState 는 렌더 없음).
//   초의 기준은 서버 기준 `ends_at` 의 올림 경계라 모든 기기가 같은 순간(±100ms)에 넘어간다.
import { useEffect, useState } from 'react';
import { serverNow } from './serverTime';

const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function keyOf(endsAt: string | null | undefined, running: boolean): number {
  const now = serverNow();
  const end = running && endsAt ? Date.parse(endsAt) : NaN;
  return Number.isFinite(end) ? Math.ceil((end - now) / 1000) : Math.floor(now / 1000);
}

/** 이 클락의 표시 초가 바뀔 때마다 다시 그린다. 반환값은 쓰지 않아도 된다(재렌더 트리거). */
export function useClockSecond(g: { endsAt?: string | null; running?: boolean } | null | undefined, enabled = true): number {
  const endsAt = g?.endsAt ?? null;
  const running = !!g?.running;
  const [k, setK] = useState(() => keyOf(endsAt, running));
  useEffect(() => {
    if (!enabled) return;
    const f = () => setK(keyOf(endsAt, running));
    f();
    subs.add(f);
    if (!timer) timer = setInterval(() => { for (const s of subs) s(); }, 100);
    return () => {
      subs.delete(f);
      if (!subs.size && timer) { clearInterval(timer); timer = null; }
    };
  }, [endsAt, running, enabled]);
  return k;
}
