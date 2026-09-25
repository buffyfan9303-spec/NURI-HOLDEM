// src/api/dealerShifts.ts — 딜러 시프트(로테이션) + 급여 명세. 관계자(can_manage_pos)만 접근.
import { supabase, IS_MOCK } from '../lib/supabase';
import { mustAffect } from './_mustAffect';

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
  // ⚠ error 를 버리면 RLS 거부·네트워크 순단이 전부 '딜러 근무 0건' 으로 resolve 된다 — 정산 화면의 딜러 인건비가
  //   조용히 0 이 되고 `dealerPay > 0` 가드 때문에 분해 줄까지 사라져 빠졌다는 힌트도 없었다(F6, 2026-09-13).
  //   같은 파일의 addDealerShift·형제 getStaffSchedule 과 같이 던진다. 호출부는 dealerErr 로 받는다.
  const { data, error } = await supabase.from('dealer_shifts').select('*')
    .eq('venue_id', venueId).gte('shift_date', from).lte('shift_date', to)
    .order('shift_date', { ascending: true });
  if (error) throw error;
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
  // 종전엔 error 조차 안 봤다 — 403 이든 RLS 0행이든 호출부가 reload 만 하고 넘어가 시프트가 되살아났다.
  await mustAffect(supabase.from('dealer_shifts').delete().eq('id', id));
}

// 근무 시간·급여는 src/lib/staffPay.ts(dealerWageShift · laborSummary)가 센다 — 예전 shiftHours 는 교대마다 0.1h 로
// 반올림해 1분 단위 전액 지급(근로기준법 제43조)과 어긋났다(18:00~18:07 = 0.1h = 1,200원, 실제 7분 = 1,400원).
