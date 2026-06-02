// src/components/features/gto/GtoViewerModal.tsx
import { useState } from 'react';
import Modal from '../../atoms/Modal';
import { useGtoCalculator } from './useGtoCalculator';
import SelectedHandDisplay from './SelectedHandDisplay';
import GtoKeypad from './GtoKeypad';
import ActionDonutChart from './ActionDonutChart';
import AiExplainSheet from './AiExplainSheet';

export default function GtoViewerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const gto = useGtoCalculator();
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title="GTO 프리플랍 뷰어" variant="sheet" maxWidth="md" fillHeight>
      <div className="space-y-4 px-4 py-3">
        {/* 시나리오 선택 */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 scrollbar-none">
          {gto.scenarios.map((s) => {
            const active = gto.scenario.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => gto.selectScenario(s.id)}
                className={[
                  'h-9 shrink-0 rounded-input px-3 text-xs font-semibold transition-colors',
                  active ? 'bg-gold-300 text-ink-inverse' : 'border border-border-default bg-surface-high text-ink-secondary',
                ].join(' ')}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        {gto.scenario.description && (
          <p className="text-center text-2xs text-ink-muted">{gto.scenario.description}</p>
        )}

        <SelectedHandDisplay ranks={gto.ranks} combo={gto.combo} suitedness={gto.suitedness} />
        <ActionDonutChart frequency={gto.normalized} />

        <button
          type="button"
          onClick={() => setAiOpen(true)}
          disabled={!gto.isComplete}
          className="btn-ghost inline-flex w-full items-center justify-center gap-2 py-2.5 disabled:opacity-50"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
          AI 해설 보기
        </button>
      </div>

      {/* 하단 고정 키패드 */}
      <div className="sticky bottom-0 border-t border-border-subtle bg-surface-mid px-3 py-3">
        <GtoKeypad
          ranks={gto.ranks}
          suitedness={gto.suitedness}
          isPair={gto.isPair}
          onRank={gto.pushRank}
          onSuitedness={gto.setSuitedness}
          onRemoveLast={gto.removeLast}
          onClear={gto.clear}
        />
      </div>

      <AiExplainSheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        scenario={gto.scenario}
        combo={gto.combo}
        frequency={gto.frequency}
      />
    </Modal>
  );
}
