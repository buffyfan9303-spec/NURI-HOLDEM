import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// 모달마다 고유 토큰을 부여하기 위한 증가 카운터(중첩 모달 구분용)
let modalSeq = 0;

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
  // onClose 최신값을 ref로 유지 (history 이펙트가 매 렌더마다 재실행되지 않도록)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

  // 뒤로가기(브라우저/모바일 back)로 "페이지 이탈" 대신 "모달만 닫기"
  //  - 열릴 때 히스토리 항목을 하나 push 하고, popstate(뒤로가기) 시 모달을 닫는다.
  //  - 중첩 모달도 안전하도록 고유 토큰을 비교해, 내 토큰이 최상단이 아닐 때만 닫는다.
  //  - 닫기버튼/ESC/배경클릭 등으로 닫힌 경우엔 push 했던 항목을 정리(back)해 히스토리를 균형 있게 유지.
  useEffect(() => {
    if (!open) return;
    const token = ++modalSeq;
    window.history.pushState({ __modalToken: token }, '');
    const onPop = () => {
      const st = window.history.state as { __modalToken?: number } | null;
      if (!st || st.__modalToken !== token) onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      const st = window.history.state as { __modalToken?: number } | null;
      if (st && st.__modalToken === token) window.history.back();
    };
  }, [open]);

  // 열기/닫기 애니메이션: 닫힐 때 잠깐 더 렌더링하여 시트가 아래로 슬라이드되며 사라지게 한다.
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setRender(true); setClosing(false); return; }
    setClosing(true);
    const t = window.setTimeout(() => setRender(false), 200);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!render) return null;

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
