// GTO 데이터 불변 계약 — 번들 분할(지연 로딩) 전후로 **계산 결과가 한 글자도 안 바뀌었는가**.
//
// 2026-10-04 오너 지시 "기능·성능은 그대로, 불러오는 용량만 조절". 데이터 모듈을 언제 받는지는 바꿔도
// 값은 바꾸면 안 된다. 이 테스트는 분할 **전** 코드로 뽑은 지문(golden)과 지금 코드를 전수 비교한다.
//   ① Nash 표 — 3종 × 앤티 2 × k 1~8 × 스택 12 × 근사 허용 2 × 169핸드, 격리·근사 판정 포함
//   ② 레인지 표 — 전 시나리오의 액션별 169핸드 빈도 + 색·그룹
//   ③ 드릴 문제 — 복원 가능한 모든 키(차트 4모드 · 푸시 · 콜)의 정답 빈도
//   ④ SPOT 판정 — 인원 4종 × 자리 쌍 × 스택 × 앤티 × 액션 줄 × 169핸드의 등급·빈도·판정·수치
//      ⚠ 콜에는 크기(amountToCall)를 꼭 싣는다 — 빠지면 입력 오류(blocker)로 전부 '범위 밖'이 돼 수비·3벳·vs 3벳 표를
//        한 번도 안 지난다(critical-reviewer PR #156: 그 상태로 판정 뮤턴트에 47/47 초록이었다). 줄마다 실제 판정이 나오는지 따로 단언한다.
// 구역마다 sha256 을 따로 둔다 — 깨지면 **어느 표가** 바뀌었는지 이름이 나온다.
// 지문을 다시 뽑는 것은 값이 **의도적으로** 바뀔 때뿐이다:  GTO_GOLDEN_WRITE=1 npx vitest run src/lib/gtoDataInvariance.test.ts
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  HAND_ORDER, NASH_KS, NASH_STACKS, hasNashRange, nashRange, isNashQuarantined, isNashApprox, isMultiwayUncapped,
  type NashKind,
} from './nash.data';
import { RANGE_SCENARIOS, RANGE_GROUPS, ACTION_COLORS } from './ranges.data';
import { buildFreq, gridName } from './ranges';
import { makeQuiz, MODES, KEY_PREFIX, PUSH_POS, PUSH_STACKS_AVAILABLE, type Mode } from './preflopQuiz';
import { evaluateSpot, amountToCall, heroActionClass } from './spotEvaluate';
import { emptySpot, positionsFor, committedBb, type SpotReview, type SpotAction } from './spot';

const GOLDEN = new URL('./gtoDataInvariance.golden.json', import.meta.url);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const HANDS: string[] = [];
for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) HANDS.push(gridName(i, j));
const cardsOf = (h: string): string[] => {
  if (h.length === 2) return [`${h[0]}s`, `${h[1]}h`];
  return h[2] === 's' ? [`${h[0]}s`, `${h[1]}s`] : [`${h[0]}s`, `${h[1]}h`];
};

