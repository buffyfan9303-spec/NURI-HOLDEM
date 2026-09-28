// src/lib/businessDate.ts — 매장 '영업일' 단일 원천(B1, 2026-09-28).
//
// 왜 필요한가: 서버는 바인 요청·직원 장부 가드에 `ledger_business_date(venue)` 를 쓴다
//   = KST 어제~오늘 사이 **안 닫힌 장부**가 있으면 그 날짜, 없으면 KST 오늘.
//   자정을 넘긴 토너(19:00~02:00)에서 서버는 '어제'를 보는데 화면(대시보드·장부 초기 날짜·게임 칩·정산 기본 날짜)은
//   달력 오늘(kstToday)을 봐서, 00:30 에 대시보드가 '미시작'이 되고 손님 바인 요청(날짜=어제)이 대기열에서 사라졌다.
// 규칙: 화면이 '오늘 장부'를 말할 때는 전부 이 값을 쓴다. 판정은 서버 함수 하나뿐 — 여기서 규칙을 다시 쓰지 않는다.
//   모를 때(첫 렌더·실패·Mock)는 kstToday 로 둔다(종전 동작).
import { useEffect, useSyncExternalStore } from 'react';
import { supabase, IS_MOCK } from './supabase';
import { kstToday } from './kst';

const DAY = 86_400_000;
const cache = new Map<string, string>();
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

/** 캐시가 지금도 말이 되는가 — 영업일은 KST 어제·오늘 둘 중 하나다. 그 밖(날이 바뀐 낡은 값)은 버린다. */
function plausible(d: string | undefined, nowMs: number): d is string {
  return !!d && (d === kstToday(nowMs) || d === kstToday(nowMs - DAY));
}

/** 지금 아는 영업일(동기). 모르면 KST 오늘. */
export function businessDateOf(venueId: string | null | undefined, nowMs: number = Date.now()): string {
  const d = venueId ? cache.get(venueId) : undefined;
  return plausible(d, nowMs) ? d : kstToday(nowMs);
}

/** 서버에 영업일을 묻고 캐시한다. 실패하면 캐시를 건드리지 않고 지금 아는 값을 돌려준다(장부를 막지 않는다). */
export async function refreshBusinessDate(venueId: string | null | undefined): Promise<string> {
  if (!venueId || IS_MOCK) return businessDateOf(venueId);
  const { data, error } = await supabase.rpc('ledger_business_date', { p_venue_id: venueId });
  if (!error && typeof data === 'string' && plausible(data, Date.now())) {
    if (cache.get(venueId) !== data) { cache.set(venueId, data); notify(); }
  }
  return businessDateOf(venueId);
}

/** 테스트 전용 — 모듈 캐시 초기화. */
export function __resetBusinessDateCache(): void { cache.clear(); notify(); }

function subscribe(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

/**
 * 매장 영업일 훅. 보일 때(active) 한 번, 창이 다시 보일 때, 그리고 보이는 동안 1분마다 서버에 다시 묻는다
 * (자정·마감으로 영업일이 넘어가는 순간을 놓치지 않게). 숨은 탭(keep-alive)에서는 묻지 않는다.
 * 1분 틱은 캐시가 그대로여도 다시 그리게 한다 — 캐시 없는 매장은 자정에 달력 오늘로 넘어가야 한다.
 */
export function useBusinessDate(venueId: string | null | undefined, active = true): string {
  const d = useSyncExternalStore(subscribe, () => businessDateOf(venueId), () => businessDateOf(venueId));
  useEffect(() => {
    if (!active || !venueId) return;
    void refreshBusinessDate(venueId);
    const onVis = () => { if (document.visibilityState === 'visible') void refreshBusinessDate(venueId); };
    document.addEventListener('visibilitychange', onVis);
    const t = window.setInterval(() => { void refreshBusinessDate(venueId).then(() => notify()); }, 60_000);
    return () => { document.removeEventListener('visibilitychange', onVis); window.clearInterval(t); };
  }, [venueId, active]);
  return d;
}
