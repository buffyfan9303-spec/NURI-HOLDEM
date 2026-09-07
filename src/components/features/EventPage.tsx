// src/components/features/EventPage.tsx — 이벤트 전용 **별도 페이지**(오너 지시 2026-09-06:
// 게시판이나 다른 화면 안에 넣지 말고 그냥 독립 페이지로).
//
// 첫 이벤트 '오픈 기념 이벤트': **매장** 출석 QR 을 찍을 때마다 참여권 1장, 참여권 1장으로 카드 한 장을 골라 찢는다.
//
// ⚠ 이 화면은 **무엇이 들었는지 모른다.** 서버(event_board)가 안 연 카드의 등급을 아예 안 내려주기 때문이다.
//   그래서 여기에 확률 계산이나 미리보기 로직이 없다 — 있으면 그게 곧 유출이다.
//   열린 뒤에야 tier 가 채워져 오고, 그때 화면이 그 결과를 보여 준다.
//   최하단 확률 표의 숫자도 **서버가 준 실제 수량**으로만 만든다(상수로 적으면 어긋난 순간 허위 고지다).
//
// 그림은 전부 CSS·인라인 SVG 다. 외부 이미지를 쓰지 않는 이유가 둘 있다 —
// ① 스톡 이미지 미리보기는 라이선스가 없다(레퍼런스로만 참고했다) ② 네트워크 왕복 0 · 어느 해상도에서도 선명.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { cachedEventBoard,getEventBoard, openEventCard, oddsRows, TIER_META,
  type EventBoard, type EventCard, type OpenResult,
} from '../../api/events';

type Phase = 'idle' | 'confirm' | 'tearing' | 'result';

