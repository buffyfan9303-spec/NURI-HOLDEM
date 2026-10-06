// 본인인증 교차검증(엣지 함수 verify-identity) — 판정부를 **같은 파일 그대로** import 해 잰다(2026-09-30 D-2).
//   P2-6 진단값(code·probe·secretOk·detail)을 응답에 싣지 않는다 · P2-7 유저별 하루 상한 · 기존 게이트 유지.
// 실행: npx vitest run src/api/verifyIdentity.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handle, IDENTITY_DAILY_LIMIT, type Deps } from '../../supabase/functions/verify-identity/logic.ts';

const ROOT = join(__dirname, '..', '..');
const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const VERIFIED = { status: 'VERIFIED', verifiedCustomer: { ci: 'CI', birthDate: '1990-01-01', name: '홍길동' } };

function world(over: Partial<Deps> = {}) {
  const calls = { lookup: 0, quota: 0, commit: 0 };
  const logs: unknown[][] = [];
  let used = 0;
  const deps: Deps = {
    portoneConfigured: true, supabaseConfigured: true,
    getUserId: async (h) => (h === 'Bearer ok' ? 'u1' : null),
    consumeQuota: async (_u, limit) => { calls.quota++; used++; return { ok: used <= limit }; },
    lookup: async () => { calls.lookup++; return resp(200, VERIFIED); },
    commit: async () => { calls.commit++; return { data: { ok: true }, error: null }; },
    log: (...a) => { logs.push(a); },
    ...over,
  };
  return { deps, calls, logs };
}
const post = (auth: string | null = 'Bearer ok', body: unknown = { identityVerificationId: 'iv-1', storeId: 'store-x' }) =>
  new Request('https://x/functions/v1/verify-identity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
const run = async (w: ReturnType<typeof world>, req = post()) => {
  const r = await handle(req, w.deps);
  return { status: r.status, body: await r.json() as Record<string, unknown> };
};

describe('verify-identity — 응답에 진단값을 싣지 않는다(P2-6)', () => {
  const failing = (probeType: string) => world({
    lookup: async (id) => (id.includes('probe') ? resp(404, { type: probeType }) : resp(401, { type: 'UNAUTHORIZED', message: 'secret bad' })),
  });

  it('PortOne 조회 실패 — 응답 키는 error 하나뿐이고 문구에도 코드가 없다. 진단값은 로그에만 있다', async () => {
    for (const probe of ['IDENTITY_VERIFICATION_NOT_FOUND', 'UNAUTHORIZED']) {
      const w = failing(probe);
      const { status, body } = await run(w);
      expect(status).toBe(502);
      expect(Object.keys(body)).toEqual(['error']);
      expect(String(body.error)).not.toMatch(/UNAUTHORIZED|NOT_FOUND|HTTP_|\(/);
      expect(JSON.stringify(w.logs)).toContain(probe);
    }
  });

  it('사용자 안내 두 갈래(그 건 문제 / 서버 설정 문제)는 그대로다', async () => {
    expect((await run(failing('IDENTITY_VERIFICATION_NOT_FOUND'))).body.error).toContain('인증 기록을 찾지 못했습니다');
    expect((await run(failing('UNAUTHORIZED'))).body.error).toContain('본인인증 서버 설정에 문제가 있습니다');
  });

  it('commit 이 모르는 코드로 거절해도 내부 코드는 응답에 없다', async () => {
    const w = world({ commit: async () => ({ data: { ok: false, code: 'weird_internal' }, error: null }) });
    const { status, body } = await run(w);
    expect(status).toBe(500);
    expect(body).toEqual({ error: '저장 실패' });
    expect(JSON.stringify(w.logs)).toContain('weird_internal');
  });

  it('시크릿 미설정 안내에 시크릿 이름이 없다(로그인 전 응답)', async () => {
    const { status, body } = await run(world({ portoneConfigured: false }), post(null));
    expect(status).toBe(503);
    expect(String(body.error)).not.toContain('PORTONE');
  });
});

describe('verify-identity — 유저별 하루 상한(P2-7)', () => {
  it(`하루 ${IDENTITY_DAILY_LIMIT}회까지 통과, 그 뒤는 429 이고 PortOne 을 부르지 않는다`, async () => {
    const w = world();
    const st: number[] = [];
    for (let i = 0; i < IDENTITY_DAILY_LIMIT + 2; i++) st.push((await run(w)).status);
    expect(st.slice(0, IDENTITY_DAILY_LIMIT).every((s) => s === 200)).toBe(true);
    expect(st.slice(IDENTITY_DAILY_LIMIT)).toEqual([429, 429]);
    expect(w.calls.lookup).toBe(IDENTITY_DAILY_LIMIT);
  });

  it('상한 RPC 가 실패하면 fail-closed(503) — PortOne 도 저장도 부르지 않는다', async () => {
    const w = world({ consumeQuota: async () => null });
    expect((await run(w)).status).toBe(503);
    expect(w.calls.lookup).toBe(0);
    expect(w.calls.commit).toBe(0);
  });

  it('비로그인은 상한을 소모하지 않고 401', async () => {
    const w = world();
    expect((await run(w, post(null))).status).toBe(401);
    expect(w.calls.quota).toBe(0);
  });

  it('배선은 consume_ai_quota 를 kind=identity 로 부른다', () => {
    const wiring = readFileSync(join(ROOT, 'supabase', 'functions', 'verify-identity', 'index.ts'), 'utf-8');
    expect(wiring).toMatch(/rpc\('consume_ai_quota',\s*\{[^}]*p_kind: 'identity'/);
  });
});

describe('verify-identity — 기존 게이트는 그대로', () => {
  it('정상 인증은 200 + 이름, 저장에 uid·idv 가 실린다', async () => {
    let got: unknown = null;
    const w = world({ commit: async (p) => { got = p; return { data: { ok: true }, error: null }; } });
    expect(await run(w)).toEqual({ status: 200, body: { ok: true, name: '홍길동' } });
    expect(got).toMatchObject({ p_uid: 'u1', p_ci: 'CI', p_idv: 'iv-1' });
  });

  it('만 19세 미만·생년 미확인은 403(fail-closed)', async () => {
    const young = new Date(); young.setUTCFullYear(young.getUTCFullYear() - 18);
    for (const birthDate of [young.toISOString().slice(0, 10), null]) {
      const w = world({ lookup: async () => resp(200, { status: 'VERIFIED', verifiedCustomer: { ci: 'CI', birthDate } }) });
      expect((await run(w)).status).toBe(403);
      expect(w.calls.commit).toBe(0);
    }
  });

  // 2026-10-06 약관 재검토 P2-6(리드) — 만 19세 미만이 '확인'되면 이용 제한 + 관리자 알림 RPC. 생년 미확인·성인은 부르지 않는다.
  //   음성 대조: logic.ts 의 `if (age !== null && age < 19)` 분기를 지우면 첫 단언이, `age !== null &&` 를 지우면 둘째가 빨개진다.
  it('만 19세 미만 확인 → restrict_underage_account(uid) 1회 · 생년 미확인·성인은 0회 · RPC 실패해도 같은 403', async () => {
    const young = new Date(); young.setUTCFullYear(young.getUTCFullYear() - 18);
    const calls: string[] = [];
    const mk = (birthDate: string | null, fail = false) => world({
      lookup: async () => resp(200, { status: 'VERIFIED', verifiedCustomer: { ci: 'CI', birthDate } }),
      restrictUnderage: async (u) => { calls.push(u); return { error: fail ? new Error('x') : null }; },
    });
    expect((await run(mk(young.toISOString().slice(0, 10)))).status).toBe(403);
    expect(calls).toEqual(['u1']);
    expect((await run(mk(null))).status).toBe(403);
    expect((await run(mk('1990-01-01'))).status).toBe(200);
    expect(calls).toEqual(['u1']);
    const wf = mk(young.toISOString().slice(0, 10), true);
    expect((await run(wf)).status).toBe(403);
    expect(JSON.stringify(wf.logs)).toContain('restrict_underage_account 실패');
  });

  it('dup·reused·tombstoned 안내는 그대로', async () => {
    const st = async (code: string) => (await run(world({ commit: async () => ({ data: { ok: false, code }, error: null }) }))).status;
    expect(await st('dup')).toBe(409);
    expect(await st('reused')).toBe(409);
    expect(await st('tombstoned')).toBe(403);
  });
});
