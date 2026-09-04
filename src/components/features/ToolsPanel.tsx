import { useEffect, useLayoutEffect, useRef, useState, Suspense, type ReactNode } from 'react';
import { lazyWithReload } from '../../lib/lazyWithReload';
import Modal from '../atoms/Modal';
import Icon, { type IconName } from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import { shareOrCopy } from '../../lib/calendar';
import { useTrainerProgress } from '../../lib/trainerProgress';
import { useDrillPlan } from './tools/drillPlan';
import { useAuth } from '../../contexts/AuthContext';
import { promptLogin } from '../../lib/requireLogin';
import { goSubTab } from '../../lib/subTabTransition';
import ICMCalculator from './ICMCalculator';
import PotOddsCalc from './tools/PotOddsCalc';
import ChipDistributor from './tools/ChipDistributor';
import StructureSim from './tools/StructureSim';
import RangeGuide from './tools/RangeGuide';
import PreflopTrainer from './tools/PreflopTrainer';
import OutsCalc from './tools/OutsCalc';
import PushFoldChart from './tools/PushFoldChart';
import { SprCalc, EvCalc, MzoneCalc, BankrollCalc, VarianceCalc } from './tools/StackCalcs';
import { PayoutCalc, EndTimeCalc, ComboCalc } from './tools/MoreCalcs';
import { MdfCalc, AggroChart, RangeMatrix } from './tools/AdvancedCalcs';
import PostflopTrainer from './tools/PostflopTrainer';
import BlindBuilder from './tools/BlindBuilder';
import GlossaryPanel from './tools/GlossaryPanel';
import DealCalc from './tools/DealCalc';
import DailyDrill from './tools/DailyDrill';
import WrongNote, { type PushJump, type RangeJump } from './tools/WrongNote';
import { RANGE_SCENARIOS } from '../../lib/ranges.data';

// GTO 패널·핸드 리플레이어는 에퀴티 엔진을 포함해 무거우므로 지연 로드
import { clearSnap, readSnap } from '../../lib/snapshot';
import type { DeepGtoInit } from './gto/useDeepGto';
import type { HandReviewInit } from './gto/HandReviewTool';
const GtoDeepPanel = lazyWithReload(() => import('./gto/GtoDeepPanel'));
const HandReviewTool = lazyWithReload(() => import('./gto/HandReviewTool'));

type ToolKey = 'drill' | 'gto' | 'replay' | 'pot' | 'icm' | 'range' | 'trainer' | 'postflop' | 'wrongnote' | 'mdf' | 'aggro' | 'rvr' | 'outs' | 'pushfold' | 'spr' | 'ev' | 'mzone' | 'bankroll' | 'variance' | 'blindgen' | 'chip' | 'sim' | 'payout' | 'endtime' | 'combo' | 'glossary' | 'deal';
/** 5레인 IA — 차트 / 트레이닝 / 분석 / 계산기 / 매장운영.
 *  오너 피드백(2026-09-02): "차트를 보고 싶은데 문제가 나온다" — 예전엔 '학습' 한 레인에 차트와 퀴즈가 섞여
 *  첫 카드가 '오늘의 드릴'(퀴즈)이었다. 보는 것(차트)과 푸는 것(트레이닝)을 레인으로 갈라 차트를 맨 앞에 둔다. */
type ToolCat = 'chart' | 'learn' | 'analyze' | 'calc' | 'ops';

/** desc = 카드 한 줄(≤13자 완결형 명사구, 2026-09-03 개고) · keywords = 개고 전 설명(검색 재현율 보존용, 화면엔 안 그림)
 *  icon = lucide 팩 이름(2026-09-03 오너 "아이콘팩에서 최대한 잘 맞는 걸로" — 손그림 SVG 26개를 Icon 아톰으로 통일).
 *  ⚠ 26개 도구는 서로 다른 아이콘이어야 한다 — ToolsPanel.icons.test.ts 가 게이트. */
