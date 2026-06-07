import { useState, Suspense, type ReactNode } from 'react';
import { lazyWithReload } from '../../lib/lazyWithReload';
import ICMCalculator from './ICMCalculator';
import PotOddsCalc from './tools/PotOddsCalc';
import ChipDistributor from './tools/ChipDistributor';
import StructureSim from './tools/StructureSim';
import RangeGuide from './tools/RangeGuide';

// GTO 패널은 에퀴티 엔진을 포함해 무거우므로 지연 로드(다른 도구와 동일하게 인라인 표시)
const GtoDeepPanel = lazyWithReload(() => import('./gto/GtoDeepPanel'));

type ToolKey = 'gto' | 'pot' | 'icm' | 'range' | 'chip' | 'sim';
type ToolGroup = 'ops' | 'player';

const TOOLS: { key: ToolKey; group: ToolGroup; name: string; desc: string; icon: ReactNode }[] = [
  // ── 매장 운영 도구 ──
  { key: 'chip', group: 'ops', name: '칩 분배기', desc: '스택 구성·총 칩 수',
    icon: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></> },
  { key: 'sim', group: 'ops', name: '구조 시뮬', desc: '총 칩·평균 스택 깊이',
    icon: <><line x1="4" y1="20" x2="4" y2="11" /><line x1="10" y1="20" x2="10" y2="4" /><line x1="16" y1="20" x2="16" y2="14" /><line x1="20" y1="20" x2="20" y2="8" /></> },
  // ── 플레이어 도구 ──
  { key: 'gto', group: 'player', name: 'GTO 핸드 분석', desc: '프리/포스트플랍 승률·전략',
    icon: <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></> },
  { key: 'range', group: 'player', name: '스타팅핸드 가이드', desc: '포지션별 프리플랍 레인지',
    icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="21" /></> },
  { key: 'pot', group: 'player', name: '팟 오즈 계산기', desc: '콜에 필요한 승률 계산',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { key: 'icm', group: 'player', name: 'ICM 계산기', desc: '토너먼트 기대 상금',
    icon: <><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="12" y2="15" /></> },
];

const GROUPS: { id: ToolGroup; title: string; desc: string }[] = [
  { id: 'ops', title: '매장 운영 도구', desc: '토너먼트 운영·세팅용' },
  { id: 'player', title: '플레이어 도구', desc: '실전 플레이·전략용' },
];

function renderTool(k: ToolKey): ReactNode {
  switch (k) {
    case 'gto': return <GtoDeepPanel />;
    case 'pot': return <PotOddsCalc />;
    case 'icm': return <ICMCalculator />;
    case 'range': return <RangeGuide />;
    case 'chip': return <ChipDistributor />;
    case 'sim': return <StructureSim />;
    default: return null;
  }
}

/** 도구 모음 — 카드형 런처. 매장 운영 / 플레이어 두 그룹. 카드를 누르면 인라인으로 펼쳐진다. */
export default function ToolsPanel() {
  const [active, setActive] = useState<ToolKey | null>(null);
  const select = (k: ToolKey) => setActive((a) => (a === k ? null : k));

  return (
    <div className="space-y-4">
      <p className="text-2xs text-ink-muted">홀덤 운영·플레이에 쓰는 도구 모음입니다. 카드를 눌러 실행하세요.</p>

      {GROUPS.map((g) => {
        const items = TOOLS.filter((t) => t.group === g.id);
        const activeInGroup = items.some((t) => t.key === active) ? active : null;
        return (
          <section key={g.id} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-bold text-ink-primary">{g.title}</h3>
              <span className="text-2xs text-ink-muted">{g.desc}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {items.map((t) => (
                <ToolCard key={t.key} name={t.name} desc={t.desc} icon={t.icon} active={active === t.key} onClick={() => select(t.key)} />
              ))}
            </div>
            {activeInGroup && (
              <Suspense fallback={<div className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</div>}>
                <div className="animate-fade-in pt-1">{renderTool(activeInGroup)}</div>
              </Suspense>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ToolCard({ name, desc, icon, onClick, active }: { name: string; desc: string; icon: ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={['flex flex-col items-start gap-2 rounded-card border p-3 text-left transition-colors active:scale-[0.98]',
        active ? 'border-gold-400/60 bg-gold-300/[0.08]' : 'border-border-default bg-surface-low hover:border-gold-400/40 hover:bg-surface-high'].join(' ')}>
      <span className="flex h-9 w-9 items-center justify-center rounded-input bg-gold-300/15 text-gold-300">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink-primary">{name}</span>
        <span className="block text-2xs text-ink-muted leading-snug">{desc}</span>
      </span>
    </button>
  );
}
