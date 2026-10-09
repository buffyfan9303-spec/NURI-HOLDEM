// 카카오 로그인 클라이언트 흐름(src/lib/kakaoLogin.ts) — 공개 스위치 · state/nonce · signInWithIdToken 인자 · 실패 문장.
// 실행: npx vitest run src/lib/kakaoLogin.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { invoke, signInWithIdToken, setKeepSignedIn } = vi.hoisted(() => ({
  invoke: vi.fn(),
  signInWithIdToken: vi.fn(async () => ({ data: {}, error: null as null | { message: string } })),
  setKeepSignedIn: vi.fn(),
}));
vi.mock('./supabase', () => ({
  IS_MOCK: false,
  setKeepSignedIn,
  supabase: { functions: { invoke }, auth: { signInWithIdToken } },
}));

// node 환경 — 브라우저 전역을 최소로 흉내 낸다
const store = new Map<string, string>();
const assign = vi.fn();
const replaceState = vi.fn();
Object.assign(globalThis, {
  sessionStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
  window: { location: { assign, search: '' }, history: { replaceState } },
});

const m = await import('./kakaoLogin');

beforeEach(() => { store.clear(); invoke.mockReset(); signInWithIdToken.mockClear(); assign.mockClear(); replaceState.mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('공개 스위치 — 기본 꺼짐', () => {
  it('값이 없거나 true 가 아니면 꺼짐, "true" 일 때만 켜짐', () => {
    vi.stubEnv('VITE_KAKAO_LOGIN_ENABLED', '');
    expect(m.kakaoLoginEnabled()).toBe(false);
    vi.stubEnv('VITE_KAKAO_LOGIN_ENABLED', '1');
    expect(m.kakaoLoginEnabled()).toBe(false);
    vi.stubEnv('VITE_KAKAO_LOGIN_ENABLED', 'true');
    expect(m.kakaoLoginEnabled()).toBe(true);
  });
});

describe('start — 카카오로 떠나기', () => {
  it('state·nonce 를 보관하고, 엣지 함수에는 nonce 의 sha256 hex 만 보낸 뒤 카카오 인가 주소로 이동한다', async () => {
    invoke.mockResolvedValueOnce({ data: { url: 'https://kauth.kakao.com/oauth/authorize?x=1' }, error: null });
    await m.startKakaoLogin(false);
    expect(setKeepSignedIn).toHaveBeenCalledWith(false);
    const pending = JSON.parse(store.get('nuri:kakao-oidc')!);
    expect(pending.state).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(pending.nonce).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const [fn, opts] = invoke.mock.calls[0];
    expect(fn).toBe('kakao-oidc-exchange');
    expect(opts.body).toEqual({ action: 'start', state: pending.state, nonceHash: await m.sha256hex(pending.nonce) });
    expect(opts.body.nonceHash).not.toBe(pending.nonce); // 원문은 카카오로 가지 않는다
    expect(assign).toHaveBeenCalledWith('https://kauth.kakao.com/oauth/authorize?x=1');
  });

  it('서버가 카카오가 아닌 주소를 주면 이동하지 않는다', async () => {
    invoke.mockResolvedValueOnce({ data: { url: 'https://evil.example/' }, error: null });
    await expect(m.startKakaoLogin()).rejects.toThrow(m.KAKAO_MSG.failed);
    expect(assign).not.toHaveBeenCalled();
  });

  it('엣지 함수 오류는 서버의 고정 문장으로 던진다', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { context: { json: async () => ({ error: '카카오 로그인이 아직 준비되지 않았습니다.' }) } } });
    await expect(m.startKakaoLogin()).rejects.toThrow('카카오 로그인이 아직 준비되지 않았습니다.');
  });

  it('sha256hex 는 표준 벡터와 같다', async () => {
    expect(await m.sha256hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('complete — /auth/kakao 복귀', () => {
  const seed = (over: Record<string, unknown> = {}) =>
    store.set('nuri:kakao-oidc', JSON.stringify({ state: 'STATE_OK_STATE_OK_1', nonce: 'RAW_NONCE', at: Date.now(), ...over }));

  it('state 가 맞으면 code 를 교환하고 signInWithIdToken({ provider:"kakao", token, nonce: 원문 }) — 성공은 null', async () => {
    seed();
    invoke.mockResolvedValueOnce({ data: { id_token: 'a.b.c' }, error: null });
    const r = await m.completeKakaoLogin({ search: '?code=CODE123456789&state=STATE_OK_STATE_OK_1' });
    expect(r).toBeNull();
    expect(invoke).toHaveBeenCalledWith('kakao-oidc-exchange', { body: { action: 'exchange', code: 'CODE123456789' } });
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: 'kakao', token: 'a.b.c', nonce: 'RAW_NONCE' });
    expect(store.has('nuri:kakao-oidc')).toBe(false);            // 1회용
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');   // 코드가 주소창에 남지 않는다
  });

  it.each([
    ['state 불일치(CSRF)', () => seed(), '?code=CODE123456789&state=OTHER'],
    ['보관값 없음(다른 탭·만료 정리)', () => {}, '?code=CODE123456789&state=STATE_OK_STATE_OK_1'],
    ['10분 지남', () => seed({ at: Date.now() - 11 * 60_000 }), '?code=CODE123456789&state=STATE_OK_STATE_OK_1'],
    ['code 없음', () => seed(), '?state=STATE_OK_STATE_OK_1'],
  ])('%s → 만료 문장, 교환하지 않는다', async (_n, prep, search) => {
    prep();
    expect(await m.completeKakaoLogin({ search })).toBe(m.KAKAO_MSG.expired);
    expect(invoke).not.toHaveBeenCalled();
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it('사용자 취소·동의 거부(error=access_denied) → 취소 문장. 원문 설명은 화면에 싣지 않는다', async () => {
    seed();
    const r = await m.completeKakaoLogin({ search: '?error=access_denied&error_description=ZZPWN%20call%20010' });
    expect(r).toBe(m.KAKAO_MSG.cancelled);
    expect(r).not.toMatch(/ZZPWN/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ['Provider (issuer "https://kauth.kakao.com") is not enabled', m.KAKAO_MSG.notReady],
    ['Error getting user email from external provider', m.KAKAO_MSG.notReady],
    ['Database error saving new user', m.KAKAO_MSG.dbError],
    ['Nonces mismatch', m.KAKAO_MSG.failed],
  ])('signInWithIdToken 오류 "%s" → 고정 문장', async (raw, want) => {
    seed();
    invoke.mockResolvedValueOnce({ data: { id_token: 'a.b.c' }, error: null });
    signInWithIdToken.mockResolvedValueOnce({ data: {}, error: { message: raw } });
    expect(await m.completeKakaoLogin({ search: '?code=CODE123456789&state=STATE_OK_STATE_OK_1' })).toBe(want);
  });
});

describe('연결 계약', () => {
  it('App 이 보는 복귀 경로와 엣지 함수의 콜백 경로가 이 모듈의 KAKAO_CALLBACK_PATH 와 같다', () => {
    const root = join(__dirname, '..', '..');
    const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
    const fn = readFileSync(join(root, 'supabase/functions/kakao-oidc-exchange/logic.ts'), 'utf8');
    expect(app).toContain(`window.location.pathname !== '${m.KAKAO_CALLBACK_PATH}'`);
    expect(app).toContain(`window.location.pathname === '${m.KAKAO_CALLBACK_PATH}') return;`); // 공용 OAuth 오류 effect 가 비켜선다
    expect(fn).toContain(`CALLBACK_PATH = '${m.KAKAO_CALLBACK_PATH}'`);
  });
});
