// src/components/features/CalendarToolsPanel.tsx
// 자금 도구 2종(뱅크롤 관리 · 분산 시뮬) — 2026-09-11 오너 지시로 GTO 탭에서 캘린더 뱅크롤로 이관.
//
// 왜 옮겼나: 이 둘은 '전략을 배우는 도구'가 아니라 '내 돈을 관리하는 도구'다. GTO 탭 계산기 레인에
// 있으면 레인지·에퀴티 도구와 섞여 무엇을 하러 온 화면인지 흐려진다. 캘린더의 수기 뱅크롤 기록
// 바로 옆이 이 둘의 자리다 — 거기서 실제 참가비·순손익을 보며 권장선을 확인하게 된다.
//
// 레지스트리·렌더러는 ToolsPanel 을 재사용한다(중복 정의 0). #tool= 딥링크 하위호환도 그쪽이 유지한다.
// StoreToolsPanel 과 **같은 조리법**이다 — 두 이관이 다른 방식이면 다음 사람이 어느 쪽을 따를지 모른다.
import { useState, Suspense } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import { getCalendarTools, renderCalendarTool, type CalendarToolKey } from './ToolsPanel';

export default function CalendarToolsPanel() {
  const [active, setActive] = useState<CalendarToolKey | null>(null);
  const tools = getCalendarTools();
  const activeTool = active ? tools.find((t) => t.key === active) : null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {tools.map((t) => (
          <button key={t.key} type="button" onClick={() => setActive(t.key)}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-aura border card-aura p-2.5 text-left transition-colors hover:border-accent-400/40 hover:bg-surface-high active:scale-[0.98]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-accent-300/15 text-accent-300" aria-hidden>
              <Icon name={t.icon} size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-ink-primary">{t.name}</span>
              <span className="mt-0.5 block truncate text-2xs text-ink-muted">{t.desc}</span>
            </span>
          </button>
        ))}
      </div>
      {/* ⚠ display:contents 래퍼 — 부모의 space-y margin 이 Modal(fixed inset-0)에 먹으면
          전체화면 상단이 내려앉아 뒤 화면이 비친다(ToolsPanel·StoreToolsPanel 과 같은 규격). */}
      <div className="contents">
        <Modal open={!!activeTool} onClose={() => setActive(null)} variant="page" title={activeTool?.name} maxWidth="2xl">
          <div className="px-page-x py-3 pb-8">
            <Suspense fallback={<div className="py-10 text-center text-2xs text-ink-muted">불러오는 중…</div>}>
              {active ? renderCalendarTool(active) : null}
            </Suspense>
          </div>
        </Modal>
      </div>
    </div>
  );
}
