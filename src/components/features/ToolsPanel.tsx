import { useEffect, useLayoutEffect, useRef, useState, Suspense, type ReactNode } from 'react';
import { lazyWithReload } from '../../lib/lazyWithReload';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
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
import { RANGE_SCENARIOS } from '../../lib/ranges.data';

// GTO 패널·핸드 리플레이어는 에퀴티 엔진을 포함해 무거우므로 지연 로드
import { readSnap } from '../../lib/snapshot';
import type { DeepGtoInit } from './gto/useDeepGto';
import type { HandReviewInit } from './gto/HandReviewTool';
const GtoDeepPanel = lazyWithReload(() => import('./gto/GtoDeepPanel'));
const HandReviewTool = lazyWithReload(() => import('./gto/HandReviewTool'));

type ToolKey = 'drill' | 'gto' | 'replay' | 'pot' | 'icm' | 'range' | 'trainer' | 'postflop' | 'mdf' | 'aggro' | 'rvr' | 'outs' | 'pushfold' | 'spr' | 'ev' | 'mzone' | 'bankroll' | 'variance' | 'blindgen' | 'chip' | 'sim' | 'payout' | 'endtime' | 'combo' | 'glossary' | 'deal';
/** 5레인 IA — 차트 / 트레이닝 / 분석 / 계산기 / 매장운영.
 *  오너 피드백(2026-09-02): "차트를 보고 싶은데 문제가 나온다" — 예전엔 '학습' 한 레인에 차트와 퀴즈가 섞여
 *  첫 카드가 '오늘의 드릴'(퀴즈)이었다. 보는 것(차트)과 푸는 것(트레이닝)을 레인으로 갈라 차트를 맨 앞에 둔다. */
type ToolCat = 'chart' | 'learn' | 'analyze' | 'calc' | 'ops';