const TOOLS: { key: ToolKey; cat: ToolCat; name: string; desc: string; keywords?: string; icon: IconName }[] = [
  // ── 학습 — 차트·트레이너 ──
  { key: 'drill', cat: 'learn', name: '오늘의 드릴', desc: '약한 부분만 하루 5문제', keywords: '약점 기반 하루 5문제', icon: 'target' },
  { key: 'range', cat: 'chart', name: '프리플랍 레인지 차트', desc: '포지션별 시작 핸드 기준표', keywords: '9인·6맥스 포지션별 오픈·3벳·수비·vs 3벳', icon: 'grid-3x3' },
  { key: 'pushfold', cat: 'chart', name: '푸시 · 폴드 차트', desc: '칩 적을 때 올인 기준표', keywords: '자체 Nash · 셔브·콜 레인지', icon: 'arrow-up-from-line' },
  { key: 'trainer', cat: 'learn', name: '프리플랍 트레이너', desc: '오픈과 올인 판단 연습', keywords: '오픈·셔브 맞히기, 오답 노트', icon: 'dumbbell' },
  { key: 'postflop', cat: 'learn', name: '포스트플랍 트레이너', desc: '실전 상황 퀴즈와 해설', keywords: '실전 상황 퀴즈·해설', icon: 'brain' },
  // 오답 노트(2026-09-03, GKR-2 잔여분) — 두 트레이너의 오답 큐를 목록으로. 아이콘 = lucide book-x
  { key: 'wrongnote', cat: 'learn', name: '오답 노트', desc: '틀린 핸드 모아 다시 풀기', keywords: '오답 목록 · 차트에서 보기 · 다시 풀기', icon: 'book-x' },
  { key: 'aggro', cat: 'chart', name: '어그레션 차트', desc: '포지션별 공격 권장 빈도', keywords: '포지션별 권장 빈도', icon: 'swords' },
  { key: 'glossary', cat: 'learn', name: '홀덤 용어사전', desc: '74개 용어 검색과 뜻풀이', keywords: '용어 74개 · 한글 설명·검색', icon: 'book-a' },
  // ── 분석 — 핸드·레인지 에퀴티 ──
  { key: 'replay', cat: 'analyze', name: '핸드 리플레이어', desc: '지난 판 복기와 승률 흐름', keywords: '그 핸드 복기 · 승률 추이·아웃', icon: 'clapperboard' },
  { key: 'gto', cat: 'analyze', name: 'GTO 핸드 분석', desc: '내 패 승률과 최선의 선택', keywords: '프리/포스트플랍 승률·전략', icon: 'scan-search' },
  { key: 'rvr', cat: 'analyze', name: '레인지 vs 레인지', desc: '양쪽 패 범위의 승률 비교', keywords: '레인지 간 에퀴티 매트릭스', icon: 'git-compare' },
  // ── 계산기 — 수치 판단 ──
  { key: 'pot', cat: 'calc', name: '팟 오즈 계산기', desc: '콜에 필요한 최소 승률', keywords: '콜에 필요한 승률 계산', icon: 'percent' },
  { key: 'outs', cat: 'calc', name: '아웃츠 / 확률', desc: '카드만 넣으면 완성될 확률', keywords: '카드만 넣으면 아웃 자동 계산', icon: 'dice' },
  { key: 'mdf', cat: 'calc', name: 'MDF · 블러프 계산기', desc: '벳 크기별 최소 방어 비율', keywords: '수비 빈도·블러프 비율', icon: 'shield-check' },
  { key: 'icm', cat: 'calc', name: 'ICM 계산기', desc: '지금 내 칩의 상금 가치', keywords: '토너먼트 기대 상금', icon: 'trophy' },
  { key: 'deal', cat: 'calc', name: '딜 계산기', desc: '남은 사람끼리 상금 분배', keywords: 'ICM 딜 vs 칩찹 분배 비교', icon: 'handshake' },
  { key: 'spr', cat: 'calc', name: 'SPR 계산기', desc: '팟 대비 내 칩 비율', keywords: '스택 대 팟 비율', icon: 'scale' },
  { key: 'ev', cat: 'calc', name: 'EV 계산기', desc: '이 선택의 장기 기대값', keywords: '기대값 손익 판단', icon: 'sigma' },
  { key: 'combo', cat: 'calc', name: '콤보 계산기', desc: '그 패가 나올 경우의 수', keywords: '핸드·레인지 콤보 수', icon: 'layers' },
  { key: 'mzone', cat: 'calc', name: 'M존 계산기', desc: '내 칩으로 버틸 바퀴 수', keywords: '토너 생존 압박 지수', icon: 'gauge' },
  { key: 'bankroll', cat: 'calc', name: '뱅크롤 관리', desc: '게임별 권장 참가비 배수', keywords: '바인 대비 자금 권장선', icon: 'piggy-bank' },
  { key: 'variance', cat: 'calc', name: '분산 시뮬', desc: '운 나쁠 때 잃을 폭 예측', keywords: 'ROI·표본 → 파산 확률', icon: 'trending-up-down' },
  // ── 매장 운영 ──
  { key: 'chip', cat: 'ops', name: '칩 분배기', desc: '1인 스택 구성과 총 칩 수', keywords: '스택 구성·총 칩 수', icon: 'coins' },
  { key: 'sim', cat: 'ops', name: '구조 시뮬', desc: '레벨별 평균 스택 깊이', keywords: '총 칩·평균 스택 깊이', icon: 'chart' },
  { key: 'blindgen', cat: 'ops', name: '블라인드 생성기', desc: '레지 마감에 맞춘 레벨표', keywords: '구조 자동 생성·표', icon: 'list-ordered' },
  { key: 'payout', cat: 'ops', name: '상금 분배', desc: '인원 넣으면 등수별 배분표', keywords: '총 상금·인원 → 분배표', icon: 'chart-pie' },
  { key: 'endtime', cat: 'ops', name: '종료시간 예측', desc: '브레이크 포함 끝나는 시각', keywords: '레벨·브레이크 → 종료 시각', icon: 'hourglass' },
];

/** 3레인 소제목 — 접이식 금지(로드맵 FIX: 접이 헤더는 모바일 회귀). 항상 펼쳐진 섹션.
 *  §7 ⑥b: '매장 운영' 레인은 GTO 탭에서 빠져 내 매장(StoreToolsPanel)으로 이관 —
 *  카탈로그에서만 숨기고 TOOLS/renderTool 에는 남겨 #tool= 딥링크·공유 하위호환을 지킨다.
 *  icon = 섹션 소제목 앞 글리프(즐겨찾기 헤더의 star-fill 과 같은 문법) — 도구 아이콘과 겹치지 않는 이름. */
