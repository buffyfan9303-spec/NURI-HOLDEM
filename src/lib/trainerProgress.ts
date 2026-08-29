// src/lib/trainerProgress.ts
// 트레이너 게이미피케이션 — 로컬(localStorage) 진행 모듈. 서버 불필요.
// 프리플랍·포스트플랍 트레이너가 공유하며, 기존 정답률/연속(문제) 기록과는
// 별도 키(nuri:trainer:progress:v1)를 쓴다(충돌 금지).
//
// 담는 것: ① 일일 목표(10/20/50문제, 기본 20)·오늘 푼 수·달성 여부
//          ② 스트릭(연속 달성 일수) + 스트릭 프리즈(결손 보호, 기본 2개)
//          ③ 총 XP(정답 +10, 목표 달성 보너스 +50)
//
// 날짜 키: 리포 규칙상 new Date() 직접 노출은 피하지만, 이 파일은 순수 런타임
//   유틸이라 로컬 날짜가 자연스럽다 → new Date().toLocaleDateString('sv')
//   (스웨덴 로캘 = 'YYYY-MM-DD' ISO 형식, 로컬 자정 경계 기준).
import { useMemo, useSyncExternalStore } from 'react';

const KEY = 'nuri:trainer:progress:v1';
const EVENT = 'nuri:trainer:progress'; // 같은 탭 내 구독자 동기화용 커스텀 이벤트
export const GOAL_CHOICES = [10, 20, 50] as const;
const DEFAULT_GOAL = 20;
const DEFAULT_FREEZES = 2; // 결손 보호 개수 — 소진되면 스트릭 리셋(회복 없음, 단순화)

// 영속 상태(원본). date=마지막 활동/정산 로컬날짜, lastGoalDate=마지막 목표 달성일.
interface Raw {
  goal: number;
  date: string;
  today: number;        // 오늘 푼 문제 수(정·오답 모두 목표에 반영)
  xp: number;
  streak: number;
  best: number;
  freezes: number;
  lastGoalDate: string; // 스트릭 중복 증가 방지 + 정산 기준
}

/** 화면용 파생 뷰 */
export interface TrainerProgress {
  goal: number;
  today: number;
  xp: number;
  streak: number;
  best: number;
  freezes: number;
  goalMet: boolean;     // 오늘 목표 달성 여부
  remaining: number;    // 목표까지 남은 문제 수(0 이상)
}

/** recordAnswer 결과 — 호출부가 축하 배너/증가 XP를 표시하도록 */
export interface RecordResult {
  justHitGoal: boolean; // 이 답으로 오늘 목표를 처음 달성했는가
  xpGained: number;     // 이 답으로 얻은 XP(정답 10 + 달성 50)
}

const todayStr = (): string => new Date().toLocaleDateString('sv'); // 'YYYY-MM-DD'

// 두 날짜 문자열('YYYY-MM-DD') 사이의 일수 차(b - a). 파싱 실패 시 0.
function diffDays(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00`);
  const tb = Date.parse(`${b}T00:00:00`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
  return Math.round((tb - ta) / 86_400_000);
}

function freshRaw(): Raw {
  return { goal: DEFAULT_GOAL, date: todayStr(), today: 0, xp: 0, streak: 0, best: 0, freezes: DEFAULT_FREEZES, lastGoalDate: '' };
}

function load(): Raw {
  const base = freshRaw();
  try {
    if (typeof localStorage === 'undefined') return base;
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch { return base; }
}

// 모듈 캐시 — useSyncExternalStore가 참조 안정성을 요구하므로, 변경 시에만 새 객체로 교체.
let cache: Raw = load();

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* quota/SSR */ }
}
function emit(): void {
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* SSR/noop */ }
}
function commit(next: Raw): void {
  cache = next;
  persist();
  emit();
}

// 날짜 경계 정산 — 새 날이면 오늘 카운트를 0으로 리셋하고, 그 사이 결손일을 프리즈로 흡수.
// 프리즈가 결손일을 못 덮으면 스트릭 리셋(프리즈는 기본값 복구). 참조 교체 없이 emit도 없음.
function reconcile(): void {
  const t = todayStr();
  if (cache.date === t) return;
  const gap = diffDays(cache.date, t);
  const next: Raw = { ...cache, date: t, today: 0 };
  if (gap > 0 && next.streak > 0) {
    // 직전 활동일(cache.date)이 목표 달성일이면 그날은 '커버됨' → 결손일 = gap - 1, 아니면 gap.
    const missed = gap - (cache.lastGoalDate === cache.date ? 1 : 0);
    if (missed > 0) {
      if (missed <= next.freezes) next.freezes -= missed;
      else { next.streak = 0; next.freezes = DEFAULT_FREEZES; }
    }
  }
  cache = next;
  persist();
}
reconcile(); // 모듈 로드 시 1회(리스너 없음 → emit 불필요)

const view = (r: Raw): TrainerProgress => ({
  goal: r.goal,
  today: r.today,
  xp: r.xp,
  streak: r.streak,
  best: r.best,
  freezes: r.freezes,
  goalMet: r.today >= r.goal,
  remaining: Math.max(0, r.goal - r.today),
});

/** 현재 진행 뷰(정산 후 반환). 순수 조회용. */
export function getProgress(): TrainerProgress {
  reconcile();
  return view(cache);
}

/** 답변 1건 채점 반영 — 오늘 카운트++·정답 XP·목표 달성 시 보너스/스트릭 갱신. */
export function recordAnswer(correct: boolean): RecordResult {
  reconcile();
  const t = todayStr();
  const prevMet = cache.today >= cache.goal;
  const next: Raw = { ...cache, today: cache.today + 1 };
  let xpGained = 0;
  if (correct) { next.xp += 10; xpGained += 10; }
  const nowMet = next.today >= next.goal;
  let justHitGoal = false;
  if (!prevMet && nowMet) {
    next.xp += 50; xpGained += 50;         // 목표 달성 보너스
    if (next.lastGoalDate !== t) {         // 오늘 아직 스트릭 미반영이면 +1(정산이 결손은 이미 처리)
      next.streak += 1;
      next.best = Math.max(next.best, next.streak);
      next.lastGoalDate = t;
    }
    justHitGoal = true;
  }
  commit(next);
  return { justHitGoal, xpGained };
}

/** 보너스 XP 지급 — '오늘의 드릴' 완주처럼 문제 1건 단위가 아닌 성취에 쓴다.
 *  오늘 카운트·스트릭은 건드리지 않는다(그건 recordAnswer 의 몫). 중복 지급 방지는 호출부 책임. */
export function awardXp(n: number): void {
  reconcile();
  if (!Number.isFinite(n) || n <= 0) return;
  commit({ ...cache, xp: cache.xp + Math.round(n) });
}

/** 일일 목표 변경(10/20/50만 허용). */
export function setDailyGoal(n: number): void {
  reconcile();
  if (!(GOAL_CHOICES as readonly number[]).includes(n)) return;
  commit({ ...cache, goal: n });
}

function subscribe(cb: () => void): () => void {
  reconcile(); // (재)구독 시점에 최신 날짜로 맞춤 — React가 직후 스냅샷을 재조회
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
const getSnapshot = (): Raw => cache;

/** 진행 상태 구독 훅 — 값이 바뀔 때만 리렌더(참조 안정 캐시 + 파생 memo). */
export function useTrainerProgress(): TrainerProgress {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => view(raw), [raw]);
}
