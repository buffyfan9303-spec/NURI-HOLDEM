// src/components/features/HandReplayer.tsx — 게시글 첨부 핸드 표시.
// 내 핸드 / 상대 핸드를 위에, 그 아래 보드를 플랍·턴·리버로 구분해 한눈에(세로) 표시. 무늬(♠♥♦♣) 카드.
import { MiniCard } from '../atoms/HandCards';
import type { ReplayData } from '../../lib/hand';

const STREET_ACT = [['pre', '프리플랍'], ['flop', '플랍'], ['turn', '턴'], ['river', '리버']] as const;

function CardRow({ label, cards }: { label: string; cards: string[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-14 shrink-0 text-xs font-semibold text-ink-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">{cards.map((c, i) => <MiniCard key={c + i} id={c} />)}</div>
    </div>
  );
}

export default function HandReplayer({ replay }: { replay: ReplayData }) {
  const flop = replay.board.slice(0, 3);
  const turn = replay.board.slice(3, 4);
  const river = replay.board.slice(4, 5);
  const hasBoard = replay.board.length > 0;
  const hasAction = STREET_ACT.some(([k]) => replay.actions[k]);

  return (
    <div className="w-full max-w-md rounded-card border border-border-subtle bg-surface-low p-3 space-y-3 sm:p-4">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-extrabold tracking-wide text-gold-300">🎬 핸드 리뷰</span>
        {replay.pot && <span className="text-2xs text-ink-muted">팟 {replay.pot}</span>}
      </div>

      {/* 내 핸드 / 상대 핸드 */}
      <div className="space-y-2">
        <CardRow label="내 핸드" cards={replay.hero} />
        <CardRow label="상대 핸드" cards={replay.villain} />
      </div>

      {/* 보드 — 플랍 / 턴 / 리버 */}
      {hasBoard && (
        <div className="space-y-2 border-t border-border-subtle pt-3">
          <CardRow label="플랍" cards={flop} />
          <CardRow label="턴" cards={turn} />
          <CardRow label="리버" cards={river} />
        </div>
      )}

      {/* 스트리트별 액션 */}
      {hasAction && (
        <div className="space-y-1 border-t border-border-subtle pt-3">
          {STREET_ACT.map(([k, lab]) => replay.actions[k] ? (
            <p key={k} className="text-xs leading-relaxed text-ink-secondary"><b className="text-gold-300">{lab}</b> · {replay.actions[k]}</p>
          ) : null)}
        </div>
      )}
    </div>
  );
}
