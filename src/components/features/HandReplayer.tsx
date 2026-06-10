// src/components/features/HandReplayer.tsx — 게시글 첨부 핸드 리플레이어.
// 프리플랍→플랍→턴→리버 단계를 ◀▶로 넘기며 보드 공개 + 스트리트 액션을 보여준다.
// 상대 핸드는 마지막 단계(쇼다운)에서만 공개해 실제 핸드 리뷰 느낌을 살린다.
import { useMemo, useState } from 'react';
import { MiniCard } from '../atoms/HandCards';
import type { ReplayData } from '../../lib/hand';

const STREETS = ['프리플랍', '플랍', '턴', '리버'] as const;
const ACTION_KEY = ['pre', 'flop', 'turn', 'river'] as const;
const BOARD_REVEAL = [0, 3, 4, 5];

function BackCard() {
  return (
    <span className="inline-flex h-7 w-[30px] items-center justify-center rounded-[4px] border border-border-default bg-gradient-to-br from-surface-float to-surface-high">
      <span className="text-2xs text-gold-300/70">♠</span>
    </span>
  );
}

export default function HandReplayer({ replay }: { replay: ReplayData }) {
  // 보드 장수에 따라 진행 가능한 마지막 단계(3장→플랍까지, 5장→리버까지)
  const maxStep = useMemo(() => {
    if (replay.board.length >= 5) return 3;
    if (replay.board.length >= 4) return 2;
    if (replay.board.length >= 3) return 1;
    return 0;
  }, [replay.board.length]);
  const [step, setStep] = useState(0);

  const shown = replay.board.slice(0, BOARD_REVEAL[step]);
  const action = replay.actions[ACTION_KEY[step]];
  const showdown = step === maxStep; // 마지막 단계에서 상대 핸드 공개

  return (
    <div className="rounded-card border border-border-subtle bg-surface-low p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-extrabold tracking-wide text-gold-300">🎬 핸드 리플레이</span>
        {replay.pot && <span className="text-2xs text-ink-muted">팟 {replay.pot}</span>}
      </div>

      {/* 보드 */}
      <div className="flex min-h-7 items-center gap-1">
        <span className="w-12 shrink-0 text-2xs text-ink-muted">보드</span>
        {shown.length === 0
          ? <span className="text-2xs text-ink-muted">아직 공개 전</span>
          : shown.map((c) => <MiniCard key={c} id={c} />)}
      </div>

      {/* 내 핸드 / 상대 핸드 */}
      <div className="flex items-center gap-1">
        <span className="w-12 shrink-0 text-2xs text-ink-muted">내 핸드</span>
        {replay.hero.map((c) => <MiniCard key={c} id={c} />)}
      </div>
      {replay.villain.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="w-12 shrink-0 text-2xs text-ink-muted">상대</span>
          {showdown
            ? replay.villain.map((c) => <MiniCard key={c} id={c} />)
            : replay.villain.map((_, i) => <BackCard key={i} />)}
        </div>
      )}

      {/* 스트리트 액션 */}
      {action && (
        <p className="rounded-input bg-surface-high px-2.5 py-1.5 text-xs leading-relaxed text-ink-secondary">{action}</p>
      )}

      {/* 컨트롤 */}
      <div className="flex items-center justify-between pt-0.5">
        <button type="button" disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="btn rounded-input border border-border-default bg-surface-high px-3 py-1.5 text-xs font-bold text-ink-secondary disabled:opacity-35">
          ◀ 이전
        </button>
        <span className="text-xs font-bold text-ink-primary">
          {STREETS[step]}{showdown && replay.villain.length > 0 ? ' · 쇼다운' : ''}
        </span>
        <button type="button" disabled={step === maxStep}
          onClick={() => setStep((s) => Math.min(maxStep, s + 1))}
          className="btn rounded-input border border-gold-400/40 bg-gold-300/10 px-3 py-1.5 text-xs font-bold text-gold-300 disabled:opacity-35">
          다음 ▶
        </button>
      </div>
    </div>
  );
}
