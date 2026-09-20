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
                    // 🔴 G12(2026-09-20 모바일 실측) — `h-7`(29.75px) → **44px**. 세로만이라도 계약을 채운다.
                    //   ⚠ **가로는 이 구조로 못 채운다**: 320px 에서 13열을 나누면 칸당 14.31px 이고
                    //     (실측 320/360/390/430 = 14.31/17.39/19.70/22.78px) 44px 을 넘기려면 한 줄에
                    //     4칸이 최대다 → 4무늬 × 4행 = 700px 짜리 화면이 된다. 가로 스크롤은 오너가
                    //     결함으로 지적한 형태라 쓸 수 없다.
                    //   랭크→무늬 **두 걸음** 선택기를 만들어 보았으나(2026-09-20 시도), `[data-card]` 가
                    //   첫 화면에 없어지면서 기존 e2e 9건(card-tools-reach·nuri-spot·nuri-spot-board)이
                    //   깨졌다 — 세 화면(HandBoardPicker·GtoDeepPanel·PostFormModal)이 공유하는 계약이라
                    //   이 커밋 범위를 넘는다. **되돌리고 세로만 고쳤다.** 가로는 미해결로 남긴다.
                    'h-[44px] rounded-[4px] text-2xs font-bold tabular-nums select-none touch-manipulation transition-transform',
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
