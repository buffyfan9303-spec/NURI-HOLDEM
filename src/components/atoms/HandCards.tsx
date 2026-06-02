// src/components/atoms/HandCards.tsx
import { SUIT_COLOR, SUIT_LABEL } from '../features/gto/CardGridPicker';
import type { Suit } from '../features/gto/gto.types';
import type { HandSel } from '../../lib/hand';

/** 'As' -> 미니 카드 한 장 (4색 덱, 글리프 대신 S/H/D/C 표기) */
export function MiniCard({ id }: { id: string }) {
  const rank = id.slice(0, -1);
  const suit = id.slice(-1) as Suit;
  return (
    <span
      className={[
        'inline-flex items-center gap-0.5 px-1.5 h-7 rounded-[4px] bg-surface-high border border-border-default font-bold',
        SUIT_COLOR[suit] ?? 'text-ink-primary',
      ].join(' ')}
    >
      <span className="text-sm tabular-nums">{rank}</span>
      <span className="text-2xs opacity-80">{SUIT_LABEL[suit] ?? ''}</span>
    </span>
  );
}

/** 첨부된 핸드(내 핸드/상대 핸드)를 카드로 표시 */
export default function HandCards({ hand }: { hand: HandSel }) {
  const Row = ({ label, cards }: { label: string; cards: string[] }) =>
    cards.length > 0 ? (
      <div className="flex items-center gap-2">
        <span className="text-2xs text-ink-muted w-12 shrink-0">{label}</span>
        <div className="flex gap-1">
          {cards.map((c) => <MiniCard key={c} id={c} />)}
        </div>
      </div>
    ) : null;

  return (
    <div className="inline-flex flex-col gap-1.5 rounded-card border border-border-subtle bg-surface-low p-2.5">
      <Row label="내 핸드" cards={hand.hero} />
      <Row label="상대 핸드" cards={hand.villain} />
    </div>
  );
}
