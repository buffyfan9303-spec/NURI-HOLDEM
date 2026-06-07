// src/api/vouchers.ts — 매장이용권(store_vouchers). 모든 변경은 SECURITY DEFINER RPC로만.
import { supabase, IS_MOCK } from '../lib/supabase';

export interface Voucher {
  id: string; venueId: string; venueName: string | null; issuedBy: string;
  holderUserId: string | null; holderName: string | null;
  title: string; amount: number; status: string;
  usedVenueId: string | null; usedVenueName: string | null; usedAt: string | null; createdAt: string;
}
export interface VoucherUsage { usedVenueId: string | null; venueName: string | null; usedCount: number; totalAmount: number }
export interface VisitedVenue { venueId: string; venueName: string | null; visits: number }
export interface TransferTarget { id: string; display: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Voucher {
  return {
    id: r.id, venueId: r.venue_id, venueName: r.venue?.name ?? null, issuedBy: r.issued_by,
    holderUserId: r.holder_user_id ?? null, holderName: r.holder_name ?? null,
    title: r.title, amount: r.amount ?? 0, status: r.status ?? 'active',
    usedVenueId: r.used_venue_id ?? null, usedVenueName: r.used_venue?.name ?? null,
    usedAt: r.used_at ?? null, createdAt: r.created_at,
  };
}

/** 발행 매장 기준 전체 이용권 (업주·인증직원 열람) */
export async function listVenueVouchers(venueId: string): Promise<Voucher[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('store_vouchers')
    .select('*, venue:venue_id(name), used_venue:used_venue_id(name)')
    .eq('venue_id', venueId).order('created_at', { ascending: false });
  return (data ?? []).map(mapRow);
}

/** 내가 보유한 이용권 (손님) */
export async function listMyVouchers(): Promise<Voucher[]> {
  if (IS_MOCK) return [];
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return [];
  const { data } = await supabase.from('store_vouchers')
    .select('*, venue:venue_id(name), used_venue:used_venue_id(name)')
    .eq('holder_user_id', uid).order('created_at', { ascending: false });
  return (data ?? []).map(mapRow);
}

export async function issueVoucher(venueId: string, input: { title: string; amount?: number; holderName?: string; holderUserId?: string; note?: string }): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('issue_voucher', {
    p_venue_id: venueId, p_title: input.title, p_amount: input.amount ?? 0,
    p_holder_name: input.holderName ?? null, p_holder_user_id: input.holderUserId ?? null, p_note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function redeemVoucher(voucherId: string, usedVenueId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('redeem_voucher', { p_voucher_id: voucherId, p_used_venue_id: usedVenueId });
  if (error) throw new Error(error.message);
}

export async function revokeVoucher(voucherId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('revoke_voucher', { p_voucher_id: voucherId });
  if (error) throw new Error(error.message);
}

export async function transferVoucher(voucherId: string, toUserId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('transfer_voucher', { p_voucher_id: voucherId, p_to_user_id: toUserId });
  if (error) throw new Error(error.message);
}

export async function findUserForTransfer(nickname: string): Promise<TransferTarget[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('find_user_for_transfer', { p_nickname: nickname });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, display: r.display }));
}

export async function voucherUsageByVenue(venueId: string): Promise<VoucherUsage[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('voucher_usage_by_venue', { p_venue_id: venueId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ usedVenueId: r.used_venue_id ?? null, venueName: r.venue_name ?? null, usedCount: Number(r.used_count) || 0, totalAmount: Number(r.total_amount) || 0 }));
}

export async function myVisitedVenues(): Promise<VisitedVenue[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('my_visited_venues');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ venueId: r.venue_id, venueName: r.venue_name ?? null, visits: Number(r.visits) || 0 }));
}
