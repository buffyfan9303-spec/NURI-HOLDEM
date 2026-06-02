// src/components/features/gto/GtoDeepModal.tsx
import { useState } from 'react';
import Modal from '../../atoms/Modal';
import { useToast } from '../../atoms/Toast';
import CardGridPicker, { SUIT_COLOR, SUIT_LABEL } from './CardGridPicker';
import { useDeepGto, type CardTarget } from './useDeepGto';
import { canonicalizeHand } from './useGtoCalculator';
import type { Card, ActionFrequency, Rank, Suit } from './gto.types';

const BOARD_PRESETS: { label: string; cards: { rank: Rank; suit: Suit }[] }[] = [
  { label: '드라이 (A72r)', cards: [{ rank: 'A', suit: 's' }, { rank: '7', suit: 'd' }, { rank: '2', suit: 'c' }] },
  { label: '브로드웨이 (KQT)', cards: [{ rank: 'K', suit: 'h' }, { rank: 'Q', suit: 'h' }, { rank: 'T', suit: 's' }] },
  { label: '모노톤 (J83s)', cards: [{ rank: 'J', suit: 's' }, { rank: '8', suit: 's' }, { rank: '3', suit: 's' }] },
  { label: '페어보드 (994)', cards: [{ rank: '9', suit: 'h' }, { rank: '9', suit: 'd' }, { rank: '4', suit: 'c' }] },
  { label: '턴 (A72-J)', cards: [{ rank: 'A', suit: 's' }, { rank: '7', suit: 'd' }, { rank: '2', suit: 'c' }, { rank: 'J', suit: 'h' }] },
  { label: '리버 (A72J-Q)', cards: [{ rank: 'A', suit: 's' }, { rank: '7', suit: 'd' }, { rank: '2', suit: 'c' }, { rank: 'J', suit: 'h' }, { rank: 'Q', suit: 's' }] },
];
import type { GtoResult } from './gto.deep.types';

function comboIdOf(cards: readonly (Card | null)[]): string | null {
  if (!cards[0] || !cards[1]) return null;
  const suited = cards[0].suit === cards[1].suit ? 'suited' : 'offsuit';
  return canonicalizeHand([cards[0].rank, cards[1].rank], suited)?.id ?? null;
}

function CardSlot({ card, active, onClick }: { card: Card | null; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-12 w-9 flex-col items-center justify-center rounded-input border transition-colors',
        card
          ? 'border-border-strong bg-surface-high'
          : active
            ? 'border-dashed border-gold-300 bg-gold-300/5'
            : 'border-dashed border-border-default bg-surface-low/40',
      ].join(' ')}
    >
      {card ? (
        <>
          <span className={['text-base font-bold leading-none', SUIT_COLOR[card.suit]].join(' ')}>{card.rank}</span>
          <span className={['text-2xs leading-none', SUIT_COLOR[card.suit]].join(' ')}>{SUIT_LABEL[card.suit]}</span>
        </>
      ) : (
        <span className="text-xs text-ink-muted/40">+</span>
      )}
    </button>
  );
}

function Section({
  title, target, cards, current, onSelectTarget, onRemove,
}: {
  title: string;
  target: CardTarget;
  cards: readonly (Card | null)[];
  current: CardTarget;
  onSelectTarget: (t: CardTarget) => void;
  onRemove: (t: CardTarget, i: number) => void;
}) {
  const active = current === target;
  const nextEmpty = cards.findIndex((c) => c === null);
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelectTarget(target)}
        className={['mb-1 block text-2xs font-bold uppercase tracking-wider transition-colors', active ? 'text-gold-300' : 'text-ink-muted'].join(' ')}
      >
        {title}
      </button>
      <div className="flex gap-1">
        {cards.map((c, i) => (
          <CardSlot
            key={i}
            card={c}
            active={active && i === nextEmpty}
            onClick={() => (c ? onRemove(target, i) : onSelectTarget(target))}
          />
        ))}
      </div>
    </div>
  );
}

