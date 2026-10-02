// 게시판 SPOT 공유 화면 공용 조각 — 카드 앞/뒷면, 맥락 칩, 스트리트 타임라인, 공개 블록.
// 원본: 시안 브랜치 NURI/spot-share-design-1001(b8982254) ShareParts.tsx. 시안 전용 PollBars 는 버리고
// 실제 투표는 기존 PostAttachments(post_polls · 낙관 갱신 · 로그인 게이트)를 그대로 쓴다.
//
// 카드 면은 **두 테마 모두 흰 면**이다 — 실물 카드처럼 즉시 읽히고 배경과 무관하게 같다.
// 무늬 색은 4색 덱(♠검정 ♥빨강 ♦파랑 ♣초록). 흰 면 위 대비: ♠ 17.7 · ♥ 6.0 · ♦ 5.9 · ♣ 6.1 (시안 README 실측표).
import type { ReactNode } from 'react';
import Icon from '../../../atoms/Icon';
import type { ShareView, ViewStreet } from './shareView';

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' } as const;
const SUIT_NAME = { s: '스페이드', h: '하트', d: '다이아몬드', c: '클럽' } as const;
const SUIT_HEX = { s: '#111827', h: '#C81E2B', d: '#0369A1', c: '#167247' } as const;
type SuitKey = keyof typeof SUIT;

// 아래 셋은 Tailwind 임의값 클래스 대신 인라인 style 이다 — 임의값 클래스는 **전역 CSS**(첫 화면이 통째로 받는다)에 규칙을 보태지만
// 이 파일은 SPOT 글을 여는 사람만 받는 지연 청크라서 인라인이면 첫 화면 예산(bundle-budget entryGzipKb)에 안 닿는다(PR #99 · 267.2/267).
// 흰 카드 가장자리 = 얇은 테두리 링(검정 10%) + 아래로 살짝 퍼지는 그림자.
const CARD_EDGE = '0 0 0 1px rgb(0 0 0 / 0.1), 0 1px 2px rgb(0 0 0 / 0.25)';
// 뒷면 대각 줄무늬.
const BACK_STRIPES = 'repeating-linear-gradient(45deg, rgb(var(--accent-300) / 0.55) 0 4px, rgb(var(--accent-300) / 0.3) 4px 8px)';

const SIZES = {
  xs: { w: 26, h: 36, rank: 15, suit: 12, r: 5 },
  sm: { w: 32, h: 44, rank: 17, suit: 14, r: 6 },
  md: { w: 42, h: 58, rank: 22, suit: 18, r: 7 },
  lg: { w: 56, h: 78, rank: 30, suit: 24, r: 9 },
} as const;
export type CardSize = keyof typeof SIZES;

export function PlayingCard({ code, size = 'md' }: { code: string; size?: CardSize }) {
  const z = SIZES[size];
  const rank = code[0] === 'T' ? '10' : code[0];
  const s = code[1] as SuitKey;
  return (
    <span role="img" aria-label={`${rank} ${SUIT_NAME[s] ?? ''}`} data-card={code}
      className="inline-flex shrink-0 flex-col items-center justify-center bg-white font-extrabold leading-none"
      style={{ width: z.w, height: z.h, borderRadius: z.r, color: SUIT_HEX[s], boxShadow: CARD_EDGE }}>
      <span style={{ fontSize: z.rank, letterSpacing: rank === '10' ? '-0.06em' : undefined }} className="tabular-nums">{rank}</span>
      <span aria-hidden style={{ fontSize: z.suit, marginTop: 1 }}>{SUIT[s]}</span>
    </span>
  );
}

export function CardBack({ size = 'md' }: { size?: CardSize }) {
  const z = SIZES[size];
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center border border-accent-300/50"
      style={{ width: z.w, height: z.h, borderRadius: z.r, background: BACK_STRIPES }}>
      <Icon name="lock" size={Math.round(z.suit * 0.8)} className="text-white/90" />
    </span>
  );
}

/** 카드 묶음 — 비면 아무것도 그리지 않는다(빈 값 미표시). hidden 이면 뒷면 두 장 */
export function Cards({ codes, size = 'md', hidden = false, gap = 4, testId }: { codes: string[]; size?: CardSize; hidden?: boolean; gap?: number; testId?: string }) {
  if (hidden) return <span className="inline-flex" style={{ gap }} role="img" aria-label="가려진 카드 2장" data-testid={testId}><CardBack size={size} /><CardBack size={size} /></span>;
  if (!codes.length) return null;
  return <span className="inline-flex" style={{ gap }} data-testid={testId}>{codes.map((c) => <PlayingCard key={c} code={c} size={size} />)}</span>;
}

