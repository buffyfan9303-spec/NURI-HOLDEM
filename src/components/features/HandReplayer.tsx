// src/components/features/HandReplayer.tsx — 게시글 첨부 핸드 표시.
// 이름값을 하는 '리플레이': 스트리트 순차 공개가 기본이라 '너라면 어떻게?'(단계별 추론)가 가능하다.
// 예전엔 결과까지 전부 펼쳐져 있어 핸드 리뷰 토론이 결과론으로 흘렀다. '전체 보기'로 옛 모드 유지.
import { useEffect, useState } from 'react';
import { MiniCard } from '../atoms/HandCards';
import type { ReplayData } from '../../lib/hand';
import { computeEquity, type EquityResult } from './gto/equityEngine';
import type { Card, Rank, Suit } from './gto/gto.types';

const STREET_ACT = [['pre', '프리플랍'], ['flop', '플랍'], ['turn', '턴'], ['river', '리버']] as const;

// 카드 표기(`${rank}${suit}`, 예: 'As','Th','9c') → 에퀴티 엔진 Card 로 변환
const toCard = (id: string): Card => ({ rank: id[0] as Rank, suit: id[1] as Suit });

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

  // ── 에퀴티 오버레이 ─────────────────────────────────────────────────────────
  // hero·villain 둘 다 2장을 알 때만 계산(그 외엔 숨김 → 기존 동작 유지).
  // '그 시점 보드'(현재 공개된 스트리트까지)로 hero 승률을 표시한다.
  const canEquity = replay.hero.length === 2 && replay.villain.length === 2;
  const shownBoard = [
    ...(on(flopAt) ? flop : []),
    ...(on(turnAt) ? turn : []),
    ...(on(riverAt) ? river : []),
  ];
  const streetLabel = shownBoard.length >= 5 ? '리버' : shownBoard.length === 4 ? '턴'
    : shownBoard.length >= 3 ? '플랍' : '프리플랍';
  const heroKey = replay.hero.join(',');
  const villainKey = replay.villain.join(',');
  const boardKey = shownBoard.join(',');

  const [equity, setEquity] = useState<EquityResult | null>(null);
  const [computing, setComputing] = useState(false);

  // 스트리트(공개 보드)가 바뀔 때 1회만 계산 — 무거운 루프를 렌더 밖(setTimeout)으로 미뤄
  // 스피너부터 그린 뒤 계산한다. 엔진이 리버·플랍=전수, 프리플랍=기본 iterations 로 자동 분기.
  useEffect(() => {
    if (!canEquity) { setEquity(null); setComputing(false); return; }
    setComputing(true);
    let alive = true;
    const hero = heroKey.split(',').map(toCard) as [Card, Card];
    const villain = villainKey.split(',').map(toCard) as [Card, Card];
    const board = boardKey ? boardKey.split(',').map(toCard) : [];
    const id = window.setTimeout(() => {
      const res = computeEquity(hero, villain, board);
      if (alive) { setEquity(res); setComputing(false); }
    }, 0);
    return () => { alive = false; window.clearTimeout(id); };
  }, [canEquity, heroKey, villainKey, boardKey]);

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

      {/* 에퀴티 오버레이 — hero·villain 둘 다 알 때만, 현재 공개 보드 기준 hero 승률 */}
      {canEquity && (
        <div className="space-y-1.5 border-t border-border-subtle pt-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold text-ink-muted"><b className="text-accent-300">{streetLabel}</b> 승률</span>
            {computing ? (
              <span className="flex items-center gap-1 text-2xs text-ink-muted">
                <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-accent-300 border-t-transparent" />계산 중…
              </span>
            ) : equity && (
              <span className="text-sm font-extrabold tabular-nums text-accent-300">{Math.round(equity.hero * 100)}%</span>
            )}
          </div>
          {equity && !computing && (
            <>
              <div className="flex h-2.5 w-full overflow-hidden rounded-badge bg-surface-high" role="img"
                aria-label={`내 핸드 승률 ${Math.round(equity.hero * 100)}%`}>
                <div className="h-full bg-accent-400" style={{ width: `${equity.hero * 100}%` }} />
              </div>
              <div className="flex justify-between text-2xs text-ink-muted tabular-nums">
                <span>내 {Math.round(equity.hero * 100)}%</span>
                {equity.tie > 0.0005 && <span>타이 {(equity.tie * 100).toFixed(1)}%</span>}
                <span>상대 {Math.round(equity.villain * 100)}%</span>
              </div>
            </>
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
