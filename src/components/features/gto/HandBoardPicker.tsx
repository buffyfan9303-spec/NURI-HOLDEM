// src/components/features/gto/HandBoardPicker.tsx
// 카드 입력 블록 — 슬롯(내 핸드/상대 핸드/보드) + 52장 그리드.
// GtoDeepPanel 의 슬롯 문법을 그대로 따른다(같은 앱에서 카드를 고르는 방법이 둘이면 그게 버그다).
//
// 모바일 375 계약: 슬롯은 w-9(36px)·gap-1 이라 보드 5칸이 196px — 가로 스크롤이 생기지 않는다.
// 그리드는 CardGridPicker 가 13열 minmax(0,1fr) 이라 부모 폭을 넘지 않는다(자체 가로 스크롤 0).
//
// 2026-09-19: 빌런 B~E 슬롯(hb.extra). 상대가 A 뿐이면 라벨은 예전 그대로 '상대 핸드' 다 —
// 아웃츠·리플레이 화면은 extra 가 [] 라 아무것도 달라지지 않는다.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import CardGridPicker, { SUIT_COLOR, SUIT_LABEL } from './CardGridPicker';
import { cardId, type Card, type CardId } from './gto.types';
import { extraIndexOf, type HandTarget, type UseHandBoard } from './useHandBoard';

const EXTRA_LETTER = ['B', 'C', 'D', 'E'];

/**
 * M06(2026-10-08) — 그리드에서 **손으로 고른** 카드가 슬롯에 놓이는 순간만 짧게 '내려앉는다'.
 *   · 슬롯 한 칸(36×48)의 transform·opacity 만 움직인다 — 레이아웃·크기·결과 숫자는 그대로다.
 *   · 출발이 빠르고 끝이 부드러운 감속(out-quint) 180ms. fill 없음 → 끝나면 원래 스타일 그대로.
 *   · 재생 조건은 `dealt`(onPick 이벤트에서만 바뀌는 값) 하나뿐이다 — 저장 복원·재계산·폴링·탭 재방문으로
 *     카드 배열이 바뀌거나 다시 그려져도 재생하지 않는다.
 *   · prefers-reduced-motion 이면 0. 카드를 빼거나 화면을 떠나면 진행 중인 애니를 취소한다.
 */
// eslint-disable-next-line react-refresh/only-export-components -- 회귀 테스트가 같은 값을 읽는다(한 벌)
export const DEAL_KEYFRAMES: Keyframe[] = [
  { transform: 'translateY(-6px) scale(0.9)', opacity: 0.4 },
  { transform: 'none', opacity: 1 },
];
// eslint-disable-next-line react-refresh/only-export-components -- 위와 같은 이유
export const DEAL_TIMING: KeyframeAnimationOptions = { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };

function prefersReducedMotion(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** 방금 손으로 고른 카드와 그 시각. 새 객체라 같은 카드를 뺐다 다시 골라도 새 재생이 된다.
 *  at 이 오래됐으면(빼기로 뒤 카드가 당겨져 다른 슬롯에 나타난 경우 등) 재생하지 않는다. */
type Dealt = { id: CardId; at: number } | null;
/** 고른 뒤 이 시간 안에 슬롯에 나타날 때만 재생한다(같은 커밋이면 수 ms). */
// eslint-disable-next-line react-refresh/only-export-components -- 회귀 테스트가 같은 값을 읽는다
export const DEAL_FRESH_MS = 250;

/** 재생 여부 — 순수 함수(회귀 테스트 대상). 손으로 고른 기록이 없거나·오래됐거나·움직임 줄이기면 false. */
// eslint-disable-next-line react-refresh/only-export-components -- 회귀 테스트가 직접 부른다
export function dealPlays(dealt: { at: number } | null, now: number, reduced: boolean): boolean {
  return !!dealt && !reduced && now - dealt.at >= 0 && now - dealt.at <= DEAL_FRESH_MS;
}

/** 슬롯 라벨. `extraLabels` 는 자리 이름('CO')처럼 호출부가 덧붙일 말 — 없으면 글자만. */
function labelOf(t: HandTarget, hb: UseHandBoard, extraLabels?: readonly string[]): string {
  const i = extraIndexOf(t);
  if (i !== null) return `상대 ${EXTRA_LETTER[i]}${extraLabels?.[i] ? ` (${extraLabels[i]})` : ''}`;
  if (t === 'hero') return '내 핸드';
  if (t === 'board') return '보드';
  return hb.extra.length > 0 ? '상대 A' : '상대 핸드';
}

function CardSlot({ card, active, label, onClick, dealt }: {
  card: Card | null; active: boolean; label: string; onClick: () => void;
  /** 이 슬롯의 카드가 방금 손으로 고른 카드면 그 기록, 아니면 null. */
  dealt: Dealt;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function' || !dealPlays(dealt, performance.now(), prefersReducedMotion())) return;
    const anim = el.animate(DEAL_KEYFRAMES, DEAL_TIMING);
    return () => anim.cancel();
  }, [dealt]);
  return (
    <button
      ref={ref}
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
        // '+' 는 '여기 카드를 넣는다'는 UI 표지 — 비텍스트 3:1 이상(ink-muted 전량, 2026-09-28 /40 은 1.7~2.0)
        <span className="text-xs text-ink-muted">+</span>
      )}
    </button>
  );
}

function Slots({ hb, target, label, dealt }: { hb: UseHandBoard; target: HandTarget; label: string; dealt: Dealt }) {
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
            dealt={c && dealt && cardId(c) === dealt.id ? dealt : null}
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
  // 고른 카드 기록은 **그리드 onPick 에서만** 쓴다 — 복원(hb.load)·재계산은 이 값을 건드리지 않는다.
  const [dealt, setDealt] = useState<Dealt>(null);
  const pick = (c: Card) => { setDealt({ id: cardId(c), at: performance.now() }); hb.place(c); };
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-x-5 gap-y-2.5">
        <Slots hb={hb} target="hero" label="내 핸드" dealt={dealt} />
        <Slots hb={hb} target="villain" label={villainLabel} dealt={dealt} />
        {hb.extra.map((_, i) => {
          const t = (['v1', 'v2', 'v3', 'v4'] as const)[i];
          return <Slots key={t} hb={hb} target={t} label={labelOf(t, hb, extraLabels)} dealt={dealt} />;
        })}
      </div>
      <Slots hb={hb} target="board" label="보드" dealt={dealt} />

      {summary !== undefined && (
        <div className="flex min-h-9 items-center rounded-input bg-surface-high px-2.5" aria-live="polite">{summary}</div>
      )}

      <p className="text-2xs leading-relaxed text-ink-muted">
        <b className="font-semibold text-accent-200">{hb.target === 'villain' ? villainLabel : labelOf(hb.target, hb, extraLabels)}</b>에 넣을 카드를 아래에서 고르세요 · 슬롯의 카드를 누르면 제거
        {hint ? <> · {hint}</> : null}
      </p>

      <CardGridPicker usedIds={hb.usedIds} onPick={pick} />

      <div className="-mb-2 flex justify-end">
        {/* 2026-09-25 스윕: 글자 크기 그대로(54×16)라 터치 표적 미달 — 보이는 글자는 두고 누르는 상자를 44px 로(min-h · px-2 · -mr-2 로 오른쪽 정렬 유지). */}
        <button type="button" onClick={hb.clear} className="-mr-2 min-h-[44px] px-2 text-2xs font-semibold text-ink-muted transition-colors hover:text-danger-light">
          카드 초기화
        </button>
      </div>
    </div>
  );
}
