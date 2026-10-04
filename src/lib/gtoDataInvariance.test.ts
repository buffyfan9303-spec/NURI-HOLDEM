// GTO 데이터 불변 계약 — 번들 분할(지연 로딩) 전후로 **계산 결과가 한 글자도 안 바뀌었는가**.
//
// 2026-10-04 오너 지시 "기능·성능은 그대로, 불러오는 용량만 조절". 데이터 모듈을 언제 받는지는 바꿔도
// 값은 바꾸면 안 된다. 이 테스트는 분할 **전** 코드로 뽑은 지문(golden)과 지금 코드를 전수 비교한다.
//   ① Nash 표 — 3종 × 앤티 2 × k 1~8 × 스택 12 × 근사 허용 2 × 169핸드, 격리·근사 판정 포함
//   ② 레인지 표 — 전 시나리오의 액션별 169핸드 빈도 + 색·그룹
//   ③ 드릴 문제 — 복원 가능한 모든 키(차트 4모드 · 푸시 · 콜)의 정답 빈도
//   ④ SPOT 판정 — 인원 4종 × 자리 쌍 × 스택 × 앤티 × 액션 줄 × 169핸드의 등급·빈도·판정·수치
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
import { evaluateSpot } from './spotEvaluate';
import { emptySpot, positionsFor, type SpotReview, type SpotAction } from './spot';

const GOLDEN = new URL('./gtoDataInvariance.golden.json', import.meta.url);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const HANDS: string[] = [];
for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) HANDS.push(gridName(i, j));
const cardsOf = (h: string): string[] => {
  if (h.length === 2) return [`${h[0]}s`, `${h[1]}h`];
  return h[2] === 's' ? [`${h[0]}s`, `${h[1]}s`] : [`${h[0]}s`, `${h[1]}h`];
};

let SPOT_KINDS: [string, number][] = [];
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
  for (const tableSize of [2, 6, 9, 10]) {
    const seats = positionsFor(tableSize);
    for (const heroPos of seats) for (const villainPos of seats) {
      if (heroPos === villainPos) continue;
      for (const eff of [100, 40, 20, 15, 12, 10, 8, 6, 5, 3, 2]) for (const anteBb of [0, 1]) {
        const lines: [string, SpotAction[], Partial<SpotReview>][] = [
          ['open', [], { heroAction: 'raise', heroActionSizeBb: 2.5 }],
          ['vsOpen', [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }], { heroAction: 'call' }],
          ['vs3bet', [{ street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 }, { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 9 }], { heroAction: 'call' }],
          ['vsShove', [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: eff }], { heroAction: 'call' }],
          ['shove', [], { heroAction: 'raise', heroActionSizeBb: eff }],
          ['shove2stk', [], { heroAction: 'raise', heroActionSizeBb: eff, heroStackBb: eff, villainStackBb: eff * 2 }],
        ];
        for (const [name, actions, over] of lines) {
          const sec = `spot:${tableSize}:${name}`;
          for (const h of HANDS) {
            const s: SpotReview = { ...emptySpot(), tableSize, heroPos, villainPos, effectiveBb: eff, anteBb, actions, hero: cardsOf(h), ...over };
            const e = evaluateSpot(s);
            kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
            const c = e as Partial<{ mix: unknown; absent: unknown; heroFreq: unknown; differences: unknown[]; drill: unknown }>;
            add(sec, `${heroPos}|${villainPos}|${eff}|${anteBb}|${h}|${e.kind}|${e.verdict}|${JSON.stringify([c.mix, c.absent, c.heroFreq, c.differences?.length, c.drill, e.math, e.issues.length])}`);
          }
        }
      }
    }
  }
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
    // 2026-10-04 실측: chart_nash 1,087,177 · normalized_reference 107,991 · math_only 553,306 · unsupported 2,579,278
    expect(k.chart_nash ?? 0).toBeGreaterThan(500_000);
    expect(k.normalized_reference ?? 0).toBeGreaterThan(50_000);
    expect(k.math_only ?? 0).toBeGreaterThan(100_000);
  });
});
