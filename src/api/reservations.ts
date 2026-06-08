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

// 업주/운영자용 — 예약자 실제 계정(닉네임·실명)까지. 해당 매장 권한자만(RPC 게이트).
export interface OwnerReservation { id: string; displayName: string; nickname: string | null; realName: string | null; createdAt: string; }
export async function getOwnerReservations(scheduleId: string): Promise<OwnerReservation[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('schedule_reservations_for_owner', { p_schedule_id: scheduleId });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, displayName: r.display_name, nickname: r.nickname ?? null, realName: r.real_name ?? null, createdAt: r.created_at }));
}

export async function getReservationCounts(scheduleIds: string[]): Promise<Record<string, number>> {
  if (IS_MOCK || scheduleIds.length === 0) return {};
  const { data } = await supabase.from('schedule_reservations').select('schedule_id').in('schedule_id', scheduleIds);
  const m: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (data ?? []).forEach((r: any) => { m[r.schedule_id] = (m[r.schedule_id] ?? 0) + 1; });
  return m;
}

// 예약: 동일 예약명(닉네임) 다른 회원 사용 시 '이미 등록된 닉네임입니다' 차단(RPC). 본인 갱신 허용.
export async function createReservation(scheduleId: string, displayName: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('reserve_schedule', { p_schedule_id: scheduleId, p_name: displayName });
  if (error) throw new Error(error.message);
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

/** 내 활동 통계 — 예약 후 매장 방문(지난 일정) / 예정 / 전체 횟수. 프로필 뱃지·점수용. */
export async function getMyVisitStats(): Promise<{ visits: number; upcoming: number; total: number }> {
  const empty = { visits: 0, upcoming: 0, total: 0 };
  if (IS_MOCK) return empty;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;
  // schedule_reservations → schedules(date) 조인. 지난 날짜 예약 = 방문으로 집계.
  const { data, error } = await supabase
    .from('schedule_reservations')
    .select('schedule_id, schedules!inner(date)')
    .eq('user_id', user.id);
  if (error || !data) return empty;
  const today = new Date().toLocaleDateString('en-CA');
  let visits = 0, upcoming = 0;
  for (const r of data as unknown as { schedules?: { date?: string } }[]) {
    const d = r.schedules?.date;
    if (!d) continue;
    if (d < today) visits++; else upcoming++;
  }
  return { visits, upcoming, total: data.length };
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

/** 단골 TOP — 장부 바이인 기준 이름별 바인 횟수 + 방문(고유 일자) 횟수 집계. (관계자 제외는 호출부에서) */
export interface VenueRegular { name: string; buyins: number; visits: number }
export async function getVenueRegulars(venueId: string): Promise<VenueRegular[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('ledger_buyins').select('player_name, session_date').eq('venue_id', venueId);
  const map = new Map<string, { buyins: number; dates: Set<string> }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (data ?? []).forEach((b: any) => {
    const n = (b.player_name ?? '').trim();
    if (!n) return;
    const e = map.get(n) ?? { buyins: 0, dates: new Set<string>() };
    e.buyins += 1;
    if (b.session_date) e.dates.add(b.session_date);
    map.set(n, e);
  });
  return [...map.entries()]
    .map(([name, e]) => ({ name, buyins: e.buyins, visits: e.dates.size }))
    .sort((a, b) => (b.buyins - a.buyins) || (b.visits - a.visits));
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
