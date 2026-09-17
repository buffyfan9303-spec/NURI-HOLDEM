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
  potBb, BOARD_LEN, ACTION_TYPES, fromJSON,
  type SpotReview, type SpotAction, type SpotActionType, type SpotPosition, type Street,
} from '../../../lib/spot';
import { evaluateSpot, investedThisStreet, type SpotEvaluation } from '../../../lib/spotEvaluate';
import SpotReport from './SpotReport';
import MySpotList from './MySpotList';

export type SpotTab = 'analyze' | 'mine';

const SNAP_KEY = 'tool:spot';

/**
 * 자주 쓰는 사이징 프리셋(BB) — 직접 입력도 그대로 된다.
 *
 * ⚠ 이 숫자는 **이번에 추가로 넣는 돈**이지 "얼마까지 올렸나"(총액)가 아니다.
 * 포커에서 오픈 크기는 관례상 총액으로 말하므로(`2.5bb 오픈`) 프리셋 숫자가 총액처럼 읽히는데,
 * 블라인드 자리는 이미 낸 돈이 있어 **거기서만 어긋난다**:
 *   SB(0.5 냄)가 프리셋 3 → 총액 3.5BB → 필요승률 35.7%.  "3BB 로 오픈" 의 정답은 33.3% (추가 2.5).
 * 비블라인드 자리는 이미 낸 돈이 0 이라 추가액 = 총액이 되어 **우연히 맞는다** — 그래서 안 드러났다.
 * 저장된 스팟(post_spots.spot jsonb)과 potBb 가 전부 '추가액' 규약이라 **의미는 바꾸지 않고**,
 * 고르는 순간 총액을 함께 보여 준다(아래 `투입 총액`).
 */
const SIZE_PRESETS: Record<'pre' | 'post', number[]> = {
  pre: [2, 2.2, 2.5, 3, 4],
  post: [1, 2, 3, 5, 8],
};

// ── 입력 단계 ────────────────────────────────────────────────────────────────
// 한 화면에 필드를 다 펼치면 모바일에서 스크롤만 길어진다. 네 묶음으로 나눈다.
const STEPS = [
  { key: 'game', label: '게임', hint: '어떤 판이었는지 먼저 정합니다.' },
  { key: 'seat', label: '자리·스택', hint: '내 자리와 상대 자리, 유효 스택을 고릅니다.' },
  { key: 'cards', label: '카드·액션', hint: '카드를 고르고 액션을 순서대로 쌓습니다.' },
  { key: 'choice', label: '내 선택', hint: '그 자리에서 실제로 한 선택을 고릅니다.' },
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
    // 표본 수는 **프리플랍·보드 1~2장일 때만** 쓰인다(그 밖은 computeEquity 가 전수계산).
    // 2026-09-17 실측: 2,500회는 12회 반복 폭이 2.7~3.5%p 라 정수 자리도 흔들렸다.
    // 10,000회면 폭 1.4~1.7%p(이론 95% 구간 ±0.98%p)로 정수 자리가 의미를 갖는다.
    // 25,000회(796ms)는 ±0.62%p 로 더 좋지만 정수로 적는 값에 3배 시간을 쓸 이유가 없다.
    equityAsync(h, v, hb.boardCards, 10000).then((r) => {
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
      <div className="flex items-center gap-3">
        <SpadeMark />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold tracking-tight text-ink-primary">NURI SPOT</h2>
          <p className="truncate text-2xs text-ink-muted">핸드 분석 · 리플레이 · 토론</p>
        </div>
      </div>
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

/** 골드 스페이드 + 뒤쪽 국소 LED. 브랜드 심벌은 기존 자산을 쓴다(새 이미지 생성 0). */
function SpadeMark() {
  return (
    // h-10(42.5px): 소개 행 높이를 정하는 요소다 — 상단이 첫 화면의 23% 를 먹어(design 실측, 콘텐츠 시작 y=192.6) 한 단 줄였다.
    <span className="relative grid h-10 w-10 shrink-0 place-items-center" aria-hidden>
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: '0 0 18px rgb(139 92 246 / 0.42), 0 0 34px rgb(34 211 238 / 0.18)' }}
      />
      <span
        className="grid h-10 w-10 place-items-center rounded-full border border-white/12"
        style={{ background: 'radial-gradient(120% 120% at 50% 0%, #242B48 0%, #141930 58%, #0A0D1B 100%)' }}
      >
        <img src="/brand/nuri-holdem-symbol.svg" alt="" width={22} height={22} draggable={false} />
      </span>
    </span>
  );
}

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
  const cur = STEPS.find((s) => s.key === step) ?? STEPS[2];

  return (
    // PC 는 2열(왼쪽 입력 · 오른쪽 결과 sticky), 모바일은 한 줄로 쌓인다 — 같은 컴포넌트·같은 데이터.
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-4">
      <div className="min-w-0 space-y-3">
        <StepBar step={step} onStep={setStep} spot={spot} />
        <p className="text-2xs text-ink-muted">{cur.hint}</p>

        {step === 'game' && <GameStep spot={spot} patch={patch} />}
        {step === 'seat' && <SeatStep spot={spot} patch={patch} />}
        {step === 'cards' && (
          <div className="space-y-3">
            <HandBoardPicker hb={hb} hint={<>보드는 플랍 3장부터 리버 5장까지 — 지금은 <b className="text-ink-secondary">{streetLabel(spot.street)}</b></>} />
            <ActionTimeline spot={spot} patch={patch} />
          </div>
        )}
        {step === 'choice' && <ChoiceStep spot={spot} patch={patch} />}

        <IssueList issues={issues} />
        {savedAt !== null && (
          <p className="text-2xs text-ink-muted" aria-live="polite">
            <Icon name="check" size={11} className="mr-1 inline-block align-[-1px]" />임시 저장됨 — 나갔다 와도 그대로입니다
          </p>
        )}
      </div>

      <div className="mt-3 min-w-0 lg:mt-0 lg:sticky lg:top-[calc(var(--stack-top,6.0625rem)+0.75rem)]">
        <SpotReport
          spot={spot} evaluation={evaluation} calculating={calculating} blocked={blocked} shareIntent={shareIntent}
          user={user} toast={toast}
        />
      </div>
    </div>
  );
}

