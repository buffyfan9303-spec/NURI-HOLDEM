// src/api/calendar.ts — 유저 캘린더의 데이터 계층.
//
// 파이프라인 **유저 쪽 거울**: 예약 → 방문 → 바인 → 순위 의 결과를 본인 시점으로 되짚는다.
// 여기서 새로 만드는 것은 '찜'과 '수기 뱅크롤' 둘뿐이고, 예약·입상은 사슬 위쪽의
// 기존 함수(reservations.getMyReservations · rankings.getMyRankingHistory)를 그대로 쓴다 —
// 같은 값을 두 번 만들지 않는다.
import { supabase, IS_MOCK } from '../lib/supabase';

// ── 찜한 게임 ────────────────────────────────────────────────────────────────
/** 내가 찜한 대회 id 집합. RLS 가 본인 행만 돌려준다. */
export async function getMyLikedScheduleIds(): Promise<Set<string>> {
  if (IS_MOCK) return new Set();
  const { data } = await supabase.from('schedule_likes').select('schedule_id');
  return new Set((data ?? []).map((r: { schedule_id: string }) => r.schedule_id));
}

/** 이 대회 하나만 찜 여부 확인 — 상세 모달용. 전체 목록을 받아오지 않는다. */
export async function isScheduleLiked(scheduleId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data } = await supabase.from('schedule_likes')
    .select('schedule_id').eq('schedule_id', scheduleId).maybeSingle();
  return !!data;
}

/** 찜 토글. 켜진 상태를 돌려준다(낙관적 UI 가 되돌릴 때 쓴다). */
export async function toggleScheduleLike(scheduleId: string, on: boolean): Promise<boolean> {
  if (IS_MOCK) return on;
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('로그인이 필요합니다.');
  if (on) {
    // 이미 있으면 조용히 통과 — 더블탭·중복 클릭이 에러가 되면 안 된다
    const { error } = await supabase.from('schedule_likes')
      .upsert({ user_id: uid, schedule_id: scheduleId }, { onConflict: 'user_id,schedule_id' });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('schedule_likes').delete()
      .eq('user_id', uid).eq('schedule_id', scheduleId);
    if (error) throw new Error(error.message);
  }
  return on;
}

// ── 바이인 기록(행 단위) ──────────────────────────────────────────────────────
export interface BuyinRow {
  sessionDate: string;      // 'YYYY-MM-DD'
  venueId: string | null;
  venueName: string;
  title: string;
  entryNo: number | null;
  amount: number;
  buyinAt: string | null;
}

/**
 * 내 바이인 기록. ledger_buyins 에는 user_id 가 없어(장부는 매장 직원이 손으로 적는 표)
 * 서버 RPC 가 real_name/nickname/name 으로 매칭한다 — my_play_history 와 **같은 규칙**.
 * 그래서 프로필 이름을 바꾸면 과거 기록이 안 잡힐 수 있다(화면에서 그 사실을 안내한다).
 */
export async function getMyBuyinHistory(limit = 200): Promise<BuyinRow[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('my_buyin_history', { p_limit: limit });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any): BuyinRow => ({
    sessionDate: r.session_date,
    venueId: r.venue_id ?? null,
    venueName: r.venue_name ?? '',
    title: r.title ?? '',
    entryNo: r.entry_no ?? null,
    amount: Number(r.amount ?? 0),
    buyinAt: r.buyin_at ?? null,
  }));
}

// ── 수기 뱅크롤 ──────────────────────────────────────────────────────────────
export interface BankrollEntry {
  id: string;
  entryDate: string;   // 'YYYY-MM-DD'
  amount: number;      // 음수 = 마이너스
  memo: string;
}

export async function getMyBankroll(limit = 300): Promise<BankrollEntry[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('bankroll_entries')
    .select('id, entry_date, amount, memo')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any): BankrollEntry => ({
    id: r.id, entryDate: r.entry_date, amount: r.amount, memo: r.memo ?? '',
  }));
}

export async function addBankrollEntry(e: Omit<BankrollEntry, 'id'>): Promise<void> {
  if (IS_MOCK) return;
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('로그인이 필요합니다.');
  if (!Number.isFinite(e.amount) || e.amount === 0) throw new Error('금액을 입력해 주세요 (0은 기록할 수 없어요)');
  const { error } = await supabase.from('bankroll_entries').insert({
    user_id: uid, entry_date: e.entryDate, amount: Math.trunc(e.amount), memo: e.memo.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function deleteBankrollEntry(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('bankroll_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
