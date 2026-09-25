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
import { useIdentityEnabled } from '../../lib/identityFlag'; // 본인인증·매장이용권 통합 킬스위치(2026-08-29) — 새 판정을 만들지 않고 재사용
import { ensureVerified } from '../../lib/requireLogin'; // 본인인증 안내 시트(VerifyGateSheet)를 여는 기존 진입점 재사용
import { useDialogFocus } from '../atoms/useDialogFocus'; // U06 공유 포커스 트랩(VenuePage·EventListPage 와 같은 계약)
import { cachedEventBoard,getEventBoard, lastEventCardCount, openEventCard, oddsRows, TIER_META,
  type EventBoard, type EventCard, type OpenResult,
} from '../../api/events';
/* 참여 가능 여부는 **여기서 다시 판단하지 않는다** — 홈·관리자와 같은 단일 판정 함수를 부른다.
   ⚠ `adminEvents` 가 아니라 `lib/eventState` 를 직접 import 한다(손님 화면이 관리자 RPC 를 끌고 오지 않게).
   ⚠ 이 화면은 lazy 청크라 첫 화면 임계 경로가 늘지 않는다(홈은 같은 모듈을 동적 import 해 청크를 공유한다). */
import { evaluateEvent, eventNow, type EventAvailability } from '../../lib/eventState';

type Phase = 'idle' | 'confirm' | 'tearing' | 'result';

/** 보드 → 판정 함수 입력. **홈(HomeTab)과 같은 매핑을 쓴다** — `EventBoard` 에는
 *  `remainCards`/`totalCards` 가 없어서, 여기서 따로 만들면 홈과 상세가 다른 답을 낸다.
 *  ⚠ `b.cards` 가 배열이 아닐 수 있다 — `getEventBoard` 는 RPC 응답을 검증 없이 `EventBoard` 로 단언한다. */
const remainCardsOf = (b: EventBoard): number | null =>
  (Array.isArray(b.cards) ? b.cards.filter((c) => !c.opened).length : null);
const totalCardsOf = (b: EventBoard): number | null => (Array.isArray(b.cards) ? b.cards.length : null);

