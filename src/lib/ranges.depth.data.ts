// 프리플랍 레인지 차트 — 스택 깊이 25 · 40 · 60bb (BB 앤티) · 자체 제작 학습 차트(2026-10-09 오너 "100bb 뿐 아니라 3개 정도 더").
//
// ── 이 파일이 무엇인가 ─────────────────────────────────────────────────────────────
// 100bb 표(ranges.data.ts — 앤티 없음)와 같은 방식으로 **사람이 만든** 표다. 솔버·균형 산출이 아니다.
//   · 저장소 계산 도구(scripts/gen-nash/)는 첫 진입 올인 한 노드만, 그것도 2~20bb 만 푼다(solve.mjs STACKS).
//     오픈 → 3벳/올인 → 4벳/콜 노드를 계산할 도구가 없으므로 계산한 척하지 않는다.
//   · 대신 표 사이 **관계**를 테스트로 잠근다(ranges.depth.test.ts): 자리 순서·깊이 순서·지배 단조성·
//     BB 잔여 규약·4벳 규약·MDF 밴드·노트 수치 = 크기에서 나온 산수.
//   · 노트의 %·bb 숫자는 손으로 쓰지 않는다. 아래 DEPTH_META 와 산수 헬퍼에서 계산해 문장에 끼운다
//     (100bb 노트 문장을 복사해 다른 깊이의 숫자가 섞이는 경로를 막는다).
//
// ── 가정(화면 하단 고지와 배지가 같은 말을 한다) ─────────────────────────────────────
//   · 매장 표준 BB 앤티: 앤티 = 1bb, BB 가 낸다. 블라인드 전 팟 = SB 0.5 + BB 1 + 앤티 1 = 2.5bb.
//   · 스택 = 앤티를 낸 뒤 남은 유효 스택(nash.data.ts 와 같은 규약).
//   · 9인 기본. 6인 표(rfi6)는 같은 깊이 9인 LJ~SB 표의 별칭이다(앞에서 다 접으면 남은 인원이 같다).
//   · 25bb: 오픈 2bb, SB 는 2.5bb 레이즈만(림프·올인 전략은 레이즈로 단순화), BB 의 3벳은 올인 하나.
//   · 40 / 60bb: 오픈 2.2 / 2.3bb, SB 2.5 / 3bb, BB 3벳 9 / 10bb, 오프너의 4벳은 올인.
//
// ── 표기 규칙 ──────────────────────────────────────────────────────────────────────
// 이 파일의 모든 손 표기는 **단일 손 토큰**이다('QQ+'·'A2s+' 같은 범위 표기를 쓰지 않는다).
//   생성 함수가 문자열 집합만으로 잔여 콜을 계산하게 하려는 것이다 — 그래서 런타임 import 가 0개다.
//   (node 로 바로 읽을 때 확장자 없는 런타임 import 가 ERR_MODULE_NOT_FOUND 로 죽는다 — 2026-10-09 실측.)
//   이 파일의 import 는 `import type` 만 둔다. ranges.depth.test.ts 가 소스로 잠근다.
//
// ── 읽는 곳 ────────────────────────────────────────────────────────────────────────
// RangeGuide.tsx 하나뿐이다. NURI SPOT 판정·퀴즈·오답 노트·핸드 분석 모달은 계속 100bb 표만 읽는다
// (깊이 표를 모르는 소비처가 섞어 읽지 않게 — 테스트가 import 위치를 잠근다).
import type { RangeAction, RangeScenario, TablePos } from './ranges.data';
import type { RangeSpec } from './ranges';

export const RANGE_DEPTHS = [25, 40, 60] as const;
export type RangeDepth = (typeof RANGE_DEPTHS)[number];

export interface DepthMeta {
  /** 앤티를 낸 뒤 남은 유효 스택(bb) */
  stackBb: number;
  /** BB 가 내는 앤티(bb) */
  anteBb: 1;
  /** UTG~BTN 오픈 크기(bb, 총액) */
  openBb: number;
  /** SB 레이즈 크기(bb, 총액) */
  sbOpenBb: number;
  /** BB 의 3벳(bb, 총액) — 25bb 는 올인 하나 */
  bb3betBb: number | 'allin';
}

export const DEPTH_META: Record<RangeDepth, DepthMeta> = {
  25: { stackBb: 25, anteBb: 1, openBb: 2.0, sbOpenBb: 2.5, bb3betBb: 'allin' },
  40: { stackBb: 40, anteBb: 1, openBb: 2.2, sbOpenBb: 2.5, bb3betBb: 9 },
  60: { stackBb: 60, anteBb: 1, openBb: 2.3, sbOpenBb: 3.0, bb3betBb: 10 },
};

