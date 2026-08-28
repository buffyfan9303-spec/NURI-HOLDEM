/* ============================================================================
 * PostComposerExtras — 글 작성 폼의 어태치먼트 입력(핸드 카드 · 투표)
 *  - 오너 패키지 4장(HandDraft/PollDraft/normalize/CardPicker/PollBuilder)을
 *    정본 토큰(surface·border·ink·accent·danger·emerald)으로 번역해 이식.
 *  - normalize 계약: 빈 입력 → null → 저장 안 함. 판정은 여기가 단일 소스 —
 *    호출부(PostFormModal)는 normalize 결과만 믿고 바깥에서 재판정하지 않는다.
 *  - CardPicker 무늬 버튼·선택 카드 미리보기의 흰 배경은 라이트/다크 모두
 *    '카드지(흰)' 고정 — 실물 카드 은유라 의도적으로 테마를 타지 않는다.
 *  - §28: '수익·환전·현금' 계열 카피 금지, 금액 예시 placeholder 금지.
 * ========================================================================== */
import { useId, useState } from 'react';
import type { Card, Rank, Suit, HandAttachment, PollAttachment, HandTone } from '../../api/postAttachments';

// ── 패키지 계약: 드래프트 타입 ───────────────────────────────────────────────
export interface HandDraft {
  headline: string;  // 한 줄 요약 ≤24자(자유 텍스트)
  tone: HandTone;    // 'win' | 'loss' — 카드 프레임 색조
  delta: string;     // 결과 배지 ≤16자
  meta: string;      // 상황 메모 ≤60자 (포지션·스트리트 등)
  cards: Card[];     // 작성 UI 는 최대 2장(홀덤) — DB 는 4장(PLO) 허용, 폼 확장은 후속
}

export type PollCloseKey = 'none' | '24h' | '3d' | '7d';

export interface PollDraft {
  enabled: boolean;   // 토글 — 꺼져 있으면 normalize 가 null 을 돌려준다
  question: string;   // ≤120자
  options: string[];  // 보기 2~6개(빈 문자열은 normalize 에서 걸러짐)
  closesIn: PollCloseKey;
}

// eslint-disable-next-line react-refresh/only-export-components -- 패키지 계약(드래프트·normalize)을 컴포저와 한 파일로 유지
export const emptyHand = (): HandDraft => ({ headline: '', tone: 'win', delta: '', meta: '', cards: [] });
// eslint-disable-next-line react-refresh/only-export-components -- 패키지 계약(드래프트·normalize)을 컴포저와 한 파일로 유지
export const emptyPoll = (): PollDraft => ({ enabled: false, question: '', options: ['', ''], closesIn: 'none' });

const MAX_CARDS = 2;
const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

const DAY_MS = 86_400_000;
const CLOSE_MS: Record<PollCloseKey, number | null> = {
  none: null, '24h': DAY_MS, '3d': 3 * DAY_MS, '7d': 7 * DAY_MS,
};

/**
 * 핸드 드래프트 → 저장 페이로드. 요약도 카드도 없으면 null(저장 안 함) —
 * saveHand 의 빈 껍데기 가드(DB CHECK)와 같은 판정을 폼 단계에서 먼저 내린다.
 */
// eslint-disable-next-line react-refresh/only-export-components -- 패키지 계약(드래프트·normalize)을 컴포저와 한 파일로 유지
export function normalizeHand(d: HandDraft): HandAttachment | null {
  const headline = d.headline.trim();
  const cards = d.cards.slice(0, MAX_CARDS);
  if (!headline && cards.length === 0) return null;
  return {
    kind: 'hand',
    headline: headline || undefined,
    tone: d.tone,
    delta: d.delta.trim() || undefined,
    meta: d.meta.trim() || undefined,
    cards: cards.length > 0 ? cards : null,
  };
}

/**
 * 투표 드래프트 → 저장 페이로드. 토글 꺼짐·질문 공백·유효 보기 2개 미만이면 null.
 * closesAt 은 제출 시점 기준으로 계산(마감 칩 → ISO).
 */
