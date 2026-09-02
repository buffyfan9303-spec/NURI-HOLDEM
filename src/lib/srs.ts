// src/lib/srs.ts
// 간격 반복(라이트너 박스) — 틀린 문제를 1→3→7→14→30일 뒤에 다시 낸다. 로컬(localStorage)·서버 0.
//
// 왜(2026-09-03): 프리플랍 오답은 25% 난수 재출제, 한 번 맞히면 영영 안 나왔다 — 망각 곡선 대응이 0.
//   '오늘의 드릴' 편성기가 이미 날짜 시드·약점 순위를 갖고 있어 **due 우선순위 한 층**만 얹는다.
//
// 규칙: 키 = 프리플랍 문제 키('rfi|…'·'push|…') 또는 'post|<시나리오 id>'.
//   · 오답 → box 0, due 내일.   · 정답 → box+1, due = 오늘 + INTERVALS[새 box]. box 4 에서 또 맞히면 졸업(삭제).
//   · 처음 보는 문제를 맞힌 건 기록하지 않는다(복습할 게 없다) — 그래서 표는 '틀린 적 있는 문제' 만 담는다.
// 날짜는 trainerProgress 와 같은 로컬 규칙('YYYY-MM-DD').
import { todayStr } from './trainerProgress';

export const SRS_KEY = 'nuri:trainer:srs:v1';
export const INTERVALS = [1, 3, 7, 14, 30] as const;

export interface SrsEntry { box: number; due: string }
export type SrsMap = Record<string, SrsEntry>;

export const postSrsKey = (id: number): string => `post|${id}`;

/** 'YYYY-MM-DD' + n일(로컬 달력) */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString('sv');
}
/** b - a 일수. 파싱 실패 0. */
export function diffDays(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00`), tb = Date.parse(`${b}T00:00:00`);
  return Number.isNaN(ta) || Number.isNaN(tb) ? 0 : Math.round((tb - ta) / 86_400_000);
}

/** 답 1건 반영(순수 함수 — 저장은 호출부). */
export function applySrs(map: SrsMap, key: string, ok: boolean, today: string): SrsMap {
  const cur = map[key];
  if (!ok) return { ...map, [key]: { box: 0, due: addDays(today, INTERVALS[0]) } };
  if (!cur) return map;
  const rest = { ...map };
  delete rest[key];
  const box = cur.box + 1;
  if (box >= INTERVALS.length) return rest; // 졸업
  return { ...rest, [key]: { box, due: addDays(today, INTERVALS[box]) } };
}

/** 오늘 복습할 키 — due 가 오늘 이하인 것, 오래된 순. */
export function dueKeys(map: SrsMap, today: string): string[] {
  return Object.keys(map).filter((k) => map[k].due <= today).sort((a, b) => map[a].due < map[b].due ? -1 : map[a].due > map[b].due ? 1 : 0);
}

/** 마지막으로 푼 지 며칠 됐나(due − 간격 = 마지막 답한 날). 복습 배지 '복습 · N일 만에' 용. */
export const daysSinceAnswered = (e: SrsEntry, today: string): number =>
  Math.max(1, diffDays(e.due, today) + INTERVALS[Math.min(e.box, INTERVALS.length - 1)]);

export function loadSrs(): SrsMap {
  try {
    const raw = JSON.parse(localStorage.getItem(SRS_KEY) || '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: SrsMap = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const e = v as Partial<SrsEntry>;
      if (typeof e?.box === 'number' && typeof e.due === 'string') out[k] = { box: e.box, due: e.due };
    }
    return out;
  } catch { return {}; }
}
export function saveSrs(map: SrsMap): void {
  try { localStorage.setItem(SRS_KEY, JSON.stringify(map)); } catch { /* quota/SSR */ }
}

/** 채점 지점 한 줄 — 트레이너·드릴·오답 노트 공용. ponytail: 상한 없음(졸업하면 빠지고 항목당 ~40B) — 수천 개면 due 먼 것부터 자르기. */
export const recordSrs = (key: string, ok: boolean): void => saveSrs(applySrs(loadSrs(), key, ok, todayStr()));

/** 데이터 개편으로 복원 불가한 키를 조용히 버린다. */
export function dropSrs(keys: readonly string[]): void {
  if (keys.length === 0) return;
  const map = loadSrs();
  for (const k of keys) delete map[k];
  saveSrs(map);
}