let SPOT_KINDS: [string, number][] = [];
let SPOT_LINE_KINDS: Record<string, Record<string, number>> = {};
let SB_SHOVE_KINDS: Record<string, number> = {};
let STAGE_A = { smallRaiseJudged: -1, deepExact: -1 };
function sections(): Record<string, { n: number; s: string }> {
  const out: Record<string, string[]> = {};
  const add = (sec: string, line: string) => (out[sec] ??= []).push(line);

  // ① Nash
  add('nash:order', HAND_ORDER.join(','));
  for (const kind of ['shove', 'callBB', 'callSB'] as NashKind[]) for (const ante of [false, true]) {
    const sec = `nash:${kind}:${ante ? 'ante' : 'no'}`;
    for (const k of NASH_KS) for (const stack of NASH_STACKS) {
      const flags = [isNashQuarantined(stack, ante, k, kind), isNashApprox(stack, ante, k), isMultiwayUncapped(stack, k, ante)].map(Number).join('');
      for (const approx of [false, true]) {
        add(sec, `${k}|${stack}|${+approx}|${flags}|${+hasNashRange(kind, k, stack, ante, approx)}|${Array.from(nashRange(kind, k, stack, ante, approx)).join(',')}`);
      }
    }
  }

  // ② 레인지
  add('ranges:meta', JSON.stringify({ ACTION_COLORS, RANGE_GROUPS }));
  for (const sc of RANGE_SCENARIOS) {
    const { actions, ...meta } = sc;
    add(`ranges:${sc.group}`, JSON.stringify(meta));
    for (const a of actions) {
      const f = buildFreq(a.spec);
      add(`ranges:${sc.group}`, `${sc.id}|${a.key}|${a.label}|${HANDS.map((h) => f.get(h) ?? 0).join(',')}`);
    }
  }

  // ③ 드릴 — 복원 키만(새 문제 뽑기는 무작위라 비교 대상이 아니다)
  const quizLine = (m: Mode, key: string) => {
    // cards 는 무늬를 무작위로 고른다(같은 핸드의 다른 그림) — 값이 아니라 표시라 뺀다.
    const { cards, ...q } = makeQuiz(m, key);
    void cards;
    return q.key === key ? JSON.stringify(q) : `${key}|null`;
  };
  add('quiz:push-stacks', PUSH_STACKS_AVAILABLE.join(','));
  for (const { id: m } of MODES) {
    if (m === 'push') {
      for (const { k } of PUSH_POS) for (const st of NASH_STACKS) for (const h of HANDS) add('quiz:push', quizLine(m, `push|${k}-${st}|${h}`));
    } else if (m === 'call') {
      for (const seat of ['bb', 'sb']) for (const k of NASH_KS) for (const st of NASH_STACKS) for (const h of HANDS) add('quiz:call', quizLine(m, `call|${seat}-${k}-${st}|${h}`));
    } else {
      for (const sc of RANGE_SCENARIOS) for (const h of HANDS) add(`quiz:${m}`, quizLine(m, `${KEY_PREFIX[m]}|${sc.id}|${h}`));
    }
  }

  // ④ SPOT 판정 — 등급·판정·빈도·수치(문장은 빼고 구조만: 문구 수정이 지문을 흔들지 않게)
  const kinds: Record<string, number> = {};
  const lineKinds: Record<string, Record<string, number>> = {};
  const sbShove: Record<string, number> = {};
  let smallRaiseJudged = 0;
  let deepExact = 0;
  const raise = (actor: 'hero' | 'villain', sizeBb: number): SpotAction => ({ street: 'preflop', actor, type: 'raise', sizeBb });
  for (const tableSize of [2, 6, 9, 10]) {
    const seats = positionsFor(tableSize);
    for (const heroPos of seats) for (const villainPos of seats) {
      if (heroPos === villainPos) continue;
      // 줄을 두 무리로 나눈다 — 차트 조회는 호출마다 레인지를 펼쳐 비싸다(실측 9~26µs, Nash 2~4µs).
      //   차트 줄(100bb 표): 100 = 정확 · 80 = 유사 스팟(70~150 띠) · 69 = 띠 밖. 앤티는 차이 문구 하나라 0·1.
      //   Nash 줄: 표 깊이 + 사이 스택(13·9.8·9.5 — 가까운 표·동률 규칙) · 앤티 0.5(1BB 표와 다른 총액).
      const groups: [number[], number[], [string, (eff: number) => SpotAction[], (eff: number) => Partial<SpotReview>][]][] = [
        [[100, 80, 69], [0, 1], [
          ['open', () => [], () => ({ heroAction: 'raise', heroActionSizeBb: 2.5 })],
          ['vsOpen', () => [raise('villain', 2.5)], () => ({ heroAction: 'call' })],
          ['vsOpenFold', () => [raise('villain', 2.5)], () => ({ heroAction: 'fold' })],
          ['vs3bet', () => [raise('hero', 2.5), raise('villain', 9)], () => ({ heroAction: 'call' })],
          ['vs3betFold', () => [raise('hero', 2.5), raise('villain', 9)], () => ({ heroAction: 'fold' })],
        ]],
        [[20, 15, 13, 10, 9.8, 9.5, 5, 2], [0, 0.5, 1], [
          ['vsShove', (eff) => [raise('villain', eff)], () => ({ heroAction: 'call' })],
          // 셔브·미니레이즈 크기는 아래 루프에서 '이미 낸 돈'(SB 0.5 · BB 1+앤티)을 빼서 채운다 — 증분이다.
          //   예전에는 셔브 증분 = 스택이라 SB 줄이 전부 '스택 초과' 입력 오류였고 SB(뒤 1명) 표를 한 번도 안 지났다(critical PR #156).
          ['shove', () => [], () => ({ heroAction: 'raise' })],
          ['shove2stk', () => [], (eff) => ({ heroAction: 'raise', heroStackBb: eff, villainStackBb: eff * 2 })],
          ['pfFold', () => [], () => ({ heroAction: 'fold' })],
          ['minraise', () => [], () => ({ heroAction: 'raise' })],
        ]],
      ];
      for (const [stacks, antes, lines] of groups) for (const eff of stacks) for (const anteBb of antes) {
        for (const [name, mkActions, mkOver] of lines) {
          const actions = mkActions(eff);
          const over = mkOver(eff);
          const sec = `spot:${tableSize}:${name}`;
          const lk = (lineKinds[name] ??= {});
          for (const h of HANDS) {
            const s: SpotReview = { ...emptySpot(), tableSize, heroPos, villainPos, effectiveBb: eff, anteBb, actions, hero: cardsOf(h), ...over };
            if (s.heroAction === 'call') s.heroActionSizeBb = amountToCall(s);
            if (name.startsWith('shove')) s.heroActionSizeBb = eff - committedBb(s, heroPos);
            if (name === 'minraise') s.heroActionSizeBb = Math.max(0, 2 - committedBb(s, heroPos));
            const e = evaluateSpot(s);
            kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
            lk[e.kind] = (lk[e.kind] ?? 0) + 1;
            if (name.startsWith('shove') && heroPos === 'SB') sbShove[e.kind] = (sbShove[e.kind] ?? 0) + 1;
            // 단계 A 불변식 — 작은 레이즈는 판정하지 않고, 12BB 이상(S ≥ 11)은 푸시·폴드 표로 정확 판정하지 않는다
            if (heroActionClass(s) === 'raise' && eff <= 20 && ['good', 'mixed', 'improve'].includes(e.verdict)) smallRaiseJudged++;
            if (eff >= 12 && eff <= 20 && e.kind === 'chart_nash') deepExact++;
            const c = e as Partial<{ mix: unknown; absent: unknown; heroFreq: unknown; differences: unknown[]; drill: unknown }>;
            add(sec, `${heroPos}|${villainPos}|${eff}|${anteBb}|${h}|${e.kind}|${e.verdict}|${JSON.stringify([c.mix, c.absent, c.heroFreq, c.differences?.length, c.drill, e.math, e.issues.length])}`);
          }
        }
      }
    }
  }
  SPOT_LINE_KINDS = lineKinds;
  SB_SHOVE_KINDS = sbShove;
  STAGE_A = { smallRaiseJudged, deepExact };
  SPOT_KINDS = Object.entries(kinds).sort();
  add('spot:kinds', JSON.stringify(SPOT_KINDS));

  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { n: v.length, s: sha(v.join('\n')) }]));
}

