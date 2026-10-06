// security-1006/tech.md#P2-1·#P2-2 계약 — 행동 검증은 라이브 롤백 리허설(supabase/tests/20261006s1·s2_rehearsal.sql)이 하고,
// 여기서는 deno·DB 없이 CI 에서 볼 수 있는 것만 문다: 엣지 함수의 첫 분기 게이트 · 탈퇴의 SQL 메타 삭제 부활 · 검색 범위.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8').replace(/\r/g, '');
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
const stripSql = (s: string) => s.replace(/--[^\n]*/g, '');

describe('storage-purge 엣지 함수 — 크론만 부른다', () => {
  const fn = stripTs(read('supabase/functions/storage-purge/index.ts'));
  const serve = fn.slice(fn.indexOf('Deno.serve'));

  it('큐·저장소를 만지기 전에 크론 공유 시크릿을 타이밍 안전 비교로 증명한다', () => {
    const gate = serve.indexOf("return json({ error: 'unauthorized' }, 401)");
    expect(gate, '401 분기가 없다').toBeGreaterThan(-1);
    expect(serve.indexOf("req.headers.get('x-nuri-cron-secret')")).toBeLessThan(gate);
    expect(serve.slice(0, gate)).toMatch(/!expected \|\| !provided \|\| !timingSafeEq\(provided, expected\)/);
    for (const touch of ["from('storage_purge_queue')", '.storage.from(']) {
      expect(serve.indexOf(touch), `${touch} 가 게이트보다 앞에 있다`).toBeGreaterThan(gate);
    }
    expect(fn).toContain("rpc('get_push_shared_secret')");
  });
});

describe('20261006s2 — 탈퇴가 저장소 파일을 큐에 넣는다', () => {
  const sql = stripSql(read('supabase/migrations/20261006s2_withdraw_storage_purge.sql'));
  const body = (name: string) => {
    const s = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    expect(s, `${name} 정의가 없다`).toBeGreaterThan(-1);
    return sql.slice(s, sql.indexOf('end $function$;', s));
  };

  it('본인·관리자 탈퇴 모두 SQL 메타 삭제(파일 고아)를 하지 않고 큐에 넣는다', () => {
    for (const [name, uid] of [['withdraw_my_account', 'v_uid'], ['admin_withdraw_user', 'p_user_id']]) {
      const b = body(name);
      expect(b).not.toMatch(/delete\s+from\s+storage\.objects/i);
      expect(b).toContain(`perform public._enqueue_user_storage_purge(${uid},`);
    }
  });

  it('큐는 avatars·verifications 두 버킷을 회원 폴더로 담고, 크론은 시크릿 헤더를 동봉한다', () => {
    expect(sql).toMatch(/o\.bucket_id in \('avatars', 'verifications'\)\s+and o\.name like p_uid::text \|\| '\/%'/);
    expect(sql).toContain("'x-nuri-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'push_shared_secret'), '')");
    expect(sql).toContain('/functions/v1/storage-purge');
  });
});

describe('20261006s1 — 실명·옛 닉네임 정확 일치는 이 매장 손님만', () => {
  const sql = stripSql(read('supabase/migrations/20261006s1_sec_voucher_recipient_scope.sql'));
  const where = sql.slice(sql.indexOf('where coalesce(p.status::text'), sql.indexOf('select h.id, h.nickname'));

  it('where 의 실명·옛 닉네임 일치가 고객(r.uid) 조건 안에 있다 — 닉네임 부분 일치만 전 회원', () => {
    expect(where).toMatch(/p\.nickname ilike v_like\s+or \( r\.uid is not null\s+and \( lower\(btrim\(p\.real_name\)\) = v_k/);
    expect(sql).toContain('case when r.uid is not null and lower(btrim(p.real_name)) = v_k then p.real_name end as rn');
  });
});
