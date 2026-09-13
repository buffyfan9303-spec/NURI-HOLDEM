import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260913132414_voucher_game_session_lock.sql'),
  'utf-8',
);
const CODE = SQL.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const start = CODE.indexOf('create or replace function public.voucher_redeem_to_ledger_request()');
const BODY = CODE.slice(start, CODE.indexOf('$function$;', start));
const CANONICAL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260913123648_event_voucher_bundle_20260913_hardened.sql'),
  'utf-8',
);
const OPS_BUNDLE = readFileSync(
  join(__dirname, '..', '..', 'docs', 'ops', 'apply-2026-09-13-event-voucher.sql'),
  'utf-8',
);
const SOURCE_FILES = [
  '20260911g_voucher_multi_use_pending_uniq.sql',
  '20260911i_bulk_delete_voucher_restore.sql',
  '20260912a_buyin_request_approve_race.sql',
  '20260912b_voucher_qr_game_seq.sql',
  '20260912c_admin_event_ops.sql',
  '20260912d_event_visibility_and_menu.sql',
] as const;

describe('이용권 회차 검증과 사용은 같은 트랜잭션에서 직렬화된다', () => {
  it('열린 실제 회차를 잠근 뒤에만 장부 요청을 만든다', () => {
    const positions = [
      BODY.indexOf('v_seq < 1'),
      BODY.indexOf('select ls.closed'),
      BODY.indexOf('for share'),
      BODY.indexOf('if not found'),
      BODY.indexOf('if v_game_closed'),
      BODY.indexOf('insert into public.ledger_buyin_requests'),
    ];
    expect(start).toBeGreaterThan(-1);
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(BODY.match(/for share/g)).toHaveLength(1);
  });

  it('내부 트리거 권한과 적용 경계를 스스로 검사한다', () => {
    expect(CODE.match(/^begin;$/gm)).toHaveLength(1);
    expect(CODE.match(/^commit;$/gm)).toHaveLength(1);
    expect(CODE).toContain('revoke all on function public.voucher_redeem_to_ledger_request() from public, anon, authenticated;');
    expect(CODE).toContain("has_function_privilege('anon', v_oid, 'execute')");
    expect(CODE).toContain("tgrelid = 'public.store_vouchers'::regclass");
    expect(CODE).toContain("coalesce(array_to_string(v_cfg, ','), '')");
  });
});

describe('운영 적용 이력과 저장소 SQL이 갈라지지 않는다', () => {
  it('20260913123648은 운영에 적용한 PART 1만 정확히 보존한다', () => {
    const canonicalPart = CANONICAL.slice(CANONICAL.indexOf('begin;'), CANONICAL.indexOf('commit;') + 7);
    const opsPart = OPS_BUNDLE.slice(OPS_BUNDLE.indexOf('begin;'), OPS_BUNDLE.indexOf('commit;') + 7);
    expect(canonicalPart).toBe(opsPart);
    expect(CANONICAL.match(/^begin;$/gm)).toHaveLength(1);
    expect(CANONICAL.match(/^commit;$/gm)).toHaveLength(1);
    expect(CANONICAL).not.toContain('PART 2');
    expect(CANONICAL).not.toContain('PART 3');
  });

  it('6개 원본 SQL이 운영 묶음과 이력 앵커에 정확히 한 번씩 같은 순서로 들어 있다', () => {
    for (const target of [OPS_BUNDLE, CANONICAL]) {
      let previous = -1;
      for (const file of SOURCE_FILES) {
        const source = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', file), 'utf-8');
        const position = target.indexOf(source);
        expect(position, `${file} 원문이 없다`).toBeGreaterThan(previous);
        expect(target.split(source)).toHaveLength(2);
        previous = position;
      }
    }
  });
});