// ── 산수 헬퍼 — 노트 문장과 테스트가 함께 쓰는 단일 소스 ────────────────────────────
/** 블라인드 전 팟 = SB 0.5 + BB 1 + 앤티 */
const blindPot = (m: DepthMeta) => 1.5 + m.anteBb;
/** 오프너가 SB 면 자기 0.5 가 이미 팟에 있다 */
const openOf = (m: DepthMeta, sb: boolean) => (sb ? m.sbOpenBb : m.openBb);
/** 오프너가 새로 넣는 돈 */
const openRisk = (m: DepthMeta, sb: boolean) => openOf(m, sb) - (sb ? 0.5 : 0);
/** 오픈 직후 팟 */
const potAfterOpen = (m: DepthMeta, sb: boolean) => blindPot(m) + openRisk(m, sb);
const threeBet = (m: DepthMeta) => (m.bb3betBb === 'allin' ? m.stackBb : m.bb3betBb);

/** 스틸 알파 — 오픈이 바로 이득이 되려면 블라인드가 접어야 하는 비율 */
export const stealAlpha = (m: DepthMeta, sb = false) => openRisk(m, sb) / (openRisk(m, sb) + blindPot(m));
/** BB 콜 가격 — 콜 금액 ÷ 콜 뒤 팟 */
export const bbCallPrice = (m: DepthMeta, sb = false) => {
  const call = openOf(m, sb) - 1;
  return call / (potAfterOpen(m, sb) + call);
};
/** BB 3벳에 대한 오프너의 MDF = 1 − (BB 가 새로 넣는 돈 ÷ 그 뒤 팟) */
export const mdfVsBb3bet = (m: DepthMeta, sb = false) => {
  const risk = threeBet(m) - 1;
  return 1 - risk / (risk + potAfterOpen(m, sb));
};
/** 오프너의 4벳 올인이 순수 블러프로 바로 이득이 되려면 BB 가 접어야 하는 비율 */
export const fourbetAlpha = (m: DepthMeta, sb = false) => {
  const risk = m.stackBb - openOf(m, sb);
  return risk / (risk + potAfterOpen(m, sb) + threeBet(m) - 1);
};
/** BB 올인을 받은 오프너의 콜에 필요한 승률 = 콜 금액 ÷ 최종 팟(죽은 SB 0.5 포함) */
export const jamCallPrice = (m: DepthMeta, sb = false) => {
  const call = m.stackBb - openOf(m, sb);
  const dead = sb ? 0 : 0.5;
  return call / (2 * m.stackBb + dead + m.anteBb);
};
/** BB 의 순수 블러프 올인이 바로 이득이 되려면 오프너가 접어야 하는 비율 */
export const bbJamAlpha = (m: DepthMeta, sb = false) => {
  const risk = m.stackBb - 1;
  return risk / (risk + potAfterOpen(m, sb));
};
/** 3벳 콜 뒤 SPR(남은 스택 ÷ 팟) — 비율이라 %·bb 가 아니다 */
export const sprAfter3betCall = (m: DepthMeta) => {
  const b = threeBet(m);
  return (m.stackBb - b) / (2 * b + 0.5 + m.anteBb);
};
export const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
/** 2.0 → '2', 2.5 → '2.5' */
export const bbStr = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(1)}bb`;

// ── 손 사다리 — 위 칸일수록 먼저 들어간다. 각 손의 지배자(같은 하이카드에서 키커가 높은 손·같은 두 장의 수딧·높은 페어)는
//    항상 같은 칸이나 위 칸에 있다. 그래서 사다리를 위에서부터 자른 표는 지배 단조성이 저절로 선다.
/** 오픈 사다리 — 대략 1~5%p 씩. 휠 에이스(A5s)는 A6s 와 같은 칸에 둬 예외 없이 지배 순서를 지킨다. */
const OPEN_LADDER: readonly string[] = [
  /* 1 */ 'AA KK QQ JJ TT AKs AQs AKo',
  /* 2 */ '99 88 AJs ATs KQs AQo',
  /* 3 */ '77 KJs KTs QJs QTs JTs AJo KQo',
  /* 4 */ '66 55 A9s A8s A7s A6s A5s T9s ATo KJo',
  /* 5 */ '44 33 22 A4s A3s A2s K9s Q9s J9s 98s QJo',
  /* 6 */ 'A9o KTo QTo JTo 87s T8s K8s',
  /* 7 */ 'A8o K7s K6s Q8s J8s 97s 76s 65s',
  /* 8 */ 'A7o K9o Q9o J9o K5s 86s 54s',
  /* 9 */ 'A6o A5o T9o K4s K3s K2s Q7s Q6s T7s 75s',
  /* 10 */ 'A4o A3o A2o K8o J7s 96s 64s 53s 43s',
  /* 11 */ 'Q8o J8o T8o 98o Q5s Q4s J6s 85s 74s',
  /* 12 */ 'K7o K6o Q3s Q2s J5s J4s T6s 87o 63s 52s 42s',
  /* 13 */ 'K5o K4o Q7o J7o T7o 97o 76o J3s J2s T5s T4s 95s 84s 73s 32s',
];

/** BB 수비 콜 사다리 — 싼 콜 가격에서 실현이 잘 되는 페어·수딧·브로드웨이가 먼저. 공격(올인·3벳) 손은 생성 함수가 뺀다. */
const CALL_LADDER: readonly string[] = [
  /* 1 */ 'JJ TT 99 88 77 66 AQs AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s AQo AJo KQo',
  /* 2 */ '55 44 33 22 A8s A7s A6s A5s A4s A3s A2s K9s Q9s J9s 98s 87s ATo KJo',
  /* 3 */ 'K8s K7s Q8s J8s T8s 97s 76s 65s A9o KTo QJo QTo JTo',
  /* 4 */ 'K6s K5s K4s Q7s Q6s J7s T7s 86s 75s 54s A8o A7o K9o Q9o J9o T9o',
  /* 5 */ 'K3s K2s Q5s Q4s J6s T6s 96s 85s 64s 53s 43s A6o A5o A4o K8o Q8o J8o T8o 98o',
  /* 6 */ 'Q3s Q2s J5s J4s T5s 95s 74s 63s 52s 42s A3o A2o K7o K6o 87o 97o',
  /* 7 */ 'J3s J2s T4s T3s T2s 94s 84s 73s 62s 32s K5o Q7o J7o T7o 76o 86o 65o',
];

const toks = (s: string | undefined) => (s ?? '').split(/\s+/).filter(Boolean);
type Bucket = keyof RangeSpec;

/** 사다리 앞 `full` 칸 100% · 다음 `half` 칸 50% · 다음 `quarter` 칸 25% */
function ladderSpec(ladder: readonly string[], full: number, half = 0, quarter = 0): RangeSpec {
  const spec: RangeSpec = {};
  const put = (k: Bucket, from: number, n: number) => {
    const s = ladder.slice(from, from + n).join(' ');
    if (s) spec[k] = s;
  };
  put('1', 0, full);
  put('0.5', full, half);
  put('0.25', full + half, quarter);
  return spec;
}

/** 공격 혼합의 잔여 빈도 → 콜 버킷(BB 잔여 규약: 공격을 섞는 손의 나머지는 전부 콜) */
const RESIDUAL: Record<string, Bucket> = { '0.25': '0.75', '0.5': '0.5', '0.75': '0.25' };

/** BB 수비 표 — 공격(25bb 올인 / 40·60bb 3벳) + 콜(공격 잔여 + 콜 사다리에서 공격 손을 뺀 것) */
function bbDefendActions(depth: RangeDepth, attack: RangeSpec, full: number, half = 0): RangeAction[] {
  const inAttack = new Map<string, string>();
  for (const [f, s] of Object.entries(attack)) for (const h of toks(s)) inAttack.set(h, f);
  const call: Partial<Record<Bucket, string[]>> = {};
  const add = (k: Bucket, h: string) => (call[k] ??= []).push(h);
  for (const [h, f] of inAttack) if (f !== '1') add(RESIDUAL[f], h);
  CALL_LADDER.forEach((tier, i) => {
    const k: Bucket | null = i < full ? '1' : i < full + half ? '0.5' : null;
    if (k) for (const h of toks(tier)) if (!inAttack.has(h)) add(k, h);
  });
  const callSpec: RangeSpec = {};
  for (const k of ['1', '0.75', '0.5', '0.25'] as const) if (call[k]?.length) callSpec[k] = call[k]!.join(' ');
  const jam = DEPTH_META[depth].bb3betBb === 'allin';
  return [
    jam ? { key: 'allin', label: '올인', spec: attack } : { key: 'raise', label: '3벳', spec: attack },
    { key: 'call', label: '콜', spec: callSpec },
  ];
}

// ── 표 정의 ─────────────────────────────────────────────────────────────────────────
const NINE: TablePos[] = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'];
const EARLY = new Set<TablePos>(['UTG', 'UTG+1', 'MP']);
const slug = (p: TablePos) => p.toLowerCase().replace('+', '');
/** 9인 테이블에서 이 자리 뒤에 남은 인원(블라인드 포함) */
const behind9 = (p: TablePos) => 8 - NINE.indexOf(p);

/** 오픈 폭 = OPEN_LADDER 의 [100% 칸 수, 50% 칸 수, 25% 칸 수].
 *  얼리(UTG~LJ)는 깊을수록 넓다(25 ≤ 40 ≤ 60 — 리스틸 위험이 크고 투기적 손의 가치가 깊이에 따라 오른다).
 *  레이트(HJ~SB)는 방향을 정하지 않고 깊이 간 6%p 안에서만 움직인다(작은 오픈의 알파와 리스틸 위험이 서로 반대로 민다). */
const RFI_CUT: Record<RangeDepth, Record<TablePos, [number, number, number]>> = {
  25: { UTG: [3, 1, 1], 'UTG+1': [3, 2, 0], MP: [3, 2, 2], LJ: [4, 2, 0], HJ: [5, 2, 0], CO: [7, 2, 0], BTN: [10, 2, 1], SB: [9, 2, 0], BB: [0, 0, 0] },
  40: { UTG: [3, 2, 0], 'UTG+1': [3, 2, 1], MP: [4, 1, 1], LJ: [4, 2, 1], HJ: [5, 2, 1], CO: [7, 2, 1], BTN: [10, 2, 1], SB: [9, 2, 1], BB: [0, 0, 0] },
  60: { UTG: [3, 2, 1], 'UTG+1': [4, 1, 1], MP: [4, 1, 2], LJ: [5, 1, 1], HJ: [6, 1, 1], CO: [7, 2, 1], BTN: [10, 2, 1], SB: [10, 1, 1], BB: [0, 0, 0] },
};

const RFI9_ID: Partial<Record<TablePos, string>> = {
  UTG: 'rfi_utg9', 'UTG+1': 'rfi_utg1', MP: 'rfi_mp9', LJ: 'rfi_lj9', HJ: 'rfi_hj9', CO: 'rfi_co9', BTN: 'rfi_btn9', SB: 'rfi_sb9',
};
const RFI9_LABEL: Partial<Record<TablePos, string>> = {
  UTG: 'UTG (9인)', 'UTG+1': 'UTG+1', MP: 'MP', LJ: 'LJ (9인)', HJ: 'HJ (9인)', CO: 'CO (9인)', BTN: 'BTN (9인)', SB: 'SB (9인)',
};
const RFI6_LABEL: Partial<Record<TablePos, string>> = { LJ: 'LJ (UTG)', HJ: 'HJ', CO: 'CO', BTN: 'BTN', SB: 'SB' };

/** 자리별 한 줄 성격(숫자 없음) */
const RFI_FLAVOR: Record<string, string> = {
  early: '뒤에 남은 인원이 많아 리스틸을 맞기 쉽다. 페어·A 수딧·브로드웨이 위주.',
  middle: '뒤가 줄어든 만큼 수딧 커넥터·오프수트 브로드웨이를 섞는다.',
  late: '블라인드만 남으면 앤티까지 걸린 팟을 노려 넓게 연다.',
  sb: 'BB 하나만 남지만 포스트플랍 포지션이 없다. 림프·올인 없이 레이즈만 쓰는 단순화 표.',
};
const flavorOf = (p: TablePos) => (p === 'SB' ? 'sb' : EARLY.has(p) ? 'early' : p === 'LJ' || p === 'HJ' ? 'middle' : 'late');

function rfiNote(d: RangeDepth, p: TablePos): string {
  const m = DEPTH_META[d];
  const sb = p === 'SB';
  const head = `${RFI_FLAVOR[flavorOf(p)]} 스틸 알파 ${pct1(stealAlpha(m, sb))} — 블라인드가 그보다 자주 접으면 아무 두 장도 이득이다. BB 앤티 1bb 가 팟을 키워 앤티 없는 표보다 넓다.`;
  const tail = m.bb3betBb === 'allin'
    ? ` BB 올인을 받으면 콜에 필요한 승률은 ${pct1(jamCallPrice(m, sb))}(이 깊이의 콜 표는 아직 없다).`
    : ` BB 3벳 ${bbStr(m.bb3betBb)} 를 받으면 오픈한 손의 ${pct1(mdfVsBb3bet(m, sb))} 이상을 계속한다(vs 3벳 표).`;
  return head + tail;
}

function rfi9(d: RangeDepth, p: TablePos): RangeScenario {
  const m = DEPTH_META[d];
  const [f, h, q] = RFI_CUT[d][p];
  const sb = p === 'SB';
  return {
    id: depthId(RFI9_ID[p]!, d), group: 'rfi9', hero: p,
    ...(EARLY.has(p) ? { baseTableSize: 9 as const } : {}),
    label: RFI9_LABEL[p]!,
    desc: sb
      ? `9인 SB · BB 와 둘 · ${bbStr(m.sbOpenBb)} 레이즈 · 유효 ${bbStr(m.stackBb)}`
      : `9인 ${p} · 뒤에 ${behind9(p)}명 · ${bbStr(m.openBb)} 오픈 · 유효 ${bbStr(m.stackBb)}`,
    actions: [{ key: 'raise', label: '오픈', spec: ladderSpec(OPEN_LADDER, f, h, q) }],
    note: rfiNote(d, p),
  };
}

/** 6인 별칭 — 같은 깊이 9인 표의 spec 을 **같은 객체**로 공유한다(두 벌이 어긋날 수 없게) */
function rfi6(nine: RangeScenario, d: RangeDepth): RangeScenario {
  const m = DEPTH_META[d];
  const p = nine.hero;
  const sb = p === 'SB';
  const left = 5 - ['LJ', 'HJ', 'CO', 'BTN', 'SB'].indexOf(p);
  return {
    id: depthId(baseIdOf(nine.id).replace(/9$/, ''), d), group: 'rfi6', hero: p,
    label: RFI6_LABEL[p]!,
    desc: sb
      ? `6인 SB · BB 와 둘 · ${bbStr(m.sbOpenBb)} 레이즈 · 유효 ${bbStr(m.stackBb)}`
      : `6인 ${p} · 뒤에 ${left}명 · ${bbStr(m.openBb)} 오픈 · 유효 ${bbStr(m.stackBb)}`,
    actions: nine.actions,
    note: `${nine.note} 6인 테이블에서 앞이 다 접어 이 자리에 온 것과 같은 표다.`,
  };
}

// BB 공격 레인지 — 오프너가 뒤로 갈수록(오픈이 넓을수록) 넓다. 섞는 손(0.5)의 나머지는 생성 함수가 콜로 채운다.
// 25bb 는 올인(리스틸) 하나, 40·60bb 는 3벳(9 / 10bb).
const BB_JAM_25: Record<string, RangeSpec> = {
  UTG: { '1': 'AA KK QQ JJ AKs AKo', '0.5': 'TT AQs AQo' },
  'UTG+1': { '1': 'AA KK QQ JJ AKs AKo', '0.5': 'TT 99 AQs AJs AQo' },
  MP: { '1': 'AA KK QQ JJ TT AKs AQs AKo', '0.5': '99 AJs KQs AQo A5s A4s' },
  LJ: { '1': 'AA KK QQ JJ TT AKs AQs AKo AQo', '0.5': '99 88 AJs ATs KQs A5s A4s A3s' },
  HJ: { '1': 'AA KK QQ JJ TT 99 AKs AQs AJs AKo AQo', '0.5': '88 77 ATs KQs KJs AJo A5s A4s A3s A2s' },
  CO: { '1': 'AA KK QQ JJ TT 99 88 AKs AQs AJs ATs KQs AKo AQo AJo', '0.5': '77 66 A9s A8s KJs KTs QJs ATo KQo A5s A4s A3s A2s' },
  BTN: { '1': 'AA KK QQ JJ TT 99 88 77 AKs AQs AJs ATs A9s KQs KJs AKo AQo AJo ATo KQo', '0.5': '66 55 A8s A7s A6s A5s A4s A3s A2s KTs QJs QTs JTs KJo A9o' },
  SB: { '1': 'AA KK QQ JJ TT 99 88 77 66 AKs AQs AJs ATs A9s A8s KQs KJs KTs QJs AKo AQo AJo ATo KQo KJo', '0.5': '55 44 A7s A6s A5s A4s A3s A2s K9s QTs JTs T9s A9o A8o KTo QJo' },
};
const BB_3BET: Record<string, RangeSpec> = {
  UTG: { '1': 'AA KK QQ AKs AKo', '0.5': 'JJ AQs A5s A4s' },
  'UTG+1': { '1': 'AA KK QQ AKs AKo', '0.5': 'JJ TT AQs AQo A5s A4s' },
  MP: { '1': 'AA KK QQ JJ AKs AKo', '0.5': 'TT AQs AJs KQs AQo A5s A4s A3s' },
  LJ: { '1': 'AA KK QQ JJ AKs AQs AKo', '0.5': 'TT AJs KQs AQo A5s A4s A3s A2s' },
  HJ: { '1': 'AA KK QQ JJ AKs AQs AKo A5s', '0.5': 'TT 99 AJs KQs KJs AQo A4s A3s A2s K9s' },
  CO: { '1': 'AA KK QQ JJ TT AKs AQs AJs AKo AQo A5s A4s', '0.5': '99 88 ATs KQs KJs QJs AJo A3s A2s K9s Q9s J9s T9s' },
  BTN: { '1': 'AA KK QQ JJ TT AKs AQs AJs KQs AKo AQo A5s A4s', '0.5': '99 88 77 ATs KJs KTs QJs QTs JTs AJo ATo KQo A3s A2s K9s Q9s J9s T9s 98s 87s A9o' },
  SB: { '1': 'AA KK QQ JJ TT 99 AKs AQs AJs ATs KQs KJs AKo AQo AJo KQo A5s A4s', '0.5': '88 77 66 A9s A8s KTs QJs QTs JTs T9s 98s 87s 76s ATo KJo A9o A3s A2s K9s Q9s J9s' },
};

/** BB 콜 폭 = CALL_LADDER 의 [100% 칸 수, 50% 칸 수]. 오프너가 넓을수록 넓고, 콜 가격이 싼 얕은 깊이일수록 넓다. */
const DEFEND_CUT: Record<RangeDepth, Record<string, [number, number]>> = {
  25: { UTG: [3, 1], 'UTG+1': [3, 1], MP: [3, 2], LJ: [3, 2], HJ: [4, 1], CO: [5, 1], BTN: [6, 1], SB: [6, 1] },
  40: { UTG: [3, 0], 'UTG+1': [3, 1], MP: [3, 1], LJ: [3, 2], HJ: [4, 1], CO: [4, 2], BTN: [5, 2], SB: [5, 2] },
  60: { UTG: [2, 1], 'UTG+1': [3, 0], MP: [3, 1], LJ: [3, 1], HJ: [4, 0], CO: [4, 1], BTN: [5, 0], SB: [5, 1] },
};

function bbDefend(d: RangeDepth, vs: TablePos): RangeScenario {
  const m = DEPTH_META[d];
  const sb = vs === 'SB';
  const jam = m.bb3betBb === 'allin';
  const [full, half] = DEFEND_CUT[d][vs];
  const openStr = sb ? `${bbStr(m.sbOpenBb)} 레이즈` : `${bbStr(m.openBb)} 오픈`;
  const note = jam
    ? `콜 가격 ${pct1(bbCallPrice(m, sb))} — 앤티가 걸린 팟이라 싸게 지킨다. 리스틸은 올인 하나: 밸류와 A 블로커. 순수 블러프 올인은 상대가 ${pct1(bbJamAlpha(m, sb))} 이상 접어야 바로 이득이라 섞는 손의 나머지는 전부 콜로 받는다.`
    : `콜 가격 ${pct1(bbCallPrice(m, sb))}. 3벳 ${bbStr(m.bb3betBb as number)} 에 상대가 오픈한 손의 ${pct1(mdfVsBb3bet(m, sb))} 아래로 계속하면 블러프 3벳이 바로 이득이다. 3벳을 섞는 손의 나머지는 전부 콜.`;
  return {
    id: depthId(`bb_vs_${slug(vs)}`, d), group: 'defend', hero: 'BB', vs,
    ...(EARLY.has(vs) ? { baseTableSize: 9 as const } : {}),
    label: `BB vs ${vs} 오픈`,
    desc: `${vs} ${openStr} → BB 는 ${jam ? '올인 아니면 콜' : `3벳 ${bbStr(m.bb3betBb as number)} 아니면 콜`} · 유효 ${bbStr(m.stackBb)}`,
    actions: bbDefendActions(d, (jam ? BB_JAM_25 : BB_3BET)[vs], full, half),
    note,
  };
}

// 오프너 vs BB 3벳 — 4벳은 올인. 밸류 4벳 혼합의 나머지 절반은 콜, 휠 에이스 블러프의 나머지 절반은 폴드.
// 빈도는 '그 손으로 오픈했을 때' 기준이다(오픈하지 않은 손은 이 표에 없다 — 테스트가 오픈 레인지 ⊆ 를 잠근다).
// 폭은 자체 제작이지만 **필요조건 검산**을 거쳤다(2026-10-09, 정확 전수 에퀴티 equity169-exact.mjs 위에서
//   'BB 가 최선 응답으로 콜할 때 이 올인이 폴드보다 손해가 아닌가' — 보고서 impl.md 에 명령·해시).
//   첫 판은 얼리 오프너가 40bb 에서 A5s 블러프·JJ 를, 60bb UTG 가 QQ 를 올인했는데 전부 폴드보다 손해였다:
//   얼리 오픈을 상대로 한 BB 3벳은 밸류가 두꺼워 블러프 올인이 접히지 않고 QQ·JJ 는 콜당하면 진다. 그 손들은 콜로 옮겼다.
const FOURBET: Record<40 | 60, Record<string, RangeSpec>> = {
  40: {
    UTG: { '1': 'AA KK AKs', '0.5': 'AKo' },
    'UTG+1': { '1': 'AA KK AKs', '0.5': 'QQ AKo' },
    MP: { '1': 'AA KK AKs', '0.5': 'QQ AKo' },
    LJ: { '1': 'AA KK QQ AKs', '0.5': 'JJ AKo' },
    HJ: { '1': 'AA KK QQ AKs AKo', '0.5': 'JJ' },
    CO: { '1': 'AA KK QQ AKs AKo', '0.5': 'JJ TT AQs A5s A4s' },
    BTN: { '1': 'AA KK QQ AKs AKo', '0.5': 'JJ TT AQs A5s A4s' },
    SB: { '1': 'AA KK QQ AKs AKo', '0.5': 'JJ TT AQs A5s A4s' },
  },
  60: {
    UTG: { '1': 'AA KK AKs', '0.5': 'AKo' },
    'UTG+1': { '1': 'AA KK AKs', '0.5': 'AKo' },
    MP: { '1': 'AA KK AKs', '0.5': 'QQ AKo A5s' },
    LJ: { '1': 'AA KK AKs', '0.5': 'QQ AKo A5s' },
    HJ: { '1': 'AA KK AKs', '0.5': 'QQ AKo A5s A4s' },
    CO: { '1': 'AA KK AKs', '0.5': 'QQ AKo A5s A4s' },
    BTN: { '1': 'AA KK AKs', '0.5': 'QQ AKo A5s A4s' },
    SB: { '1': 'AA KK AKs', '0.5': 'QQ AKo A5s A4s' },
  },
};
const VS3BET_CALL: Record<40 | 60, Record<string, RangeSpec>> = {
  40: {
    UTG: { '1': 'QQ JJ TT AQs AJs KQs', '0.5': 'AKo 99 AQo' },
    'UTG+1': { '1': 'JJ TT 99 AQs AJs KQs', '0.5': 'QQ AKo 88 ATs AQo' },
    MP: { '1': 'JJ TT 99 AQs AJs KQs AQo', '0.5': 'QQ AKo 88 ATs KJs' },
    LJ: { '1': 'TT 99 88 AQs AJs KQs AQo', '0.5': 'JJ AKo 77 ATs KJs QJs' },
    HJ: { '1': 'TT 99 88 AQs AJs ATs KQs AQo', '0.5': 'JJ 77 66 KJs QJs JTs AJo' },
    CO: { '1': '99 88 77 66 AJs ATs A9s KQs KJs KTs QJs JTs AQo AJo KQo', '0.5': 'JJ TT AQs 55 44 A8s A7s QTs T9s 98s 87s ATo KJo' },
    BTN: { '1': '99 88 77 66 55 AJs ATs A9s A8s KQs KJs KTs QJs QTs JTs T9s AQo AJo ATo KQo KJo', '0.5': 'JJ TT AQs 44 33 22 A7s A6s K9s Q9s J9s 98s 87s 76s KTo QJo A9o' },
    SB: { '1': '99 88 77 66 55 AJs ATs A9s A8s KQs KJs KTs QJs QTs JTs T9s AQo AJo ATo KQo KJo', '0.5': 'JJ TT AQs 44 33 22 A7s A6s K9s Q9s J9s 98s 87s 76s KTo QJo A9o' },
  },
  60: {
    UTG: { '1': 'QQ JJ TT 99 AQs AJs KQs AQo', '0.5': 'AKo 88 ATs KJs' },
    'UTG+1': { '1': 'QQ JJ TT 99 88 AQs AJs KQs AQo', '0.5': 'AKo 77 ATs KJs QJs' },
    MP: { '1': 'JJ TT 99 88 AQs AJs ATs KQs AQo', '0.5': 'QQ AKo 77 KJs QJs JTs' },
    LJ: { '1': 'JJ TT 99 88 77 AQs AJs ATs KQs KJs AQo', '0.5': 'QQ AKo 66 QJs JTs AJo' },
    HJ: { '1': 'JJ TT 99 88 77 AQs AJs ATs KQs KJs QJs AQo', '0.5': 'QQ AKo 66 55 KTs JTs T9s AJo KQo' },
    CO: { '1': 'JJ TT 99 88 77 66 AQs AJs ATs A9s KQs KJs KTs QJs QTs JTs AQo AJo KQo', '0.5': 'QQ AKo 55 44 A8s A7s T9s 98s 87s ATo KJo' },
    BTN: { '1': 'JJ TT 99 88 77 66 55 44 AQs AJs ATs A9s A8s A7s KQs KJs KTs K9s QJs QTs JTs T9s 98s AQo AJo ATo KQo KJo', '0.5': 'QQ AKo 33 22 A6s Q9s J9s T8s 87s 76s 65s KTo QJo A9o QTo JTo' },
    SB: { '1': 'JJ TT 99 88 77 66 55 44 AQs AJs ATs A9s A8s A7s KQs KJs KTs K9s QJs QTs Q9s JTs J9s T9s 98s AQo AJo ATo KQo KJo QJo', '0.5': 'QQ AKo 33 22 A6s T8s 87s 76s 65s KTo A9o QTo JTo' },
  },
};

function vs3bet(d: 40 | 60, p: TablePos): RangeScenario {
  const m = DEPTH_META[d];
  const sb = p === 'SB';
  return {
    id: depthId(`${slug(p)}_vs_bb3bet`, d), group: 'vs3bet', hero: p, vs: 'BB',
    ...(EARLY.has(p) ? { baseTableSize: 9 as const } : {}),
    label: `${p} vs BB 3벳`,
    desc: `내 ${p} ${sb ? `${bbStr(m.sbOpenBb)} 레이즈` : `${bbStr(m.openBb)} 오픈`} → BB 3벳 ${bbStr(m.bb3betBb as number)} · 4벳은 올인 ${bbStr(m.stackBb)}`,
    actions: [
      { key: 'fourbet', label: '올인', spec: FOURBET[d][p] },
      { key: 'call', label: '콜', spec: VS3BET_CALL[d][p] },
    ],
    note: `MDF ${pct1(mdfVsBb3bet(m, sb))} — 오픈한 손의 그 이상을 계속해야 BB 의 블러프 3벳이 공짜가 아니다. 순수 블러프 올인은 BB 가 ${pct1(fourbetAlpha(m, sb))} 이상 접어야 바로 이득이다 — ${/A[2-5]s/.test(FOURBET[d][p]['0.5'] ?? '') ? '휠 에이스만 절반 섞고 나머지는 접는다' : '이 자리를 상대로 한 BB 3벳은 밸류가 두꺼워 블러프 올인을 넣지 않았다'}. 올인을 절반만 섞는 밸류 손의 나머지는 콜. 콜하면 SPR 이 약 ${sprAfter3betCall(m).toFixed(1)} 까지 낮아져 페어·수딧 브로드웨이 위주로 받는다.`,
  };
}

function buildDepth(d: RangeDepth): RangeScenario[] {
  const nine = NINE.map((p) => rfi9(d, p));
  const six = nine.filter((s) => !EARLY.has(s.hero)).map((s) => rfi6(s, d));
  const defend = NINE.map((vs) => bbDefend(d, vs));
  const v3 = d === 25 ? [] : NINE.map((p) => vs3bet(d, p));
  return [...nine, ...six, ...defend, ...v3];
}

/** 깊이 id — 100bb id 뒤에 '@깊이'. 100bb 와도, 깊이끼리도 겹치지 않는다. */
export function depthId(base: string, d: RangeDepth): string {
  return `${base}@${d}`;
}
export function baseIdOf(id: string): string {
  const at = id.indexOf('@');
  return at < 0 ? id : id.slice(0, at);
}

export const DEPTH_SCENARIOS: Record<RangeDepth, RangeScenario[]> = {
  25: buildDepth(25),
  40: buildDepth(40),
  60: buildDepth(60),
};

const POS_ORDER: TablePos[] = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const posIdx = (p: TablePos | undefined) => (p ? POS_ORDER.indexOf(p) : -1);

/** 깊이를 바꿀 때 같은 자리를 유지한다. 같은 (그룹·내 자리·상대) → 같은 (그룹·내 자리) 중 테이블 순서 첫 상대
 *  → 그 그룹의 첫 표 → 9인 오픈 첫 표. 결과는 항상 `list` 의 원소다. */
export function carryScenario(list: RangeScenario[], prev: Pick<RangeScenario, 'group' | 'hero' | 'vs'>): RangeScenario {
  const same = list.find((s) => s.group === prev.group && s.hero === prev.hero && s.vs === prev.vs);
  if (same) return same;
  const hero = list
    .filter((s) => s.group === prev.group && s.hero === prev.hero)
    .sort((a, b) => posIdx(a.vs) - posIdx(b.vs))[0];
  if (hero) return hero;
  return list.find((s) => s.group === prev.group) ?? list.find((s) => s.group === 'rfi9') ?? list[0];
}

/** 하단 고지 둘째 줄 — 그 깊이에 없는 표를 한 줄로 밝힌다 */
export const DEPTH_GAP_NOTE: Record<RangeDepth | 100, string> = {
  25: '25bb 표: BB 올인에 대한 콜·콜드 3벳 올인·SB 수비 표는 없습니다. SB 림프·올인은 레이즈로 단순화했습니다.',
  40: '40bb 표: 콜드 3벳·SB 수비·4벳 이후 표는 없습니다.',
  60: '60bb 표: 콜드 3벳·SB 수비·4벳 이후 표는 없습니다.',
  100: '100bb 표는 앤티 없는 기준입니다.',
};
