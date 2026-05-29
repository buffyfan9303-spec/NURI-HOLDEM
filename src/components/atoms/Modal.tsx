import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** bottomSheet: 모바일에서 하단 시트, 데스크톱에서 센터 모달 */
  variant?: 'center' | 'sheet';
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg';
  /** true면 모달 높이를 최대치로 고정 (탭 전환 시 크기 변동 방지) */
  fillHeight?: boolean;
}

const MAX_W: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export default function Modal({
  open, onClose, title, children, variant = 'sheet', maxWidth = 'md', fillHeight = false,
}: ModalProps) {
  // ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in"
      style={{
        alignItems: variant === 'sheet' ? 'flex-end' : 'center',
        justifyContent: 'center',
      }}
    >
      {/* 배경 dim */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
      />
      {/* 본문 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={[
          'relative w-full bg-surface-mid shadow-dialog',
          'animate-slide-up',
          variant === 'sheet'
            ? 'rounded-t-dialog sm:rounded-dialog sm:my-auto sm:max-h-[85vh]'
            : 'rounded-dialog my-auto max-h-[85vh]',
          MAX_W[maxWidth],
          'flex flex-col overflow-hidden',
        ].join(' ')}
        style={{
          maxHeight: variant === 'sheet' ? '92vh' : '85vh',
          // fillHeight: 콘텐츠 양과 무관하게 높이 고정 (탭 전환 시 크기 변동 방지)
          height: fillHeight ? (variant === 'sheet' ? '92vh' : '85vh') : undefined,
        }}
      >
        {/* 그립 핸들 (sheet 전용) */}
        {variant === 'sheet' && (
          <div className="flex justify-center pt-2 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-border-strong" aria-hidden />
          </div>
        )}

        {/* 헤더 */}
        {title && (
          <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <h2 id="modal-title" className="text-base font-semibold text-ink-primary">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <line x1="2" y1="2" x2="12" y2="12" />
                <line x1="12" y1="2" x2="2" y2="12" />
              </svg>
            </button>
          </header>
        )}

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
