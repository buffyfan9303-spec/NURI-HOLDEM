// src/components/features/gto/equityEngine.ts
// 에퀴티 계산기 (Hero 2장 vs Villain 2장/레인지, 보드 0~5장)
// - 보드 3장 이상(잔여 ≤2장)은 전수계산, 그 외는 몬테카를로
import { RANKS, SUITS, type Card, type Rank } from './gto.types';

const RANK_VALUE: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  const vals = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]; // A..2
  RANKS.forEach((r, i) => { m[r] = vals[i]; });
  return m;
})();
const VALUE_RANK: Record<number, Rank> = (() => {
  const m: Record<number, Rank> = {};
  const vals = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  RANKS.forEach((r, i) => { m[vals[i]] = r; });
  return m;
})();

interface NCard { r: number; s: number; }
function toN(c: Card): NCard { return { r: RANK_VALUE[c.rank], s: SUITS.indexOf(c.suit) }; }
function toCard(c: NCard): Card { return { rank: VALUE_RANK[c.r], suit: SUITS[c.s] }; }
const keyOf = (c: NCard): number => c.r * 4 + c.s;

// 5장 점수(높을수록 강함). 카테고리*가중 + 타이브레이크(내림차순)
function score5(cs: NCard[]): number {
  const ranks = cs.map((c) => c.r).sort((a, b) => b - a);
  const flush = cs.every((c) => c.s === cs[0].s);
  const distinct = new Set(ranks);

  let straight = false;
  let sHigh = 0;
  if (distinct.size === 5) {
    if (ranks[0] - ranks[4] === 4) { straight = true; sHigh = ranks[0]; }
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) { straight = true; sHigh = 5; } // 휠 A2345
  }

  const freq = new Map<number, number>();
  ranks.forEach((r) => freq.set(r, (freq.get(r) ?? 0) + 1));
  const groups = [...freq.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  const counts = groups.map((g) => g[1]);
  const groupRanks = groups.map((g) => g[0]);

  let cat: number;
  if (straight && flush) cat = 8;
  else if (counts[0] === 4) cat = 7;
  else if (counts[0] === 3 && counts[1] === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straight) cat = 4;
  else if (counts[0] === 3) cat = 3;
  else if (counts[0] === 2 && counts[1] === 2) cat = 2;
  else if (counts[0] === 2) cat = 1;
  else cat = 0;

  let tb: number[];
  if (cat === 8 || cat === 4) tb = [sHigh];
  else if (cat === 5 || cat === 0) tb = ranks;
  else tb = groupRanks;

  // 타이브레이크는 항상 5칸으로 고정(부족분 0 패딩) → 카테고리가 항상 우선
  const tb5 = tb.slice(0, 5);
  while (tb5.length < 5) tb5.push(0);
  let v = cat;
  for (let i = 0; i < 5; i += 1) v = v * 15 + tb5[i];
  return v;
}

const COMBOS5: number[][] = (() => {
  const res: number[][] = [];
  for (let a = 0; a < 7; a += 1)
    for (let b = a + 1; b < 7; b += 1)
      for (let c = b + 1; c < 7; c += 1)
        for (let d = c + 1; d < 7; d += 1)
          for (let e = d + 1; e < 7; e += 1) res.push([a, b, c, d, e]);
  return res;
})();

function best7(seven: NCard[]): number {
  let best = -1;
  for (const idx of COMBOS5) {
    const s = score5([seven[idx[0]], seven[idx[1]], seven[idx[2]], seven[idx[3]], seven[idx[4]]]);
    if (s > best) best = s;
  }
  return best;
}

/**
 * 🔴 G2(2026-09-20) — **5·6·7장 공용** 최고 5장 점수.
 *
 * 왜 필요한가: `best7` 의 `COMBOS5` 는 인덱스 0~6 **고정**이다. 플랍의 현재 패는 2+3=5장,
 * 턴은 2+4=6장이라 그대로 넘기면 없는 인덱스를 읽는다. 그런데 "지금 누가 앞서는가" 는
 * **미래 지분과 전혀 다른 질문**이고(아래 `currentStanding` 주석의 반례), 그 답을 내려면
 * 5·6장을 평가할 수 있어야 한다.
 *
 * ⚠ 점수 정본은 `score5` 하나다 — 새 족보 로직을 만들지 않는다(두 벌이면 한쪽만 고쳐지는 날이 온다).
 *   5장이면 그대로, 6·7장이면 모든 5장 조합 중 최대를 쓴다.
 */
