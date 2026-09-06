// src/components/features/EventPage.tsx — 이벤트 전용 **별도 페이지**(오너 지시 2026-09-06:
// 게시판이나 다른 화면 안에 넣지 말고 그냥 독립 페이지로).
//
// 첫 이벤트 '카드 오픈': 출석 QR 을 찍을 때마다 참여권 1장, 참여권 1장으로 100장 중 하나를 골라 찢는다.
//
// ⚠ 이 화면은 **무엇이 들었는지 모른다.** 서버(event_board)가 안 연 카드의 등급을 아예 안 내려주기 때문이다.
//   그래서 여기에 확률 계산이나 미리보기 로직이 없다 — 있으면 그게 곧 유출이다.
//   열린 뒤에야 tier 가 채워져 오고, 그때 화면이 그 결과를 보여 준다.
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { getEventBoard, openEventCard, TIER_META, type EventBoard, type EventCard, type OpenResult } from '../../api/events';

type Phase = 'idle' | 'confirm' | 'tearing' | 'result';

export default function EventPage({ open, onClose, onLogin }: {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [board, setBoard] = useState<EventBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<unknown>(null);
  const [pick, setPick] = useState<EventCard | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<OpenResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setErr(null);
    getEventBoard()
      .then((b) => setBoard(b))
      .catch((e) => setErr(e))
      .finally(() => setLoading(false));
  }, []);
  // 열릴 때마다 새로 — 다른 사람이 그 사이 카드를 열었을 수 있다(내 화면만 옛 상태면 헛클릭이 된다)
  useEffect(() => { if (open) { setLoading(true); load(); } }, [open, load]);

  // 결과 시트가 떠 있는 동안 뒤 스크롤 잠금은 하지 않는다 — 이 페이지 자체가 이미 전면이다.
  const tearTimer = useRef(0);
  useEffect(() => () => { if (tearTimer.current) window.clearTimeout(tearTimer.current); }, []);

  const closeSheet = () => { setPick(null); setPhase('idle'); setResult(null); };

  const doOpen = async () => {
    if (!pick || busy) return;
    setBusy(true);
    try {
      // ⚠ 서버 응답을 받은 **뒤에** 찢는다. 먼저 찢어 놓고 실패하면 '열렸다가 되돌아오는' 화면이 되는데,
      //   그건 당첨을 뺏긴 것처럼 보인다. 실패는 카드가 닫힌 채로 끝나야 한다.
      const r = await openEventCard(pick.idx);
      setResult(r);
      setPhase('tearing');
      tearTimer.current = window.setTimeout(() => setPhase('result'), 340); // --dur-panel 과 맞춤
      // 보드 갱신은 결과를 보여 주는 동안 뒤에서(참여권 수·남은 경품·다른 사람 개봉 반영)
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '카드를 열지 못했어요', 'error');
      closeSheet();
      load(); // '이미 열린 카드' 였다면 보드가 낡은 것이다 — 새로 받아 온다
    } finally { setBusy(false); }
  };

  if (!open) return null;

  const remain = board?.remainByTier ?? {};
  const openedCount = board?.cards.filter((c) => c.opened).length ?? 0;
  const total = board?.cards.length ?? 0;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-surface-base" role="dialog" aria-modal="true" aria-label="이벤트">
      {/* 헤더 — 뒤로 · 제목 · 내 참여권 */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-subtle bg-surface-base/95 px-page-x py-2.5 backdrop-blur">
        <button type="button" onClick={onClose} aria-label="닫기"
          className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-input text-ink-secondary transition-colors hover:bg-surface-high">
          <Icon name="chevron-left" size={20} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold text-ink-primary">{board?.title ?? '이벤트'}</h1>
        {user && board && (
          <span className="flex shrink-0 items-center gap-1 rounded-chip border border-accent-400/40 bg-accent-300/10 px-2.5 py-1 text-2xs font-bold text-accent-200">
            <Icon name="ticket" size={12} className="shrink-0" />
            참여권 <span className="tabular-nums">{board.myTickets}</span>
          </span>
        )}
      </header>

      {loading ? (
        <div className="px-page-x py-4" aria-busy="true">
          <div className="skeleton h-28 rounded-aura" />
          <div className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {Array.from({ length: 30 }).map((_, i) => <div key={i} className="skeleton aspect-[3/4] rounded-input" />)}
          </div>
        </div>
      ) : err ? (
        <div className="px-page-x py-4"><LoadErrorCard error={err} what="이벤트" onRetry={() => { setLoading(true); load(); }} /></div>
      ) : !board ? (
        <div className="px-page-x py-16 text-center">
          <p className="text-sm text-ink-muted">진행 중인 이벤트가 없어요.</p>
        </div>
      ) : (
        <div className="px-page-x pb-24 pt-3">
          {/* 히어로 — 이 화면의 주인공. 글로우는 여기 한 곳만(§v6.5 화면당 1곳) */}
          <section className="ring-aura-glow relative overflow-hidden rounded-aura border card-aura p-4">
            <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-accent-400/20 blur-2xl" />
            <p className="text-2xs font-bold uppercase tracking-wider text-accent-300">EVENT</p>
            <h2 className="mt-1 text-xl font-bold leading-tight text-ink-primary break-keep">{board.title}</h2>
            {board.subtitle && <p className="mt-1 text-xs leading-relaxed text-ink-secondary break-keep">{board.subtitle}</p>}

            {/* 남은 경품 — 총량은 공개하고 자리는 감춘다(사전 고지) */}
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map((t) => {
                const m = TIER_META[t];
                const left = remain[String(t)] ?? 0;
                return (
                  <div key={t} className={['rounded-input border bg-surface-high/60 px-2 py-1.5', m.ring].join(' ')}>
                    <p className={['text-2xs font-bold', m.text].join(' ')}>{m.label}</p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-ink-primary">
                      {left}<span className="ml-0.5 text-2xs font-semibold text-ink-muted">장 남음</span>
                    </p>
                    <p className="text-[10px] text-ink-muted">이용권 {PRIZE_VOUCHERS[t]}장</p>
                  </div>
                );
              })}
            </div>

            <p className="mt-2.5 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-muted">
              <Icon name="info" size={12} className="mt-px shrink-0" />
              <span>
                매장 <b className="text-ink-secondary">출석 QR</b>을 찍을 때마다 참여권 1장을 드려요.
                참여권 1장으로 카드 한 장을 골라 찢을 수 있어요. 총 {total}장 중 <b className="text-ink-secondary">{openedCount}장</b>이 열렸어요.
              </span>
            </p>

            {!user && (
              <button type="button" onClick={onLogin} className="btn-primary mt-3 min-h-[44px] w-full text-sm">
                로그인하고 참여하기
              </button>
            )}
            {user && board.myTickets === 0 && (
              <p className="mt-3 rounded-input border border-border-default bg-surface-high px-3 py-2 text-2xs text-ink-secondary">
                참여권이 없어요 — 매장에서 <b className="text-ink-primary">출석 QR</b>을 찍으면 1장이 바로 쌓여요.
              </p>
            )}
          </section>

          {/* 카드판 */}
          <div className="mt-4 grid grid-cols-5 gap-1.5 sm:grid-cols-8 lg:grid-cols-10">
            {board.cards.map((c) => <CardTile key={c.idx} card={c} onPick={() => { setPick(c); setPhase('confirm'); }} disabled={!user || board.myTickets === 0} />)}
          </div>
        </div>
      )}

      {pick && (
        <TearSheet card={pick} phase={phase} result={result} busy={busy}
          voucherTitle={board?.voucherTitle ?? '매장이용권'}
          onOpen={doOpen} onClose={closeSheet} />
      )}
    </div>
  );
}

