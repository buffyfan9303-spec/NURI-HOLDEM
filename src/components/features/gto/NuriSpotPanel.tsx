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
import { CHIP_HIT } from './chip';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../atoms/Icon';
import SegmentedTabs from '../../atoms/SegmentedTabs';
import { useToast } from '../../atoms/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { readSnap, writeSnap } from '../../../lib/snapshot';
import { gotoBoard } from '../../../lib/spotNav';
import HandBoardPicker from './HandBoardPicker';
import { useHandBoard } from './useHandBoard';
import { cardId } from './useDeepGto';
import {
  emptySpot, validateSpot, hasBlocker, positionsFor, streetLabel, actionLabel,
  potBb, ACTION_TYPES, fromJSON, actorPos, EXTRA_LETTERS, MAX_EXTRA_VILLAINS,
  type SpotReview, type SpotAction, type SpotActionType, type SpotPosition, type Street,
} from '../../../lib/spot';
import { evaluateSpot, investedByPos, type SpotEvaluation } from '../../../lib/spotEvaluate';
import SpotReport, { type SavedRef } from './SpotReport';
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
// 🔴 2026-09-23 오너 결정 A안(SPOT-WRITE-UX-AI) — 다섯 단계 + 하단 고정 [이전][다음].
//   예전(네 단계)은 카드·액션이 한 화면이라 390px 에서 스크롤이 1480px 였고, 단계 이동이 상단 단계바뿐이었다.
//   '작성 내용' 카드(저장·공유·AI)는 마지막 '확인' 단계에만 선다 — 입력 중에는 입력만 보인다.
// 🔴 2026-09-24 오너 G3: 게임 + 자리·스택 두 단계를 하나로 합쳤다(다섯 → 네 단계). 입력 항목·검증·AI 입력은 그대로 —
//   화면 묶음만 바뀌었다. key 'game' 을 유지해 '진입은 1번 게임부터' 계약이 이어진다.
const STEPS = [
  { key: 'game', label: '게임·자리', hint: '어떤 판이었는지와 내 자리·상대 자리·유효 스택을 정합니다.' },
  { key: 'cards', label: '카드', hint: '내 카드와 보드를 고릅니다. 상대 카드는 알 때만 넣으세요.' },
  { key: 'action', label: '액션', hint: '액션을 순서대로 쌓고, 그때 내가 한 선택을 고릅니다.' },
  { key: 'confirm', label: '확인', hint: '작성한 내용을 확인하고 저장·공유합니다.' },
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
  // 🔴 SPOT-MYSPOT-JANK(2026-09-24): 두 판은 **한 번 들어간 뒤 유지**하고 hidden 으로만 바꾼다.
  //   예전엔 조건부 렌더라 전환마다 재마운트됐다 — 작성 단계가 1단계로 되돌아가고(기능 결함),
  //   목록은 재조회+스켈레톤으로 본문이 468→307→745px 로 계단지고 스크롤이 0 으로 깎였다.
  const [seen, setSeen] = useState<ReadonlySet<SpotTab>>(() => new Set([init?.tab ?? 'analyze']));
  /** 저장 스팟을 열 때만 올린다 — 작성 판을 **새로** 만들어 shareIntent(확인 단계·확인 시트)를 새 마운트 초기값으로 읽게 한다. */
  const [analyzeKey, setAnalyzeKey] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  /** 탭마다 떠날 때의 스크롤 — 돌아오면 그 자리로(판을 유지해도 스크롤 상자는 둘이 함께 쓴다). */
  const scrollMem = useRef<Partial<Record<SpotTab, number>>>({});
  const switchTab = (t: SpotTab) => {
    if (t === tab) return;
    const sc = scrollBox(rootRef.current);
    if (sc) scrollMem.current[tab] = sc.scrollTop;
    setSeen((v) => (v.has(t) ? v : new Set(v).add(t)));
    setTab(t);
  };
  useLayoutEffect(() => {
    const y = scrollMem.current[tab];
    const sc = scrollBox(rootRef.current);
    if (sc && y !== undefined) sc.scrollTop = y;
  }, [tab]);

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
  const hbRaw = useHandBoard(5, { hero: spot.hero, villain: spot.villain, board: spot.board, extra: spot.extra.map((v) => v.cards) });
  // useHandBoard 는 렌더마다 새 객체를 돌려준다 — 필드가 하나도 안 바뀌었으면 이전 객체를 그대로 쓴다.
  //   탭 전환(부모 재렌더)만으로 작성 판 전체(카드 52장 그리드)가 다시 그려지지 않게(SPOT-MYSPOT-JANK).
  const hbRef = useRef(hbRaw);
  if ((Object.keys(hbRaw) as (keyof typeof hbRaw)[]).some((k) => hbRaw[k] !== hbRef.current[k])) hbRef.current = hbRaw;
  const hb = hbRef.current;
  // 빌런 B~E 의 **수**는 스팟(자리 목록)이 정본이고 슬롯 수가 따라간다(자리 단계에서 추가/삭제).
  const { setExtraCount } = hb;
  const extraSlots = hb.extra.length;
  useEffect(() => {
    if (extraSlots !== spot.extra.length) setExtraCount(spot.extra.length);
  }, [setExtraCount, extraSlots, spot.extra.length]);
  // 카드 그리드 → 스팟으로 단방향 반영. hb 가 정본이고 spot 은 그 그림자다.
  useEffect(() => {
    setSpot((s) => {
      const hero = hb.heroCards.map(cardId);
      const villain = hb.villainCards.map(cardId);
      const board = hb.boardCards.map(cardId);
      const extraIds = hb.extraCards.map((cs) => cs.map(cardId));
      // 슬롯 수가 스팟을 아직 못 따라온 순간(추가/삭제 직후)에는 그 자리를 건드리지 않는다 — 카드만 갱신
      const sameExtra = s.extra.every((v, i) => extraIds[i] === undefined || extraIds[i].join() === v.cards.join());
      if (s.hero.join() === hero.join() && s.villain.join() === villain.join() && s.board.join() === board.join() && sameExtra) return s;
      // 보드 장수가 바뀌면 스트리트도 따라간다 — 둘이 어긋나면 곧바로 blocker 다.
      const street: Street = board.length >= 5 ? 'river' : board.length >= 4 ? 'turn' : board.length >= 3 ? 'flop' : 'preflop';
      const extra = s.extra.map((v, i) => (extraIds[i] === undefined ? v : { ...v, cards: extraIds[i] }));
      return { ...s, hero, villain, board, street, extra };
    });
  }, [hb.heroCards, hb.villainCards, hb.boardCards, hb.extraCards]);

  const issues = useMemo(() => validateSpot(spot), [spot]);
  const blocked = hasBlocker(issues);

  // ⚠ 재계산 키는 **카드로** 잡는다. canonicalSpotKey 는 빌런 카드를 의도적으로 빼기 때문에
  //   그 키를 쓰면 ① 히어로→빌런 순서 입력에서 마지막 변화가 키를 안 건드려 아예 계산되지 않고
  //   ② 빌런만 바꾸면 이전 빌런 핸드의 승률이 그대로 남아 저장·공유된다(F11).
  //   상대마다 ';' 로 끝맺어 상대 수·누가 빈손인지까지 키에 든다(폴드로 빠지는 것도 키가 바뀐다).
  // 🔴 2026-09-22 요구 A — 여기 있던 **10,000회 멀티웨이 에퀴티 배선을 걷어냈다.**
  //   화면이 승률·필요 승률·팟오즈를 더 이상 보여 주지 않으므로(작성·저장·공유 중심으로 바뀌었다)
  //   그 수치를 만들려고 모바일에서 워커를 돌릴 이유가 없다. 입력을 한 글자 고칠 때마다
  //   2인 0.35s · 6인 1.0~1.4s 짜리 계산이 돌던 자리다.
  //   ⚠ 지운 것은 **이 화면의 호출**뿐이다. `equityClient`·`equityRequest`·워커·다른 GTO 도구
  //     (레인지 vs 레인지·아웃츠)는 그대로 살아 있다.
  //   ⚠ `evaluateSpot(spot)` 은 계속 돈다 — 저장·공유 스냅샷의 `coverage_kind`·`dataset_version`
  //     스키마 호환 때문이다(명세 §2.6). 그 결과를 화면에 다시 노출하지 않을 뿐이다.

  /** 저장한 스팟을 분석 탭으로 연다. '열기'와 '공유' 가 **같은 한 곳**을 지나야 상태 교체가 갈라지지 않는다. */
  const openSaved = useCallback((s: SpotReview) => {
    // ⚠ 카드 그리드(hb)와 리포트(spot)를 **같은 커밋에서** 함께 갈아끼운다(F10).
    //   hb 를 두고 setSpot 만 하면 그리드는 이전 스팟에 남고, 그 상태로 저장·공유하면
    //   이전 스팟의 에퀴티가 영구 스냅샷에 박힌다. 그 뒤 카드를 하나만 건드리면
    //   아래 동기화 이펙트가 돌아 **연 스팟의 카드가 이전 스팟으로 덮인다.**
    //   교체 직후 동기화 이펙트는 문자열 비교가 같아 early-return 하므로 s.street 는 보존된다.
    setSpot(s);
    hb.setAll({ hero: s.hero, villain: s.villain, board: s.board });
    // 작성 판은 새로 만든다(유지되는 판의 단계·확정 체크·저장 표시는 이전 스팟의 것이다).
    setAnalyzeKey((k) => k + 1);
    setSeen((v) => (v.has('analyze') ? v : new Set(v).add('analyze')));
    // 목록 자리는 기억하고, 새로 연 작성 판에는 옛 스크롤을 되살리지 않는다(여기는 늘 '내 스팟' 에서 온다).
    scrollMem.current = { mine: scrollBox(rootRef.current)?.scrollTop };
    setTab('analyze');
  }, [hb]);

  const evaluation = useMemo<SpotEvaluation>(
    () => evaluateSpot(spot, { heroEquity: null }),
    [spot],
  );

  // 두 판의 요소를 메모한다 — 탭만 바뀌면 React 가 판 전체를 건너뛰고 wrapper 의 hidden 만 바꾼다.
  //   (메모가 없으면 전환 한 번에 두 판이 다 다시 그려져 6x CPU 에서 클릭 프레임이 150ms 를 넘었다 — 실측)
  const analyzePane = useMemo(() => (
    <AnalyzeTab
      key={analyzeKey}
      spot={spot} patch={patch} hb={hb} issues={issues} blocked={blocked}
      evaluation={evaluation} savedAt={savedAt}
      user={user} toast={toast} shareIntent={shareIntent}
    />
  ), [analyzeKey, spot, patch, hb, issues, blocked, evaluation, savedAt, user, toast, shareIntent]);
  const mineActive = tab === 'mine';
  const minePane = useMemo(() => (
    // 계정이 바뀌면 새로 만든다 — 이전 계정의 행·코칭이 한 프레임도 남지 않게.
    <MySpotList
      key={user?.id ?? 'anon'}
      active={mineActive}
      onShare={(s) => { openSaved(s); setShareIntent((n) => n + 1); }}
      onOpen={openSaved}
      onNew={() => { setSeen((v) => (v.has('analyze') ? v : new Set(v).add('analyze'))); setTab('analyze'); }} />
  ), [user?.id, mineActive, openSaved]);

  return (
    // space-y-2: 탭 행 아래 12.75 → 8.5px (오너 2026-09-19 "탭 위아래 공백")
    <div ref={rootRef} className="space-y-2">
      {/* 탭을 직접 옮기면 '공유로 들어옴' 신호를 지운다 — 남아 있으면 작성 탭에 돌아올 때마다 확인 시트가 다시 열린다. */}
      <SpotHero tab={tab} onTab={(t) => { setShareIntent(0); switchTab(t); }} />

      {/* hidden(display:none) — 작성 판 안의 고정 하단 바([이전][다음])도 함께 숨는다. space-y 는 [hidden] 을 건너뛴다. */}
      {seen.has('analyze') && (
        <div hidden={tab !== 'analyze'} data-spot-pane="analyze">
          {analyzePane}
        </div>
      )}
      {seen.has('mine') && (
        <div hidden={tab !== 'mine'} data-spot-pane="mine">
          {minePane}
        </div>
      )}
    </div>
  );
}