const LANES: { id: ToolCat; label: string; desc: string; icon: IconName }[] = [
  { id: 'chart', label: '차트', desc: '보고 외우는 표준 레인지', icon: 'table' },
  { id: 'learn', label: '트레이닝', desc: '퀴즈로 맞히고 오답 노트', icon: 'graduation-cap' },
  { id: 'analyze', label: '분석', desc: '핸드·레인지 에퀴티 실계산', icon: 'microscope' },
  { id: 'calc', label: '계산기', desc: '실전 수치 판단', icon: 'calculator' },
];
// eslint-disable-next-line react-refresh/only-export-components -- 이관 레지스트리 공유(§7 ⑥b)
export const STORE_TOOL_KEYS = ['chip', 'sim', 'blindgen', 'payout', 'endtime'] as const;
const STORE_SET = new Set<ToolKey>(STORE_TOOL_KEYS);
/** 레인 칩 진열 순서 — 하위 탭 전환 방향(forward/back) 기준. 화면에 놓인 차례 그대로. */
const LANE_ORDER = ['all', ...LANES.map((l) => l.id)] as (ToolCat | 'all')[];

// 트레이너류는 '퀴즈' 뉘앙스(맞히기), 나머지 계산기·차트류는 '도구' 뉘앙스로 라벨링.
const QUIZ_KEYS = new Set<ToolKey>(['drill', 'range', 'pushfold', 'trainer', 'postflop', 'wrongnote']);

function renderTool(k: ToolKey): ReactNode {
  switch (k) {
    // '결과 먼저': 빈 폼 대신 직전 입력(스냅샷) 또는 대표 데모 핸드(AKs vs QQ)로 진입 즉시 결과.
    case 'gto': {
      const saved = readSnap<DeepGtoInit>('tool:gto');
      const hasSaved = !!(saved && ((saved.hero?.length ?? 0) + (saved.villain?.length ?? 0) > 0));
      const demo: DeepGtoInit = {
        hero: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 's' }],
        villain: [{ rank: 'Q', suit: 'h' }, { rank: 'Q', suit: 'd' }],
      };
      return <GtoDeepPanel initialState={hasSaved ? saved! : demo} />;
    }
    // 핸드 리플레이어도 같은 문법 — 직전 복기(스냅샷)가 있으면 그 핸드로, 없으면 도구 자체의 데모 핸드로.
    case 'replay': return <HandReviewTool initial={readSnap<HandReviewInit>('tool:replay') ?? undefined} />;
    case 'drill': return <DailyDrill />;
    case 'pot': return <PotOddsCalc />;
    case 'icm': return <ICMCalculator />;
    // 2026-09-03 오너 지시로 상단 바로가기 칩 제거 — 그룹 선택은 차트 안(RangeGuide 의 RANGE_GROUPS 칩)에 그대로 있어 기능 소실 0.
    // RangeGuide 의 initialGroup prop(기본 rfi9)은 손대지 않았다 — 다시 필요하면 여기 한 줄.
    // 오답 노트 '차트에서 보기' 는 tool:range / tool:pushfold 스냅샷으로 시나리오·셀을 넘긴다 — 1회성이라
    // 열린 뒤 이펙트가 지운다(tool:gto 와 달리 24h 동안 강조가 들러붙으면 안 된다). 아래 ToolsPanel 의 [active] 이펙트 참고.
    case 'range': { const j = readSnap<RangeJump>('tool:range'); return <RangeGuide initialScenId={j?.scenId} highlight={j?.hand} />; }
    case 'trainer': return <PreflopTrainer />;
    case 'postflop': return <PostflopTrainer />;
    case 'wrongnote': return <WrongNote />;
    case 'mdf': return <MdfCalc />;
    case 'aggro': return <AggroChart />;
    case 'rvr': return <RangeMatrix />;
    case 'outs': return <OutsCalc />;
    case 'pushfold': { const j = readSnap<PushJump>('tool:pushfold'); return <PushFoldChart initialK={j?.k} initialStack={j?.stack} initialAnte={j?.ante} initialView={j?.view} highlight={j?.hand} />; }
    case 'spr': return <SprCalc />;
    case 'ev': return <EvCalc />;
    case 'mzone': return <MzoneCalc />;
    case 'bankroll': return <BankrollCalc />;
    case 'variance': return <VarianceCalc />;
    case 'payout': return <PayoutCalc />;
    case 'endtime': return <EndTimeCalc />;
    case 'combo': return <ComboCalc />;
    case 'chip': return <ChipDistributor />;
    case 'sim': return <StructureSim />;
    case 'blindgen': return <BlindBuilder />;
    case 'glossary': return <GlossaryPanel />;
    case 'deal': return <DealCalc />;
    default: return null;
  }
}

// ── 내 매장 이관용 공개 API(§7 ⑥b) — 레지스트리·렌더러를 재사용해 중복 정의 0 ──
export type StoreToolKey = (typeof STORE_TOOL_KEYS)[number];
// eslint-disable-next-line react-refresh/only-export-components -- 이관 레지스트리 공유(관행: CommentThread groupThreads)
export const getStoreTools = () => TOOLS.filter((t) => STORE_SET.has(t.key)) as { key: StoreToolKey; name: string; desc: string; icon: IconName }[];
// eslint-disable-next-line react-refresh/only-export-components
export const renderStoreTool = (k: StoreToolKey): ReactNode => renderTool(k);

/** 도구 모음 — 4레인(학습/분석/계산기/매장운영) 카탈로그 + 카드형 런처.
 *  누르면 "그 카드 행 아래 인라인"이 아니라 **전체화면 페이지**로 연다.
 *  (인라인 방식은 중간 카드를 누르면 위에 런처가 그대로 남아, 열린 도구를 찾아 내려가야 했다 —
 *   전체화면 Modal(page)은 헤더·닫기·뒤로가기·드래그 닫기까지 앱의 다른 상세 화면과 같은 문법.)
 *  레인은 접이식 금지 — 비접이 소제목 + 상단 필터 칩 행(전체/학습/분석/계산기/매장운영). */
