// src/lib/serverTime.ts — 서버 시각 오프셋 단일 원천(D1, 2026-09-28).
//
// 왜 필요한가: 클락의 ends_at 은 절대 시각인데, 쓰는 기기도 읽는 기기도 **자기 기기 시계**(Date.now)로 계산했다.
//   5분 빠른 폰이 START 를 누르면 제대로 맞는 TV 에 20분 레벨이 25:00 으로 보였고(실측 스크립트 FAIL),
//   5분 빠른 PC 는 레벨을 5분 일찍 넘겼다. 기기마다 '서버 시각 − 내 시각' 을 한 번 재 두고
//   클락 계산은 전부 serverNow() 를 쓰면 기기 시계가 틀려도 모두 같은 순간을 본다.
// 재는 법: 읽기 RPC `server_now()`(select now()) 왕복의 중간점. 왕복이 5초를 넘으면 버린다(오차가 더 크다).
// 함수가 아직 없거나(42883/PGRST202) 실패하면 오프셋 0 = 종전 동작. 10분마다 다시 잰다.
// ⚠ 이 파일은 첫 화면 경로(lib/clockLevel → regStatus)에 실린다 — 무거운 import 를 두지 않는다.
import { supabase, IS_MOCK } from './supabase';

const RESYNC_MS = 10 * 60_000;
const MAX_RTT_MS = 5_000;
let offset = 0;
let syncedAt = 0;
let inflight: Promise<number> | null = null;

/** 서버 기준 지금(ms). 첫 호출 때 백그라운드로 오프셋을 잰다 — 재는 동안은 기기 시계 그대로다. */
export function serverNow(): number {
  maybeSync();
  return Date.now() + offset;
}

/** 지금 쓰고 있는 오프셋(ms, 서버 − 기기). 진단·테스트용. */
export function serverOffsetMs(): number { return offset; }

function maybeSync(): void {
  if (IS_MOCK || inflight || (syncedAt && Date.now() - syncedAt < RESYNC_MS)) return;
  inflight = syncServerTime().finally(() => { inflight = null; });
}

/** 서버 시각을 한 번 재고 오프셋을 갱신한다. 실패하면 이전 오프셋을 유지한다. */
export async function syncServerTime(): Promise<number> {
  const t0 = Date.now();
  syncedAt = t0;   // 실패해도 10분 동안 다시 두드리지 않는다
  try {
    const { data, error } = await supabase.rpc('server_now');
    const t1 = Date.now();
    syncedAt = t1;
    if (error || typeof data !== 'string') return offset;
    const srv = Date.parse(data);
    if (!Number.isFinite(srv) || t1 - t0 > MAX_RTT_MS) return offset;
    offset = Math.round(srv - (t0 + t1) / 2);
  } catch { /* 네트워크 실패 — 이전 오프셋 유지 */ }
  return offset;
}

/** 테스트 전용. */
export function __setServerOffsetForTest(ms: number, synced = true): void { offset = ms; syncedAt = synced ? Date.now() : 0; }