function bestOf(cs: NCard[]): number {
  const n = cs.length;
  if (n < 5 || n > 7) return -1;
  if (n === 5) return score5(cs);
  let best = -1;
  for (let a = 0; a < n; a += 1)
    for (let b = a + 1; b < n; b += 1)
      for (let c = b + 1; c < n; c += 1)
        for (let d = c + 1; d < n; d += 1)
          for (let e = d + 1; e < n; e += 1) {
            const s = score5([cs[a], cs[b], cs[c], cs[d], cs[e]]);
            if (s > best) best = s;
          }
  return best;
}

/** 지금 보드까지의 **현재 패 우열**. 미래 지분(`computeEquity`)과 다른 값이다. */
export type Standing = 'ahead' | 'behind' | 'tied';

/**
 * 🔴 G2 — **지금 이 순간** 누구의 패가 강한가. 남은 카드를 한 장도 보지 않는다.
 *
 * 무엇이 틀렸었나(외부 평가기 `phevaluator==0.6.0` 로 독립 재현):
 *   A♥K♥ 대 9♣9♦, 플랍 Q♥J♠2♥ — **현재는 9 페어가 앞선다**(랭크 6193 vs 4533, 낮을수록 강함).
 *   그런데 리버까지의 지분은 히어로 **63.23%**(990 런아웃 중 626승·0무·364패)다.
 *   화면은 `behind = eq.hero < 0.5` 로 판단해 "이미 내가 앞서 있습니다" 라고 **거짓 안내**했다.
 *   반대 방향 반례도 있다: 3♦8♦ 대 6♠7♣, 2♦J♣K♣2♣ — **현재는 히어로가 앞서는데**(6032 vs 6033)
 *   리버 44장 전수 지분은 **45.45%**(10승·20무·14패)다.
 *
 * 즉 '앞선다'와 '이길 확률이 높다'는 서로 다른 축이다. 둘을 한 숫자로 합치면 둘 다 거짓말이 된다.
 */
export function currentStanding(hero: [Card, Card], villain: [Card, Card], board: Card[]): Standing | null {
  if (board.length < 3 || board.length > 5) return null;
  if (hasDuplicateCards(hero, villain, board)) return null;
  const b = board.map(toN);
  const h = bestOf([...hero.map(toN), ...b]);
  const v = bestOf([...villain.map(toN), ...b]);
  if (h < 0 || v < 0) return null;
  return h > v ? 'ahead' : h < v ? 'behind' : 'tied';
}

/** 지정 키를 제외한 잔여 덱 생성 */
function buildDeck(excludeKeys: ReadonlySet<number>): NCard[] {
  const deck: NCard[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      const c: NCard = { r: RANK_VALUE[r], s: SUITS.indexOf(s) };
      if (!excludeKeys.has(keyOf(c))) deck.push(c);
    }
  }
  return deck;
}

/**
 * 같은 카드가 두 번 들어왔는가(그룹 안·그룹 사이 모두). 화면의 카드 선택기는 이걸 못 만들지만
 * 손으로 적은 `[[REPLAY:hero=As,As;…]]` 마커는 검증 없이 여기까지 온다 — 감사 2026-09-19: As·As 로
 * 아웃츠 44장/46장 같은 있을 수 없는 숫자가 확정처럼 나갔다. 엔진 진입부에서 막는다.
 */
export function hasDuplicateCards(...groups: readonly (readonly Card[])[]): boolean {
  const seen = new Set<number>();
  for (const g of groups) {
    for (const c of g) {
      const k = keyOf(toN(c));
      if (seen.has(k)) return true;
      seen.add(k);
    }
  }
  return false;
}

/**
 * 결과가 **어떻게 나온 값인지**. 숫자만 보면 전수 계산과 표본 추정과
 * "계산할 수 없었음"이 구분되지 않는다.
 */
export type EquityKind = 'exact' | 'monte_carlo' | 'no_legal_combinations';

export interface EquityResult {
  hero: number;
  villain: number;
  tie: number;
  iterations: number;
  /** 전수 계산인지 표본인지, 아니면 계산 불가였는지 */
  kind?: EquityKind;
  /** 실제로 집계에 들어간 표본(또는 전수 쌍) 수 */
  accepted?: number;
  /** 시도 횟수 — accepted 와 크게 벌어지면 기각률이 높다는 뜻이다 */
  attempts?: number;
}

