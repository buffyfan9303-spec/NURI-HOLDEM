// 게시판 SPOT 테이블 그림의 자리 계산 — 좌석은 시안 A 처럼 **타원 둘레**에, 보드는 좌석이 비운 자리에.
//
// 🔴 2026-10-01 독립 검토 FAIL: 좌석을 타원 각도(%)로만 놓았더니 보드가 4~5장(턴·리버)이면 위쪽 좌석 이름표가
//   보드 카드를 덮었다(320 피드 22.9×12.9px). 좌석 상자는 px(카드·이름표), 자리는 % 라 폭·보드 장수마다 어긋난다.
//   그래서 실제 상자 크기(px)를 재서 여기서 자리를 정한다:
//   ① 좌석 = 타원 둘레의 각도 자리(내 자리 아래 가운데, 시계 방향) — 테이블 폭 안으로 묶는다.
//   ② 좌석끼리 닿으면 덜 겹친 축으로 밀어낸다(내 자리는 고정).
//   ③ 보드 = 테이블 가운데에서 가까운 순으로 좌석과 닿지 않는 자리를 찾는다(보드가 넓으면 위·아래·옆으로 비켜 선다).
//   ④ 그래도 안 되면 테이블을 조금 키워 다시 한다(피드는 카드 높이가 그만큼 늘어난다).
// 화면 회귀는 e2e/spot-felt-geometry.spec.ts(폭 × 보드 장수 × 상대 수)가 잰다.

export interface Box { w: number; h: number }
export interface SeatIn { key: string; angle: number; box: Box }
export interface FeltIn {
  /** 테이블 폭(px) */
  W: number;
  /** 시작 높이 · 최대 높이(px) */
  minH: number;
  maxH: number;
  hero: Box;
  /** 내 카드 높이 — 타원 아래 테두리가 내 카드 가운데를 지나게 */
  heroCardH: number;
  seats: SeatIn[];
  board: Box;
}
/** 상자 가운데 좌표(px) */
export interface Pt { x: number; y: number }
export interface FeltOut {
  H: number;
  hero: Pt;
  seats: Record<string, Pt>;
  board: Pt;
  /** 그릴 타원 면의 위·아래(px) */
  ovalTop: number;
  ovalBottom: number;
  /** 모든 제약을 만족했는가(최대 높이까지 키워도 못 찾으면 false — 그래도 가장 나은 배치를 돌려준다) */
  ok: boolean;
}

const GAP = 3;
const OVAL_SIDE = 0.08;   // 타원 면의 좌우 여백(폭 비율)

type R = { x: number; y: number; w: number; h: number };
const hit = (a: R, b: R, gap = GAP) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;

function tryAt(inp: FeltIn, H: number): FeltOut {
  const { W, hero, board } = inp;
  const cx = W / 2;
  const cy = H * 0.48;
  const ax = W * 0.4;
  const ay = H * 0.36;
  const clampX = (x: number, w: number) => Math.min(Math.max(x, w / 2), W - w / 2);
  const clampY = (y: number, h: number) => Math.min(Math.max(y, h / 2), H - h / 2);

  const heroR: R = { x: cx, y: H - hero.h / 2, w: hero.w, h: hero.h };
  const seats: (R & { key: string })[] = inp.seats.map((s) => ({
    key: s.key, w: s.box.w, h: s.box.h,
    x: clampX(cx + ax * Math.cos(s.angle), s.box.w),
    y: clampY(cy + ay * Math.sin(s.angle), s.box.h),
  }));

  // ② 좌석끼리·좌석과 내 자리 밀어내기
  let clean = false;
  for (let it = 0; it < 60 && !clean; it++) {
    clean = true;
    for (let i = 0; i < seats.length; i++) {
      const a = seats[i];
      for (const b of [...seats.slice(i + 1), heroR]) {
        if (!hit(a, b)) continue;
        clean = false;
        const ox = (a.w + b.w) / 2 + GAP - Math.abs(a.x - b.x);
        const oy = (a.h + b.h) / 2 + GAP - Math.abs(a.y - b.y);
        const fixedB = b === heroR;
        const share = fixedB ? 1 : 0.5;
        if (ox < oy) {
          const d = (ox * share + 0.5) * (a.x < b.x ? -1 : 1);
          a.x = clampX(a.x + d, a.w);
          if (!fixedB) b.x = clampX(b.x - d, b.w);
        } else {
          const d = (oy * share + 0.5) * (a.y < b.y ? -1 : 1);
          a.y = clampY(a.y + d, a.h);
          if (!fixedB) b.y = clampY(b.y - d, b.h);
        }
      }
    }
  }

  // ③ 보드 — 타원 가운데에서 가까운 순으로, 좌석·내 자리와 닿지 않는 첫 자리
  const ovalTop = cy - ay * 0.85;
  const ovalBottom = heroR.y - hero.h / 2 + inp.heroCardH * 0.55;
  const prefY = (ovalTop + ovalBottom) / 2;
  const maxDx = Math.max(0, W * (0.5 - OVAL_SIDE) - board.w / 2);
  const obstacles: R[] = [...seats, heroR];
  let best: { pt: Pt; cost: number } | null = null;
  for (let dx = 0; dx <= maxDx + 0.01; dx += 4) {
    for (const sx of dx ? [1, -1] : [1]) {
      for (let y = board.h / 2; y <= H - board.h / 2 + 0.01; y += 2) {
        const r: R = { x: cx + sx * dx, y, w: board.w, h: board.h };
        if (obstacles.some((o) => hit(r, o))) continue;
        const cost = Math.abs(y - prefY) + dx * 1.5;
        if (!best || cost < best.cost) best = { pt: { x: r.x, y }, cost };
      }
    }
  }
  return {
    H, hero: { x: heroR.x, y: heroR.y },
    seats: Object.fromEntries(seats.map((s) => [s.key, { x: s.x, y: s.y }])),
    board: best?.pt ?? { x: cx, y: prefY },
    ovalTop, ovalBottom,
    ok: clean && !!best,
  };
}

export function layoutFelt(inp: FeltIn): FeltOut {
  let out = tryAt(inp, inp.minH);
  for (let H = inp.minH + 6; !out.ok && H <= inp.maxH; H += 6) out = tryAt(inp, H);
  return out;
}