/** 가장 가까운 세로 스크롤 상자 — 도구 창(Modal)이면 그 본문, 아니면 문서. */
function scrollBox(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return document.scrollingElement as HTMLElement | null;
}

// ── 대표 헤더 ────────────────────────────────────────────────────────────────
// Aura LED 는 여기 **한 곳만** 세게 준다. 아래 입력 카드들은 같은 강도로 빛나지 않는다
// (전부 빛나면 위계가 사라져 무엇이 중요한지 안 보인다).
function SpotHero({ tab, onTab }: { tab: SpotTab; onTab: (t: SpotTab) => void }) {
  return (
    <div className="relative overflow-visible">
      {/* 2026-09-18: 헤더 뒤 광역 블룸(인라인 radial-gradient 2겹)을 뺐다 — html.light·prefers-contrast·forced-colors 어디서도
          못 끄는 인라인 색이었고, 같은 헤더의 SpadeMark 가 이미 토큰 LED([data-aura] hero)를 갖는다. 발광은 한 곳이면 된다. */}
      <div className="flex items-center gap-3">
        <SpadeMark />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold tracking-tight text-ink-primary">NURI SPOT</h2>
          {/* 🔴 2026-09-18: 같은 문구가 세 곳에 있었다(TOOLS 데이터 · SpotHeroCard · 여기).
              화면에 보이던 둘을 같이 뺀다 — 한쪽만 지우면 "설명 없앤 목록 → 열면 같은 설명이 다시" 가 된다. */}
        </div>
      </div>
      {/* 내비 행 — 분석 | 내 스팟 | 게시판 토론 › 셋이 같은 행·같은 세로 중심·같은 글자 규격(t-tab).
          2026-09-14 실측(390px): '게시판 토론'이 소개 행(y 73.6, 11.7px)에, 탭은 아래 행(y 132.8, 12.75px)에 있어
          "위치가 다르다"(오너 지적)가 났다 — 탭을 오갈 때 좌표 자체는 같았고(분석·내 스팟 모두 동일), 다른 행·다른 규격이 원인.
          토론 탭은 없앴다(오너 지시 2026-09-11: "스팟 토론은 게시판에서 하게 해야 돼"). 대신 **가는 길**은 남긴다 —
          같은 행의 형제 버튼이지 세 번째 탭(role=tab·aria-selected·알약)이 아니다. 좁은 폭·200% 에서는 CTA 가 다음 줄로 내려간다
          (flex-wrap — 가로 스크롤·whitespace-nowrap 은 접근성 게이트에 걸려 쓰지 않는다). */}
      {/* mt-4(17px): 2026-09-24 오너 G1 "탭이 위 아이콘·제목에 너무 붙어 있다" — 8.5px → 17px */}
      <div data-testid="spot-primary-nav" className="mt-4 flex flex-wrap items-stretch gap-1.5">
        <SegmentedTabs
          items={[
            { key: 'analyze' as const, label: '스팟 작성' },   // 🔴 2026-09-22 요구 A: '분석' → 작성 중심
            { key: 'mine' as const, label: '내 스팟' },
          ]}
          value={tab} onChange={onTab} grow
          // 44px 히트 계약은 **자식 버튼의** ::before 로 지킨다 — 컨테이너에 걸면 버튼 히트는 그대로다(실측 27px).
          // 2026-09-19 오너 "탭 위아래 공백이 너무 크다": 시각 높이 44 → 34. 2026-09-24 알약 통일(design-reviewer 판정): 34 → 32,
          //   히트는 CHIP_HIT 와 같은 위아래 8px(gto/chip.ts) — 32 + 16 = 48. e2e nuri-spot.spec 뷰포트 매트릭스가 elementFromPoint 로 잰다.
          //   flex-[2_1_10rem]: 줄 배치용 basis 일 뿐 최소 폭이 아니라(200% 에서도 320px 을 밀지 않는다) 남는 폭을 탭이 가져간다.
          className="min-w-0 flex-[2_1_10rem] [&>button]:min-h-[32px] [&>button]:before:absolute [&>button]:before:inset-x-0 [&>button]:before:-inset-y-[8px] [&>button]:before:content-['']"
        />
        <button type="button" onClick={gotoBoard} data-testid="spot-board-link"
          className={`${CHIP_HIT} flex min-h-[32px] shrink-0 items-center justify-center gap-1 rounded-input border border-border-subtle bg-surface-high/60 px-2.5 t-tab font-semibold text-accent-200`}>
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
      {/* LED 는 토큰([data-aura] hero)으로 — 인라인 rgb 는 라이트·고대비·강제색에서 못 껐다(2026-09-18) */}
      <span data-aura data-aura-level="hero" data-aura-variant="violet" className="pointer-events-none absolute inset-0 rounded-full" />
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
  savedAt: number | null;
  user: ReturnType<typeof useAuth>['user'];
  toast: ReturnType<typeof useToast>;
}

const ALL_STEPS = STEPS.map((s) => s.key) as StepKey[];

function AnalyzeTab({ spot, patch, hb, issues, blocked, evaluation, savedAt, user, toast, shareIntent }: AnalyzeProps) {
  // 2026-09-19 오너: "들어가면 무조건 3번 카드·액션부터 나오는데 1번 게임부터 진행하게" — 예전엔 'cards' 하드코딩.
  // 저장 목록의 '공유'로 들어오면 확인 단계부터 — 공유 확인 시트는 그 단계의 리포트가 연다.
  const [step, setStep] = useState<StepKey>(shareIntent ? 'confirm' : 'game');
  /** 사용자가 [다음] 으로 **확정한** 단계만 체크한다(A안). 값이 기본값으로 채워져 있다고 체크하지 않는다. */
  const [confirmed, setConfirmed] = useState<ReadonlySet<StepKey>>(() => new Set(shareIntent ? ALL_STEPS : []));
  /** 마지막 저장(id·내용 키) — 확인 단계를 떠났다 와도 '저장됨'·AI 대상 id 가 남게 여기서 쥔다. */
  const [savedRef, setSavedRef] = useState<SavedRef | null>(null);
  /** '공유로 들어옴' 신호는 한 번만 쓴다 — 단계를 오가며 리포트가 다시 마운트될 때 시트가 또 열리면 안 된다. */
  const [intent, setIntent] = useState(shareIntent);
  const idx = STEPS.findIndex((s) => s.key === step);
  const cur = STEPS[idx] ?? STEPS[0];
  const go = (to: StepKey) => {
    setStep(to);
    setIntent(0);
    // 단계를 바꾸면 새 단계의 머리부터 보여 준다 — 긴 카드 단계 아래에서 [다음] 을 누르면 빈 화면 중간에 떨어졌다.
    requestAnimationFrame(() => document.querySelector('[data-spot-steps]')?.scrollIntoView({ block: 'nearest' }));
  };
  const next = () => {
    const to = STEPS[idx + 1]?.key;
    if (!to) return;
    setConfirmed((c) => new Set(c).add(step));
    go(to);
  };
  const prev = () => { const to = STEPS[idx - 1]?.key; if (to) go(to); };

  return (
    // 🔴 A안(2026-09-23): PC 2열(오른쪽 작성 내용 sticky)을 걷었다 — 작성 내용은 '확인' 단계에만 선다.
    //   폭은 ToolsPanel 의 max-w-2xl(714px) 고정이라 PC 도 한 열이 모바일과 같은 모양이다.
    <div className="min-w-0 space-y-3">
      <StepBar step={step} onStep={go} confirmed={confirmed} />
      <p className="text-2xs text-ink-muted">{cur.hint}</p>

      {step === 'game' && (
        // 한 카드 안에 게임(위) · 자리·스택(아래) — 가는 선 하나로 두 묶음을 가른다.
        <div className="rounded-aura border card-aura p-3">
          <GameStep spot={spot} patch={patch} />
          <div className="my-2.5 border-t border-border-subtle" />
          <SeatStep spot={spot} patch={patch} />
        </div>
      )}
      {step === 'cards' && (
        <HandBoardPicker
          hb={hb}
          villainLabels={[spot.villainPos, ...spot.extra.map((v) => v.pos)]}
          hint={<>보드는 플랍 3장부터 리버 5장까지 — 지금은 <b className="text-ink-secondary">{streetLabel(spot.street)}</b>{spot.extra.length > 0 && <> · 카드를 모르는 상대는 비워 두세요(무작위 핸드로 계산)</>}</>}
        />
      )}
      {step === 'action' && (
        <div className="space-y-3">
          <ActionTimeline spot={spot} patch={patch} />
          <ChoiceStep spot={spot} patch={patch} />
        </div>
      )}
      {step === 'confirm' && (
        <SpotReport
          spot={spot} evaluation={evaluation} blocked={blocked} shareIntent={intent}
          user={user} toast={toast} savedRef={savedRef} onSaved={setSavedRef}
        />
      )}

      <IssueList issues={issues} />
      {/* 자리는 **항상** 잡아 둔다(GTO-TOOL-OPEN-JANK 2026-09-24) — 열고 400ms 뒤 첫 자동저장이 이 줄을 끼워 넣어
          본문이 439→468px 로 한 번 더 늘었다(열기 모션 중 두 번째 계단). 글자만 나중에 채운다. */}
      <p className="min-h-[1lh] text-2xs text-ink-muted" aria-live="polite" data-testid="spot-saved-line">
        {savedAt !== null && (
          <><Icon name="check" size={11} className="mr-1 inline-block align-[-1px]" />임시 저장됨 — 나갔다 와도 그대로입니다</>
        )}
      </p>

      {/* 하단 고정 [이전][다음] — 전체화면 도구 창(Modal page, z-55)이 탭바(z-50)를 덮으므로 **창의 바닥**에 붙는다.
          sticky 는 내용이 짧은 단계(카드 390px)에서 바닥까지 못 내려갔다(실측 bottom 788/844) — fixed 로 둔다.
          창(fixed inset-0)이 곧 컨테이닝 블록이라 끌어내리기(transform) 중에도 창과 함께 움직인다.
          아래 자리표시가 바의 높이만큼 본문 끝을 비워 마지막 줄이 가려지지 않게 한다. */}
      <div aria-hidden className="h-[calc(2rem+env(safe-area-inset-bottom))]" />
      <nav aria-label="단계 이동" data-spot-stepnav
        className="fixed inset-x-0 bottom-0 z-10 border-t border-border-subtle bg-surface-base pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
        <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-1.5 px-page-x">
          <button type="button" onClick={prev} disabled={idx === 0}
            className="btn-ghost min-h-[44px] text-xs disabled:opacity-40">
            <Icon name="chevron-left" size={13} className="mr-0.5 inline-block align-[-2px]" aria-hidden />이전
          </button>
          {idx < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="btn-primary min-h-[44px] text-xs">
              다음 · {STEPS[idx + 1].label}<Icon name="chevron-right" size={13} className="ml-0.5 inline-block align-[-2px]" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={() => go('game')} className="btn-ghost min-h-[44px] text-xs">처음 단계로</button>
          )}
        </div>
      </nav>
    </div>
  );
}

