// F4(2026-09-28 critical-reviewer) — 그룹 화면의 '+ 이미지'·'+ 공지'·공지 '삭제' 는 서버 정책과 같은 사람에게만 보인다.
// 서버(pg_policies 실측 2026-09-28): venue_notices_insert = 관리자·개설자 / venue_notices_delete = 관리자·작성자·개설자 / venues_update = 개설자·관리자.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./GroupPage.tsx', import.meta.url), 'utf-8');
function gateBefore(marker: string): string {
  const at = src.lastIndexOf(marker); // 머리 주석에도 같은 낱말이 있다 — 마지막(=마크업) 것을 본다
  expect(at, `${marker} 없음`).toBeGreaterThan(0);
  const head = src.slice(Math.max(0, at - 700), at);
  const gates = [...head.matchAll(/\{\s*(\(?[^{}]*?\)?)\s*&&/g)];
  return gates.length ? gates[gates.length - 1][1].replace(/\s+/g, ' ').trim() : '';
}
describe('F4 · 그룹 공지·이미지 버튼은 서버가 받는 사람에게만', () => {
  it("'+ 이미지' 는 isOwner", () => { expect(gateBefore('+ 이미지')).toBe('isOwner'); });
  it("'+ 공지' 는 isOwner", () => { expect(gateBefore('+ 공지</button>')).toBe('isOwner'); });
  it("공지 '삭제' 는 isOwner 또는 작성자", () => { expect(gateBefore('<button type="button" onClick={() => deleteVenueNotice(n.id)')).toBe('(isOwner || n.authorId === user?.id)'); });
  it('isOwner = 관리자 또는 개설자', () => { expect(src).toMatch(/const isOwner = !!group && \(isAdmin \|\| group\.ownerId === user\?\.id\);/); });
});
