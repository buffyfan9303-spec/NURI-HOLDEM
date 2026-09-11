// 관리자 '강제 탈퇴' — 서버(SQL) 계약 + 클라이언트 순서·폴백 금지 (20260911k, 2026-09-11)
//
// 무엇을 잠그나
//   ① 클라이언트: 강제 탈퇴는 **RPC 로만** 나간다. RPC 가 아직 없을 때(PGRST202) 옛 경로
//      (profiles PATCH)로 조용히 떨어지면 '탈퇴시킨 줄 알았는데 계정 그대로' 가 된다 — 그 폴백을 금지한다.
//      그리고 **거절 조건 확인 → 안내 메일 → RPC** 순서를 잠근다. 메일이 RPC 뒤면 익명화된 주소로
//      나가 통지가 증발하고, 확인이 메일 뒤면 탈퇴되지 않은 회원에게 거짓 통지가 나간다.
//   ② 서버: 수정이 전부 DB 함수 안이라 단위 테스트가 실행으로 검증할 수 없다 → SQL 텍스트를 잠근다
//      (실행 검증은 마이그레이션 하단 자가검사가 맡는다 — 어긋나면 전체 롤백).
// 실행: npx vitest run src/api/adminWithdraw.migration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── ① 클라이언트 ────────────────────────────────────────────────────────────
const calls: string[] = [];
let rpcError: { message: string; code?: string } | null = null;
let ownedVenues: Array<{ id: string }> = [];
let targetRole = 'user';

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  setKeepSignedIn: () => {},
  clearAuthStorage: () => {},
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}:${JSON.stringify(args)}`);
      return { data: null, error: rpcError };
    },
    from: (table: string) => ({
      // 사전 점검(읽기)
      select: () => ({
        eq: () => ({
          limit: async () => { calls.push(`read:${table}`); return { data: ownedVenues, error: null }; },
          maybeSingle: async () => { calls.push(`read:${table}`); return { data: { role: targetRole }, error: null }; },
        }),
      }),
      // 옛 경로(쓰기)가 살아 있으면 여기에 흔적이 남는다
      update: () => {
        calls.push(`patch:${table}`);
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }) };
      },
    }),
    functions: {
      invoke: async (fn: string) => { calls.push(`fn:${fn}`); return { data: { sent: true }, error: null }; },
    },
  },
}));
vi.mock('./_session', () => ({ currentUser: async () => ({ id: 'admin' }) }));

const { adminWithdrawUser } = await import('./auth');

beforeEach(() => { calls.length = 0; rpcError = null; ownedVenues = []; targetRole = 'user'; });

describe('adminWithdrawUser — 확인 → 메일 → RPC, 그리고 실패는 보인다', () => {
  it('성공: 거절 조건 확인 → 안내 메일 → RPC 순서로 나가고 profiles PATCH 는 없다', async () => {
    await adminWithdrawUser('u-1', '불법 환전 알선');
    expect(calls).toEqual([
      'read:venues',
      'read:profiles',
      'fn:notify-sanction',
      'rpc:admin_withdraw_user:{"p_user_id":"u-1","p_reason":"불법 환전 알선"}',
    ]);
    expect(calls.some((c) => c.startsWith('patch:'))).toBe(false);
  });

  it('매장 대표: 메일도 RPC 도 나가지 않는다 — 탈퇴되지 않은 회원에게 통지가 가면 안 된다', async () => {
    ownedVenues = [{ id: 'v-1' }];
    await expect(adminWithdrawUser('u-1', '사유')).rejects.toThrow(/매장 대표/);
    expect(calls).not.toContain('fn:notify-sanction');
    expect(calls.some((c) => c.startsWith('rpc:'))).toBe(false);
  });

  it('운영자 계정: 메일도 RPC 도 나가지 않는다', async () => {
    targetRole = 'admin';
    await expect(adminWithdrawUser('u-1', '사유')).rejects.toThrow(/운영자 계정/);
    expect(calls).not.toContain('fn:notify-sanction');
    expect(calls.some((c) => c.startsWith('rpc:'))).toBe(false);
  });

  it('RPC 미적용(PGRST202): 던진다 — 옛 경로로 떨어지지 않는다', async () => {
    rpcError = { code: 'PGRST202', message: 'Could not find the function public.admin_withdraw_user' };
    await expect(adminWithdrawUser('u-1', '사유')).rejects.toThrow(/적용/);
    expect(calls.some((c) => c.startsWith('patch:'))).toBe(false);
  });

  it('그 밖의 서버 오류도 삼키지 않는다', async () => {
    rpcError = { code: '42501', message: '권한 없음: 관리자만 강제 탈퇴를 처리할 수 있습니다' };
    await expect(adminWithdrawUser('u-1', '사유')).rejects.toThrow('권한 없음: 관리자만 강제 탈퇴를 처리할 수 있습니다');
  });
});

// ── ② 서버(SQL) ─────────────────────────────────────────────────────────────
const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911k_admin_withdraw_user.sql'),
  'utf-8',
);
/** 함수 본문만 잘라 본다 — 머리말 주석이 통과시켜 주는 착시를 막는다(20260911b·i 테스트와 같은 관행). */
const bodyOf = (name: string, tag: string): string => {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} 정의가 없다`).toBeGreaterThan(-1);
  const open = SQL.indexOf(`as ${tag}`, start);
  return SQL.slice(start, SQL.indexOf(`${tag};`, open + 3));
};