export default function EventPage({ open, onClose, onLogin }: {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  /* 홈 배너가 이미 받아 둔 보드로 **첫 프레임부터 내용을 그린다**.
     이게 없으면 열자마자 헤더만 뜬 빈 몸통이 15~80ms 보였다(실측 2026-09-08) — 그 한 번의
     교체가 남아 있던 마지막 깜빡임이었다. 씨앗이 없으면(첫 방문·로그인 직후) 종전대로 로딩부터. */
  const seed = useRef(cachedEventBoard()).current;
  const [board, setBoard] = useState<EventBoard | null>(seed);
  const [loading, setLoading] = useState(!seed);
  const [err, setErr] = useState<unknown>(null);
  const [pick, setPick] = useState<EventCard | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<OpenResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setErr(null);
    getEventBoard().then(setBoard).catch(setErr).finally(() => setLoading(false));
  }, []);
  // 열릴 때마다 새로 — 그 사이 다른 사람이 카드를 열었을 수 있다(내 화면만 옛 상태면 헛클릭이 된다)
  useEffect(() => { if (open) { setLoading(!cachedEventBoard()); load(); } }, [open, load]);

  /* 스켈레톤은 **느릴 때만** 보여준다.
     실측(2026-09-08): 보드 응답이 40~70ms 라 스켈레톤이 2~5프레임 떴다 사라졌다. 그 두세 프레임이
     '깜빡임'의 정체였다 — 높이 812의 회색 40칸이 1867의 컬러 100칸으로 바뀌니, 뇌는 '뭔가 스쳤다'로 읽는다.
     70ms 짜리 대기에 로딩 표시를 다는 것은 안내가 아니라 잡음이다. 느린 망에서는 그대로 뜬다. */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    const t = window.setTimeout(() => setSlow(true), 200);
    return () => window.clearTimeout(t);
  }, [loading]);

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
      tearTimer.current = window.setTimeout(() => setPhase('result'), 320); // --dur-panel 과 맞춤
      load(); // 참여권·남은 경품·다른 사람 개봉을 뒤에서 갱신
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '카드를 열지 못했어요', 'error');
      closeSheet();
      load(); // '이미 열린 카드' 였다면 내 보드가 낡은 것이다
    } finally { setBusy(false); }
  };

  if (!open) return null;

  const left = board ? board.cards.filter((c) => !c.opened).length : 0;
  const total = board?.cards.length ?? 0;
  const canPlay = !!user && (board?.myTickets ?? 0) > 0;

  return (
    /* ⚠ 진입 애니메이션을 **일부러 걸지 않는다**(2026-09-08 실측 후 되돌림).
       교차 검증이 "이벤트만 진입 전환이 0 — VenuePage 는 animate-slide-up, CustomerDashboardPage 는
       withViewTransition 으로 여는데 여기만 하드 컷"이라고 짚었고, 그 지적 자체는 맞다.
       그런데 걸어 보고 쟀더니 **더 나빠졌다**(375×812, 프로덕션 빌드, long-animation-frame):
           없음        긴 프레임 없음 ~ 51ms
           slide-up   134ms   (blur(3px)→0)
           fade-in    112~157ms (opacity 만)
       블러가 원인이 아니다 — 어느 쪽이든 **포일 카드 100장짜리 격자를 통째로 합성 레이어로 올려**
       한 프레임에 래스터화해야 한다(블로킹 0 = 스크립트가 아니라 페인트). 200ms 짜리 전환의 첫
       프레임이 150ms 면 그건 전환이 아니라 끊김이다. 하드 컷 쪽이 낫다.
       VenuePage 에 같은 클래스가 멀쩡한 건 거기 100장이 없어서다 — 같은 클래스라고 같은 비용이 아니다.
       ▶ 다시 넣고 싶다면: 격자를 content-visibility 로 잘라 첫 페인트 면적을 줄인 **뒤에** 재고,
         반드시 위 수치와 같은 자로 다시 재라. 재지 않고 넣으면 이 실측을 되돌리는 것이다. */
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-surface-base" role="dialog" aria-modal="true" aria-label="이벤트">
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

      {loading ? (slow && (
        <div className="px-page-x py-4" aria-busy="true">
          <div className="skeleton h-32 rounded-aura" />
          {/* 칸 수는 본문과 같은 100 — 40칸이면 스켈레톤이 본문보다 10줄 짧아서, 교체 순간 격자가
              통째로 늘어난다. 같은 격자가 색만 채워져야 '기다렸다'가 되지 '바뀌었다'가 안 된다. */}
          <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-12">
            {Array.from({ length: 100 }).map((_, i) => <div key={i} className="skeleton aspect-square rounded-input" />)}
          </div>
        </div>
      )) : err ? (
        <div className="px-page-x py-4"><LoadErrorCard error={err} what="이벤트" onRetry={() => { setLoading(true); load(); }} /></div>
      ) : !board ? (
        <div className="px-page-x py-16 text-center">
          <p className="text-sm text-ink-muted">진행 중인 이벤트가 없어요.</p>
        </div>
      ) : (
        <div className="px-page-x pb-24 pt-3">
          <Hero board={board} left={left} total={total} user={!!user} onLogin={onLogin} />

          {/* 카드판 — 정사각 작은 칸. 100장이 한 화면에 들어와야 '고른다'가 성립한다
              (세로로 긴 카드였을 땐 스크롤 없이 20장도 안 보였다 — 오너 2026-09-06). */}
          <div className="mt-4 grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-12">
            {board.cards.map((c) => (
              <CardTile key={c.idx} card={c} disabled={!canPlay}
                onPick={() => { setPick(c); setPhase('confirm'); }} />
            ))}
          </div>

          <Odds board={board} />
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

// ── 히어로 ────────────────────────────────────────────────────────────────────
// ⚠ 이 판의 주인공은 **카드판**이다. 히어로는 안내일 뿐인데 예전엔 844px 화면에서 460px 를 먹어
//   카드가 접혔다(오너 2026-09-06: "칸이 너무 커서 UI/UX 를 해친다"). 그래서 규칙을 셋 둔다:
//    ① 히어로는 화면의 1/4 을 넘기지 않는다 — 첫 화면에 카드가 보여야 '고른다'가 성립한다.
//    ② 같은 말을 두 번 하지 않는다(부제와 안내문이 둘 다 '출석하면 참여권 1장'이었다 — 안내문을 지웠다).
//    ③ CTA·안내는 **필요할 때만** 자리를 차지한다(로그인 전 / 참여권 0 / 소진).
//
// 아우라 규약(CLAUDE.md v6·v6.5) 위반 둘도 여기서 걷는다:
//    · ring-aura-glow 는 '화면당 최대 1곳, 주인공 면에만'이고 **모달·시트에는 금지**다.
//      이 페이지는 전면 시트다 — 글로우를 뺀다(주인공이 없는 화면은 0곳이 정답).
//    · 경품 칸의 **강한 색 테두리**도 v6 가 명시적으로 금지한다("네온·강한 테두리·큰 글로우 금지").
//      색은 점과 숫자에만 남기고 면은 공용 헤어라인으로 통일한다.
function Hero({ board, left, total, user, onLogin }: {
  board: EventBoard; left: number; total: number; user: boolean; onLogin: () => void;
}) {
  const done = total - left;
  const soldOut = left === 0;
  return (
    <section className="relative overflow-hidden rounded-aura border card-aura p-3">
      {/* 블룸 한 겹만 — 정적 radial(§20.4 #6). 두 겹이면 작은 카드에서 탁해진다. */}
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-accent-400/15 blur-2xl" />

      <div className="relative flex items-center gap-2.5">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input tile-grad">
          <Icon name="gift" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent-300">EVENT</p>
          <h2 className="truncate text-base font-bold leading-tight text-ink-primary">{board.title}</h2>
        </div>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-extrabold leading-none tabular-nums text-accent-200">{left}</span>
          <span className="block text-[10px] text-ink-muted">장 남음</span>
        </span>
      </div>

      {board.subtitle && (
        <p className="relative mt-2 truncate text-2xs text-ink-secondary" title={board.subtitle}>{board.subtitle}</p>
      )}

      {/* 진행 막대 — 자기완결 소형 진행바는 §20.4 예외로 width 전환이 허용된다 */}
      <div className="relative mt-2 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-high">
          <div className="h-full rounded-full bg-gradient-to-r from-accent-400 to-fuchsia-500 transition-[width] duration-[var(--dur-panel)]"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">{done}/{total} 개봉</span>
      </div>

      {/* 경품 — 색은 점과 숫자에만. 면은 공용 헤어라인으로(강한 색 테두리 금지 · v6). */}
      <div className="relative mt-2.5 grid grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((t) => {
          const m = TIER_META[t];
          const l = board.remainByTier?.[String(t)] ?? 0;
          const v = board.voucherByTier?.[String(t)] ?? 0;
          return (
            <div key={t} className="rounded-input border border-border-subtle bg-surface-high/60 px-2 py-1.5">
              <p className={['flex items-center gap-1 text-[10px] font-bold', m.text].join(' ')}>
                <span aria-hidden className={['h-1.5 w-1.5 shrink-0 rounded-full', m.dot].join(' ')} />
                {m.label}
              </p>
              <p className="mt-0.5 whitespace-nowrap text-base font-extrabold leading-none tabular-nums text-ink-primary">
                {l}<span className="ml-0.5 text-[10px] font-semibold text-ink-muted">장</span>
              </p>
              <p className="truncate text-[10px] leading-tight text-ink-muted">이용권 {v}장</p>
            </div>
          );
        })}
      </div>

      {/* 안내·CTA 는 **필요할 때만** 자리를 차지한다. 평소에는 카드판이 바로 이어진다. */}
      {soldOut ? (
        <p className="relative mt-2.5 flex items-start gap-1.5 rounded-input border border-border-default bg-surface-high px-2.5 py-1.5 text-2xs font-semibold leading-relaxed text-ink-secondary">
          <Icon name="check-circle" size={12} className="mt-px shrink-0 text-emerald-400" />
          <span>카드 {total}장이 모두 열렸어요 — 이벤트가 끝났습니다.</span>
        </p>
      ) : !user ? (
        <button type="button" onClick={onLogin} className="btn-primary relative mt-2.5 min-h-[42px] w-full text-sm">
          로그인하고 참여하기
        </button>
      ) : board.myTickets === 0 ? (
        <p className="relative mt-2.5 rounded-input border border-border-default bg-surface-high px-2.5 py-1.5 text-2xs leading-relaxed text-ink-secondary">
          참여권이 없어요 — 매장에서 <b className="text-ink-primary">출석 QR</b>을 찍으면 1장이 바로 쌓여요.
        </p>
      ) : null}
    </section>
  );
}

