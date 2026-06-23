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

/** 매장 손님별 방문 집계(user_id→방문횟수) — '오늘 방문 손님' 보드의 단골/첫방문 배지용. can_manage_pos 만 조회. */
export async function getVenueVisitorStats(venueId: string): Promise<Record<string, number>> {
  if (IS_MOCK) return {};
  const { data } = await supabase.from('customer_profiles')
    .select('user_id, visit_count').eq('venue_id', venueId).not('user_id', 'is', null);
  const m: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) if (r.user_id) m[r.user_id as string] = (r.visit_count as number) ?? 0;
  return m;
}

/** 다가오는 생일 단골(7일 내) — 월·일 비교, 연도 무시 */
export async function getUpcomingBirthdays(venueId: string): Promise<{ name: string; birthday: string; dday: number }[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('customer_profiles')
    .select('name, birthday').eq('venue_id', venueId).not('birthday', 'is', null);
  const today = new Date();
  const out: { name: string; birthday: string; dday: number }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const b = String(r.birthday ?? '');
    const m = b.match(/(\d{2})-(\d{2})$/) ?? b.match(/^(\d{1,2})[/-](\d{1,2})$/);
    if (!m) continue;
    const next = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) next.setFullYear(next.getFullYear() + 1);
    const dday = Math.round((next.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
    if (dday <= 7) out.push({ name: r.name, birthday: b.slice(5) || b, dday });
  }
  return out.sort((a, b) => a.dday - b.dday);
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
