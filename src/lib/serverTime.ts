// src/lib/serverTime.ts — 서버 시각 오프셋 단일 원천(D1, 2026-09-28).
//
// 왜 필요한가: 클락의 ends_at 은 절대 시각인데, 쓰는 기기도 읽는 기기도 **자기 기기 시계**(Date.now)로 계산했다.
//   5분 빠른 폰이 START 를 누르면 제대로 맞는 TV 에 20분 레벨이 25:00 으로 보였고(실측 스크립트 FAIL),
//   5분 빠른 PC 는 레벨을 5분 일찍 넘겼다. 기기마다 '서버 시각 − 내 시각' 을 한 번 재 두고
//   클락 계산은 전부 serverNow() 를 쓰면 기기 시계가 틀려도 모두 같은 순간을 본다.
// 재는 법: 읽기 RPC `server_now()`(select now()) 왕복의 중간점. 왕복이 5초를 넘으면 버린다(오차가 더 크다).
// 함수가 아직 없으면(42883/PGRST202) 오프셋 0 = 종전 동작. 10분마다 다시 잰다.
//
// 🔴 K2(2026-09-29 실측) — '한 번이라도 쟀는가' 를 따로 들고 있어야 한다.
//   예전엔 측정 전·실패 뒤에도 offset 0(기기 시계)을 그대로 돌려주고, 실패해도 10분 동안 다시 재지 않았다.
//   그 창에서 PC 워치독이 +5분 기기 시계로 레벨을 **149초 일찍** 넘겼다(server_now 1.5초 · 첫 호출 503 두 경우 모두).
//   · serverTimeKnown() — 측정에 성공했거나(또는 함수가 아예 없어 기기 시계가 곧 기준인 환경) 참. **자동 쓰기(레벨 전진)는 이것이 참일 때만** 한다.
//   · 실패하면 15초 뒤 다시 잰다(10분이 아니라).
//   · serverTimeSettled() — 첫 측정 시도가 끝났는가(성공·실패 무관). 첫 표시를 이때까지 미룬다(K8: TV 첫 1초가 기기 시계로 레벨까지 틀렸다).
// ⚠ 이 파일은 첫 화면 경로(lib/clockLevel → regStatus)에 실린다 — 무거운 import 를 두지 않는다.
import { supabase, IS_MOCK } from './supabase';

const RESYNC_MS = 10 * 60_000;
const RETRY_MS = 15_000;
const MAX_RTT_MS = 5_000;
let offset = 0;
let syncedAt = 0;
let known = false;
let settled = false;
let inflight: Promise<number> | null = null;
const waiters: (() => void)[] = [];

/** 서버 기준 지금(ms). 첫 호출 때 백그라운드로 오프셋을 잰다 — 재는 동안은 기기 시계 그대로다(쓰기 전에 serverTimeKnown 을 봐라). */
export function serverNow(): number {
  maybeSync();
  return Date.now() + offset;
}

/** 지금 쓰고 있는 오프셋(ms, 서버 − 기기). 진단·테스트용. */
export function serverOffsetMs(): number { return offset; }

/** 서버 기준을 실제로 알고 있는가 — 자동 쓰기(워치독 레벨 전진)의 게이트. */
export function serverTimeKnown(): boolean { maybeSync(); return IS_MOCK || known; }

/** 첫 측정 시도가 끝났는가(성공·실패 무관) — 첫 표시 게이트. */
export function serverTimeSettled(): boolean { maybeSync(); return IS_MOCK || settled; }

/** 첫 측정 시도가 끝나면 풀린다. 쓰기 버튼(시작·시간 ±)이 측정 전이면 이것을 기다렸다가 쓴다. */
export function whenServerTimeSettled(): Promise<void> {
  if (serverTimeSettled()) return Promise.resolve();
  return new Promise((res) => { waiters.push(res); });
}

function maybeSync(): void {
  if (IS_MOCK || inflight) return;
  const every = known ? RESYNC_MS : RETRY_MS;
  if (syncedAt && Date.now() - syncedAt < every) return;
  inflight = syncServerTime().finally(() => { inflight = null; });
}

function settle(): void {
  settled = true;
  while (waiters.length) waiters.shift()!();
}

/** 서버 시각을 한 번 재고 오프셋을 갱신한다. 실패하면 이전 오프셋을 유지하고 15초 뒤 다시 잰다. */
export async function syncServerTime(): Promise<number> {
  const t0 = Date.now();
  syncedAt = t0;
  try {
    const { data, error } = await supabase.rpc('server_now');
    const t1 = Date.now();
    syncedAt = t1;
    if (error) {
      // 함수가 아예 없는 환경 — 기기 시계가 곧 기준이다(여기서 known 을 거짓으로 두면 전진이 영영 멈춘다).
      const code = (error as { code?: string }).code;
      if (code === '42883' || code === 'PGRST202') known = true;
      return offset;
    }
    if (typeof data !== 'string') return offset;
    const srv = Date.parse(data);
    if (!Number.isFinite(srv) || t1 - t0 > MAX_RTT_MS) return offset;
    offset = Math.round(srv - (t0 + t1) / 2);
    known = true;
  } catch { /* 네트워크 실패 — 이전 오프셋 유지 */ } finally { settle(); }
  return offset;
}

/** 테스트 전용. */
export function __setServerOffsetForTest(ms: number, synced = true): void {
  offset = ms; syncedAt = synced ? Date.now() : 0; known = synced; settled = synced;
}
