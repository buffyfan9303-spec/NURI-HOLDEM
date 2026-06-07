// src/api/clock.ts — 토너먼트 클락(블라인드 타이머) API
import { supabase, IS_MOCK } from '../lib/supabase';
import { earlyTypeOf, type LedgerBuyin } from './ledger';

/** 얼리 판정에 필요한 세션 정보 */
export interface EarlyWindow { earlyDoubleMin?: number; earlySingleMin?: number; tournamentStart?: string | null; openedAt?: string | null }

// ── 타입 ──────────────────────────────────────────────────────────────────────
export interface ClockLevel {
  kind: 'level' | 'break';
  sb: number;
  bb: number;
  ante: number;
  minutes: number;
  label?: string; // 브레이크 라벨(예: "BREAK 8Min.")
}
export interface ClockPrizeRow { place: string; amount: number }

export interface ClockConfig {
  title: string;
  startStack: number;     // 스타팅 스택(칩)
  rebuyStack: number;     // 리바인 스택
  addonStack: number;     // 애드온 스택
  isAddon: boolean;       // 애드온 게임 여부(라이브에 ADD-ON 표시)
  earlyBonus: number;     // 1얼리 보너스 칩
  doubleEarlyBonus: number; // 더블얼리 보너스 칩
  regCloseLevel: number;  // 등록 마감 레벨(이 레벨 시작 시 마감)
  maxLevel: number;       // 최대 레벨(블라인드 자동 생성 기준)
  earlyDoubleLevel: number; // ~레벨 N까지 도착 = 더블얼리
  earlySingleLevel: number; // ~레벨 M까지 도착 = 1얼리
  earlyDoubleMin: number; // (파생) 레벨→누적분 환산값 = 더블얼리 마지노 분
  earlySingleMin: number; // (파생) 레벨→누적분 환산값 = 1얼리 마지노 분
  mysteryBounty: number;  // 미스터리 바운티 금액(표시용)
  prizes: ClockPrizeRow[];
  levels: ClockLevel[];
}

export interface ClockPreset {
  id: string;
  venueId: string;
  name: string;
  config: ClockConfig;
}

export interface ClockState {
  venueId: string;
  sessionDate: string | null; // 연결된 장부(없으면 standalone)
  title: string;
  config: ClockConfig;
  currentIndex: number;       // levels 배열 인덱스(브레이크 포함)
  running: boolean;
  endsAt: string | null;      // 진행 중일 때 현재 레벨 종료 시각(ISO)
  remainingMs: number;        // 일시정지 중 남은 ms
  adjEntries: number;         // 수기 보정(장부 자동값에 가산)
  adjRebuys: number;
  adjEarlies: number;
  adjAddons: number;
  eliminations: number;       // 아웃된 인원
}

export const PRESET_LIMIT = 50;

// ── 기본 구조(프리셋 없을 때) ───────────────────────────────────────────────────
// 로티아레나 파이널롤백 기반 기본 블라인드 템플릿(SB/BB) — 자동 생성 기준
const BASE_BLINDS: [number, number][] = [
  [100, 200], [200, 300], [200, 400], [300, 500], [300, 600], [400, 800], [500, 1000], [600, 1200],
  [1000, 1500], [1000, 2000], [1500, 2500], [1500, 3000], [2000, 3000], [2000, 4000], [2500, 5000], [3000, 6000],
  [4000, 8000], [5000, 10000], [6000, 12000], [10000, 15000], [10000, 20000],
  [15000, 30000], [20000, 40000], [30000, 60000], [40000, 80000], [50000, 100000],
];

