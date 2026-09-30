// 20260930i — ③ 할인 바인은 이용권을 할인만큼 덜 받는다 · ④ 애드온 = 금액 ÷ 1만 장(포스터 N 설정 게임만) · ⑤ 모자라면 분납.
// 실행 검증은 라이브 begin…rollback 리허설(파일 머리 표)이 맡는다. 이 파일은 계산이 **서버 값**(트리거가 확정한 행)에서 나오는지,
// 분납이 기존 칸·기존 금액 규칙 함수를 쓰는지, 화면이 이용권 몫을 못 바꾸는지를 SQL 문장으로 잠근다.
// 음성 대조: §1 바인 쪽 `v_need := greatest(1, floor(v_val / 10000.0))::int;` 를 `v_need := v_n;` 으로 바꾸면 '③' 이,
//   `if v_n_set then` 을 `if true then` 으로 바꾸면 '④' 가, §E 의 이용권 장수 잠금 블록을 지우면 '⑥' 이 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260930i_voucher_discount_addon_bundle.sql'),
  'utf-8',
).replace(/\r\n/g, '\n');
const between = (from: string, to: string) => {
  const a = SQL.indexOf(from);
  const b = SQL.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error(`앵커를 찾지 못했다: ${from} … ${to}`);
  return SQL.slice(a, b);
};
const approve = between('-- §1 ', '-- §2 ');

describe('20260930i — 할인 바인·애드온 이용권 장수', () => {
  it('③ 이용권은 만원 단위로만 — 필요 장수 = floor((참가비 − 할인) / 1만), 할인은 트리거가 확정한 행의 discount_index', () => {
    expect(approve).toContain('returning id, discount_index into v_bid, v_row_idx;');
    expect(approve).toMatch(/if v_n > 1 and v_amt > 0 then\s+v_val := greatest\(0, v_amt - v_row_disc\);\s+v_need := greatest\(1, floor\(v_val \/ 10000\.0\)\)::int;\s+else\s+v_need := v_n;/);
    expect(approve).toContain("v_row_disc := least(v_amt, greatest(0, round(coalesce((v_discounts -> (v_row_idx - 1) ->> 'amount')::numeric, 0))))::int;");
    expect(approve).not.toMatch(/ceil\(/);   // 올림으로 더 받지 않는다(critical 2026-09-30: 3.5만 할인 → 7장=7만인데 장부 6.5만)
  });

  it('④ 애드온 장수 = 트리거가 스냅샷한 addon_amount ÷ 1만 — 같은 매장 포스터에 N 이 있을 때만(없으면 1장)', () => {
    expect(approve).toContain('returning addon_amount into v_addon_amt;');
    expect(approve).toMatch(/if v_n_set then\s+v_val := greatest\(0, coalesce\(v_addon_amt, 0\)\);\s+v_need := greatest\(1, floor\(v_val \/ 10000\.0\)\)::int;\s+end if;/);
    expect(approve).toContain("then (sc.buy_in ->> 'voucherPerEntry')::numeric >= 1 else false end");
    expect(approve).toContain('from schedules sc where sc.id = v_sched and sc.venue_id = r.venue_id;');
    expect(approve).toContain("p_discount_index integer default 0, p_voucher_use text default 'buyin'::text)");   // 서명 불변
  });

  it('묶음은 바인·애드온 한 벌 — 행을 넣은 뒤 잠그고 bundle_request_id = 이 요청', () => {
    expect((approve.match(/limit v_need - 1\s+for update\) x;/g) ?? []).length).toBe(1);
    expect(approve.indexOf('returning id, discount_index into v_bid, v_row_idx;')).toBeLessThan(approve.indexOf('limit v_need - 1'));
    expect(approve).toContain('bundle_request_id = r.id');
  });
});

