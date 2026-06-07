import { useState, Suspense, type ReactNode } from 'react';
import { lazyWithReload } from '../../lib/lazyWithReload';
import ICMCalculator from './ICMCalculator';
import PotOddsCalc from './tools/PotOddsCalc';
import ChipDistributor from './tools/ChipDistributor';
import StructureSim from './tools/StructureSim';

const GtoDeepModal = lazyWithReload(() => import('./gto/GtoDeepModal'));

type ToolKey = 'gto' | 'pot' | 'icm' | 'chip' | 'sim';

const TOOLS: { key: ToolKey; name: string; desc: string; icon: ReactNode }[] = [
  { key: 'gto', name: 'GTO 핸드 분석', desc: '프리/포스트플랍 승률·전략',
    icon: <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></> },
  { key: 'pot', name: '팟 오즈 계산기', desc: '콜에 필요한 승률 계산',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { key: 'icm', name: 'ICM 계산기', desc: '토너먼트 기대 상금',
    icon: <><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="12" y2="15" /></> },
  { key: 'chip', name: '칩 분배기', desc: '스택 구성·총 칩 수',
    icon: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></> },
  { key: 'sim', name: '구조 시뮬', desc: '총 칩·평균 스택 깊이',
    icon: <><line x1="4" y1="20" x2="4" y2="11" /><line x1="10" y1="20" x2="10" y2="4" /><line x1="16" y1="20" x2="16" y2="14" /><line x1="20" y1="20" x2="20" y2="8" /></> },
];

/** 도구 모음 — 카드형 런처. 카드를 추가하기만 하면 도구가 늘어난다. GTO=모달 / 나머지=인라인 펼침. */
export default function ToolsPanel() {
  const [active, setActive] = useState<ToolKey | null>(null);
  const [gtoOpen, setGtoOpen] = useState(false);
  const select = (k: ToolKey) => { if (k === 'gto') { setGtoOpen(true); return; } setActive((a) => (a === k ? null : k)); };

  return (
    <div className="space-y-3">
      <p className="text-2xs text-ink-muted">홀덤 플레이·운영에 쓰는 도구 모음입니다. 카드를 눌러 실행하세요.</p>

      <div className="grid grid-cols-2 gap-2.5">
        {TOOLS.map((t) => (
          <ToolCard key={t.key} name={t.name} desc={t.desc} icon={t.icon} active={active === t.key} onClick={() => select(t.key)} />
        ))}
      </div>

      {active === 'pot' && <div className="animate-fade-in"><PotOddsCalc /></div>}
      {active === 'icm' && <div className="animate-fade-in"><ICMCalculator /></div>}
      {active === 'chip' && <div className="animate-fade-in"><ChipDistributor /></div>}
      {active === 'sim' && <div className="animate-fade-in"><StructureSim /></div>}

      <Suspense fallback={null}>
        {gtoOpen && <GtoDeepModal open={gtoOpen} onClose={() => setGtoOpen(false)} />}
      </Suspense>
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
