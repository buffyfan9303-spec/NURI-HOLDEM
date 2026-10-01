// feltLayout — 좌석(타원 둘레)과 보드가 닿지 않고, 전부 테이블 폭 안에 선다. 보드는 그려진 타원 안 + 내 카드 위.
// 화면 전체 매트릭스는 e2e/spot-felt-geometry.spec.ts. 여기는 계산만 빠르게 잠근다(크기는 실화면에서 뜬 값).
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

/** 보드가 그려진 타원(SpotTable 의 inset-x-[8%] rounded-full = 스타디움) 안이고 내 카드 위인가 + 좌석과 4px 이상 */
function boardProblems(inp: FeltIn, out: FeltOut): string[] {
  const { W, board } = inp;
  const oL = W * 0.08, oR = W * 0.92, hw = (oR - oL) / 2, hh = (out.ovalBottom - out.ovalTop) / 2;
  const rr = Math.min(hw, hh), ocx = (oL + oR) / 2, ocy = out.ovalTop + hh;
  const outside = (x: number, y: number) =>
    Math.hypot(Math.max(Math.abs(x - ocx) - (hw - rr), 0), Math.max(Math.abs(y - ocy) - (hh - rr), 0)) - rr > 0.5;
  const bad: string[] = [];
  const b = out.board;
  for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (outside(b.x + (a * board.w) / 2, b.y + (c * board.h) / 2)) bad.push(`보드 모서리 ${a},${c} 타원 밖`);
  if (b.y + board.h / 2 > out.hero.y - inp.hero.h / 2) bad.push('보드 아래 끝이 내 카드 위끝보다 아래');
  for (const s of inp.seats) {
    const p = out.seats[s.key];
    const g = Math.hypot(Math.max(Math.abs(p.x - b.x) - (s.box.w + board.w) / 2, 0), Math.max(Math.abs(p.y - b.y) - (s.box.h + board.h) / 2, 0));
    if (g < 4) bad.push(`${s.key}–보드 간격 ${g.toFixed(1)}px`);
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
    expect(boardProblems(inp, out)).toEqual([]);
  });

  it('3인 — 왼쪽 위·아래 상대 둘이 서로·보드와 닿지 않는다', () => {
    const inp: FeltIn = { W: 260, minH: 150, maxH: 260, hero: { w: 67, h: 62 }, heroCardH: 44,
      board: { w: 142, h: 36 },
      seats: [{ key: 'BTN', angle: A(1), box: { w: 62, h: 68 } }, { key: 'SB', angle: A(2), box: { w: 62, h: 68 } }] };
    const out = layoutFelt(inp);
    expect(out.ok).toBe(true);
    expect(problems(inp, out)).toEqual([]);
    expect(boardProblems(inp, out)).toEqual([]);
  });

  // 🔴 2026-10-02 독립 검토 FAIL 판(360 피드 6인 4-way 플랍): 위쪽 상대 셋 사이에 틈이 없어 보드가 내 카드 오른쪽,
  //   타원 밖에 붙었다(손패 5장처럼 읽힘). 크기는 그 판의 실화면 값.
  it('6인 4-way 플랍(360 피드) — 보드는 타원 안·내 카드 위', () => {
    const inp: FeltIn = { W: 299, minH: 150, maxH: 260, hero: { w: 67, h: 62 }, heroCardH: 44, board: { w: 84, h: 36 },
      seats: [{ key: 'BB', angle: A(2), box: { w: 81, h: 54 } }, { key: 'LJ', angle: A(3), box: { w: 78, h: 54 } }, { key: 'HJ', angle: A(4), box: { w: 81, h: 54 } }] };
    const out = layoutFelt(inp);
    expect(out.ok).toBe(true);
    expect(problems(inp, out)).toEqual([]);
    expect(boardProblems(inp, out)).toEqual([]);
    expect(Math.abs(out.board.x - inp.W / 2)).toBeLessThanOrEqual(24);
  });

  it('9인 상대 5명 리버(320 상세) — 보드는 타원 안·내 카드 위', () => {
    const box = { w: 66, h: 75 };
    const inp: FeltIn = { W: 259, minH: 259, maxH: 259 * 1.5, hero: { w: 87, h: 76 }, heroCardH: 58, board: { w: 172, h: 44 },
      seats: [1, 2, 3, 6, 8].map((k, i) => ({ key: `S${i}`, angle: A(k, 9), box })) };
    const out = layoutFelt(inp);
    expect(out.ok).toBe(true);
    expect(problems(inp, out)).toEqual([]);
    expect(boardProblems(inp, out)).toEqual([]);
  });

  // 🔴 2026-10-02 독립 검토(경미, review-share-a3-1002.md §1): 360 상세 8인 상대 5명 리버에서 빈 자리 SB·CO 가
  //   타원 아래 41px('나 BTN' 옆)로 밀려 내 줄처럼 읽혔다. 상자 크기는 그 판의 실화면 값(geo.jsonl), 좌석 순서는 SpotTable 과 같다.
  it('8인 상대 5명 리버(360 상세) — 빈 자리 이름도 타원 둘레 20px 안', () => {
    const ring = ['SB', 'BB', 'UTG1', 'MP', 'LJ', 'HJ', 'CO'];   // BTN(나)에서 시계 방향
    const empty: Record<string, { w: number; h: number }> = { SB: { w: 23, h: 16 }, CO: { w: 26, h: 16 } };
    const inp: FeltIn = { W: 299, minH: 299, maxH: 299 * 1.5, hero: { w: 87, h: 94 }, heroCardH: 58, board: { w: 172, h: 44 },
      seats: ring.map((key, i) => ({ key, angle: A(i + 1, 8), box: empty[key] ?? { w: 66, h: 93 } })) };
    const out = layoutFelt(inp);
    expect(problems(inp, out)).toEqual([]);
    expect(boardProblems(inp, out)).toEqual([]);
    const hw = inp.W * 0.42, hh = (out.ovalBottom - out.ovalTop) / 2, rr = Math.min(hw, hh), ocy = out.ovalTop + hh;
    const dist = (p: { x: number; y: number }) =>
      Math.hypot(Math.max(Math.abs(p.x - inp.W / 2) - (hw - rr), 0), Math.max(Math.abs(p.y - ocy) - (hh - rr), 0)) - rr;
    const far = ring.map((k) => [k, Math.round(dist(out.seats[k]))] as const).filter(([, d]) => d > 20);
    expect(far).toEqual([]);
  });

  // 9인 3-way(왼쪽 끝 SB · BTN · 내 자리가 한 줄): 가장자리에 막힌 좌석이 서로 되밀기만 해 360 피드 카드가 401~419px 였다.
  it('9인 3-way 프리플랍(320 피드) — 테이블을 키우지 않고 풀린다', () => {
    const inp: FeltIn = { W: 259, minH: 150, maxH: 260, hero: { w: 67, h: 62 }, heroCardH: 44, board: { w: 57, h: 20 },
      seats: [{ key: 'BTN', angle: A(1, 9), box: { w: 58, h: 67 } }, { key: 'SB', angle: A(2, 9), box: { w: 57, h: 67 } }] };
    const out = layoutFelt(inp);
    expect(out.ok).toBe(true);
    expect(problems(inp, out)).toEqual([]);
    expect(boardProblems(inp, out)).toEqual([]);
    expect(out.H).toBeLessThanOrEqual(180);
  });
});
