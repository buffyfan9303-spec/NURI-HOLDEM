// src/lib/clockLevel.ts — 클락 '표시용 실효 레벨' 계산(순수 함수).
//
// 왜 api/clock.ts 에서 여기로 옮겼는가 (2026-08-30, 첫 화면 임계 경로 정리):
//   App.tsx → lib/regStatus.ts → **api/clock.ts** → api/ledger.ts 라는 정적 사슬이 있었고,
//   그 탓에 업주 전용 장부 청크(ledger, 실측 20.5KB)가 index.html 의 modulepreload 에 실려
//   **비로그인 모바일 손님에게도** 내려갔다. 손님은 장부를 볼 일이 없다.
//   regStatus 가 필요로 한 것은 `effectiveLevel` 하나뿐이고 이 함수는 인자만 읽는 순수 함수라,
//   순수 계산만 여기로 내리면 사슬이 끊긴다. api/clock.ts 는 이 모듈을 **재수출**하므로
//   기존 임포트(`from '../api/clock'`)는 한 줄도 고칠 필요가 없다.
//
// 모바일 실측 근거: 이 앱의 체감은 CPU 가 아니라 **내려보내는 바이트**가 지배한다
//   (1.6Mbps LCP 3,612ms vs 무제한망 672ms — 5.4배).

/** 레벨 하나에서 이 계산이 실제로 쓰는 것은 길이(분)뿐이다. */
export interface LevelDuration { minutes?: number }

/** 이 계산에 필요한 클락 상태의 최소 형태 — api/clock 의 ClockState 가 구조적으로 만족한다. */
export interface ClockLevelInput {
  config?: { levels?: LevelDuration[] } | null;
  running: boolean;
  currentIndex: number;
  endsAt?: string | null;
  remainingMs: number;
}

/** drifted=true = DB 행이 낡았다(아직 아무도 전진을 쓰지 못했다). */
export interface ClockEffective { index: number; remainingMs: number; drifted: boolean }

/**
 * 표시용 실효 레벨 — running 인데 endsAt 이 지났으면 경과분만큼 인덱스를 전진시켜 계산한다.
 * **아무것도 쓰지 않는다**(읽기 전용 보정). 실제 DB 전진은 api/clock 의 levelCatchUp 이 한다.
 *
 * 왜 필요한가: 레벨을 실제로 전진시키는 주체가 '클락 화면을 열고 있는 운영자' 하나뿐이라,
 * 업주가 장부 섹션으로 옮기면 클락 섹션이 display:none 이 되어 재렌더가 멈추고 전진도 멈춘다 —
 * 손님이 보는 TV·홈 라이브 카드가 00:00 에 얼어붙던 원인이다.
 */
export function effectiveLevel(s: ClockLevelInput, nowMs = Date.now()): ClockEffective {
  const lv = s.config?.levels ?? [];
  const last = Math.max(0, lv.length - 1);
  const from = Math.max(0, Math.min(s.currentIndex, last));
  let idx = from;
  let rem = s.running && s.endsAt ? new Date(s.endsAt).getTime() - nowMs : s.remainingMs;
  // idx < last 가드가 핵심 — 없으면 종료된 토너의 인덱스가 무한히 커진다
  // (브레이크는 levels 원소라 자연히 지나간다).
  while (s.running && rem < 0 && idx < last) { idx++; rem += (lv[idx].minutes || 0) * 60_000; }
  return { index: idx, remainingMs: Math.max(0, rem), drifted: idx !== from };
}
