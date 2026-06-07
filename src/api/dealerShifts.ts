// src/api/dealerShifts.ts — 딜러 시프트(로테이션) + 급여 명세. 관계자(can_manage_pos)만 접근.
import { supabase, IS_MOCK } from '../lib/supabase';

export interface DealerShift {
  id: string; venueId: string; dealerName: string; shiftDate: string;
  startTime: string | null; endTime: string | null; tableNo: string | null; hourlyWage: number; memo: string | null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const row = (r: any): DealerShift => ({
  id: r.id, venueId: r.venue_id, dealerName: r.dealer_name, shiftDate: r.shift_date,
  startTime: r.start_time ?? null, endTime: r.end_time ?? null, tableNo: r.table_no ?? null,
  hourlyWage: r.hourly_wage ?? 0, memo: r.memo ?? null,
});

export async function getDealerShifts(venueId: string, from: string, to: string): Promise<DealerShift[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('dealer_shifts').select('*')
    .eq('venue_id', venueId).gte('shift_date', from).lte('shift_date', to)
    .order('shift_date', { ascending: true });
  return (data ?? []).map(row);
}

export async function addDealerShift(input: { venueId: string; dealerName: string; shiftDate: string; startTime?: string; endTime?: string; tableNo?: string; hourlyWage?: number }): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('dealer_shifts').insert({
    venue_id: input.venueId, dealer_name: input.dealerName.trim().slice(0, 30) || '딜러',
    shift_date: input.shiftDate, start_time: input.startTime || null, end_time: input.endTime || null,
    table_no: input.tableNo?.trim() || null, hourly_wage: input.hourlyWage || 0,
  });
  if (error) throw error;
}

export async function removeDealerShift(id: string): Promise<void> {
  if (IS_MOCK) return;
  await supabase.from('dealer_shifts').delete().eq('id', id);
}

/** 'HH:MM' → 분. 종료<시작이면 익일로 +24h. 근무 시간(시간) 반환. */
export function shiftHours(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const m = (s: string) => { const [h, mm] = s.split(':').map(Number); return h * 60 + (mm || 0); };
  let d = m(end) - m(start);
  if (d < 0) d += 1440;
  return Math.round((d / 60) * 10) / 10;
}