function MixBar({ action }: { action: Required<ActionFrequency> }) {
  const segs = [
    { key: 'raise', label: '3-Bet', v: action.raise, color: '#EF4444' },
    { key: 'call', label: '콜', v: action.call, color: '#22C55E' },
    { key: 'fold', label: '폴드', v: action.fold, color: '#3B82F6' },
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex h-7 w-full overflow-hidden rounded-input bg-surface-low">
        {segs.map((s) => (s.v > 0 ? (
          <div key={s.key} style={{ width: `${s.v * 100}%`, background: s.color }} className="transition-[width] duration-500" />
        ) : null))}
      </div>
      <div className="flex items-center justify-between">
        {segs.map((s) => (
          <div key={s.key} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-2xs text-ink-secondary">{s.label}</span>
            <span className="text-2xs font-bold tabular-nums text-ink-primary">{Math.round(s.v * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeepBlockerSheet({ open, onClose, result }: { open: boolean; onClose: () => void; result: GtoResult | null }) {
  if (!open || !result) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="AI 액션 해설">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative flex max-h-[70vh] w-full max-w-md flex-col rounded-t-dialog bg-surface-mid shadow-dialog animate-slide-up">
        <div className="flex justify-center pt-2 pb-1"><div className="h-1 w-10 rounded-full bg-border-strong" /></div>
        <header className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
          <h3 className="text-sm font-bold text-gold-300">AI 액션 해설 (블로커 영향)</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-input text-ink-secondary hover:bg-surface-high hover:text-ink-primary">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-ink-secondary">
          {result.blockerExplanation && (
            <div className="rounded-input border border-gold-400/30 bg-gold-300/[0.06] p-3">
              <p className="mb-1 text-2xs font-bold text-gold-300">블로커 지각변동</p>
              <p className="whitespace-pre-wrap">{result.blockerExplanation}</p>
            </div>
          )}
          <p className="whitespace-pre-wrap">{result.heuristic_explanation}</p>
          <p className="text-2xs text-ink-muted">학습용 참고 설명입니다. 실제 솔버 값과 차이가 있을 수 있습니다.</p>
        </div>
      </div>
    </div>
  );
}

export default function GtoDeepModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const deep = useDeepGto();
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);

  const heroId = comboIdOf(deep.hero);
  const villainId = deep.villainComboId;
  const showResult = deep.heroComplete && deep.villainComplete && deep.result && deep.normalizedAction;

  // 권장 액션(가장 빈도 높은 것)
  const na = deep.normalizedAction;
  const recommended = na
    ? [{ label: '3-Bet', v: na.raise, color: '#EF4444' }, { label: '콜', v: na.call, color: '#22C55E' }, { label: '폴드', v: na.fold, color: '#3B82F6' }]
        .reduce((a, b) => (b.v > a.v ? b : a))
    : null;

  const copySummary = async () => {
    const boardStr = deep.board.flatMap((c) => (c ? [`${c.rank}${c.suit.toUpperCase()}`] : [])).join(' ');
    const eq = deep.equity ? ` | 에퀴티 Hero ${Math.round(deep.equity.hero * 100)}%` : '';
    const rec = recommended ? ` | 권장 ${recommended.label} ${Math.round(recommended.v * 100)}%` : '';
    const text = `[NHoldem GTO] ${heroId} vs ${villainId}${boardStr ? ` | 보드 ${boardStr}` : ''}${eq}${rec}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'NHoldem GTO', text }); return; }
      await navigator.clipboard.writeText(text);
      toast.show('결과를 복사했습니다', 'success');
    } catch { /* 사용자 취소 등은 무시 */ }
  };

  const TARGET_TABS: { t: CardTarget; label: string }[] = [
    { t: 'hero', label: 'Hero' },
    { t: 'villain', label: 'Villain' },
    { t: 'board', label: 'Board' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="GTO 검색" variant="sheet" maxWidth="md" fillHeight>
      <div className="space-y-4 px-4 py-3">
        <p className="text-center text-2xs text-ink-muted">{deep.situation.description}</p>

        {/* Hero vs Villain 슬롯 */}
        <div className="flex items-end justify-center gap-3">
          <Section title="Hero" target="hero" cards={deep.hero} current={deep.currentTarget} onSelectTarget={deep.setTarget} onRemove={deep.removeAt} />
          <span className="pb-4 text-2xs font-bold text-ink-muted">vs</span>
          <Section title="Villain" target="villain" cards={deep.villain} current={deep.currentTarget} onSelectTarget={deep.setTarget} onRemove={deep.removeAt} />
        </div>

        {/* Board 슬롯 */}
        <div className="flex justify-center">
          <Section title="Board (선택)" target="board" cards={deep.board} current={deep.currentTarget} onSelectTarget={deep.setTarget} onRemove={deep.removeAt} />
        </div>

        {/* 플랍 빠른 입력(보드 텍스처 프리셋) */}
        <div className="space-y-1.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">플랍 예시 (빠른 입력)</p>
          <div className="flex flex-wrap gap-1.5">
            {BOARD_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => deep.applyBoardPreset(p.cards)}
                className="rounded-input border border-border-default bg-surface-high px-2.5 py-1 text-2xs font-semibold text-ink-secondary transition-colors hover:text-ink-primary active:bg-surface-float"
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => deep.applyBoardPreset([])}
              className="rounded-input border border-border-default bg-surface-high px-2.5 py-1 text-2xs text-ink-muted transition-colors hover:text-danger-light"
            >
              보드 비우기
            </button>
          </div>
        </div>

        {/* 결과 */}
        {showResult && deep.result && deep.normalizedAction ? (
          <div className="animate-fade-in space-y-3 rounded-card border border-border-default bg-surface-low p-3">
            <p className="text-center text-sm">
              <b className="text-gold-300">{heroId}</b>
              <span className="mx-2 text-ink-muted">vs</span>
              <b className="text-ink-primary">{villainId}</b>
            </p>

            <div>
              <p className="mb-1 text-2xs font-semibold text-ink-secondary">
                에퀴티 (Hero vs Villain){deep.board.some((c) => c !== null) ? ' · 보드 반영' : ' · 프리플랍'} · 실시간 계산
              </p>
              {deep.calculating || !deep.equity ? (
                <div className="flex h-5 items-center gap-2 text-2xs text-ink-muted">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-gold-300 border-t-transparent" />
                  에퀴티 계산 중...
                </div>
              ) : (
                <>
                  <div className="flex h-5 overflow-hidden rounded-input bg-surface-float">
                    <div style={{ width: `${deep.equity.hero * 100}%` }} className="bg-gold-300 transition-[width] duration-500" />
                  </div>
                  <div className="mt-1 flex justify-between text-2xs">
                    <span className="font-bold text-gold-300">Hero {Math.round(deep.equity.hero * 100)}%</span>
                    <span className="text-ink-secondary">Villain {Math.round(deep.equity.villain * 100)}%</span>
                  </div>
                </>
              )}
            </div>

            <div>
              <p className="mb-1 text-2xs font-semibold text-ink-secondary">GTO 액션 믹스</p>
              <MixBar action={deep.normalizedAction} />
            </div>

            {deep.result.baseline && (
              <p className="text-2xs text-ink-muted">
                기준(레인지) 대비 3-Bet {Math.round(deep.result.baseline.raise * 100)}% to {Math.round(deep.normalizedAction.raise * 100)}%,
                {' '}폴드 {Math.round(deep.result.baseline.fold * 100)}% to {Math.round(deep.normalizedAction.fold * 100)}%
              </p>
            )}

            {recommended && (
              <div
                className="flex items-center justify-center gap-2 rounded-input border py-2"
                style={{ borderColor: `${recommended.color}66`, background: `${recommended.color}14` }}
              >
                <span className="text-2xs text-ink-muted">권장 액션</span>
                <span className="text-sm font-extrabold" style={{ color: recommended.color }}>
                  {recommended.label} {Math.round(recommended.v * 100)}%
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setSheetOpen(true)} className="btn-ghost inline-flex flex-1 items-center justify-center gap-2 py-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
                AI 해설
              </button>
              <button type="button" onClick={copySummary} aria-label="결과 공유/복사" className="btn-ghost inline-flex items-center justify-center gap-1.5 px-4 py-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
                </svg>
                공유
              </button>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-2xs text-ink-muted">
            아래 그리드에서 빌런 카드 2장을 입력하면 블로커 효과가 반영된 결과가 표시됩니다.
          </p>
        )}
      </div>

      {/* 하단 고정: 타겟 선택 + 52-Card 그리드 */}
      <div className="sticky bottom-0 space-y-2 border-t border-border-subtle bg-surface-mid px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {TARGET_TABS.map(({ t, label }) => (
              <button
                key={t}
                type="button"
                onClick={() => deep.setTarget(t)}
                className={[
                  'h-7 rounded-input px-2.5 text-2xs font-semibold transition-colors',
                  deep.currentTarget === t ? 'bg-gold-300 text-ink-inverse' : 'bg-surface-high text-ink-secondary border border-border-default',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={deep.clearAll} className="text-2xs font-semibold text-ink-muted hover:text-danger-light">초기화</button>
        </div>
        <CardGridPicker usedIds={deep.usedIds} onPick={deep.placeCard} />
      </div>

      <DeepBlockerSheet open={sheetOpen} onClose={() => setSheetOpen(false)} result={deep.result} />
    </Modal>
  );
}