/**
 * 단계 바 — 현재 단계와 완료 상태를 함께 보여준다.
 *
 * 2026-09-19 오너: "우측으로 스크롤해야 끝까지 간다 → pill 말고 버튼식". 예전엔 알약 칩 4개(합 340.7px)를
 * `overflow-x-auto` 에 두어 360px(폭 326)에서 15px 넘쳐 스크롤이 났다. 이제 4칸 그리드 — 폭이 곧 칸이라
 * 어느 폭에서도 가로 스크롤이 0 이고(e2e 접근성 게이트도 clientWidth<scrollWidth 를 잘림으로 본다),
 * 번호와 라벨을 두 줄로 쌓아 360px 칸(81.5px)에 '자리·스택' 이 들어간다.
 */
function StepBar({ step, onStep, confirmed }: { step: StepKey; onStep: (s: StepKey) => void; confirmed: ReadonlySet<StepKey> }) {
  // 🔴 A안: 체크는 **사용자가 [다음] 으로 확정한 단계**에만. 예전엔 값으로 추정해서(게임=항상 true)
  //   아무것도 안 했는데 1번에 체크가 붙어 있었다.
  return (
    <div className="grid grid-cols-4 gap-1" role="group" aria-label="입력 단계" data-spot-steps>
      {STEPS.map((s, i) => {
        const on = s.key === step;
        return (
          <button
            key={s.key} type="button" aria-current={on ? 'step' : undefined}
            onClick={() => onStep(s.key)}
            className={['flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-input border px-1 py-1 text-2xs font-bold transition-colors',
              on ? 'border-accent-300 bg-accent-300 text-white'
                : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}
          >
            {/* 체크는 번호 옆 — 라벨 줄에 두면 320px 좁은 칸에서 라벨이 밀려 넘친다. */}
            <span className={['flex items-center gap-0.5 tabular-nums', on ? 'text-white/80' : 'text-ink-muted'].join(' ')}>
              {i + 1}
              {confirmed.has(s.key) && <Icon name="check" size={10} className={['shrink-0', on ? 'text-white' : 'text-emerald-400'].join(' ')} aria-label="완료" />}
            </span>
            {/* '·' 뒤에서만 접힌다 — 좁은 칸에서 '게임·' / '자리' 두 줄 */}
            <span className="max-w-full break-keep text-center leading-tight">
              {s.label.split('·').map((part, k) => <span key={k}>{k > 0 && <>·<wbr /></>}{part}</span>)}
            </span>
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
    <div className="flex flex-col items-stretch gap-1 py-0.5">
      <span className="shrink-0 text-xs font-medium text-ink-secondary">{label}</span>
      <div className={['flex min-w-0 items-center gap-1.5', wrap ? 'flex-wrap' : ''].join(' ')}>{children}</div>
    </div>
  );
}

/**
 * 라벨과 컨트롤을 **한 줄**에 — 게임 단계(형식·인원·앤티)처럼 컨트롤이 짧은 행.
 * 2026-09-19 오너 "버튼 위아래 갭이 너무 크다": Row 는 라벨을 위에 올려 행이 65.75px(칩 36 + 라벨 17 + 갭)이고
 * 칩 줄 사이가 29.75px 이었다(390px 실측). 가로 배치면 행이 칩 높이(36)로 끝나고 칩 사이는 space-y 만 남는다.
 */
function RowInline({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[32px] items-center justify-between gap-3">
      <span className="shrink-0 text-xs font-medium text-ink-secondary">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">{children}</div>
    </div>
  );
}

function Pick<T extends string | number>({ value, options, onChange, fmt, end = false }: {
  value: T; options: readonly T[]; onChange: (v: T) => void; fmt?: (v: T) => string;
  /** RowInline 안에서 칩을 오른쪽에 붙인다 */
  end?: boolean;
}) {
  // 현재 값이 선택지에 없으면(옛 초안의 앤티 등) 마지막 칩으로 보여 준다 — 값을 접거나 버리지 않는다.
  // '' 는 '아직 미선택'(heroAction null) 이라 칩을 만들지 않는다.
  const shown = options.includes(value) || value === '' ? options : [...options, value];
  // 줄바꿈 허용(flex-wrap). Row 가 라벨을 위로 올려 전폭을 쓰므로 360px 에서 유효 스택·이번에 추가는 1줄이고,
  // 자리 칩 10개(10인)만 2줄이 된다 — 균형 잡힌 줄바꿈이라 받아들인다. 한 줄 가로 스크롤은 시도했다가 철회했다:
  // e2e 접근성 게이트(가로 잘림 0·가로 스크롤 0)가 clientWidth < scrollWidth 를 잘림으로 보고 200% 확대에선 통과 불가.
  // 같은 이유로 whitespace-nowrap 도 두지 않는다(칩 안에서 글자가 접혀야 320px·200% 를 지난다).
  // ⚠ gap-y-3.5(14.875px): 두 줄이 될 때 CHIP_HIT 위아래 확장(7+7)이 겹치지 않게. 옛 설명 — `.tap-y-44` 의 위아래 6px 확장이 겹치지 않게(gap-1 이면 실효 터치가 줄어든다).
  return (
    <div className={['flex min-w-0 flex-1 flex-wrap gap-x-1 gap-y-3.5', end ? 'justify-end' : ''].join(' ')}>
      {shown.map((o) => (
        <button key={String(o)} type="button" aria-pressed={o === value} onClick={() => onChange(o)}
          // 보이는 32px · 누르는 44px(CHIP_HIT) — 2026-09-24 전: 36px · 실효 46px
          // 2026-09-25 스윕: 사이징 칩 '2'·'3'·'4' 가 가로 26~29px 라 min-w-[44px] — 가로도 44. 이웃과 gap-x-1 이라 가로 확장은 겹쳐서 못 쓴다.
          className={[CHIP_HIT, 'min-h-[32px] min-w-[44px] rounded-input border px-2 text-2xs font-bold transition-colors',
            o === value ? 'border-accent-300 bg-accent-300 text-white'
              : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
          {fmt ? fmt(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

/** 테이블 인원 2~10 — 네이티브 select 한 줄(오너 2026-09-19 "2~10인 선택 가능하게 해서 그 칸 자체를 한 줄로"). */
const TABLE_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function GameStep({ spot, patch }: { spot: SpotReview; patch: (p: Partial<SpotReview>) => void }) {
  return (
    // space-y-2: 세 행이 각각 컨트롤 높이로 끝난다. 카드 껍데기는 부모(게임·자리 단계)가 쥔다.
    <div className="space-y-2">
      {/* 2026-09-24 오너 G2: '형식' → '게임 종류', '대회' → '토너먼트'. 저장값('mtt'|'cash')은 그대로 — 표시만. */}
      <RowInline label="게임 종류">
        <Pick end value={spot.format} options={['mtt', 'cash'] as const}
          onChange={(v) => patch({ format: v })} fmt={(v) => (v === 'mtt' ? '토너먼트' : '캐시')} />
      </RowInline>
      <RowInline label="테이블 인원">
        <select
          value={spot.tableSize} aria-label="테이블 인원"
          onChange={(e) => {
            const v = Number(e.target.value);
            const seats = positionsFor(v);
            const heroPos = seats.includes(spot.heroPos) ? spot.heroPos : seats[seats.length - 3] ?? seats[0];
            const villainPos = seats.includes(spot.villainPos) ? spot.villainPos : seats[seats.length - 1];
            // 인원이 줄어 사라진 자리·새로 겹치게 된 자리의 빌런 B~E 는 뺀다 — 남기면 곧바로 blocker 다
            const used = new Set<SpotPosition>([heroPos, villainPos]);
            const extra = spot.extra.filter((x) => {
              if (!seats.includes(x.pos) || used.has(x.pos)) return false;
              used.add(x.pos);
              return true;
            });
            patch({ tableSize: v, heroPos, villainPos, extra });
          }}
          className="input min-h-[44px] w-24 shrink-0 text-right"
        >
          {TABLE_SIZES.map((n) => <option key={n} value={n}>{n}인</option>)}
        </select>
      </RowInline>
      <RowInline label="BB 앤티">
        {/* BB 한 명이 대표로 내는 총액(2026-09-14 오너 확정). 옛 초안의 0.125/0.25 는 칩이 안 눌린 채 값만 남는다. */}
        <Pick end value={spot.anteBb} options={[0, 0.5, 1]}
          onChange={(v) => patch({ anteBb: v })} fmt={(v) => (v === 0 ? '없음' : `${v}BB`)} />
      </RowInline>
    </div>
  );
}

function SeatStep({ spot, patch }: { spot: SpotReview; patch: (p: Partial<SpotReview>) => void }) {
  const seats = positionsFor(spot.tableSize);
  const canAdd = spot.extra.length < MAX_EXTRA_VILLAINS && spot.extra.length + 2 < seats.length;
  /** 아직 아무도 안 앉은 자리 — 새 상대의 기본 자리. 뒤(블라인드 쪽)부터 준다. */
  const freeSeat = (): SpotPosition | null => {
    const used = new Set<SpotPosition>([spot.heroPos, spot.villainPos, ...spot.extra.map((v) => v.pos)]);
    return [...seats].reverse().find((p) => !used.has(p)) ?? null;
  };
  const addVillain = () => {
    const pos = freeSeat();
    if (!pos) return;
    patch({ extra: [...spot.extra, { pos, cards: [] }] });
  };
  const removeVillain = (i: number) => {
    const gone = spot.extra[i]?.pos;
    patch({
      extra: spot.extra.filter((_, k) => k !== i),
      // 그 사람의 액션도 같이 뺀다 — 없는 사람의 칩이 팟에 남으면 콜 금액이 틀린다
      actions: spot.actions.filter((a) => !(a.actor === 'villain' && a.pos === gone)),
    });
  };
  return (
    // space-y-1: 칩 줄 아래 → 다음 라벨 8.5px(Row py-0.5 ×2 + 4.25). 칩 히트(아래 6px)가 다음 라벨까지만 닿는다.
    <div className="space-y-1">
      <Row label="내 자리">
        <Pick value={spot.heroPos} options={seats} onChange={(v) => patch({ heroPos: v as SpotPosition })} />
      </Row>
      <Row label={spot.extra.length > 0 ? '상대 A 자리' : '상대 자리'}>
        <Pick value={spot.villainPos} options={seats} onChange={(v) => patch({ villainPos: v as SpotPosition })} />
      </Row>
      {/* 빌런 B~E (오너 2026-09-19 "빌런 A~E 총 5개 · 모든 빌런의 포지션을 선택"). 자리가 겹치면 validateSpot 이 blocker 로 말한다. */}
      {spot.extra.map((v, i) => (
        <Row key={i} label={`상대 ${EXTRA_LETTERS[i]} 자리`} wrap>
          <Pick value={v.pos} options={seats}
            onChange={(p) => patch({ extra: spot.extra.map((x, k) => (k === i ? { ...x, pos: p as SpotPosition } : x)) })} />
          <button type="button" onClick={() => removeVillain(i)} aria-label={`상대 ${EXTRA_LETTERS[i]} 삭제`}
            className={`${CHIP_HIT} flex h-[32px] shrink-0 items-center gap-1 rounded-input border border-border-default px-2 text-2xs font-semibold text-ink-muted transition-colors hover:text-danger`}>
            <Icon name="close" size={12} aria-hidden />빼기
          </button>
        </Row>
      ))}
      {canAdd && (
        <button type="button" onClick={addVillain} className="btn-ghost mt-1 min-h-[44px] w-full text-xs">
          <Icon name="plus" size={13} className="mr-1 inline-block align-[-2px]" aria-hidden />상대 추가 (빌런 {EXTRA_LETTERS[spot.extra.length]})
        </button>
      )}
      {/* 유효 스택은 직접 입력만(오너 2026-09-19 "10BB·20BB 프리셋 말고 직접 입력으로만"). 같은 patch 경로다. */}
      <Row label="유효 스택">
        <input
          type="number" inputMode="decimal" min={1} step={0.5} value={spot.effectiveBb}
          onChange={(e) => patch({ effectiveBb: Number(e.target.value) })}
          className="input min-h-[44px] w-28 text-right" aria-label="유효 스택 BB 직접 입력"
        />
        <span className="text-2xs text-ink-muted">BB</span>
      </Row>
    </div>
  );
}

/** 액션 타임라인 — 긴 텍스트 한 칸 대신 **추가 가능한 행**. 구조가 곧 분석 입력이다. */
/** '누가' 칩의 키 — 'hero' · 'villain'(빌런 A) · 'x0'~'x3'(빌런 B~E, extra 인덱스). */
type WhoKey = 'hero' | 'villain' | `x${number}`;
const extraIndex = (w: WhoKey): number | null => (w.startsWith('x') ? Number(w.slice(1)) : null);

function ActionTimeline({ spot, patch }: { spot: SpotReview; patch: (p: Partial<SpotReview>) => void }) {
  const [whoRaw, setWho] = useState<WhoKey>('villain');
  const [type, setType] = useState<SpotActionType>('raise');
  const [size, setSize] = useState<number>(2.5);
  const sized = type === 'call' || type === 'bet' || type === 'raise';
  const presets = spot.street === 'preflop' ? SIZE_PRESETS.pre : SIZE_PRESETS.post;
  // 상대 A · B~E · 나. 빼기로 사라진 상대를 가리키던 선택은 A 로 돌린다.
  const whoOptions: WhoKey[] = ['villain', ...spot.extra.map((_, i) => `x${i}` as WhoKey), 'hero'];
  const who: WhoKey = whoOptions.includes(whoRaw) ? whoRaw : 'villain';
  const xi = extraIndex(who);
  const whoPos: SpotPosition = who === 'hero' ? spot.heroPos : xi === null ? spot.villainPos : spot.extra[xi].pos;
  const whoLabel = (w: WhoKey) => {
    if (w === 'hero') return `나 (${spot.heroPos})`;
    const i = extraIndex(w);
    if (i === null) return spot.extra.length > 0 ? `상대 A (${spot.villainPos})` : `상대 (${spot.villainPos})`;
    return `상대 ${EXTRA_LETTERS[i]} (${spot.extra[i]?.pos ?? '?'})`;
  };
  // 돈 계산은 한 벌만 둔다 — 예전에는 여기 사본(spotSizing.investedSoFar)이 있었다.
  // investedByPos 는 반올림하지 않으므로 **표시할 때** 자릿수를 맞춘다.
  const already = Math.round(investedByPos(spot, whoPos) * 100) / 100;
  const totalAfter = Math.round((already + (Number.isFinite(size) ? size : 0)) * 100) / 100;

  const add = () => {
    const a: SpotAction = {
      street: spot.street,
      actor: who === 'hero' ? 'hero' : 'villain',
      ...(xi !== null ? { pos: spot.extra[xi].pos } : {}),   // B~E 만 자리를 싣는다 — A 는 villainPos 가 정본
      type,
      ...(sized ? { sizeBb: size } : {}),
    };
    patch({ actions: [...spot.actions, a] });
  };
  const removeAt = (i: number) => patch({ actions: spot.actions.filter((_, n) => n !== i) });

  // 스트리트별로 묶어 보여준다 — 순서가 눈에 보여야 입력이 맞았는지 안다.
  const grouped = (['preflop', 'flop', 'turn', 'river'] as Street[])
    .map((st) => ({ st, rows: spot.actions.map((a, i) => ({ a, i })).filter((x) => x.a.street === st) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="rounded-aura border card-aura p-3">
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
                      {actorPos(spot, a)}
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
      <div className="mt-2.5 space-y-1 border-t border-border-subtle pt-2.5">
        <Row label="누가">
          <Pick value={who} options={whoOptions} onChange={setWho} fmt={whoLabel} />
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
            {already > 0 && <> — {whoLabel(who)}가 이미 낸 {already}BB 포함</>}
          </p>
        )}
        <button type="button" onClick={add} className="btn-ghost mt-1 min-h-[44px] w-full text-xs">
          <Icon name="plus" size={13} className="mr-1 inline-block align-[-2px]" />액션 추가
        </button>
      </div>
    </div>
  );
}

// 🔴 VerdictLine(내 선택 아래 판정 한 줄)은 2026-09-22 요구 A 로 제거했다.
//   오너: 이 화면은 옳고 그름을 판정하는 곳이 아니라 **작성·저장·공유** 하는 곳이다.
//   판정 엔진(`evaluateSpot`)과 트레이너 도구는 그대로 살아 있다 — 이 자리의 표시만 없앴다.

function ChoiceStep({ spot, patch }: {
  spot: SpotReview; patch: (p: Partial<SpotReview>) => void;
}) {
  const sized = spot.heroAction === 'call' || spot.heroAction === 'bet' || spot.heroAction === 'raise';
  return (
    <div className="rounded-aura border card-aura p-3">
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
