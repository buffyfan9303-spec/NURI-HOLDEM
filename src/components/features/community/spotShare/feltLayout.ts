// 게시판 SPOT 테이블 그림의 자리 계산 — 좌석은 시안 A 처럼 **타원 둘레**에, 보드는 좌석이 비운 자리에.
//
// 🔴 2026-10-01 독립 검토 FAIL: 좌석을 타원 각도(%)로만 놓았더니 보드가 4~5장(턴·리버)이면 위쪽 좌석 이름표가
//   보드 카드를 덮었다(320 피드 22.9×12.9px). 좌석 상자는 px(카드·이름표), 자리는 % 라 폭·보드 장수마다 어긋난다.
//   그래서 실제 상자 크기(px)를 재서 여기서 자리를 정한다:
//   ① 좌석 = 타원 둘레의 각도 자리(내 자리 아래 가운데, 시계 방향) — 테이블 폭 안으로 묶는다.
//   ② 좌석끼리 닿으면 덜 겹친 축으로 밀어낸다(내 자리는 고정).
//   ③ 보드 = 테이블 가운데에서 가까운 순으로 좌석과 닿지 않는 자리를 찾는다(보드가 넓으면 위·아래·옆으로 비켜 선다).
//   ④ 그래도 안 되면 테이블을 조금 키워 다시 한다(피드는 카드 높이가 그만큼 늘어난다).
// 🔴 2026-10-02 독립 검토 FAIL: ③이 '안 닿음'만 봐서 상대 3명(4-way)이면 보드가 타원 밖(위 테두리)이나
//   내 카드 옆으로 갔다(360 6인 4-way 플랍 — 손패가 5장처럼 읽힘). 이제 보드는 **그려진 타원 안 + 내 카드 위**여야
//   합격이고, 좌석이 가운데를 막으면 ⑤ 보드를 가운데에 먼저 세우고 좌석을 비켜 세운 배치도 같이 본다.
// 화면 회귀는 e2e/spot-felt-geometry.spec.ts(폭 × 보드 장수 × 상대 수 × 6·9인)가 잰다.

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
  /** 0 = 모든 제약 충족. 클수록 나쁘다(보드 등급 + 좌석이 안 풀리면 +10) — layoutFelt 가 높이를 고를 때 쓴다 */
  rank: number;
}

const GAP = 3;
const BOARD_GAP = 4.5;    // 좌석–보드 최소 간격 — 피드에서 0.6px 까지 붙었다(독립 검토 10-02). 서브픽셀 여유 0.5
const CENTER_TOL = 24;    // 보드가 가운데에서 이만큼까지 비켜도 '가운데'(검토 기준 30px 안)
export const OVAL_SIDE = 0.08;   // 타원 면의 좌우 여백(폭 비율) — SpotTable 이 같은 값을 인라인 style 로 쓴다(둘이 어긋날 수 없다)
const SEAT_OUT = 16;      // 좌석 가운데가 타원 둘레에서 이만큼 넘게 벗어나면 되돌린다(검토 기준 20px 안)
const SEAT_FAR = 18;      // 되돌린 뒤에도 이보다 멀면 그 높이는 탈락(rank +4) — 검토 기준 20px 에 2px 여유

type R = { x: number; y: number; w: number; h: number };
const hit = (a: R, b: R, gap = GAP) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;

