// 장부명↔회원 연결 — audit8-regress-connect.md#R8-01 (+O-2)
//
// O-2: linkCustomerAlias·unlinkCustomerAlias 가 `throw new Error(error.message)` 로 PostgREST 오류의 code 를 버려,
//   23505·42501 이 msgOf 에서 전부 fallback('연결 실패')으로 뭉개졌다 — 업주가 R8-01 의 이유를 볼 수 없던 직접 원인.
// R8-01: 20261006a 는 새 회원 행을 만들기 **전에** 동명 미연결 행에 회원을 묶는다(그 행을 두고 insert 하면 (venue_id,name) 23505).
//   행동 검증은 라이브 롤백 리허설 supabase/tests/20261006a_rehearsal.sql(9건) — 여기는 그 순서·병합 규칙이 빠지는 회귀만 막는다.
//
// 실행: npx vitest run src/api/crmLinkAlias.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PostgrestError } from '@supabase/postgrest-js';
import { msgOf } from '../lib/dbError';

let rpcError: PostgrestError | null = null;
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { auth: { onAuthStateChange: () => {} }, rpc: async () => ({ data: null, error: rpcError }) },
}));
const crm = await import('./crm');

const pgErr = (code: string, message: string) => new PostgrestError({ message, details: '', hint: '', code });
const caught = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e; } throw new Error('던지지 않았다'); };

describe('O-2 — 연결·해제 실패 이유가 화면 문장까지 간다', () => {
  it('23505 → 이미 등록된 값 · 42501 → 권한 문장 · P0001 → 서버 문장 그대로', async () => {
    rpcError = pgErr('23505', 'duplicate key value violates unique constraint "customer_profiles_venue_id_name_key"');
    expect(msgOf(await caught(crm.linkCustomerAlias('v', 'X', 'u')), '연결 실패')).toBe('이미 등록된 값입니다');
    rpcError = pgErr('42501', 'permission denied for function link_customer_alias');
    expect(msgOf(await caught(crm.linkCustomerAlias('v', 'X', 'u')), '연결 실패')).toBe('연결 실패 — 이 계정에는 권한이 없습니다');
    rpcError = pgErr('P0001', '이 매장에 출석·예약·참가 신청 기록이 있는 회원만 연결할 수 있습니다');
    expect(msgOf(await caught(crm.linkCustomerAlias('v', 'X', 'u')), '연결 실패')).toBe('이 매장에 출석·예약·참가 신청 기록이 있는 회원만 연결할 수 있습니다');
    rpcError = pgErr('23505', 'duplicate key value');
    expect(msgOf(await caught(crm.unlinkCustomerAlias('v', 'X')), '실패')).toBe('이미 등록된 값입니다');
    rpcError = null;
  });
});

const MIG = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261006a_link_customer_alias_adopt_unlinked.sql'), 'utf-8')
  .replace(/--[^\n]*/g, '');
const fnBody = (name: string) => {
  const i = MIG.indexOf(`create or replace function public.${name}(`);
  expect(i, name).toBeGreaterThan(-1);
  return MIG.slice(i, MIG.indexOf('end $function$;', i));
};
const body = fnBody('link_customer_alias');

describe('R8-01 — 20261006a 동명 미연결 행 묶기', () => {
  it('관계 확인(20261005b) → 회원 행 → 동명 미연결 행 묶기 → 새 행 순서', () => {
    const at = (s: string) => { const i = body.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
    const guard = at('_venue_customer_ids(array[p_venue_id])');
    const own = at('where venue_id = p_venue_id and user_id = p_user_id;');
    const adopt = at('update public.customer_profiles set user_id = p_user_id');
    const insert = at('insert into public.customer_profiles(venue_id, user_id, name, visit_count)');
    expect(guard).toBeLessThan(own);
    expect(own).toBeLessThan(adopt);
    expect(adopt).toBeLessThan(insert);
    // 옛 결함: (venue_id,user_id) 만 중재하는 insert — (venue_id,name) 충돌이 23505 로 새어 나갔다
    expect(body).not.toMatch(/on conflict \(venue_id, user_id\) where user_id is not null do nothing/);
  });

  it('병합은 메모·생일·전화를 버리지 않는다', () => {
    expect(body).toMatch(/birthday = coalesce\(t\.birthday, m\.bd\)/);
    // 대상 전화가 있으면 손대지 않는다(공백 다듬기도 하지 않는다 — critical X4)
    expect(body).toMatch(/phone = case when nullif\(btrim\(t\.phone\),''\) is null then coalesce\(m\.ph, t\.phone\) else t\.phone end/);
    expect(body).toMatch(/memo = coalesce\(nullif\(concat_ws\(E'\\n', nullif\(btrim\(t\.memo\),''\), m\.memo\), ''\), t\.memo\)/);
  });

  it('(critical X1·X8) 방문·출석의 이름 충돌 insert 는 다른 회원 행에 방문을 더하지 않는다', () => {
    for (const name of ['_apply_checkin', '_apply_venue_visit']) {
      const f = fnBody(name);
      expect(f, name).toMatch(/on conflict \(venue_id, name\) do update[\s\S]*?where public\.customer_profiles\.user_id is null or public\.customer_profiles\.user_id = p_uid;\s+if not found then[\s\S]*?v_disp \|\| ' #' \|\| left\(p_uid::text, 8\)[\s\S]*?on conflict do nothing;/);
    }
  });

  it('정의자·search_path 고정·anon 회수', () => {
    expect(body).toMatch(/security definer\s+set search_path to 'public', 'pg_temp'/);
    expect(MIG).toMatch(/revoke all on function public\.link_customer_alias\(uuid, text, uuid\) from public, anon;/);
  });
});