export default function ToolsPanel() {
  const toast = useToast();
  const [active, setActive] = useState<ToolKey | null>(() => {
    // 딥링크: #tool=key 로 특정 도구 바로 열기(공유·재방문) — 하위호환 계약, 변경 금지
    const m = window.location.hash.match(/^#tool=([a-z]+)/);
    return m && TOOLS.some((t) => t.key === m[1]) ? (m[1] as ToolKey) : null;
  });
  // GTO 도구는 로그인 회원 전용(오너 지시 2026-08-27) — 카탈로그는 보이되 실행에 게이트
  //
  // ⚠ 2026-08-30: 예전엔 `if (!user) promptLogin()` 이었는데, 그게 **user 의 세 상태를 둘로 뭉갰다.**
  //   Supabase 세션 복원은 비동기라 '페이지는 그려졌고 카드도 눌리는데 user 는 아직 null' 인 구간이 있다.
  //   그 사이의 탭은 '비로그인' 으로 판정돼 도구가 안 열리고 로그인 시트가 떴다 —
  //   **로그인했는데 로그인하라고 뜨는** 그 증상이다.
  //   느린 기기일수록 창이 넓어진다. CI(2워커)에서 실측 12회 중 2회(약 17%) 재현됐고,
  //   tools 스펙이 CI 에서만 다섯 번 간헐 실패하던 것의 정체가 이거였다.
  //   → 로딩 중이면 **판정하지 말고 의도를 기억**했다가, 세션이 확정된 뒤에 연다.
  //     확정 결과가 '비로그인' 이면 그때 로그인 시트를 띄운다(안내가 늦는 게 아니라 정확해진다).
  const { user, loading: authLoading } = useAuth();
  const pendingTool = useRef<ToolKey | null>(null);
  const open = (k: ToolKey) => {
    if (authLoading) { pendingTool.current = k; return; }   // 아직 모른다 — 결론을 미룬다
    if (!user) { promptLogin(); return; }
    setActive(k);
  };
  useEffect(() => {
    if (authLoading) return;
    const k = pendingTool.current;
    if (!k) return;
    pendingTool.current = null;
    if (!user) { promptLogin(); return; }
    setActive(k);
  }, [authLoading, user]);
  const close = () => setActive(null);

  // ── 딥링크 해시(#tool=)는 **도구 자신의 history 항목**에 얹는다 ──────────────
  // 2026-08-28 회귀 수정. 예전엔 open() 이 그 자리에서 replaceState 로 해시를 썼다.
  //   그러면 해시가 '도구를 열기 전' 항목에 찍히고, Modal 이 그 위에 새 항목을 밀면서
  //   URL(=해시)을 물려받는다. 닫을 때 위 항목의 해시만 지우고 backstack 이 한 칸 되돌아오면
  //   **아래 항목의 낡은 해시가 되살아나 hashchange → 도구가 즉시 다시 열린다.**
  //   실측 로그: replace(/) → go(-1) → popstate(/#tool=range) → hashchange → push(layer 3).
  //   (지금까지 안 터진 이유: 예전 replaceState 가 그 항목의 __layer 토큰까지 지워서
  //    backstack 이 균형 back 을 아예 포기했다. 토큰 보존을 고치자 이 지뢰가 드러났다.)
  // 처방: 해시를 '도구 항목'에만 둔다.
  //   ① 진입 항목의 해시는 layout 단계에서 걷어낸다 — Modal 의 pushState(passive effect)보다 먼저다.
  //   ② 도구가 열린 뒤(부모 passive effect = 자식 push 이후)에 그 항목에 해시를 얹는다.
  //   ③ 닫힐 때는 서 있는 항목의 해시만 지우면 된다 — 아래 항목엔 애초에 해시가 없다.
  const stripToolHash = () => {
    if (!window.location.hash.startsWith('#tool=')) return;
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* 무시 */ }
  };
  const activeRef = useRef<ToolKey | null>(active);
  activeRef.current = active;
  useLayoutEffect(() => { stripToolHash(); }, []); // 딥링크 진입 항목 정규화(1회)
  useEffect(() => {
    if (!active) { stripToolHash(); return; }
    if (window.location.hash === `#tool=${active}`) return;
    try { history.replaceState(null, '', `#tool=${active}`); } catch { /* 무시 */ }
  }, [active]);
  // 차트 점프 파라미터는 1회성 — 렌더(useState 초기화)가 읽은 뒤 커밋 후에 지운다.
  // 렌더 중에 지우면 StrictMode 이중 렌더의 두 번째 호출이 null 을 읽는다.
  useEffect(() => {
    if (active === 'range' || active === 'pushfold') clearSnap(`tool:${active}`);
  }, [active]);
  // 도구 딥링크 공유 — 시스템 공유 시트(모바일) 또는 클립보드 복사(PC). #tool= 로 그 도구가 바로 열린다.
  const share = async (k: ToolKey) => {
    const t = TOOLS.find((x) => x.key === k);
    const label = QUIZ_KEYS.has(k) ? '오늘의 퀴즈' : '포커 도구';
    try {
      const how = await shareOrCopy({
        title: t ? `${t.name} · 누리홀덤` : '누리홀덤 도구',
        text: t ? `${t.name} — ${label}` : '누리홀덤 도구',
        url: `${window.location.origin}/#tool=${k}`,
      });
      if (how === 'copy') toast.show('링크 복사됨', 'success');
    } catch { /* 사용자가 공유 시트를 닫음 */ }
  };

  // 도구 사이 상호 링크(<a href="#tool=key">) — **열린 상태에서 갈아끼운다**.
  // 2026-08-29 실측 버그: 예전엔 앵커가 그냥 해시를 밀었고, 그러면 backstack 이 자기 것이 아닌
  // history 항목을 보고 '사용자가 나갔다'로 판정해 **도구가 통째로 닫혔다**(팟 오즈 링크가 그랬다 —
  // 아웃츠 → 팟 오즈로 가는 대신 런처로 튕겼다). history 를 건드려 고치려 들면 위 ①②③ 지뢰밭에
  // 다시 들어가야 한다. 그래서 아예 **네비게이션을 만들지 않는다** — 클릭을 가로채 active 만 바꾸고,
  // 해시는 기존 [active] 이펙트가 같은 항목에 replaceState 로 얹는다(항목 수 불변).
  const swapToolOnLinkClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest?.('a[href^="#tool="]');
    if (!a) return;
    const k = (a.getAttribute('href') ?? '').slice('#tool='.length);
    if (!TOOLS.some((t) => t.key === k)) return;
    e.preventDefault();
    open(k as ToolKey);
  };

  // 검색 + 레인 필터 칩 — 접이식 헤더(모바일 회귀)를 대체하는 비접이 IA.
  const [q, setQ] = useState('');
  const [lane, setLane] = useState<ToolCat | 'all'>('all');
  const ql = q.trim().toLowerCase();
  // 검색도 카탈로그와 같은 범위(매장 운영 도구 제외 — 내 매장으로 이관, ⑥b)
  const hits = ql ? TOOLS.filter((t) => !STORE_SET.has(t.key) && (t.name.toLowerCase().includes(ql) || t.desc.toLowerCase().includes(ql) || (t.keywords ?? '').toLowerCase().includes(ql))) : null;
  // 즐겨찾기 — 레인 위에 상시 노출(최대 6개)
  const [favs, setFavs] = useState<ToolKey[]>(() => {
    try { return JSON.parse(localStorage.getItem('nuri:fav-tools') || '[]'); } catch { return []; }
  });
  const toggleFav = (k: ToolKey) => setFavs((prev) => {
    const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k].slice(-6);
    try { localStorage.setItem('nuri:fav-tools', JSON.stringify(next)); } catch { /* quota */ }
    return next;
  });
  const favTools = favs.map((k) => TOOLS.find((t) => t.key === k)).filter((t) => t && !STORE_SET.has(t.key)) as typeof TOOLS;

  // 트레이너 진행(스트릭/XP/오늘 목표) — 이미 로컬에 있는 데이터 구독(신규 fetch 0)
  const prog = useTrainerProgress();
  // 오늘의 드릴 편성·진행 — 같은 로컬 기록에서 파생(서버 왕복 0)
  const drill = useDrillPlan();
  const drillTotal = drill.items.length;
  const drillDone = Math.min(drill.idx, drillTotal);
  const drillFinished = drillDone >= drillTotal;
  const drillHint = drillFinished
    ? `오늘 완료 · ${drill.correct}/${drillTotal} 정답`
    : (drill.items[drill.idx]?.reason ?? '약점에 맞춰 편성했습니다');
  const drillReview = drill.items.filter((it) => it.review).length; // 간격 반복 복습 문항 수(srs.ts)

  // 다른 곳(공유 링크·도구 간 상호 딥링크·nuri:open-tool)에서 해시가 바뀌면 반영.
  // ⚠ layout 이펙트인 이유(2026-09-03 실측): 다른 탭에서 이 패널을 처음 마운트시키며 여는 경로는
  //   'pane 이 보이는 첫 rAF' 에 hashchange 를 쏜다. 그 rAF 는 커밋(=layout 단계) 뒤·passive 이펙트 앞에
  //   낄 수 있어, passive 로 붙이면 리스너가 없는 채로 이벤트가 지나가고 이어 도는 [active](null) 이펙트가
  //   해시까지 걷어냈다(GTO 카탈로그만 뜸). 커밋 시점에 붙여야 'pane 이 보인다 ⇒ 리스너가 있다' 가 성립한다.
  useLayoutEffect(() => {
    const onHash = () => {
      const m = window.location.hash.match(/^#tool=([a-z]+)/);
      if (!m || !TOOLS.some((t) => t.key === m[1])) return;
      if (activeRef.current === m[1]) return;
      // 위 ① 과 같은 이유 — 해시를 갖고 도착한 이 항목에서 해시를 걷어내고,
      // 도구가 열린 뒤 그 도구의 항목에 다시 얹는다(닫을 때 되살아나지 않게).
      stripToolHash();
      setActive(m[1] as ToolKey);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const grid = (items: typeof TOOLS) => (
    <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((t) => (
        <ToolCard key={t.key} testId={`tool-${t.key}`} tone={LANE_TONE[t.cat]} name={t.name} desc={t.desc} icon={t.icon} onClick={() => open(t.key)}
          fav={favs.includes(t.key)} onToggleFav={() => toggleFav(t.key)} />
      ))}
    </div>
  );

  const activeTool = active ? TOOLS.find((t) => t.key === active) : null;


  return (
    <div className="hero-aurora space-y-3">
      {/* 프리플랍 레인지 차트 — GTO 탭 편입(오너 지시 2026-08-30).
          "차트가 GTO 탭에 없다"가 아니라 **찾기 어렵다**가 실제 문제였다(이 탭이 곧 GTO 탭이고
          차트는 학습 레인 카드 하나로만 들어갈 수 있었다). 그래서 전용 뷰를 새로 만들지 않는다 —
          같은 169셀 렌더러가 두 벌이 되면 그게 곧 유지보수 분기다. 대신 탭 상단에 상시 진입점을 둔다.
          2026-09-03 오너 지시: 상황 바로가기 칩 5개 제거 — 그룹 선택은 차트 안(RangeGuide 의 칩, data-testid=range-guide)에
          그대로 있어 기능 소실 0. 칩이 빠지면서 section+button 이중 구조를 **버튼 하나**로 접었다(드릴 카드와 같은 문법 —
          패딩 띠까지 눌리고 전역 프레스 규칙을 탄다). 제목 sm·타일 h-9·설명 xs 로 아래 ToolCard(xs·h-8·2xs)보다 한 단 크게 —
          글로우 말고도 '카탈로그 카드가 아니라 진입점' 으로 읽히게. 차트 레인 카드(tool-range)와 #tool=range 딥링크는 그대로.
          v6.5 글로우: GTO 탭의 주인공(탭당 1곳 규칙, CLAUDE.md). ⚠ button 안에는 phrasing content(span)만. */}
      <button type="button" onClick={() => open('range')}
        aria-label={`프리플랍 레인지 차트 · 스팟 ${RANGE_SCENARIOS.length}개. 열기`}
        className="card-aura ring-aura ring-aura-glow flex w-full items-center gap-2.5 rounded-aura border px-3.5 py-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input tile-grad">
          <Icon name={TOOLS.find((t) => t.key === 'range')!.icon} size={18} strokeWidth={1.8} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          {/* 제목은 절대 안 자른다 — 폭이 모자라면 배지가 다음 줄로 내려간다(flex-wrap). */}
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <b className="text-sm font-bold text-ink-primary">프리플랍 레인지 차트</b>
            <span className="shrink-0 text-2xs font-bold tabular-nums text-accent-200">{RANGE_SCENARIOS.length}개 스팟</span>
          </span>
          {/* truncate 금지 — 375px 에서 "오픈 · 블라인드 수비 · 3…" 로 잘려 무슨 표인지 사라졌다.
              두 줄까지 허용(카드 높이 예약이 바뀌지 않게 line-clamp 로 상한만 둔다). */}
          <span className="mt-0.5 block text-xs leading-snug text-ink-muted line-clamp-2">오픈 · 블라인드 수비 · 3벳 · vs 3벳 · 포지션으로 좁혀 보는 13×13</span>
        </span>
        {/* CTA — chip-aura 알약(index.css '선택형·바로가기 칩의 정본', 방금 걷어낸 칩과 같은 어휘).
            btn-primary 는 보라 틴트 그림자가 글로우 카드 위에 글로우를 겹쳐(v3 실패 사유) 쓰지 않는다. */}
        <span className="chip-aura inline-flex h-8 shrink-0 items-center rounded-chip px-2.5 text-2xs font-bold">열기 →</span>
      </button>

      {/* 오늘의 드릴 — 레인지 차트 카드 바로 아래(2026-09-03 오너 결정: 탭의 주인공 카드가 먼저, 드릴은 둘째 — 로드맵 ③ '최상단' 갱신).
          예전엔 이 자리가 "오늘 0/20" 진행 스트립뿐이라 **숙제만 내고 무엇을 풀지는 유저가 골랐다** —
          초보가 이탈하는 지점이었다. 이제 약점 카테고리(포스트플랍 정답률)와 오답 노트(프리플랍 큐)로
          편성한 5문제를 여기서 바로 시작한다. 기존 지표(오늘 N/목표 · 스트릭 · XP · 목표까지 N문제)는
          아래 줄에 그대로 남겼다 — 없어진 정보 0.
          card-elev: 아래 ToolCard 와 같은 카드 문법으로 통일(surface-low 라 ink-muted 5.01:1 유지).
          ⚠ button 안에는 phrasing content 만 — 자식은 전부 span 이다(div 중첩 금지). */}
      <button type="button" onClick={() => open('drill')}
        aria-label={`오늘의 드릴 · ${drillTotal}문제 중 ${drillDone}문제 완료. 열기`}
        className="block w-full space-y-2 rounded-aura border card-aura px-3.5 py-3 text-left hover:border-accent-400/40">
        <span className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Icon name="target" size={14} className="shrink-0 text-accent-300" aria-hidden />
            <b className="truncate text-xs font-bold text-ink-primary">오늘의 드릴</b>
            <span className="shrink-0 text-2xs font-bold tabular-nums text-accent-200">{drillDone}/{drillTotal}</span>
            {/* 복습 배지 — 있을 때만. h-4 = 제목 줄(text-xs 16px)과 같아 카드 높이가 변하지 않는다. */}
            {drillReview > 0 && (
              <span data-testid="drill-review-badge" className="chip-aura inline-flex h-4 shrink-0 items-center rounded-chip px-1.5 text-2xs font-bold leading-none tabular-nums">복습 {drillReview}개</span>
            )}
          </span>
          <span className="shrink-0 text-2xs font-bold text-accent-200">
            {drillFinished ? '복습하기' : drillDone > 0 ? '이어서 풀기 →' : '시작하기 →'}
          </span>
        </span>

        {/* 진행 점 + 다음 문제를 낸 이유(약점 보완 · 오답 노트 …) */}
        <span className="flex items-center gap-2">
          <span className="flex shrink-0 items-center gap-1">
            {drill.items.map((_, i) => (
              <span key={i} className={['h-1.5 w-1.5 rounded-full',
                i < drillDone ? 'bg-accent-300' : i === drillDone && !drillFinished ? 'bg-accent-300/40 ring-1 ring-accent-400/60' : 'bg-surface-high'].join(' ')} />
            ))}
          </span>
          <span className="min-w-0 truncate text-2xs text-ink-muted">{drillHint}</span>
        </span>

        {/* 기존 진행 스트립의 지표를 그대로 보존 */}
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-3 text-2xs">
            <span className="text-ink-muted">오늘 <b className="tabular-nums text-ink-primary">{prog.today}/{prog.goal}</b></span>
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <Icon name="flame" size={12} className="text-accent-300" aria-hidden />
              <b className="tabular-nums text-accent-200">{prog.streak}</b>일
            </span>
            <span className="text-ink-muted">XP <b className="tabular-nums text-ink-secondary">{prog.xp.toLocaleString()}</b></span>
          </span>
          <span className={['shrink-0 text-2xs font-semibold', prog.goalMet ? 'text-emerald-400' : 'text-ink-muted'].join(' ')}>
            {prog.goalMet ? '오늘 목표 달성' : `목표까지 ${prog.remaining}문제`}
          </span>
        </span>
      </button>

      {/* 도구 검색 */}
      <div className="relative">
        <Icon name="search" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        {/* type=search: 네이티브 지우기(×) 버튼 + 모바일 '검색' 키(enterKeyHint). .input[type=search] 가 12px 라운드·pl-10 을 준다 */}
        <input type="search" enterKeyHint="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="도구 검색 · 이름·기능"
          className="input w-full text-sm" aria-label="도구 검색" />
      </div>

      {/* 레인 필터 칩 — 보이는 높이 32px, 탭 타깃 44px(::before 로 위아래 6px 확장 · 가로는 gap 6px 라 확장하지 않음), aria-pressed 토글 */}
      {!hits && (
        <div data-tools-lanebar="" className="flex flex-wrap gap-1.5" role="group" aria-label="도구 분류 필터">
          {([{ id: 'all' as const, label: '전체' }, ...LANES]).map((l) => {
            const on = lane === l.id;
            return (
              <button key={l.id} type="button" aria-pressed={on}
                onClick={() => { const next = on && l.id !== 'all' ? 'all' : l.id; goSubTab('tools-lane', LANE_ORDER, lane, next, () => setLane(next)); }}
                className={['tap-y-44 inline-flex h-8 items-center rounded-badge border px-2.5 text-2xs font-semibold transition-colors',
                  on ? 'border-accent-300 bg-accent-300 text-white' : 'border-transparent bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
                {l.label}
              </button>
            );
          })}
        </div>
      )}

      {/* 즐겨찾기 — 레인과 무관하게 항상 보이는 내 도구 */}
      {!hits && favTools.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2 border-b border-border-subtle pb-1.5">
            <h2 className="inline-flex items-center gap-1 text-sm font-bold text-ink-primary">
              <Icon name="star-fill" size={13} className="text-accent-300" aria-hidden /> 즐겨찾기
            </h2>
            <span className="text-2xs font-semibold tabular-nums text-ink-muted">{favTools.length}개</span>
          </div>
          {grid(favTools)}
        </section>
      )}

      {/* 도구 목록 — 레인 전환의 본문(방향성 푸시 대상).
          레인 사이는 space-y-4(17px): 섹션 안(헤더→그리드) 8.5px 의 2배라 밑줄 헤더가 자기 그리드 쪽으로 붙어 레인이 묶음으로 읽힌다
          (space-y-3 은 1.5배라 '계산기 N개' 헤더가 위 레인의 마지막 카드에 붙어 보였다). */}
      <div data-tools-lanepanel="" className="space-y-4">
      {hits ? (
        hits.length === 0
          ? <p className="py-8 text-center text-2xs text-ink-muted">'{q.trim()}' 에 맞는 도구가 없습니다</p>
          : grid(hits)
      ) : (
        // 4레인 — 비접이 소제목 섹션(필터 칩이 보이는 레인을 고른다)
        LANES.filter((l) => lane === 'all' || lane === l.id).map((l) => {
          const items = TOOLS.filter((t) => t.cat === l.id);
          return (
            <section key={l.id} className="space-y-2">
              <div className="flex items-baseline gap-2 border-b border-border-subtle pb-1.5">
                <h2 className="inline-flex items-center gap-1 text-sm font-bold text-ink-primary">
                  <Icon name={l.icon} size={13} className="text-accent-300" aria-hidden /> {l.label}
                </h2>
                <span className="text-2xs font-semibold tabular-nums text-ink-muted">{items.length}개</span>
                <span className="truncate text-2xs text-ink-secondary">{l.desc}</span>
              </div>
              {grid(items)}
            </section>
          );
        })
      )}
      </div>

      {/* 도구 실행 — 전체화면 페이지(헤더·뒤로가기·드래그 닫기 = 앱 공통 문법).
          ⚠ display:contents 래퍼 필수 — 루트가 space-y-3 이라 Modal(fixed inset-0)이 직계 자식이면
          space-y 의 margin-top(0.75rem)이 fixed 박스에도 적용돼 전체화면 상단이 12.75px 내려앉고,
          그 틈으로 뒤 헤더(프로필 등급 링)가 비쳤다(오너 리포트 2026-08-27). contents 는 박스를
          만들지 않아 margin 이 무효가 되고, 다이얼로그는 space-y 의 직계 자식에서 벗어난다. */}
      <div className="contents">
      <Modal open={!!activeTool} onClose={close} variant="page" title={activeTool?.name} maxWidth="2xl">
        {/* onClick 은 앵커 클릭 위임 전용 — 이 div 자체는 인터랙티브가 아니다.
            앵커는 키보드 Enter 도 click 으로 오므로 별도 키 핸들러가 필요 없다. */}
        <div className="px-page-x py-3 pb-8" onClick={swapToolOnLinkClick}>
          {/* 공유 — 이 도구 딥링크(#tool=key)를 시스템 공유 시트/클립보드로. 커뮤니티 유입 동선. */}
          <div className="mb-2 flex justify-end">
            <button type="button" onClick={() => active && share(active)}
              aria-label={`${activeTool?.name ?? '도구'} 링크 공유`}
              className="inline-flex h-8 items-center gap-1.5 rounded-input border border-border-default bg-surface-high px-3 text-2xs font-semibold text-ink-secondary transition-colors hover:text-ink-primary">
              <Icon name="share" size={14} aria-hidden />
              공유
            </button>
          </div>
          <Suspense fallback={<div className="py-10 text-center text-2xs text-ink-muted">불러오는 중…</div>}>
            {/* #tool= 딥링크로 비로그인 진입해도 게이트가 유지되게 실행 지점에서 한 번 더 확인 */}
            {active ? (user ? renderTool(active) : (
              <div className="flex flex-col items-center gap-3 py-14 text-center">
                <p className="text-sm font-bold text-ink-primary">로그인하면 GTO 도구를 쓸 수 있어요</p>
                <p className="text-2xs text-ink-muted">차트·트레이너·계산기 전부 무료입니다</p>
                <button type="button" onClick={() => promptLogin()} className="btn-primary h-10 px-5 text-sm font-bold">로그인하기</button>
              </div>
            )) : null}
          </Suspense>
        </div>
      </Modal>
      </div>
    </div>
  );
}

type TileTone = 'violet' | 'indigo' | 'fuchsia' | 'cyan';
/** 레인 → 타일 색(v6.3): 차트 violet · 트레이닝 fuchsia · 분석 cyan · 계산기 indigo (emerald 는 라이브 신호색이라 제외) */
const LANE_TONE: Record<string, TileTone> = { chart: 'violet', learn: 'fuchsia', analyze: 'cyan', calc: 'indigo', ops: 'indigo' };
function ToolCard({ name, desc, icon, onClick, fav, onToggleFav, testId, tone = 'violet' }: {
  name: string; desc: string; icon: IconName; onClick: () => void; testId?: string; tone?: TileTone;
  fav?: boolean; onToggleFav?: () => void;
}) {
  // 버튼 안에 role="button" 스팬(중첩 인터랙티브 위반) 대신 형제 버튼 2개 — 키보드로도 별을 켤 수 있다.
  return (
    <div className="relative h-full">
      {/* 세로 타일(2026-09-03 오너: "설명이 너무 길고 불완전") — 아이콘을 위로 올려 텍스트 폭을 106px → 155px(390px 2열)로 넓히고,
          설명은 ≤13자 완결형 명사구 한 줄(TOOLS[].desc 전면 개고). 이름은 안 자른다(2줄 허용) — 같은 행 칸 높이는 그리드 auto-rows-fr + h-full 이 맞춘다.
          아이콘 행 오른쪽 자리는 즐겨찾기 별(형제 버튼, 우상단). 레퍼런스 aura-ui 피처 카드 문법(아이콘 타일 위 · 제목 · 한 줄 설명). */}
      <button type="button" onClick={onClick} data-testid={testId}
        className="flex h-full w-full flex-col items-start gap-2 rounded-aura border card-aura px-2.5 py-2.5 text-left hover:border-accent-400/40">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-${tone}`}>
          <Icon name={icon} size={16} strokeWidth={1.8} aria-hidden />
        </span>
        <span className="block min-w-0 w-full">
          <span className="line-clamp-2 text-xs font-bold leading-tight text-ink-primary">{name}</span>
          <span className="mt-0.5 block truncate text-2xs text-ink-muted">{desc}</span>
        </span>
      </button>
      {/* 별 — transform 유틸 금지: 전역 button:active 가 transform 을 scale 로 통째로 덮어 -translate-y-1/2 가 누르는 60ms 동안 사라져 별이 튀었다.
          opacity-30 은 비텍스트 대비(WCAG 1.4.11) 미달 — 색 토큰만으로 켬/끔 구분(채운 별+accent vs 윤곽 별+muted). */}
      {onToggleFav && (
        <button type="button" onClick={onToggleFav} aria-label={fav ? `${name} 즐겨찾기 해제` : `${name} 즐겨찾기 추가`} aria-pressed={fav}
          className={['absolute right-1 top-1 flex h-8 w-8 items-center justify-center',
            fav ? 'text-accent-300' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
          <Icon name={fav ? 'star-fill' : 'star'} size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