/** 단계 바 — 현재 단계와 완료 상태를 함께 보여준다. */
function StepBar({ step, onStep, spot }: { step: StepKey; onStep: (s: StepKey) => void; spot: SpotReview }) {
  const done: Record<StepKey, boolean> = {
    game: true,
    seat: spot.heroPos !== spot.villainPos,
    cards: spot.hero.length === 2 && spot.board.length === BOARD_LEN[spot.street],
    choice: spot.heroAction !== null,
  };
  // 네 칩은 412px 에서 한 줄에 안 들어간다 — 가로 스크롤은 두되,
  // **지금 서 있는 단계가 잘려 보이면** 안 된다(412px 실측: '4 내 선택' 이 오른쪽에서 잘렸다).
  // block:'nearest' 로 세로는 건드리지 않아 시트 본문이 같이 튀는 것을 막는다.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    barRef.current?.querySelector('[aria-current="step"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    // ⚠ deps 에 done 을 반드시 넣는다. step 만 보면 이렇게 샌다(412px 실측):
    //   4단계로 이동(체크 없음 → 거의 들어맞음, scrollLeft=1) → 액션 선택 →
    //   체크 아이콘이 생겨 칩이 넓어짐 → 그런데 step 은 그대로라 효과가 안 돈다 → 잘린 채 남는다.
  }, [step, done.seat, done.cards, done.choice]);
  return (
    <div ref={barRef} className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="입력 단계">
      {STEPS.map((s, i) => {
        const on = s.key === step;
        return (
          <button
            key={s.key} type="button" aria-current={on ? 'step' : undefined}
            onClick={() => onStep(s.key)}
            className={['tap-y-44 flex shrink-0 items-center gap-1.5 rounded-badge border px-2.5 py-1.5 text-2xs font-bold transition-colors',
              on ? 'border-accent-300 bg-accent-300 text-white'
                : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}
          >
            <span className={on ? 'text-white/80' : 'text-ink-muted'}>{i + 1}</span>
            {s.label}
            {done[s.key] && <Icon name="check" size={11} className={on ? 'text-white' : 'text-emerald-400'} aria-label="완료" />}
          </button>
        );
      })}
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

function Pick<T extends string | number>({ value, options, onChange, fmt }: {
  value: T; options: readonly T[]; onChange: (v: T) => void; fmt?: (v: T) => string;
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
  // 돈 계산은 한 벌만 둔다 — 예전에는 여기 사본(spotSizing.investedSoFar)이 있었다.
  // investedThisStreet 은 반올림하지 않으므로 **표시할 때** 자릿수를 맞춘다.
  const already = Math.round(investedThisStreet(spot, actor) * 100) / 100;
  const actorPos = actor === 'hero' ? spot.heroPos : spot.villainPos;
  const totalAfter = Math.round((already + (Number.isFinite(size) ? size : 0)) * 100) / 100;

  const add = () => {
    const a: SpotAction = { street: spot.street, actor, type, ...(sized ? { sizeBb: size } : {}) };
    patch({ actions: [...spot.actions, a] });
  };
  const removeAt = (i: number) => patch({ actions: spot.actions.filter((_, n) => n !== i) });

  // 스트리트별로 묶어 보여준다 — 순서가 눈에 보여야 입력이 맞았는지 안다.
  const grouped = (['preflop', 'flop', 'turn', 'river'] as Street[])
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
        <Row label="누가">
          <Pick value={actor} options={['villain', 'hero'] as const} onChange={setActor}
            fmt={(v) => (v === 'hero' ? `나 (${spot.heroPos})` : `상대 (${spot.villainPos})`)} />
        </Row>
        <Row label="무엇을">
          <Pick value={type} options={ACTION_TYPES} onChange={setType} fmt={actionLabel} />
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
              aria-label={`이번에 추가로 넣는 BB 직접 입력 (총액이 아니라 추가액). 지금 값이면 투입 총액 ${totalAfter}BB`}
            />
            <span className="text-2xs text-ink-muted">BB</span>
          </Row>
        )}
        {sized && (
          // 프리셋 숫자는 '추가액' 인데 포커 관례는 총액이라, 블라인드 자리에서만 조용히 어긋난다.
          // 고르는 순간 결과 총액을 보여 주면 그 함정이 사라진다(2026-09-18 실측: SB 프리셋 3 → 3.5BB).
          <p className="text-2xs leading-relaxed text-ink-muted">
            투입 총액 <b className="tabular-nums text-ink-secondary">{totalAfter}BB</b>
            {already > 0 && <> — {actor === 'hero' ? '나' : '상대'}({actorPos})가 이미 낸 {already}BB 포함</>}
          </p>
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
  return (
    <div className="rounded-card border border-border-default bg-surface-mid p-3">
      <Row label="그때 나는">
        <Pick value={spot.heroAction ?? ('' as SpotActionType)} options={ACTION_TYPES}
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
