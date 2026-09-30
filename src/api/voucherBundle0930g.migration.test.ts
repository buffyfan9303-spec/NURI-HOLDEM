// KW-1b(20260930g) — 이용권 N장 = 바인 1회(W-01) · 첫 리바인 할인(firstRebuy)의 서버 조건이 SQL 에 실제로 적혀 있는지 잠근다.
// 실행 검증은 라이브 begin…rollback 리허설(파일 머리 기록: 전 10행·엔트리 1~10 → 후 1행·엔트리 1)이 맡는다.
// 슬라이스는 섹션 마커(`-- §N `)로 — 머리말 설명 문장이 통과시켜 주는 착시를 막는다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260930g_voucher_bundle_first_rebuy.sql'),
  'utf-8',
).replace(/\r\n/g, '\n');
const between = (from: string, to: string) => {
  const a = SQL.indexOf(from);
  const b = SQL.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error(`앵커를 찾지 못했다: ${from} … ${to}`);
  return SQL.slice(a, b);
};

describe('20260930g — 이용권 N장 = 참가 1회 · 첫 리바인', () => {
  const approve = between('-- §4 ', '-- §5 ');

  it('W-01 N 은 서버가 연결 포스터에서 읽는다 — 화면 인자가 아니다(인자 목록 불변)', () => {
    expect(approve).toContain("select coalesce(buyin_amount, 0), coalesce(discounts, '[]'::jsonb), schedule_id");
    // 길이 제한 없는 정수 → 100 으로 자름(critical: {1,3} 이면 1000 이 조용히 1).
    expect(approve).toContain("(sc.buy_in ->> 'voucherPerEntry') ~ '^[0-9]+$'");
    expect(approve).toContain("least(100, greatest(1, (sc.buy_in ->> 'voucherPerEntry')::numeric))::int");
    // 매장 결속(critical): 다른 매장 포스터에 세션을 이어도 그 N 을 쓰지 않는다.
    expect(approve).toContain('from schedules sc where sc.id = v_sched and sc.venue_id = r.venue_id;');
    expect(approve).toContain("p_discount_index integer default 0, p_voucher_use text default 'buyin'::text)");
  });

  it('W-01 모자라면 거절(요청 그대로), 넉넉하면 N−1 장을 잠그고 묶는다', () => {
    expect(approve).toMatch(/limit v_need - 1\s+for update\) x;/);
    expect(approve.indexOf('if v_got < v_need - 1 then')).toBeLessThan(approve.indexOf('insert into ledger_players'));
    expect(approve).toContain('bundle_request_id = r.id');
    expect(approve).toMatch(/where id = any\(v_bundle\) and status = 'pending';\s+get diagnostics v_sum = row_count;/);
  });

  it('W-01 바인 행은 요청 1개당이 아니라 묶음당 1행 — 묶인 장은 행을 만들지 않는다', () => {
    const ins = approve.match(/insert into ledger_buyins \(venue_id, session_date, game_seq, player_name, entry_no, payment_method, discount_index, created_by, request_id\)/g) ?? [];
    expect(ins.length).toBe(1);
  });

  it('이미 묶여 승인된 장의 재승인은 성공으로 끝낸다(일괄 승인 실패 N건 방지) — 그 밖의 재승인은 여전히 거절', () => {
    expect(approve).toMatch(/if r\.status = 'approved' and r\.bundle_request_id is not null then return; end if;\s+raise exception '이미 처리된 요청입니다';/);
  });

  it('권한 검사가 묶음 처리보다 먼저다', () => {
    expect(approve.indexOf('can_access_ledger(r.venue_id)')).toBeLessThan(approve.indexOf('bundle_request_id'));
  });

  it('복원은 묶인 장까지 되돌린다(취소 RPC 4곳이 부르는 같은 함수)', () => {
    const rs = between('-- §2 ', '-- §3 ');
    expect(rs).toContain('where q.bundle_request_id = p_request_id and s.used_venue_id = q.venue_id');
    expect(rs).toContain('perform public._restore_voucher(c.voucher_id);');
    expect(rs).toContain('revoke all on function public._restore_voucher_for_request(uuid) from public, anon, authenticated;');
  });

  it('firstRebuy = 2번째 바인에만(기존 rebuy·firstBuyin 규칙 유지)', () => {
    const g = between('-- §3 ', '-- §4 ');
    expect(g).toContain("(v_kind = 'rebuy' and coalesce(new.entry_no, 1) <= 1)");
    expect(g).toContain("(v_kind = 'firstBuyin' and coalesce(new.entry_no, 1) <> 1)");
    expect(g).toContain("(v_kind = 'firstRebuy' and coalesce(new.entry_no, 1) <> 2)");
  });

  it('F3(오너 2026-09-30) — 이용권 사용 경로(redeem_*)는 이 파일이 건드리지 않는다: 정지 계정도 사용 가능 유지', () => {
    expect(SQL).not.toMatch(/function public\.redeem_my_voucher/);
    expect(SQL).not.toContain('is_account_active');
  });

  it('ACL: REVOKE from public, anon + GRANT authenticated, service_role 재기재', () => {
    expect(SQL).toContain('revoke all on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text) from public, anon;');
    expect(SQL).toContain('grant execute on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text) to authenticated, service_role;');
  });
});
