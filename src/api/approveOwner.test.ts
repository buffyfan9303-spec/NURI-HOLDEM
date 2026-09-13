// 관리자 업주 승인 — 실패가 새지 않는가 (결함 B).
//
// 실제로 났던 일 (두 겹):
//   ① `profiles.approved` 업데이트에 `.select()` 가 없어, PostgREST 가 **RLS 거부·대상 없음을
//      `error` 없이 0행 200** 으로 돌려주는데도 성공으로 통과했다.
//      바로 위 `updateUserStatus` 의 주석이 그 함정을 경고하는데 이 함수만 안 따르고 있었다.
//   ② `venues.approved` 업데이트는 `{ error }` 구조분해조차 없어 **오류가 통째로 버려졌다.**
//
//   남던 상태: 회원 `approved=true` · 매장 `approved=false`.
//   업주는 로그인되는데 **매장이 홈·검색에 안 뜬다.** 관리자 화면과 통계는 '승인됨' 으로 보여서
//   아무도 이상을 모르고, 업주만 "승인됐다는데 왜 안 보이죠" 를 겪는다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Step { error: unknown }
let profilesStep: Step;
let venuesStep: Step;
let venuesCalled: boolean;

/**
 * `.from(t).update(v).eq(c,v)[.select().single()]` 사슬을 흉내 낸다.
 *
 * ⚠ **`.select()` 를 타는지 여부가 결과를 바꿔야 한다.** 이게 이 mock 의 핵심이다.
 *   PostgREST 는 `.select()` 없이 UPDATE 하면 **RLS 로 0행이 걸려도 `error: null` 로 200** 을 준다 —
 *   그래서 `.select().single()` 이 없으면 거부를 감지할 방법이 아예 없다.
 *   mock 이 이 차이를 표현하지 않으면 `.select()` 를 지워도 테스트가 통과해,
 *   **정작 더 위험한 쪽(①)에 회귀 방지가 없는 상태**가 된다(2026-09-12 verifier 지적).
 */
function makeFrom() {
  return (table: string) => {
    const step = table === 'profiles' ? profilesStep : venuesStep;
    if (table === 'venues') venuesCalled = true;
    const eqResult = {
      // `.select().single()` 을 탄 경우에만 거부가 error 로 드러난다.
      select: () => ({ single: () => Promise.resolve({ data: step.error ? null : { id: 'u1' }, error: step.error }) }),
      // `.select()` 없이 그대로 await 한 경우 — PostgREST 는 0행이어도 `error: null` 200 이다.
      // 즉 **여기서는 거부가 보이지 않는다.** 실제 서버와 같은 맹점을 mock 도 그대로 갖는다.
      then: (res: (v: { error: unknown }) => unknown) =>
        Promise.resolve({ error: table === 'profiles' ? null : step.error }).then(res),
    };
    return { update: () => ({ eq: () => eqResult }) };
  };
}

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { from: (t: string) => makeFrom()(t), auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) } },
}));

const load = async () => await import('./auth');

beforeEach(() => {
  vi.resetModules();
  profilesStep = { error: null };
  venuesStep = { error: null };
  venuesCalled = false;
});

describe('approveOwner — 절반만 된 것을 성공이라 말하지 않는다', () => {
  it('둘 다 성공하면 조용히 끝난다', async () => {
    const { approveOwner } = await load();
    await expect(approveOwner('u1', true)).resolves.toBeUndefined();
    expect(venuesCalled, '매장 승인을 아예 시도하지 않았다').toBe(true);
  });

  it('🔴 profiles 가 RLS 로 거부되면 던진다 — 0행 200 을 성공으로 넘기지 않는다', async () => {
    // PostgREST 는 RLS 거부·대상 없음을 `.single()` 에서 PGRST116 으로 준다.
    profilesStep = { error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
    const { approveOwner } = await load();
    await expect(approveOwner('u1', true)).rejects.toBeTruthy();
    expect(venuesCalled, 'profiles 가 실패했는데 매장까지 건드렸다').toBe(false);
  });

  it('🔴 venues 가 실패하면 부분 성공으로 던진다 — 조용히 삼키지 않는다', async () => {
    venuesStep = { error: new Error('permission denied for table venues') };
    const { approveOwner, OwnerApprovalPartialError } = await load();
    await expect(approveOwner('u1', true)).rejects.toBeInstanceOf(OwnerApprovalPartialError);
  });

  it('부분 성공 오류는 무엇을 해야 하는지 말한다 — 다시 눌러 이어서 끝낼 수 있다', async () => {
    venuesStep = { error: new Error('boom') };
    const { approveOwner } = await load();
    await expect(approveOwner('u1', true)).rejects.toThrow(/다시 눌러/);
  });

  it('부분 성공 오류는 원인을 들고 있다 — 로그에서 추적 가능해야 한다', async () => {
    const cause = new Error('permission denied');
    venuesStep = { error: cause };
    const { approveOwner, OwnerApprovalPartialError } = await load();
    await approveOwner('u1', true).then(
      () => { throw new Error('던지지 않았다'); },
      (e: unknown) => {
        expect(e).toBeInstanceOf(OwnerApprovalPartialError);
        expect((e as InstanceType<typeof OwnerApprovalPartialError>).cause).toBe(cause);
      },
    );
  });

  it('승인 해제(approve=false)는 매장을 건드리지 않는다 — 기존 동작 유지', async () => {
    const { approveOwner } = await load();
    await expect(approveOwner('u1', false)).resolves.toBeUndefined();
    expect(venuesCalled).toBe(false);
  });

  it('매장이 아직 없어 0행이어도 실패가 아니다 — 행 수가 아니라 오류만 본다', async () => {
    venuesStep = { error: null };   // 0행이지만 error 는 없다
    const { approveOwner } = await load();
    await expect(approveOwner('u1', true)).resolves.toBeUndefined();
  });
});
