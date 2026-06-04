// src/api/clock.ts — 토너먼트 클락(블라인드 타이머) API
import { supabase, IS_MOCK } from '../lib/supabase';
import type { LedgerBuyin } from './ledger';

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
  earlyBonus: number;     // 1얼리 보너스 칩
  doubleEarlyBonus: number; // 더블얼리 보너스 칩
  regCloseLevel: number;  // 등록 마감 레벨(이 레벨 시작 시 마감)
  earlyDoubleMin: number; // 스타트 후 ~N분 = 더블얼리
  earlySingleMin: number; // 스타트 후 ~M분 = 1얼리
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
export function defaultClockConfig(): ClockConfig {
  const L = (sb: number, bb: number, ante: number, minutes = 20): ClockLevel => ({ kind: 'level', sb, bb, ante, minutes });
  const B = (minutes = 8): ClockLevel => ({ kind: 'break', sb: 0, bb: 0, ante: 0, minutes, label: `BREAK ${minutes}Min.` });
  return {
    title: '데일리 토너먼트',
    startStack: 30000, rebuyStack: 30000, addonStack: 30000,
    earlyBonus: 10000, doubleEarlyBonus: 20000,
    regCloseLevel: 9, earlyDoubleMin: 20, earlySingleMin: 80,
    mysteryBounty: 0,
    prizes: [
      { place: '1st', amount: 400 }, { place: '2nd', amount: 150 }, { place: '3rd', amount: 100 },
      { place: '4th', amount: 70 }, { place: '5th', amount: 60 }, { place: '6th', amount: 50 },
    ],
    levels: [
      L(100, 200, 200), L(200, 300, 300), L(200, 400, 400), L(300, 500, 500),
      L(300, 600, 600), B(8),
      L(400, 800, 800), L(500, 1000, 1000), L(600, 1200, 1200), L(800, 1600, 1600),
      L(1000, 2000, 2000), B(8),
      L(1500, 3000, 3000), L(2000, 4000, 4000), L(3000, 6000, 6000),
    ],
  };
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

/** 장부 바인 기록에서 엔트리/리바인/얼리 자동 집계. startISO = 토너먼트 시작 시각(얼리 판정 기준, 없으면 얼리 0). */
export function deriveClockCounts(buyins: LedgerBuyin[], config: ClockConfig, startISO?: string | null): DerivedCounts {
  const players = new Set<string>();
  let rebuys = 0, earlies = 0, doubleEarlies = 0;
  const startMs = startISO ? new Date(startISO).getTime() : NaN;
  for (const b of buyins) {
    players.add(b.playerName);
    if (b.entryNo > 1) rebuys++;
    if (!Number.isNaN(startMs)) {
      const mins = (new Date(b.buyinAt).getTime() - startMs) / 60_000;
      if (mins >= 0 && mins <= config.earlyDoubleMin) { earlies++; doubleEarlies++; }
      else if (mins > config.earlyDoubleMin && mins <= config.earlySingleMin) { earlies++; }
    }
  }
  return { entries: players.size, rebuys, earlies, doubleEarlies, totalBuyins: buyins.length };
}