export function defaultClockConfig(): ClockConfig {
  return {
    title: '데일리 토너먼트',
    startStack: 50000, rebuyStack: 70000, addonStack: 0, isAddon: false,
    earlyBonus: 5000, doubleEarlyBonus: 10000,
    regCloseLevel: 12, maxLevel: 18,
    earlyDoubleLevel: 1, earlySingleLevel: 4, earlyDoubleMin: 20, earlySingleMin: 80,
    mysteryBounty: 0,
    prizes: [
      { place: '1위', amount: 400 }, { place: '2위', amount: 200 }, { place: '3위', amount: 100 },
      { place: '4위', amount: 80 }, { place: '5위', amount: 60 }, { place: '6위', amount: 50 },
    ],
    levels: generateBlinds(12, 18, 20, 20),
  };
}

/** 전체 '레벨'(브레이크 제외) 개수 */
export function countLevels(levels: ClockLevel[]): number {
  return levels.reduce((n, l) => n + (l.kind === 'level' ? 1 : 0), 0);
}

/** 블라인드 구조에서 '레벨 N 종료'까지의 누적 경과분(브레이크 포함 — 실제 경과 시각 기준). */
export function cumulativeMinutesThroughLevel(levels: ClockLevel[], levelNo: number): number {
  if (levelNo <= 0) return 0;
  let mins = 0, count = 0;
  for (const l of levels) {
    mins += l.minutes || 0;
    if (l.kind === 'level') { count++; if (count >= levelNo) return mins; }
  }
  return mins;
}

/** earlyDoubleLevel/earlySingleLevel(레벨) → earlyDoubleMin/earlySingleMin(분, 파생) 재계산.
 *  블라인드 길이가 바뀌면 이 함수로 다시 환산해 저장한다. */
export function withDerivedEarly(cfg: ClockConfig): ClockConfig {
  const total = countLevels(cfg.levels);
  const dLv = Math.max(0, Math.min(cfg.earlyDoubleLevel ?? 0, total));
  const sLv = Math.max(0, Math.min(cfg.earlySingleLevel ?? 0, total));
  return {
    ...cfg,
    earlyDoubleLevel: dLv,
    earlySingleLevel: sLv,
    earlyDoubleMin: dLv > 0 ? cumulativeMinutesThroughLevel(cfg.levels, dLv) : 0,
    earlySingleMin: sLv > 0 ? cumulativeMinutesThroughLevel(cfg.levels, sLv) : 0,
  };
}

/** 등록마감·최대레벨 기준 블라인드 구조 자동 생성. 마감 후엔 더 가파르게(1.6x)·길게(postDur) 상승. */
export function generateBlinds(regCloseLevel: number, maxLevel: number, preDur = 20, postDur = 20): ClockLevel[] {
  const round1k = (v: number) => (v < 2000 ? Math.round(v / 100) * 100 : v < 10000 ? Math.round(v / 500) * 500 : Math.round(v / 1000) * 1000);
  const out: ClockLevel[] = [];
  const max = Math.max(1, Math.min(60, maxLevel || 18));
  let prev: [number, number] = BASE_BLINDS[BASE_BLINDS.length - 1];
  for (let n = 1; n <= max; n++) {
    const b: [number, number] = BASE_BLINDS[n - 1] ?? [round1k(prev[0] * 1.4), round1k(prev[1] * 1.4)];
    prev = b;
    const post = regCloseLevel > 0 && n > regCloseLevel;
    out.push({ kind: 'level', sb: b[0], bb: b[1], ante: b[1], minutes: post ? postDur : preDur });
    if (n % 5 === 0 && n < max) out.push({ kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 8, label: 'BREAK 8Min.' });
  }
  return out;
}

export function emptyClockState(venueId: string, config = defaultClockConfig()): ClockState {
  const first = config.levels[0];
  return {
    venueId, sessionDate: null, title: config.title, config,
    currentIndex: 0, running: false, endsAt: null,
    remainingMs: (first?.minutes ?? 20) * 60_000,
    adjEntries: 0, adjRebuys: 0, adjEarlies: 0, adjAddons: 0, eliminations: 0,
  };
}

