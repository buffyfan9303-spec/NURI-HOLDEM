// 🔴 2026-10-09 오너 결정(GTO-F1) — 푸시·폴드 차트에서 '다인 콜 근사(추정)' 칸을 **'준비 중'으로 가린다.**
//   대상: 빅 앤티 · 뒤 3명 이상(CO·HJ·LJ·UTG+2·UTG+1·UTG) · 6~10bb · 올인/BB 콜/SB 콜 = 6 × 5 × 3 = **90칸**.
//   정확 판정이 된 칸(SB·BTN 전 깊이, 뒤 3명+ 의 2~5bb 다인 균형·12bb 이상)만 보여 준다(오너 이전 지시 A-059·B-041).
//
// 이 파일은 세 소비처를 한꺼번에 잠근다 — 하나라도 가린 칸으로 정답을 내면 빨개진다.
//   ① 차트(PushFoldChart) — 가린 90칸은 행렬 대신 '정확한 계산을 준비 중' 안내, 나머지 186칸은 정확 표 값 그대로 행렬
//   ② 드릴·트레이너·오답 노트(preflopQuiz.makeQuiz) — 가린 칸 키는 복원되지 않고, 새로 뽑아도 나오지 않는다
//   ③ NURI SPOT 판정(spotEvaluate) — 가린 칸 표로 '차트/Nash 기준' 판정을 내지 않는다
// ⚠ 가린 칸 목록은 **일부러 nash.data.ts 상수에서 읽지 않고 여기 적는다** — 상수를 바꾸는 한 줄 회귀를 이 테스트가 잡아야 한다.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import PushFoldChart from './PushFoldChart';
import RangeMatrix13 from './RangeMatrix13';
import { ACTION_COLORS } from '../../../lib/ranges.data';
import { freqFromArray } from '../../../lib/ranges';
import { HAND_ORDER, NASH_BIG_ANTE, NASH_STACKS, nashRange, type NashKind } from '../../../lib/nash.data';
import { makeQuiz, PUSH_POS } from '../../../lib/preflopQuiz';
import { evaluateSpot } from '../../../lib/spotEvaluate';
import { emptySpot, positionsFor, committedBb, type SpotReview } from '../../../lib/spot';

const HIDDEN_KS = [3, 4, 5, 6, 7, 8];          // 뒤 3명 이상 — 차트 자리 CO·HJ·LJ·UTG+2·UTG+1·UTG(9인)
const HIDDEN_STACKS = [6, 7, 8, 9, 10];
const VIEWS: NashKind[] = ['shove', 'callBB', 'callSB'];
const CHART_KS = [8, 7, 6, 5, 4, 3, 2, 1];     // PushFoldChart 의 POSITIONS 와 같은 8자리

const isHidden = (k: number, s: number) => HIDDEN_KS.includes(k) && HIDDEN_STACKS.includes(s);
/** 차트가 실제로 그리는 (자리, 깊이, 보기) 조합 — SB(k=1)는 SB 콜 보기가 없다(셔버 본인). */
const combos: [number, number, NashKind][] = [];
for (const k of CHART_KS) for (const s of NASH_STACKS) for (const v of VIEWS) if (!(v === 'callSB' && k < 2)) combos.push([k, s, v]);
const hidden = combos.filter(([k, s]) => isHidden(k, s));
const shown = combos.filter(([k, s]) => !isHidden(k, s));

const CELL = / 상세"/g;
const render = (k: number, s: number, v: NashKind) => renderToStaticMarkup(<PushFoldChart initialK={k} initialStack={s} initialView={v} />);

describe('푸시·폴드 가림(2026-10-09 GTO-F1) — 조합 수', () => {
  it('가린 칸 90 · 보이는 칸 186 (총 276 = 8자리 × 12깊이 × 보기, SB 는 SB 콜 없음)', () => {
    expect(combos).toHaveLength(276);
    expect(hidden).toHaveLength(90);
    expect(shown).toHaveLength(186);
  });
});

