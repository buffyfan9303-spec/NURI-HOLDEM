// src/components/features/gto/HandBoardPicker.tsx
// 카드 입력 블록 — 슬롯(내 핸드/상대 핸드/보드) + 52장 그리드.
// GtoDeepPanel 의 슬롯 문법을 그대로 따른다(같은 앱에서 카드를 고르는 방법이 둘이면 그게 버그다).
//
// 모바일 375 계약: 슬롯은 w-9(36px)·gap-1 이라 보드 5칸이 196px — 가로 스크롤이 생기지 않는다.
// 그리드는 CardGridPicker 가 13열 minmax(0,1fr) 이라 부모 폭을 넘지 않는다(자체 가로 스크롤 0).
//
// 2026-09-19: 빌런 B~E 슬롯(hb.extra). 상대가 A 뿐이면 라벨은 예전 그대로 '상대 핸드' 다 —
// 아웃츠·리플레이 화면은 extra 가 [] 라 아무것도 달라지지 않는다.
import type { ReactNode } from 'react';
import CardGridPicker, { SUIT_COLOR, SUIT_LABEL } from './CardGridPicker';
import type { Card } from './gto.types';
import { extraIndexOf, type HandTarget, type UseHandBoard } from './useHandBoard';

const EXTRA_LETTER = ['B', 'C', 'D', 'E'];

/** 슬롯 라벨. `extraLabels` 는 자리 이름('CO')처럼 호출부가 덧붙일 말 — 없으면 글자만. */
function labelOf(t: HandTarget, hb: UseHandBoard, extraLabels?: readonly string[]): string {
  const i = extraIndexOf(t);
  if (i !== null) return `상대 ${EXTRA_LETTER[i]}${extraLabels?.[i] ? ` (${extraLabels[i]})` : ''}`;
  if (t === 'hero') return '내 핸드';
  if (t === 'board') return '보드';
  return hb.extra.length > 0 ? '상대 A' : '상대 핸드';
}

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

function Slots({ hb, target, label }: { hb: UseHandBoard; target: HandTarget; label: string }) {
  const i = extraIndexOf(target);
  const cards = i !== null ? (hb.extra[i] ?? []) : target === 'hero' ? hb.hero : target === 'villain' ? hb.villain : hb.board;
  const active = hb.target === target;
  const nextEmpty = cards.findIndex((c) => c === null);
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => hb.setTarget(target)}
        className={['mb-1 block text-2xs font-bold tracking-wide transition-colors', active ? 'text-accent-300' : 'text-ink-muted'].join(' ')}
      >
        {label}
      </button>
      <div className="flex gap-1">
        {cards.map((c, j) => (
          <CardSlot
            key={j}
            card={c}
            active={active && j === nextEmpty}
            label={label}
            onClick={() => (c ? hb.removeAt(target, j) : hb.setTarget(target))}
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
 * @param villainLabels 상대 라벨에 덧붙일 자리 이름 — index 0 = 빌런 A, 1~ = B~E. NURI SPOT 이 넘긴다.
 */
export default function HandBoardPicker({ hb, hint, summary, villainLabels }: {
  hb: UseHandBoard; hint?: ReactNode; summary?: ReactNode; villainLabels?: readonly string[];
}) {
  const extraLabels = villainLabels?.slice(1);
  const villainLabel = hb.extra.length > 0
    ? `상대 A${villainLabels?.[0] ? ` (${villainLabels[0]})` : ''}`
    : '상대 핸드';
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-x-5 gap-y-2.5">
        <Slots hb={hb} target="hero" label="내 핸드" />
        <Slots hb={hb} target="villain" label={villainLabel} />
        {hb.extra.map((_, i) => {
          const t = (['v1', 'v2', 'v3', 'v4'] as const)[i];
          return <Slots key={t} hb={hb} target={t} label={labelOf(t, hb, extraLabels)} />;
        })}
      </div>
      <Slots hb={hb} target="board" label="보드" />

      {summary !== undefined && (
        <div className="flex min-h-[2.25rem] items-center rounded-input bg-surface-high px-2.5" aria-live="polite">{summary}</div>
      )}

      <p className="text-2xs leading-relaxed text-ink-muted">
        <b className="font-semibold text-accent-200">{hb.target === 'villain' ? villainLabel : labelOf(hb.target, hb, extraLabels)}</b>에 넣을 카드를 아래에서 고르세요 · 슬롯의 카드를 누르면 제거
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
