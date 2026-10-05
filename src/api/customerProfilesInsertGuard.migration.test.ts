// customer_profiles 는 20261005b 부터 '칸 단위' 쓰기 권한이다 (critical 2026-10-04/05 D)
//
// 왜 이 테스트가 있나
//   업주·공동 운영자가 아무 회원의 user_id 로 고객 행을 만들면 _venue_customer_ids('내 고객')에 들어가
//   회원 검색 RPC 5곳이 그 회원의 전화번호(앞3·뒤4)를 보여 줬다. 20261005b 는
//   ① 표 단위 INSERT/UPDATE 를 거두고 user_id·방문 집계를 뺀 칸만 다시 주고 ② insert 정책에 user_id is null 을 걸고
//   ③ link_customer_alias 에 '이 매장과 관계 있는 회원' 확인을 넣었다.
//
// 이 테스트가 잡는 회귀
//   · 20261005b 의 세 장치가 빠지는 것
//   · 앱의 손님 정보 저장(saveCustomerProfile)이 GRANT 밖의 칸을 싣는 것 — 실으면 운영에서 permission denied 로 저장이 깨지고,
//     user_id 를 싣는 쪽으로 '고치려고' 표 단위 GRANT 를 되살리면 구멍이 다시 열린다
//   · 20261005b 뒤 마이그레이션이 표 단위 INSERT/UPDATE/ALL 을 다시 주는 것
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const BASE = '20261005b_customer_profiles_insert_guard.sql';
const code = (sql: string) => sql.replace(/--[^\n]*/g, '');
const BASE_SQL = code(readFileSync(join(DIR, BASE), 'utf-8'));
const GRANTED = ['venue_id', 'name', 'birthday', 'phone', 'memo', 'updated_at'];
const SERVER_ONLY = ['user_id', 'visit_count', 'first_visit_at', 'last_visit_at'];

/** 표 단위 INSERT/UPDATE/ALL 재부여(클라 역할) — 순수 함수라 아래 음성 대조가 이 함수 자체를 시험한다. */
export function findTableGrantReopen(sql: string): string[] {
  const out: string[] = [];
  const re = /grant\s+([^;(]*?)\s+on\s+(?:table\s+)?(?:public\.)?customer_profiles\s+to\s+([^;]+);/gi;
  for (const m of code(sql).matchAll(re)) {
    if (/\b(insert|update|all)\b/i.test(m[1]) && /\b(anon|authenticated|public)\b/i.test(m[2])) out.push(m[0].replace(/\s+/g, ' '));
  }
  return out;
}

/** crm.ts saveCustomerProfile 의 upsert 객체 키 */
function upsertKeys(src: string): string[] {
  const m = src.match(/from\('customer_profiles'\)\.upsert\(\s*\{([^}]*)\}/);
  if (!m) throw new Error('saveCustomerProfile upsert 를 찾지 못했다');
  // 단축 속성(`name,`)도 키다 — `(\w+):` 만 보면 `user_id,` 단축형을 놓친다
  return m[1].split(',').map((s) => s.split(':')[0].trim()).filter(Boolean);
}

describe('20261005b — customer_profiles 관계 위조 차단', () => {
  it('표 단위 INSERT/UPDATE 를 거두고 user_id·방문 집계를 뺀 칸만 다시 준다', () => {
    expect(BASE_SQL).toMatch(/revoke insert, update on public\.customer_profiles from public, anon, authenticated;/);
    const g = BASE_SQL.match(/grant insert \(([^)]*)\),\s*update \(([^)]*)\)\s*on public\.customer_profiles to authenticated;/);
    expect(g).not.toBeNull();
    for (const cols of [g![1], g![2]]) {
      const list = cols.split(',').map((s) => s.trim());
      expect(list.sort()).toEqual([...GRANTED].sort());
      for (const c of SERVER_ONLY) expect(list).not.toContain(c);
    }
  });

  it('insert 정책에 user_id is null, ALL 정책은 없다', () => {
    expect(BASE_SQL).toMatch(/drop policy if exists customer_profiles_pos_all on public\.customer_profiles;/);
    expect(BASE_SQL).toMatch(/for insert to authenticated\s+with check \(public\.can_manage_pos\(venue_id\) and user_id is null\);/);
    expect(BASE_SQL).not.toMatch(/create policy \w+ on public\.customer_profiles for all\b/i);
  });

  it('link_customer_alias 는 이 매장과 관계 있는 회원만 연결한다', () => {
    expect(BASE_SQL).toMatch(/if not exists \(select 1 from public\._venue_customer_ids\(array\[p_venue_id\]\) t where t\.uid = p_user_id\)/);
    expect(BASE_SQL).toMatch(/b\.voucher_id is null\) then\s+raise exception '이 매장에 출석·예약·참가 신청 기록이 있는 회원만 연결할 수 있습니다';/);
    // 관계 확인이 첫 쓰기(customer_aliases insert)보다 앞에 있어야 한다
    expect(BASE_SQL.indexOf('_venue_customer_ids(array[p_venue_id])')).toBeLessThan(BASE_SQL.indexOf('insert into public.customer_aliases'));
  });

  it('자가검사가 user_id 칸 닫힘과 메모 저장 칸 열림을 둘 다 본다', () => {
    expect(BASE_SQL).toContain("has_column_privilege('authenticated', 'public.customer_profiles', 'user_id', 'INSERT')");
    expect(BASE_SQL).toContain("has_column_privilege('authenticated', 'public.customer_profiles', 'memo', 'INSERT')");
  });

  it('앱의 손님 정보 저장은 GRANT 안의 칸만 싣는다(user_id 를 싣지 않는다)', () => {
    const keys = upsertKeys(readFileSync(join(__dirname, 'crm.ts'), 'utf-8'));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => !GRANTED.includes(k))).toEqual([]);
  });

  it('20261005b 뒤 마이그레이션은 표 단위 INSERT/UPDATE 를 다시 주지 않는다', () => {
    const later = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f > BASE).sort();
    const bad = later.flatMap((f) => findTableGrantReopen(readFileSync(join(DIR, f), 'utf-8')).map((v) => `${f}: ${v}`));
    expect(bad).toEqual([]);
  });

  describe('판정기 음성·양성 대조', () => {
    it('음성: 표 단위 재부여를 잡는다', () => {
      expect(findTableGrantReopen('grant insert, update on public.customer_profiles to authenticated;')).toHaveLength(1);
      expect(findTableGrantReopen('grant all on table customer_profiles to anon, authenticated;')).toHaveLength(1);
    });
    it('양성: 칸 단위·service_role·주석은 통과', () => {
      expect(findTableGrantReopen('grant insert (memo) on public.customer_profiles to authenticated;')).toEqual([]);
      expect(findTableGrantReopen('grant insert on public.customer_profiles to service_role;')).toEqual([]);
      expect(findTableGrantReopen('-- grant insert on public.customer_profiles to authenticated;')).toEqual([]);
    });
    it('음성: upsert 에 user_id 를 실으면 잡는다', () => {
      const src = "await supabase.from('customer_profiles').upsert(\n  { venue_id: v, name, user_id: u, memo: m },\n";
      expect(upsertKeys(src).filter((k) => !GRANTED.includes(k))).toEqual(['user_id']);
      const shorthand = "await supabase.from('customer_profiles').upsert(\n  { venue_id: v, name, user_id },\n";
      expect(upsertKeys(shorthand).filter((k) => !GRANTED.includes(k))).toEqual(['user_id']);
    });
  });
});
