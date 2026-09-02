// src/components/features/HandReplayer.tsx — 게시글 첨부 핸드 표시.
// 이름값을 하는 '리플레이': 스트리트 순차 공개가 기본이라 '너라면 어떻게?'(단계별 추론)가 가능하다.
// 예전엔 결과까지 전부 펼쳐져 있어 핸드 리뷰 토론이 결과론으로 흘렀다. '전체 보기'로 옛 모드 유지.
import { useEffect, useState } from 'react';
import { MiniCard } from '../atoms/HandCards';
import type { ReplayData } from '../../lib/hand';
import { type OutsResult } from './gto/equityEngine';
import { equityAsync, outsAsync } from './gto/equityClient';
import type { Card, Rank, Suit } from './gto/gto.types';
import Icon from '../atoms/Icon';

const STREET_ACT = [['pre', '프리플랍'], ['flop', '플랍'], ['turn', '턴'], ['river', '리버']] as const;

// 카드 표기(`${rank}${suit}`, 예: 'As','Th','9c') → 에퀴티 엔진 Card 로 변환
const toCard = (id: string): Card => ({ rank: id[0] as Rank, suit: id[1] as Suit });

const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
// 아웃 카드 칩 — 랭크+무늬 글리프, 빨강(♥♦)/검정(♠♣)
function OutChip({ card }: { card: Card }) {
  const red = card.suit === 'h' || card.suit === 'd';
  return (
    <span className={['inline-flex items-center rounded-[4px] border border-border-default bg-surface-high px-1 py-0.5 text-2xs font-bold tabular-nums',
      red ? 'text-danger-light' : 'text-ink-primary'].join(' ')}>
      {card.rank}{SUIT_GLYPH[card.suit]}
    </span>
  );
}

