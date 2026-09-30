// 점검 A-08 — 관리자 소유 매장이 '업주: 미지정'으로 보이던 결함
// 실행: npx vitest run src/lib/adminVenueOwner.test.ts
import { describe, it, expect } from 'vitest';
import { ownerChoices, ownerDisplayName } from './adminVenueOwner';
import type { User } from '../api/auth';

const u = (id: string, role: string, nickname?: string): User =>
  ({ id, role, name: `이름${id}`, nickname, email: `${id}@x.kr` }) as unknown as User;
const admin = u('a1', 'admin', '운영자');
const owner = u('o1', 'venue_owner', '사장님');
const all = [admin, owner, u('m1', 'user', '회원')];
const candidates = all.filter((x) => x.role !== 'admin');   // AdminTab 의 후보 규칙 그대로

describe('ownerDisplayName', () => {
  it('🔴 관리자가 업주인 매장은 미지정이 아니라 그 관리자 이름', () => {
    expect(ownerDisplayName('a1', all)).toBe('운영자');
  });
  it('업주 id 가 없으면 미지정 · 있는데 목록에 없으면 확인 불가(미지정으로 위장하지 않는다)', () => {
    expect(ownerDisplayName(undefined, all)).toBe('미지정');
    expect(ownerDisplayName('zz', all)).toContain('확인 불가');
  });
});

describe('ownerChoices', () => {
  it('🔴 현재 업주가 후보에 없어도(관리자) 선택 목록 맨 앞에 들어 있다', () => {
    const c = ownerChoices(candidates, all, 'a1');
    expect(c[0].id).toBe('a1');
    expect(c[0].label).toContain('관리자');
    expect(c.length).toBe(candidates.length + 1);
  });
  it('현재 업주가 후보에 있으면 중복 없이 그대로', () => {
    const c = ownerChoices(candidates, all, 'o1');
    expect(c.filter((x) => x.id === 'o1')).toHaveLength(1);
    expect(c.length).toBe(candidates.length);
  });
  it('업주 미지정이면 후보만', () => {
    expect(ownerChoices(candidates, all, undefined)).toHaveLength(candidates.length);
  });
  it('현재 업주가 회원 목록에 아예 없으면 그 사실을 적은 항목을 넣는다(선택값이 빈 칸으로 바뀌지 않게)', () => {
    const c = ownerChoices(candidates, all, 'zz');
    expect(c[0]).toMatchObject({ id: 'zz' });
    expect(c[0].label).toContain('목록에 없음');
  });
});
