// src/lib/hallOfFame.ts — 명예의 전당: 운영자 수동 등록(우선) + 기존 자동 집계(폴백).
//
// 오너 #10 "명예의 전당의 경우에는 관리자 설정에서 등록할 수 있게 해줘".
//
// 왜 자동 집계를 지우지 않고 '우선순위' 구조로 갔는가:
//   · 자동 집계(loyalty.getMonthlyHall)는 venue_rankings 를 지난달 구간으로 묶어 TOP3 를 뽑는다.
//     매장이 순위를 안 올린 달에는 결과가 통째로 비고(오너 스크린샷의 빈 화면이 그 상태),
//     오프라인 대회·특별 공로처럼 DB 밖의 명예는 담지 못한다.
//   · 반대로 자동 집계를 없애면 운영자가 매달 손으로 채워야만 화면이 산다. 한 달만 걸러도 다시 빈 화면.
//   ⇒ 수동 지정이 있으면 그것을, 없으면 자동 집계를. 개입 안 하면 지금과 100% 동일하게 동작한다.
//
// 점수 규칙은 여기서 다시 정의하지 않는다 — 자동 집계는 loyalty.getMonthlyHall() 하나뿐이고
// 이 파일은 '어느 쪽을 보여줄지'만 고른다(규칙 2중화 금지).
import { supabase, IS_MOCK } from './supabase';
import { getMonthlyHall, type HallRow } from './loyalty';

export interface HallEntry extends HallRow {
  /** 운영자가 붙인 한 줄 소개 — 수동 등록에만 있다 */
  note?: string | null;
}
export interface HallBoard {
  /** 화면 라벨(예: '7월') */
  label: string;
  rows: HallEntry[];
  /** manual = 운영자 등록 · auto = 기존 자동 집계 */
  source: 'manual' | 'auto';
}

/** 'YYYY-MM' — 기준일의 전월 */
export function lastMonthPeriod(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** 'YYYY-MM' — 기준일의 당월(운영자가 미리 채워두는 용도) */
export function thisMonthPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
/** 'YYYY-MM' → '7월' (해가 다르면 '2025년 12월') */
export function periodLabel(period: string, now = new Date()): string {
  const [y, m] = period.split('-');
  const month = `${Number(m)}월`;
  return Number(y) === now.getFullYear() ? month : `${y}년 ${month}`;
}

export interface HallOfFameRow {
  id: number; period: string; rank: number; nickname: string;
  note: string | null; pts: number; wins: number;
}

/**
 * 명예의 전당 보드 데이터.
 * 1) 지난달 이하 period 중 **가장 최근에 등록된** 수동 행이 있으면 그것(그 period 라벨로 표시).
 * 2) 없으면 기존 자동 집계(지난달).
 */
export async function getHallOfFame(): Promise<HallBoard> {
  const target = lastMonthPeriod();
  if (IS_MOCK) return { label: periodLabel(target), rows: [], source: 'auto' };
  const { data } = await supabase
    .from('hall_of_fame')
    .select('id, period, rank, nickname, note, pts, wins')
    .lte('period', target)
    .order('period', { ascending: false })
    .order('rank', { ascending: true })
    .limit(9);
  const rows = (data ?? []) as HallOfFameRow[];
  if (rows.length > 0) {
    const newest = rows[0].period;
    return {
      label: periodLabel(newest),
      source: 'manual',
      rows: rows.filter((r) => r.period === newest).slice(0, 3)
        .map((r) => ({ nickname: r.nickname, pts: r.pts, wins: r.wins, note: r.note })),
    };
  }
  const auto = await getMonthlyHall();
  return { label: auto.label, rows: auto.rows, source: 'auto' };
}

// ── 운영자 CRUD (RLS 가 admin 만 쓰기 허용) ──────────────────────────────────
export async function adminListHallOfFame(): Promise<HallOfFameRow[]> {
  const { data, error } = await supabase
    .from('hall_of_fame')
    .select('id, period, rank, nickname, note, pts, wins')
    .order('period', { ascending: false })
    .order('rank', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as HallOfFameRow[];
}

/** (period, rank) 유니크 — 같은 자리면 덮어쓴다 */
export async function adminSaveHallEntry(e: {
  period: string; rank: number; nickname: string; note?: string | null; pts?: number; wins?: number;
}): Promise<void> {
  const row = {
    period: e.period, rank: e.rank, nickname: e.nickname.trim(),
    note: e.note?.trim() ? e.note.trim() : null,
    pts: Math.max(0, Math.floor(e.pts ?? 0)), wins: Math.max(0, Math.floor(e.wins ?? 0)),
  };
  const { error } = await supabase.from('hall_of_fame').upsert(row, { onConflict: 'period,rank' });
  if (error) throw new Error(error.message);
}

export async function adminDeleteHallEntry(id: number): Promise<void> {
  const { error } = await supabase.from('hall_of_fame').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * '자동 집계 불러오기' — 지난달 자동 집계를 폼에 채워 넣기 위한 프리필.
 * 지난달 외 기간은 지원하지 않는다(집계 규칙을 여기서 다시 구현하면 두 벌이 되기 때문).
 */
export async function autoHallPrefill(): Promise<HallEntry[]> {
  const auto = await getMonthlyHall();
  return auto.rows;
}