// eslint-disable-next-line react-refresh/only-export-components -- 패키지 계약(드래프트·normalize)을 컴포저와 한 파일로 유지
export function normalizePoll(d: PollDraft): PollAttachment | null {
  if (!d.enabled) return null;
  const question = d.question.trim();
  const labels = d.options.map((s) => s.trim()).filter(Boolean).slice(0, MAX_OPTIONS);
  if (!question || labels.length < MIN_OPTIONS) return null;
  const ms = CLOSE_MS[d.closesIn];
  return {
    kind: 'poll',
    id: '', // 신규 — savePoll 이 post_id 기준 upsert 하므로 미사용
    question,
    options: labels.map((label, idx) => ({ id: '', idx, label, votes: 0 })),
    myOptionId: null,
    closesAt: ms ? new Date(Date.now() + ms).toISOString() : undefined,
  };
}

// ── 카드 상수 (postAttachments 의 52장 정의와 동일) ──────────────────────────
const RANKS: readonly Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: readonly Suit[] = ['s', 'h', 'd', 'c'];
const SUIT_GLYPH: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
// 흰 카드지 위 4색 덱 — 배경이 테마와 무관하게 흰색이라 글자색도 고정 팔레트를 쓴다.
// 흰 배경 대비 실측: red-600 4.83 · sky-700 5.93 · emerald-700 5.39 (600 단은 4.5 미달이라 승급)
const SUIT_ON_WHITE: Record<Suit, string> = {
  s: 'text-neutral-900',
  h: 'text-red-600',
  d: 'text-sky-700',
  c: 'text-emerald-700',
};
const SUIT_NAME: Record<Suit, string> = { s: '스페이드', h: '하트', d: '다이아', c: '클럽' };

const sameCard = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;

/** 선택된 카드 1장 — 흰 카드지 칩. 탭(모바일)·호버 ✕(데스크톱)로 제거. */
function CardChip({ card, onRemove }: { card: Card; onRemove: () => void }) {
  const color = SUIT_ON_WHITE[card.suit];
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`${card.rank} ${SUIT_NAME[card.suit]} 제거`}
      className="group relative w-10 h-14 shrink-0 rounded-md bg-white border border-black/15 shadow-sm flex flex-col items-center justify-center focus:outline-none"
    >
      <span className={['text-base font-extrabold leading-none tabular-nums', color].join(' ')}>{card.rank}</span>
      <span className={['text-sm leading-none mt-0.5', color].join(' ')}>{SUIT_GLYPH[card.suit]}</span>
      <span
        aria-hidden
        className="absolute inset-0 hidden group-hover:flex items-center justify-center rounded-md bg-black/55 text-white text-xs font-bold"
      >
        ✕
      </span>
    </button>
  );
}

// ── CardPicker — 핸드 카드 입력(랭크 → 무늬 2단계) ──────────────────────────
interface CardPickerProps {
  value: HandDraft;
  onChange: (next: HandDraft) => void;
  /** 표시부(fetchAttachment)가 게시글당 어태치먼트 1개(핸드 우선)라 투표와 동시 첨부 금지 */
  blockedBy?: string;
}

export function CardPicker({ value, onChange, blockedBy }: CardPickerProps) {
  if (blockedBy) {
    return (
      <section className="card-sink rounded-card border border-border-default bg-surface-high p-3">
        <p className="text-xs font-bold text-ink-primary">핸드 카드 (선택)</p>
        <p className="mt-0.5 text-2xs text-ink-muted">{blockedBy}</p>
      </section>
    );
  }
  return <CardPickerBody value={value} onChange={onChange} />;
}

