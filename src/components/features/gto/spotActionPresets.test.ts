// 액션 프리셋 — 클릭이 아니라 **결과 배열**을 본다(vitest 환경이 node 라 패널을 렌더할 수 없다).
// 실행: npx vitest run src/components/features/gto/spotActionPresets.test.ts
import { describe, it, expect } from 'vitest';
import { ACTION_PRESETS, applyPreset } from './NuriSpotPanel';
import type { SpotAction } from '../../../lib/spot';

const label = (k: string) => ACTION_PRESETS.find((p) => p.key === k)!;

describe('ACTION_PRESETS — 프리셋이 만드는 액션 줄', () => {
  it('네 개이고 이름에 "액션 추가" 가 없다', () => {
    // e2e/nuri-spot.spec.ts:148 이 '액션 추가' 로 버튼 1개를 **부분일치**로 집는다 — 프리셋이 걸리면 strict 위반.
    expect(ACTION_PRESETS.map((p) => p.key)).toEqual(['firstin', 'vsopen', 'vs3bet', 'vsbet']);
    for (const p of ACTION_PRESETS) expect(p.label, p.key).not.toContain('액션 추가');
  });

  it('첫 진입 = 액션 0줄(RFI)', () => {
    expect(label('firstin').actions('preflop')).toEqual([]);
  });

  it('상대 오픈 2.5BB = 상대 레이즈 한 줄', () => {
    expect(label('vsopen').actions('preflop')).toEqual([
      { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 },
    ]);
  });

  it('내 오픈 2.5 → 상대 3벳 8 = 두 줄이 이 순서로', () => {
    // SIZE_PRESETS.pre 에 8 이 없어 오늘은 이 줄에 반드시 타이핑 1회가 든다 — 프리셋이 그것을 없앤다.
    expect(label('vs3bet').actions('preflop')).toEqual([
      { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 },
      { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 8 },
    ]);
  });

  it('상대 벳은 스트리트에 따라 크기가 다르다', () => {
    expect(label('vsbet').actions('preflop')[0].sizeBb).toBe(2.5);
    expect(label('vsbet').actions('flop')[0].sizeBb).toBe(3);
    expect(label('vsbet').actions('flop')[0].street).toBe('flop');
  });
});

describe('applyPreset — 지금 스트리트만 갈아끼운다', () => {
  const pre: SpotAction[] = [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }];
  const flop: SpotAction[] = [{ street: 'flop', actor: 'villain', type: 'bet', sizeBb: 3 }];

  it('같은 스트리트의 옛 줄은 지운다(쌓지 않는다)', () => {
    const out = applyPreset(pre, 'preflop', label('vsopen').actions('preflop'));
    expect(out).toHaveLength(1);
    expect(out[0].sizeBb).toBe(2.5);
  });

  it('앞 스트리트에 쌓아 둔 기록은 지우지 않는다 — 기능 소실 금지', () => {
    const out = applyPreset([...pre, ...flop], 'flop', label('vsbet').actions('flop'));
    expect(out.filter((a) => a.street === 'preflop')).toEqual(pre);
    expect(out.filter((a) => a.street === 'flop')).toHaveLength(1);
  });

  it('스트리트 순서대로 정렬된다 — 늦은 스트리트가 앞으로 끼어들지 않는다', () => {
    const out = applyPreset(flop, 'preflop', label('vs3bet').actions('preflop'));
    expect(out.map((a) => a.street)).toEqual(['preflop', 'preflop', 'flop']);
    // 안정 정렬 — 스트리트 안 순서(내 오픈 → 상대 3벳)는 그대로여야 한다.
    expect(out.slice(0, 2).map((a) => a.actor)).toEqual(['hero', 'villain']);
  });

  it('첫 진입은 그 스트리트를 비운다', () => {
    expect(applyPreset(pre, 'preflop', label('firstin').actions('preflop'))).toEqual([]);
  });
});
