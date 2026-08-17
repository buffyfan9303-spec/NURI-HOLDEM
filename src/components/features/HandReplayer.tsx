// src/components/features/HandReplayer.tsx — 게시글 첨부 핸드 표시.
// 이름값을 하는 '리플레이': 스트리트 순차 공개가 기본이라 '너라면 어떻게?'(단계별 추론)가 가능하다.
// 예전엔 결과까지 전부 펼쳐져 있어 핸드 리뷰 토론이 결과론으로 흘렀다. '전체 보기'로 옛 모드 유지.
import { useState } from 'react';
import { MiniCard } from '../atoms/HandCards';
import type { ReplayData } from '../../lib/hand';

const STREET_ACT = [['pre', '프리플랍'], ['flop', '플랍'], ['turn', '턴'], ['river', '리버']] as const;

function CardRow({ label, cards, hidden }: { label: string; cards: string[]; hidden?: boolean }) {
  if (cards.length === 0) return null;
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-14 shrink-0 text-xs font-semibold text-ink-muted">{label}</span>
      {hidden ? (
        <div className="flex flex-wrap gap-1.5">
          {cards.map((c, i) => (
            <span key={c + i} aria-hidden className="flex h-9 w-7 items-center justify-center rounded-[5px] border border-border-default bg-surface-high text-xs text-ink-muted">🂠</span>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 animate-fade-in">{cards.map((c, i) => <MiniCard key={c + i} id={c} />)}</div>
      )}
    </div>
  );
}

export default function HandReplayer({ replay }: { replay: ReplayData }) {
  const flop = replay.board.slice(0, 3);
  const turn = replay.board.slice(3, 4);
  const river = replay.board.slice(4, 5);
  const hasBoard = replay.board.length > 0;
  const hasAction = STREET_ACT.some(([k]) => replay.actions[k]);

  // 공개 단계 임계값 — 있는 스트리트만 단계로 센다(플랍만 있는 핸드는 2단계로 끝)
  let n = 0;
  const flopAt = flop.length ? ++n : Infinity;
  const turnAt = turn.length ? ++n : Infinity;
  const riverAt = river.length ? ++n : Infinity;
  const showdownAt = replay.villain.length ? ++n : Infinity;
  const total = n;

  const [step, setStep] = useState(0);
  const [showAll, setShowAll] = useState(!hasBoard || total === 0); // 보드 없는 핸드는 스텝이 무의미
  const on = (at: number) => showAll || step >= at;
  const nextLabel = step + 1 === flopAt ? '플랍 열기' : step + 1 === turnAt ? '턴 열기'
    : step + 1 === riverAt ? '리버 열기' : step + 1 === showdownAt ? '상대 핸드 공개' : '';
  const actOn: Record<string, boolean> = { pre: true, flop: on(flopAt), turn: on(turnAt), river: on(riverAt) };

  return (
    <div className="w-full max-w-md rounded-card border border-border-subtle bg-surface-low p-3 space-y-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-extrabold tracking-wide text-accent-300">🎬 핸드 리뷰</span>
        <span className="flex items-center gap-2">
          {replay.pot && <span className="text-2xs text-ink-muted">팟 {replay.pot}</span>}
          {hasBoard && total > 0 && (
            <button type="button" onClick={() => { setShowAll((v) => !v); setStep(0); }}
              className="rounded-badge border border-border-default px-1.5 py-0.5 text-2xs font-bold text-ink-muted hover:text-ink-secondary transition-colors">
              {showAll ? '단계별 보기' : '전체 보기'}
            </button>
          )}
        </span>
      </div>

      {/* 내 핸드 / 상대 핸드(쇼다운 단계 전엔 뒷면) */}
      <div className="space-y-2">
        <CardRow label="내 핸드" cards={replay.hero} />
        <CardRow label="상대 핸드" cards={replay.villain} hidden={!on(showdownAt)} />
      </div>

      {/* 보드 — 공개된 스트리트만 */}
      {hasBoard && (on(flopAt) || !showAll) && (
        <div className="space-y-2 border-t border-border-subtle pt-3">
          {on(flopAt) && <CardRow label="플랍" cards={flop} />}
          {on(turnAt) && <CardRow label="턴" cards={turn} />}
          {on(riverAt) && <CardRow label="리버" cards={river} />}
          {!showAll && step < total && (
            <button type="button" onClick={() => setStep((s) => s + 1)}
              className="w-full rounded-input border border-accent-400/50 bg-accent-300/10 py-2 text-xs font-bold text-accent-300 hover:bg-accent-300/20 transition-colors">
              ▶ {nextLabel} — 너라면 어떻게?
            </button>
          )}
          {!showAll && step > 0 && step >= total && (
            <button type="button" onClick={() => setStep(0)}
              className="w-full rounded-input border border-border-default py-1.5 text-2xs font-bold text-ink-muted hover:text-ink-secondary transition-colors">
              ↺ 처음부터 다시
            </button>
          )}
        </div>
      )}

      {/* 스트리트별 액션 — 해당 스트리트가 공개된 뒤에만(결과 스포 방지) */}
      {hasAction && (
        <div className="space-y-1 border-t border-border-subtle pt-3">
          {STREET_ACT.map(([k, lab]) => replay.actions[k] && actOn[k] ? (
            <p key={k} className="text-xs leading-relaxed text-ink-secondary"><b className="text-accent-300">{lab}</b> · {replay.actions[k]}</p>
          ) : null)}
        </div>
      )}
    </div>
  );
}
