import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useBackClose } from '../../lib/backstack';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** sheet: 하단 시트 / center: 센터 / page: 전체화면 불투명 페이지(뒤 비침 없음) */
  variant?: 'center' | 'sheet' | 'page';
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
  // ESC 키로 닫기 + 바디 스크롤 잠금
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

  // 뒤로가기(브라우저/모바일 back) → 페이지 이탈 대신 "이 모달만" 닫기.
  // 중앙 back-stack 매니저가 중첩/충돌/이중 pop 을 모두 처리한다.
  useBackClose(open, onClose);

  // 열기/닫기 애니메이션: 닫힐 때 잠깐 더 렌더링하여 시트가 아래로 슬라이드되며 사라지게 한다.
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setRender(true); setClosing(false); return; }
    setClosing(true);
    const t = window.setTimeout(() => setRender(false), 200);
    return () => window.clearTimeout(t);
  }, [open]);

  // 접근성: 모달 내부 포커스 트랩 + 열릴 때 첫 포커스(키보드 내비)
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const el = contentRef.current;
    if (!el) return;
    const focusables = () => Array.from(
      el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'),
    ).filter((n) => n.offsetParent !== null);
    const t = window.setTimeout(() => { (focusables()[0] ?? el).focus(); }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(t); el.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!render) return null;

  // 전체화면 페이지 변형 — 불투명 배경으로 뒤 페이지가 절대 비치지 않음(스크롤 누수 방지)
  if (variant === 'page') {
    return (
      <div ref={contentRef} className={['fixed inset-0 z-[55] bg-surface-base flex flex-col', closing ? 'animate-fade-out' : 'animate-fade-in'].join(' ')}>
        {title && (
          <header className="shrink-0 flex items-center justify-between px-4 h-header-h border-b border-border-subtle bg-surface-base">
            <h2 id="modal-title" className="text-base font-semibold text-ink-primary">{title}</h2>
            <button type="button" onClick={onClose} aria-label="닫기"
              className="w-9 h-9 -mr-1 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors">
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
              </svg>
            </button>
          </header>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className={['mx-auto w-full', MAX_W[maxWidth]].join(' ')}>{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={['fixed inset-0 z-50 flex', closing ? 'animate-fade-out' : 'animate-fade-in'].join(' ')}
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
        className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-default"
      />
      {/* 본문 */}
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={[
          'relative w-full bg-surface-mid shadow-dialog',
          closing
            ? (variant === 'sheet' ? 'animate-slide-down' : 'animate-fade-out')
            : 'animate-slide-up',
          variant === 'sheet'
            ? 'rounded-t-dialog sm:rounded-dialog sm:my-auto sm:max-h-[85vh]'
            : 'rounded-dialog my-auto max-h-[85vh]',
          MAX_W[maxWidth],
          'flex flex-col overflow-hidden',
        ].join(' ')}
        style={{
          // 시트는 상단에 여백을 남겨(상단이 눌려 보이지 않도록) 88vh 로 제한
          maxHeight: variant === 'sheet' ? '88vh' : '85vh',
          // fillHeight: 콘텐츠 양과 무관하게 높이 고정 (탭 전환 시 크기 변동 방지)
          height: fillHeight ? (variant === 'sheet' ? '88vh' : '85vh') : undefined,
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