describe('20260911k — 강제 탈퇴가 본인 탈퇴와 같은 일을 한다', () => {
  const fn = () => bodyOf('admin_withdraw_user', '$fn$');

  it('본인 탈퇴가 파기하는 것을 하나도 빼먹지 않는다', () => {
    const b = fn();
    for (const col of ['real_name=null', 'phone=null', 'ci_hash=null', 'verified_at=null',
                       'birth_date=null', 'gender=null', 'carrier=null', 'venue_id=null', 'avatar_url=null']) {
      expect(b, `profiles 익명화에서 ${col} 이 빠졌다`).toContain(col);
    }
    expect(b).toContain("status='withdrawn'");
    expect(b).toContain('delete from public.venue_staff');
    expect(b).toContain('delete from public.venue_owners');
    expect(b).toContain('update auth.users set email = v_anon_email');
    expect(b).toContain('delete from auth.identities');
    expect(b).toContain('delete from auth.sessions');
    expect(b).toContain('delete from auth.refresh_tokens');
    expect(b).toContain('delete from auth.one_time_tokens');
    expect(b).toContain('delete from public.push_subscriptions');
    expect(b).toContain("bucket_id = 'avatars'");
  });

  it('제재 계정을 거절하지 않는다 — 그게 이 함수의 목적이다', () => {
    // 본인 탈퇴의 `if v_status in ('banned','suspended') then raise` 를 복사해 오면 안 된다
    expect(fn()).not.toContain("in ('banned','suspended')");
    expect(fn()).not.toContain("in ('banned', 'suspended')");
  });

  it("이미 'withdrawn' 인 행을 조기 return 하지 않는다 — 옛 경로 피해자가 파기 대상이다", () => {
    // 옛 경로(profiles 세 컬럼 UPDATE)로 status 만 바뀐 기존 행은 실명·전화·CI·세션이 그대로다.
    // 여기서 조기 return 하면 그 행들이 영구히 파기 불가가 된다.
    expect(fn()).not.toMatch(/v_status\s*=\s*'withdrawn'\s*then\s*\n?\s*return\s*;/);
  });

  it('매장 대표·운영자는 거절하고, 권한 가드는 NULL-safe 다', () => {
    const b = fn();
    expect(b).toContain("my_role() is distinct from 'admin'::user_role");
    expect(b).not.toMatch(/my_role\(\)\s*<>\s*'admin'/);
    expect(b).toContain('select 1 from public.venues where owner_id = p_user_id');
    expect(b).toContain("if v_role = 'admin' then");
  });

  it('사유를 요구하고 그 사유를 sanction_reason 에 남긴다', () => {
    const b = fn();
    expect(b).toContain('강제 탈퇴 사유를 입력해 주세요');
    expect(b).toContain('sanction_reason=v_reason');
    expect(b).not.toContain("sanction_reason='본인 탈퇴'");
  });

  it('재가입 차단 텀스톤과 감사기록을 남긴다', () => {
    const b = fn();
    expect(b).toContain("values (v_hash, 'admin_withdrawn')");
    expect(b).toContain("on conflict (ci_hash) do update set reason = 'admin_withdrawn'");
    expect(b).toContain('public._audit(');
    expect(b).toContain("'admin_withdraw_user', p_user_id::text");
  });

  it('텀스톤이 실제로 재가입을 막는다 — 자발 탈퇴는 계속 복귀 허용', () => {
    const v = bodyOf('verify_identity_commit', '$function$');
    expect(v).toContain("w.reason in ('banned', 'admin_withdrawn')");
    expect(v).toContain("'code', 'tombstoned'");
    // 거절은 인증 ID 소진보다 앞 — 막힌 사용자의 인증 ID 를 헛되이 태우지 않는다
    expect(v.indexOf("'tombstoned'")).toBeLessThan(v.indexOf('used_identity_verifications'));
    // 기존 계약(1인 1계정·인증 ID 일회성)은 그대로
    expect(v).toContain("'code', 'dup'");
    expect(v).toContain("'code', 'reused'");
  });

  it("'제재 해제' 가 영구정지 텀스톤을 걷는다 — 해제가 해제로 남는다", () => {
    const t = bodyOf('tombstone_banned_ci', '$$');
    expect(t).toContain('delete from public.withdrawn_identities');
    expect(t).toContain("reason = 'banned'");
    // 강제 탈퇴 텀스톤은 해제 대상이 아니다
    expect(t).not.toContain("reason = 'admin_withdrawn'");
  });

  it('create or replace 뒤 ACL 을 셋 다 다시 닫는다(PUBLIC 포함)', () => {
    expect(SQL).toContain('revoke all on function public.admin_withdraw_user(uuid, text) from public, anon;');
    expect(SQL).toContain('grant execute on function public.admin_withdraw_user(uuid, text) to authenticated, service_role;');
    expect(SQL).toContain('revoke all on function public.verify_identity_commit(uuid,text,text,text,date,text,text,text) from public, anon, authenticated;');
    expect(SQL).toContain('grant execute on function public.verify_identity_commit(uuid,text,text,text,date,text,text,text) to service_role;');
    // 20260827d 가 걸어 둔 트리거 함수 회수를 이 파일에서도 다시 쓴다
    expect(SQL).toContain('revoke all on function public.tombstone_banned_ci() from public, anon, authenticated;');
  });

  it('SECURITY DEFINER search_path 고정 · 동작까지 보는 자가검사 · 스키마 리로드', () => {
    expect(SQL).toContain('set search_path = public, pg_temp');
    expect(SQL).toContain("notify pgrst, 'reload schema';");
    // 자가검사가 존재·ACL 만 보고 끝나면 핵심 동작이 빠져도 통과한다 → prosrc 까지 본다
    expect(SQL).toContain('strpos(v_src, ');
    expect(SQL).not.toMatch(/v_src\s+like\s+'%_restore/); // LIKE 의 '_' 와일드카드 함정 금지
    expect(SQL).toContain('ABORT: ');
  });
});
