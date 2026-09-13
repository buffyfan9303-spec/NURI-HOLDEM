// 자동 로그인 — '세션을 못 읽은 것'과 '로그인 안 한 것'을 구분한다 (A01).
//
// 실제로 났던 일:
//   `supabase.auth.getSession()` 은 저장소 읽기 실패·토큰 갱신 실패(네트워크·5xx)에도
//   **reject 하지 않고** `{ data: { session: null }, error }` 로 resolve 한다.
//   `currentUser()` 는 `error` 를 버리고 `session` 만 봐서, 일시 오류를 **비로그인과 똑같은 null** 로 돌려줬다.
//   AuthContext 는 그 null 을 정상 성공으로 받아 **재시도 없이 로그인 화면**을 띄웠다 —
//   토큰은 저장소에 멀쩡히 있는데도. 사용자 눈에는 '자동 로그인이 안 됐다' 이고,
//   새로고침 전까지 회복 경로가 없었다(지하 매장 LTE·앱 복귀 직후처럼 첫 요청이 잘 깨지는 환경).
//
// 같은 결함을 프로필 조회는 2026-09-11 에 '던지기' 로 막았다. 여기는 **한 겹 앞인 세션 조회**다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type SessionResult = { data: { session: unknown }, error: unknown };
let sessionResult: SessionResult;

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { auth: { getSession: () => Promise.resolve(sessionResult) } },
}));

const load = async () => await import('./_session');

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.clearAllMocks(); });

const SESSION = { data: { session: { user: { id: 'user-1' } } }, error: null };
const NO_SESSION = { data: { session: null }, error: null };
const READ_FAILED = { data: { session: null }, error: new Error('Failed to fetch') };

describe('currentUserStrict — 확인 불가를 비로그인으로 단정하지 않는다', () => {
  it('정상 세션이면 사용자를 돌려준다', async () => {
    sessionResult = SESSION;
    const { currentUserStrict } = await load();
    await expect(currentUserStrict()).resolves.toEqual({ id: 'user-1' });
  });

  it('정말 로그인 안 했으면 null 이다 — 과하게 던지지 않는다', async () => {
    sessionResult = NO_SESSION;
    const { currentUserStrict } = await load();
    await expect(currentUserStrict()).resolves.toBeNull();
  });

  it('🔴 세션을 못 읽었으면 던진다 — null 로 뭉개지 않는다', async () => {
    sessionResult = READ_FAILED;
    const { currentUserStrict } = await load();
    await expect(currentUserStrict()).rejects.toThrow('Failed to fetch');
  });

  it('🔴 이 구분이 핵심이다 — 오류와 비로그인이 서로 다른 결과여야 한다', async () => {
    sessionResult = NO_SESSION;
    const a = await load();
    const loggedOut = await a.currentUserStrict();

    vi.resetModules();
    sessionResult = READ_FAILED;
    const b = await load();
    const failed = await b.currentUserStrict().then(() => 'resolved' as const, () => 'threw' as const);

    expect(loggedOut).toBeNull();
    expect(failed, '오류가 비로그인과 같은 결과로 나왔다').toBe('threw');
  });
});

describe('currentUser — 기존 계약은 그대로다 (호출부 67곳)', () => {
  it('오류여도 던지지 않고 null 이다 — 대부분의 호출부는 "비로그인이면 건너뛴다"가 맞다', async () => {
    sessionResult = READ_FAILED;
    const { currentUser } = await load();
    await expect(currentUser()).resolves.toBeNull();
  });

  it('정상 세션은 동일하게 동작한다', async () => {
    sessionResult = SESSION;
    const { currentUser } = await load();
    await expect(currentUser()).resolves.toEqual({ id: 'user-1' });
  });
});

describe('토큰을 지우지 않는다', () => {
  it('일시 오류 경로에서 저장소를 비우지 않는다 — 회복 가능한 상황을 확정 로그아웃으로 만들지 않는다', async () => {
    // `_session.ts` 는 저장소를 건드리는 코드를 갖지 않아야 한다.
    // (무효 세션 정리는 SDK 와 명시적 로그아웃 경로가 맡는다.)
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src/api/_session.ts'), 'utf8');
    expect(src, '_session 이 저장소를 지운다 — 일시 오류에 토큰이 날아갈 수 있다')
      .not.toMatch(/clearAuthStorage|removeItem|localStorage\.clear/);
  });
});