function CardPickerBody({ value, onChange }: { value: HandDraft; onChange: (next: HandDraft) => void }) {
  const headlineId = useId();
  const deltaId = useId();
  const metaId = useId();
  const [open, setOpen] = useState(false);
  const [pendingRank, setPendingRank] = useState<Rank | null>(null);

  const attached = normalizeHand(value) !== null;
  const full = value.cards.length >= MAX_CARDS;

  const addCard = (suit: Suit) => {
    if (!pendingRank || full) return;
    const card: Card = { rank: pendingRank, suit };
    if (value.cards.some((c) => sameCard(c, card))) return;
    onChange({ ...value, cards: [...value.cards, card] });
    setPendingRank(null);
  };
  const removeCard = (idx: number) => {
    onChange({ ...value, cards: value.cards.filter((_, i) => i !== idx) });
  };
  const clearCards = () => {
    onChange({ ...value, cards: [] });
    setPendingRank(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-ink-secondary">
          핸드 카드 <span className="text-ink-muted">(선택)</span>
          {attached && !open && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-accent-300/15 text-accent-200 text-2xs font-semibold align-middle">
              첨부됨
            </span>
          )}
        </label>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-2xs font-semibold text-accent-200 hover:text-accent-100"
        >
          {open ? '닫기' : '+ 핸드 카드'}
        </button>
      </div>

      {open && (
        <div className="card-sink space-y-2.5 rounded-input border border-border-default bg-surface-high p-2.5 animate-slide-up">
          {/* 한 줄 요약 */}
          <div>
            <label htmlFor={headlineId} className="block text-2xs font-bold text-ink-secondary mb-1">한 줄 요약</label>
            <input
              id={headlineId}
              type="text"
              value={value.headline}
              onChange={(e) => onChange({ ...value, headline: e.target.value })}
              maxLength={24}
              placeholder="예: 리버 히어로 콜 성공"
              className="input w-full bg-surface-mid text-sm"
            />
          </div>

          {/* 색조 (win/loss) */}
          <div role="group" aria-label="핸드 색조" className="flex gap-1.5">
            {([['win', '잘 풀린 판'], ['loss', '아쉬운 판']] as const).map(([tone, label]) => {
              const active = value.tone === tone;
              const activeCls = tone === 'win'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-400/10'
                : 'border-danger text-danger bg-danger/10';
              return (
                <button
                  key={tone}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...value, tone })}
                  className={[
                    'min-h-[36px] px-3 rounded-full border text-2xs font-semibold transition-colors focus:outline-none',
                    active ? activeCls : 'border-border-default bg-surface-mid text-ink-muted hover:text-ink-secondary',
                  ].join(' ')}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* 결과 배지 · 상황 메모 */}
          <div className="grid grid-cols-[3.75rem_1fr] items-center gap-x-2 gap-y-1.5">
            <label htmlFor={deltaId} className="text-2xs font-bold text-ink-secondary">결과 배지</label>
            <input
              id={deltaId}
              type="text"
              value={value.delta}
              onChange={(e) => onChange({ ...value, delta: e.target.value })}
              maxLength={16}
              placeholder="예: 3벳 팟 승리 (선택)"
              className="input w-full bg-surface-mid text-sm"
            />
            <label htmlFor={metaId} className="text-2xs font-bold text-ink-secondary">상황 메모</label>
            <input
              id={metaId}
              type="text"
              value={value.meta}
              onChange={(e) => onChange({ ...value, meta: e.target.value })}
              maxLength={60}
              placeholder="예: BTN vs BB · 리버 (선택)"
              className="input w-full bg-surface-mid text-sm"
            />
          </div>

          {/* 선택 카드 미리보기 + 전체 지우기 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xs font-bold text-ink-secondary">
                카드 <span className="font-normal text-ink-muted">({value.cards.length}/{MAX_CARDS})</span>
              </span>
              {value.cards.length > 0 && (
                <button
                  type="button"
                  onClick={clearCards}
                  className="text-2xs font-semibold text-ink-muted hover:text-danger transition-colors"
                >
                  전체 지우기
                </button>
              )}
            </div>

            {value.cards.length > 0 && (
              <div className="flex gap-1.5 mb-2">
                {value.cards.map((c, i) => (
                  <CardChip key={`${c.rank}${c.suit}`} card={c} onRemove={() => removeCard(i)} />
                ))}
              </div>
            )}

            {full ? (
              <p className="text-2xs text-ink-muted">최대 {MAX_CARDS}장 — 카드를 빼면 다시 고를 수 있어요</p>
            ) : (
              <>
                {/* 1단계 — 랭크 */}
                <p className="text-2xs text-ink-muted mb-1">
                  {pendingRank
                    ? <>랭크 <b className="text-accent-200">{pendingRank}</b> — 아래에서 무늬를 고르세요</>
                    : '먼저 랭크를 고르세요'}
                </p>
                <div className="grid gap-1 mb-1.5" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
                  {RANKS.map((rank) => {
                    const active = pendingRank === rank;
                    return (
                      <button
                        key={rank}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPendingRank(active ? null : rank)}
                        className={[
                          'h-8 rounded-[4px] text-2xs font-bold tabular-nums select-none touch-manipulation transition-colors',
                          'active:scale-[0.9] focus:outline-none',
                          active
                            ? 'bg-accent-300/15 border border-accent-400 text-accent-200'
                            : 'bg-surface-mid border border-border-default text-ink-primary',
                        ].join(' ')}
                      >
                        {rank}
                      </button>
                    );
                  })}
                </div>

                {/* 2단계 — 무늬 (카드지 흰 배경 고정 — 실물 카드 은유) */}
                {pendingRank && (
                  <div className="grid grid-cols-4 gap-1.5 animate-fade-in">
                    {SUITS.map((suit) => {
                      const taken = value.cards.some((c) => sameCard(c, { rank: pendingRank, suit }));
                      return (
                        <button
                          key={suit}
                          type="button"
                          disabled={taken}
                          aria-label={`${pendingRank} ${SUIT_NAME[suit]}`}
                          onClick={() => addCard(suit)}
                          className={[
                            'h-11 rounded-md bg-white border border-black/15 shadow-sm flex items-center justify-center gap-1',
                            'select-none touch-manipulation active:scale-[0.94] transition-transform focus:outline-none',
                            taken ? 'opacity-25 cursor-not-allowed' : '',
                          ].join(' ')}
                        >
                          <span className={['text-sm font-extrabold tabular-nums', SUIT_ON_WHITE[suit]].join(' ')}>{pendingRank}</span>
                          <span className={['text-base leading-none', SUIT_ON_WHITE[suit]].join(' ')}>{SUIT_GLYPH[suit]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PollBuilder — 투표 입력 ──────────────────────────────────────────────────
const CLOSE_OPTIONS: { key: PollCloseKey; label: string }[] = [
  { key: 'none', label: '없음' },
  { key: '24h', label: '24시간' },
  { key: '3d', label: '3일' },
  { key: '7d', label: '7일' },
];

interface PollBuilderProps {
  value: PollDraft;
  onChange: (next: PollDraft) => void;
  /** 이미 표를 받은 투표 편집 시 보기 잠금(전량 교체 저장이라 표가 사라지는 것을 방지) */
  lockOptions?: boolean;
  /** 핸드 카드와 동시 첨부 금지(표시부가 게시글당 1개 — 핸드 우선이라 투표가 묻힘) */
  blockedBy?: string;
}

export function PollBuilder({ value, onChange, lockOptions, blockedBy }: PollBuilderProps) {
  if (blockedBy) {
    return (
      <section className="card-sink rounded-card border border-border-default bg-surface-high p-3">
        <p className="text-xs font-bold text-ink-primary">투표 (선택)</p>
        <p className="mt-0.5 text-2xs text-ink-muted">{blockedBy}</p>
      </section>
    );
  }
  return <PollBuilderBody value={value} onChange={onChange} lockOptions={lockOptions} />;
}

function PollBuilderBody({ value, onChange, lockOptions }: Omit<PollBuilderProps, 'blockedBy'>) {
  const questionId = useId();

  const setOption = (idx: number, label: string) => {
    onChange({ ...value, options: value.options.map((o, i) => (i === idx ? label : o)) });
  };
  const addOption = () => {
    if (value.options.length >= MAX_OPTIONS) return;
    onChange({ ...value, options: [...value.options, ''] });
  };
  const removeOption = (idx: number) => {
    if (value.options.length <= MIN_OPTIONS) return;
    onChange({ ...value, options: value.options.filter((_, i) => i !== idx) });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-ink-secondary">
          투표 <span className="text-ink-muted">(선택)</span>
        </label>
        <button
          type="button"
          onClick={() => onChange({ ...value, enabled: !value.enabled })}
          className={[
            'text-2xs font-semibold transition-colors',
            value.enabled ? 'text-ink-muted hover:text-danger' : 'text-accent-200 hover:text-accent-100',
          ].join(' ')}
        >
          {value.enabled ? '제거' : '+ 투표 추가'}
        </button>
      </div>

      {value.enabled && (
        <div className="card-sink space-y-2.5 rounded-input border border-border-default bg-surface-high p-2.5 animate-slide-up">
          {/* 질문 */}
          <div>
            <label htmlFor={questionId} className="block text-2xs font-bold text-ink-secondary mb-1">질문</label>
            <input
              id={questionId}
              type="text"
              value={value.question}
              onChange={(e) => onChange({ ...value, question: e.target.value })}
              maxLength={120}
              placeholder="예: 이 스팟, 콜? 폴드?"
              className="input w-full bg-surface-mid text-sm"
            />
            <p className="text-right text-2xs text-ink-muted mt-1">{value.question.length}/120</p>
          </div>

          {/* 보기 2~6개 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xs font-bold text-ink-secondary">
                보기 <span className="font-normal text-ink-muted">({value.options.length}/{MAX_OPTIONS})</span>
              </span>
              {!lockOptions && value.options.length < MAX_OPTIONS && (
                <button
                  type="button"
                  onClick={addOption}
                  className="text-2xs font-semibold text-accent-200 hover:text-accent-100"
                >
                  + 보기 추가
                </button>
              )}
            </div>
            {lockOptions && (
              <p className="text-2xs text-ink-muted mb-1.5">이미 받은 표가 있어 보기는 수정할 수 없어요</p>
            )}
            <div className="space-y-1.5">
              {value.options.map((label, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={label}
                    disabled={lockOptions}
                    onChange={(e) => setOption(i, e.target.value)}
                    maxLength={60}
                    placeholder={`보기 ${i + 1}`}
                    aria-label={`보기 ${i + 1}`}
                    className="input w-full bg-surface-mid text-sm disabled:opacity-60"
                  />
                  {!lockOptions && value.options.length > MIN_OPTIONS && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      aria-label={`보기 ${i + 1} 삭제`}
                      className="w-8 h-8 shrink-0 flex items-center justify-center rounded-input border border-border-default bg-surface-mid text-ink-muted hover:text-danger transition-colors text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 마감 */}
          <div role="group" aria-label="투표 마감" className="flex items-center gap-1.5 flex-wrap">
            <span className="text-2xs font-bold text-ink-secondary mr-0.5">마감</span>
            {CLOSE_OPTIONS.map(({ key, label }) => {
              const active = value.closesIn === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...value, closesIn: key })}
                  className={[
                    'min-h-[32px] px-2.5 rounded-full border text-2xs font-semibold transition-colors focus:outline-none',
                    active
                      ? 'bg-accent-300/15 border-accent-400 text-accent-200'
                      : 'bg-surface-mid border-border-default text-ink-muted hover:text-ink-secondary',
                  ].join(' ')}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <p className="text-2xs text-ink-muted">질문과 보기 2개 이상을 채우면 게시할 때 투표가 함께 올라가요</p>
        </div>
      )}
    </div>
  );
}
