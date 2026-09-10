// src/components/features/gto/CardGridPicker.tsx
import { RANKS, SUITS, type Card, type Suit } from './gto.types';
import { cardId, type CardId } from './useDeepGto';

/** 4색 덱: 스페이드=흰, 하트=빨강, 다이아=파랑, 클럽=초록 */
// eslint-disable-next-line react-refresh/only-export-components -- 카드 색/라벨 상수를 GTO 화면들과 공유(기존 구조 유지)
export const SUIT_COLOR: Record<Suit, string> = {
  s: 'text-ink-primary',
  h: 'text-red-400',
  d: 'text-sky-400',
  c: 'text-emerald-400',
};
// eslint-disable-next-line react-refresh/only-export-components -- 카드 색/라벨 상수를 GTO 화면들과 공유(기존 구조 유지)
export const SUIT_LABEL: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
/** 스크린리더용 무늬 이름 — ♠ 는 리더마다 다르게 읽히거나 통째로 건너뛴다(2026-09-11 확인). */
// eslint-disable-next-line react-refresh/only-export-components -- 위 두 상수와 같은 이유(GTO 화면 공유)
export const SUIT_NAME: Record<Suit, string> = { s: '스페이드', h: '하트', d: '다이아몬드', c: '클럽' };

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
                  // 버튼 안에는 랭크 글자('A')뿐이라 보조기기가 무늬를 못 읽었다. 이름을 붙인다.
                  aria-label={`${rank} ${SUIT_NAME[suit]}${used ? ' · 이미 사용함' : ''}`}
                  data-card={cardId(card)}
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
