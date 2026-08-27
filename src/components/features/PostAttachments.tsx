// src/components/features/PostAttachments.tsx
// 게시글 상세 어태치먼트 블록 — 핸드 결과 카드(HandResult) + 투표(Poll).
// 오너 패키지 §7 이식본. 데이터 계약은 src/api/postAttachments.ts 가 단일 소스.
//
// 렌더 규칙(패키지 그대로):
//  - hand: cards 없으면 우측 비주얼 미출력(좌측 전폭) · headline 없고 cards 만이면 카드 가운데 ·
//          둘 다 없으면 null. tone win=emerald / loss=danger(정본 토큰).
//  - poll: 투표 전 득표율 비공개 · 낙관 갱신→서버 집계 덮어쓰기 · 실패 롤백 ·
//          마감 시 비활성 '마감됨' · 같은 선택지 연타 무시.
import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { Attachment, Card, HandAttachment, PollAttachment, PollOption, Suit } from '../../api/postAttachments';
import { useAuth } from '../../contexts/AuthContext';
import { promptLogin } from '../../lib/requireLogin';
import Icon from '../atoms/Icon';

// ── 4-color deck — 카드지(surface-float)가 테마를 타므로 수트 색도 테마별 2톤.
//    실측(WCAG 비텍스트 ≥3:1, 다크 스톡 #373056 / 라이트 스톡 #E6E8EC):
//    ♥ 3.37/3.65 · ♦ 3.89/3.44 · ♣ 3.67/3.88 · ♠(ink-primary) 11.19/14.76.
//    단일 hex 로는 두 테마를 동시에 3:1 못 넘겨 dark: 분기(고정 hex 는 ranges.data.ts 전례).
const SUIT_FILL: Record<Suit, string> = {
  s: 'fill-ink-primary',
  h: 'fill-[#D93A55] dark:fill-[#E25670]',
  d: 'fill-[#2E7DD1] dark:fill-[#4D94E5]',
  c: 'fill-[#178355] dark:fill-[#23A06A]',
};

// 수트 글리프 — Icon.tsx PATHS 의 자체 제작 포커 글리프(viewBox 0 0 24 24)를 재사용.
// PATHS 는 모듈 프라이빗이라 d 문자열을 복제(형태 단일 소스는 Icon.tsx — 바꾸면 여기도 동기화).
const SUIT_GLYPH: Record<Suit, ReactElement> = {
  s: <path d="M12 3C10.03 7.03 5.72 9.19 5.72 13.03c0 2.72 2.25 4.13 4.5 3.28-.38 1.78-1.22 2.82-2.53 3.75h8.62c-1.31-.93-2.15-1.97-2.53-3.75 2.25.85 4.5-.56 4.5-3.28C18.28 9.19 13.97 7.03 12 3Z" />,
  h: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />,
  d: <path d="M12 2.5 18.8 12 12 21.5 5.2 12Z" />,
  c: (
    <>
      <circle cx="12" cy="7.5" r="3.6" />
      <circle cx="7.2" cy="13.5" r="3.6" />
      <circle cx="16.8" cy="13.5" r="3.6" />
      <path d="M10.4 13.5c-.35 3.2-1.35 5.1-2.9 6.5h9c-1.55-1.4-2.55-3.3-2.9-6.5Z" />
    </>
  ),
};

// ── PlayingCard — 순수 SVG(§7-1): 코너 랭크+수트, 중앙 대형 수트, 카드 스톡 수직 그라데이션·엣지 하이라이트.
//    스톡은 surface 토큰이라 라이트 모드 자동 대응(위에 흰 빛·아래 그늘 오버레이는 테마 무관하게 성립).
const CARD_W = 52;
const CARD_H = 73;