function CardRow({ label, cards, hidden }: { label: string; cards: string[]; hidden?: boolean }) {
  if (cards.length === 0) return null;
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-14 shrink-0 text-xs font-semibold text-ink-muted">{label}</span>
      {hidden ? (
        <div className="flex flex-wrap gap-1.5">
          {cards.map((c, i) => (
            // ICON-3(2026-08-30): 종전엔 🂠(U+1F0A0 '카드 뒷면')를 글자로 찍었다. 이 코드포인트는
            // 어느 컬러 이모지 폰트에도 없어서(실측: 색수 1 = 단색 폰트 폴백) OS 의 기호 폰트에
            // 얹혀 살고, 그 폰트가 없는 기기에서는 통째로 두부(□)가 된다 — 유저의 99% 가 모바일이다.
            // 게다가 다크·라이트 양쪽 대비가 2.2~2.6 로 미달이었다. 상자 자체가 이미 '카드'이므로
            // 안쪽 글리프는 '아직 안 보임'만 말하면 된다.
            <span key={c + i} aria-hidden className="flex h-9 w-7 items-center justify-center rounded-[5px] border border-border-default bg-surface-high text-ink-muted"><Icon name="eye-off" size={13} /></span>
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
  const heroKey = replay.hero.join(',');
  const villainKey = replay.villain.join(',');
  const boardKey = shownBoard.join(',');

  // 스트리트별 hero 승률 추이 + 다음 카드 아웃츠(내/상대). 무거운 루프는 렌더 밖(setTimeout)으로.
  const [traj, setTraj] = useState<{ label: string; hero: number; villain: number }[] | null>(null);
  const [heroOuts, setHeroOuts] = useState<OutsResult | null>(null);
  const [villainOuts, setVillainOuts] = useState<OutsResult | null>(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    if (!canEquity) { setTraj(null); setHeroOuts(null); setVillainOuts(null); setComputing(false); return; }
    setComputing(true);
    let alive = true;
    const hero = heroKey.split(',').map(toCard) as [Card, Card];
    const villain = villainKey.split(',').map(toCard) as [Card, Card];
    const shown = boardKey ? boardKey.split(',').map(toCard) : [];
    // [DS] MO-9C: setTimeout(0)은 렌더만 피할 뿐 계산은 메인스레드 롱태스크였다(플랍 990 전수 ×
    // 마일스톤 + 아웃츠 45×). 워커로 위임 — 글 상세를 열 때 화면이 멈추지 않는다. 결과 동일.
    const milestones: { label: string; board: Card[] }[] = [{ label: '프리', board: [] }];
    if (shown.length >= 3) milestones.push({ label: '플랍', board: shown.slice(0, 3) });
    if (shown.length >= 4) milestones.push({ label: '턴', board: shown.slice(0, 4) });
    if (shown.length >= 5) milestones.push({ label: '리버', board: shown.slice(0, 5) });
    Promise.all([
      Promise.all(milestones.map((m) => equityAsync(hero, villain, m.board))),
      // 아웃츠는 현재 공개 스트리트가 플랍(3)·턴(4)일 때만(리버는 다음 카드 없음)
      outsAsync(hero, villain, shown),
      outsAsync(villain, hero, shown),
    ]).then(([es, ho, vo]) => {
      if (!alive) return;
      setTraj(milestones.map((m, i) => ({ label: m.label, hero: es[i].hero, villain: es[i].villain })));
      setHeroOuts(ho);
      setVillainOuts(vo);
      setComputing(false);
    });
    return () => { alive = false; };
  }, [canEquity, heroKey, villainKey, boardKey]);

  const cur = traj && traj.length ? traj[traj.length - 1] : null;
  // 내가 뒤지면 '내 아웃츠(역전 카드)', 앞서면 '상대 아웃츠(위험 카드)'를 보여준다.
  const showOuts = cur && cur.hero < 0.5 ? heroOuts : villainOuts;
  const outsIsHero = !!(cur && cur.hero < 0.5);

  return (
    <div className="w-full max-w-md rounded-card border border-border-subtle bg-surface-low p-3 space-y-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-2xs font-extrabold text-accent-300"><Icon name="clapperboard" size={12} className="shrink-0" />핸드 리뷰</span>
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
              className="flex w-full items-center justify-center gap-1.5 rounded-input border border-accent-400/50 bg-accent-300/10 py-2 text-xs font-bold text-accent-300 hover:bg-accent-300/20 transition-colors">
              <Icon name="play" size={13} className="shrink-0" />{nextLabel} — 너라면 어떻게?
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

      {/* 에퀴티 추이 + 아웃츠 — hero·villain 둘 다 알 때만. 스트리트가 공개될수록 그래프가 자란다. */}
      {canEquity && (
        <div className="space-y-2 border-t border-border-subtle pt-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold text-ink-muted">스트리트별 <b className="text-accent-300">내 승률 추이</b></span>
            {computing && (
              <span className="flex items-center gap-1 text-2xs text-ink-muted">
                <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-accent-300 border-t-transparent" />계산 중…
              </span>
            )}
          </div>

          {/* 스트리트별 막대 + 직전 대비 증감(꺾은선 대용 추이) */}
          {traj && !computing && (
            <div className="space-y-1">
              {traj.map((s, i) => {
                const prev = i > 0 ? traj[i - 1].hero : null;
                const delta = prev != null ? s.hero - prev : null;
                const dPts = delta != null ? Math.round(delta * 100) : 0;
                return (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="w-7 shrink-0 text-2xs font-semibold text-ink-muted">{s.label}</span>
                    <div className="relative h-3 flex-1 overflow-hidden rounded-badge bg-surface-high" role="img" aria-label={`${s.label} 내 승률 ${Math.round(s.hero * 100)}%`}>
                      <div className="h-full bg-accent-400" style={{ width: `${s.hero * 100}%` }} />
                    </div>
                    <span className="w-9 shrink-0 text-right text-2xs font-extrabold tabular-nums text-accent-300">{Math.round(s.hero * 100)}%</span>
                    <span className={['w-8 shrink-0 text-right text-2xs font-bold tabular-nums',
                      delta == null ? 'text-transparent' : dPts >= 0 ? 'text-emerald-400' : 'text-danger-light'].join(' ')}
                      aria-hidden>
                      {delta == null ? '·' : `${dPts >= 0 ? '▲' : '▼'}${Math.abs(dPts)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 아웃츠/런아웃 — 내가 뒤지면 역전 카드, 앞서면 상대의 위험 카드 */}
          {showOuts && !computing && showOuts.outs > 0 && showOuts.outs < showOuts.total && (
            <div className={['rounded-input border px-2.5 py-2 space-y-1.5',
              outsIsHero ? 'border-emerald-400/25 bg-emerald-500/[0.06]' : 'border-danger/25 bg-danger/[0.06]'].join(' ')}>
              <p className="text-2xs font-bold">
                <span className={['inline-flex items-center gap-1', outsIsHero ? 'text-emerald-300' : 'text-danger-light'].join(' ')}>
                  <Icon name={outsIsHero ? 'target' : 'alert'} size={12} className="shrink-0" />{outsIsHero ? '내 아웃츠' : '상대 아웃츠'} {showOuts.outs}장
                </span>
                <span className="font-normal text-ink-muted"> · {showOuts.total}장 중 · 다음 {showOuts.next === 'river' ? '리버' : '턴'} 확률 {(showOuts.prob * 100).toFixed(1)}%</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {showOuts.cards.slice(0, 16).map((c) => <OutChip key={c.rank + c.suit} card={c} />)}
                {showOuts.cards.length > 16 && <span className="self-center text-2xs text-ink-muted">+{showOuts.cards.length - 16}</span>}
              </div>
              <p className="text-2xs text-ink-muted">
                {outsIsHero
                  ? (showOuts.next === 'river' ? '이 리버 카드가 뜨면 이깁니다(클린 아웃).' : '이 턴 카드가 뜨면 앞서게 됩니다.')
                  : (showOuts.next === 'river' ? '이 리버 카드가 뜨면 역전당합니다(주의).' : '이 턴 카드가 뜨면 상대가 앞섭니다.')}
              </p>
            </div>
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