describe('GTO 데이터 불변 — 분할 전 지문과 전수 비교', () => {
  const now = sections();
  if (process.env.GTO_GOLDEN_WRITE === '1') writeFileSync(GOLDEN, JSON.stringify(now, null, 1) + '\n');
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, { n: number; s: string }>;

  it('구역 목록이 같다(표가 사라지거나 새로 생기지 않았다)', () => {
    expect(Object.keys(now).sort()).toEqual(Object.keys(golden).sort());
  });

  it.each(Object.keys(golden))('%s — 항목 수와 지문이 분할 전과 같다', (sec) => {
    expect(now[sec]?.n, `${sec} 항목 수`).toBe(golden[sec].n);
    expect(now[sec]?.s, `${sec} 값이 바뀌었다`).toBe(golden[sec].s);
  });

  it('SPOT 그리드가 실제 표 조회를 지나간다(전부 범위 밖이면 이 비교는 아무것도 안 본 것이다)', () => {
    const k = Object.fromEntries(SPOT_KINDS) as Record<string, number>;
    const msg = JSON.stringify(k);
    // 2026-10-04 실측(콜 크기 반영 뒤): chart_nash 444,132 · normalized_reference 767,598 · math_only 1,521,338 · unsupported 611,104
    // 2026-10-04 단계 A 뒤(셔브 증분 = 스택 − 낸 돈 · 폴드/미니레이즈 줄 추가 · 10BB 상한): chart_nash 439,062 · normalized_reference 1,996,566 · math_only 2,244,320 · unsupported 237,952
    //   지문을 다시 뽑은 이유와 바뀐 구역 표는 보고서 spot-stage-a-1004.md — 10BB 이하 폴드·올인 줄은 옛 엔진과 한 줄도 다르지 않다.
    expect(k.chart_nash ?? 0, msg).toBeGreaterThan(200_000);
    expect(k.normalized_reference ?? 0, msg).toBeGreaterThan(300_000);
    expect(k.math_only ?? 0, msg).toBeGreaterThan(500_000);
  });

  it('SPOT SB 첫 진입 셔브 — SB(뒤 1명) 표를 실제로 지난다(셔브 증분 = 스택 − 0.5)', () => {
    expect(SB_SHOVE_KINDS.chart_nash ?? 0, JSON.stringify(SB_SHOVE_KINDS)).toBeGreaterThan(0);
  });

  it('단계 A — 작은 레이즈는 푸시·폴드 표로 판정하지 않고, 12BB 이상은 정확 판정(chart_nash)이 없다', () => {
    expect(STAGE_A).toEqual({ smallRaiseJudged: 0, deepExact: 0 });
  });

  it.each(['open', 'vsOpen', 'vsOpenFold', 'vs3bet', 'vs3betFold', 'shove', 'shove2stk', 'pfFold', 'minraise'])(
    'SPOT 줄 %s — 입력 오류로 전부 막히지 않고 차트·Nash 판정이 실제로 나온다', (name) => {
      const lk = SPOT_LINE_KINDS[name] ?? {};
      expect((lk.chart_nash ?? 0) + (lk.normalized_reference ?? 0), `${name}: ${JSON.stringify(lk)}`).toBeGreaterThan(0);
    });

  // 셔브에 콜하는 표는 SPOT 판정에 없다(Nash 는 첫 진입 셔브만) — 대신 입력 오류 없이 수학 판정까지는 가야 한다.
  it('SPOT 줄 vsShove — 입력 오류로 전부 막히지 않는다(수학 판정이 나온다)', () => {
    const lk = SPOT_LINE_KINDS.vsShove ?? {};
    expect(lk.math_only ?? 0, JSON.stringify(lk)).toBeGreaterThan(0);
  });
});
