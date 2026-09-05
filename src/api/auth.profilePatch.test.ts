// 프로필 패치 빌더 — '사진 제거'(avatarUrl: null) 가 avatar_url = NULL 로 실려야 한다(모바일 점검 #4).
// undefined 는 '변경 없음' 이라 빠지고, null 은 '지운다' 라 남는다 — 둘을 뭉개면
// '저장됨' 토스트 뒤에도 지운 사진이 그대로 남는다.
// 실행: npx vitest run src/api/auth.profilePatch.test.ts
import { describe, it, expect } from 'vitest';
import { profilePatchToRow } from './auth';

describe('profilePatchToRow — undefined 는 빠지고 null 은 실린다', () => {
  it('사진 제거(null) 는 avatar_url: null 로 남는다', () => {
    expect(profilePatchToRow({ avatarUrl: null })).toEqual({ avatar_url: null });
  });
  it('undefined 필드는 패치에서 빠진다', () => {
    expect(profilePatchToRow({ name: 'n', avatarColor: '#FFD100' })).toEqual({ name: 'n', avatar_color: '#FFD100' });
    expect(profilePatchToRow({})).toEqual({});
  });
});