// ── 매퍼 ──────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToState(r: any): ClockState {
  return {
    venueId: r.venue_id, sessionDate: r.session_date ?? null,
    title: r.title ?? '', config: (r.config ?? {}) as ClockConfig,
    currentIndex: r.current_index ?? 0, running: !!r.running,
    endsAt: r.ends_at ?? null, remainingMs: Number(r.remaining_ms ?? 0),
    adjEntries: r.adj_entries ?? 0, adjRebuys: r.adj_rebuys ?? 0,
    adjEarlies: r.adj_earlies ?? 0, adjAddons: r.adj_addons ?? 0,
    eliminations: r.eliminations ?? 0,
  };
}

// ── 프리셋 ────────────────────────────────────────────────────────────────────
export async function getClockPresets(venueId: string): Promise<ClockPreset[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('clock_presets')
    .select('*').eq('venue_id', venueId).order('updated_at', { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, venueId: r.venue_id, name: r.name, config: r.config as ClockConfig }));
}

export async function saveClockPreset(venueId: string, name: string, config: ClockConfig, id?: string): Promise<void> {
  if (IS_MOCK) return;
  if (!id) {
    const { count } = await supabase.from('clock_presets').select('id', { count: 'exact', head: true }).eq('venue_id', venueId);
    if ((count ?? 0) >= PRESET_LIMIT) throw new Error(`프리셋은 최대 ${PRESET_LIMIT}개까지 저장할 수 있습니다`);
  }
  const row = { venue_id: venueId, name: name.trim() || '무제목', config: config as unknown as object, updated_at: new Date().toISOString() };
  const { error } = id
    ? await supabase.from('clock_presets').update(row).eq('id', id)
    : await supabase.from('clock_presets').insert(row);
  if (error) throw error;
}

export async function deleteClockPreset(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('clock_presets').delete().eq('id', id);
  if (error) throw error;
}

// ── 라이브 상태 ───────────────────────────────────────────────────────────────
export async function getClockState(venueId: string): Promise<ClockState | null> {
  if (IS_MOCK) return null;
  const { data } = await supabase.from('clock_states').select('*').eq('venue_id', venueId).maybeSingle();
  return data ? rowToState(data) : null;
}

export async function saveClockState(s: ClockState): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('clock_states').upsert({
    venue_id: s.venueId, session_date: s.sessionDate, title: s.title,
    config: s.config as unknown as object,
    current_index: s.currentIndex, running: s.running,
    ends_at: s.endsAt, remaining_ms: s.remainingMs,
    adj_entries: s.adjEntries, adj_rebuys: s.adjRebuys, adj_earlies: s.adjEarlies,
    adj_addons: s.adjAddons, eliminations: s.eliminations,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'venue_id' });
  if (error) throw error;
}

export async function clearClockState(venueId: string): Promise<void> {
  if (IS_MOCK) return;
  await supabase.from('clock_states').delete().eq('venue_id', venueId);
}

export function subscribeClock(venueId: string, onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`clock:${venueId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clock_states', filter: `venue_id=eq.${venueId}` }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ── 장부 → 클락 카운트 자동 산출 ────────────────────────────────────────────────
export interface DerivedCounts { entries: number; rebuys: number; earlies: number; doubleEarlies: number; totalBuyins: number; }

/** 장부 바인 기록에서 엔트리/리바인/얼리 자동 집계. 얼리는 세션 스타트·구간(또는 바인 수기지정)으로 판정. */
export function deriveClockCounts(buyins: LedgerBuyin[], early: EarlyWindow): DerivedCounts {
  const players = new Set<string>();
  let rebuys = 0, earlies = 0, doubleEarlies = 0;
  for (const b of buyins) {
    players.add(b.playerName);
    if (b.entryNo > 1) rebuys++;
    const et = earlyTypeOf(b, early);
    if (et === 'double') { earlies++; doubleEarlies++; }
    else if (et === 'single') earlies++;
  }
  return { entries: players.size, rebuys, earlies, doubleEarlies, totalBuyins: buyins.length };
}