/** 가중 콤보 — 레인지를 실제 카드 2장 조합으로 전개한 단위 (weight 0..1) */
export interface WeightedCombo {
  cards: [Card, Card];
  weight: number;
}

// 레인지 샘플링용 내부 표현: 숫자 카드 + 키 + 누적가중(이분탐색)
interface NWCombo { a: NCard; b: NCard; ka: number; kb: number; cum: number; }

/** 레인지 전처리 — 차단 카드(hero/보드)와 충돌하는 콤보 사전 제거 + 누적가중 계산 */
function prepareCombos(range: WeightedCombo[], blockedKeys: ReadonlySet<number>): { combos: NWCombo[]; total: number } {
  const combos: NWCombo[] = [];
  let total = 0;
  for (const wc of range) {
    if (wc.weight <= 0) continue;
    const a = toN(wc.cards[0]);
    const b = toN(wc.cards[1]);
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (blockedKeys.has(ka) || blockedKeys.has(kb)) continue;
    total += wc.weight;
    combos.push({ a, b, ka, kb, cum: total });
  }
  return { combos, total };
}

/**
 * xorshift32 — `seed` 를 주면 **재현 가능한** 난수열이고, 없으면 `Math.random` 이다.
 * 무작위 테스트가 어쩌다 실패하는 것을 막으려면 테스트가 seed 를 줘야 한다.
 */
function makeRng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x1_0000_0000;
  };
}

/** 누적가중 이분탐색으로 콤보 1개 가중 랜덤 샘플 */
function sampleCombo(combos: NWCombo[], total: number, rnd: () => number = Math.random): NWCombo {
  const r = rnd() * total;
  let lo = 0;
  let hi = combos.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (combos[mid].cum <= r) lo = mid + 1; else hi = mid;
  }
  return combos[lo];
}

const NEUTRAL: EquityResult = { hero: 0.5, villain: 0.5, tie: 0, iterations: 0 };

export function computeEquity(
  hero: [Card, Card],
  villain: [Card, Card],
  board: Card[],
  iterations = 2500,
): EquityResult {
  // 겹친 카드 = 존재할 수 없는 핸드. 0.5 로 위장하지 않고 '계산 못 함' 을 싣는다(computeEquityVsRange 와 같은 모양).
  if (hasDuplicateCards(hero, villain, board)) return { ...NEUTRAL, kind: 'no_legal_combinations', accepted: 0, attempts: 0 };
  const heroN = [toN(hero[0]), toN(hero[1])];
  const villN = [toN(villain[0]), toN(villain[1])];
  const boardN = board.map(toN);
  const knownKey = new Set([...heroN, ...villN, ...boardN].map(keyOf));
  const deck = buildDeck(knownKey);
  const need = 5 - boardN.length;

  let hw = 0; let vw = 0; let tie = 0; let total = 0;

  const judge = (full: NCard[]) => {
    const h = best7([...heroN, ...full]);
    const v = best7([...villN, ...full]);
    if (h > v) hw += 1; else if (v > h) vw += 1; else tie += 1;
    total += 1;
  };

  if (need <= 0) {
    // 리버: 단일 평가 (전수)
    judge(boardN);
  } else if (need === 1) {
    // 턴: 잔여 덱 전 장 루프 (전수)
    for (let i = 0; i < deck.length; i += 1) judge([...boardN, deck[i]]);
  } else if (need === 2) {
    // 플랍: 잔여 2장 전 조합(≈990) 루프 (전수) — 몬테카를로보다 정확하고 충분히 빠름
    for (let i = 0; i < deck.length; i += 1)
      for (let j = i + 1; j < deck.length; j += 1) judge([...boardN, deck[i], deck[j]]);
  } else {
    // 프리플랍/보드 1~2장: 몬테카를로
    for (let i = 0; i < iterations; i += 1) {
      // 부분 Fisher-Yates: 앞쪽 need 장만 랜덤 추출
      for (let k = 0; k < need; k += 1) {
        const j = k + Math.floor(Math.random() * (deck.length - k));
        const tmp = deck[k]; deck[k] = deck[j]; deck[j] = tmp;
      }
      judge([...boardN, ...deck.slice(0, need)]);
    }
  }

  return {
    hero: (hw + tie / 2) / total,
    villain: (vw + tie / 2) / total,
    tie: tie / total,
    iterations: total,
  };
}