function tryAt(inp: FeltIn, H: number, pinBoard: boolean): FeltOut {
  const { W, hero, board } = inp;
  const cx = W / 2;
  const cy = H * 0.48;
  const ax = W * 0.4;
  const ay = H * 0.36;
  // 1px 안쪽으로 — 상자 크기는 offsetWidth(정수 반올림)라 실제 폭이 0.5px 까지 더 넓다(360 피드 4-way 리버에서 0.5px 넘침 실측)
  const clampX = (x: number, w: number) => Math.min(Math.max(x, w / 2 + 1), W - w / 2 - 1);
  const clampY = (y: number, h: number) => Math.min(Math.max(y, h / 2), H - h / 2);

  const heroR: R = { x: cx, y: H - hero.h / 2, w: hero.w, h: hero.h };
  const heroTop = heroR.y - hero.h / 2;
  const ovalTop = cy - ay * 0.85;
  const ovalBottom = heroTop + inp.heroCardH * 0.55;
  const prefY = (ovalTop + ovalBottom) / 2;
  // ⑤ 보드를 가운데(내 카드 위)에 먼저 세운 배치 — 좌석이 이 상자를 비켜 선다
  const boardR: R = { x: cx, y: Math.min(prefY, heroTop - BOARD_GAP - board.h / 2), w: board.w, h: board.h };
  const seats: (R & { key: string })[] = inp.seats.map((s) => ({
    key: s.key, w: s.box.w, h: s.box.h,
    x: clampX(cx + ax * Math.cos(s.angle), s.box.w),
    y: clampY(cy + ay * Math.sin(s.angle), s.box.h),
  }));

  // ② 좌석끼리·좌석과 내 자리(·세운 보드) 밀어내기
  const fixed = pinBoard ? [heroR, boardR] : [heroR];
  let clean = false;
  for (let it = 0; it < 60 && !clean; it++) {
    clean = true;
    for (let i = 0; i < seats.length; i++) {
      const a = seats[i];
      for (const b of [...seats.slice(i + 1), ...fixed]) {
        const gap = b === boardR ? BOARD_GAP + 0.5 : GAP;
        if (!hit(a, b, gap)) continue;
        clean = false;
        const ox = (a.w + b.w) / 2 + gap - Math.abs(a.x - b.x);
        const oy = (a.h + b.h) / 2 + gap - Math.abs(a.y - b.y);
        const fixedB = fixed.includes(b);
        const share = fixedB ? 1 : 0.5;
        const push = (axis: 'x' | 'y') => {
          const d = ((axis === 'x' ? ox : oy) * share + 0.5) * (a[axis] < b[axis] ? -1 : 1);
          if (axis === 'x') { a.x = clampX(a.x + d, a.w); if (!fixedB) b.x = clampX(b.x - d, b.w); }
          else { a.y = clampY(a.y + d, a.h); if (!fixedB) b.y = clampY(b.y - d, b.h); }
        };
        push(ox < oy ? 'x' : 'y');
        // 한쪽이 테이블 가장자리에 막혀 덜 밀렸으면 다른 축으로도 민다 — 안 그러면 셋이 한 줄에 끼어
        //   (9인 3-way: 왼쪽 끝 SB · BTN · 내 자리) 서로 되밀기만 하다 테이블을 키웠다(360 피드 카드 401~419px).
        if (hit(a, b, gap)) push(ox < oy ? 'y' : 'x');
      }
    }
  }

  // 타원 면은 rounded-full 상자(스타디움) — 반지름 = 짧은 변의 절반. 둘레까지의 거리(밖 +, 안 −)
  const oHalfW = W * (0.5 - OVAL_SIDE), oHalfH = (ovalBottom - ovalTop) / 2;
  const rr = Math.min(oHalfW, oHalfH), ocy = ovalTop + oHalfH;
  const edgeDist = (x: number, y: number) =>
    Math.hypot(Math.max(Math.abs(x - cx) - (oHalfW - rr), 0), Math.max(Math.abs(y - ocy) - (oHalfH - rr), 0)) - rr;
  const inOval = (x: number, y: number) => edgeDist(x, y) <= -1;

  // ②-b 밀려서 둘레에서 멀어진 좌석을 둘레 쪽 빈자리로 되돌린다.
  //   🔴 2026-10-02 독립 검토(경미): 360 상세 8·9인 리버에서 빈 자리 SB·CO 가 위·옆 좌석과 보드에 밀려 타원 아래 37~41px,
  //   '나 BTN' 배지 옆까지 내려가 내 줄처럼 읽혔다. 둘레 ±SEAT_OUT 안에서 아무것과도 안 닿는 가장 가까운 자리로 옮긴다.
  //   못 찾으면 그대로 둔다(겹침 없는 쪽이 우선). 줄마다 둘레 띠(|거리| ≤ SEAT_OUT)에 드는 x 구간만 훑는다 —
  //   스타디움 거리는 |x − cx| 에 대해 단조라 구간이 닫힌 식으로 나온다(전체 격자를 훑으면 상세 9인 리버에서 6배 느렸다).
  const flatW = oHalfW - rr, flatH = oHalfH - rr;
  const span = (dy: number, d: number) => (d < 0 || dy >= d ? null : flatW + Math.sqrt(d * d - dy * dy));
  for (const s of seats) {
    // 좌석끼리 겹친 배치(rank ≥ 10)는 어차피 탈락이라 되돌리기를 건너뛴다
    if (!clean || edgeDist(s.x, s.y) <= SEAT_OUT) continue;
    const others: R[] = [...seats.filter((o) => o !== s), heroR, ...(pinBoard ? [boardR] : [])];
    let best = null as { x: number; y: number; d: number } | null;   // 클로저가 채운다(좁히기 방지)
    const look = (x: number, y: number) => {
      if (x < s.w / 2 + 1 || x > W - s.w / 2 - 1 || y < s.h / 2 || y > H - s.h / 2) return;
      if (Math.abs(edgeDist(x, y)) > SEAT_OUT) return;
      const r = { x, y, w: s.w, h: s.h };
      if (others.some((o) => hit(r, o, o === boardR ? BOARD_GAP + 0.5 : GAP))) return;
      const d = Math.hypot(x - s.x, y - s.y);
      if (!best || d < best.d) best = { x, y, d };
    };
    // 거칠게(6px) 훑고, 찾은 자리 둘레를 2px 로 다듬는다
    for (let y = s.h / 2; y <= H - s.h / 2 + 0.01; y += 6) {
      const dy = Math.max(Math.abs(y - ocy) - flatH, 0);
      const uMax = span(dy, rr + SEAT_OUT);
      if (uMax === null) continue;
      const uMin = span(dy, rr - SEAT_OUT) ?? 0;
      for (let u = uMin; u <= uMax + 0.01; u += 6) { look(cx - u, y); look(cx + u, y); }
    }
    const coarse = best;
    if (coarse) for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) look(coarse.x + dx, coarse.y + dy);
    if (best) { s.x = best.x; s.y = best.y; }
  }
  const far = seats.some((s) => edgeDist(s.x, s.y) > SEAT_FAR);

  // ③ 보드 — 가운데에서 가까운 순으로, 좌석·내 자리와 닿지 않는 자리를 등급으로 고른다:
  //   0 = 그려진 타원 안 + 내 카드 위 + 가운데(±CENTER_TOL) · 1 = 타원 안 + 내 카드 위(옆으로 치우침)
  //   · 2 = 안 닿기만 함(타원 밖·내 카드 줄 — 마지막 안전망).
  const maxDx = Math.max(0, W * (0.5 - OVAL_SIDE) - board.w / 2);
  const obstacles: R[] = [...seats, heroR];
  let best: { pt: Pt; cost: number; tier: number } | null = null;
  for (let dx = 0; dx <= maxDx + 0.01; dx += 4) {
    for (const sx of dx ? [1, -1] : [1]) {
      for (let y = board.h / 2; y <= H - board.h / 2 + 0.01; y += 2) {
        const r: R = { x: cx + sx * dx, y, w: board.w, h: board.h };
        if (obstacles.some((o) => hit(r, o, BOARD_GAP))) continue;
        const inside = y + board.h / 2 <= heroTop - GAP
          && [-1, 1].every((a) => [-1, 1].every((b) => inOval(r.x + (a * board.w) / 2, y + (b * board.h) / 2)));
        const tier = !inside ? 2 : dx <= CENTER_TOL ? 0 : 1;
        const cost = Math.abs(y - prefY) + dx * 1.5;
        if (!best || tier < best.tier || (tier === best.tier && cost < best.cost)) best = { pt: { x: r.x, y }, cost, tier };
      }
    }
  }
  return {
    H, hero: { x: heroR.x, y: heroR.y },
    seats: Object.fromEntries(seats.map((s) => [s.key, { x: s.x, y: s.y }])),
    board: best?.pt ?? { x: cx, y: prefY },
    ovalTop, ovalBottom,
    ok: clean && best?.tier === 0 && !far,
    // 둘레에서 벗어난 좌석이 남으면 +4 — 높이를 더 키운 배치를 계속 본다(못 찾으면 가장 나은 것)
    rank: (clean ? 0 : 10) + (best?.tier ?? 3) + (far ? 4 : 0),
  };
}

