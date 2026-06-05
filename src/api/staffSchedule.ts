// src/api/staffSchedule.ts — 딜러/직원 월별 출근 스케줄
import { supabase, IS_MOCK } from '../lib/supabase';

export interface StaffShift { date: string; name: string }

/** 기간(월) 범위의 출근 배정 조회 */
export async function getStaffSchedule(venueId: string, from: string, to: string): Promise<StaffShift[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('staff_schedule')
    .select('work_date, staff_name')
    .eq('venue_id', venueId).gte('work_date', from).lte('work_date', to);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ date: r.work_date, name: r.staff_name }));
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
