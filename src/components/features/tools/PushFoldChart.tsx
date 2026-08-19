import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import RangeMatrix13, { type MatrixAction } from './RangeMatrix13';
import { ACTION_COLORS } from '../../../lib/ranges.data';
import { freqFromArray } from '../../../lib/ranges';
import { HAND_ORDER, NASH_STACKS, nashRange } from '../../../lib/nash.data';

// 푸시·폴드 차트 — 자체 계산 Nash 균형(fictitious play)로 전면 교체.
// 예전 버전은 스택 6구간×비율 1개(총 6개 숫자)짜리 근사에 포지션 축도, 콜 레인지도 없었다.
// 이제: 포지션 8자리 × 스택 12구간 × 안테 온/오프 × 셔브/콜(BB·SB) 전부 실계산 데이터.

const POSITIONS: { k: number; label: string; desc: string }[] = [
  { k: 8, label: 'UTG(9인)', desc: '뒤에 8명' },
  { k: 7, label: 'UTG+1', desc: '뒤에 7명' },
  { k: 6, label: 'UTG+2', desc: '뒤에 6명' },
  { k: 5, label: 'LJ', desc: '뒤에 5명' },
  { k: 4, label: 'HJ', desc: '뒤에 4명' },
  { k: 3, label: 'CO', desc: '뒤에 3명' },
  { k: 2, label: 'BTN', desc: '뒤에 2명(블라인드)' },
  { k: 1, label: 'SB', desc: 'BB와 헤즈업' },
];

type View = 'shove' | 'callBB' | 'callSB';

export default function PushFoldChart() {
  const [k, setK] = useState(2); // BTN 기본 — 가장 자주 찾는 자리
  const [stack, setStack] = useState(10);
  const [ante, setAnte] = useState(false);
  const [view, setView] = useState<View>('shove');
  const pos = POSITIONS.find((p) => p.k === k)!;

  // SB 콜 레인지는 BTN 셔브(k=2) 상황에서만 존재
  const effView: View = view === 'callSB' && k !== 2 ? 'callBB' : view;

  const actions = useMemo<MatrixAction[]>(() => {
    const arr = nashRange(effView, k, stack, ante);
    return [{
      key: effView,
      label: effView === 'shove' ? '올인' : '콜',
      color: effView === 'shove' ? ACTION_COLORS.raise : ACTION_COLORS.call,
      freq: freqFromArray(arr, HAND_ORDER),
    }];
  }, [effView, k, stack, ante]);

  return (
    <CalcCard title="푸시 · 폴드 차트" desc="숏스택 올인 균형 — 포지션·스택·안테별, 콜 레인지까지">
      {/* 포지션 */}
      <div className="grid grid-cols-4 gap-1">
        {POSITIONS.map((p) => {
          const on = p.k === k;
          return (
            <button key={p.k} type="button" onClick={() => setK(p.k)}
              className={['h-8 rounded-input text-2xs font-bold leading-none border transition-colors focus:outline-none',
                on ? 'bg-accent-300 border-accent-300 text-white' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
              {p.label}
            </button>
          );
        })}
      </div>

      {/* 스택(bb) */}
      <div className="flex flex-wrap items-center gap-1">
        {NASH_STACKS.map((s) => {
          const on = s === stack;
          return (
            <button key={s} type="button" onClick={() => setStack(s)}
              className={['h-8 min-w-[2.4rem] px-1.5 rounded-input text-2xs font-bold leading-none border tabular-nums transition-colors focus:outline-none',
                on ? 'bg-accent-300 border-accent-300 text-white' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
              {s}bb
            </button>
          );
        })}
      </div>

      {/* 보기 (셔브/콜) + 안테 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex rounded-input border border-border-default bg-surface-high p-0.5">
          {([
            { id: 'shove' as const, label: `${pos.label} 올인` },
            { id: 'callBB' as const, label: 'BB 콜' },
            ...(k === 2 ? [{ id: 'callSB' as const, label: 'SB 콜' }] : []),
          ]).map((v) => (
            <button key={v.id} type="button" onClick={() => setView(v.id)}
              className={['h-7 px-2.5 rounded-[6px] text-2xs font-bold leading-none transition-colors', effView === v.id ? 'bg-accent-300 text-white' : 'text-ink-muted'].join(' ')}>
              {v.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAnte(!ante)} aria-pressed={ante}
          className={['h-8 px-2.5 rounded-input text-2xs font-bold leading-none border transition-colors focus:outline-none',
            ante ? 'bg-amber-400/20 border-amber-400/50 text-amber-300' : 'bg-surface-high border-border-default text-ink-muted'].join(' ')}>
          BB안테 {ante ? 'ON' : 'OFF'}
        </button>
      </div>
      <p className="text-2xs leading-relaxed text-ink-secondary rounded-input bg-surface-high/60 border border-border-subtle px-2 py-1.5">
        💡 {effView === 'shove'
          ? `${pos.label}(${pos.desc})에서 ${stack}bb로 첫 진입 올인하는 균형 레인지${ante ? ' — BB안테가 팟을 키워 더 넓게 밀 수 있다' : ''}.`
          : effView === 'callBB'
            ? `${pos.label}의 ${stack}bb 올인에 대한 BB의 균형 콜 레인지 — 팟오즈 때문에 생각보다 넓다.`
            : `BTN의 ${stack}bb 올인에 대한 SB의 균형 콜 레인지 — 뒤에 BB가 남아 BB 콜보다 타이트하다.`}
      </p>

      <RangeMatrix13 actions={actions} />

      <p className="text-2xs text-ink-muted text-center leading-relaxed">
        ※ 자체 계산 Nash 균형(fictitious play, 첫 진입 올인·단일 콜러 모델) — 몬테카를로 에퀴티 4만회/쌍 기반.
        부분 채움 셀은 혼합 전략(그 빈도만큼만 올인). 안테는 BB안테 1bb 기준.
      </p>
    </CalcCard>
  );
}
