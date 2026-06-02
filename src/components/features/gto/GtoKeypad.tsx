// src/components/features/gto/GtoKeypad.tsx
import { RANKS, type Rank, type Suitedness } from './gto.types';

interface Props {
  ranks: readonly Rank[];
  suitedness: Suitedness;
  isPair: boolean;
  onRank: (rank: Rank) => void;
  onSuitedness: (s: Suitedness) => void;
  /** 한 칸 지우기(백스페이스) */
  onRemoveLast: () => void;
  /** 전체 초기화 */
  onClear: () => void;
}

const KEY_BASE =
  'h-14 rounded-input font-bold flex items-center justify-center select-none touch-manipulation ' +
  'transition-transform duration-100 active:scale-[0.92] focus:outline-none disabled:active:scale-100';

export default function GtoKeypad({
  ranks, suitedness, isPair, onRank, onSuitedness, onRemoveLast, onClear,
}: Props) {
  const empty = ranks.length === 0;

  return (
    <div className="space-y-2">
      {/* 상단: 전체 초기화 */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClear}
          disabled={empty}
          className="px-2 py-1 text-2xs font-semibold text-ink-muted hover:text-danger-light disabled:opacity-40 transition-colors focus:outline-none"
        >
          전체 초기화
        </button>
      </div>

      {/* 4 x 4 키패드 */}
      <div className="grid grid-cols-4 gap-1.5">
        {/* 13개 랭크 */}
        {RANKS.map((r) => {
          const active = ranks.includes(r);
          return (
            <button
              key={r}
              type="button"
              onClick={() => onRank(r)}
              aria-pressed={active}
              className={[
                KEY_BASE, 'text-lg',
                active
                  ? 'bg-gold-300 text-ink-inverse shadow-[0_0_12px_rgba(255,209,0,0.35)]'
                  : 'bg-surface-high text-ink-primary border border-border-default hover:border-gold-400/40 active:bg-surface-float',
              ].join(' ')}
            >
              {r}
            </button>
          );
        })}

        {/* 수딧 */}
        <button
          type="button"
          onClick={() => onSuitedness('suited')}
          disabled={isPair}
          aria-pressed={!isPair && suitedness === 'suited'}
          className={[
            KEY_BASE, 'text-sm',
            isPair
              ? 'bg-surface-low text-ink-muted/40 cursor-not-allowed'
              : suitedness === 'suited'
                ? 'bg-gold-300 text-ink-inverse'
                : 'bg-surface-high text-gold-300 border border-gold-400/40 active:bg-surface-float',
          ].join(' ')}
        >
          수딧
        </button>

        {/* 오프 */}
        <button
          type="button"
          onClick={() => onSuitedness('offsuit')}
          disabled={isPair}
          aria-pressed={!isPair && suitedness === 'offsuit'}
          className={[
            KEY_BASE, 'text-sm',
            isPair
              ? 'bg-surface-low text-ink-muted/40 cursor-not-allowed'
              : suitedness === 'offsuit'
                ? 'bg-gold-300 text-ink-inverse'
                : 'bg-surface-high text-ink-secondary border border-border-default active:bg-surface-float',
          ].join(' ')}
        >
          오프
        </button>

        {/* 지우기 (한 칸 / 백스페이스) */}
        <button
          type="button"
          onClick={onRemoveLast}
          disabled={empty}
          aria-label="한 칸 지우기"
          className={[
            KEY_BASE, 'text-sm gap-1',
            'bg-surface-high text-danger-light border border-border-default active:bg-danger/10 disabled:opacity-40',
          ].join(' ')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 5H8l-5 7 5 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
            <line x1="17" y1="9" x2="13" y2="13" /><line x1="13" y1="9" x2="17" y2="13" />
          </svg>
          지우기
        </button>
      </div>
    </div>
  );
}