/**
 * 멀티웨이 결과 (2026-09-19, NURI SPOT 빌런 A~E).
 * 팟이 하나(사이드팟 없음 — spot.ts 원장 규칙)라 '히어로가 최고 패인가' 와 공동 1등 분할(1/승자수)만 의미 있다.
 * 2등·3등은 세지 않는다 — 그 값으로 할 수 있는 말이 없다.
 */
export interface MultiEquityResult {
  /** 히어로 몫(공동 1등은 1/승자수로 분할) */
  hero: number;
  /** 히어로가 공동 1등에 든 확률(분할 전) */
  tie: number;
  /** 상대별 몫(입력 순서). 합 = 1 − hero */
  villains: number[];
  iterations: number;
  /** 'no_legal_combinations' = 겹친 카드 등으로 계산할 수 없었다 — 숫자는 전부 0 이고 승률이 아니다 */
  kind: 'exact' | 'monte_carlo' | 'no_legal_combinations';
  /** 무작위로 채운 상대 카드 장수 — 0 이면 전원 카드를 알았다 */
  unknownCards: number;
}

/**
 * Hero 2장 vs 상대 N명(각 0~2장 — 모자란 장수는 **무작위 핸드로 채운다**), 보드 0~5장.
 *
 * 화면은 이 가정을 반드시 적어야 한다("카드를 넣지 않은 상대는 무작위 핸드로 계산") — 가정을 숨기고
 * 숫자만 보여 주는 것이 이 저장소가 금지하는 것이지, 가정을 밝힌 근사는 SourceBadge heuristic 선례대로 허용된다.
 *
 * 전수는 **상대 카드를 전부 알고 잔여 보드가 2장 이하**일 때만이다(플랍 C(45,2)=990 · 턴 44 · 리버 1).
 * 상대 카드가 한 장이라도 비면 표본이다 — 6인 프리플랍은 배분 순열이 ~10^13 이라 전수가 없다.
 * 실측(2026-09-19, node): 10,000회 = 2인 0.35s · 6인(5명 모름) 1.0~1.4s, 12회 반복 SD 0.51%p.
 * 25,000회는 3s 라 폰에서 너무 길다 — 표본이면 화면이 ±0.5%p 수준의 오차를 같이 적는다.
 *
 * ⚠ 잔여 카드가 보드와 상대 손에 섞여 들어가는 경우(예: 턴 + 상대 1장 모름)는 unordered 쌍 루프로 전수화하면
 *   (보드←i, 손←j) 와 (보드←j, 손←i) 중 하나만 세어 **편향**된다. 그래서 그 경우는 전수화하지 않는다.
 */
