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

/** 카카오 응답 흉내 — HTTP 상태 + 본문의 숫자 code */
const kakao = (status: number, code: number | null = null) => async () => ({ status, code });

function world(over: Partial<Deps> = {}, opt: { role?: string; kakao?: Record<string, string | null>; res?: { status: number; code: number | null }; blocked?: boolean } = {}) {
  const unlinked: string[] = [];
  const records: [string, string | null, boolean, number][] = [];
  const logs: unknown[][] = [];
  const blockedAsked: [string, boolean][] = [];
  const deps: Deps = {
    adminKey: 'ADMIN_KEY_ZZ',
    cronSecret: async () => SECRET,
    getUserId: async (t) => (t === 'tok-me' ? ME : null),
    getRole: async () => opt.role ?? 'user',
    getKakaoId: async (uid) => (opt.kakao ?? { [ME]: KID, [OTHER]: '4099999999' })[uid] ?? null,
    withdrawBlocked: async (uid, self) => { blockedAsked.push([uid, self]); return opt.blocked ?? false; },
    unlink: async (id) => { unlinked.push(id); return opt.res ?? { status: 200, code: null }; },
    record: async (...a) => { records.push(a); },
    pending: async () => [],
    allow: () => true,
    log: (...a) => { logs.push(a); },
    ...over,
  };
  return { deps, unlinked, records, logs, blockedAsked };
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
    ['카카오 거절(500)', kakao(500)],
    ['휴면·없는 카카오계정(-103)', kakao(400, -103)],
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
    const w = world({ unlink: kakao(500), record: async () => { throw new Error('db down'); } });
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
    const w = world({ pending, unlink: async (id) => ({ status: id === '4000000001' ? 200 : 500, code: null }) });
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

// critical-211 재반증 P2-A — 카카오 응답 판정(공식 오류 코드 https://developers.kakao.com/docs/ko/rest-api/error-code)
//   '-101 이미 연결되지 않은 사용자' 는 done, 401(키 오류)은 시도 횟수를 쓰지 않는다.
//   401 행 자체의 attempts 면제는 DB(kakao_unlink_record)가 한다 — supabase/tests/20261007kb_rehearsal.sql K1.
//   엣지는 그 판정 키(status 401)를 그대로 넘기고, 크론은 첫 401 에서 멈춰 **다른 행의 attempts 를 건드리지 않는다**.
describe('카카오 응답 판정 — 이미 끊김 · 키 오류', () => {
  it('400 + code -101(이미 연결되지 않은 사용자) → done 으로 기록하고 unlinked — 본문 원문·회원번호는 응답·로그에 없다', async () => {
    const w = world({}, { res: { status: 400, code: -101 } });
    const r = await run(w, call({}));
    expect(r.body).toEqual({ unlinked: true });
    expect(w.records).toEqual([[KID, ME, true, 400]]);
    expect(r.text + JSON.stringify(w.logs)).not.toMatch(new RegExp(`${KID}|ADMIN_KEY_ZZ|NotRegisteredUser`));
  });

  it('400 + 다른 code(-2) 는 이미 끊김이 아니다 → 실패로 기록', async () => {
    const w = world({ unlink: kakao(400, -2) });
    expect((await run(w, call({}))).body).toEqual({ unlinked: false, queued: true });
    expect(w.records).toEqual([[KID, ME, false, 400]]);
  });

  it('401(어드민 키 오류) → status 401 로 기록(DB 가 attempts 를 올리지 않는 키) + 키 확인 로그', async () => {
    const w = world({ unlink: kakao(401, -401) });
    expect((await run(w, call({}))).body).toEqual({ unlinked: false, queued: true });
    expect(w.records).toEqual([[KID, ME, false, 401]]);
    expect(JSON.stringify(w.logs)).toMatch(/KAKAO_ADMIN_KEY/);
  });

  it('크론: 첫 행이 401 이면 그 회차를 멈춘다 — 뒤 행은 카카오도 기록도 건드리지 않는다(attempts 그대로)', async () => {
    const pending = async () => [
      { provider_id: '4000000001', user_id: null, attempts: 0 },
      { provider_id: '4000000002', user_id: null, attempts: 3 },
      { provider_id: '4000000003', user_id: null, attempts: 9 },
    ];
    const w = world({ pending }, { res: { status: 401, code: -401 } });
    const r = await run(w, call({ action: 'drain' }, { 'x-nuri-cron-secret': SECRET }));
    expect(r.body).toEqual({ done: 0, failed: 1, keyError: true });
    expect(w.unlinked).toEqual(['4000000001']);
    expect(w.records).toEqual([['4000000001', null, false, 401]]);
    expect(JSON.stringify(w.logs)).not.toMatch(/exhausted/);
  });

  it('크론: -101 행은 done 으로 센다', async () => {
    const pending = async () => [{ provider_id: '4000000001', user_id: null, attempts: 9 }];
    const w = world({ pending, unlink: kakao(400, -101) });
    expect((await run(w, call({ action: 'drain' }, { 'x-nuri-cron-secret': SECRET }))).body).toEqual({ done: 1, failed: 0 });
    expect(w.records).toEqual([['4000000001', null, true, 400]]);
  });
});

// 재반증 P3-B — 탈퇴 RPC 가 거절할 회원(매장 대표 등)은 카카오 연결만 끊기지 않게 먼저 거른다
describe('탈퇴 사전 조건 — 거절될 탈퇴는 끊지 않는다', () => {
  it('본인: withdrawBlocked(본인, self=true) 가 true 면 카카오를 부르지 않고 기록도 없다', async () => {
    const w = world({}, { blocked: true });
    const r = await run(w, call({}));
    expect(r.body).toEqual({ unlinked: false, skipped: 'withdraw_blocked' });
    expect(w.blockedAsked).toEqual([[ME, true]]);
    expect(w.unlinked).toHaveLength(0);
    expect(w.records).toHaveLength(0);
  });

  it('관리자 강제 탈퇴: 대상 기준(self=false)으로 묻는다', async () => {
    const w = world({}, { role: 'admin' });
    await run(w, call({ userId: OTHER }));
    expect(w.blockedAsked).toEqual([[OTHER, false]]);
  });

  it('조건 확인이 실패하면 끊지 않는다(탈퇴가 되면 identity 삭제 트리거가 큐에 넣는다)', async () => {
    const w = world({ withdrawBlocked: async () => { throw new Error('db down'); } });
    expect((await run(w, call({}))).body).toEqual({ unlinked: false, skipped: 'withdraw_blocked' });
    expect(w.unlinked).toHaveLength(0);
  });

  it('카카오가 아닌 회원은 조건을 묻지도 않는다', async () => {
    const w = world({}, { kakao: {} });
    await run(w, call({}));
    expect(w.blockedAsked).toHaveLength(0);
  });
});
