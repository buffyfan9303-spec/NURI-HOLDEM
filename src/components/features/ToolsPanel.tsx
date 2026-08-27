import { useEffect, useState, Suspense, type ReactNode } from 'react';
import { lazyWithReload } from '../../lib/lazyWithReload';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import { shareOrCopy } from '../../lib/calendar';
import { useTrainerProgress } from '../../lib/trainerProgress';
import { useAuth } from '../../contexts/AuthContext';
import { promptLogin } from '../../lib/requireLogin';
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

// GTO 패널은 에퀴티 엔진을 포함해 무거우므로 지연 로드
import { readSnap } from '../../lib/snapshot';
import type { DeepGtoInit } from './gto/useDeepGto';
const GtoDeepPanel = lazyWithReload(() => import('./gto/GtoDeepPanel'));

type ToolKey = 'gto' | 'pot' | 'icm' | 'range' | 'trainer' | 'postflop' | 'mdf' | 'aggro' | 'rvr' | 'outs' | 'pushfold' | 'spr' | 'ev' | 'mzone' | 'bankroll' | 'variance' | 'blindgen' | 'chip' | 'sim' | 'payout' | 'endtime' | 'combo' | 'glossary' | 'deal';
/** 4레인 IA — 학습 / 분석 / 계산기 / 매장운영 (로드맵 ⑥) */
type ToolCat = 'learn' | 'analyze' | 'calc' | 'ops';

const TOOLS: { key: ToolKey; cat: ToolCat; name: string; desc: string; icon: ReactNode }[] = [
  // ── 학습 — 차트·트레이너 ──
  { key: 'range', cat: 'learn', name: '스타팅핸드 가이드', desc: '오픈·수비·3벳 표준 레인지',
    icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="21" /></> },
  { key: 'pushfold', cat: 'learn', name: '푸시 · 폴드 차트', desc: '자체 Nash — 셔브·콜 레인지',
    icon: <><path d="M12 21V4" /><path d="M5 11l7-7 7 7" /></> },
  { key: 'trainer', cat: 'learn', name: '프리플랍 트레이너', desc: '오픈·셔브 맞히기, 오답 노트',
    icon: <><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="4" /></> },
  { key: 'postflop', cat: 'learn', name: '포스트플랍 트레이너', desc: '실전 상황 퀴즈·해설',
    icon: <><rect x="3" y="6" width="5" height="7" rx="1" /><rect x="9.5" y="6" width="5" height="7" rx="1" /><rect x="16" y="6" width="5" height="7" rx="1" /><path d="M7 17h10" /><path d="M9 21h6" /></> },
  { key: 'aggro', cat: 'learn', name: '어그레션 차트', desc: '포지션별 권장 빈도',
    icon: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></> },
  { key: 'glossary', cat: 'learn', name: '홀덤 용어사전', desc: '용어 74개 — 한글 설명·검색',
    icon: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /><path d="M9 7h6M9 11h4" /></> },
  // ── 분석 — 핸드·레인지 에퀴티 ──
  { key: 'gto', cat: 'analyze', name: 'GTO 핸드 분석', desc: '프리/포스트플랍 승률·전략',
    icon: <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></> },
  { key: 'rvr', cat: 'analyze', name: '레인지 vs 레인지', desc: '레인지 간 에퀴티 매트릭스',
    icon: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /><path d="M13 7h8M7 13v8" /></> },
  // ── 계산기 — 수치 판단 ──
  { key: 'pot', cat: 'calc', name: '팟 오즈 계산기', desc: '콜에 필요한 승률 계산',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { key: 'outs', cat: 'calc', name: '아웃츠 / 확률', desc: '완성 확률·팟 오즈',
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
  { id: 'learn', label: '학습', desc: '차트·트레이너로 기본기' },
  { id: 'analyze', label: '분석', desc: '핸드·레인지 에퀴티 실계산' },
  { id: 'calc', label: '계산기', desc: '실전 수치 판단' },
];
// eslint-disable-next-line react-refresh/only-export-components -- 이관 레지스트리 공유(§7 ⑥b)
export const STORE_TOOL_KEYS = ['chip', 'sim', 'blindgen', 'payout', 'endtime'] as const;
const STORE_SET = new Set<ToolKey>(STORE_TOOL_KEYS);

// 트레이너류는 '퀴즈' 뉘앙스(맞히기), 나머지 계산기·차트류는 '도구' 뉘앙스로 라벨링.
const QUIZ_KEYS = new Set<ToolKey>(['range', 'pushfold', 'trainer', 'postflop']);

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
    case 'pot': return <PotOddsCalc />;
    case 'icm': return <ICMCalculator />;
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
  const { user } = useAuth();
  const open = (k: ToolKey) => {
    if (!user) { promptLogin(); return; }
    setActive(k);
    try { history.replaceState(null, '', `#tool=${k}`); } catch { /* 무시 */ }
  };
  const close = () => {
    setActive(null);
    if (window.location.hash.startsWith('#tool=')) {
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* 무시 */ }
    }
  };
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

  // 다른 곳(공유 링크·도구 간 상호 딥링크)에서 해시가 바뀌면 반영
  useEffect(() => {
    const onHash = () => {
      const m = window.location.hash.match(/^#tool=([a-z]+)/);
      if (m && TOOLS.some((t) => t.key === m[1])) setActive(m[1] as ToolKey);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const grid = (items: typeof TOOLS) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((t) => (
        <ToolCard key={t.key} name={t.name} desc={t.desc} icon={t.icon} onClick={() => open(t.key)}
          fav={favs.includes(t.key)} onToggleFav={() => toggleFav(t.key)} />
      ))}
    </div>
  );

  const activeTool = active ? TOOLS.find((t) => t.key === active) : null;


  return (
    <div className="space-y-3">
      {/* 트레이너 진행 스트립 — 오늘 목표·스트릭·XP 상시 노출(탭하면 트레이너로) */}
      <button type="button" onClick={() => open('trainer')} aria-label="트레이너 진행 — 프리플랍 트레이너 열기"
        className="flex w-full items-center justify-between gap-2 rounded-card border border-border-default bg-surface-low px-3.5 py-2.5 text-left transition-colors hover:border-accent-400/40 hover:bg-surface-high">
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
      </button>

      {/* 도구 검색 */}
      <div className="relative">
        <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="도구 검색 — 이름·기능"
          className="input w-full pl-9 text-sm" aria-label="도구 검색" />
      </div>

      {/* 레인 필터 칩 — 균일 h-9, aria-pressed 토글(접이식 대체) */}
      {!hits && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="도구 분류 필터">
          {([{ id: 'all' as const, label: '전체' }, ...LANES]).map((l) => {
            const on = lane === l.id;
            return (
              <button key={l.id} type="button" aria-pressed={on}
                onClick={() => setLane(on && l.id !== 'all' ? 'all' : l.id)}
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
          <p className="inline-flex items-center gap-1 text-2xs font-bold text-accent-200">
            <Icon name="star-fill" size={12} aria-hidden /> 즐겨찾기
          </p>
          {grid(favTools)}
        </section>
      )}

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
                <span className="truncate text-2xs text-ink-muted">{l.desc}</span>
              </div>
              {grid(items)}
            </section>
          );
        })
      )}

      {/* 도구 실행 — 전체화면 페이지(헤더·뒤로가기·드래그 닫기 = 앱 공통 문법) */}
      <Modal open={!!activeTool} onClose={close} variant="page" title={activeTool?.name} maxWidth="2xl">
        <div className="px-page-x py-3 pb-8">
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
  );
}