/**
 * 가장 낮은 높이부터 키우며 모든 제약(rank 0)을 찾는다. 좌석을 둘레 그대로 둔 배치를 먼저 보고(오너 '타원 둘레로'),
 * 보드를 가운데에 세운 배치(⑤ — 좌석이 각도 자리에서 비켜 선다)는 그보다 PIN_PENALTY 만큼 더 낮을 때만 고른다.
 *   실측 근거(320/360/390 × 8구성 × 보드 4 시뮬레이션): 0 이면 360 피드 6인 4-way 플랍에서 LJ 가 위 가운데를 비우고
 *   왼쪽으로 몰렸고, 72 면 상세 3-way 리버가 299→371px 로 길어졌다. 30 은 둘 다 피하고 9인 피드 카드 ≤ 365px.
 * 끝까지 없으면 가장 좋은 rank 가 처음 나온 배치.
 */
const PIN_PENALTY = 30;
export function layoutFelt(inp: FeltIn): FeltOut {
  let out: FeltOut | null = null;
  for (let H = inp.minH; H <= inp.maxH + PIN_PENALTY + 0.01; H += 6) {
    for (const pin of [false, true]) {
      const h = pin ? H - PIN_PENALTY : H;
      if (h < inp.minH || h > inp.maxH + 0.01) continue;
      const next = tryAt(inp, h, pin);
      if (!out || next.rank < out.rank) out = next;
      if (out.rank === 0) return out;
    }
  }
  return out ?? tryAt(inp, inp.minH, false);
}
