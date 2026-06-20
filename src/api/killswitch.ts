// src/api/killswitch.ts — 매장 킬스위치(전체 영구 삭제). 3중 게이트: 업주 본인 + 실명 + 일회성 비밀번호.
// 비밀번호는 최초 1회 설정 후 변경 불가(서버 강제). 모든 검증·삭제는 SECURITY DEFINER RPC에서 처리.
import { supabase, IS_MOCK } from '../lib/supabase';

/** 이 매장에 킬스위치 비밀번호가 이미 설정되어 있는지(true=설정됨 → 입력, false=미설정 → 최초 설정) */
export async function killSwitchIsSet(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data, error } = await supabase.rpc('kill_switch_is_set', { p_venue_id: venueId });
  if (error) return false;
  return data === true;
}

/** 킬스위치 비밀번호 최초 설정 — 업주만, 한 번만(이미 있으면 서버가 거부). */
export async function setKillPassword(venueId: string, password: string): Promise<void> {
  if (IS_MOCK) throw new Error('Mock');
  const { error } = await supabase.rpc('set_kill_password', { p_venue_id: venueId, p_password: password });
  if (error) throw new Error(error.message);
}

/** 매장 전체 영구 삭제 — 업주 본인 + 등록된 실명 + 킬스위치 비밀번호 3중 검증 통과 시 실행. 복구 불가. */
export async function killVenue(venueId: string, ownerName: string, password: string): Promise<void> {
  if (IS_MOCK) throw new Error('Mock');
  const { error } = await supabase.rpc('kill_venue', { p_venue_id: venueId, p_owner_name: ownerName, p_password: password });
  if (error) throw new Error(error.message);
}
