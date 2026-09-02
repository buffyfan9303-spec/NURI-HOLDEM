import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import RangeMatrix13, { type MatrixAction } from './RangeMatrix13';
import { ACTION_COLORS } from '../../../lib/ranges.data';
import { freqFromArray } from '../../../lib/ranges';
import { HAND_ORDER, NASH_STACKS, nashRange } from '../../../lib/nash.data';
import Icon from '../../atoms/Icon';

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

export default function PushFoldChart({ initialK, initialStack, initialAnte, initialView, highlight }: {
  /** 오답 노트 '차트에서 보기' — 그 포지션·스택·셀(올인 콜 오답은 콜 표)로 바로 진입. initialAnte 는 라이브 탭 내 토너 카드(현재 레벨 앤티 유무) */
  initialK?: number; initialStack?: number; initialAnte?: boolean; initialView?: View; highlight?: string;
} = {}) {
  const [k, setK] = useState(POSITIONS.some((p) => p.k === initialK) ? initialK! : 2); // BTN 기본 — 가장 자주 찾는 자리
  const [stack, setStack] = useState((NASH_STACKS as readonly number[]).includes(initialStack ?? -1) ? initialStack! : 10);
  const [ante, setAnte] = useState(initialAnte ?? false);
  const [view, setView] = useState<View>(initialView ?? 'shove');
  const pos = POSITIONS.find((p) => p.k === k)!;

  // SB 콜 레인지는 SB 가 콜러인 상황(k>=2)에서만 존재(k=1 은 SB 가 셔버 본인)
  const effView: View = view === 'callSB' && k < 2 ? 'callBB' : view;

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
    // 제목은 전체화면 헤더가 이미 표시 — 카드 안은 설명만(2중 노출 제거)
    <CalcCard desc="숏스택 올인 균형 · 포지션·스택·앤티별, 콜 레인지까지">
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

      {/* 보기 — 누가 올인하고, 누가 콜하는지 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex rounded-input border border-border-default bg-surface-high p-0.5">
          {([
            { id: 'shove' as const, label: `${pos.label} 올인` },
            { id: 'callBB' as const, label: 'BB 콜' },
            ...(k >= 2 ? [{ id: 'callSB' as const, label: 'SB 콜' }] : []),
          ]).map((v) => (
            <button key={v.id} type="button" onClick={() => setView(v.id)}
              className={['h-7 px-2.5 rounded-[6px] text-2xs font-bold leading-none transition-colors', effView === v.id ? 'bg-accent-300 text-white' : 'text-ink-muted'].join(' ')}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* 앤티(ante) — 초보용 설명 포함 */}
      <div className="rounded-input border border-border-subtle bg-surface-high/60 px-2 py-1.5 space-y-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-2xs font-bold text-ink-secondary">앤티</span>
          <div className="inline-flex rounded-input border border-border-default bg-surface-high p-0.5">
            {([{ v: false, label: '없음' }, { v: true, label: 'BB 앤티' }] as const).map((a) => (
              <button key={String(a.v)} type="button" onClick={() => setAnte(a.v)} aria-pressed={ante === a.v}
                className={['h-6 px-2.5 rounded-[6px] text-2xs font-bold leading-none transition-colors', ante === a.v ? 'bg-accent-300 text-white' : 'text-ink-muted'].join(' ')}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-2xs leading-relaxed text-ink-muted">
          앤티 = 핸드 시작 전에 미리 내는 강제 칩. 요즘 토너먼트는 보통 <b className="text-ink-secondary">BB 한 명이 대표로 1BB</b>를 낸다(=BB 앤티). 팟이 미리 커져 있어 <b className="text-ink-secondary">올인·콜을 더 넓게</b> 한다. 우리 대회에 앤티가 없으면 <b className="text-ink-secondary">‘없음’</b>으로 둔다.
        </p>
      </div>

      <p className="text-2xs leading-relaxed text-ink-secondary rounded-input bg-surface-high/60 border border-border-subtle px-2 py-1.5">
        <Icon name="lightbulb" size={12} className="mr-0.5 inline-block align-[-1px] shrink-0 text-accent-300" />{effView === 'shove'
          ? `${pos.label}(${pos.desc})에서 ${stack}bb로 첫 진입 올인하는 균형 레인지${ante ? '. BB 앤티가 팟을 키워 더 넓게 민다' : ''}.`
          : effView === 'callBB'
            ? `${pos.label}의 ${stack}bb 올인에 BB가 콜하는 균형 레인지. 팟오즈 덕에 생각보다 넓다${ante ? ' (앤티로 더 넓어짐)' : ''}.`
            : `${pos.label}의 ${stack}bb 올인에 SB가 콜하는 균형 레인지. 뒤에 BB가 남아 BB 콜보다 타이트하다.`}
      </p>

      <RangeMatrix13 actions={actions} initialSel={highlight} />

      <p className="text-2xs text-ink-muted text-center leading-relaxed">
        ※ 자체 계산 Nash 균형(fictitious play, 첫 진입 올인·단일 콜러 모델) — 몬테카를로 에퀴티 4만회/쌍 기반.
        부분 채움 셀은 혼합 전략(그 빈도만큼만 올인). 앤티는 BB 앤티 1bb 기준.
      </p>
    </CalcCard>
  );
}
