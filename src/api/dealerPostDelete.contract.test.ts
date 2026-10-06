// 딜러 글 삭제 계약 (PR #202 · 20261007d 재작업 · critical-reviewer pr202-review.md P1)
//
// 이 테스트가 잡는 회귀
//   ① deleteDealerPost 가 다시 dealer_posts 를 직접 UPDATE 하는 것 — 작성자에게는 42501 이고, 그걸 읽기 정책을 넓혀 고치면
//      작성자가 운영자 삭제를 되돌린다(R2·R3)·지운 글의 지원서를 계속 읽는다(R1). 삭제는 RPC 한 곳만 지난다.
//   ② 서버 거절 문장(권한 없음·이미 삭제됨)이 토스트에서 '삭제에 실패했습니다' 로 뭉개지는 것
//   ③ 20261007d 가 dealer_posts_read 정책을 다시 건드리거나, RPC 의 NULL-safe 검사·DEFINER·search_path·PUBLIC/anon 회수가 빠지는 것
// 행동(정책·RPC 의 실제 거절)은 vitest 로 못 본다 — supabase/tests/20261007d_rehearsal.sql(라이브 롤백 리허설)이 본다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const calls: { name: string; args: unknown }[] = [];
let rpcError: unknown = null;

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return { data: null, error: rpcError }; },
    from: (name: string) => { throw new Error(`표 직접 접근 금지: ${name}`); },
  },
}));

describe('deleteDealerPost — 서버 RPC 한 번', () => {
  beforeEach(() => { calls.length = 0; rpcError = null; });

  it('delete_dealer_post 에 글 id 만 싣는다(표를 직접 고치지 않는다)', async () => {
    const { deleteDealerPost } = await import('./community');
    await deleteDealerPost('d1');
    expect(calls).toEqual([{ name: 'delete_dealer_post', args: { p_id: 'd1' } }]);
  });

  it('서버 거절 문장(P0001)은 그대로 사용자에게 간다', async () => {
    const { deleteDealerPost } = await import('./community');
    rpcError = { code: 'P0001', message: '이 글을 삭제할 권한이 없습니다' };
    await expect(deleteDealerPost('d1')).rejects.toThrow('이 글을 삭제할 권한이 없습니다');
    rpcError = { code: 'P0001', message: '이미 삭제된 글입니다' };
    await expect(deleteDealerPost('d1')).rejects.toThrow('이미 삭제된 글입니다');
  });
});

describe('20261007d — 정책은 그대로, 삭제만 RPC', () => {
  const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261007d_dealer_post_author_soft_delete.sql'), 'utf-8')
    .replace(/--[^\n]*/g, '');
  const fn = sql.slice(sql.indexOf('create function public.delete_dealer_post'), sql.indexOf('$fn$;'));

  it('dealer_posts 정책을 바꾸지 않는다', () => {
    expect(sql).not.toMatch(/(alter|create|drop)\s+policy/i);
  });

  it('RPC 는 DEFINER · search_path 고정 · NULL-safe 권한 검사 · PUBLIC/anon 회수', () => {
    expect(fn).toMatch(/security definer/);
    expect(fn).toMatch(/set search_path = public, pg_temp/);
    expect(fn).toMatch(/v_author is distinct from v_uid and my_role\(\) is distinct from 'admin'/);
    expect(fn).toMatch(/if v_deleted then/);
    expect(sql).toContain('revoke all on function public.delete_dealer_post(uuid) from public, anon;');
    expect(sql).toContain('grant execute on function public.delete_dealer_post(uuid) to authenticated, service_role;');
  });
});