export default function EventPage({ open, onClose, onLogin, slug = null, onSlug }: {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
  /** 캠페인 slug. 딥링크(`?event=<slug>`)로 다른 캠페인이 올 수 있다 — 조회·씨앗이 이 값을 탄다.
   *  ⚠ `null` = **지금 열려 있는 캠페인**(api/events 의 getCurrentEventSlug 가 고른다). 고정 slug 를
   *    기본값으로 두면 캠페인이 바뀌는 순간 "진행 중인 이벤트가 없어요" 가 된다(2026-09-15 실사고).
   *  ⚠ 카드 열기는 여기 값이 아니라 **서버가 돌려준 `board.slug`** 로 한다 — 보고 있는 판과 여는 판이 갈라지지 않게. */
  slug?: string | null;
  /** 고른 캠페인을 셸에 알린다 — `?event=<slug>` 주소가 **실제로 연 판**을 가리키게 하려고.
   *  slug 없이 열린 경우(홈 칸·PC GNB·`?event=1`)에만 한 번 불린다. */
  onSlug?: (slug: string) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const idOn = useIdentityEnabled(); // 킬스위치 — 오너 지시(2026-09-14): 새 판정 로직을 만들지 않고 이 훅을 그대로 쓴다
  /* 홈 배너가 이미 받아 둔 보드로 **첫 프레임부터 내용을 그린다**.
     이게 없으면 열자마자 헤더만 뜬 빈 몸통이 15~80ms 보였다(실측 2026-09-08) — 그 한 번의
     교체가 남아 있던 마지막 깜빡임이었다. 씨앗이 없으면(첫 방문·로그인 직후) 종전대로 로딩부터. */
  const seed = useRef(cachedEventBoard(slug ?? undefined)).current;
  /** 로딩 격자의 칸 수 — 씨앗이 있으면 그 판의 실제 장수, 없으면 지난번에 받은 보드의 장수(CLS: 아래 격자 주석). */
  const skeletonCards = useRef(
    (Array.isArray(seed?.cards) && seed.cards.length) || lastEventCardCount(),
  ).current;
  const [board, setBoard] = useState<EventBoard | null>(seed);
  const [loading, setLoading] = useState(!seed);
  const [err, setErr] = useState<unknown>(null);
  const [pick, setPick] = useState<EventCard | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<OpenResult | null>(null);
  const [busy, setBusy] = useState(false);

  /* ⚠ ref 로 받는다 — `onSlug` 를 `load` 의 deps 에 넣으면 인라인 화살표를 넘긴 호출부에서
     매 렌더마다 `load` 가 새로 만들어지고, 아래 이펙트가 그때마다 다시 조회한다(무한 요청). */
  const onSlugRef = useRef(onSlug);
  useEffect(() => { onSlugRef.current = onSlug; });

  const load = useCallback(() => {
    setErr(null);
    getEventBoard(slug ?? undefined).then((b) => {
      setBoard(b);
      // slug 없이 열렸으면 **고른 결과**를 셸에 돌려준다(주소·공유·새로고침이 같은 판을 가리키게).
      if (b && slug == null) onSlugRef.current?.(b.slug);
    }).catch(setErr).finally(() => setLoading(false));
  }, [slug]);
  // 열릴 때마다 새로 — 그 사이 다른 사람이 카드를 열었을 수 있다(내 화면만 옛 상태면 헛클릭이 된다)
  useEffect(() => { if (open) { setLoading(!cachedEventBoard(slug ?? undefined)); load(); } }, [open, load, slug]);

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

  // U06(2026-09-12) 공유 계약 — 이 화면도 Modal 을 쓰지 않는 풀스크린 dialog 오버레이라(VenuePage·GroupPage·
  // EventListPage 와 같은 부류) 같은 포커스 트랩·복원을 쓴다. 새 로직을 만들지 않는다.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef);

  const closeSheet = () => { setPick(null); setPhase('idle'); setResult(null); };

  const doOpen = async () => {
    if (!pick || !board || busy) return;
    setBusy(true);
    try {
      // ⚠ 서버 응답을 받은 **뒤에** 찢는다. 먼저 찢어 놓고 실패하면 '열렸다가 되돌아오는' 화면이 되는데,
      //   그건 당첨을 뺏긴 것처럼 보인다. 실패는 카드가 닫힌 채로 끝나야 한다.
      // ⚠ prop 의 slug 가 아니라 **지금 보고 있는 보드의 slug**. 둘이 갈라지면 다른 판의 카드를 연다.
      const r = await openEventCard(pick.idx, board.slug);
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

  // MOTION-UNIFY P3 — 닫혀도 App 이 220ms 더 붙들어 둔다(useDelayedUnmount). 닫힐 때만 fade-out(진입은 위 실측대로 없음).

  const left = board ? remainCardsOf(board) ?? 0 : 0;
  const total = board ? totalCardsOf(board) ?? 0 : 0;
  /* ⚠ 참여 가능 여부는 **참여권만 보는 값이 아니다.** 예전엔 `!!user && myTickets > 0` 뿐이라
     종료·기간 만료 캠페인에서도 미개봉 카드 타일이 활성으로 떴고, 눌러 '찢기' 까지 간 뒤에야
     서버가 '이벤트 기간이 아닙니다' 로 거절했다(= 눌러 보고 RPC 오류로 설명하기). 게다가 그 상태에선
     Hero 3분기(소진/비로그인/참여권0)가 모두 빠져 **아무 안내도 없었다.**
     이제 상태·기간·소진·보는 사람 조건을 단일 판정 함수 하나가 가른다. */
  const av = evaluateEvent(
    board && {
      status: board.status,
      startsAt: board.startsAt,
      endsAt: board.endsAt,
      totalCards: totalCardsOf(board),
      remainCards: remainCardsOf(board),
    },
    eventNow(),
    { signedIn: !!user, tickets: board?.myTickets },
  );
  const canPlay = av.canJoin;

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
    /* ⚠ 이 자리는 `return (` 바로 뒤 = **식(expression) 자리** 라
       {/∗ … ∗/} 형태가 올 수 없다(빈 객체 리터럴로 읽힌 뒤 <div 에서 파서가 무너진다).
       2026-09-17 에 이 부류로 배포를 한 번 깨뜨렸다 — 위 주석처럼 **JS 블록 주석**을 쓴다.
       z-[55] — **z-[60] 이면 안 된다.** Modal.tsx 가 정해 둔 층이다: z-[60] 은 시트·모달, z-[55] 는 전체화면 page 변형.
        z-[60] 으로 두면 이 오버레이와 안내 시트가 **같은 층**이 되어 DOM 순서로 이 판이 이기고,
        배너의 '프로필에서 본인인증하기' 를 눌러도 시트가 뒤에 그려져 **아무 일도 안 나는 것처럼 보인다**
        (그다음 뒤로가기 한 번은 보이지 않는 시트를 닫느라 먹힌다). 2026-09-17 스윕에서 확인. */
    <div ref={dialogRef} inert={!open || undefined}
      className={['fixed inset-0 z-[55] overflow-y-auto bg-surface-base', open ? '' : 'animate-fade-out pointer-events-none'].join(' ')}
      role="dialog" aria-modal="true" aria-label="이벤트">
      {/* 🔴 2026-09-18 오너: "PC 버젼에서 모든 탭이 제대로 잘 움직이다가 이벤트만 가면 갑자기
          전체화면으로 바뀌면서 지혼자서 이상하게 돼 이 부분도 수정 다른 탭들처럼".
          원인: 이 화면은 탭 pane 이 아니라 `fixed inset-0` 오버레이인데(App.tsx 의 'event' 는 pane 이 없다)
          안에 폭 제한이 하나도 없어 1440px 에서 **혼자만 풀블리드**로 펼쳐졌다.
          다른 탭은 전부 App.tsx:3450 의 셸(`mx-auto w-full max-w-6xl xl:border-x`) 안에서 그려진다.
          → 오버레이 **본문에 같은 셸**을 씌운다. 오버레이 자체는 inset-0 그대로 둔다 —
            배경이 화면을 덮어야 뒤 탭이 비쳐 보이지 않고, 뒤로가기 계약(useBackClose)도 그대로다.
          ⚠ `min-h-full` 이 필요하다. 없으면 xl 의 세로 테두리가 내용 높이에서 끊겨 셸이 반만 그려진다. */}
      <div className="mx-auto w-full max-w-6xl xl:min-h-full xl:border-x xl:border-border-subtle">
      {/* 상단 안전영역 — 이 오버레이는 `fixed inset-0` 이고 index.html 의 viewport 가 `viewport-fit=cover` 라
          노치 아이폰·설치형(PWA, status-bar-style=black-translucent)에서 **내용이 상태바 밑으로 들어간다.**
          실측(2026-09-15, 강제 inset top=47 로 만든 사본): 닫기 버튼이 11~53 에 그대로 있어 47px 아래
          6px 만 손가락에 닿았다 — 이 화면의 유일한 탈출구다. pt 에 얹어 헤더 자체를 내린다
          (루트 스크롤러에 얹으면 `sticky top-0` 이 스크롤포트 top=0 에 붙어 다시 상태바로 들어간다).
          py-2.5 를 pt/pb 로 가른 이유: 같은 속성을 두 클래스가 쓰면 캐스케이드 순서에 결과가 달린다. */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-subtle bg-surface-base/95 px-page-x pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] backdrop-blur">
        {/* hit: 시각 40px 그대로, 손가락 영역만 44px(TOUCH-01 — 유저 모바일 99% 화면) */}
        <button type="button" onClick={onClose} aria-label="닫기"
          className="hit -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-input text-ink-secondary transition-colors hover:bg-surface-high">
          <Icon name="chevron-left" size={20} />
        </button>
        <h1 className="min-w-0 flex-1 line-clamp-2 break-keep text-base font-bold leading-tight text-ink-primary">{board?.title ?? '이벤트'}</h1>
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
          {/* 칸 수는 **본문과 같아야** 한다 — 다르면 교체 순간 격자가 통째로 늘었다 줄었다 한다.
              같은 격자가 색만 채워져야 '기다렸다'가 되지 '바뀌었다'가 안 된다.
              ⚠ 100 고정이던 시절의 수는 캠페인이 '오픈 기념'(100장) 하나뿐일 때 맞았다. 지금은 캠페인마다
                장수가 다르다(운영 중인 로티아레나 30장) — 지난번에 받은 보드의 칸 수를 쓴다(api/events). */}
          <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-12">
            {Array.from({ length: skeletonCards }).map((_, i) => <div key={i} className="skeleton aspect-square rounded-input" />)}
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
          <Hero board={board} left={left} total={total} user={!!user} onLogin={onLogin} av={av} />

          {/* 본인인증/킬스위치 사전 안내(오너 지시 2026-09-14) — 카드를 열기 전에 미리 알린다.
              카드 자체는 막지 않는다(canPlay 는 그대로 av.canJoin 만 본다) — 서버가 참여권 소모 전에
              이미 정확히 막고 있어서, 여기서 또 막으면 나중에 서버 규칙이 바뀔 때 화면이 거짓말을 한다. */}
          <EventVerifyNotice idOn={idOn} live={av.state === 'live'} loggedIn={!!user} verified={!!user?.verified} />

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
function Hero({ board, left, total, user, onLogin, av }: {
  board: EventBoard; left: number; total: number; user: boolean; onLogin: () => void;
  /** 단일 판정 결과 — 히어로의 안내·CTA 는 **이 값 하나로만** 갈린다(여기서 날짜를 다시 비교하지 않는다). */
  av: EventAvailability;
}) {
  const done = total - left;
  // 카드 0장짜리 판도 '소진' 문구 쪽으로 보낸다 — 판정 함수는 total>0 일 때만 soldout 을 낸다.
  const soldOut = av.state === 'soldout' || total === 0;
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
          <h2 className="line-clamp-2 break-keep text-base font-bold leading-tight text-ink-primary">{board.title}</h2>
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
              <p className="truncate text-[10px] leading-tight text-ink-muted">이용권 {v}T</p>
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
      ) : av.canJoin ? null : av.state === 'live' && !user ? (
        /* ⚠ 이 이름은 `e2e/event-entry.spec.ts:86` 이 getByRole('button', { name: … }) 로 잡는다.
           blockedReason('로그인 후 참여할 수 있습니다')으로 갈아끼우지 않는다 — 같은 뜻이지만 다른 글자다.
           그래도 셀렉터가 글자에 매달리지 않게 data-testid 를 함께 단다. */
        <button type="button" data-testid="event-login-cta" onClick={onLogin}
          className="btn-primary relative mt-2.5 min-h-[42px] w-full text-sm">
          로그인하고 참여하기
        </button>
      ) : av.state === 'live' ? (
        <p data-testid="event-no-ticket" className="relative mt-2.5 rounded-input border border-border-default bg-surface-high px-2.5 py-1.5 text-2xs leading-relaxed text-ink-secondary">
          참여권이 없어요 — 매장에서 <b className="text-ink-primary">출석 QR</b>을 찍으면 1장이 바로 쌓여요.
        </p>
      ) : (
        /* 종료·기간 만료·시작 전·숨김·초안·판정 불가 — 예전에는 이 자리에 **아무것도 없었다**.
           카드는 활성이고 안내는 없어서, 사용자는 눌러 보고 나서야 서버 오류로 사정을 알았다. */
        <p data-testid="event-blocked-reason"
          className="relative mt-2.5 flex items-start gap-1.5 rounded-input border border-border-default bg-surface-high px-2.5 py-1.5 text-2xs font-semibold leading-relaxed text-ink-secondary">
          <Icon name="info" size={12} className="mt-px shrink-0 text-ink-muted" />
          <span>{av.blockedReason}</span>
        </p>
      )}
    </section>
  );
}

// ── 본인인증·킬스위치 사전 안내 ─────────────────────────────────────────────────
// 오너 지시(2026-09-14): 미인증 손님도 출석하면 참여권이 쌓이지만, 카드를 열려는 순간에야
// 서버(open_event_card)가 거절 문구를 보여줬다 — 오픈기념 이벤트는 신규 손님이 대부분이라
// 이 화면이 가장 자주 보인다. 누르기 전에 무엇이 필요하고 왜 필요한지, 어디로 가면 되는지 미리 안내한다.
//
// ⚠ 이 배너는 **안내일 뿐**이다 — 카드 타일의 disabled 는 여전히 av.canJoin(서버와 같은 판정) 하나만 본다.
//   여기서 또 막으면 서버 규칙이 바뀔 때 화면이 거짓말을 한다(참여권도 이미 안 닳는다 — 소모 전에 거절된다).
// ⚠ 비로그인은 다루지 않는다 — Hero 의 '로그인하고 참여하기' CTA 가 이미 그 상태를 말한다
//   (같은 말을 두 번 하지 않는다 — 로그인부터 하면 그다음에 이 배너가 인증을 이어 말한다).
// ⚠ 킬스위치 OFF 는 **로그인·인증 여부와 무관하게** 모두를 막는다(assertVoucherOn·20260914b 와 같은 조건).
//   그래서 이 가지는 loggedIn 을 보지 않는다 — '인증하세요'만 뜨면 킬스위치 OFF 에서 화면이 거짓말이 된다.
function EventVerifyNotice({ idOn, live, loggedIn, verified }: {
  idOn: boolean; live: boolean; loggedIn: boolean; verified: boolean;
}) {
  if (!live) return null;
  if (!idOn) {
    return (
      <section data-testid="event-killswitch-notice" className="mt-3 rounded-aura border border-border-default bg-surface-high px-3 py-2.5 text-2xs leading-relaxed text-ink-secondary">
        <p className="flex items-start gap-1.5 font-bold text-ink-primary">
          <Icon name="alert" size={13} className="mt-px shrink-0" />
          매장이용권이 현재 비활성화되어 있어 카드를 열 수 없어요
        </p>
        <p className="mt-1">쌓인 참여권은 그대로 남아 있어요 — 준비되면 다시 열립니다.</p>
      </section>
    );
  }
  if (loggedIn && !verified) {
    return (
      <section data-testid="event-verify-notice" className="mt-3 rounded-aura border border-danger/40 bg-danger/[0.08] px-3 py-2.5">
        <p className="flex items-start gap-1.5 text-2xs font-bold text-danger-deep dark:text-danger-light">
          <Icon name="alert" size={13} className="mt-px shrink-0" />
          본인인증을 완료해야 카드를 열 수 있어요
        </p>
        <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">
          쌓인 참여권은 그대로 남아 있어요 — 인증만 마치면 바로 열 수 있습니다.
        </p>
        <button type="button" onClick={() => ensureVerified({ verified }, '이벤트 참여')}
          className="btn-primary mt-2 h-9 w-full text-xs">프로필에서 본인인증하기</button>
      </section>
    );
  }
  return null;
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
