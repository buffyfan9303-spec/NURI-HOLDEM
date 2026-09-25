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
/** 필드 현황 계산에 필요한 최소 형태 — api/clock 의 `ClockState` 가 구조적으로 만족한다.
 *  (이 모듈의 다른 입력 타입들과 같은 규칙: `ClockState` 를 import 하지 않는다 — 그러면 사슬이 되살아난다.) */
export interface ClockFieldInput {
  adjEntries: number;
  eliminations: number;
  liveStats?: { alive: number; entries: number } | null;
}

/**
 * 필드 현황 — **생존 / 엔트리**. 라이브 화면과 일정 카드가 같은 값을 말하게 하는 단일 정본이다.
 *
 * 🔴 왜 헬퍼로 뽑았나: 같은 식이 2026-09-22 기준 **세 곳**에 복사돼 있었다
 *   (LiveGamesTab 정렬용·카드용, 그리고 새로 필요해진 일정 카드). 장부의 세 수(바이인 횟수·엔트리·얼리)는
 *   뭉치거나 갈리면 반드시 틀린다 — 이 저장소가 반복해 밟은 '정본 두 벌' 자리다.
 * 🔴 왜 `api/clock.ts` 가 아니라 여기인가: 거기에 두면 `regStatus.ts` 가 **값**을 import 하게 되고,
 *   그 순간 이 파일 머리말이 끊어 놓은 사슬(App → regStatus → api/clock → api/ledger)이 되살아나
 *   업주 전용 장부 청크가 비로그인 손님의 첫 화면에 다시 딸려 온다. 그 계약은
 *   `src/lib/regStatus.contract.test.ts` 가 잠그고 있다.
 *
 * · `liveStats` 스냅샷이 있으면 **그것이 정답**이다(장부 파생값을 보드가 저장해 둔 것).
 * · 없으면 보정값으로 근사한다: 엔트리=`adjEntries`, 생존=`adjEntries − eliminations`(음수 방지).
 * · `hasField` 는 '필드 숫자를 보여 줄 만한가' — 스냅샷이 있거나 엔트리가 1 이상일 때만 참이다.
 *   시작 전(엔트리 0)에 `0 / 0` 을 띄우면 '아무도 없다' 로 읽혀 오히려 틀린 정보가 된다.
 */
export function fieldCounts(g: ClockFieldInput): { alive: number; entries: number; hasField: boolean } {
  const ls = g.liveStats;
  const entries = ls?.entries ?? g.adjEntries;
  const alive = ls?.alive ?? Math.max(0, g.adjEntries - g.eliminations);
  return { alive, entries, hasField: !!ls || entries > 0 };
}

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
    // C3(2026-09-25 MYSTORE-FULL-AUDIT): running=true 여도 **마지막 레벨까지 소진**했으면 끝난 대회다.
    //   종료를 DB 에 쓰는 주체(운영자 워치독·장부 백업 전진자)가 아무도 떠 있지 않으면 running=true 가 영영 남는다 —
    //   실측: 9/17 부터 running 인 더미 클락이 라이브 탭에 '진행 중' 으로 떠 있었다. 표시는 여기서 '종료'로 읽는다.
    if (clockExhausted(s, nowMs)) return 'finished';
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

/**
 * 진행 중(running)인 클락이 **마지막 레벨의 시간까지 다 썼는가** — levelCatchUp 의 `finished` 와 같은 경계다.
 * effectiveLevel 은 잔여를 0 으로 클램프해 '마지막 레벨 00:00' 과 '이미 지남'을 못 가르므로 누적을 따로 잰다.
 * 정지 행은 대상이 아니다(정지 종료는 clockPhase 의 remainingMs<=0 규칙이 본다).
 */
export function clockExhausted(s: ClockLevelInput, nowMs = Date.now()): boolean {
  const lv = s.config?.levels ?? [];
  if (!s.running || lv.length === 0) return false;
  const last = lv.length - 1;
  let idx = Math.max(0, Math.min(s.currentIndex, last));
  let rem = s.endsAt ? new Date(s.endsAt).getTime() - nowMs : s.remainingMs;
  if (!Number.isFinite(rem)) return false;
  while (rem < 0 && idx < last) { idx++; rem += (lv[idx].minutes || 0) * 60_000; }
  return idx >= last && rem <= 0;
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
  // C7(2026-09-25): 종료 상태의 주 버튼은 **누를 수 없다**('대회 종료' 표시). 예전 '다시 시작'은 remainingMs 0 으로 재개해
  //   즉시 다시 종료됐다 — 눌러도 아무 일이 없는 버튼이었다. 처음부터 다시는 [↺ 초기화], 이어서 하려면 [구조 수정]으로 레벨을 덧붙인다.
  idle: '시작', running: '일시정지', break: '일시정지', paused: '계속하기', finished: '대회 종료',
};

/**
 * '이 클락이 살아 있는가' — 대시보드·라이브바가 카드를 띄울지 정하는 판정.
 * 예전엔 `running || currentIndex > 0 || endsAt != null` 를 5곳이 복붙했는데,
 * 그 식은 **1레벨에서 일시정지한 진행 중 대회를 '미실행'** 이라고 말했다(currentIndex 가 0이라서).
 */
export const clockIsLive = (s: ClockPhaseInput, nowMs = Date.now()): boolean => clockPhase(s, nowMs) !== 'idle';

/** 게임 라벨 — 메인/사이드N. 클락 보드와 TV 게임 전환 버튼이 같은 문구를 써야 해서 여기 둔다. */
export const gameLabel = (g: { gameSeq: number }) => (g.gameSeq > 1 ? `사이드${g.gameSeq - 1}` : '메인');

// ── 레벨 번호 · 다음 브레이크 — 4곳에 복제돼 있던 계산을 한 곳으로 (2026-09-13) ─────
//
// 왜 여기인가: 둘 다 순수 함수라 regStatus.ts/effectiveLevel 과 같은 이유로 lib/ 에 둔다
// (api/clock 을 값으로 import 하면 업주 전용 장부 청크가 첫 화면 임계 경로에 딸려 온다 — 위 effectiveLevel 머리말 참조).
// msToRegClose 복제 사고(regStatus.contract.test.ts 머리말)와 같은 부류라 같은 방식으로 막는다.

/** levelNumberAt/msToNextBreak 이 실제로 읽는 것 — ClockLevel(api/clock)이 구조적으로 만족한다. */
export interface ClockLevelKind { kind?: 'level' | 'break'; minutes?: number }

/** 레벨 번호(브레이크 제외, 1부터) — index 까지 누적. */
export function levelNumberAt(levels: ClockLevelKind[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index && i < levels.length; i++) if (levels[i].kind === 'level') n++;
  return n;
}

/**
 * 다음 브레이크까지 남은 ms(현재 레벨 잔여 + 중간 레벨 길이 합). 브레이크가 없으면 null.
 * index 를 받는 이유: DB 의 current_index 가 낡아 있을 수 있어 '실효 인덱스'로 계산해야 하는 소비처가 있다
 * (TV·리모컨). 운영자 클락처럼 자기 state 가 권위인 소비처는 자신의 currentIndex 를 그대로 넘기면 된다.
 */
export function msToNextBreak(s: { config?: { levels?: ClockLevelKind[] } | null }, index: number, remaining: number): number | null {
  const lv = s.config?.levels ?? [];
  let acc = remaining;
  for (let i = index + 1; i < lv.length; i++) {
    if (lv[i].kind === 'break') return acc;
    acc += (lv[i].minutes ?? 0) * 60_000;
  }
  return null;
}
