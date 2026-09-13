// 직원 권한 토글 다섯 상태 판정 (P02, 2026-09-13).
// 실행: npx vitest run src/lib/staffAccess.test.ts
import { describe, it, expect } from 'vitest';
import { accessViewOf, canToggleAccess, accessLabel, accessLoadFailedMsg, ACCESS_LOAD_FAILED_MSG, ACCESS_LOAD_DENIED_MSG, type AccessLoad } from './staffAccess';

const none = new Set<string>();
const ready = (ids: string[]): AccessLoad => ({ status: 'ready', ids });

describe('accessViewOf — 다섯 상태를 갈라 말한다', () => {
  it('확인 중', () => { expect(accessViewOf({ status: 'loading' }, none, 'u1')).toBe('checking'); });
  it('🔴 확인 실패는 "미부여" 가 아니다 — 예전엔 조회 실패가 [] 가 되어 ungranted 로 보였다', () => {
    expect(accessViewOf({ status: 'error', error: { code: '42501' } }, none, 'u1')).toBe('failed');
  });
  it('부여 / 미부여 — 실제 0건([])은 정직한 미부여다', () => {
    expect(accessViewOf(ready(['u1']), none, 'u1')).toBe('granted');
    expect(accessViewOf(ready(['u1']), none, 'u2')).toBe('ungranted');
    expect(accessViewOf(ready([]), none, 'u1')).toBe('ungranted');
  });
  it('변경 중은 조회 상태보다 우선한다(저장 중 재조회가 겹쳐도 버튼이 흔들리지 않게)', () => {
    const changing = new Set(['u1']);
    expect(accessViewOf(ready(['u1']), changing, 'u1')).toBe('changing');
    expect(accessViewOf({ status: 'loading' }, changing, 'u1')).toBe('changing');
    expect(accessViewOf({ status: 'error', error: null }, changing, 'u1')).toBe('changing');
    expect(accessViewOf(ready(['u1']), changing, 'u2'), '다른 직원은 영향 없음').toBe('ungranted');
  });
});

describe('canToggleAccess — 모르는 채로는 저장하지 않는다', () => {
  it('🔴 확인 실패·확인 중·변경 중에는 false', () => {
    expect(canToggleAccess('failed')).toBe(false);
    expect(canToggleAccess('checking')).toBe(false);
    expect(canToggleAccess('changing')).toBe(false);
  });
  it('반대편 절반 — 부여·미부여는 토글할 수 있다(권한 기능이 사라지면 안 된다)', () => {
    expect(canToggleAccess('granted')).toBe(true);
    expect(canToggleAccess('ungranted')).toBe(true);
  });
});

describe('accessLabel — 글귀', () => {
  it('부여/미부여 글귀는 종전 화면 그대로(기능·e2e 셀렉터 보존)', () => {
    expect(accessLabel('ledger', 'granted')).toBe('장부·순위 권한 ✓');
    expect(accessLabel('ledger', 'ungranted')).toBe('장부·순위 권한 없음');
    expect(accessLabel('voucher', 'granted')).toBe('이용권내역 ✓');
    expect(accessLabel('voucher', 'ungranted')).toBe('이용권내역 ✗');
  });
  it('확인 실패 글귀는 "없음"·"✗" 을 쓰지 않고 다음 행동을 말한다', () => {
    for (const k of ['ledger', 'voucher'] as const) {
      const s = accessLabel(k, 'failed');
      expect(s).not.toMatch(/없음|✗/);
      expect(s).toMatch(/다시 시도/);
      expect(accessLabel(k, 'checking')).toMatch(/확인 중/);
      expect(accessLabel(k, 'changing')).toMatch(/변경 중/);
    }
    expect(ACCESS_LOAD_FAILED_MSG).toBe('권한을 불러오지 못했어요. 다시 시도해 주세요.');
  });
  it('🔴 42501/403 은 "다시 시도" 가 아니라 계정 안내다 — 그 밖의 실패는 재시도 안내(nuri-async-guard 부류 2)', () => {
    expect(accessLoadFailedMsg({ code: '42501', message: 'permission denied' })).toBe(ACCESS_LOAD_DENIED_MSG);
    expect(accessLoadFailedMsg({ status: 403 })).toBe(ACCESS_LOAD_DENIED_MSG);
    expect(ACCESS_LOAD_DENIED_MSG).not.toMatch(/다시 시도/);
    expect(accessLoadFailedMsg({ message: 'Failed to fetch' })).toBe(ACCESS_LOAD_FAILED_MSG);
    expect(accessLoadFailedMsg(null)).toBe(ACCESS_LOAD_FAILED_MSG);
  });
  // P02 재작업(2026-09-13): 이 RPC 들은 인가를 WHERE 절로 표현해 42501 을 만들 수 없다 — 실제로 나는 것은 PGRST301·PGRST202·네트워크다.
  it('🔴 PGRST301(세션 만료)은 "다시 시도" 가 아니라 재로그인 안내다 — msgOf 와 같은 문장', () => {
    expect(accessLoadFailedMsg({ code: 'PGRST301', message: 'JWT expired' })).toBe('로그인이 만료되었습니다. 다시 로그인해 주세요');
    expect(accessLoadFailedMsg({ code: 'PGRST301', message: 'JWT expired' })).not.toMatch(/다시 시도/);
    // 구버전 서버(PGRST202)·네트워크는 재시도 안내(새로고침·재시도가 답이다)
    expect(accessLoadFailedMsg({ code: 'PGRST202', message: 'Could not find the function' })).toBe(ACCESS_LOAD_FAILED_MSG);
  });
});
