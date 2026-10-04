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
  it('🔴 서버: 같은 결제 수단 판정 세 조건(감액·미수 예외 / 이용권 몫 증가 / 분류 변경)', () => {
    expect(sql).toContain("    if ((n[1] < o[1] or n[2] < o[2] or n[3] < o[3]) and not (n[3] = o[3] and n[2] - n[1] <= o[2] - o[1]))\n"
      // 분납 분류는 null — '=' 면 ②가 분납에서 꺼진다(PGlite C2 실측). NULL-safe 비교를 잠근다.
      + "       or (n[2] - n[1] > o[2] - o[1] and not (v_co is not distinct from 'ticket' and v_cn is not distinct from 'ticket'))\n"
      + "       or (v_co is not null and v_cn is not null and v_co <> v_cn) then");
    expect(sql).toContain("v_co := case when coalesce(old.is_split, false) then null when old.payment_method = 'ticket' then 'ticket'");
    // 이용권 승인 행 잠금·hint 는 그대로
    expect(sql).toContain("using errcode = '42501', hint = 'LEDGER_REDUCE_NEEDS_PASSWORD';");
    expect(sql).toContain('if old.request_id is not null and coalesce(old.ticket_count, 0) > 0');
    expect(sql).toContain('revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;');
    // 라이브 정의 게이트(20261001j 본문)
    expect(sql.split('do $gate$')[1]?.split('end $gate$')[0]).toContain('1baa2b4f37fa68251da1f8a7423e555e');
  });
  it('🔴 화면 쌍둥이: isRevenueReduction 이 같은 세 조건(0-기준 배열)', () => {
    expect(ts).toContain('const toUnpaidOnly = n[2] === o[2] && n[1] - n[0] <= o[1] - o[0];');
    expect(ts).toContain('const ticketUp = n[1] - n[0] > o[1] - o[0];');
    expect(ts).toContain("return (reduced && !toUnpaidOnly) || (ticketUp && !(co === 'ticket' && cn === 'ticket')) || (co !== null && cn !== null && co !== cn);");
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
    expect(sql).toContain('auth.uid(),\n    old.is_unpaid, new.is_unpaid, old.payment_method, new.payment_method,');
  });
});
