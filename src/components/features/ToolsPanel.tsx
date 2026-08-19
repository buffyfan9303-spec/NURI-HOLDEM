import { useEffect, useState, Suspense, type ReactNode } from 'react';
import { lazyWithReload } from '../../lib/lazyWithReload';
import Modal from '../atoms/Modal';
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

// GTO 패널은 에퀴티 엔진을 포함해 무거우므로 지연 로드
import { readSnap } from '../../lib/snapshot';
import type { DeepGtoInit } from './gto/useDeepGto';
const GtoDeepPanel = lazyWithReload(() => import('./gto/GtoDeepPanel'));

type ToolKey = 'gto' | 'pot' | 'icm' | 'range' | 'trainer' | 'postflop' | 'mdf' | 'aggro' | 'rvr' | 'outs' | 'pushfold' | 'spr' | 'ev' | 'mzone' | 'bankroll' | 'variance' | 'blindgen' | 'chip' | 'sim' | 'payout' | 'endtime' | 'combo';
type ToolGroup = 'ops' | 'player';

const TOOLS: { key: ToolKey; group: ToolGroup; name: string; desc: string; icon: ReactNode }[] = [
  // ── 매장 운영 도구 ──
  { key: 'chip', group: 'ops', name: '칩 분배기', desc: '스택 구성·총 칩 수',
    icon: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></> },
  { key: 'sim', group: 'ops', name: '구조 시뮬', desc: '총 칩·평균 스택 깊이',
    icon: <><line x1="4" y1="20" x2="4" y2="11" /><line x1="10" y1="20" x2="10" y2="4" /><line x1="16" y1="20" x2="16" y2="14" /><line x1="20" y1="20" x2="20" y2="8" /></> },
  { key: 'blindgen', group: 'ops', name: '블라인드 생성기', desc: '구조 자동 생성·표',
    icon: <><line x1="4" y1="20" x2="4" y2="14" /><line x1="9" y1="20" x2="9" y2="9" /><line x1="14" y1="20" x2="14" y2="12" /><line x1="19" y1="20" x2="19" y2="5" /></> },
  { key: 'payout', group: 'ops', name: '상금 분배', desc: '총 상금·인원 → 분배표',
    icon: <><path d="M8 4h8v3a4 4 0 0 1-8 0V4z" /><path d="M12 11v4" /><path d="M9 20h6" /><path d="M10 17h4" /></> },
  { key: 'endtime', group: 'ops', name: '종료시간 예측', desc: '레벨·브레이크 → 종료 시각',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></> },
  // ── 플레이어 도구 ──
  { key: 'gto', group: 'player', name: 'GTO 핸드 분석', desc: '프리/포스트플랍 승률·전략',
    icon: <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></> },
  { key: 'range', group: 'player', name: '스타팅핸드 가이드', desc: '오픈·수비·3벳 표준 레인지',
    icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="21" /></> },
  { key: 'pushfold', group: 'player', name: '푸시 · 폴드 차트', desc: '자체 Nash — 셔브·콜 레인지',
    icon: <><path d="M12 21V4" /><path d="M5 11l7-7 7 7" /></> },
  { key: 'trainer', group: 'player', name: '프리플랍 트레이너', desc: '오픈·셔브 맞히기, 오답 노트',
    icon: <><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="4" /></> },
  { key: 'postflop', group: 'player', name: '포스트플랍 트레이너', desc: '실전 상황 퀴즈·해설',
    icon: <><rect x="3" y="6" width="5" height="7" rx="1" /><rect x="9.5" y="6" width="5" height="7" rx="1" /><rect x="16" y="6" width="5" height="7" rx="1" /><path d="M7 17h10" /><path d="M9 21h6" /></> },
  { key: 'mdf', group: 'player', name: 'MDF · 블러프 계산기', desc: '수비 빈도·블러프 비율',
    icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M9 12l2 2 4-4" /></> },
  { key: 'rvr', group: 'player', name: '레인지 vs 레인지', desc: '레인지 간 에퀴티 매트릭스',
    icon: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /><path d="M13 7h8M7 13v8" /></> },
  { key: 'aggro', group: 'player', name: '어그레션 차트', desc: '포지션별 권장 빈도',
    icon: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></> },
  { key: 'pot', group: 'player', name: '팟 오즈 계산기', desc: '콜에 필요한 승률 계산',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { key: 'icm', group: 'player', name: 'ICM 계산기', desc: '토너먼트 기대 상금',
    icon: <><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="12" y2="15" /></> },
  { key: 'outs', group: 'player', name: '아웃츠 / 확률', desc: '완성 확률·팟 오즈',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-4.5" /></> },
  { key: 'spr', group: 'player', name: 'SPR 계산기', desc: '스택 대 팟 비율',
    icon: <><rect x="3" y="11" width="7" height="9" rx="1" /><rect x="14" y="4" width="7" height="16" rx="1" /></> },
  { key: 'ev', group: 'player', name: 'EV 계산기', desc: '기대값 손익 판단',
    icon: <><line x1="12" y1="3" x2="12" y2="21" /><path d="M8 7h6a3 3 0 0 1 0 6H8" /></> },
  { key: 'combo', group: 'player', name: '콤보 계산기', desc: '핸드·레인지 콤보 수',
    icon: <><rect x="4" y="4" width="9" height="13" rx="1.5" /><rect x="11" y="7" width="9" height="13" rx="1.5" /></> },
  { key: 'mzone', group: 'player', name: 'M존 계산기', desc: '토너 생존 압박 지수',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M8 15V9l4 4 4-4v6" /></> },
  { key: 'bankroll', group: 'player', name: '뱅크롤 관리', desc: '바인 대비 자금 권장선',
    icon: <><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 11h18" /><circle cx="12" cy="15" r="1.5" /></> },
  { key: 'variance', group: 'player', name: '분산 시뮬', desc: 'ROI·표본 → 파산 확률',
    icon: <><path d="M3 20c3-1 4-6 6-6s3 4 5 4 4-9 7-10" /></> },
];

const GROUPS: { id: ToolGroup; title: string; desc: string }[] = [
  { id: 'player', title: '플레이어 도구', desc: '실전 플레이·전략용' },
  { id: 'ops', title: '매장 운영 도구', desc: '토너먼트 운영·세팅용' },
];

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
    default: return null;
  }
}

/** 도구 모음 — 카드형 런처.
 *  누르면 "그 카드 행 아래 인라인"이 아니라 **전체화면 페이지**로 연다.
 *  (인라인 방식은 중간 카드를 누르면 위에 런처가 그대로 남아, 열린 도구를 찾아 내려가야 했다 —
 *   전체화면 Modal(page)은 헤더·닫기·뒤로가기·드래그 닫기까지 앱의 다른 상세 화면과 같은 문법.) */
export default function ToolsPanel() {
  const [active, setActive] = useState<ToolKey | null>(() => {
    // 딥링크: #tool=key 로 특정 도구 바로 열기(공유·재방문)
    const m = window.location.hash.match(/^#tool=([a-z]+)/);
    return m && TOOLS.some((t) => t.key === m[1]) ? (m[1] as ToolKey) : null;
  });
  // 최근 사용 — 재방문 시 도구 재탐색 비용 0. 최대 3개, 앞이 최신.
  const [recent, setRecent] = useState<ToolKey[]>(() => {
    try { return JSON.parse(localStorage.getItem('nuri:tool:recent') || '[]'); } catch { return []; }
  });
  const open = (k: ToolKey) => {
    setActive(k);
    try { history.replaceState(null, '', `#tool=${k}`); } catch { /* 무시 */ }
    setRecent((prev) => {
      const r = [k, ...prev.filter((x) => x !== k)].slice(0, 3);
      try { localStorage.setItem('nuri:tool:recent', JSON.stringify(r)); } catch { /* quota */ }
      return r;
    });
  };
  const close = () => {
    setActive(null);
    if (window.location.hash.startsWith('#tool=')) {
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* 무시 */ }
    }
  };

  // 검색 + 그룹 접기 — 첫 방문엔 플레이어 그룹을 펼쳐 "빈 화면 + 접힌 헤더 2개"를 피한다.
  const [q, setQ] = useState('');
  const [openG, setOpenG] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('nuri:tools-open');
      return saved ? JSON.parse(saved) : { player: true };
    } catch { return { player: true }; }
  });
  const toggleG = (id: string) => setOpenG((prev) => {
    const next = { ...prev, [id]: !prev[id] };
    try { localStorage.setItem('nuri:tools-open', JSON.stringify(next)); } catch { /* quota */ }
    return next;
  });
  const ql = q.trim().toLowerCase();
  const hits = ql ? TOOLS.filter((t) => t.name.toLowerCase().includes(ql) || t.desc.toLowerCase().includes(ql)) : null;
  // 즐겨찾기 — 접힌 그룹 위에 상시 노출(최대 6개)
  const [favs, setFavs] = useState<ToolKey[]>(() => {
    try { return JSON.parse(localStorage.getItem('nuri:fav-tools') || '[]'); } catch { return []; }
  });
  const toggleFav = (k: ToolKey) => setFavs((prev) => {
    const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k].slice(-6);
    try { localStorage.setItem('nuri:fav-tools', JSON.stringify(next)); } catch { /* quota */ }
    return next;
  });
  const favTools = favs.map((k) => TOOLS.find((t) => t.key === k)).filter(Boolean) as typeof TOOLS;

  // 다른 곳(공유 링크)에서 해시가 바뀌면 반영
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
      {/* 도구 검색 */}
      <div className="relative">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden>
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="도구 검색 — 이름·기능"
          className="input w-full pl-9 text-sm" aria-label="도구 검색" />
      </div>

      {/* 🕐 최근 사용 — 마지막으로 쓴 도구로 원탭 복귀 */}
      {!hits && recent.length > 0 && (
        <section className="space-y-1.5">
          <p className="text-2xs font-bold text-ink-muted">🕐 최근 사용</p>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((k) => {
              const t = TOOLS.find((x) => x.key === k);
              if (!t) return null;
              return (
                <button key={k} type="button" onClick={() => open(k)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-input border border-border-default bg-surface-high px-3 text-xs font-semibold text-ink-secondary transition-colors hover:text-ink-primary">
                  {t.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ★ 즐겨찾기 — 그룹이 접혀 있어도 항상 보이는 내 도구 */}
      {!hits && favTools.length > 0 && (
        <section className="space-y-2">
          <p className="text-2xs font-bold text-accent-200">★ 즐겨찾기</p>
          {grid(favTools)}
        </section>
      )}

      {hits ? (
        hits.length === 0
          ? <p className="py-8 text-center text-2xs text-ink-muted">'{q.trim()}' 에 맞는 도구가 없습니다</p>
          : grid(hits)
      ) : (
        GROUPS.map((g) => {
          const items = TOOLS.filter((t) => t.group === g.id);
          const opened = !!openG[g.id];
          const preview = items.slice(0, 3).map((t) => t.name).join(' · ');
          return (
            <section key={g.id} className="rounded-card border border-border-default bg-surface-low overflow-hidden">
              <button type="button" onClick={() => toggleG(g.id)} aria-expanded={opened}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left hover:bg-surface-high/50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-primary">{g.title} <span className="ml-1 text-2xs font-semibold text-ink-muted">{items.length}개</span></p>
                  <p className="mt-0.5 truncate text-2xs text-ink-muted">{opened ? g.desc : `${preview} 외 ${Math.max(0, items.length - 3)}개`}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                  className={['shrink-0 text-ink-muted transition-transform duration-200', opened ? 'rotate-180' : ''].join(' ')} aria-hidden>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {opened && <div className="border-t border-border-subtle p-2.5 animate-fade-in">{grid(items)}</div>}
            </section>
          );
        })
      )}

      {/* 도구 실행 — 전체화면 페이지(헤더·뒤로가기·드래그 닫기 = 앱 공통 문법) */}
      <Modal open={!!activeTool} onClose={close} variant="page" title={activeTool?.name} maxWidth="2xl">
        <div className="px-page-x py-3 pb-8">
          <Suspense fallback={<div className="py-10 text-center text-2xs text-ink-muted">불러오는 중…</div>}>
            {active ? renderTool(active) : null}
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
          {/* 이름은 절대 안 자른다 — 2줄까지 허용. 설명은 칸이 넉넉한 화면에서만 */}
          <span className="block text-xs font-bold text-ink-primary leading-tight [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">{name}</span>
          <span className="hidden sm:block truncate text-2xs text-ink-muted leading-snug mt-0.5">{desc}</span>
        </span>
      </button>
      {onToggleFav && (
        <button type="button" onClick={onToggleFav} aria-label={fav ? `${name} 즐겨찾기 해제` : `${name} 즐겨찾기 추가`} aria-pressed={fav}
          className={['absolute right-0.5 top-1/2 -translate-y-1/2 flex h-9 w-8 items-center justify-center text-sm leading-none transition-opacity',
            fav ? 'text-accent-300 opacity-100' : 'text-ink-muted opacity-30 hover:opacity-70'].join(' ')}>
          {fav ? '★' : '☆'}
        </button>
      )}
    </div>
  );
}
