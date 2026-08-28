// src/api/staffSchedule.ts — 딜러/직원 월별 출근 스케줄
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';

/** 직원 출근 스케줄 변경 실시간 구독(매장별) — 셀프 출퇴근·배정 변경을 자동 반영 */
export function subscribeStaffSchedule(venueId: string, onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase
    .channel(`staff_sched:${venueId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_schedule', filter: `venue_id=eq.${venueId}` }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

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

/**
 * 직원 본인 출퇴근 기록 — check_in/check_out 만 바꾸는 전용 RPC.
 *
 * 왜 setShiftTimes(직접 UPDATE)를 못 쓰나: staff_schedule 의 SELECT/UPDATE 정책은
 *   can_manage_pos/can_access_ledger 기준이라 **구성원(venue_staff)은 자기 행조차 못 읽고**,
 *   PATCH 는 0행을 고치고도 200 을 돌려줘 조용히 실패했다(2026-08-28 실측).
 *   UPDATE 정책을 통째로 넓히면 직원이 confirmed·start_hm 까지 바꿀 수 있어,
 *   읽기는 정책(staff_sched_self_select)으로 열고 쓰기는 이 RPC 두 칼럼으로 좁힌다.
 */
export async function setMyShiftTime(venueId: string, date: string, field: 'checkIn' | 'checkOut', val: string | null): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_my_shift_time', {
    p_venue_id: venueId, p_work_date: date,
    p_field: field === 'checkIn' ? 'check_in' : 'check_out',
    p_value: val || null,
  });
  if (error) throw error;
}

/**
 * 명부에 이름만 등록(배정 전) — 인건비 설정 행을 빈 값으로 만들어 둔다.
 *
 * 왜 이렇게 하나: '직원 등록' 버튼이 원래 React state 에만 이름을 넣어서, 시프트를 배정하기
 *   전에 새로고침하면 등록한 이름이 그냥 사라졌다(업주에겐 '등록했는데 없어짐'). 명부용 테이블을
 *   새로 만드는 대신 이미 직원 단위인 staff_wage 를 쓴다 — 등록하면 「인건비 관리」에도 같은
 *   사람이 바로 나타나 다음 할 일(시급 입력)로 이어진다.
 */
export async function addStaffName(venueId: string, name: string): Promise<void> {
  if (IS_MOCK) return;
  const n = name.trim();
  if (!n) return;
  const { error } = await supabase.from('staff_wage').upsert(
    { venue_id: venueId, staff_name: n, updated_at: new Date().toISOString() },
    { onConflict: 'venue_id,staff_name', ignoreDuplicates: true },
  );
  if (error) throw error;
}

/** 명부에서 이름 빼기 — 등록만 하고 배정한 적 없는 이름(오타 등) 정리용. 인건비 설정도 함께 사라진다. */
export async function removeStaffName(venueId: string, name: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('staff_wage').delete()
    .eq('venue_id', venueId).eq('staff_name', name);
  if (error) throw error;
}

/** 특정 날짜에 직원 출근 배정(중복 무시) */
export async function addStaffShift(venueId: string, date: string, name: string): Promise<void> {
  if (IS_MOCK) return;
  const user = await currentUser();
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
