// 관리자 제재 — **저장과 메일 전달은 다른 사건**이다 (결함 A의 절반).
//
// 실제로 났던 일:
//   `updateUserStatus` 가 메일 실패를 `console.warn` 으로만 삼켰다. 그래서 화면은 언제나
//   "영구 정지 · 안내 메일 발송" 이라고 단정했다 — RESEND 미설정·함수 미배포면
//   **메일이 안 갔는데 갔다고 말한 것**이다. 운영자는 회원이 사유를 통보받았다고 믿는다.
//
//   상태 변경 자체는 메일과 무관하게 성공이어야 하므로 **던지지는 않는다.**
//   대신 결과를 돌려주고, 화면이 갔을 때만 "발송" 이라고 말한다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let profileError: unknown = null;
let invokeImpl: () => Promise<{ data: unknown }> = () => Promise.resolve({ data: { sent: true } });

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  setKeepSignedIn: () => {},
  clearAuthStorage: () => {},
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) },
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({ single: () => Promise.resolve({ data: profileError ? null : { id: 'u1' }, error: profileError }) }),
        }),
      }),
    }),
    functions: { invoke: () => invokeImpl() },
  },
}));

const load = async () => await import('./auth');

beforeEach(() => {
  vi.resetModules();
  profileError = null;
  invokeImpl = () => Promise.resolve({ data: { sent: true } });
});

describe('updateUserStatus — 메일 결과를 돌려준다', () => {
  it('메일이 실제로 갔으면 mailSent=true', async () => {
    const { updateUserStatus } = await load();
    await expect(updateUserStatus('u1', 'banned', undefined, '사유')).resolves.toEqual({ mailSent: true });
  });

  it('🔴 RESEND 미설정 등으로 {sent:false} 면 mailSent=false — 갔다고 말하지 않는다', async () => {
    invokeImpl = () => Promise.resolve({ data: { sent: false, error: 'RESEND_API_KEY 없음' } });
    const { updateUserStatus } = await load();
    await expect(updateUserStatus('u1', 'banned', undefined, '사유')).resolves.toEqual({ mailSent: false });
  });

  it('🔴 함수가 미배포라 예외가 나도 상태 변경은 성공이다 — 다만 mailSent=false', async () => {
    invokeImpl = () => Promise.reject(new Error('Function not found'));
    const { updateUserStatus } = await load();
    await expect(updateUserStatus('u1', 'suspended', undefined, '사유')).resolves.toEqual({ mailSent: false });
  });

  it('메일 대상이 아닌 변경(활성화)은 mailSent=null — false 와 구분한다', async () => {
    const { updateUserStatus } = await load();
    await expect(updateUserStatus('u1', 'active')).resolves.toEqual({ mailSent: null });
  });

  it('강제 탈퇴도 메일 대상이다', async () => {
    const { updateUserStatus } = await load();
    await expect(updateUserStatus('u1', 'withdrawn', undefined, '사유')).resolves.toEqual({ mailSent: true });
  });

  it('🔴 상태 저장이 실패하면 던진다 — 메일 여부와 무관하게 실패다', async () => {
    profileError = { code: 'PGRST116', message: 'no rows' };
    const { updateUserStatus } = await load();
    await expect(updateUserStatus('u1', 'banned', undefined, '사유')).rejects.toBeTruthy();
  });

  it('저장이 실패하면 메일을 아예 보내지 않는다 — 제재되지 않았는데 통보가 가면 안 된다', async () => {
    profileError = { code: 'PGRST116', message: 'no rows' };
    let invoked = false;
    invokeImpl = () => { invoked = true; return Promise.resolve({ data: { sent: true } }); };
    const { updateUserStatus } = await load();
    await updateUserStatus('u1', 'banned', undefined, '사유').catch(() => {});
    expect(invoked, '저장이 실패했는데 통보 메일을 보냈다').toBe(false);
  });
});