// ── 카드 뒷면 4종 ──────────────────────────────────────────────────────────────
// 같은 카드는 **언제나 같은 무늬**여야 한다(idx 로 고정). 매번 달라지면 '내가 찍어 둔 그 카드'를 못 찾는다.
const BACKS = [
  { hue: 'from-indigo-500/45 to-surface-float', ink: 'rgb(255 255 255 / 0.22)' },
  { hue: 'from-fuchsia-500/35 to-surface-float', ink: 'rgb(255 255 255 / 0.2)' },
  { hue: 'from-cyan-500/30 to-surface-float', ink: 'rgb(255 255 255 / 0.22)' },
  { hue: 'from-violet-600/45 to-surface-float', ink: 'rgb(255 255 255 / 0.2)' },
];
function BackArt({ v, ink }: { v: number; ink: string }) {
  const common = { fill: 'none', stroke: ink, strokeWidth: 1 } as const;
  return (
    <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="none">
      {v === 0 && <>{[6, 11, 16].map((r) => <circle key={r} cx="20" cy="20" r={r} {...common} />)}<circle cx="20" cy="20" r="2.5" fill={ink} /></>}
      {v === 1 && <>{[-16, -6, 4, 14, 24, 34].map((x) => <path key={x} d={`M${x} 44 L${x + 22} -4`} {...common} />)}</>}
      {v === 2 && <>{[10, 20, 30].map((c) => <g key={c}><path d={`M20 ${c - 9} L29 ${c} L20 ${c + 9} L11 ${c} Z`} {...common} /></g>)}</>}
      {v === 3 && <>{Array.from({ length: 8 }, (_, i) => <path key={i} d={`M20 20 L${20 + 26 * Math.cos((i * Math.PI) / 4)} ${20 + 26 * Math.sin((i * Math.PI) / 4)}`} {...common} />)}<circle cx="20" cy="20" r="7" {...common} /></>}
    </svg>
  );
}