export function computeEquityMulti(
  hero: [Card, Card],
  villains: readonly (readonly Card[])[],
  board: Card[],
  iterations = 10000,
  seed?: number,
): MultiEquityResult {
  if (hasDuplicateCards(hero, ...villains, board)) {
    return { hero: 0, tie: 0, villains: villains.map(() => 0), iterations: 0, kind: 'no_legal_combinations', unknownCards: 0 };
  }
  const heroN = [toN(hero[0]), toN(hero[1])];
  const villN = villains.map((v) => v.slice(0, 2).map(toN));
  const boardN = board.map(toN);
  const known = new Set([...heroN, ...villN.flat(), ...boardN].map(keyOf));
  const deck = buildDeck(known);
  const need = Math.max(0, 5 - boardN.length);
  const missing = villN.map((v) => 2 - v.length);
  const unknownCards = missing.reduce((a, b) => a + b, 0);
  const draw = need + unknownCards;
  const rnd = makeRng(seed);

  let hw = 0; let ht = 0; let total = 0;
  const vw = new Array<number>(villains.length).fill(0);
  const judge = (full: NCard[], hands: NCard[][]) => {
    const h = best7([...heroN, ...full]);
    let max = h; let winners = 1; let heroTop = true;
    const vs = hands.map((hand) => best7([...hand, ...full]));
    for (const v of vs) {
      if (v > max) { max = v; winners = 1; heroTop = false; } else if (v === max) winners += 1;
    }
    if (heroTop) { hw += 1 / winners; if (winners > 1) ht += 1; }
    for (let i = 0; i < vs.length; i += 1) if (vs[i] === max) vw[i] += 1 / winners;
    total += 1;
  };

  let kind: MultiEquityResult['kind'];
  if (draw === 0) {
    kind = 'exact';
    judge(boardN, villN);
  } else if (unknownCards === 0 && need <= 2) {
    kind = 'exact';
    if (need === 1) {
      for (let i = 0; i < deck.length; i += 1) judge([...boardN, deck[i]], villN);
    } else {
      for (let i = 0; i < deck.length; i += 1)
        for (let j = i + 1; j < deck.length; j += 1) judge([...boardN, deck[i], deck[j]], villN);
    }
  } else {
    kind = 'monte_carlo';
    for (let it = 0; it < iterations; it += 1) {
      // 부분 Fisher-Yates: 앞쪽 draw 장만 무작위 추출 → 상대 손(모자란 장수) → 보드 순으로 배분
      for (let k = 0; k < draw; k += 1) {
        const j = k + Math.floor(rnd() * (deck.length - k));
        const tmp = deck[k]; deck[k] = deck[j]; deck[j] = tmp;
      }
      let p = 0;
      const hands = villN.map((v, i) => {
        if (missing[i] === 0) return v;
        const hand = [...v, ...deck.slice(p, p + missing[i])];
        p += missing[i];
        return hand;
      });
      judge([...boardN, ...deck.slice(p, p + need)], hands);
    }
  }

  if (total === 0) return { hero: 0, tie: 0, villains: vw, iterations: 0, kind: 'exact', unknownCards };
  return {
    hero: hw / total,
    tie: ht / total,
    villains: vw.map((x) => x / total),
    iterations: total,
    kind,
    unknownCards,
  };
}

/** Hero 특정 핸드 vs 빌런 레인지 — 매 반복 가중 랜덤 콤보 샘플 + 보드 완성 몬테카를로.
 *  `seed` 를 주면 재현 가능한 난수열(makeRng)을 쓴다 — 스타팅 핸드 순위 생성기(scripts/gen-starting-hand-rank.mjs)가
 *  '무작위 한 손' 레인지(1326콤보)로 이 함수를 그대로 불러 169개 값을 결정적으로 만든다. 없으면 종전대로 Math.random. */
export function computeEquityVsRange(
  hero: [Card, Card],
  villainRange: WeightedCombo[],
  board: Card[],
  iterations = 2500,
  seed?: number,
): EquityResult {
  const rnd = makeRng(seed);
  const heroN = [toN(hero[0]), toN(hero[1])];
  const boardN = board.map(toN);
  const blocked = new Set([...heroN, ...boardN].map(keyOf));
  const { combos, total: rangeTotal } = prepareCombos(villainRange, blocked);
  // 레인지가 전부 차단됐다 — **0.5 를 돌려주면 "반반" 이라는 근거 없는 조언이 된다.**
  // 예전에는 NEUTRAL 만 돌려줘 호출부가 "계산 못 함" 과 "정말 5:5" 를 구별할 수 없었고,
  // useDeepGto 가 그 0.5 를 actionFromEquity 에 넣어 '콜 50% · 폴드 30% · 레이즈 20%' 까지 만들어 냈다.
  // computeRangeVsRange 는 같은 상황에서 이미 kind 를 실어 준다 — 그쪽과 같은 모양으로 맞춘다.
  if (combos.length === 0 || rangeTotal <= 0) {
    return { ...NEUTRAL, kind: 'no_legal_combinations', accepted: 0, attempts: 0 };
  }

  const deck = buildDeck(blocked); // 빌런 후보 카드는 덱에 남음 → 매 반복 리젝션으로 회피
  const need = 5 - boardN.length;

  // ── 보드가 다 깔렸으면 남은 무작위성은 '빌런 콤보 하나' 뿐이다 — 가중 평균이 곧 정답이다.
  // 표본을 쓰면 답이 있는데도 흔들린다(실측: KsKh vs 4콤보 · 보드 5장에서 2500회 12번 반복 폭 2.40%p,
  // 10만 회를 써도 0.7511 로 정답 0.7500 에 닿지 못한다). computeRangeVsRange:379 와 같은 조리법.
  if (need === 0) {
    const h = best7([...heroN, ...boardN]);
    let hw = 0; let vw = 0; let tw = 0;
    for (let i = 0; i < combos.length; i += 1) {
      const c = combos[i];
      const w = c.cum - (i > 0 ? combos[i - 1].cum : 0);   // 누적가중의 차분 = 개별 가중치
      if (w <= 0) continue;
      const v = best7([c.a, c.b, ...boardN]);
      if (h > v) hw += w; else if (v > h) vw += w; else tw += w;
    }
    const sum = hw + vw + tw;
    if (sum <= 0) return { ...NEUTRAL, kind: 'no_legal_combinations', accepted: 0, attempts: 0 };
    return {
      hero: (hw + tw / 2) / sum,
      villain: (vw + tw / 2) / sum,
      tie: tw / sum,
      iterations: combos.length,
      kind: 'exact',
      accepted: combos.length,
      attempts: combos.length,
    };
  }

  let hw = 0; let vw = 0; let tie = 0; let total = 0;
  for (let i = 0; i < iterations; i += 1) {
    const vc = sampleCombo(combos, rangeTotal, rnd);
    const full = boardN.slice();
    if (need > 0) {
      const used = new Set<number>([vc.ka, vc.kb]);
      while (full.length < boardN.length + need) {
        const c = deck[Math.floor(rnd() * deck.length)];
        const k = keyOf(c);
        if (used.has(k)) continue;
        used.add(k);
        full.push(c);
      }
    }
    const h = best7([...heroN, ...full]);
    const v = best7([vc.a, vc.b, ...full]);
    if (h > v) hw += 1; else if (v > h) vw += 1; else tie += 1;
    total += 1;
  }

  return {
    hero: (hw + tie / 2) / total,
    villain: (vw + tie / 2) / total,
    tie: tie / total,
    iterations: total,
    kind: 'monte_carlo',
    accepted: total,
    attempts: total,
  };
}

