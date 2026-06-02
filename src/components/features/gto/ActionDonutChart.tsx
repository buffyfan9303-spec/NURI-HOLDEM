// src/components/features/gto/ActionDonutChart.tsx
import type { ActionFrequency } from './gto.types';

type Key = 'raise' | 'call' | 'fold' | 'allin';
const COLORS: Record<Key, string> = { raise: '#EF4444', call: '#22C55E', fold: '#3B82F6', allin: '#A855F7' };
const LABELS: Record<Key, string> = { raise: '레이즈', call: '콜', fold: '폴드', allin: '올인' };

interface Props {
  frequency: Required<ActionFrequency> | null;
  /** 포스트플랍이면 레이즈->벳, 콜->체크로 라벨 전환 */
  mode?: 'preflop' | 'postflop';
}

export default function ActionDonutChart({ frequency, mode = 'preflop' }: Props) {
  const labels: Record<Key, string> = mode === 'postflop'
    ? { ...LABELS, raise: '벳', call: '체크' }
    : LABELS;
  const size = 200;
  const stroke = 28;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  if (!frequency) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center text-center text-2xs text-ink-muted">
        카드를 선택하면<br />GTO 액션 빈도가 표시됩니다
      </div>
    );
  }

  const order: Key[] = ['raise', 'call', 'fold', 'allin'];
  const segs = order
    .map((k) => ({ key: k, value: frequency[k] ?? 0 }))
    .filter((s) => s.value > 0.0001);
  const dominant = segs.reduce((a, b) => (b.value > a.value ? b : a), segs[0] ?? { key: 'fold' as Key, value: 1 });

  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1d24" strokeWidth={stroke} />
          {segs.map((s) => {
            const len = s.value * c;
            const node = (
              <circle
                key={s.key}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={COLORS[s.key]}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-acc}
              />
            );
            acc += len;
            return node;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-extrabold tabular-nums" style={{ color: COLORS[dominant.key] }}>
            {Math.round(dominant.value * 100)}%
          </span>
          <span className="text-xs font-semibold text-ink-secondary">{labels[dominant.key]}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {order.filter((k) => (frequency[k] ?? 0) > 0.0001 || k !== 'allin').map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: COLORS[k] }} />
            <span className="text-xs text-ink-secondary">{labels[k]}</span>
            <span className="text-xs font-bold tabular-nums text-ink-primary">{Math.round((frequency[k] ?? 0) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
