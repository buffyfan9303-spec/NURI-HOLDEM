// src/api/crm.ts — 고객 프로필(생일/연락처/메모) + 쿠폰. 관계자(can_manage_pos)만 접근.
import { supabase, IS_MOCK } from '../lib/supabase';

export interface CustomerProfile { name: string; birthday: string | null; phone: string | null; memo: string | null }
export interface Coupon { id: string; customerName: string; title: string; status: string; expiresAt: string | null; createdAt: string }

export async function getCustomerProfile(venueId: string, name: string): Promise<CustomerProfile | null> {
  if (IS_MOCK) return null;
  const { data } = await supabase.from('customer_profiles').select('*').eq('venue_id', venueId).eq('name', name).maybeSingle();
  return data ? { name, birthday: data.birthday ?? null, phone: data.phone ?? null, memo: data.memo ?? null } : null;
}

export async function saveCustomerProfile(venueId: string, name: string, p: { birthday?: string | null; phone?: string | null; memo?: string | null }): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('customer_profiles').upsert(
    { venue_id: venueId, name, birthday: p.birthday || null, phone: p.phone || null, memo: p.memo || null, updated_at: new Date().toISOString() },
    { onConflict: 'venue_id,name' },
  );
  if (error) throw error;
}

export async function getCoupons(venueId: string, customerName: string): Promise<Coupon[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('coupons').select('*').eq('venue_id', venueId).eq('customer_name', customerName).order('created_at', { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, customerName: r.customer_name, title: r.title, status: r.status, expiresAt: r.expires_at ?? null, createdAt: r.created_at }));
}

export async function issueCoupon(venueId: string, customerName: string, title: string, expiresAt?: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('coupons').insert({ venue_id: venueId, customer_name: customerName, title: title.trim().slice(0, 40) || '쿠폰', expires_at: expiresAt || null });
  if (error) throw error;
}

export async function setCouponStatus(id: string, status: string): Promise<void> {
  if (IS_MOCK) return;
  await supabase.from('coupons').update({ status }).eq('id', id);
}