describe('① 차트 — 가린 90칸은 행렬 대신 준비 중 안내', () => {
  it('가린 칸: 안내 상자 · 행렬 0칸 · 추정 배지 없음 · 눈금 data-has-data=false', () => {
    const bad: string[] = [];
    for (const [k, s, v] of hidden) {
      const html = render(k, s, v);
      const why: string[] = [];
      if (!html.includes('data-testid="pushfold-no-data"')) why.push('안내 상자 없음');
      if (!html.includes('정확한 계산을 준비 중')) why.push("'정확한 계산을 준비 중' 문구 없음");
      const cells = html.match(CELL)?.length ?? 0;
      if (cells) why.push(`행렬 ${cells}칸이 그려졌다`);
      if (html.includes('추정')) why.push("'추정' 문구가 남았다");
      if (!html.includes(`data-stack="${s}" data-has-data="false"`)) why.push('현재 깊이 눈금이 데이터 있음으로 표시');
      if (why.length) bad.push(`k=${k} ${s}bb ${v}: ${why.join(', ')}`);
    }
    expect(bad, `가린 칸이 화면에 정답으로 나간다(${bad.length}/90):\n${bad.slice(0, 12).join('\n')}`).toEqual([]);
  });

  it('보이는 186칸: 행렬 169칸이 정확 표(allowApprox 없음) 값 그대로 그려진다 — 값 불변', () => {
    const bad: string[] = [];
    for (const [k, s, v] of shown) {
      const html = render(k, s, v);
      // 차트 안의 행렬은 '정확 표'(드릴·스팟과 같은 기본 경로)로 그린 행렬과 **글자 하나까지** 같아야 한다
      const exact = nashRange(v, k, s, NASH_BIG_ANTE);
      const want = renderToStaticMarkup(<RangeMatrix13 actions={[{
        key: v, label: v === 'shove' ? '올인' : '콜', color: v === 'shove' ? ACTION_COLORS.raise : ACTION_COLORS.call,
        freq: freqFromArray(exact, HAND_ORDER),
      }]} />);
      const why: string[] = [];
      if (html.includes('data-testid="pushfold-no-data"')) why.push('안내 상자가 떴다(정확 칸까지 가렸다)');
      if (!exact.some((f) => f > 0)) why.push('정확 표가 전부 0');
      if (!html.includes(want)) why.push('행렬이 정확 표와 다르다');
      if (html.includes('추정')) why.push("'추정' 문구");
      if (why.length) bad.push(`k=${k} ${s}bb ${v}: ${why.join(', ')}`);
    }
    expect(bad, bad.slice(0, 12).join('\n')).toEqual([]);
  });

  it('안내 문구가 쓸 수 있는 깊이를 정확히 말한다 — CO 6bb 는 2·3·4·5·12·15·20bb (가린 깊이를 \'쓸 수 있다\' 고 하지 않는다)', () => {
    const html = render(3, 6, 'shove');
    expect(html).toContain('2·3·4·5·12·15·20bb');
    expect(html).toContain('6·7·8·9·10bb');
  });
});

