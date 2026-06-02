// src/components/features/gto/GtoStudyWidget.tsx
import { useState } from 'react';
import GtoViewerModal from './GtoViewerModal';

/** 커뮤니티 > 홀덤 공부 탭 진입 위젯 */
export default function GtoStudyWidget() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-card border border-gold-400/40 bg-gradient-to-br from-gold-300/[0.08] to-transparent p-3 text-left transition-all hover:border-gold-300 active:scale-[0.99]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-300/15 text-gold-300">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink-primary">GTO 프리플랍 뷰어</span>
          <span className="block text-2xs text-ink-muted">포지션별 레이즈/콜/폴드 빈도를 카드로 빠르게 확인</span>
        </span>
        <span className="shrink-0 text-2xs font-bold text-gold-300">열기</span>
      </button>

      <GtoViewerModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