/** 아웃츠 분석 결과 — 다음 카드(턴 또는 리버)로 hero 가 앞서게/이기게 되는 카드 목록 */
export interface OutsResult {
  /** 'river' = 리버 1장 남음(히트=승리), 'turn' = 턴 1장 남음(히트=역전 우세) */
  next: 'turn' | 'river';
  /** **리버까지의 지분이 50%를 넘게 되는** 카드 수. 플랍에서는 "이 카드가 뜨면 유리해진다" 이지
   *  "그 순간 앞선다" 가 아니다 — 둘을 같은 말로 쓰면 안 된다(아래 `immediateOuts` 참고). */
  outs: number;
  total: number;  // 잔여 덱 크기
  prob: number;   // 다음 카드가 아웃일 확률(outs/total)
  cards: Card[];  // 아웃 카드 목록(랭크 내림차순)
  /** 🔴 G2(2026-09-20) — **그 카드가 뜬 그 순간 패 자체가 앞서는** 카드 수(즉시 역전).
   *  턴(=다음이 리버)에서는 쇼다운이라 `outs` 와 같아진다. 플랍에서는 다르다. */
  immediateOuts: number;
  immediateCards: Card[];
  immediateProb: number;
  /** 🔴 G2 — **지금** 히어로가 앞서는가. 미래 지분과 별개다. */
  standing: Standing;
}

/**
 * 다음 스트리트 아웃츠 — hero·villain 2장씩 + 보드 3장(플랍)/4장(턴)일 때만.
 *  · 턴(보드 4장): 리버 1장으로 hero 가 이기는(에퀴티>0.5) 클린 아웃.
 *  · 플랍(보드 3장): 턴 1장으로 hero 가 우세(리버 전수 에퀴티>0.5)해지는 카드.
 * computeEquity 를 그대로 재사용(리버=단일평가, 턴=44장 전수) — 값이 흔들리지 않는다.
 */
