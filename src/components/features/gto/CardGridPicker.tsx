// src/components/features/gto/CardGridPicker.tsx
import { RANKS, SUITS, type Card, type Suit } from './gto.types';
import { cardId, type CardId } from './useDeepGto';

/** 4색 덱: 스페이드=흰, 하트=빨강, 다이아=파랑, 클럽=초록 */
export const SUIT_COLOR: Record<Suit, string> = {
  s: 'text-ink-primary',
  h: 'text-red-400',
  d: 'text-sky-400',
  c: 'text-emerald-400',
};
export const SUIT_LABEL: Record<Suit, string> = { s: 'S', h: 'H', d: 'D', c: 'C' };

interface Props {
  usedIds: ReadonlySet<CardId>;
  onPick: (card: Card) => void;
}

export default function CardGridPicker({ usedIds, onPick }: Props) {
  return (
    <div className="space-y-1">
      {SUITS.map((suit) => (
        <div key={suit} className="flex items-center gap-1">
          <span className={['w-4 shrink-0 text-center text-2xs font-bold', SUIT_COLOR[suit]].join(' ')}>
            {SUIT_LABEL[suit]}
          </span>
          <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
            {RANKS.map((rank) => {
              const card: Card = { rank, suit };
              const used = usedIds.has(cardId(card));
              return (
                <button
                  key={rank}
                  type="button"
                  disabled={used}
                  onClick={() => onPick(card)}
                  className={[
                    'h-7 rounded-[4px] text-2xs font-bold tabular-nums select-none touch-manipulation transition-transform',
                    'active:scale-[0.9] focus:outline-none',
                    used
                      ? 'bg-surface-low opacity-25 cursor-not-allowed'
                      : ['bg-surface-high border border-border-default active:bg-surface-float', SUIT_COLOR[suit]].join(' '),
                  ].join(' ')}
                >
                  {rank}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