describe('② 드릴·트레이너·오답 노트 — 가린 칸으로 문제를 내지 않는다', () => {
  it('가린 칸 키는 복원되지 않는다(오답 큐에서 되살아나지 않는다)', () => {
    const revived: string[] = [];
    for (const { k } of PUSH_POS) for (const s of HIDDEN_STACKS) {
      if (!HIDDEN_KS.includes(k)) continue;
      for (const hand of ['AA', 'A5s', 'K2o', '72o']) {
        for (const key of [`push|${k}-${s}|${hand}`, `call|bb-${k}-${s}|${hand}`, `call|sb-${k}-${s}|${hand}`]) {
          const q = makeQuiz(key.startsWith('push') ? 'push' : 'call', key);
          if (q.key === key) revived.push(key);
        }
      }
    }
    expect(revived).toEqual([]);
  });

  it('새로 뽑은 올인·콜 문제 3000개 중 가린 칸이 0개 · 양성 대조로 SB/BTN 6~10bb 는 나온다', () => {
    let hit = 0; let exactShallow = 0;
    for (let i = 0; i < 3000; i++) {
      const q = makeQuiz(i % 2 ? 'push' : 'call');
      const parts = q.key.split('|')[1].split('-');
      const k = Number(parts[q.mode === 'push' ? 0 : 1]);
      const s = Number(parts[q.mode === 'push' ? 1 : 2]);
      if (isHidden(k, s)) hit++;
      if (k <= 2 && HIDDEN_STACKS.includes(s)) exactShallow++;
    }
    expect(hit).toBe(0);
    expect(exactShallow, '양성 대조 — 얕은 깊이 문제가 하나도 안 나오면 이 검사는 아무것도 안 본 것이다').toBeGreaterThan(0);
  });
});

describe('④ 제품 코드 어디도 추정 표(allowApprox=true)를 읽지 않는다', () => {
  it('src 의 테스트 아닌 파일에 hasNashRange/nashRange(…, true) 5인자 호출이 0곳', () => {
    const root = join(__dirname, '../../..');   // src/
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(ent.name) && !/\.test\.(ts|tsx)$/.test(ent.name)) {
          const src = readFileSync(p, 'utf-8');
          if (/\b(?:hasNashRange|nashRange)\(\s*[^,()]+(?:,\s*[^,()]+){3},\s*true\s*\)/.test(src)) offenders.push(p.slice(root.length));
        }
      }
    };
    walk(root);
    expect(offenders, '추정 표를 읽는 제품 코드가 있다 — 가린 칸이 다시 정답으로 나간다').toEqual([]);
    expect(readFileSync(join(__dirname, 'PushFoldChart.tsx'), 'utf-8'), '차트 소스를 못 읽었다 — 위 검사가 빈 집합일 수 있다').toContain('hasNashRange(effView, k, stack, NASH_BIG_ANTE)');
  });
});

describe('③ NURI SPOT — 가린 칸 표로 차트/Nash 판정을 내지 않는다', () => {
  it('빅앤티 첫 진입 올인 · 5.5~12bb · 6/9/10인 전 자리: chart_nash 판정은 뒤 1~2명(SB·BTN) 또는 가리지 않은 깊이뿐', () => {
    const leaks: string[] = [];
    let positive = 0;
    for (const tableSize of [6, 9, 10]) for (const heroPos of positionsFor(tableSize)) {
      if (heroPos === 'BB') continue;
      for (let eff = 5.5; eff <= 12; eff += 0.5) {
        const s: SpotReview = { ...emptySpot(), tableSize, heroPos, villainPos: 'BB', effectiveBb: eff, anteBb: 1, actions: [], hero: ['As', '5s'], heroAction: 'raise' };
        s.heroActionSizeBb = eff - committedBb(s, heroPos);
        const e = evaluateSpot(s);
        if (e.kind !== 'chart_nash') continue;
        const m = (e as { sourceLabel?: string }).sourceLabel?.match(/푸시·폴드 차트 · (\d+)BB · 뒤 (\d+)명/);
        if (!m) continue;
        const [stack, k] = [Number(m[1]), Number(m[2])];
        if (isHidden(k, stack)) leaks.push(`${tableSize}인 ${heroPos} ${eff}bb → ${stack}BB 뒤 ${k}명`);
        else if (HIDDEN_STACKS.includes(stack)) positive++;
      }
    }
    expect(leaks, leaks.slice(0, 10).join('\n')).toEqual([]);
    expect(positive, '양성 대조 — SB·BTN 의 6~10bb 판정이 하나도 없으면 이 검사는 빈 집합을 본 것이다').toBeGreaterThan(0);
  });
});
