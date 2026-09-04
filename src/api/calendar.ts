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
  // DB 제약(bankroll_entry_not_empty)과 같은 규칙: 금액이 있거나 메모가 있거나.
  // amount 0 = 기타 스케줄(메모만) — 오너 지시 2026-09-04 로 허용됐다.
  if (!Number.isFinite(e.amount)) throw new Error('금액이 올바르지 않아요');
  if (e.amount === 0 && !e.memo.trim()) throw new Error('금액이나 내용 중 하나는 입력해 주세요');
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
