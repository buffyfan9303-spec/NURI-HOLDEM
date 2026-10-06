// 20261006s3(오너 결정 2026-10-06) 계약 — 행동 검증은 라이브 롤백 리허설(supabase/tests/20261006s3_rehearsal.sql 14건)이 하고,
// 여기서는 DB 없이 CI 가 볼 수 있는 것만 문다: 닉네임 검색의 전화 제거 · 번호 조회의 형식·거부·상한 · 화면의 11자리 1회 조회.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8').replace(/\r/g, '');
const sql = read('supabase/migrations/20261006s3_phone_lookup_owner_decision.sql').replace(/--[^\n]*/g, '');
const fn = (name: string) => {
  const s = sql.toLowerCase().indexOf(`function public.${name}(`);
  expect(s, `${name} 정의가 없다`).toBeGreaterThan(-1);
  return sql.slice(s, sql.indexOf('$function$;', s));
};

describe('20261006s3 — 닉네임으로 찾은 행은 전화를 싣지 않는다', () => {
  it('닉네임 전용 검색 2개는 _mask_phone 을 부르지 않는다', () => {
    for (const n of ['find_user_for_transfer', 'search_ranking_members']) expect(fn(n)).not.toContain('_mask_phone');
  });
  it('실명으로도 찾는 2개는 닉네임이 맞으면 전화를 빼고 실명으로만 맞을 때 싣는다', () => {
    expect(fn('search_voucher_recipients')).toMatch(/r\.uid is not null and lower\(btrim\(p\.real_name\)\) = v_k\s+and not coalesce\(p\.nickname ilike v_like, false\)\s+then public\._mask_phone/);
    expect(fn('search_registered_players')).toMatch(/case when coalesce\(p\.nickname ilike [^\n]+, false\)\s+or coalesce\(p\.name ilike [^\n]+, false\) then null::text\s+else public\._mask_phone/);
  });
});

describe('20261006s3 — find_user_by_phone', () => {
  const f = fn('find_user_by_phone');
  it('권한 없는 호출은 형식 검사보다 먼저 0행(손님 지갑 경로 보존)', () => {
    expect(f.indexOf('if not coalesce(v_allowed, false) then')).toBeLessThan(f.indexOf("p_phone !~ '^010[0-9]{8}$'"));
  });
  it('010+8자리만 · 거부 회원 제외 · 하루 1만 회 PT429 · 실명은 가려서만', () => {
    expect(f).toContain("if p_phone is null or p_phone !~ '^010[0-9]{8}$' then");
    expect(f).toContain('and p.allow_venue_phone_lookup');
    expect(f).toMatch(/if v_used >= 10000 then\s+raise exception using errcode = 'PT429'/);
    expect(f).toContain('a.result_count > 0');
    expect(f.match(/real_name/g)).toEqual(['real_name']);
    expect(f).toContain('public._mask_name(p.real_name)');
  });
});

describe('이용권 받는 사람 — 번호는 010 뒤 8자리가 다 찼을 때만 조회', () => {
  const m = read('src/components/features/VoucherManageModal.tsx');
  it('findUserByPhone 호출은 전부 010 접두 + isFullMobile 가드 뒤에 있다', () => {
    const calls = [...m.matchAll(/findUserByPhone\(/g)].map((x) => x.index ?? 0);
    expect(calls.length, '호출부가 사라졌다').toBe(2);
    for (const i of calls) {
      expect(m.slice(i, i + 30)).toContain('findUserByPhone(`010$');
      expect(m.slice(Math.max(0, i - 600), i)).toMatch(/if \(recvMode === 'phone' && !isFullMobile\(`010\$\{q\}`\)\)/);
    }
  });
});
