// src/components/features/gto/SelectedHandDisplay.tsx
import type { HandCombo, Rank, Suitedness } from './gto.types';

const KIND_LABEL: Record<HandCombo['kind'], string> = {
  pair: '페어',
  suited: '수딧 (같은 무늬)',
  offsuit: '오프수딧',
};

/** 콤보 종류에 따라 표시용 무늬 글리프 결정 */
function displaySuits(combo: HandCombo | null): [string, string] {
  if (combo?.kind === 'suited') return ['♠', '♠']; // ♠ ♠ (같은 무늬)
  return ['♠', '♥']; // ♠ ♥ (페어/오프수딧 → 서로 다른 무늬)
}

function CardTile({ rank, suit, empty }: { rank?: Rank; suit?: string; empty?: boolean }) {
  const isRed = suit === '♥' || suit === '♦';
  return (
    <div
      className={[
        'w-16 h-[5.5rem] rounded-card border flex flex-col items-center justify-center transition-colors',
        empty
          ? 'border-dashed border-border-default bg-surface-low/40'
          : 'border-border-strong bg-surface-high shadow-card',
      ].join(' ')}
    >
      {empty ? (
        <span className="text-2xl text-ink-muted/40">?</span>
      ) : (
        <>
          <span className="text-3xl font-extrabold leading-none text-gold-300">{rank}</span>
          <span className={['mt-1 text-lg leading-none', isRed ? 'text-red-400' : 'text-ink-primary'].join(' ')}>
            {suit}
          </span>
        </>
      )}
    </div>
  );
}

interface Props {
  ranks: readonly Rank[];
  combo: HandCombo | null;
  suitedness: Suitedness;
}

export default function SelectedHandDisplay({ ranks, combo, suitedness }: Props) {
  const [s1, s2] = displaySuits(combo);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3">
        <CardTile rank={ranks[0]} suit={ranks[0] ? s1 : undefined} empty={!ranks[0]} />
        <CardTile rank={ranks[1]} suit={ranks[1] ? s2 : undefined} empty={!ranks[1]} />
      </div>

      <div className="flex h-6 items-center gap-2">
        {combo ? (
          <>
            <span className="text-lg font-bold tracking-wide text-ink-primary">{combo.id}</span>
            <span className="rounded-badge bg-surface-float px-2 py-0.5 text-2xs font-semibold text-ink-secondary">
              {KIND_LABEL[combo.kind]}
            </span>
          </>
        ) : (
          <span className="text-2xs text-ink-muted">
            {ranks.length === 0 ? '카드 두 장을 선택하세요' : '한 장 더 선택하세요'}
            {ranks.length === 1 && ` · 현재 ${suitedness === 'suited' ? '수딧' : '오프수딧'}`}
          </span>
        )}
      </div>
    </div>
  );
}
