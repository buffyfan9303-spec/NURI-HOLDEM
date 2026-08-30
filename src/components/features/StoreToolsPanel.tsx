// src/components/features/StoreToolsPanel.tsx
// 운영 도구 5종(칩 분배기·구조 시뮬·블라인드 생성기·상금 분배·종료시간 예측) — §7 ⑥b:
// GTO 탭(유저 학습 도구)에서 내 매장 '매장 설정 > 운영 도구'로 이관.
// 레지스트리·렌더러는 ToolsPanel 을 재사용(중복 정의 0) — #tool= 딥링크 하위호환도 그쪽이 유지.
import { useState, Suspense, type ReactNode } from 'react';
import Modal from '../atoms/Modal';
import { getStoreTools, renderStoreTool, type StoreToolKey } from './ToolsPanel';

// ── PC 밀도 규약(오너 #5, 2026-08-30) ────────────────────────────────────────
// 간격은 4단만 쓴다: gap-1(4.25px) 아이콘↔글자 · gap-2(8.5) 카드 안 요소 ·
// gap-3(12.75) 카드 패딩·카드 사이 · gap-5(21.25) 섹션 경계. (1rem = 17px)
// 행간은 §T1 역할표를 따른다 — 설명문 t-desc(12.75/19.13), 메타 text-2xs(11.69/15.94).
export default function StoreToolsPanel() {
  const [active, setActive] = useState<StoreToolKey | null>(null);
  const tools = getStoreTools();
  const activeTool = active ? tools.find((t) => t.key === active) : null;
  return (
    <div className="space-y-3">
      {/* 칸 수는 GTO 탭과 같은 4단 유지 — 5칸으로 늘려 봤더니(1440 실측 칸폭 159px)
          '블라인드 생성기' 제목이 잘리고 설명이 '스택 구성·총 칩 / 수'로 끊겨 더 나빠졌다.
          1440 에서 4칸이면 칸폭 202px 로 제목·설명이 온전히 들어간다. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tools.map((t) => (
          <button key={t.key} type="button" onClick={() => setActive(t.key)}
            className="flex w-full items-center gap-2 rounded-card border border-border-default bg-surface-low p-3 text-left transition-colors hover:border-accent-400/40 hover:bg-surface-high active:scale-[0.98]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-accent-300/15 text-accent-300" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.icon as ReactNode}</svg>
            </span>
            <span className="min-w-0 flex-1">
              {/* ⚠ 줄 예약을 이름(2줄)에서 설명(2줄)으로 옮겼다.
                  매장 운영 도구 5종의 이름은 전부 1줄인데 2줄을 예약해 칸마다 15px 빈 줄이 남았고,
                  정작 잘리던 것은 설명 쪽이었다('레벨·브레이크 → 종료 …'가 truncate 로 잘림).
                  이름 1줄 + 설명 2줄 예약이면 전 칸 높이는 그대로 같고, 잘리는 글자는 사라진다. */}
              <span className="block truncate text-xs font-bold text-ink-primary">{t.name}</span>
              <span className="mt-1 block min-h-[1.875rem] text-2xs text-ink-muted [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden break-keep">{t.desc}</span>
            </span>
          </button>
        ))}
      </div>
      {/* ⚠ display:contents 래퍼 — GTO 탭과 동일 규격. 루트 space-y-3 의 margin-top 이
          Modal(fixed inset-0)에 적용되면 전체화면 상단이 0.5rem 내려앉아 뒤 화면이 비친다(ToolsPanel 참고). */}
      <div className="contents">
      <Modal open={!!activeTool} onClose={() => setActive(null)} variant="page" title={activeTool?.name} maxWidth="2xl">
        <div className="px-page-x py-3 pb-8">
          <Suspense fallback={<div className="py-10 text-center text-2xs text-ink-muted">불러오는 중…</div>}>
            {active ? renderStoreTool(active) : null}
          </Suspense>
        </div>
      </Modal>
      </div>
    </div>
  );
}
