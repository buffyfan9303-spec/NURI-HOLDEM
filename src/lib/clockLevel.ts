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

// ── 클락 생애 상태(phase) — 화면 5곳이 각자 만들던 파생의 단일 출처 ──────────────
//
// 왜 필요한가 (2026-09-11 오너 보고 "시작 전 클락이 일시정지로 뜬다"):
//   clock_states 에는 상태 필드가 `running boolean` **하나뿐**이다(started_at·status·phase 전부 없음).
//   그래서 8개 파일 16곳이 각자 `running ? A : B` 삼항식을 썼고, 어휘가 5종으로 갈렸다 —
//   같은 클락 하나를 운영자는 '일시정지', TV 는 'PAUSED', 대시보드는 '미실행', 리모컨은 '일시정지'로 불렀다.
//
//   결정적으로 [시작 준비](emptyClockState)가 쓰는 행과 '1레벨에서 일시정지'한 행이
//   `running=false · endsAt=null · currentIndex=0` 으로 **같은 모양**이라, boolean 하나로는 원리적으로 못 가른다.
//
// 어떻게 가르나 — DB 컬럼을 추가하지 않고 파생한다(오너 지시: UI 문구 때문에 마이그레이션을 만들지 말 것):
//   `emptyClockState`(와 [초기화])는 remainingMs 에 **1레벨 전체 길이를 정확히** 써 넣는다.
//   반면 일시정지는 '지금까지 흐른 뒤 남은 시간'이라 반드시 그보다 **작다**(같은 ms 에 시작·정지해야 같아지는데,
//   그 사이에 네트워크 왕복 두 번이 있어 실제로 불가능하다). 그래서 `remainingMs >= 1레벨 전체` 가 '아직 안 돌았다'의 증거다.
//   이 판정은 등호가 아니라 부등호라, 운영자가 [시간 +] 로 늘려 둔 경우에도 '시작 전'으로 남는다(맞는 동작).
export type ClockPhase = 'idle' | 'running' | 'break' | 'paused' | 'finished';

/** phase 판정에 필요한 최소 형태 — ClockState 가 구조적으로 만족한다. */
export interface ClockPhaseInput extends ClockLevelInput {
  config?: { levels?: (LevelDuration & { kind?: 'level' | 'break' })[] } | null;
}

export function clockPhase(s: ClockPhaseInput, nowMs = Date.now()): ClockPhase {
  const lv = s.config?.levels ?? [];
  // 레벨이 없는 설정(아직 블라인드를 안 만든 클락)은 '끝났다'고 말할 근거가 없다.
  if (lv.length === 0) return s.running ? 'running' : 'idle';

  const last = lv.length - 1;
  if (s.running) {
    // 브레이크는 levels 배열의 원소다 — 흐른 시간만큼 전진시킨 **실효 레벨**로 봐야 맞다
    // (endsAt 이 지났는데 아무도 전진을 못 쓴 행에서도 TV 가 옳게 말한다).
    return lv[effectiveLevel(s, nowMs).index]?.kind === 'break' ? 'break' : 'running';
  }

  // ── 정지 상태 셋 가르기 ──
  const firstMs = (lv[0]?.minutes ?? 0) * 60_000;
  if (s.currentIndex <= 0 && !s.endsAt && firstMs > 0 && s.remainingMs >= firstMs) return 'idle';
  if (s.remainingMs <= 0 && s.currentIndex >= last) return 'finished';
  return 'paused';
}

/** 화면에 쓰는 상태 문구 — 5개 화면이 같은 말을 하도록 한 곳에 둔다. */
export const CLOCK_PHASE_LABEL: Record<ClockPhase, string> = {
  idle: '시작 전', running: '진행 중', break: '브레이크', paused: '일시정지', finished: '종료',
};
/** TV 송출용 영문 — 거리에서 읽히는 짧은 표기(기존 ClockDisplay 어휘 유지). */
export const CLOCK_PHASE_TV: Record<ClockPhase, string> = {
  idle: 'READY', running: 'RUNNING', break: 'BREAK', paused: 'PAUSED', finished: 'FINISHED',
};
/** 주 버튼 문구 — 지금 누르면 무엇이 되는가. */
export const CLOCK_PHASE_ACTION: Record<ClockPhase, string> = {
  idle: '시작', running: '일시정지', break: '일시정지', paused: '계속하기', finished: '다시 시작',
};

/**
 * '이 클락이 살아 있는가' — 대시보드·라이브바가 카드를 띄울지 정하는 판정.
 * 예전엔 `running || currentIndex > 0 || endsAt != null` 를 5곳이 복붙했는데,
 * 그 식은 **1레벨에서 일시정지한 진행 중 대회를 '미실행'** 이라고 말했다(currentIndex 가 0이라서).
 */
export const clockIsLive = (s: ClockPhaseInput, nowMs = Date.now()): boolean => clockPhase(s, nowMs) !== 'idle';