function PlayingCard({ card, style }: { card: Card; style?: CSSProperties }) {
  const gid = useId();
  const fill = SUIT_FILL[card.suit];
  const rank = card.rank === 'T' ? '10' : card.rank;
  return (
    <svg
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      width={CARD_W}
      height={CARD_H}
      className="absolute bottom-1 left-1/2 drop-shadow"
      style={style}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${gid}-stock`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.14" />
          <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.03" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.10" />
        </linearGradient>
      </defs>
      {/* 카드 스톡 + 수직 그라데이션 + 라운드 */}
      <rect x="0.5" y="0.5" width={CARD_W - 1} height={CARD_H - 1} rx="6.5"
        style={{ fill: 'rgb(var(--surface-float))', stroke: 'rgb(var(--border-strong))' }} strokeWidth="1" />
      <rect x="0.5" y="0.5" width={CARD_W - 1} height={CARD_H - 1} rx="6.5" fill={`url(#${gid}-stock)`} />
      {/* 엣지 하이라이트(안쪽 1px) */}
      <rect x="1.5" y="1.5" width={CARD_W - 3} height={CARD_H - 3} rx="5.5"
        fill="none" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1" />
      {/* 코너 랭크 + 소형 수트 */}
      <text x="6" y="16.5" fontSize="13" fontWeight="800" className={fill}>{rank}</text>
      <g transform="translate(5.8 19.5) scale(0.42)" className={fill}>{SUIT_GLYPH[card.suit]}</g>
      {/* 중앙 대형 수트 */}
      <g transform="translate(15 32) scale(0.92)" className={fill} opacity="0.95">{SUIT_GLYPH[card.suit]}</g>
    </svg>
  );
}

// ── CardFan — 팬 레이아웃 일반화(§7-2): 1~4장(PLO). 장수별 각도·간격·스케일, 컨테이너 폭 고정.
function fanLayout(n: number): { angles: number[]; step: number; scale: number } {
  if (n <= 1) return { angles: [-4], step: 0, scale: 1 };
  if (n === 2) return { angles: [-11, 9], step: 26, scale: 1 };
  // 3~4장: 부채꼴 균등 분배 + 스케일 축소
  const start = -16;
  const end = 14;
  const angles = Array.from({ length: n }, (_, i) => start + ((end - start) * i) / (n - 1));
  return { angles, step: n === 3 ? 28 : 27, scale: n === 3 ? 0.86 : 0.76 };
}

function CardFan({ cards }: { cards: Card[] }) {
  const n = cards.length;
  const { angles, step, scale } = fanLayout(n);
  const center = (n - 1) / 2;
  return (
    <div className="relative h-[92px] w-[132px] shrink-0" aria-hidden>
      {cards.map((card, i) => {
        const x = (i - center) * step;
        const y = Math.abs(i - center) * 3; // 바깥 카드가 살짝 내려앉는 아크
        return (
          <PlayingCard
            key={`${card.rank}${card.suit}-${i}`}
            card={card}
            style={{
              transform: `translateX(-50%) translate(${x}px, ${y}px) rotate(${angles[i]}deg) scale(${scale})`,
              transformOrigin: '50% 100%',
            }}
          />
        );
      })}
    </div>
  );
}

// ── HandResult ──────────────────────────────────────────────────────────────
// 톤 텍스트는 테마별 2톤 — emerald-300/danger-light 는 흰 배경에서 4.5:1 미달(1.8~2.2)이라
// 라이트는 텍스트 전용 딥 톤(emerald-700 5.39 · danger-deep 6.20, 틴트 칩 위 4.64/5.12 실측).
const HAND_TONE = {
  win: {
    border: 'border-emerald-500/30',
    headline: 'text-emerald-700 dark:text-emerald-300',
    chip: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    // 글로우: blur-2xl 대신 정적 radial-gradient(§7-7 — 페인트 폭탄 회피). emerald-400 #0ECB81.
    glow: 'radial-gradient(120% 90% at 85% 12%, rgba(14,203,129,0.12), transparent 60%)',
  },
  loss: {
    border: 'border-danger/25',
    headline: 'text-danger-deep dark:text-danger-light',
    chip: 'border-danger/30 bg-danger/15 text-danger-deep dark:text-danger-light',
    glow: 'radial-gradient(120% 90% at 85% 12%, rgba(246,70,93,0.10), transparent 60%)', // danger #F6465D
  },
  neutral: {
    border: 'border-border-subtle',
    headline: 'text-ink-primary',
    chip: 'border-border-default bg-surface-high text-ink-secondary',
    glow: null as string | null,
  },
} as const;

function HandResult({ hand }: { hand: HandAttachment }) {
  const cards = hand.cards ?? [];
  const hasCards = cards.length > 0;
  const hasHeadline = !!hand.headline;
  if (!hasCards && !hasHeadline) return null;

  const tone = hand.tone === 'win' ? HAND_TONE.win : hand.tone === 'loss' ? HAND_TONE.loss : HAND_TONE.neutral;

  return (
    <div className={`relative overflow-hidden rounded-card border bg-surface-low p-4 ${tone.border}`}>
      {tone.glow && (
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: tone.glow }} />
      )}
      {hasHeadline ? (
        <div className="relative flex items-center gap-3">
          {/* 좌측 텍스트 — cards 없으면 전폭 */}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className={`text-base font-bold leading-snug break-words ${tone.headline}`}>{hand.headline}</p>
            {hand.delta != null && hand.delta !== '' && (
              <span className={`inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-bold tabular-nums ${tone.chip}`}>
                {hand.delta}
              </span>
            )}
            {hand.meta != null && hand.meta !== '' && (
              <p className="text-2xs text-ink-muted break-words">{hand.meta}</p>
            )}
          </div>
          {hasCards && <CardFan cards={cards} />}
        </div>
      ) : (
        // headline 없이 cards 만 — 카드 가운데
        <div className="relative flex justify-center">
          <CardFan cards={cards} />
        </div>
      )}
    </div>
  );
}

