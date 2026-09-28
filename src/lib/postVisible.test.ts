// 차단·숨김 판정 계약 — 첫 페이지·서버 이어받기·검색·실시간 한 줄이 같은 함수를 쓴다(2026-09-29).
// 실행: npx vitest run src/lib/postVisible.test.ts
import { describe, it, expect } from 'vitest';
import { isAuthorShown, isPostVisible } from './postVisible';

const blocked = new Set(['bad']);
const isBlocked = (id?: string | null) => !!id && blocked.has(id);

describe('isAuthorShown', () => {
  it('차단한 사람은 숨기고 그 밖은 보인다', () => {
    expect(isAuthorShown('bad', isBlocked, 'me')).toBe(false);
    expect(isAuthorShown('ok', isBlocked, 'me')).toBe(true);
  });
  it('본인은 절대 가리지 않는다', () => {
    expect(isAuthorShown('bad', isBlocked, 'bad')).toBe(true);
  });
  it('비로그인(meId 없음)에서 undefined 작성자가 본인으로 오인되지 않는다', () => {
    expect(isAuthorShown(undefined, () => true, undefined)).toBe(false);
  });
});

describe('isPostVisible', () => {
  const v = { isBlocked, isAdmin: false, meId: 'me' };
  it('차단 글 숨김', () => expect(isPostVisible({ userId: 'bad' }, v)).toBe(false));
  it('blinded 글은 남에게 숨기고 작성자·운영자에게만 보인다', () => {
    expect(isPostVisible({ userId: 'ok', blinded: true }, v)).toBe(false);
    expect(isPostVisible({ userId: 'me', blinded: true }, v)).toBe(true);
    expect(isPostVisible({ userId: 'ok', blinded: true }, { ...v, isAdmin: true })).toBe(true);
  });
  it('보통 글은 보인다', () => expect(isPostVisible({ userId: 'ok' }, v)).toBe(true));
});