/** 카드 뒷면 무늬 — 한 장일 때와 두 조각일 때가 **같은 그림**이어야 찢어진 것으로 읽힌다. */
function CardFace({ idx }: { idx: number }) {
  return (
    <>
      <span className="absolute inset-2 rounded-[9px] border border-white/12" />
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_22%,rgb(255_255_255/0.16),transparent_62%)]" />
      <span className="absolute inset-0 flex items-center justify-center text-3xl font-extrabold tabular-nums text-white/85">{idx}</span>
    </>
  );
}

/** 등급별 이용권 장수 — 서버 seed 와 같은 값(고지용). 서버가 정본이고 여기는 **표시**만 한다. */
const PRIZE_VOUCHERS: Record<number, number> = { 1: 10, 2: 5, 3: 2, 4: 1 };

function CardTile({ card, onPick, disabled }: { card: EventCard; onPick: () => void; disabled: boolean }) {
  if (card.opened) {
    const m = card.tier ? TIER_META[card.tier] : null;
    return (
      <div className={['relative flex aspect-[3/4] flex-col items-center justify-center rounded-input border text-center',
        m ? [m.ring, 'bg-surface-high'].join(' ') : 'border-border-subtle bg-surface-low/60'].join(' ')}
        title={card.by ? `${card.by} 님이 열었어요` : undefined}>
        {m ? (
          <>
            <span className={['text-sm font-extrabold leading-none', m.text].join(' ')}>{m.short}등</span>
            <span className="mt-0.5 text-[10px] font-semibold text-ink-muted">×{card.count}</span>
          </>
        ) : (
          <span className="text-[10px] font-semibold text-ink-muted/70">꽝</span>
        )}
        <span className="absolute left-1 top-0.5 text-[9px] tabular-nums text-ink-muted/50">{card.idx}</span>
      </div>
    );
  }
  return (
    <button type="button" onClick={onPick} disabled={disabled}
      aria-label={`${card.idx}번 카드 열기`}
      className={['group relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-input border border-accent-400/30 bg-gradient-to-br from-accent-500/25 to-surface-high transition-transform',
        disabled ? 'opacity-55' : 'hover:-translate-y-0.5 active:scale-[0.97]'].join(' ')}>
      {/* 카드 뒷면 무늬 — 정적 그라데이션 한 겹(애니 0) */}
      <span aria-hidden className="absolute inset-1 rounded-[5px] border border-white/10" />
      <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgb(255_255_255/0.14),transparent_60%)]" />
      <span className="relative text-[11px] font-bold tabular-nums text-white/80">{card.idx}</span>
    </button>
  );
}

