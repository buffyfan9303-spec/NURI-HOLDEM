// src/api/ledger.ts — NURI POS 장부 시스템 API
import { supabase, IS_MOCK } from '../lib/supabase';

export type PaymentMethod = 'ticket' | 'cash' | 'transfer' | 'card';

export interface LedgerBuyin {
  id: string;
  venueId: string;
  sessionDate: string;
  playerName: string;
  entryNo: number;
  paymentMethod: PaymentMethod;
  isUnpaid: boolean;
  buyinAt: string;
}

export interface LedgerSession {
  venueId: string;
  sessionDate: string;
  buyinAmount: number;
  targetEntries: number;
  title?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToBuyin = (r: any): LedgerBuyin => ({
  id: r.id, venueId: r.venue_id, sessionDate: r.session_date,
  playerName: r.player_name, entryNo: r.entry_no,
  paymentMethod: r.payment_method as PaymentMethod, isUnpaid: !!r.is_unpaid,
  buyinAt: r.buyin_at,
});

// ── 권한 ──────────────────────────────────────────────────────────────────────
export async function canAccessLedger(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data, error } = await supabase.rpc('can_access_ledger', { p_venue_id: venueId });
  if (error) return false;
  return !!data;
}
export async function canManagePos(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data, error } = await supabase.rpc('can_manage_pos', { p_venue_id: venueId });
  if (error) return false;
  return !!data;
}

// ── 세션(매장+날짜) ───────────────────────────────────────────────────────────
export async function getLedgerSession(venueId: string, date = today()): Promise<LedgerSession> {
  if (IS_MOCK) return { venueId, sessionDate: date, buyinAmount: 0, targetEntries: 0 };
  const { data } = await supabase.from('ledger_sessions')
    .select('*').eq('venue_id', venueId).eq('session_date', date).maybeSingle();
  return {
    venueId, sessionDate: date,
    buyinAmount: data?.buyin_amount ?? 0,
    targetEntries: data?.target_entries ?? 0,
    title: data?.title ?? undefined,
  };
}
export async function saveLedgerSession(s: LedgerSession): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_sessions').upsert({
    venue_id: s.venueId, session_date: s.sessionDate,
    buyin_amount: s.buyinAmount, target_entries: s.targetEntries, title: s.title ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,session_date' });
  if (error) throw error;
}

// ── 바이인(셀) ────────────────────────────────────────────────────────────────
export async function getLedgerBuyins(venueId: string, date = today()): Promise<LedgerBuyin[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_buyins')
    .select('*').eq('venue_id', venueId).eq('session_date', date)
    .order('player_name').order('entry_no');
  if (error) throw error;
  return (data ?? []).map(rowToBuyin);
}

/** 셀 결제 입력/수정 — (매장,날짜,플레이어,회차) 충돌 시 갱신. buyin_at = NOW */
export async function upsertBuyin(input: {
  venueId: string; sessionDate: string; playerName: string; entryNo: number;
  paymentMethod: PaymentMethod; isUnpaid: boolean;
}): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('ledger_buyins').upsert({
    venue_id: input.venueId, session_date: input.sessionDate,
    player_name: input.playerName, entry_no: input.entryNo,
    payment_method: input.paymentMethod, is_unpaid: input.isUnpaid,
    buyin_at: new Date().toISOString(), created_by: user?.id ?? null,
  }, { onConflict: 'venue_id,session_date,player_name,entry_no' });
  if (error) throw error;
}

/** 바이인 취소(삭제) — 업주 설정 비밀번호 필요 */
export async function cancelBuyin(id: string, password: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('cancel_ledger_buyin', { p_id: id, p_password: password });
  if (error) throw error;
}

// ── 실시간 동기화 ─────────────────────────────────────────────────────────────
export function subscribeLedger(venueId: string, onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase
    .channel(`ledger:${venueId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'ledger_buyins', filter: `venue_id=eq.${venueId}` },
      () => onChange(),
    )
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ── 취소 비밀번호 ─────────────────────────────────────────────────────────────
export async function posHasPassword(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data } = await supabase.rpc('pos_has_password', { p_venue_id: venueId });
  return !!data;
}
export async function setPosCancelPassword(venueId: string, password: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_pos_cancel_password', { p_venue_id: venueId, p_password: password });
  if (error) throw error;
}

// ── 직원 장부 권한 ────────────────────────────────────────────────────────────
export async function getLedgerAccessUserIds(venueId: string): Promise<string[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_access').select('user_id').eq('venue_id', venueId);
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.user_id);
}
export async function grantLedgerAccess(venueId: string, userId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('grant_ledger_access', { p_venue_id: venueId, p_user_id: userId });
  if (error) throw error;
}
export async function revokeLedgerAccess(venueId: string, userId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('revoke_ledger_access', { p_venue_id: venueId, p_user_id: userId });
  if (error) throw error;
}
