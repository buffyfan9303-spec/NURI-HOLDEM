// src/api/staffSchedule.ts — 딜러/직원 월별 출근 스케줄
import { supabase, IS_MOCK } from '../lib/supabase';

export interface StaffShift {
  date: string; name: string;
  startHm?: string | null;   // 계획 출근(HH:mm)
  checkIn?: string | null;   // 실제 출근(HH:mm)
  checkOut?: string | null;  // 실제 퇴근(HH:mm)
  confirmed?: boolean;
}

/** 기간(월) 범위의 출근 배정 조회 */
export async function getStaffSchedule(venueId: string, from: string, to: string): Promise<StaffShift[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('staff_schedule')
    .select('work_date, staff_name, start_hm, check_in, check_out, confirmed')
    .eq('venue_id', venueId).gte('work_date', from).lte('work_date', to);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    date: r.work_date, name: r.staff_name,
    startHm: r.start_hm ?? null, checkIn: r.check_in ?? null, checkOut: r.check_out ?? null, confirmed: !!r.confirmed,
  }));
}

/** 시프트 시각/확정 수정(부분 업데이트) — 행이 없으면 무시(먼저 배정 필요) */
export async function setShiftTimes(venueId: string, date: string, name: string, patch: { startHm?: string | null; checkIn?: string | null; checkOut?: string | null; confirmed?: boolean }): Promise<void> {
  if (IS_MOCK) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = {};
  if (patch.startHm !== undefined) p.start_hm = patch.startHm;
  if (patch.checkIn !== undefined) p.check_in = patch.checkIn;
  if (patch.checkOut !== undefined) p.check_out = patch.checkOut;
  if (patch.confirmed !== undefined) p.confirmed = patch.confirmed;
  const { error } = await supabase.from('staff_schedule').update(p)
    .eq('venue_id', venueId).eq('work_date', date).eq('staff_name', name);
  if (error) throw error;
}

/** 해당 기간 스케줄 전체 확정 */
export async function confirmSchedule(venueId: string, from: string, to: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('staff_schedule').update({ confirmed: true })
    .eq('venue_id', venueId).gte('work_date', from).lte('work_date', to);
  if (error) throw error;
}

/** 매장 소속 전 직원에게 알림 발송(업주/POS관리자만) */
export async function notifyVenueStaff(venueId: string, title: string, message: string, link?: string): Promise<number> {
  if (IS_MOCK) return 0;
  const { data, error } = await supabase.rpc('notify_venue_staff', { p_venue_id: venueId, p_title: title, p_message: message, p_link: link ?? null });
  if (error) throw error;
  return (data as number) ?? 0;
}

// ── 인건비 설정 ──────────────────────────────────────────────────────────────
export interface StaffWage { name: string; hourlyWage: number; payday: number; weeklyOff: string; memo?: string }

export async function getStaffWages(venueId: string): Promise<StaffWage[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('staff_wage')
    .select('staff_name, hourly_wage, payday, weekly_off, memo').eq('venue_id', venueId);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ name: r.staff_name, hourlyWage: r.hourly_wage ?? 0, payday: r.payday ?? 0, weeklyOff: r.weekly_off ?? '', memo: r.memo ?? undefined }));
}

export async function saveStaffWage(venueId: string, w: StaffWage): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('staff_wage').upsert(
    { venue_id: venueId, staff_name: w.name, hourly_wage: w.hourlyWage, payday: w.payday, weekly_off: w.weeklyOff, memo: w.memo ?? null, updated_at: new Date().toISOString() },
    { onConflict: 'venue_id,staff_name' },
  );
  if (error) throw error;
}

/** 특정 날짜에 직원 출근 배정(중복 무시) */
export async function addStaffShift(venueId: string, date: string, name: string): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('staff_schedule').upsert(
    { venue_id: venueId, work_date: date, staff_name: name.trim(), created_by: user?.id ?? null },
    { onConflict: 'venue_id,work_date,staff_name', ignoreDuplicates: true },
  );
  if (error) throw error;
}

/** 출근 배정 해제 */
export async function removeStaffShift(venueId: string, date: string, name: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('staff_schedule').delete()
    .eq('venue_id', venueId).eq('work_date', date).eq('staff_name', name);
  if (error) throw error;
}
