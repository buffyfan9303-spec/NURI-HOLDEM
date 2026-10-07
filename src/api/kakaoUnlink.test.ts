// 카카오 연결 끊기 엣지 함수(kakao-unlink) — 판정부를 **같은 파일 그대로** import 해 잰다(kakaoOidcExchange.test.ts 와 같은 방식).
// critical-211 P2-1: 탈퇴 과정에 카카오 연결 해제를 넣는다(카카오 정책 필수). 잠그는 것:
//   첫 분기 호출자 증명 · 남의 계정은 관리자만 · 카카오 아닌 회원은 no-op · 실패해도 탈퇴는 진행(큐에 남김) ·
//   크론 입구는 공유 시크릿 · 응답·로그에 회원번호·어드민 키 없음 · 분당 상한.
// 실행: npx vitest run src/api/kakaoUnlink.test.ts
import { describe, it, expect } from 'vitest';
import { handle, makeLimiter, type Deps } from '../../supabase/functions/kakao-unlink/logic.ts';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const KID = '4012345678';
const SECRET = 'cron-secret-zz';

function world(over: Partial<Deps> = {}, opt: { role?: string; kakao?: Record<string, string | null> } = {}) {
  const unlinked: string[] = [];
  const records: [string, string | null, boolean, number][] = [];
  const logs: unknown[][] = [];
  const deps: Deps = {
    adminKey: 'ADMIN_KEY_ZZ',
    cronSecret: async () => SECRET,
    getUserId: async (t) => (t === 'tok-me' ? ME : null),
    getRole: async () => opt.role ?? 'user',
    getKakaoId: async (uid) => (opt.kakao ?? { [ME]: KID, [OTHER]: '4099999999' })[uid] ?? null,
    unlink: async (id) => { unlinked.push(id); return 200; },
    record: async (...a) => { records.push(a); },
    pending: async () => [],
    allow: () => true,
    log: (...a) => { logs.push(a); },
    ...over,
  };
  return { deps, unlinked, records, logs };
}
const call = (body: unknown, headers: Record<string, string> = { Authorization: 'Bearer tok-me' }) =>
  new Request('https://x/functions/v1/kakao-unlink', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const run = async (w: ReturnType<typeof world>, req: Request) => {
  const r = await handle(req, w.deps);
  const text = await r.text();
  return { status: r.status, body: JSON.parse(text) as Record<string, unknown>, text };
};

describe('사용자 입구 — 탈퇴 RPC 직전', () => {
  it('본인 탈퇴: 내 카카오 회원번호로 끊고 done 으로 기록한다 — 응답에 회원번호·키 없음', async () => {
    const w = world();
    const r = await run(w, call({}));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ unlinked: true });
    expect(w.unlinked).toEqual([KID]);
    expect(w.records).toEqual([[KID, ME, true, 200]]);
    expect(r.text + JSON.stringify(w.logs)).not.toMatch(new RegExp(`${KID}|ADMIN_KEY_ZZ`));
  });

  it('카카오가 아닌 회원은 아무것도 하지 않는다(no-op)', async () => {
    const w = world({}, { kakao: {} });
    const r = await run(w, call({}));
    expect(r.body).toEqual({ unlinked: false, skipped: 'not_kakao' });
    expect(w.unlinked).toHaveLength(0);
    expect(w.records).toHaveLength(0);
  });

  it.each([
    ['카카오 거절(401)', async () => 401],
    ['네트워크 실패', async () => { throw new Error('ZZLEAK socket'); }],
  ])('%s → 200 queued — 탈퇴를 막지 않고 재시도 대상으로 남긴다', async (_n, unlink) => {
    const w = world({ unlink });
    const r = await run(w, call({}));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ unlinked: false, queued: true });
    expect(w.records).toHaveLength(1);
    expect(w.records[0][2]).toBe(false);
    expect(r.text + JSON.stringify(w.logs)).not.toMatch(/ZZLEAK|ADMIN_KEY_ZZ/);
  });

  it('어드민 키 미설정 → 카카오를 부르지 않고 큐에 남긴다', async () => {
    const w = world({ adminKey: undefined });
    const r = await run(w, call({}));
    expect(r.body).toEqual({ unlinked: false, queued: true });
    expect(w.unlinked).toHaveLength(0);
    expect(w.records).toEqual([[KID, ME, false, 0]]);
  });

  it('큐 기록이 실패해도 200 — 앱의 탈퇴를 막지 않는다(DB 트리거가 백업)', async () => {
    const w = world({ unlink: async () => 500, record: async () => { throw new Error('db down'); } });
    expect((await run(w, call({}))).body).toEqual({ unlinked: false, queued: true });
  });
});