function CardTile({ card, onPick, disabled }: { card: EventCard; onPick: () => void; disabled: boolean }) {
  if (card.opened) {
    const m = card.tier ? TIER_META[card.tier] : null;
    return (
      <div title={card.by ? `${card.by} 님이 열었어요` : undefined}
        className={['relative flex aspect-square flex-col items-center justify-center rounded-input border text-center',
          m ? [m.ring, m.bg].join(' ') : 'border-border-subtle bg-surface-low/50'].join(' ')}>
        {m ? (
          <>
            <span className={['text-xs font-extrabold leading-none', m.text].join(' ')}>{m.short}등</span>
            <span className="mt-0.5 text-[9px] font-semibold text-ink-muted">×{card.count}</span>
          </>
        ) : (
          <span className="text-[9px] font-semibold text-ink-muted/60">꽝</span>
        )}
      </div>
    );
  }
  const b = BACKS[card.idx % BACKS.length];
  return (
    <button type="button" onClick={onPick} disabled={disabled} aria-label={`${card.idx}번 카드 열기`}
      className={['foil group relative flex aspect-square items-center justify-center overflow-hidden rounded-input border border-white/10 bg-gradient-to-br transition-transform',
        b.hue, disabled ? 'opacity-50' : 'hover:-translate-y-0.5 active:scale-[0.96]'].join(' ')}>
      <BackArt v={card.idx % BACKS.length} ink={b.ink} />
      <span className="relative text-[10px] font-bold tabular-nums text-white/75">{card.idx}</span>
    </button>
  );
}