// ── Poll ────────────────────────────────────────────────────────────────────
function formatCloseAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}.${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function Poll({ poll, onVote }: { poll: PollAttachment; onVote?: (pollId: string, optionId: string) => Promise<PollOption[]> }) {
  const { user } = useAuth();
  // 로컬 상태 = 낙관 갱신 레이어. 부모(모달)가 서버 집계·리얼타임으로 props 를 갱신하면 덮어쓴다.
  const [options, setOptions] = useState<PollOption[]>(poll.options);
  const [myOptionId, setMyOptionId] = useState<string | null>(poll.myOptionId);
  const inFlightRef = useRef(false);

  useEffect(() => { setOptions(poll.options); }, [poll.options]);
  useEffect(() => { setMyOptionId(poll.myOptionId); }, [poll.myOptionId]);

  const closed = !!poll.closesAt && Date.parse(poll.closesAt) <= Date.now();
  const showResults = myOptionId != null || closed; // 투표 전 득표율 비공개
  const sorted = [...options].sort((a, b) => a.idx - b.idx);
  const total = sorted.reduce((sum, o) => sum + o.votes, 0);

  const vote = async (optionId: string) => {
    if (closed) return;
    if (!user) { promptLogin(); return; } // 비로그인 → 로그인 게이트(앱 공통 문법)
    if (optionId === myOptionId) return;  // 같은 선택지 연타 무시
    if (inFlightRef.current || !onVote) return;

    // 낙관 갱신 — 이전 표 -1, 새 표 +1
    const prevOptions = options;
    const prevMy = myOptionId;
    inFlightRef.current = true;
    setMyOptionId(optionId);
    setOptions((os) => os.map((o) => {
      if (o.id === optionId) return { ...o, votes: o.votes + 1 };
      if (o.id === prevMy) return { ...o, votes: Math.max(0, o.votes - 1) };
      return o;
    }));
    try {
      const server = await onVote(poll.id, optionId);
      setOptions(server); // 서버 집계가 최종
    } catch {
      // 실패 롤백(토스트는 호출부 onVote 가 담당)
      setOptions(prevOptions);
      setMyOptionId(prevMy);
    } finally {
      inFlightRef.current = false;
    }
  };

  return (
    <div className="rounded-card border border-border-subtle bg-surface-low p-3 space-y-2">
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 shrink-0 text-accent-300"><Icon name="chart" size={14} /></span>
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink-primary break-words">{poll.question}</p>
        {closed && (
          <span className="shrink-0 rounded-badge bg-surface-high px-2 py-0.5 text-2xs font-bold text-ink-muted">마감됨</span>
        )}
      </div>

      <div className="space-y-1.5" role="group" aria-label="투표 선택지">
        {sorted.map((o) => {
          const mine = o.id === myOptionId;
          const pct = showResults && total > 0 ? Math.round((o.votes / total) * 100) : 0;
          return (
            <button
              key={o.id}
              type="button"
              disabled={closed}
              aria-pressed={mine}
              onClick={() => vote(o.id)}
              className={[
                'relative w-full overflow-hidden rounded-input border px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                mine
                  ? 'border-accent-300 text-ink-primary'
                  : 'border-border-default text-ink-secondary',
                closed
                  ? 'bg-surface-high/50 opacity-70'
                  : mine
                    ? 'bg-accent-300/5'
                    : 'bg-surface-high hover:border-accent-300/60 hover:text-ink-primary',
              ].join(' ')}
            >
              {/* 득표 게이지 — accent α. transition-[width]는 자기완결 진행바 예외(모션 헌법 §3),
                  motion-safe 로 prefers-reduced-motion 존중. 토큰 곡선·duration 사용. */}
              {showResults && (
                <span
                  aria-hidden
                  className={[
                    'absolute inset-y-0 left-0',
                    mine ? 'bg-accent-300/20' : 'bg-accent-300/10',
                    'motion-safe:transition-[width] motion-safe:[transition-duration:var(--dur-panel)] motion-safe:[transition-timing-function:var(--ease)]',
                  ].join(' ')}
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {mine && <span className="shrink-0 text-accent-300"><Icon name="check" size={14} /></span>}
                  <span className="truncate">{o.label}</span>
                </span>
                {showResults && (
                  <span className="shrink-0 text-xs tabular-nums">
                    <span className="font-bold text-ink-primary">{pct}%</span>
                    {/* ink-muted 는 게이지(accent α) 위에서 4.1~4.4:1 로 미달 — secondary 로 승급(실측 4.8~6.4) */}
                    <span className="text-ink-secondary"> · {o.votes}표</span>
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-2xs text-ink-muted tabular-nums">
        {showResults ? `총 ${total}표` : '투표하면 결과가 공개됩니다'}
        {poll.closesAt && !closed && ` · ${formatCloseAt(poll.closesAt)} 마감`}
      </p>
    </div>
  );
}

// ── 엔트리 ──────────────────────────────────────────────────────────────────
interface PostAttachmentsProps {
  attachment: Attachment;
  /** poll 투표 배선(castPollVote) — 서버 확정 집계를 resolve, 실패 시 reject(호출부가 토스트). */
  onVote?: (pollId: string, optionId: string) => Promise<PollOption[]>;
}

export default function PostAttachments({ attachment, onVote }: PostAttachmentsProps) {
  if (attachment.kind === 'hand') return <HandResult hand={attachment} />;
  if (attachment.kind === 'poll') return <Poll poll={attachment} onVote={onVote} />;
  return null;
}