export function computeOuts(hero: [Card, Card], villain: [Card, Card], board: Card[]): OutsResult | null {
  if (board.length !== 3 && board.length !== 4) return null;
  if (hasDuplicateCards(hero, villain, board)) return null;   // 겹친 카드 — 있을 수 없는 핸드의 아웃츠는 없다
  const known = new Set([...hero, ...villain, ...board].map((c) => keyOf(toN(c))));
  const deck = buildDeck(known);
  const cards: Card[] = [];
  const immediate: Card[] = [];
  // 🔴 G2 — 두 질문을 **따로** 센다.
  //   ① `cards`  : 그 카드 뒤 **리버까지의 지분**이 50%를 넘는가(기존 정의 — 뜻을 바꾸지 않는다).
  //   ② `immediate`: 그 카드가 뜬 **그 순간의 패**가 상대보다 강한가(즉시 역전).
  //   플랍에서는 둘이 다르다. 예: 강한 드로는 ①에 들어가지만 턴에 드로가 완성되지 않으면 ②가 아니다.
  //   반대로 약한 원페어 개선은 ②이면서 상대의 더 큰 드로 때문에 ①이 아닐 수 있다.
  const sortCards = (a: Card, b: Card) => (RANK_VALUE[b.rank] - RANK_VALUE[a.rank]) || (SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
  for (const c of deck) {
    const nextCard = toCard(c);
    const nextBoard = [...board, nextCard];
    const eq = computeEquity(hero, villain, nextBoard);
    if (eq.hero > 0.5) cards.push(nextCard);
    if (currentStanding(hero, villain, nextBoard) === 'ahead') immediate.push(nextCard);
  }
  cards.sort(sortCards);
  immediate.sort(sortCards);
  return {
    next: board.length === 4 ? 'river' : 'turn',
    outs: cards.length,
    total: deck.length,
    prob: deck.length ? cards.length / deck.length : 0,
    cards,
    immediateOuts: immediate.length,
    immediateCards: immediate,
    immediateProb: deck.length ? immediate.length / deck.length : 0,
    standing: currentStanding(hero, villain, board) ?? 'tied',
  };
}

export interface RangeVsRangeOptions {
  /** 몬테카를로 표본 수(보드가 덜 깔린 경우에만 쓴다) */
  iterations?: number;
  /** 주면 재현 가능한 난수열을 쓴다 — 테스트는 반드시 준다 */
  seed?: number;
  /** 결합 분포를 통째로 만들 최대 (히어로×빌런) 쌍 수 */
  exactPairLimit?: number;
}

/**
 * 레인지 vs 레인지.
 *
 * **히어로를 먼저 고정하고 빌런만 다시 뽑으면 결합 분포가 편향된다.**
 * 예전 구현이 그랬다 — 히어로 콤보가 빌런을 많이 막을수록 그 히어로 콤보가
 * 과대 대표된다(막힌 빌런 자리를 남은 빌런들이 대신 채우므로 히어로의 확률은 그대로 유지된다).
 *
 * 2026-09-12 실측(보드 `Qc 2d 3h 4s 9c` · 히어로 `AsAh,KsKh` · 빌런 `AsQs,QhQd`):
 * 유효 쌍은 `AsAh/QhQd`·`KsKh/AsQs`·`KsKh/QhQd` 셋뿐이고 가중치가 같으니 **정답은 1/3 = 33.33%**.
 * 옛 구현은 히어로를 50:50 으로 먼저 뽑아 `AsAh/QhQd` 가 50%, 나머지 둘이 25% 씩이 되어
 * 히어로 승률이 **25% 부근(실측 24.8%)** 으로 나왔다 — 8.5%p 오차다.
 *
 * 그래서 **쌍 단위로** 다룬다:
 *  · 보드가 이미 5장이면 유효 쌍을 **전수 계산**한다(표본 오차 0).
 *  · 덜 깔렸으면 유효 쌍의 결합 가중치에서 직접 뽑고 보드만 무작위로 채운다.
 *  · 쌍이 너무 많으면 **양쪽을 함께 다시 뽑는 기각 표본**을 쓴다(히어로만 고정하지 않는다).
 */
export function computeRangeVsRange(
  heroRange: WeightedCombo[],
  villainRange: WeightedCombo[],
  board: Card[],
  opts: number | RangeVsRangeOptions = {},
): EquityResult {
  const o: RangeVsRangeOptions = typeof opts === 'number' ? { iterations: opts } : opts;
  const iterations = o.iterations ?? 2500;
  const exactPairLimit = o.exactPairLimit ?? 40_000;
  const rnd = makeRng(o.seed);

  const boardN = board.map(toN);
  const blocked = new Set(boardN.map(keyOf));
  const heroP = prepareCombos(heroRange, blocked);
  const villP = prepareCombos(villainRange, blocked);
  const none: EquityResult = { ...NEUTRAL, kind: 'no_legal_combinations', accepted: 0, attempts: 0 };
  if (heroP.combos.length === 0 || villP.combos.length === 0) return none;

  // prepareCombos 는 누적가중만 들고 있다 — 개별 가중치는 차분으로 되살린다.
  const wOf = (cs: NWCombo[], i: number) => cs[i].cum - (i > 0 ? cs[i - 1].cum : 0);
  const conflicts = (h: NWCombo, v: NWCombo) =>
    v.ka === h.ka || v.ka === h.kb || v.kb === h.ka || v.kb === h.kb;

  const deck = buildDeck(blocked);
  const need = 5 - boardN.length;

  interface Pair { h: NWCombo; v: NWCombo; w: number }
  let pairs: Pair[] | null = null;
  let pairTotal = 0;
  if (heroP.combos.length * villP.combos.length <= exactPairLimit) {
    pairs = [];
    for (let i = 0; i < heroP.combos.length; i += 1) {
      const h = heroP.combos[i];
      const wh = wOf(heroP.combos, i);
      if (wh <= 0) continue;
      for (let j = 0; j < villP.combos.length; j += 1) {
        const v = villP.combos[j];
        if (conflicts(h, v)) continue;              // 카드가 겹치는 쌍은 애초에 존재하지 않는다
        const w = wh * wOf(villP.combos, j);
        if (w <= 0) continue;
        pairTotal += w;
        pairs.push({ h, v, w });
      }
    }
    if (pairs.length === 0) return none;            // 모든 조합이 서로를 막는다
  }

  // ── 보드가 다 깔렸으면 표본을 쓸 이유가 없다 — 전수 계산 ──
  if (need === 0 && pairs) {
    let hw = 0; let vw = 0; let tw = 0;
    for (const p of pairs) {
      const h = best7([p.h.a, p.h.b, ...boardN]);
      const v = best7([p.v.a, p.v.b, ...boardN]);
      if (h > v) hw += p.w; else if (v > h) vw += p.w; else tw += p.w;
    }
    return {
      hero: (hw + tw / 2) / pairTotal,
      villain: (vw + tw / 2) / pairTotal,
      tie: tw / pairTotal,
      iterations: pairs.length,
      kind: 'exact',
      accepted: pairs.length,
      attempts: pairs.length,
    };
  }

  // ── 보드를 채워야 한다 — 쌍을 편향 없이 뽑는다 ──
  let cum: Float64Array | null = null;
  if (pairs) {
    cum = new Float64Array(pairs.length);
    let acc = 0;
    for (let i = 0; i < pairs.length; i += 1) { acc += pairs[i].w; cum[i] = acc; }
  }
  const pickPair = (): Pair | null => {
    if (pairs && cum) {
      const r = rnd() * pairTotal;
      let lo = 0; let hi = pairs.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] <= r) lo = mid + 1; else hi = mid; }
      return pairs[lo];
    }
    // 쌍이 너무 많아 표를 못 만든 경우 — **양쪽을 같이** 다시 뽑는다. 히어로를 고정하면 편향된다.
    for (let t = 0; t < 40; t += 1) {
      const h = sampleCombo(heroP.combos, heroP.total, rnd);
      const v = sampleCombo(villP.combos, villP.total, rnd);
      if (!conflicts(h, v)) return { h, v, w: 1 };
    }
    return null;
  };

  let hw = 0; let vw = 0; let tie = 0; let total = 0; let attempts = 0;
  for (let i = 0; i < iterations; i += 1) {
    attempts += 1;
    const p = pickPair();
    if (!p) continue;

    const full = boardN.slice();
    const used = new Set<number>([p.h.ka, p.h.kb, p.v.ka, p.v.kb]);
    while (full.length < boardN.length + need) {
      const c = deck[Math.floor(rnd() * deck.length)];
      const k = keyOf(c);
      if (used.has(k)) continue;
      used.add(k);
      full.push(c);
    }
    const h = best7([p.h.a, p.h.b, ...full]);
    const v = best7([p.v.a, p.v.b, ...full]);
    if (h > v) hw += 1; else if (v > h) vw += 1; else tie += 1;
    total += 1;
  }

  if (total === 0) return none;
  return {
    hero: (hw + tie / 2) / total,
    villain: (vw + tie / 2) / total,
    tie: tie / total,
    iterations: total,
    kind: 'monte_carlo',
    accepted: total,
    attempts,
  };
}
