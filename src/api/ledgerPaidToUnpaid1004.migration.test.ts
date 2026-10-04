// 20261004e — 완납 → 미수 비밀번호 없이(오너 2026-10-04 F4-02). 서버 가드와 화면 판정이 **같은 식**인지 잠근다.
// 서버 식의 동작은 PGlite(Postgres WASM)에 이 파일 본문 그대로 만들어 케이스 표로 확인했다(v2 본문 ALL_MATCH · 옛 20261001j 본문 불일치) —
//   하네스: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\ticket-check-1004\pglite_guard.mjs(@electric-sql/pglite 를 따로 설치한 폴더에서 실행).
//   라이브 리허설(R0_harness·R1_tests)은 리드 몫(파일 머리).
// 음성 대조: 마이그레이션의 'and not (…)' 줄이나 ledger.ts 의 toUnpaidOnly 식을 바꾸면 빨개진다.
// 실행: npx vitest run src/api/ledgerPaidToUnpaid1004.migration.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8').replace(/\r\n/g, '\n');
const sql = read('../../supabase/migrations/20261004e_ledger_paid_to_unpaid_no_password.sql');
const ts = read('./ledger.ts');

describe('20261004e 완납 → 미수 예외', () => {
  it('🔴 서버 v3: 상태량 판정 네 조건(받을 가치 · 현금성 몫 · 바인 분류 · 애드온 분류)', () => {
    expect(sql).toContain("    if (n[3] + v_na < o[3] + v_oa)\n"
      + "       or (v_nc + v_nac < v_oc + v_oac)\n"
      // 분납 분류는 null — '=' 면 조건이 분납에서 꺼진다(v2 PGlite C2 실측). NULL-safe 비교를 잠근다.
      + "       or (v_co is distinct from v_cn and (v_co is not distinct from 'ticket' or v_cn is not distinct from 'ticket' or (v_co is not null and v_cn is not null)))\n"
      + "       or (old.addon_method is not null and new.addon_method is not null\n"
      + "           and (old.addon_method = 'ticket') is distinct from (new.addon_method = 'ticket')) then");
    // 현금성 몫: 티켓 가불이 아닌 미수(분납 미수 포함)는 현금성 — critical K(분납 징검다리)를 막는 귀속
    expect(sql).toContain("v_oc := o[1] + case when v_co is not distinct from 'ticket' then 0 else o[3] - o[2] end;");
    expect(sql).toContain("v_co := case when coalesce(old.is_split, false) then null when old.payment_method = 'ticket' then 'ticket'");
    // 비분납 unpaid_amount 정규화(critical P) · 애드온 비밀번호 RPC · 삭제 감사
    expect(sql.split('CREATE OR REPLACE FUNCTION public._ledger_buyin_apply_amount_rule')[1]?.split('end $function$;')[0].match(/b\.unpaid_amount := 0;/g)?.length).toBe(2);
    expect(sql).toContain('revoke all on function public.update_ledger_addon_with_password(uuid, text, boolean, text) from public, anon;');
    expect(sql).toContain('perform public._ledger_require_cancel_auth(r.venue_id, p_password);');
    expect(sql).toContain('create trigger trg_ledger_buyin_audit_del\n  after delete on public.ledger_buyins');
    expect(sql.split('do $gate_rule$')[1]?.split('end $gate_rule$')[0]).toContain('82bc5962e48e39af2c0e59789090d2ca');
    // 이용권 승인 행 잠금·hint 는 그대로
    expect(sql).toContain("using errcode = '42501', hint = 'LEDGER_REDUCE_NEEDS_PASSWORD';");
    expect(sql).toContain('if old.request_id is not null and coalesce(old.ticket_count, 0) > 0');
    expect(sql).toContain('revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;');
    // 라이브 정의 게이트(20261001j 본문)
    expect(sql.split('do $gate$')[1]?.split('end $gate$')[0]).toContain('1baa2b4f37fa68251da1f8a7423e555e');
  });
  it('🔴 화면 쌍둥이 v3: isRevenueReduction 이 같은 네 조건 · 같은 귀속', () => {
    expect(ts).toContain("const cb = t[0] + (payClassOf(b) === 'ticket' ? 0 : t[2] - t[1]);");
    expect(ts).toContain("const buyinClassChanged = co !== cn && (co === 'ticket' || cn === 'ticket' || (co !== null && cn !== null));");
    expect(ts).toContain("const addonClassChanged = ao !== null && an !== null && (ao === 'ticket') !== (an === 'ticket');");
    expect(ts).toContain('return n.v < o.v || n.c < o.c || buyinClassChanged || addonClassChanged;');
    expect(ts).toContain("supabase.rpc('update_ledger_addon_with_password'");
  });
  it('🔴 감사 기록: AFTER UPDATE → DEFINER 기록 함수 · 실행권 회수 · 업주(can_manage_pos)만 읽기 · 결제 칸 전부가 조건', () => {
    expect(sql).toContain('create trigger trg_ledger_buyin_audit\n  after update on public.ledger_buyins');
    expect(sql).toMatch(/create or replace function public\._ledger_buyin_audit\(\)\n returns trigger\n language plpgsql\n security definer\n set search_path = public, pg_temp/);
    expect(sql).toContain('revoke all on function public._ledger_buyin_audit() from public, anon, authenticated;');
    expect(sql).toContain('create policy lba_select on public.ledger_buyin_audit for select to authenticated using (public.can_manage_pos(venue_id));');
    expect(sql).toContain('revoke all on table public.ledger_buyin_audit from public, anon, authenticated;');
    for (const c of ['payment_method', 'is_unpaid', 'is_split', 'cash_amount', 'card_amount', 'transfer_amount', 'ticket_count', 'unpaid_amount', 'discount_index', 'addon_method', 'addon_unpaid', 'addon_amount', 'addon_ticket_count']) {
      expect(sql.split('create trigger trg_ledger_buyin_audit')[1]?.split('execute function')[0], c).toContain(`old.${c}`);
    }
    expect(sql).toContain("auth.uid(), 'U',\n    old.is_unpaid, new.is_unpaid, old.payment_method, new.payment_method,");
    expect(sql).toContain("values (old.id, old.venue_id, old.session_date, old.game_seq, auth.uid(), 'D',");
  });
});