// ── 개봉 시트 ─────────────────────────────────────────────────────────────────
/** 찢은 조각이 흩어지는 파편. 방향은 고정값이라 매번 같게 보인다(랜덤은 '버그처럼' 읽힌다). */
const SHREDS = [
  { sx: '-90%', sy: '60%', sr: '-38deg', l: '18%', t: '30%', w: 12, h: 22 },
  { sx: '95%', sy: '52%', sr: '44deg', l: '62%', t: '22%', w: 10, h: 18 },
  { sx: '-70%', sy: '85%', sr: '22deg', l: '40%', t: '58%', w: 9, h: 14 },
  { sx: '80%', sy: '92%', sr: '-30deg', l: '52%', t: '66%', w: 11, h: 16 },
];

function TearSheet({ card, phase, result, busy, voucherTitle, onOpen, onClose }: {
  card: EventCard; phase: Phase; result: OpenResult | null; busy: boolean;
  voucherTitle: string; onOpen: () => void; onClose: () => void;
}) {
  const won = !!result && result.tier !== null;
  const m = result?.tier ? TIER_META[result.tier] : null;
  const b = BACKS[card.idx % BACKS.length];
  const face = (
    <>
      <BackArt v={card.idx % BACKS.length} ink={b.ink} />
      <span className="absolute inset-2.5 rounded-[10px] border border-white/12" />
      <span className="absolute inset-x-0 top-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">NURI</span>
      <span className="absolute inset-0 flex items-center justify-center text-3xl font-extrabold tabular-nums text-white/85">{card.idx}</span>
    </>
  );
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-5"
      onClick={phase === 'result' ? onClose : undefined}>
      <div className="w-full max-w-[17rem]" onClick={(e) => e.stopPropagation()}>
        <div className="relative mx-auto aspect-[4/5] w-44">
          {/* 결과(뒤에 깔린다) */}
          {phase !== 'confirm' && (
            <>
              {won && phase === 'result' && (
                <span aria-hidden className={['anim-burst absolute inset-0 rounded-full blur-xl', m?.dot ?? 'bg-accent-300'].join(' ')} />
              )}
              <div className={['absolute inset-0 flex flex-col items-center justify-center rounded-card border text-center',
                won && m ? [m.ring, m.bg, 'bg-surface-high', m.glow].join(' ') : 'border-border-default bg-surface-high',
                phase === 'result' ? 'anim-prize' : 'opacity-0'].join(' ')}>
                {won && m ? (
                  <>
                    <span className={['anim-prize-pop text-4xl font-extrabold leading-none', m.text].join(' ')}>{m.label}</span>
                    <span className="mt-2 px-3 text-xs font-bold text-ink-primary break-keep">{voucherTitle}</span>
                    <span className={['mt-1 text-3xl font-extrabold leading-none tabular-nums', m.text].join(' ')}>{result!.voucherCount}<span className="ml-0.5 text-sm">장</span></span>
                    <span className="mt-2 flex items-center gap-1 text-2xs text-ink-muted"><Icon name="check-circle" size={11} className="shrink-0" />지갑에 바로 들어갔어요</span>
                  </>
                ) : (
                  <>
                    <span className="text-3xl font-bold text-ink-muted/80">꽝</span>
                    <span className="mt-2 px-4 text-2xs leading-relaxed text-ink-muted">아쉬워요. 다음 출석에 참여권이 또 쌓여요</span>
                  </>
                )}
              </div>
            </>
          )}

          {/* 카드 뒷면.
              ⚠ 쉬는 동안에는 **한 장**으로 그린다. 두 조각을 미리 겹쳐 두면 각 조각의 테두리가 겹치는 선이
                 그대로 보여, 아직 찢지도 않은 카드에 사선 이음매가 나타난다(시안 캡처에서 확인). */}
          {phase === 'confirm' && (
            <div aria-hidden className={['foil absolute inset-0 overflow-hidden rounded-card border border-white/15 bg-gradient-to-br', b.hue, busy ? 'anim-strain' : ''].join(' ')}>
              {face}
            </div>
          )}
          {phase === 'tearing' && (
            <>
              {['tear-l', 'tear-r'].map((side, i) => (
                <div key={side} aria-hidden
                  className={['absolute inset-0 overflow-hidden rounded-card border border-white/15 bg-gradient-to-br',
                    b.hue, side, i === 0 ? 'anim-tear-l' : 'anim-tear-r'].join(' ')}>
                  {face}
                </div>
              ))}
              {SHREDS.map((sh, i) => (
                <span key={i} aria-hidden className="anim-shred absolute rounded-[2px] bg-white/25"
                  style={{ left: sh.l, top: sh.t, width: sh.w, height: sh.h,
                    ['--sx' as string]: sh.sx, ['--sy' as string]: sh.sy, ['--sr' as string]: sh.sr }} />
              ))}
            </>
          )}
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

// ── 확률 공개(최하단) ─────────────────────────────────────────────────────────
// 오너 지시: "확률공개는 필수". 숫자는 전부 서버가 준 실제 수량에서 계산한다 —
// 여기에 상수를 적어 두면 캠페인을 바꾼 순간 화면이 거짓말을 한다.
function Odds({ board }: { board: EventBoard }) {
  const rows = useMemo(() => oddsRows(board), [board]);
  const win = rows.filter((r) => r.key !== 'none').reduce((a, r) => a + r.total, 0);
  const pct = board.cards.length ? ((win / board.cards.length) * 100).toFixed(2) : '0.00';
  return (
    <section className="mt-6 rounded-aura border card-aura p-3.5">
      <div className="flex items-center gap-2 border-b border-border-subtle pb-2">
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-input bg-surface-high text-ink-secondary">
          <Icon name="info" size={13} />
        </span>
        <h3 className="text-sm font-bold text-ink-primary">당첨 확률 공개</h3>
        <span className="ml-auto text-2xs font-semibold tabular-nums text-accent-200">전체 당첨 {pct}%</span>
      </div>
      <p className="mt-2 text-2xs text-ink-secondary break-keep">경품은 <b className="text-ink-primary">{board.voucherTitle}</b> 입니다.</p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-2xs">
          <thead>
            <tr className="text-ink-muted">
              <th scope="col" className="py-1 pr-2 text-left font-normal">등급</th>
              <th scope="col" className="py-1 pr-2 text-left font-normal">경품</th>
              <th scope="col" className="py-1 pr-2 text-right font-normal">수량</th>
              <th scope="col" className="py-1 pr-2 text-right font-normal">확률</th>
              <th scope="col" className="py-1 text-right font-normal">남음</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((r) => {
              const m = r.key === 'none' ? null : TIER_META[Number(r.key)];
              return (
                <tr key={r.key}>
                  <td className="py-1.5 pr-2">
                    <span className={['inline-flex items-center gap-1 font-bold', m?.text ?? 'text-ink-muted'].join(' ')}>
                      {m && <span aria-hidden className={['h-1.5 w-1.5 rounded-full', m.dot].join(' ')} />}
                      {r.label}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-ink-secondary break-keep">{r.prize}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-ink-secondary">{r.total}장</td>
                  <td className="py-1.5 pr-2 text-right font-bold tabular-nums text-ink-primary">{r.pct}%</td>
                  <td className="py-1.5 text-right tabular-nums text-ink-muted">{r.left}장</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="mt-2.5 space-y-1 text-[10px] leading-relaxed text-ink-muted">
        <li>· 확률은 전체 {board.cards.length}장 기준이며, 등급별 수량은 이벤트 시작 시 <b className="text-ink-secondary">고정</b>되어 이후 추가·변경되지 않습니다.</li>
        <li>· 각 카드의 등급은 시작 전에 무작위로 배치되어 서버에 저장됩니다. 카드를 여는 시점에 다시 뽑지 않습니다.</li>
        <li>· 참여권은 매장 출석 QR 1회당 1장 지급되며, 별도의 구매나 비용이 필요하지 않습니다.</li>
        <li>· 당첨 이용권은 개봉 즉시 지갑으로 지급됩니다. 남은 수량은 실시간으로 반영됩니다.</li>
      </ul>
    </section>
  );
}
