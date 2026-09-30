// 신고 → 제재 연결(점검 A-07, 2026-10-01): 신고 행에서 제재할 '작성자'를 어떻게 정하는가
// 실행: npx vitest run src/api/reports.reportedUser.test.ts
import { describe, it, expect } from 'vitest';
import { reportedUserId } from './reports';

describe('reportedUserId', () => {
  it('글·댓글·매물·실시간 신고는 저장된 작성자(targetOwnerId)', () => {
    for (const targetType of ['post', 'comment', 'listing', 'live']) {
      expect(reportedUserId({ targetType, targetId: 'x1', targetOwnerId: 'u9' })).toBe('u9');
    }
  });
  it('회원 신고는 대상 id 자체', () => {
    expect(reportedUserId({ targetType: 'user', targetId: 'u7', targetOwnerId: undefined })).toBe('u7');
  });
  it('작성자를 모르면 null — 제재 버튼을 그리지 않는다', () => {
    expect(reportedUserId({ targetType: 'post', targetId: 'x1', targetOwnerId: undefined })).toBeNull();
    expect(reportedUserId({ targetType: 'user', targetId: undefined, targetOwnerId: 'u9' })).toBeNull();
  });
});
