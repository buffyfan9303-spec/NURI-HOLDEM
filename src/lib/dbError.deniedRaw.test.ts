// FULL-ERROR-SWEEP-A ⑤ (2026-09-25) — code 가 버려진 권한 거부 원문과 문맥별 권한 문장.
//   보안 탭 실측: api/auth.ts getMyLegalConsents 가 `new Error(error.message)` 로 감싸 code 가 사라졌고,
//   LoadErrorCard 가 'permission denied for table legal_consents' 를 그대로 그렸다(보안 표준 6번).
//   음성 대조: dbError.ts 의 DENIED_RAW 분기를 빼면 첫·둘째 검사가 빨개진다.
import { describe, it, expect, vi } from 'vitest';
import { isDenied, msgOf } from './dbError';

describe('dbError — code 없는 42501 원문', () => {
  it('🔴 감싸인 Error 의 원문만으로 권한 거부를 알아본다(isDenied)', () => {
    expect(isDenied(new Error('permission denied for table legal_consents'))).toBe(true);
    expect(isDenied(new Error('permission denied for function admin_list_event_campaigns'))).toBe(true);
    // 양성 대조 — 권한과 무관한 문장은 그대로 거짓
    expect(isDenied(new Error('이미 종료된 대회입니다'))).toBe(false);
  });

  it('🔴 msgOf 는 테이블 이름을 화면에 내지 않고 문맥(fallback) + 권한 문장으로 바꾼다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = msgOf(new Error('permission denied for table legal_consents'), '약관 동의 이력을 불러오지 못했습니다');
    expect(m).toBe('약관 동의 이력을 불러오지 못했습니다 — 이 계정에는 권한이 없습니다');
    expect(m).not.toMatch(/permission denied|legal_consents/);
    // 원문은 버리지 않는다 — 콘솔에만
    expect(warn).toHaveBeenCalledWith('[db]', '42501', 'permission denied for table legal_consents');
    warn.mockRestore();
  });

  it('42501 + 기본 fallback(문맥 없음) 은 권한 문장만 — 옛 고정 문구("매장 담당자")는 손님 화면에서 틀린 안내였다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(msgOf({ code: '42501', message: 'permission denied for table vouchers' })).toBe('이 계정에는 권한이 없습니다');
    expect(msgOf({ code: '42501', message: 'permission denied for table vouchers' }, '')).toBe('이 계정에는 권한이 없습니다');
    expect(msgOf({ code: '42501', message: 'permission denied for table vouchers' }, '이용권 발급 실패')).toBe('이용권 발급 실패 — 이 계정에는 권한이 없습니다');
    vi.restoreAllMocks();
  });

  it('양성 대조 — 우리가 쓴 문장(코드 없는 Error)은 그대로 보여 준다', () => {
    expect(msgOf(new Error('이미 종료된 대회입니다'), '저장 실패')).toBe('이미 종료된 대회입니다');
  });
});