describe('호출자 증명 — 첫 분기', () => {
  it.each([
    ['Authorization 없음', {}],
    ['무효 토큰(anon 키 등)', { Authorization: 'Bearer anon-key-jwt' }],
  ])('%s → 401, 카카오를 부르지 않는다', async (_n, headers) => {
    const w = world();
    expect((await run(w, call({}, headers as Record<string, string>))).status).toBe(401);
    expect(w.unlinked).toHaveLength(0);
  });

  it('일반 회원이 남의 userId 를 보내면 403 — 남의 카카오 연결을 끊지 못한다', async () => {
    const w = world();
    expect((await run(w, call({ userId: OTHER }))).status).toBe(403);
    expect(w.unlinked).toHaveLength(0);
  });

  it('관리자 강제 탈퇴: 대상 회원의 회원번호로 끊는다', async () => {
    const w = world({}, { role: 'admin' });
    const r = await run(w, call({ userId: OTHER }));
    expect(r.body).toEqual({ unlinked: true });
    expect(w.unlinked).toEqual(['4099999999']);
    expect(w.records[0][1]).toBe(OTHER);
  });

  it('userId 형식이 uuid 가 아니면 400', async () => {
    const w = world({}, { role: 'admin' });
    expect((await run(w, call({ userId: "x' or 1=1" }))).status).toBe(400);
    expect(w.unlinked).toHaveLength(0);
  });

  it('분당 상한 — 같은 사용자 11번째부터 429', async () => {
    const w = world({ allow: makeLimiter(10, () => 0) });
    for (let i = 0; i < 10; i++) expect((await run(w, call({}))).status).toBe(200);
    expect((await run(w, call({}))).status).toBe(429);
  });
});

describe('크론 입구 — 재시도', () => {
  const pending = async () => [
    { provider_id: '4000000001', user_id: null, attempts: 0 },
    { provider_id: '4000000002', user_id: null, attempts: 9 },
  ];

  it('시크릿이 맞으면 큐의 남은 행을 다시 끊는다', async () => {
    const w = world({ pending, unlink: async (id) => (id === '4000000001' ? 200 : 500) });
    const r = await run(w, call({ action: 'drain' }, { 'x-nuri-cron-secret': SECRET }));
    expect(r.body).toEqual({ done: 1, failed: 1 });
    expect(w.records.map((x) => [x[0], x[2]])).toEqual([['4000000001', true], ['4000000002', false]]);
    expect(JSON.stringify(w.logs)).toMatch(/exhausted/);
  });

  it.each([['틀린 시크릿', 'nope'], ['빈 시크릿', '']])('%s → 401, 큐를 건드리지 않는다', async (_n, s) => {
    const w = world({ pending });
    expect((await run(w, call({}, { 'x-nuri-cron-secret': s }))).status).toBe(401);
    expect(w.unlinked).toHaveLength(0);
  });

  it('크론 헤더가 있으면 사용자 JWT 로 갈아타지 않는다', async () => {
    const w = world({ pending });
    expect((await run(w, call({}, { 'x-nuri-cron-secret': 'nope', Authorization: 'Bearer tok-me' }))).status).toBe(401);
  });

  it('어드민 키가 없으면 크론은 큐를 건드리지 않는다(시도 횟수를 헛되이 쓰지 않음)', async () => {
    const w = world({ pending, adminKey: undefined });
    expect((await run(w, call({}, { 'x-nuri-cron-secret': SECRET }))).status).toBe(503);
    expect(w.records).toHaveLength(0);
  });
});
