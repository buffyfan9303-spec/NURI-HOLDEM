// 🔴 2026-09-21 — 뮤테이션 생존자 잠그기. 둘 다 `=== true` 한 줄인데 **아무 테스트도 안 보고 있었다.**
//
// ① `checkNicknameAvailable` 의 `return data === true;`
//    RPC 응답이 **정확히 true** 일 때만 '사용 가능' 이다. 뒤집히면 **이미 쓰는 닉네임이 사용 가능으로** 뜬다
//    (그대로 가입을 시도하면 서버 유니크 제약에서 막혀, 손님에게는 '되는 줄 알았는데 안 되는' 화면이 된다).
// ② `getMyLegalConsents` 의 `terms/privacy/antiGambling/marketing: r.* === true`
//    이 기록은 파일 주석이 적듯 **분쟁 시 증거**다. 뒤집히면 동의 여부가 통째로 반전된다.
//    DB 가 null·문자열 'true'·1 을 돌려줘도 **동의로 세면 안 된다** — 그게 `=== true` 를 쓰는 이유다.
//
// 두 함수 모두 세션을 타지 않아 supabase 만 목킹하면 실제 경로를 그대로 지난다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let rpcResult: unknown = true;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let consentRows: any[] = [];
const rpcCalls: { fn: string; args?: Record<string, unknown> }[] = [];

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  setKeepSignedIn: () => {},
  clearAuthStorage: () => {},
  supabase: {
    auth: { onAuthStateChange: () => {} },
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: rpcResult, error: null };
    },
    from: () => {
      // from().select().order().limit() → { data, error }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: consentRows, error: null }),
      };
      return chain;
    },
  },
}));

const auth = await import('./auth');

beforeEach(() => { rpcCalls.length = 0; });

describe('checkNicknameAvailable — 정확히 true 일 때만 사용 가능', () => {
  it.each([
    [true, true],
    [false, false],
    ['true', false],   // 🔴 문자열은 동의가 아니다
    [1, false],
    [null, false],
    [undefined, false],
  ])('RPC 가 %s 를 돌려주면 → %s', async (given, want) => {
    rpcResult = given;
    expect(await auth.checkNicknameAvailable('쓸만한닉')).toBe(want);
  });

  it('두 글자 미만은 서버에 묻지도 않는다(호출 0회)', async () => {
    rpcResult = true;
    expect(await auth.checkNicknameAvailable('가')).toBe(false);
    expect(await auth.checkNicknameAvailable('  ')).toBe(false);
    expect(rpcCalls.length, '짧은 닉네임으로 서버를 불렀다').toBe(0);
  });

  it('전제: 정상 닉네임은 실제로 RPC 를 탄다(목킹이 걸렸다는 증거)', async () => {
    rpcResult = true;
    await auth.checkNicknameAvailable('  여백있는닉  ');
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].fn).toBe('is_nickname_available');
    expect(rpcCalls[0].args, '앞뒤 공백을 지우고 물어야 한다').toMatchObject({ p_nickname: '여백있는닉' });
  });
});

describe('getMyLegalConsents — 동의 플래그는 정확히 true 일 때만 true (분쟁 증거)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'c1', legal_version: 2, agreed_at: '2026-09-01T00:00:00Z', source: 'signup',
    agreed_to_terms: true, agreed_to_privacy: true, agreed_to_anti_gambling: true, agreed_to_marketing: false,
    ...over,
  });

  it('true 만 true 다 — null·false·문자열·숫자는 전부 false', async () => {
    consentRows = [
      row({ id: 'a', agreed_to_terms: true }),
      row({ id: 'b', agreed_to_terms: false }),
      row({ id: 'c', agreed_to_terms: null }),
      row({ id: 'd', agreed_to_terms: 'true' }),
      row({ id: 'e', agreed_to_terms: 1 }),
    ];
    const out = await auth.getMyLegalConsents();
    expect(out.map((x) => [x.id, x.terms]),
      '동의 플래그가 반전되거나 느슨해졌다 — 이 기록은 분쟁 시 증거다')
      .toEqual([['a', true], ['b', false], ['c', false], ['d', false], ['e', false]]);
  });

  it('네 플래그가 각각 독립이다(하나가 다른 하나를 덮지 않는다)', async () => {
    consentRows = [row({
      agreed_to_terms: true, agreed_to_privacy: false,
      agreed_to_anti_gambling: null, agreed_to_marketing: true,
    })];
    const [c] = await auth.getMyLegalConsents();
    expect({ terms: c.terms, privacy: c.privacy, antiGambling: c.antiGambling, marketing: c.marketing })
      .toEqual({ terms: true, privacy: false, antiGambling: false, marketing: true });
  });

  it('전제: 목킹한 행이 실제로 매핑을 통과해 나온다', async () => {
    consentRows = [row()];
    const out = await auth.getMyLegalConsents();
    expect(out.length, '행이 0개면 위 검사들이 공허해진다').toBe(1);
    expect(out[0].legalVersion).toBe(2);
    expect(out[0].agreedAt).toBe('2026-09-01T00:00:00Z');
  });
});
