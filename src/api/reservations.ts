// src/api/reservations.ts — 포스터(게임) 예약 + 단골 고객 활동내역 CRM
import { supabase, IS_MOCK } from '../lib/supabase';

/** 예약 변경 실시간 구독 — 신규/취소 예약을 게임관리에 자동 반영 */
export function subscribeReservations(onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase
    .channel(`schedule_reservations_all_${Math.random().toString(36).slice(2)}`)
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
    supabase.from('ledger_buyins').select('session_date, game_seq, payment_method, is_unpaid, is_split, cash_amount, card_amount, transfer_amount, unpaid_amount, discount_index').eq('venue_id', venueId).eq('player_name', name),
    supabase.from('ledger_sessions').select('session_date, game_seq, buyin_amount').eq('venue_id', venueId),
    // 머니인(입상) — venue_rankings에는 name 컬럼이 없음: 닉네임/실명 둘 다 매칭
    supabase.from('venue_rankings').select('id, nickname, real_name').eq('venue_id', venueId),
    getVenueReserverCounts(venueId),
  ]);
  const nameKey = name.trim().toLowerCase();
  const moneyInCnt = (rk ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => String(r.nickname ?? '').trim().toLowerCase() === nameKey || String(r.real_name ?? '').trim().toLowerCase() === nameKey,
  ).length;
  const unit = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sess ?? []).forEach((s: any) => unit.set(s.session_date + '#' + (s.game_seq ?? 1), s.buyin_amount ?? 0));
  const dates = new Set<string>();
  let amount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (bs ?? []).forEach((b: any) => {
    dates.add(b.session_date);
    if (b.is_split) amount += (b.cash_amount ?? 0) + (b.card_amount ?? 0) + (b.transfer_amount ?? 0);
    else if (b.payment_method !== 'support' && b.payment_method !== 'ticket' && !b.is_unpaid) amount += unit.get(b.session_date + '#' + (b.game_seq ?? 1)) ?? 0;
  });
  return {
    name,
    buyins: (bs ?? []).length,
    visits: dates.size,
    amount,
    moneyIn: moneyInCnt,
    reservations: resCounts[name] ?? 0,
  };
}

// ── 내 대회 참가(예약) 이력 — 개인 대시보드 ───────────────────────────────────
export interface MyReservationRow { scheduleId: string; title: string; date: string; startTime: string | null; venueName: string | null; displayName: string; reservedAt: string }
export async function getMyReservations(limit = 30): Promise<MyReservationRow[]> {
  if (IS_MOCK) return [];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('schedule_reservations')
    .select('schedule_id, display_name, created_at, schedules(title, date, start_time, venues(name))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    scheduleId: r.schedule_id, displayName: r.display_name, reservedAt: r.created_at,
    title: r.schedules?.title ?? '(대회)', date: r.schedules?.date ?? '',
    startTime: r.schedules?.start_time ?? null, venueName: r.schedules?.venues?.name ?? null,
  }));
}

// ── 고객 분석(업주/통계) — 방문 손님 전체 리스트 + 행동 통계 ─────────────────────
// 바인 횟수 · 방문 · 머니인(입상) · 머니인 비율 · 미수 횟수 · 최다 결제수단 · 주 방문 시간대 · 최근 방문
export interface CustomerStat {
  name: string;
  buyins: number;
  visits: number;
  moneyIn: number;
  rate: number | null;       // 머니인 ÷ 바인 (%) — 바인 0이면 null
  unpaidCount: number;
  topPayment: string | null; // 'cash' | 'card' | ...
  peakHour: number | null;   // 가장 잦은 바인 시각(0~23)
  lastVisit: string | null;  // YYYY-MM-DD
}

const PAY_LABEL: Record<string, string> = { cash: '현금', card: '카드', transfer: '이체', ticket: '이용권', support: '서포트' };
export function paymentLabel(code: string | null): string { return code ? (PAY_LABEL[code] ?? code) : '-'; }

export async function getVenueCustomerStats(venueId: string, from?: string, to?: string): Promise<CustomerStat[]> {
  if (IS_MOCK) return [];
  let q = supabase.from('ledger_buyins')
    .select('player_name, session_date, payment_method, is_unpaid, is_split, buyin_at')
    .eq('venue_id', venueId);
  if (from) q = q.gte('session_date', from);
  if (to) q = q.lte('session_date', to);
  const [{ data: bs }, { data: rk }] = await Promise.all([
    q,
    supabase.from('venue_rankings').select('nickname, real_name, ranking_date').eq('venue_id', venueId),
  ]);
  // 랭킹(머니인) 카운트 — 닉네임/실명 어느 쪽이든 매칭되도록 둘 다 키로 적재
  const moneyIn = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (rk ?? []) as any[]) {
    if (from && String(r.ranking_date) < from) continue;
    if (to && String(r.ranking_date) > to) continue;
    for (const key of [r.nickname, r.real_name]) {
      const k = String(key ?? '').trim().toLowerCase();
      if (k) moneyIn.set(k, (moneyIn.get(k) ?? 0) + 1);
    }
  }
  interface Acc { buyins: number; dates: Set<string>; unpaid: number; pay: Record<string, number>; hours: Record<number, number>; last: string }
  const map = new Map<string, Acc & { display: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (bs ?? []) as any[]) {
    const display = String(b.player_name ?? '').trim();
    if (!display) continue;
    const k = display.toLowerCase();
    const a = map.get(k) ?? { display, buyins: 0, dates: new Set<string>(), unpaid: 0, pay: {}, hours: {}, last: '' };
    a.buyins += 1;
    if (b.session_date) { a.dates.add(b.session_date); if (b.session_date > a.last) a.last = b.session_date; }
    if (b.is_unpaid) a.unpaid += 1;
    const pm = b.is_split ? 'split' : String(b.payment_method ?? '');
    if (pm && pm !== 'split') a.pay[pm] = (a.pay[pm] ?? 0) + 1;
    if (b.buyin_at) {
      const h = new Date(b.buyin_at).getHours();
      if (!Number.isNaN(h)) a.hours[h] = (a.hours[h] ?? 0) + 1;
    }
    map.set(k, a);
  }
  const top = (rec: Record<string, number>): string | null => {
    let best: string | null = null, n = 0;
    for (const [k, v] of Object.entries(rec)) if (v > n) { best = k; n = v; }
    return best;
  };
  return [...map.entries()].map(([k, a]) => {
    const mi = moneyIn.get(k) ?? 0;
    const peak = top(Object.fromEntries(Object.entries(a.hours).map(([h, v]) => [h, v])));
    return {
      name: a.display,
      buyins: a.buyins,
      visits: a.dates.size,
      moneyIn: mi,
      rate: a.buyins > 0 ? Math.round((mi / a.buyins) * 100) : null,
      unpaidCount: a.unpaid,
      topPayment: top(a.pay),
      peakHour: peak !== null ? Number(peak) : null,
      lastVisit: a.last || null,
    };
  }).sort((x, y) => (y.buyins - x.buyins) || (y.visits - x.visits));
}