describe('20260930i ⑤ — 모자라면 분납(거절 대신)', () => {
  it('기본 호출은 23514 + hint VOUCHER_SHORT + 서버가 계산한 detail(화면이 분납 선택을 띄운다)', () => {
    expect(approve).toContain("using errcode = '23514', hint = 'VOUCHER_SHORT',");
    expect(approve).toContain("detail = json_build_object('need', v_need, 'have', v_k, 'ticketWon', v_k * 10000, 'remainder', v_rem, 'use', v_use)::text;");
  });
  it('남은 금액은 서버가 정한다 — 금액 − k × 1만(만원 미만 나머지도 같은 분납 경로) · 필요한 장수까지만 묶는다', () => {
    expect(approve).toContain('v_rem := case when v_val is null then 0 else v_val - v_k * 10000 end;');
    expect(approve).toMatch(/if v_rem > 0 then\s+if not v_pm_short then/);
    expect(approve).toContain("if v_pm not in ('cash', 'card', 'transfer', 'unpaid') then");
    // 막다른 길 제거(critical): '이미 금액 이상' 거절은 없다 — 필요 장수만 잠그고 나머지 장은 대기로 둔다.
    expect(approve).not.toContain('이미 금액 이상');
    expect(approve).toContain('if v_val is not null and v_val < 10000 then');
  });
  it('바인 분납 = 기존 분납 칸 + 기존 금액 규칙 함수(합계 검사)', () => {
    expect(approve).toContain('v_row := public._ledger_buyin_apply_amount_rule(v_row);');
    expect(approve).toContain('v_row.ticket_count := v_k;');
  });
  it('애드온 분납 = addon_method + addon_unpaid + addon_ticket_count', () => {
    expect(approve).toMatch(/set addon_method = case when v_pm = 'unpaid' then 'cash' else v_pm end,\s+addon_unpaid = \(v_pm = 'unpaid'\), addon_ticket_count = v_k/);
  });
  it('현금 요청의 전액 분납 검사는 그대로, 이용권 요청은 남은 금액으로 검사', () => {
    expect(approve).toContain('if p_record_buyin and p_split and r.voucher_id is null then');
  });
  it('화면은 이용권 몫을 못 바꾼다 · 애드온 제거면 몫 0 · 분납 애드온은 수단을 바꿔도 이용권 유지', () => {
    const guard = between('-- §B ', '-- §C ');
    expect(guard).toContain("or new.addon_ticket_count is distinct from (case when tg_op = 'UPDATE' then old.addon_ticket_count else 0 end)");
    expect(guard).toContain('before insert or update of addon_request_id, addon_ticket_count on public.ledger_buyins');
    const rule = between('-- §C ', '-- §D ');
    expect(rule).toMatch(/if new\.addon_method is null then[\s\S]*?new\.addon_ticket_count := 0;/);
    expect(rule).toContain('new.addon_ticket_count::int * 10000 >= new.addon_amount');
    const restore = between('-- §D ', '-- §1 ');
    expect(restore).toContain('or (new.addon_method is not null and coalesce(new.addon_ticket_count, 0) > 0)) then');
    expect(restore).toContain('perform public._restore_voucher_for_request(old.addon_request_id);');
    for (const f of ['_ledger_buyins_addon_request_guard()', '_ledger_buyins_addon_voucher_restore()']) {
      expect(SQL).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
    }
    expect(SQL).toContain('revoke execute on function public._ledger_buyin_addon_rule() from public, anon, authenticated;');
  });
  it('⑤ 분납 애드온은 티켓으로 못 바꾼다(서버)', () => {
    const rule = between('-- §C ', '-- §D ');
    expect(rule).toMatch(/if new\.addon_method = 'ticket' and coalesce\(new\.addon_ticket_count, 0\) > 0 then\s+raise exception/);
  });
  it('⑥ 접수대 이용권 승인 행의 이용권 장수·분납 여부는 화면이 못 바꾼다(_ledger_buyins_client_guard)', () => {
    const g = between('-- §E ', '-- §1 ');
    expect(g).toMatch(/if old\.request_id is not null and coalesce\(old\.ticket_count, 0\) > 0\s+and \(new\.ticket_count is distinct from old\.ticket_count or new\.is_split is distinct from old\.is_split\) then\s+raise exception/);
    expect(g).toContain('new := public._ledger_buyin_apply_amount_rule(new);');   // 기존 가드 본문 유지
    expect(g).toContain("hint = 'LEDGER_REDUCE_NEEDS_PASSWORD'");
    expect(g).toContain('revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;');
  });
});

describe('20260930i — ACL', () => {
  it('create or replace + REVOKE from public, anon · GRANT authenticated, service_role', () => {
    expect(SQL).toContain('create or replace function public.approve_buyin_request(');
    expect(SQL).toContain('revoke all on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text) from public, anon;');
    expect(SQL).toContain('grant execute on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text) to authenticated, service_role;');
  });
});