function ToolCard({ name, desc, icon, onClick, fav, onToggleFav }: {
  name: string; desc: string; icon: ReactNode; onClick: () => void;
  fav?: boolean; onToggleFav?: () => void;
}) {
  // 버튼 안에 role="button" 스팬(중첩 인터랙티브 위반) 대신 형제 버튼 2개 — 키보드로도 별을 켤 수 있다.
  return (
    <div className="relative">
      <button type="button" onClick={onClick}
        className="group/tool flex w-full items-center gap-2.5 rounded-card border border-border-default bg-surface-low px-2.5 py-2 pr-8 text-left transition-colors hover:border-accent-400/40 hover:bg-surface-high active:scale-[0.98]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-accent-300/15 text-accent-300">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
        </span>
        <span className="min-w-0 flex-1">
          {/* 이름은 절대 안 자른다 — 2줄까지 허용. 1줄 이름도 2줄 높이를 예약해
              모든 칸의 높이가 같아진다(오너 지시 2026-08-27: MDF·블러프 vs ICM 칸 크기 상이). */}
          <span className="block min-h-[2.5em] text-xs font-bold text-ink-primary leading-tight [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden content-center">{name}</span>
          <span className="block truncate text-2xs text-ink-muted leading-snug mt-0.5">{desc}</span>
        </span>
      </button>
      {onToggleFav && (
        <button type="button" onClick={onToggleFav} aria-label={fav ? `${name} 즐겨찾기 해제` : `${name} 즐겨찾기 추가`} aria-pressed={fav}
          className={['absolute right-0.5 top-1/2 -translate-y-1/2 flex h-9 w-8 items-center justify-center transition-opacity',
            fav ? 'text-accent-300 opacity-100' : 'text-ink-muted opacity-30 hover:opacity-70'].join(' ')}>
          <Icon name={fav ? 'star-fill' : 'star'} size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
