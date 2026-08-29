// src/components/features/gto/HandBoardPicker.tsx
// 카드 입력 블록 — 슬롯(내 핸드/상대 핸드/보드) + 52장 그리드.
// GtoDeepPanel 의 슬롯 문법을 그대로 따른다(같은 앱에서 카드를 고르는 방법이 둘이면 그게 버그다).
//
// 모바일 375 계약: 슬롯은 w-9(36px)·gap-1 이라 보드 5칸이 196px — 가로 스크롤이 생기지 않는다.
// 그리드는 CardGridPicker 가 13열 minmax(0,1fr) 이라 부모 폭을 넘지 않는다(자체 가로 스크롤 0).
import type { ReactNode } from 'react';
import CardGridPicker, { SUIT_COLOR, SUIT_LABEL } from './CardGridPicker';
import type { Card } from './gto.types';
import type { HandTarget, UseHandBoard } from './useHandBoard';

const TARGET_LABEL: Record<HandTarget, string> = { hero: '내 핸드', villain: '상대 핸드', board: '보드' };

function CardSlot({ card, active, label, onClick }: { card: Card | null; active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={card ? `${card.rank}${SUIT_LABEL[card.suit]} 제거` : `${label} 카드 넣기`}
      className={[
        'flex h-12 w-9 shrink-0 flex-col items-center justify-center rounded-input border transition-colors',
        card
          ? 'border-border-strong bg-surface-high'
          : active
            ? 'border-dashed border-accent-300 bg-accent-300/5'
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

function Slots({ hb, target }: { hb: UseHandBoard; target: HandTarget }) {
  const cards = target === 'hero' ? hb.hero : target === 'villain' ? hb.villain : hb.board;
  const active = hb.target === target;
  const nextEmpty = cards.findIndex((c) => c === null);
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => hb.setTarget(target)}
        className={['mb-1 block text-2xs font-bold tracking-wide transition-colors', active ? 'text-accent-300' : 'text-ink-muted'].join(' ')}
      >
        {TARGET_LABEL[target]}
      </button>
      <div className="flex gap-1">
        {cards.map((c, i) => (
          <CardSlot
            key={i}
            card={c}
            active={active && i === nextEmpty}
            label={TARGET_LABEL[target]}
            onClick={() => (c ? hb.removeAt(target, i) : hb.setTarget(target))}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * @param hint 슬롯 아래 한 줄 안내(도구별 요구 조건 — 예: '보드 3~4장')
 * @param summary 슬롯 바로 아래 **한 줄 요약**. 상세 결과는 그리드 아래라 375×667 에선 접힘 밑으로
 *   내려간다 — 핵심 숫자만 손가락 근처에 남긴다. 높이를 고정(min-h)해 값이 바뀌어도 그리드가
 *   손가락 밑에서 움직이지 않는다(CLS 는 공간 예약으로만 푼다 — 모션 헌법 §20.4-5).
 */
export default function HandBoardPicker({ hb, hint, summary }: { hb: UseHandBoard; hint?: ReactNode; summary?: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-x-5 gap-y-2.5">
        <Slots hb={hb} target="hero" />
        <Slots hb={hb} target="villain" />
      </div>
      <Slots hb={hb} target="board" />

      {summary !== undefined && (
        <div className="flex min-h-[2.25rem] items-center rounded-input bg-surface-high px-2.5" aria-live="polite">{summary}</div>
      )}

      <p className="text-2xs leading-relaxed text-ink-muted">
        <b className="font-semibold text-accent-200">{TARGET_LABEL[hb.target]}</b>에 넣을 카드를 아래에서 고르세요 · 슬롯의 카드를 누르면 제거
        {hint ? <> · {hint}</> : null}
      </p>

      <CardGridPicker usedIds={hb.usedIds} onPick={hb.place} />

      <div className="flex justify-end">
        <button type="button" onClick={hb.clear} className="text-2xs font-semibold text-ink-muted transition-colors hover:text-danger-light">
          카드 초기화
        </button>
      </div>
    </div>
  );
}
