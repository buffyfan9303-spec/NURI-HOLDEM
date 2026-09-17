// src/components/features/gto/NuriSpotPanel.tsx — NURI SPOT (누리 스팟)
// 핸드 분석 · 리플레이 · 토론을 한 흐름으로 묶는 화면. 2026-09-11 오너 지시.
//
// ── 왜 이 화면이 생겼나 ──────────────────────────────────────────────────────
// 같은 '한 판 복기' 가 세 군데로 흩어져 있었다:
//   · #tool=gto  → GtoDeepPanel   카드만 받고 포지션·스택·액션은 못 받는다
//   · #tool=replay → HandReviewTool  자유문자 액션으로 재생만 한다(분석 불가)
//   · 게시판     → [[REPLAY:]] 마커  글에서 열면 카드 2장만 분석으로 넘어간다
// 세 화면이 서로의 데이터를 몰라서, 사용자는 같은 판을 세 번 입력했다.
// NURI SPOT 은 **구조화된 SpotReview 하나**(src/lib/spot.ts)를 세 축이 함께 쓴다.
//
// ⚠ 기존 도구는 하나도 지우지 않는다. #tool=gto · #tool=replay 는 그대로 살아 있고
//   이 화면은 그 위에 얹히는 통합 진입점이다(ToolsPanel 의 대표 카드).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../atoms/Icon';
import SegmentedTabs from '../../atoms/SegmentedTabs';
import { useToast } from '../../atoms/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { readSnap, writeSnap } from '../../../lib/snapshot';
import { gotoBoard } from '../../../lib/spotNav';
import HandBoardPicker from './HandBoardPicker';
import { useHandBoard } from './useHandBoard';
import { equityAsync } from './equityClient';
import { planEquity, canApplyEquity, equityCardsKey } from './equityRequest';
import { cardId } from './useDeepGto';
import type { Card } from './gto.types';
import {
  emptySpot, validateSpot, hasBlocker, positionsFor, streetLabel, actionLabel,
  potBb, ACTION_TYPES, fromJSON,
  type SpotReview, type SpotAction, type SpotActionType, type SpotPosition, type Street,
} from '../../../lib/spot';
import { amountToCall, evaluateSpot, type SpotEvaluation } from '../../../lib/spotEvaluate';
import SpotReport from './SpotReport';
import MySpotList from './MySpotList';

export type SpotTab = 'analyze' | 'mine';

const SNAP_KEY = 'tool:spot';

/** 자주 쓰는 사이징 프리셋(BB) — 직접 입력도 그대로 된다. */
const SIZE_PRESETS: Record<'pre' | 'post', number[]> = {
  pre: [2, 2.2, 2.5, 3, 4],
  post: [1, 2, 3, 5, 8],
};

const STREET_ORDER: readonly Street[] = ['preflop', 'flop', 'turn', 'river'];

/**
 * 액션 프리셋 — **이 화면에서 탭이 실제로 줄어드는 단 하나**다.
 * `SIZE_PRESETS.pre` 에 8 이 없어 '상대 3벳 8BB' 줄은 오늘 반드시 타이핑 1회가 든다.
 *
 * `actions(st)` 는 순수 함수다 — 계약 테스트가 클릭 없이 결과 배열을 그대로 대조한다.
 * ⚠ 이름에 '액션 추가' 를 넣지 마라. `e2e/nuri-spot.spec.ts:148` 이 그 이름으로 버튼 **1개**를
 *   부분일치로 집고, `:260-271` 이 같은 이름으로 히트 영역을 잰다.
 */
// eslint-disable-next-line react-refresh/only-export-components -- 계약 테스트가 프리셋 정의를 직접 읽는다
export const ACTION_PRESETS: readonly { key: string; label: string; actions: (st: Street) => SpotAction[] }[] = [
  { key: 'firstin', label: '첫 진입', actions: () => [] },
  { key: 'vsopen', label: '상대 오픈 2.5BB', actions: (st) => [{ street: st, actor: 'villain', type: 'raise', sizeBb: 2.5 }] },
  {
    key: 'vs3bet',
    label: '내 오픈 2.5 → 상대 3벳 8',
    actions: (st) => [
      { street: st, actor: 'hero', type: 'raise', sizeBb: 2.5 },
      { street: st, actor: 'villain', type: 'raise', sizeBb: 8 },
    ],
  },
  { key: 'vsbet', label: '상대 벳', actions: (st) => [{ street: st, actor: 'villain', type: 'bet', sizeBb: st === 'preflop' ? 2.5 : 3 }] },
];

/** 프리셋은 **지금 스트리트만** 갈아끼운다 — 앞 스트리트에 쌓아 둔 기록을 지우지 않는다.
 *  sort 는 안정 정렬이라 스트리트 안 순서는 그대로다. */
// eslint-disable-next-line react-refresh/only-export-components -- 위와 같은 이유(순수 함수 단위 테스트)
export function applyPreset(prev: readonly SpotAction[], st: Street, next: SpotAction[]): SpotAction[] {
  return [...prev.filter((a) => a.street !== st), ...next]
    .sort((a, b) => STREET_ORDER.indexOf(a.street) - STREET_ORDER.indexOf(b.street));
}

