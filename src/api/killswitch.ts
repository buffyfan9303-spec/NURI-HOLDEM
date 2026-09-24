// src/api/killswitch.ts — 매장 킬스위치(전체 영구 삭제). 3중 게이트: 업주 본인 + 실명 + 일회성 비밀번호.
// 비밀번호는 최초 1회 설정 후 변경 불가(서버 강제). 모든 검증·삭제는 SECURITY DEFINER RPC에서 처리.
import { supabase, IS_MOCK } from '../lib/supabase';

/** 이 매장에 킬스위치 비밀번호가 이미 설정되어 있는지(true=설정됨 → 입력, false=미설정 → 최초 설정) */
export async function killSwitchIsSet(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data, error } = await supabase.rpc('kill_switch_is_set', { p_venue_id: venueId });
  // ⚠ 예전엔 조회 실패를 false('미설정')로 뭉갰다 → 이미 비밀번호를 설정한 업주에게 '최초 설정'
  //   화면을 내밀고, 새 비밀번호를 넣으면 서버가 거부하는 **막다른 길**이 됐다.
  //   '설정 안 됨'과 '못 물어봄'은 다른 답이다 — 실패는 실패로 올린다.
  if (error) throw new Error(error.message);
  return data === true;
}

/** 킬스위치 비밀번호 최초 설정 — 업주만, 한 번만(이미 있으면 서버가 거부). */
export async function setKillPassword(venueId: string, password: string): Promise<void> {
  if (IS_MOCK) throw new Error('Mock');
  const { error } = await supabase.rpc('set_kill_password', { p_venue_id: venueId, p_password: password });
  if (error) throw new Error(error.message);
}

// ── 매장 영구 삭제 전 자료 내려받기(오너 2026-09-25 DATA-RETENTION) ─────────────────────────
// 법정 보존(장부 5년·근로 3년)은 매장 책임이다 — 삭제 전에 업주가 자기 기록을 파일로 가져갈 수 있어야 한다.
// 읽기는 각 표의 RLS(can_access_ledger·can_view_vouchers·can_manage_schedule·can_manage_pos)가 막는다.
export type VenueExportGroup = 'ledger' | 'vouchers' | 'staff' | 'customers';
export const VENUE_EXPORT_GROUPS: Record<VenueExportGroup, { label: string; tables: [table: string, order: string][] }> = {
  ledger:    { label: '장부',       tables: [['ledger_sessions', 'session_date'], ['ledger_players', 'id'], ['ledger_buyins', 'id']] },
  vouchers:  { label: '이용권 이력', tables: [['store_vouchers', 'id'], ['voucher_events', 'id']] },
  staff:     { label: '근무·급여',   tables: [['staff_schedule', 'id'], ['staff_wage', 'staff_name'], ['dealer_shifts', 'id']] },
  customers: { label: '손님 목록',   tables: [['customer_profiles', 'id'], ['coupons', 'id']] },
};

/** 한 칸 — 따옴표·쉼표·줄바꿈은 따옴표로 감싸고, =·+·-·@ 로 시작하는 글자는 엑셀 수식 실행을 막으려 ' 를 붙인다. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 표 하나를 CSV 구획으로 — 머리줄 `# 표이름 (N행)` 다음에 열 이름 줄, 그 다음 행들. 행이 없으면 열 이름 없이 0행만. */
export function csvSection(table: string, rows: Record<string, unknown>[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [`# ${table} (${rows.length}행)`];
  if (cols.length) lines.push(cols.map(csvCell).join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')));
  return lines.join('\r\n');
}

/** 그룹의 표를 전부(1000행씩 끝까지) 읽어 CSV 한 파일 내용으로. 앞의 BOM 은 엑셀이 한글을 깨뜨리지 않게. */
export async function exportVenueCsv(venueId: string, group: VenueExportGroup): Promise<{ csv: string; rows: number }> {
  if (IS_MOCK) throw new Error('Mock');
  const PAGE = 1000;
  const parts: string[] = []; let total = 0;
  for (const [table, order] of VENUE_EXPORT_GROUPS[group].tables) {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from(table).select('*').eq('venue_id', venueId).order(order).range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as Record<string, unknown>[]));
      if (!data || data.length < PAGE) break;
    }
    total += rows.length;
    parts.push(csvSection(table, rows));
  }
  return { csv: '\uFEFF' + parts.join('\r\n\r\n') + '\r\n', rows: total };
}

/** 매장 전체 영구 삭제 — 업주 본인 + 등록된 실명 + 킬스위치 비밀번호 3중 검증 통과 시 실행. 복구 불가. */
export async function killVenue(venueId: string, ownerName: string, password: string): Promise<void> {
  if (IS_MOCK) throw new Error('Mock');
  const { error } = await supabase.rpc('kill_venue', { p_venue_id: venueId, p_owner_name: ownerName, p_password: password });
  if (error) throw new Error(error.message);
}
