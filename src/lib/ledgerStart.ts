// src/lib/ledgerStart.ts — [장부 시작] 이 클락·세션에 넘기는 값의 단일 정본(NuriPosLedger 세션 폼이 부른다).
//
// 왜 컴포넌트 밖인가: 포스터 → 장부 → 클락 상속(W-04·W-10·W-13·W-06·W-19)이 전부 이 병합에서 정해진다.
//   화면 안에 두면 탐침·단위 테스트로 잴 수 없다(W단계 1차는 병합을 테스트 밖에서 손으로 재현해야 했다).
import {
  withDerivedEarly, applyEarlyEdit, clockHasProgress, clockIsLeftover, emptyClockState,
  type ClockConfig, type ClockState,
} from '../api/clock';
import type { LedgerSession } from '../api/ledger';
import type { Schedule } from '../api/schedules';
import { clockPatchFromSchedule, clockPrizesFromSchedule, ledgerPatchFromSchedule } from './gameInherit';
import { earlyTierWindows } from './chipRules';

/** 세션 폼에서 사람이 고칠 수 있는 클락 몫(얼리 두 칸 · 스택) — 폼 값이 포스터·프리셋보다 이긴다. */
export interface LedgerStartForm {
  earlyBonus: number; doubleEarlyBonus: number; earlyDoubleLevel: number; earlySingleLevel: number;
  startStack: number; rebuyStack: number;
}

/** 장부 시작 시 클락에 넘길 설정. 병합 순서: 베이스(지난 회차·현재 클락·기본) → 포스터 → 프리셋 패치 → 폼.
 *  · 포스터가 연결됐으면 상금표는 **포스터 것으로 교체**한다 — 시상이 없거나 비화폐 단위뿐이어도 빈 표로(W-13).
 *  · withDerivedEarly 가 레벨 → 분 환산과 얼리 단계·두 칸 정합을 한 번에 맞춘다. */
export function ledgerStartClockConfig(
  baseCfg: ClockConfig, sched: Schedule | null, presetPatch: Partial<ClockConfig> | null, form: LedgerStartForm,
): ClockConfig {
  const schedPatch = sched ? clockPatchFromSchedule(sched) : {};
  const prizes = sched ? { prizes: clockPrizesFromSchedule(sched) } : {};
  // 폼의 얼리 두 칸은 applyEarlyEdit 로 — 포스터 단계가 있으면 1·2단만 바꾸고 3·4단(키키 10k·5k)은 지킨다.
  return withDerivedEarly(applyEarlyEdit({ ...baseCfg, ...schedPatch, ...prizes, ...(presetPatch ?? {}) }, form));
}

/** 장부 세션에 굳힐 얼리 창 — 두 칸(분)은 언제나, 단계는 클락 설정에 단계가 있을 때만(W-04, 오너 결정 #1: 등록 시점 기준). */
export function sessionEarlyOf(cfg: ClockConfig): Pick<LedgerSession, 'earlyDoubleMin' | 'earlySingleMin' | 'earlyTiers'> {
  return {
    earlyDoubleMin: cfg.earlyDoubleMin, earlySingleMin: cfg.earlySingleMin,
    earlyTiers: Array.isArray(cfg.earlyTiers) ? earlyTierWindows(cfg.earlyTiers, cfg.levels) : undefined,
  };
}

/** 포스터 → 세션 칸(기준 엔트리 = GTD ÷ 참가비 · 애드온 엔트리). 포스터가 없으면 빈 패치. */
export function sessionPatchFromSchedule(sched: Schedule | null): Pick<Partial<LedgerSession>, 'targetEntries' | 'addonEntry'> {
  return sched ? ledgerPatchFromSchedule(sched) : {};
}

/** [장부 시작] 이 기존 클락 행을 어떻게 다룰까(W-14).
 *  · 'new'     — 행이 없다: 새 클락을 만든다.
 *  · 'update'  — 진행 흔적 없는 행: 설정만 바꾼다.
 *  · 'reset'   — 지난 날 멈춘 채 남은 흔적(clockIsLeftover): 포스터 설정으로 **새로 채운다**(탈락·보정·레벨 초기화).
 *  · 'protect' — 오늘 대회로 진행 중이거나 멈춘 클락: 덮지 않는다(업주에게 알린다). */
export type ClockStartAction = 'new' | 'update' | 'reset' | 'protect';
export function clockStartAction(fresh: ClockState | null, sessionDate: string): ClockStartAction {
  if (!fresh) return 'new';
  if (!fresh.running && !clockHasProgress(fresh)) return 'update';
  return clockIsLeftover(fresh, sessionDate) ? 'reset' : 'protect';
}

/** clockStartAction 이 정한 대로 저장할 행을 만든다. 'protect' 는 null(쓰지 않는다). */
export function clockStartRow(
  action: ClockStartAction, fresh: ClockState | null, cfg: ClockConfig, venueId: string, gameSeq: number, title: string,
): ClockState | null {
  if (action === 'protect') return null;
  if (action === 'update' && fresh) return { ...fresh, config: cfg };
  return { ...emptyClockState(venueId, cfg, gameSeq), title };
}
