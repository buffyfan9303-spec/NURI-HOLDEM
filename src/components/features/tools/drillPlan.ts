// src/components/features/tools/drillPlan.ts
// '오늘의 드릴' — 매일 5문제를 **자동 편성**하는 규칙 + 진행 저장(로컬).
//
// 왜 만들었나(2026-08-29): 진행 스트립이 "오늘 0/20" 이라고 숙제만 내고 무엇을 풀지는
//   유저가 고르게 했다. 초보가 이탈하는 지점이다. 이미 있는 두 신호로 오늘 풀 것을 대신 정해 준다.
//     ① PostflopTrainer 가 이미 계산 중인 **카테고리별 정답률**(nuri:trainer:postflop:v2 의 byCat)
//     ② PreflopTrainer 의 **오답 재출제 큐**(nuri:trainer:preflop:v2 의 wrong)
//   서버 변경 0 · 신규 스키마 0. 새로 저장하는 건 '오늘 편성한 5문제와 진행' 한 덩어리뿐이다.
//
// 편성 규칙(5문제)
//   · 프리플랍 슬롯: 오답 큐가 2개 이상이면 2문제, 아니면 1문제(큐가 비면 경계 핸드 새 문제).
//     — 오답 큐는 **최근 것부터** 꺼낸다(잊기 직전에 다시 만나는 게 효과가 크다).
//   · 나머지(3~4문제)는 포스트플랍. 카테고리를 '약한 순'으로 세워 위에서부터 하나씩 배정한다.
//       약점(3문항 이상 풀었고 정답률 80% 미만) → 미탐색(아직 0문항) → 나머지 낮은 정답률 순.
//     같은 카테고리가 두 번 들어가지 않게 서로 다른 카테고리에서 뽑는다(8개라 항상 충분).
//   · 동점(예: 신규 유저는 전부 미탐색)은 **날짜 시드**로 섞어 매일 다른 카테고리가 나오게 한다.
//
// 편성 결과는 그날 하루 고정이다(새로고침해도 같은 5문제) — 도중에 나갔다 와도 이어서 푼다.
import { awardXp } from '../../../lib/trainerProgress';
import { loadPreflopStats, makeQuiz, modeOfKey } from '../../../lib/preflopQuiz';
import { ALL_CATS, CAT_LABEL, SCENARIOS, loadPostflopStats, type Category } from './postflop.data';
import { useSyncExternalStore } from 'react';

export const DRILL_SIZE = 5;
export const DRILL_BONUS_XP = 30; // 완주 보너스 — 문제별 XP(정답 10) 위에 얹는다

const KEY = 'nuri:trainer:drill:v1';
const EVENT = 'nuri:trainer:drill';

export type DrillItem =
  | { kind: 'postflop'; id: number; reason: string }
  | { kind: 'preflop'; key: string; reason: string };

export interface DrillPlan {
  date: string;      // 'YYYY-MM-DD'(로컬)
  items: DrillItem[];
  idx: number;       // 다음에 풀 문제 인덱스. items.length 면 완료
  correct: number;   // 맞힌 수
  awarded: boolean;  // 완주 보너스 XP 지급 여부(중복 지급 방지)
}

// trainerProgress 와 같은 로컬 날짜 규칙(스웨덴 로캘 = 'YYYY-MM-DD')
const todayStr = (): string => new Date().toLocaleDateString('sv');