export function ContextChips({ v, className = '' }: { v: ShareView; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs text-ink-secondary ${className}`}>
      {v.context.map((c, i) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="h-1 w-1 rounded-full bg-ink-muted opacity-60" />}
          <span className="tabular-nums">{c}</span>
        </span>
      ))}
    </span>
  );
}

/** 스트리트별 진행 — 보드 카드 + 그 스트리트의 액션 칩. 액션도 보드도 없는 스트리트는 줄 자체가 없다. */
export function StreetTimeline({ streets, decision }: { streets: ViewStreet[]; decision: string }) {
  return (
    <ol className="flex flex-col gap-2.5" data-testid="spot-timeline">
      {streets.map((st) => (
        <li key={st.street} className="flex min-w-0 gap-2.5">
          <span className="w-12 shrink-0 pt-1 text-2xs font-semibold text-ink-muted">{st.label}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {st.board.length > 0 && <Cards codes={st.board} size="sm" gap={3} />}
            {st.actions.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {st.actions.map((a, i) => (
                  <span key={i} className={['inline-flex items-center gap-1 rounded-input px-2 py-1 text-xs tabular-nums',
                    a.isHero ? 'bg-accent-300/15 text-ink-primary' : 'bg-surface-high text-ink-secondary'].join(' ')}>
                    <span className="font-semibold text-ink-primary">{a.isHero ? `나(${a.pos})` : a.pos}</span>
                    {a.label}{a.sizeBb !== undefined && <span>{a.sizeBb}BB</span>}
                  </span>
                ))}
              </span>
            )}
          </div>
        </li>
      ))}
      <li className="flex gap-2.5">
        <span className="w-12 shrink-0" />
        <span className="inline-flex items-center gap-1 text-xs font-bold text-accent-200">
          <Icon name="chevron-right" size={14} aria-hidden />{decision} · 내 차례
        </span>
      </li>
    </ol>
  );
}

/**
 * 공개 블록 — 가림이면 무엇이 가려졌는지 한 줄(+작성자에게 공개 버튼),
 * 공개면 상대 카드·글쓴이 선택·결과 중 **있는 것만**. §28: 결과는 이김/짐만(손익 BB 없음).
 */
export function RevealBlock({ v, revealButton }: { v: ShareView; revealButton?: ReactNode }) {
  if (v.hidden) {
    return (
      <div className="flex items-center gap-2 rounded-input bg-surface-high px-3 py-2.5" data-testid="spot-hidden-note">
        <Icon name="lock" size={14} className="shrink-0 text-ink-muted" aria-hidden />
        <p className="min-w-0 flex-1 text-xs text-ink-secondary">투표하면 분포가 보이고, 상대 카드·글쓴이 선택은 작성자가 공개할 때 열립니다.</p>
        {revealButton}
      </div>
    );
  }
  const shown = v.villains.filter((x) => x.cards.length);
  if (!shown.length && !v.heroAction && !v.result) return null;
  return (
    <div className="flex flex-col gap-2 rounded-input border border-border-subtle bg-surface-high/60 px-3 py-2.5" data-testid="spot-revealed">
      <p className="text-2xs font-semibold text-ink-muted">공개됨</p>
      {shown.map((x) => (
        <div key={x.letter} className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-xs text-ink-secondary">{x.label} <span className="text-ink-muted">{x.pos}</span></span>
          <Cards codes={x.cards} size="sm" gap={3} />
        </div>
      ))}
      {v.heroAction && (
        <div className="flex items-center gap-2 text-xs" data-spot-heroaction="">
          <span className="w-24 shrink-0 text-ink-secondary">글쓴이 선택</span>
          <b className="font-bold text-ink-primary">{v.heroAction.label}{v.heroAction.sizeBb !== undefined ? ` ${v.heroAction.sizeBb}BB` : ''}</b>
        </div>
      )}
      {v.result && (
        <div className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-ink-secondary">결과</span>
          <b className="font-bold text-ink-primary">{v.result.won ? '이김' : '짐'}</b>
        </div>
      )}
    </div>
  );
}