// ── 입력 단계 ────────────────────────────────────────────────────────────────
// 2026-09-17: **배타 렌더를 버렸다.** 네 묶음은 그대로지만 화면을 갈아끼우지 않고 한 문서로 쌓고,
// 이 목록은 그 밴드로 데려다주는 **앵커 레일**이 된다(단계 이름은 게이트가 정규식으로 읽으므로 그대로).
// 순서는 **문서 순서와 같다** — 레일이 가리키는 차례가 곧 아래에 놓인 차례여야 순서를 잘못 가르치지 않는다.
// 단계 힌트 문장 4개는 지웠다(밴드 제목이 같은 말을 한다 — 누락이 아니라 결정).
const STEPS = [
  { key: 'cards', label: '카드·액션' },
  { key: 'choice', label: '내 선택' },
  { key: 'seat', label: '자리·스택' },
  { key: 'game', label: '게임' },
] as const;
type StepKey = typeof STEPS[number]['key'];

export interface NuriSpotInit {
  spot?: Partial<SpotReview>;
  tab?: SpotTab;
}

export default function NuriSpotPanel({ init }: { init?: NuriSpotInit }) {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<SpotTab>(init?.tab ?? 'analyze');

  // 스팟 상태 — 마지막 입력을 24h 복원(기존 도구와 같은 조리법).
  const [spot, setSpot] = useState<SpotReview>(() => {
    // fromJSON 을 거쳐야 옛 스키마 초안(v1 · 1인당 앤티)이 지금 의미로 올라온다.
    const saved = fromJSON(readSnap<unknown>(SNAP_KEY));
    return { ...emptySpot(), ...(saved ?? {}), ...(init?.spot ?? {}) };
  });
  const patch = useCallback((p: Partial<SpotReview>) => setSpot((s) => ({ ...s, ...p })), []);

  // 임시 저장 — 타이핑마다 쓰지 않도록 400ms 디바운스(HandReviewTool 선례)
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /** 저장 목록에서 "공유"로 들어왔다는 신호 — 값이 바뀌면 리포트가 **확인 시트를 연다**(게시는 아니다). */
  const [shareIntent, setShareIntent] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => { writeSnap(SNAP_KEY, spot); setSavedAt(Date.now()); }, 400);
    return () => window.clearTimeout(t);
  }, [spot]);

  // 카드 입력은 기존 훅을 그대로 쓴다 — 같은 선택기를 두 벌 만들지 않는다.
  const hb = useHandBoard(5, { hero: spot.hero, villain: spot.villain, board: spot.board });
  // 카드 그리드 → 스팟으로 단방향 반영. hb 가 정본이고 spot 은 그 그림자다.
  useEffect(() => {
    setSpot((s) => {
      const hero = hb.heroCards.map(cardId);
      const villain = hb.villainCards.map(cardId);
      const board = hb.boardCards.map(cardId);
      if (s.hero.join() === hero.join() && s.villain.join() === villain.join() && s.board.join() === board.join()) return s;
      // 보드 장수가 바뀌면 스트리트도 따라간다 — 둘이 어긋나면 곧바로 blocker 다.
      const street: Street = board.length >= 5 ? 'river' : board.length >= 4 ? 'turn' : board.length >= 3 ? 'flop' : 'preflop';
      return { ...s, hero, villain, board, street };
    });
  }, [hb.heroCards, hb.villainCards, hb.boardCards]);

  const issues = useMemo(() => validateSpot(spot), [spot]);
  const blocked = hasBlocker(issues);

  // ── 에퀴티: 워커 위임 + **최신 요청 우선**(오래된 응답이 새 결과를 덮지 않는다) ──
  const [equity, setEquity] = useState<number | null>(null);
  const [calculating, setCalculating] = useState(false);
  const reqId = useRef(0);
  // ⚠ 재계산 키는 **카드로** 잡는다. canonicalSpotKey 는 빌런 카드를 의도적으로 빼기 때문에
  //   그 키를 쓰면 ① 히어로→빌런 순서 입력에서 마지막 변화가 키를 안 건드려 아예 계산되지 않고
  //   ② 빌런만 바꾸면 이전 빌런 핸드의 승률이 그대로 남아 저장·공유된다(F11).
  const cardsKey = equityCardsKey(hb.ids.hero, hb.ids.villain, hb.ids.board);
  useEffect(() => {
    const canCalc = hb.heroCards.length === 2 && hb.villainCards.length === 2 && !blocked;
    // ⚠ 세대는 **조기 반환보다 먼저** 올린다 — 무효 전환도 진행 중인 요청을 끊어야 한다.
    const plan = planEquity(reqId.current, canCalc);
    reqId.current = plan.gen;
    if (plan.kind === 'clear') { setEquity(null); setCalculating(false); return; }
    const my = plan.gen;
    setCalculating(true);
    const h = hb.heroCards as [Card, Card];
    const v = hb.villainCards as [Card, Card];
    equityAsync(h, v, hb.boardCards, 2500).then((r) => {
      if (!canApplyEquity(my, reqId.current)) return;  // 오래된 응답 — 버린다
      setEquity(r.hero);
      setCalculating(false);
    }).catch(() => { if (canApplyEquity(my, reqId.current)) setCalculating(false); });
    return () => { /* 취소는 세대 비교로 처리 — 워커는 계속 돌게 둔다(중단 API 없음) */ };
    // cardsKey 는 '에퀴티 입력이 바뀌었을 때만' 다시 계산하기 위한 안정 키다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsKey, blocked]);

  /** 저장한 스팟을 분석 탭으로 연다. '열기'와 '공유' 가 **같은 한 곳**을 지나야 상태 교체가 갈라지지 않는다. */
  const openSaved = useCallback((s: SpotReview) => {
    // ⚠ 카드 그리드(hb)와 리포트(spot)를 **같은 커밋에서** 함께 갈아끼운다(F10).
    //   hb 를 두고 setSpot 만 하면 그리드는 이전 스팟에 남고, 그 상태로 저장·공유하면
    //   이전 스팟의 에퀴티가 영구 스냅샷에 박힌다. 그 뒤 카드를 하나만 건드리면
    //   아래 동기화 이펙트가 돌아 **연 스팟의 카드가 이전 스팟으로 덮인다.**
    //   교체 직후 동기화 이펙트는 문자열 비교가 같아 early-return 하므로 s.street 는 보존된다.
    setSpot(s);
    hb.setAll({ hero: s.hero, villain: s.villain, board: s.board });
    setTab('analyze');
  }, [hb]);

  const evaluation = useMemo<SpotEvaluation>(
    () => evaluateSpot(spot, { heroEquity: equity }),
    [spot, equity],
  );

  return (
    <div className="space-y-3">
      <SpotHero tab={tab} onTab={setTab} />

      {tab === 'analyze' && (
        <AnalyzeTab
          spot={spot} patch={patch} hb={hb} issues={issues} blocked={blocked}
          evaluation={evaluation} calculating={calculating} savedAt={savedAt}
          user={user} toast={toast} shareIntent={shareIntent}
        />
      )}
      {tab === 'mine' && (
        <MySpotList
          onShare={(s) => { openSaved(s); setShareIntent((n) => n + 1); }}
          onOpen={openSaved}
          onNew={() => setTab('analyze')} />
      )}
    </div>
  );
}

// ── 대표 헤더 ────────────────────────────────────────────────────────────────
// Aura LED 는 여기 **한 곳만** 세게 준다. 아래 입력 카드들은 같은 강도로 빛나지 않는다
// (전부 빛나면 위계가 사라져 무엇이 중요한지 안 보인다).
function SpotHero({ tab, onTab }: { tab: SpotTab; onTab: (t: SpotTab) => void }) {
  return (
    <div className="relative overflow-visible">
      {/* 뒤에서 새어 나오는 LED — 장식 레이어는 클릭·포커스를 가로채지 않는다 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 -top-6 -bottom-2 -z-10"
        style={{
          background:
            'radial-gradient(closest-side, rgb(139 92 246 / 0.22), transparent 72%),'
            + 'radial-gradient(closest-side, rgb(34 211 238 / 0.12), transparent 74%)',
          backgroundPosition: '18% 20%, 78% 60%',
          backgroundSize: '58% 88%, 46% 70%',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* ⚠ 제목을 여기서 **지웠다**(2026-09-17). 창 제목(`Modal.tsx` 의 `<h2 id="modal-title">` = `TOOLS[spot].name`)이
          이미 `NURI SPOT` 을 말한다 — 같은 글자가 두 번 떴고, 상단 42.5px(실측)을 먹고 있었다.
          🔴 이 삭제와 `ToolsPanel.tsx` 의 `name: '누리 스팟'` → `'NURI SPOT'` 은 **한 쌍**이다.
             하나만 하면 `e2e/nuri-spot.spec.ts:45` 의 `getByText('NURI SPOT', {exact:true})` 가
             0개(strict 타임아웃) 또는 2개(strict 위반)로 즉시 터진다 — 격리 재현으로 4경우 전부 확인했다. */}
      {/* 내비 행 — 분석 | 내 스팟 | 게시판 토론 › 셋이 같은 행·같은 세로 중심·같은 글자 규격(t-tab).
          2026-09-14 실측(390px): '게시판 토론'이 소개 행(y 73.6, 11.7px)에, 탭은 아래 행(y 132.8, 12.75px)에 있어
          "위치가 다르다"(오너 지적)가 났다 — 탭을 오갈 때 좌표 자체는 같았고(분석·내 스팟 모두 동일), 다른 행·다른 규격이 원인.
          토론 탭은 없앴다(오너 지시 2026-09-11: "스팟 토론은 게시판에서 하게 해야 돼"). 대신 **가는 길**은 남긴다 —
          같은 행의 형제 버튼이지 세 번째 탭(role=tab·aria-selected·알약)이 아니다. 좁은 폭·200% 에서는 CTA 가 다음 줄로 내려간다
          (flex-wrap — 가로 스크롤·whitespace-nowrap 은 접근성 게이트에 걸려 쓰지 않는다). */}
      <div data-testid="spot-primary-nav" className="mt-2 flex flex-wrap items-stretch gap-1.5">
        <SegmentedTabs
          items={[
            { key: 'analyze' as const, label: '분석' },
            { key: 'mine' as const, label: '내 스팟' },
          ]}
          value={tab} onChange={onTab} grow
          // ⚠ .tap-y-44 는 **컨테이너**의 ::before 를 넓힐 뿐이라 버튼 자체의 히트 영역은 그대로다
          //   (실측 27px). 자식 버튼에 직접 높이를 준다 — 이 화면의 1급 내비게이션이라 44px 계약 대상이다.
          //   flex-[2_1_10rem]: 줄 배치용 basis 일 뿐 최소 폭이 아니라(200% 에서도 320px 을 밀지 않는다) 남는 폭을 탭이 가져간다.
          className="min-w-0 flex-[2_1_10rem] [&>button]:min-h-[44px]"
        />
        <button type="button" onClick={gotoBoard} data-testid="spot-board-link"
          className="flex min-h-[44px] shrink-0 items-center justify-center gap-1 rounded-input border border-border-subtle bg-surface-high/60 px-2.5 t-tab font-semibold text-accent-200">
          <span data-testid="spot-board-label">게시판 토론</span>
          <Icon name="chevron-right" size={12} className="block shrink-0" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ⚠ `SpadeMark`(골드 스페이드 + 국소 LED)는 위 제목 행과 함께 지웠다 — 호출부가 0곳이 됐다.
//   같은 심벌은 GTO 홈의 대표 카드(`ToolsPanel.tsx` 의 `SpotHeroCard`)에 그대로 살아 있고,
//   자산(`public/brand/nuri-holdem-symbol.svg`)도 손대지 않았다. 잃은 기능 0.

// ── 분석 탭 ──────────────────────────────────────────────────────────────────

interface AnalyzeProps {
  spot: SpotReview;
  patch: (p: Partial<SpotReview>) => void;
  hb: ReturnType<typeof useHandBoard>;
  issues: ReturnType<typeof validateSpot>;
  blocked: boolean;
  evaluation: SpotEvaluation;
  /** 저장 목록의 '공유'로 들어온 신호 — 리포트가 확인 시트를 연다(게시 아님) */
  shareIntent: number;
  calculating: boolean;
  savedAt: number | null;
  user: ReturnType<typeof useAuth>['user'];
  toast: ReturnType<typeof useToast>;
}

function AnalyzeTab({ spot, patch, hb, issues, blocked, evaluation, calculating, savedAt, user, toast, shareIntent }: AnalyzeProps) {
  const [step, setStep] = useState<StepKey>('cards');
  const bands = useRef<Partial<Record<StepKey, HTMLDivElement | null>>>({});
  // 레일은 화면을 갈아끼우지 않는다 — 그 밴드로 데려다줄 뿐이다.
  const goStep = (k: StepKey) => {
    setStep(k);
    bands.current[k]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <>
      <AnchorRail step={step} onStep={goStep} />
      {/* PC 는 2열(왼쪽 입력 2행 · 오른쪽 결과 sticky), 모바일은 grid 가 꺼져 **DOM 순서 그대로** 쌓인다.
          ⚠ `lg:items-start` 를 빼면 오른쪽 열이 그리드 전체 높이로 stretch 돼 sticky 가 **조용히 죽는다**
            (1280 실측: 박스 높이 420 → 1276.5, 스크롤 482px 뒤 리포트 top +176.3 → −409.8 = 화면 밖). */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-4">
        {/* ① 내 패 · ② 덱 52장 · ③ 보드·상대·초기화 — HandBoardPicker 한 덩어리.
            `hint` 를 안 넘긴다: 공용 컴포넌트의 `{hint ? … : null}` 이 이미 옵셔널이라 한 글자도 안 고친다.
            스트리트는 아래 액션 타임라인의 소제목이 말한다. */}
        <div ref={(el) => { bands.current.cards = el; }} className="min-w-0 scroll-mt-14 lg:col-start-1 lg:row-start-1">
          <HandBoardPicker hb={hb} />
        </div>

        {/* ⑤ 리포트 — 카드 2장 뒤 등급 배지가 **첫 화면 안**에 있으려면 여기여야 한다.
            375×667 실측: ④ 내 선택 + IssueList 를 리포트 앞에 두면 배지 top 840.17(화면 밖 173px),
            뒤로 내리면 596.05(bottom 618.23, 여유 48.8px). 취향이 아니라 측정 결과다. */}
        {/* ⚠ sticky 오프셋을 `var(--stack-top)` 에서 `lg:top-3` 으로 **고쳤다**(2026-09-17 실측).
            `--stack-top`(App.tsx:1994)은 앱 헤더+GNB 탭바의 **뷰포트 기준 하단**이라 인페이지 sticky
            (AdminTab·VenueManageTab·StoreDashboard·LedgerWorkspace)에는 맞지만, 이 화면은 그 둘을
            z-[55] 로 덮는 전체화면 모달 안이고 기준점은 모달 본문 스크롤포트다.
            1280×900 실측: 리포트가 스크롤포트 상단에서 115.75px 아래에 붙어 841px 읽기 높이의 13.9% 를
            빈칸으로 버렸다(top 202.06 → 스크롤 후 175.25, 스크롤포트 top 59.5).
            다른 5곳은 모달 밖이라 그대로 둔다 — 여기만 기준점이 어긋나 있었다.
            ⚠ `top-3`(12.75px)으로 줄였더니 이번엔 **sticky 레일이 리포트 머리를 덮었다** — 1280 스크린샷에서
              등급 배지 줄이 통째로 가려졌다(숫자로는 안 보였다. 레일 래퍼 45.56px = 칩 32.81 + py-1.5 12.75).
              `top-14`(59.5px)가 레일 아래 13.94px 여유를 남긴다. 밴드의 `scroll-mt-14` 와 같은 값이다. */}
        <div className="mt-3 min-w-0 lg:mt-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-14">
          <SpotReport
            spot={spot} evaluation={evaluation} calculating={calculating} blocked={blocked} shareIntent={shareIntent}
            user={user} toast={toast}
          />
        </div>

        <div className="mt-3 min-w-0 space-y-3 lg:mt-0 lg:col-start-1 lg:row-start-2">
          {/* 무엇을 고쳐야 하는지 — 모든 상태에서 화면에 남는다(issues 가 비면 스스로 null 을 돌려준다). */}
          <IssueList issues={issues} />
          <div ref={(el) => { bands.current.choice = el; }} className="scroll-mt-14">
            <ChoiceStep spot={spot} patch={patch} />
          </div>
          <ActionTimeline spot={spot} patch={patch} />
          <div ref={(el) => { bands.current.seat = el; }} className="scroll-mt-14">
            <SeatStep spot={spot} patch={patch} />
          </div>
          <div ref={(el) => { bands.current.game = el; }} className="scroll-mt-14">
            <GameStep spot={spot} patch={patch} />
          </div>
          {savedAt !== null && (
            <p className="text-2xs text-ink-muted" aria-live="polite">
              <Icon name="check" size={11} className="mr-1 inline-block align-[-1px]" />임시 저장됨 — 나갔다 와도 그대로입니다
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * 앵커 레일 — 이 화면에서 **sticky 는 이것 하나뿐**이다(내비 행은 올리지 않는다 → 겹침 0).
 *
 * 번호(`{i+1}`)와 완료 체크를 뺐다: `done.game` 은 상수 true 였고 `done.seat` 은 기본값에서 항상 참이라
 * 거짓말이었으며, 3번에서 시작하는 번호는 순서를 잘못 가르쳤다. 칩 폭이 상태에 따라 넓어지지 않게 되면서
 * `e2e/nuri-spot.spec.ts:185-193` 이 잡던 "나중에 넓어져 잘림" 부류는 구조적으로 재발할 수 없다.
 */
function AnchorRail({ step, onStep }: { step: StepKey; onStep: (s: StepKey) => void }) {
  // 네 칩은 좁은 폭·200% 확대에서 한 줄에 안 들어간다 — 가로 스크롤은 두되,
  // **지금 서 있는 칩이 잘려 보이면** 안 된다. block:'nearest' 로 세로는 건드리지 않는다
  // (레일이 sticky 라 항상 보이므로 'nearest' 는 세로 스크롤을 만들지 않는다 — 밴드 스크롤과 싸우지 않는다).
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    barRef.current?.querySelector('[aria-current="step"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    // deps 에서 done 3개가 빠졌다 — 체크 아이콘을 없애 칩 폭이 상태와 무관해졌기 때문이다.
  }, [step]);
  return (
    // -mx-page-x px-page-x: 모달 본문의 좌우 여백(17px)까지 덮어야 sticky 아래로 내용이 비치지 않는다.
    <div className="sticky top-0 z-10 -mx-page-x bg-surface-base px-page-x py-1.5">
      <div ref={barRef} className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="입력 단계">
        {STEPS.map((s) => {
          const on = s.key === step;
          return (
            <button
              key={s.key} type="button" aria-current={on ? 'step' : undefined}
              onClick={() => onStep(s.key)}
              className={['tap-y-44 flex shrink-0 items-center rounded-badge border px-2.5 py-1.5 text-2xs font-bold transition-colors',
                on ? 'border-accent-300 bg-accent-300 text-white'
                  : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 라벨 위 · 칩 전폭(2026-09-14 design 실측: 라벨과 나란히 두면 360px 에서 '유효 스택 100BB'·'이번에 추가 4' 가 혼자 다음 줄로 떨어졌다).
 *  py-1 · gap-1: 행 하나가 72px 이라 '액션 순서' 카드가 412px(390px 실측)였다 — 세로 여백만 한 단 줄인다(칩·글자 크기 불변).
 *  wrap: 자식이 칩 묶음 + 직접 입력처럼 둘일 때 입력을 다음 줄로 내려 칩 줄에서 고아를 만들지 않는다. */
function Row({ label, children, wrap = false }: { label: string; children: React.ReactNode; wrap?: boolean }) {
  return (
    <div className="flex flex-col items-stretch gap-1 py-1">
      <span className="shrink-0 text-xs font-medium text-ink-secondary">{label}</span>
      <div className={['flex min-w-0 items-center gap-1.5', wrap ? 'flex-wrap' : ''].join(' ')}>{children}</div>
    </div>
  );
}

function Pick<T extends string | number>({ value, options, onChange, fmt, label }: {
  value: T; options: readonly T[]; onChange: (v: T) => void; fmt?: (v: T) => string;
  /** 접근명을 넓힌다(보이는 글자를 **포함**해야 한다 — WCAG 2.5.3).
   *  같은 라벨의 칩이 화면에 둘 이상일 때 게이트가 `.first()` 순서에 기대지 않게 하는 용도다. */
  label?: (v: T) => string;
}) {
  // 현재 값이 선택지에 없으면(옛 초안의 앤티 등) 마지막 칩으로 보여 준다 — 값을 접거나 버리지 않는다.
  // '' 는 '아직 미선택'(heroAction null) 이라 칩을 만들지 않는다.
  const shown = options.includes(value) || value === '' ? options : [...options, value];
  // 줄바꿈 허용(flex-wrap). Row 가 라벨을 위로 올려 전폭을 쓰므로 360px 에서 유효 스택·이번에 추가는 1줄이고,
  // 자리 칩 10개(10인)만 2줄이 된다 — 균형 잡힌 줄바꿈이라 받아들인다. 한 줄 가로 스크롤은 시도했다가 철회했다:
  // e2e 접근성 게이트(가로 잘림 0·가로 스크롤 0)가 clientWidth < scrollWidth 를 잘림으로 보고 200% 확대에선 통과 불가.
  // 같은 이유로 whitespace-nowrap 도 두지 않는다(칩 안에서 글자가 접혀야 320px·200% 를 지난다).
  // ⚠ gap-y-3: 두 줄이 될 때 `.tap-y-44` 의 위아래 6px 확장이 겹치지 않게(gap-1 이면 실효 터치가 줄어든다).
  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-x-1 gap-y-3">
      {shown.map((o) => (
        <button key={String(o)} type="button" aria-pressed={o === value} onClick={() => onChange(o)}
          aria-label={label ? label(o) : undefined}
          // min-h 36 + tap-y-44 의 위아래 6px = 48px 터치(전엔 32px 로 44px 계약 미달)
          className={['tap-y-44 min-h-[36px] rounded-input border px-2 text-2xs font-bold transition-colors',
            o === value ? 'border-accent-300 bg-accent-300 text-white'
              : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
          {fmt ? fmt(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

function GameStep({ spot, patch }: { spot: SpotReview; patch: (p: Partial<SpotReview>) => void }) {
  return (
    <div className="rounded-card border border-border-default bg-surface-mid p-3">
      <Row label="형식">
        <Pick value={spot.format} options={['mtt', 'cash'] as const}
          onChange={(v) => patch({ format: v })} fmt={(v) => (v === 'mtt' ? '대회' : '캐시')} />
      </Row>
      <Row label="테이블 인원">
        <Pick value={spot.tableSize} options={[2, 6, 8, 9, 10]}
          onChange={(v) => {
            const seats = positionsFor(v);
            patch({
              tableSize: v,
              heroPos: seats.includes(spot.heroPos) ? spot.heroPos : seats[seats.length - 3] ?? seats[0],
              villainPos: seats.includes(spot.villainPos) ? spot.villainPos : seats[seats.length - 1],
            });
          }}
          fmt={(v) => `${v}인`} />
      </Row>
      <Row label="BB 앤티">
        {/* BB 한 명이 대표로 내는 총액(2026-09-14 오너 확정). 옛 초안의 0.125/0.25 는 칩이 안 눌린 채 값만 남는다. */}
        <Pick value={spot.anteBb} options={[0, 0.5, 1]}
          onChange={(v) => patch({ anteBb: v })} fmt={(v) => (v === 0 ? '없음' : `${v}BB`)} />
      </Row>
    </div>
  );
}

function SeatStep({ spot, patch }: { spot: SpotReview; patch: (p: Partial<SpotReview>) => void }) {
  const seats = positionsFor(spot.tableSize);
  return (
    <div className="rounded-card border border-border-default bg-surface-mid p-3">
      <Row label="내 자리">
        <Pick value={spot.heroPos} options={seats} onChange={(v) => patch({ heroPos: v as SpotPosition })} />
      </Row>
      <Row label="상대 자리">
        <Pick value={spot.villainPos} options={seats} onChange={(v) => patch({ villainPos: v as SpotPosition })} />
      </Row>
      {/* 칩과 직접 입력은 **같은 값**을 넣는 두 방법이라 한 묶음이다(전엔 따로 노는 별도 행이었다).
          입력한 값이 칩에 없으면 Pick 이 그 값을 눌린 칩으로 보여 줘 둘이 항상 같은 상태를 가리킨다.
          wrap: 360px 에서 칩 5개(266px)+입력은 한 줄에 못 들어가므로 입력이 둘째 줄로 내려간다 — 칩 줄은 그대로 한 줄. */}
      <Row label="유효 스택" wrap>
        <Pick value={spot.effectiveBb} options={[10, 20, 40, 60, 100]}
          onChange={(v) => patch({ effectiveBb: v })} fmt={(v) => `${v}BB`} />
        <label className="flex shrink-0 items-center gap-1.5">
          <span className="text-2xs font-medium text-ink-secondary">직접 입력</span>
          <input
            type="number" inputMode="decimal" min={1} step={0.5} value={spot.effectiveBb}
            onChange={(e) => patch({ effectiveBb: Number(e.target.value) })}
            className="input min-h-[44px] w-20 text-right" aria-label="유효 스택 BB 직접 입력"
          />
          <span className="text-2xs text-ink-muted">BB</span>
        </label>
      </Row>
      {/* UTG·HJ·CO 가 무엇인지 모르는 사람에게 이 화면은 여기서 막힌다.
          `ToolsPanel` 의 앵커 위임(`a[href^="#tool="]`)이 이미 받으므로 새 컴포넌트·새 이벤트 0 —
          전체 리로드 없이 용어사전 도구로 갈아끼운다. */}
      <a href="#tool=glossary"
        className="inline-flex min-h-[44px] items-center gap-1 text-2xs font-semibold text-accent-200 transition-colors hover:text-accent-300">
        자리 이름 뜻 보기
        <Icon name="chevron-right" size={12} className="block shrink-0" aria-hidden />
      </a>
    </div>
  );
}

/** 액션 타임라인 — 긴 텍스트 한 칸 대신 **추가 가능한 행**. 구조가 곧 분석 입력이다. */
function ActionTimeline({ spot, patch }: { spot: SpotReview; patch: (p: Partial<SpotReview>) => void }) {
  const [actor, setActor] = useState<'hero' | 'villain'>('villain');
  const [type, setType] = useState<SpotActionType>('raise');
  const [size, setSize] = useState<number>(2.5);
  const sized = type === 'call' || type === 'bet' || type === 'raise';
  const presets = spot.street === 'preflop' ? SIZE_PRESETS.pre : SIZE_PRESETS.post;

  const add = () => {
    const a: SpotAction = { street: spot.street, actor, type, ...(sized ? { sizeBb: size } : {}) };
    patch({ actions: [...spot.actions, a] });
  };
  const removeAt = (i: number) => patch({ actions: spot.actions.filter((_, n) => n !== i) });

  // 스트리트별로 묶어 보여준다 — 순서가 눈에 보여야 입력이 맞았는지 안다.
  const grouped = STREET_ORDER
    .map((st) => ({ st, rows: spot.actions.map((a, i) => ({ a, i })).filter((x) => x.a.street === st) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="rounded-card border border-border-default bg-surface-mid p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold text-ink-primary">액션 순서</p>
        <p className="text-2xs tabular-nums text-ink-muted">팟 {potBb(spot)}BB</p>
      </div>

      {grouped.length === 0 ? (
        <p className="rounded-input border border-dashed border-border-default px-3 py-4 text-center text-2xs text-ink-muted">
          아직 액션이 없습니다. 아래에서 한 줄씩 쌓아 주세요.
        </p>
      ) : (
        <div className="space-y-2">
          {grouped.map(({ st, rows }) => (
            <div key={st}>
              <p className="mb-1 text-2xs font-bold text-accent-200">{streetLabel(st)}</p>
              <ul className="space-y-1">
                {rows.map(({ a, i }) => (
                  <li key={i} className="flex items-center gap-2 rounded-input bg-surface-high px-2.5 py-1.5">
                    <span className={['shrink-0 text-2xs font-bold', a.actor === 'hero' ? 'text-accent-200' : 'text-ink-muted'].join(' ')}>
                      {a.actor === 'hero' ? spot.heroPos : spot.villainPos}
                    </span>
                    <span className="flex-1 text-xs text-ink-primary">
                      {actionLabel(a.type)}{a.sizeBb !== undefined && <span className="ml-1 tabular-nums text-ink-secondary">{a.sizeBb}BB</span>}
                    </span>
                    <button type="button" onClick={() => removeAt(i)}
                      aria-label={`${streetLabel(st)} ${actionLabel(a.type)} 삭제`}
                      className="flex h-[32px] w-[32px] items-center justify-center rounded-input text-ink-muted transition-colors hover:text-danger">
                      <Icon name="close" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* 추가 줄 — 버튼으로 빠르게, 필요하면 숫자를 직접 */}
      <div className="mt-2.5 space-y-1.5 border-t border-border-subtle pt-2.5">
        <Row label="자주 쓰는 시작점" wrap>
          {ACTION_PRESETS.map((p) => (
            <button key={p.key} type="button"
              onClick={() => patch({ actions: applyPreset(spot.actions, spot.street, p.actions(spot.street)) })}
              className="tap-y-44 min-h-[36px] rounded-input border border-border-default bg-surface-high px-2 text-2xs font-bold text-ink-secondary transition-colors break-keep hover:text-ink-primary">
              {p.label}
            </button>
          ))}
        </Row>
        <Row label="누가">
          <Pick value={actor} options={['villain', 'hero'] as const} onChange={setActor}
            fmt={(v) => (v === 'hero' ? `나 (${spot.heroPos})` : `상대 (${spot.villainPos})`)} />
        </Row>
        <Row label="무엇을">
          {/* ⚠ 접근명을 '상대 레이즈' 로 넓힌다. ④ ChoiceStep 에도 같은 '레이즈' 칩이 있어
              `getByRole('button', {name:'레이즈', exact:true})`(e2e:182 · board:162)가 둘 다 잡았고,
              `.first()` 가 **DOM 순서라는 관습**에만 기대고 있었다. 이제 여기는 exact 매칭에서 아예 빠진다.
              보이는 글자('레이즈')가 접근명에 그대로 들어 있어 WCAG 2.5.3 을 지킨다. */}
          <Pick value={type} options={ACTION_TYPES} onChange={setType} fmt={actionLabel}
            label={(v) => `${actor === 'hero' ? '나' : '상대'} ${actionLabel(v)}`} />
        </Row>
        {sized && (
          // '총액으로 레이즈'가 아니라 **이번에 추가로 넣는 돈**이다. 둘을 섞으면 팟과 콜 금액이
          // 통째로 어긋난다 — 저장된 스팟도 같은 규칙으로 적혀 있다.
          <Row label="이번에 추가">
            <Pick value={size} options={presets} onChange={setSize} fmt={(v) => `${v}`} />
            <input
              type="number" inputMode="decimal" min={0} step={0.5} value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="input min-h-[36px] w-16 text-right"
              aria-label="이번에 추가로 넣는 BB 직접 입력 (총액이 아니라 추가액)"
            />
            <span className="text-2xs text-ink-muted">BB</span>
          </Row>
        )}
        <button type="button" onClick={add} className="btn-ghost mt-1 min-h-[44px] w-full text-xs">
          <Icon name="plus" size={13} className="mr-1 inline-block align-[-2px]" />액션 추가
        </button>
      </div>
    </div>
  );
}

function ChoiceStep({ spot, patch }: { spot: SpotReview; patch: (p: Partial<SpotReview>) => void }) {
  const sized = spot.heroAction === 'call' || spot.heroAction === 'bet' || spot.heroAction === 'raise';
  // 낼 돈이 있는 자리에서는 '체크' 가 애초에 불가능한 선택이다. 그런데 고를 수 있게 두면
  // mixKeyOf('check') 가 null → verdictFromFreq(null, true) = 'mixed' 로 떨어져
  // 리포트가 **허용되는 혼합**이라고 판정해 버린다(표가 판정한 적이 없는데).
  // 포스트플랍 노벳(=0)에서는 그대로 보인다. 저장된 옛 스팟의 'check' 는 Pick 이 마지막 칩으로 살려 둔다.
  const choices: readonly SpotActionType[] = amountToCall(spot) > 0
    ? ACTION_TYPES.filter((t) => t !== 'check')
    : ACTION_TYPES;
  return (
    <div className="rounded-card border border-border-default bg-surface-mid p-3">
      <Row label="그때 나는">
        <Pick value={spot.heroAction ?? ('' as SpotActionType)} options={choices}
          onChange={(v) => patch({ heroAction: v })} fmt={actionLabel} />
      </Row>
      {sized && (
        // 액션 원장과 같은 규칙 — 총액이 아니라 **이번에 추가로 넣은 돈**이다.
        <Row label="이번에 추가">
          <input
            type="number" inputMode="decimal" min={0} step={0.5} value={spot.heroActionSizeBb ?? 0}
            onChange={(e) => patch({ heroActionSizeBb: Number(e.target.value) })}
            className="input min-h-[44px] w-24 text-right"
            aria-label="내가 이번에 추가로 넣은 BB (총액이 아니라 추가액)"
          />
          <span className="text-2xs text-ink-muted">BB</span>
        </Row>
      )}
      <div className="mt-2 border-t border-border-subtle pt-2">
        <label className="mb-1 block text-xs font-medium text-ink-secondary" htmlFor="spot-note">메모 (선택)</label>
        <textarea
          id="spot-note" rows={2} value={spot.note ?? ''} maxLength={300}
          onChange={(e) => patch({ note: e.target.value })}
          placeholder="왜 그렇게 했는지 · 무엇이 고민이었는지"
          className="input resize-none text-sm"
        />
        <p className="mt-1 text-2xs text-ink-muted">
          상대 이름·매장명은 적지 마세요 — 스팟에는 개인정보를 담지 않습니다.
        </p>
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: ReturnType<typeof validateSpot> }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1" role="alert">
      {issues.map((i, n) => (
        <li key={n} className={['flex items-start gap-1.5 rounded-input px-2.5 py-1.5 text-2xs leading-relaxed',
          i.level === 'blocker' ? 'bg-danger/10 text-danger' : 'bg-amber-500/10 text-amber-200'].join(' ')}>
          <Icon name={i.level === 'blocker' ? 'alert' : 'info'} size={12} className="mt-px shrink-0" aria-hidden />
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}