/* 날짜 시드 난수 — 같은 날이면 같은 순서. mulberry32(작고 충분히 고르다) */
function seededRandom(seedStr: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle<T>(arr: readonly T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 카테고리 약점 순위 — 점수가 낮을수록 먼저 낸다. */
interface CatRank { cat: Category; t: number; rate: number; score: number; reason: string }
function rankCategories(rnd: () => number): CatRank[] {
  const post = loadPostflopStats();
  const rows: CatRank[] = seededShuffle(ALL_CATS, rnd).map((cat) => {
    const st = post.byCat[cat];
    const t = st?.t ?? 0;
    const rate = t > 0 ? (st!.c / t) : 0;
    // 미탐색(0문항)은 0.85 — '약점(<0.8)' 다음, '충분히 잘하는 카테고리' 앞에 세운다.
    const score = t === 0 ? 0.85 : rate;
    const reason = t === 0
      ? `아직 안 풀어본 ${CAT_LABEL[cat]}`
      : (t >= 3 && rate < 0.8)
        ? `약점 보완 · ${CAT_LABEL[cat]} ${Math.round(rate * 100)}%`
        : `복습 · ${CAT_LABEL[cat]}`;
    return { cat, t, rate, score, reason };
  });
  // 안정 정렬(Array.prototype.sort 는 ES2019부터 stable) — 동점은 위의 시드 셔플 순서가 유지된다.
  return rows.sort((a, b) => a.score - b.score);
}

/** 오늘의 5문제를 편성한다(저장은 호출부). */
function composePlan(date: string): DrillPlan {
  const rnd = seededRandom(date);
  const items: DrillItem[] = [];

  // ① 프리플랍 — 오답 큐 우선
  const pre = loadPreflopStats();
  const queue = [...pre.wrong].reverse().filter((k) => modeOfKey(k)); // 최근 오답부터
  const preSlots = queue.length >= 2 ? 2 : 1;
  for (let i = 0; i < preSlots; i++) {
    const key = queue[i];
    if (key) items.push({ kind: 'preflop', key, reason: '오답 노트 — 틀렸던 핸드' });
    else items.push({ kind: 'preflop', key: makeQuiz(rnd() < 0.5 ? 'rfi' : 'push').key, reason: '경계 핸드 — 헷갈리는 구간' });
  }

  // ② 포스트플랍 — 약한 카테고리부터
  const ranked = rankCategories(rnd);
  const used = new Set<number>();
  for (let i = 0; items.length < DRILL_SIZE; i++) {
    const r = ranked[i % ranked.length];
    const pool = SCENARIOS.filter((s) => s.cat === r.cat && !used.has(s.id));
    if (pool.length === 0) continue;
    const sc = pool[Math.floor(rnd() * pool.length)];
    used.add(sc.id);
    items.push({ kind: 'postflop', id: sc.id, reason: r.reason });
    if (i > ranked.length * 2) break; // 방어: 무한 루프 금지(정상적으론 8카테고리 × 4문항 이상이라 도달 불가)
  }

  return { date, items, idx: 0, correct: 0, awarded: false };
}

/* ── 저장 · 구독 ─────────────────────────────────────────────────────────── */
function read(): DrillPlan | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as DrillPlan;
    if (!p || typeof p.date !== 'string' || !Array.isArray(p.items) || p.items.length === 0) return null;
    return p;
  } catch { return null; }
}
function write(p: DrillPlan): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* quota/SSR */ }
}

let cache: DrillPlan | null = null;

function emit(): void {
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* SSR/noop */ }
}
function commit(p: DrillPlan): DrillPlan {
  cache = p;
  write(p);
  emit();
  return p;
}

/** 오늘의 드릴(없거나 날짜가 지났으면 새로 편성). 참조 안정 — 같은 날 반복 호출해도 같은 객체. */
export function getTodayPlan(): DrillPlan {
  const t = todayStr();
  if (cache && cache.date === t) return cache;
  const stored = read();
  if (stored && stored.date === t) { cache = stored; return cache; }
  const fresh = composePlan(t);
  cache = fresh;
  write(fresh); // 편성 직후엔 구독자가 아직 이 값을 읽지 않았다 — emit 불필요(리렌더 루프 방지)
  return fresh;
}

/** 드릴에서 답 1건 반영 — 진행을 한 칸 밀고, 완주하면 보너스 XP 를 1회만 지급한다. */
export function recordDrillAnswer(correct: boolean): DrillPlan {
  const p = getTodayPlan();
  if (p.idx >= p.items.length) return p; // 이미 완주
  const next: DrillPlan = { ...p, idx: p.idx + 1, correct: p.correct + (correct ? 1 : 0) };
  if (next.idx >= next.items.length && !next.awarded) {
    awardXp(DRILL_BONUS_XP);
    next.awarded = true;
  }
  return commit(next);
}

/** 오늘 드릴 다시 풀기 — 같은 5문제를 처음부터(보너스는 재지급하지 않는다). */
export function restartTodayDrill(): DrillPlan {
  const p = getTodayPlan();
  return commit({ ...p, idx: 0, correct: 0 });
}

function subscribe(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** 드릴 진행 구독 훅 — ToolsPanel 최상단 카드와 드릴 화면이 같은 값을 본다. */
export function useDrillPlan(): DrillPlan {
  // getTodayPlan 은 같은 날이면 같은 객체를 돌려준다(참조 안정) — useSyncExternalStore 요구 충족.
  return useSyncExternalStore(subscribe, getTodayPlan, getTodayPlan);
}
