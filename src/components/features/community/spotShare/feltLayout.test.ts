// feltLayout — 좌석(타원 둘레)과 보드가 닿지 않고, 전부 테이블 폭 안에 선다.
// 화면 전체 매트릭스는 e2e/spot-felt-geometry.spec.ts. 여기는 계산만 빠르게 잠근다(크기는 320 피드 실측 근사).
import { describe, expect, it } from 'vitest';
import { layoutFelt, type FeltIn, type FeltOut } from './feltLayout';

const A = (k: number, n = 6) => Math.PI / 2 + (k * 2 * Math.PI) / n;

function problems(inp: FeltIn, out: FeltOut): string[] {
  const rects = [
    { id: 'hero', ...out.hero, ...inp.hero },
    { id: 'board', ...out.board, ...inp.board },
    ...inp.seats.map((s) => ({ id: s.key, ...out.seats[s.key], ...s.box })),
  ];
  const bad: string[] = [];
  for (const r of rects) if (r.x - r.w / 2 < -0.5 || r.x + r.w / 2 > inp.W + 0.5) bad.push(`${r.id} 폭 밖`);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) bad.push(`${a.id}×${b.id}`);
  }
  return bad;
}

describe('layoutFelt', () => {
  it('HU 리버 — 위 왼쪽 상대(두 줄 이름표)와 보드 5장이 닿지 않는다', () => {
    const inp: FeltIn = { W: 260, minH: 150, maxH: 260, hero: { w: 67, h: 62 }, heroCardH: 44,
      board: { w: 142, h: 36 }, seats: [{ key: 'BB', angle: A(2), box: { w: 62, h: 68 } }] };
    const out = layoutFelt(inp);
    expect(out.ok).toBe(true);
    expect(problems(inp, out)).toEqual([]);
  });

  it('3인 — 왼쪽 위·아래 상대 둘이 서로·보드와 닿지 않는다', () => {
    const inp: FeltIn = { W: 260, minH: 150, maxH: 260, hero: { w: 67, h: 62 }, heroCardH: 44,
      board: { w: 142, h: 36 },
      seats: [{ key: 'BTN', angle: A(1), box: { w: 62, h: 68 } }, { key: 'SB', angle: A(2), box: { w: 62, h: 68 } }] };
    const out = layoutFelt(inp);
    expect(out.ok).toBe(true);
    expect(problems(inp, out)).toEqual([]);
  });
});