/** 카드 확대 → 찢기 → 결과. 한 시트가 세 상태를 순서대로 보여 준다(화면을 갈아끼우지 않는다). */
function TearSheet({ card, phase, result, busy, voucherTitle, onOpen, onClose }: {
  card: EventCard; phase: Phase; result: OpenResult | null; busy: boolean;
  voucherTitle: string; onOpen: () => void; onClose: () => void;
}) {
  const won = !!result && result.tier !== null;
  const m = result?.tier ? TIER_META[result.tier] : null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-5" onClick={phase === 'result' ? onClose : undefined}>
      <div className="w-full max-w-[19rem]" onClick={(e) => e.stopPropagation()}>
        {/* 카드 무대 — 뒷면 두 조각이 서로 반대로 밀려나며 아래의 결과가 드러난다 */}
        <div className="relative mx-auto aspect-[3/4] w-52">
          {/* 결과(뒤에 깔린다) */}
          {phase !== 'confirm' && (
            <div className={['absolute inset-0 flex flex-col items-center justify-center rounded-card border text-center',
              won && m ? [m.ring, 'bg-surface-high', m.glow].join(' ') : 'border-border-default bg-surface-high',
              phase === 'result' ? 'anim-prize' : 'opacity-0'].join(' ')}>
              {won && m ? (
                <>
                  <span className={['text-4xl font-extrabold leading-none', m.text].join(' ')}>{m.label}</span>
                  <span className="mt-2 text-sm font-bold text-ink-primary">{voucherTitle}</span>
                  <span className={['mt-0.5 text-2xl font-extrabold tabular-nums', m.text].join(' ')}>{result!.voucherCount}장</span>
                  <span className="mt-1.5 text-2xs text-ink-muted">지갑에 바로 들어갔어요</span>
                </>
              ) : (
                <>
                  <span className="text-2xl font-bold text-ink-muted">꽝</span>
                  <span className="mt-1.5 text-2xs text-ink-muted">다음 출석에 참여권이 또 쌓여요</span>
                </>
              )}
            </div>
          )}
          {/* 카드 뒷면.
              ⚠ 쉬는 동안에는 **한 장**으로 그린다. 두 조각을 미리 겹쳐 두면 각 조각의 테두리가 겹치는 선이
                 그대로 보여, 아직 찢지도 않은 카드에 사선 이음매가 나타난다(시안 캡처에서 확인).
                 조각으로 갈라지는 건 정확히 '찢는 순간'뿐이다. */}
          {phase === 'confirm' && (
            <div aria-hidden className={['absolute inset-0 overflow-hidden rounded-card border border-accent-400/40 bg-gradient-to-br from-accent-500/40 to-surface-float', busy ? 'anim-strain' : ''].join(' ')}>
              <CardFace idx={card.idx} />
            </div>
          )}
          {phase === 'tearing' && ['tear-l', 'tear-r'].map((side, i) => (
            <div key={side} aria-hidden
              className={['absolute inset-0 overflow-hidden rounded-card border border-accent-400/40 bg-gradient-to-br from-accent-500/40 to-surface-float',
                side, i === 0 ? 'anim-tear-l' : 'anim-tear-r'].join(' ')}>
              <CardFace idx={card.idx} />
            </div>
          ))}
        </div>

        {phase === 'confirm' && (
          <div className="mt-4 text-center">
            <p className="text-sm font-bold text-ink-primary">{card.idx}번 카드를 열까요?</p>
            <p className="mt-1 text-2xs text-ink-muted">참여권 1장을 사용해요. 한 번 연 카드는 되돌릴 수 없어요.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={onClose} className="btn-ghost min-h-[44px] text-sm">다른 카드</button>
              <button type="button" onClick={onOpen} disabled={busy} className="btn-primary min-h-[44px] text-sm disabled:opacity-60">
                {busy ? '여는 중…' : '찢기'}
              </button>
            </div>
          </div>
        )}
        {phase === 'result' && (
          <button type="button" onClick={onClose} className="btn-primary mt-4 min-h-[44px] w-full text-sm">확인</button>
        )}
      </div>
    </div>
  );
}