const TOOLS: { key: ToolKey; cat: ToolCat; name: string; desc: string; icon: ReactNode }[] = [
  // ── 학습 — 차트·트레이너 ──
  { key: 'drill', cat: 'learn', name: '오늘의 드릴', desc: '약점 기반 하루 5문제',
    icon: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /><path d="M9 15l2 2 4-4" /></> },
  { key: 'range', cat: 'chart', name: '프리플랍 레인지 차트', desc: '9인·6맥스 포지션별 오픈·3벳·수비·vs 3벳',
    icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="21" /></> },
  { key: 'pushfold', cat: 'chart', name: '푸시 · 폴드 차트', desc: '자체 Nash · 셔브·콜 레인지',
    icon: <><path d="M12 21V4" /><path d="M5 11l7-7 7 7" /></> },
  { key: 'trainer', cat: 'learn', name: '프리플랍 트레이너', desc: '오픈·셔브 맞히기, 오답 노트',
    icon: <><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="4" /></> },
  { key: 'postflop', cat: 'learn', name: '포스트플랍 트레이너', desc: '실전 상황 퀴즈·해설',
    icon: <><rect x="3" y="6" width="5" height="7" rx="1" /><rect x="9.5" y="6" width="5" height="7" rx="1" /><rect x="16" y="6" width="5" height="7" rx="1" /><path d="M7 17h10" /><path d="M9 21h6" /></> },
  { key: 'aggro', cat: 'chart', name: '어그레션 차트', desc: '포지션별 권장 빈도',
    icon: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></> },
  { key: 'glossary', cat: 'learn', name: '홀덤 용어사전', desc: '용어 74개 · 한글 설명·검색',
    icon: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /><path d="M9 7h6M9 11h4" /></> },
  // ── 분석 — 핸드·레인지 에퀴티 ──
  { key: 'replay', cat: 'analyze', name: '핸드 리플레이어', desc: '그 핸드 복기 · 승률 추이·아웃',
    icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 9l5 3-5 3V9Z" /></> },
  { key: 'gto', cat: 'analyze', name: 'GTO 핸드 분석', desc: '프리/포스트플랍 승률·전략',
    icon: <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></> },
  { key: 'rvr', cat: 'analyze', name: '레인지 vs 레인지', desc: '레인지 간 에퀴티 매트릭스',
    icon: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /><path d="M13 7h8M7 13v8" /></> },
  // ── 계산기 — 수치 판단 ──
  { key: 'pot', cat: 'calc', name: '팟 오즈 계산기', desc: '콜에 필요한 승률 계산',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { key: 'outs', cat: 'calc', name: '아웃츠 / 확률', desc: '카드만 넣으면 아웃 자동 계산',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-4.5" /></> },
  { key: 'mdf', cat: 'calc', name: 'MDF · 블러프 계산기', desc: '수비 빈도·블러프 비율',
    icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M9 12l2 2 4-4" /></> },
  { key: 'icm', cat: 'calc', name: 'ICM 계산기', desc: '토너먼트 기대 상금',
    icon: <><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="12" y2="15" /></> },
  { key: 'deal', cat: 'calc', name: '딜 계산기', desc: 'ICM 딜 vs 칩찹 분배 비교',
    icon: <><path d="M11 17a5 5 0 1 0-6-6" /><circle cx="16" cy="16" r="5" /><path d="M14.5 16l1 1 2-2" /></> },
  { key: 'spr', cat: 'calc', name: 'SPR 계산기', desc: '스택 대 팟 비율',
    icon: <><rect x="3" y="11" width="7" height="9" rx="1" /><rect x="14" y="4" width="7" height="16" rx="1" /></> },
  { key: 'ev', cat: 'calc', name: 'EV 계산기', desc: '기대값 손익 판단',
    icon: <><line x1="12" y1="3" x2="12" y2="21" /><path d="M8 7h6a3 3 0 0 1 0 6H8" /></> },
  { key: 'combo', cat: 'calc', name: '콤보 계산기', desc: '핸드·레인지 콤보 수',
    icon: <><rect x="4" y="4" width="9" height="13" rx="1.5" /><rect x="11" y="7" width="9" height="13" rx="1.5" /></> },
  { key: 'mzone', cat: 'calc', name: 'M존 계산기', desc: '토너 생존 압박 지수',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M8 15V9l4 4 4-4v6" /></> },
  { key: 'bankroll', cat: 'calc', name: '뱅크롤 관리', desc: '바인 대비 자금 권장선',
    icon: <><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 11h18" /><circle cx="12" cy="15" r="1.5" /></> },
  { key: 'variance', cat: 'calc', name: '분산 시뮬', desc: 'ROI·표본 → 파산 확률',
    icon: <><path d="M3 20c3-1 4-6 6-6s3 4 5 4 4-9 7-10" /></> },
  // ── 매장 운영 ──
  { key: 'chip', cat: 'ops', name: '칩 분배기', desc: '스택 구성·총 칩 수',
    icon: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></> },
  { key: 'sim', cat: 'ops', name: '구조 시뮬', desc: '총 칩·평균 스택 깊이',
    icon: <><line x1="4" y1="20" x2="4" y2="11" /><line x1="10" y1="20" x2="10" y2="4" /><line x1="16" y1="20" x2="16" y2="14" /><line x1="20" y1="20" x2="20" y2="8" /></> },
  { key: 'blindgen', cat: 'ops', name: '블라인드 생성기', desc: '구조 자동 생성·표',
    icon: <><line x1="4" y1="20" x2="4" y2="14" /><line x1="9" y1="20" x2="9" y2="9" /><line x1="14" y1="20" x2="14" y2="12" /><line x1="19" y1="20" x2="19" y2="5" /></> },
  { key: 'payout', cat: 'ops', name: '상금 분배', desc: '총 상금·인원 → 분배표',
    icon: <><path d="M8 4h8v3a4 4 0 0 1-8 0V4z" /><path d="M12 11v4" /><path d="M9 20h6" /><path d="M10 17h4" /></> },
  { key: 'endtime', cat: 'ops', name: '종료시간 예측', desc: '레벨·브레이크 → 종료 시각',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></> },
];

/** 3레인 소제목 — 접이식 금지(로드맵 FIX: 접이 헤더는 모바일 회귀). 항상 펼쳐진 섹션.
 *  §7 ⑥b: '매장 운영' 레인은 GTO 탭에서 빠져 내 매장(StoreToolsPanel)으로 이관 —
 *  카탈로그에서만 숨기고 TOOLS/renderTool 에는 남겨 #tool= 딥링크·공유 하위호환을 지킨다. */
const LANES: { id: ToolCat; label: string; desc: string }[] = [
  { id: 'chart', label: '차트', desc: '보고 외우는 표준 레인지' },
  { id: 'learn', label: '트레이닝', desc: '퀴즈로 맞히고 오답 노트' },
  { id: 'analyze', label: '분석', desc: '핸드·레인지 에퀴티 실계산' },
  { id: 'calc', label: '계산기', desc: '실전 수치 판단' },
];
// eslint-disable-next-line react-refresh/only-export-components -- 이관 레지스트리 공유(§7 ⑥b)
export const STORE_TOOL_KEYS = ['chip', 'sim', 'blindgen', 'payout', 'endtime'] as const;
const STORE_SET = new Set<ToolKey>(STORE_TOOL_KEYS);
/** 레인 칩 진열 순서 — 하위 탭 전환 방향(forward/back) 기준. 화면에 놓인 차례 그대로. */
const LANE_ORDER = ['all', ...LANES.map((l) => l.id)] as (ToolCat | 'all')[];

// 트레이너류는 '퀴즈' 뉘앙스(맞히기), 나머지 계산기·차트류는 '도구' 뉘앙스로 라벨링.
const QUIZ_KEYS = new Set<ToolKey>(['drill', 'range', 'pushfold', 'trainer', 'postflop']);

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
    case 'range': return <RangeGuide />;
    case 'trainer': return <PreflopTrainer />;
    case 'postflop': return <PostflopTrainer />;
    case 'mdf': return <MdfCalc />;
    case 'aggro': return <AggroChart />;
    case 'rvr': return <RangeMatrix />;
    case 'outs': return <OutsCalc />;
    case 'pushfold': return <PushFoldChart />;
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
export const getStoreTools = () => TOOLS.filter((t) => STORE_SET.has(t.key)) as { key: StoreToolKey; name: string; desc: string; icon: ReactNode }[];
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
  const hits = ql ? TOOLS.filter((t) => !STORE_SET.has(t.key) && (t.name.toLowerCase().includes(ql) || t.desc.toLowerCase().includes(ql))) : null;
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

  // 다른 곳(공유 링크·도구 간 상호 딥링크)에서 해시가 바뀌면 반영
  useEffect(() => {
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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((t) => (
        <ToolCard key={t.key} testId={`tool-${t.key}`} tone={LANE_TONE[t.cat]} name={t.name} desc={t.desc} icon={t.icon} onClick={() => open(t.key)}
          fav={favs.includes(t.key)} onToggleFav={() => toggleFav(t.key)} />
      ))}
    </div>
  );

  const activeTool = active ? TOOLS.find((t) => t.key === active) : null;


  return (
    <div className="hero-aurora space-y-3">
      {/* 오늘의 드릴 — GTO 탭 최상단(로드맵 ③).
          예전엔 이 자리가 "오늘 0/20" 진행 스트립뿐이라 **숙제만 내고 무엇을 풀지는 유저가 골랐다** —
          초보가 이탈하는 지점이었다. 이제 약점 카테고리(포스트플랍 정답률)와 오답 노트(프리플랍 큐)로
          편성한 5문제를 여기서 바로 시작한다. 기존 지표(오늘 N/목표 · 스트릭 · XP · 목표까지 N문제)는
          아래 줄에 그대로 남겼다 — 없어진 정보 0.
          card-elev: 아래 ToolCard 와 같은 카드 문법으로 통일(surface-low 라 ink-muted 5.01:1 유지).
          ⚠ button 안에는 phrasing content 만 — 자식은 전부 span 이다(div 중첩 금지). */}
      <button type="button" onClick={() => open('drill')}
        aria-label={`오늘의 드릴 · ${drillTotal}문제 중 ${drillDone}문제 완료. 열기`}
        className="card-elev block w-full space-y-2 rounded-card border border-border-default bg-surface-low px-3.5 py-3 text-left hover:border-accent-400/40">
        <span className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Icon name="target" size={14} className="shrink-0 text-accent-300" aria-hidden />
            <b className="truncate text-xs font-bold text-ink-primary">오늘의 드릴</b>
            <span className="shrink-0 text-2xs font-bold tabular-nums text-accent-200">{drillDone}/{drillTotal}</span>
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
        className="card-aura ring-aura ring-aura-glow flex w-full items-center gap-2.5 rounded-card border bg-surface-low px-3.5 py-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input tile-grad">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {TOOLS.find((t) => t.key === 'range')!.icon}
          </svg>
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

      {/* 도구 검색 */}
      <div className="relative">
        <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="도구 검색 · 이름·기능"
          className="input w-full pl-9 text-sm" aria-label="도구 검색" />
      </div>

      {/* 레인 필터 칩 — 균일 h-9, aria-pressed 토글(접이식 대체) */}
      {!hits && (
        <div data-tools-lanebar="" className="flex flex-wrap gap-1.5" role="group" aria-label="도구 분류 필터">
          {([{ id: 'all' as const, label: '전체' }, ...LANES]).map((l) => {
            const on = lane === l.id;
            return (
              <button key={l.id} type="button" aria-pressed={on}
                onClick={() => { const next = on && l.id !== 'all' ? 'all' : l.id; goSubTab('tools-lane', LANE_ORDER, lane, next, () => setLane(next)); }}
                className={['inline-flex h-8 items-center rounded-badge border px-2.5 text-2xs font-semibold transition-colors',
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
                <h2 className="text-sm font-bold text-ink-primary">{l.label}</h2>
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
  name: string; desc: string; icon: ReactNode; onClick: () => void; testId?: string; tone?: TileTone;
  fav?: boolean; onToggleFav?: () => void;
}) {
  // 버튼 안에 role="button" 스팬(중첩 인터랙티브 위반) 대신 형제 버튼 2개 — 키보드로도 별을 켤 수 있다.
  return (
    <div className="relative">
      <button type="button" onClick={onClick} data-testid={testId}
        className="card-elev flex w-full items-center gap-2.5 rounded-card border border-border-default bg-surface-low px-2.5 py-2 text-left hover:border-accent-400/40">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-${tone}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
        </span>
        {/* 이름 2줄 + 설명 2줄을 컬럼 min-h(3.875rem = 이름 1.875 + mt 0.125 + 설명 1.875)로 예약 —
            1줄 이름·1줄 설명도 같은 높이라 모든 칸이 같다(오너 지시 2026-08-27: MDF·블러프 vs ICM 칸 크기 상이).
            설명 truncate 는 2026-09-03 폐기: 390px 실측 컬럼 82px vs 설명 87~192px 로 20장 중 18장이 "…" 였다.
            별 예약(pr-8)을 풀고 별을 우상단 모서리로 올려 설명이 전폭(≈106px)을 쓴다 — 2줄이면 390·375 에서 전부 들어간다.
            이름의 pr-6 는 우상단 별 아이콘 회피. flex-col justify-center 는 -webkit-box 에 안 먹던 content-center(iOS 상단 정렬)의 대체. */}
        <span className="flex min-h-[3.875rem] min-w-0 flex-1 flex-col justify-center">
          <span className="line-clamp-2 pr-6 text-xs font-bold leading-tight text-ink-primary">{name}</span>
          <span className="mt-0.5 line-clamp-2 text-2xs text-ink-muted">{desc}</span>
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
