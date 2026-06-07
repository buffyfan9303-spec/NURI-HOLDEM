import { useState, Suspense, type ReactNode } from 'react';
import { lazyWithReload } from '../../lib/lazyWithReload';
import ICMCalculator from './ICMCalculator';

const GtoDeepModal = lazyWithReload(() => import('./gto/GtoDeepModal'));

/**
 * 도구 모음 — 홀덤 플레이·운영 계산기 런처. 카드를 추가하기만 하면 도구가 늘어난다.
 * GTO=모달 / ICM=인라인 펼침.
 */
export default function ToolsPanel() {
  const [gtoOpen, setGtoOpen] = useState(false);
  const [icmOpen, setIcmOpen] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-2xs text-ink-muted">홀덤 플레이·운영에 쓰는 도구 모음입니다. 카드를 눌러 실행하세요.</p>

      <div className="grid grid-cols-2 gap-2.5">
        <ToolCard
          name="GTO 핸드 분석"
          desc="프리/포스트플랍 승률·전략"
          onClick={() => setGtoOpen(true)}
          icon={<><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></>}
        />
        <ToolCard
          name="ICM 계산기"
          desc="토너먼트 기대 상금 계산"
          active={icmOpen}
          onClick={() => setIcmOpen((v) => !v)}
          icon={<><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="12" y2="15" /></>}
        />
      </div>

      {icmOpen && <div className="animate-fade-in"><ICMCalculator /></div>}

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
