// src/components/features/StoreToolsPanel.tsx
// 운영 도구 5종(칩 분배기·구조 시뮬·블라인드 생성기·상금 분배·종료시간 예측) — §7 ⑥b:
// GTO 탭(유저 학습 도구)에서 내 매장 '매장 설정 > 운영 도구'로 이관.
// 레지스트리·렌더러는 ToolsPanel 을 재사용(중복 정의 0) — #tool= 딥링크 하위호환도 그쪽이 유지.
import { useState, Suspense, type ReactNode } from 'react';
import Modal from '../atoms/Modal';
import { getStoreTools, renderStoreTool, type StoreToolKey } from './ToolsPanel';

export default function StoreToolsPanel() {
  const [active, setActive] = useState<StoreToolKey | null>(null);
  const tools = getStoreTools();
  const activeTool = active ? tools.find((t) => t.key === active) : null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {tools.map((t) => (
          <button key={t.key} type="button" onClick={() => setActive(t.key)}
            className="flex w-full items-center gap-2.5 rounded-card border border-border-default bg-surface-low px-2.5 py-2 text-left transition-colors hover:border-accent-400/40 hover:bg-surface-high active:scale-[0.98]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-accent-300/15 text-accent-300" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.icon as ReactNode}</svg>
            </span>
            <span className="min-w-0 flex-1">
              {/* GTO 탭 카드와 같은 규격 — 이름 2줄 예약으로 전 칸 동일 높이 */}
              <span className="block min-h-[2.5em] text-xs font-bold text-ink-primary leading-tight [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden content-center">{t.name}</span>
              <span className="block truncate text-2xs text-ink-muted leading-snug mt-0.5">{t.desc}</span>
            </span>
          </button>
        ))}
      </div>
      <Modal open={!!activeTool} onClose={() => setActive(null)} variant="page" title={activeTool?.name} maxWidth="2xl">
        <div className="px-page-x py-3 pb-8">
          <Suspense fallback={<div className="py-10 text-center text-2xs text-ink-muted">불러오는 중…</div>}>
            {active ? renderStoreTool(active) : null}
          </Suspense>
        </div>
      </Modal>
    </div>
  );
}
