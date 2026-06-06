// src/api/reservations.ts — 포스터(게임) 예약 + 단골 고객 활동내역 CRM
import { supabase, IS_MOCK } from '../lib/supabase';

/** 예약 변경 실시간 구독 — 신규/취소 예약을 게임관리에 자동 반영 */
export function subscribeReservations(onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase
    .channel('schedule_reservations_all')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_reservations' }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export interface Reservation { id: string; scheduleId: string; userId: string; displayName: string; createdAt: string; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToRes = (r: any): Reservation => ({ id: r.id, scheduleId: r.schedule_id, userId: r.user_id, displayName: r.display_name, createdAt: r.created_at });

export async function getMyReservation(scheduleId: string): Promise<Reservation | null> {
  if (IS_MOCK) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('schedule_reservations').select('*').eq('schedule_id', scheduleId).eq('user_id', user.id).maybeSingle();
  return data ? rowToRes(data) : null;
}

export async function getReservations(scheduleId: string): Promise<Reservation[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('schedule_reservations').select('*').eq('schedule_id', scheduleId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToRes);
}

export async function getReservationCounts(scheduleIds: string[]): Promise<Record<string, number>> {
  if (IS_MOCK || scheduleIds.length === 0) return {};
  const { data } = await supabase.from('schedule_reservations').select('schedule_id').in('schedule_id', scheduleIds);
  const m: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (data ?? []).forEach((r: any) => { m[r.schedule_id] = (m[r.schedule_id] ?? 0) + 1; });
  return m;
}

export async function createReservation(scheduleId: string, displayName: string): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('schedule_reservations').upsert(
    { schedule_id: scheduleId, user_id: user.id, display_name: (displayName.trim() || '예약자').slice(0, 30) },
    { onConflict: 'schedule_id,user_id' },
  );
  if (error) throw error;
}

export async function cancelMyReservation(scheduleId: string): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('schedule_reservations').delete().eq('schedule_id', scheduleId).eq('user_id', user.id);
  if (error) throw error;
}

/** 업주: 예약 삭제 / 이름 수정 */
export async function deleteReservation(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('schedule_reservations').delete().eq('id', id);
  if (error) throw error;
}
export async function updateReservationName(id: string, name: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('schedule_reservations').update({ display_name: name.trim().slice(0, 30) }).eq('id', id);
  if (error) throw error;
}

/** 이 매장의 예약자 이름별 누적 예약 횟수(단골 판별: 5회+) */
export async function getVenueReserverCounts(venueId: string): Promise<Record<string, number>> {
  if (IS_MOCK) return {};
  const { data: scheds } = await supabase.from('schedules').select('id').eq('venue_id', venueId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = (scheds ?? []).map((s: any) => s.id);
  if (!ids.length) return {};
  const { data } = await supabase.from('schedule_reservations').select('display_name').in('schedule_id', ids);
  const m: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (data ?? []).forEach((r: any) => { const k = (r.display_name ?? '').trim(); if (k) m[k] = (m[k] ?? 0) + 1; });
  return m;
}

/** 단골 고객 활동내역 — 이름 매칭. 바이인/방문/금액(장부) + 머니인(랭킹) + 예약. */
export interface CustomerActivity { name: string; buyins: number; visits: number; amount: number; moneyIn: number; reservations: number; }
export async function getCustomerActivity(venueId: string, name: string): Promise<CustomerActivity> {
  const base: CustomerActivity = { name, buyins: 0, visits: 0, amount: 0, moneyIn: 0, reservations: 0 };
  if (IS_MOCK) return base;
  const [{ data: bs }, { data: sess }, { data: rk }, resCounts] = await Promise.all([
    supabase.from('ledger_buyins').select('session_date, payment_method, is_unpaid, is_split, cash_amount, card_amount, transfer_amount, unpaid_amount, discount_index').eq('venue_id', venueId).eq('player_name', name),
    supabase.from('ledger_sessions').select('session_date, buyin_amount').eq('venue_id', venueId),
    supabase.from('venue_rankings').select('id').eq('venue_id', venueId).eq('name', name),
    getVenueReserverCounts(venueId),
  ]);
  const unit = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sess ?? []).forEach((s: any) => unit.set(s.session_date, s.buyin_amount ?? 0));
  const dates = new Set<string>();
  let amount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (bs ?? []).forEach((b: any) => {
    dates.add(b.session_date);
    if (b.is_split) amount += (b.cash_amount ?? 0) + (b.card_amount ?? 0) + (b.transfer_amount ?? 0);
    else if (b.payment_method !== 'support' && b.payment_method !== 'ticket' && !b.is_unpaid) amount += unit.get(b.session_date) ?? 0;
  });
  return {
    name,
    buyins: (bs ?? []).length,
    visits: dates.size,
    amount,
    moneyIn: (rk ?? []).length,
    reservations: resCounts[name] ?? 0,
  };
}
