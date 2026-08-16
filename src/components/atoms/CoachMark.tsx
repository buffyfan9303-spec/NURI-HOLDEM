// CoachMark — 문맥형 1회성 힌트 (마스터 지시서 Phase 13-1)
//
// 풀스크린 투어는 스킵된다 — 대신 해당 UI 를 처음 본 순간, 그 자리에서, 1개씩.
// 좌표 기반 스포트라이트는 반응형에서 깨지기 쉬워(기존 온보딩 주석의 교훈) 쓰지 않는다:
// 이 컴포넌트는 **기능 컴포넌트가 대상 바로 옆에 인라인으로** 배치한다. 레이아웃 문법을
// 그대로 따르므로 어떤 화면 폭에서도 깨질 수 없다.
//
// 노출 기록: localStorage `nuri:seen:<id>` — [확인] 을 누르면 영구 미노출.
import { useState } from 'react';

const seenKey = (id: string) => `nuri:seen:${id}`;

export default function CoachMark({ id, children }: { id: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem(seenKey(id)); } catch { return false; }
  });
  if (!visible) return null;
  const dismiss = () => {
    try { localStorage.setItem(seenKey(id), '1'); } catch { /* noop */ }
    setVisible(false);
  };
  return (
    <div role="note" className="flex items-start gap-2 rounded-card border border-accent-400/40 bg-accent-300/[0.08] px-3 py-2 animate-fade-in">
      <span aria-hidden className="shrink-0 text-sm leading-5">💡</span>
      <p className="min-w-0 flex-1 text-xs leading-5 text-ink-secondary">{children}</p>
      <button type="button" onClick={dismiss}
        className="shrink-0 -my-1 inline-flex h-8 items-center rounded-input px-2.5 text-xs font-bold text-accent-300 hover:bg-accent-300/10 transition-colors">
        확인
      </button>
    </div>
  );
}
