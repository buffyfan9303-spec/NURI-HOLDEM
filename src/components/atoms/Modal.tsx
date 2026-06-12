import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useBackClose } from '../../lib/backstack';
import Icon from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** sheet: 하단 시트 / center: 센터 / page: 전체화면 불투명 페이지(뒤 비침 없음) */
  variant?: 'center' | 'sheet' | 'page';
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl';
  /** true면 모달 높이를 최대치로 고정 (탭 전환 시 크기 변동 방지) */
  fillHeight?: boolean;
  /** true면 오버레이가 아닌 인라인 패널로 렌더(데스크탑 2-pane 우측 패널용). */
  inline?: boolean;
}

const MAX_W: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
};

export default function Modal({
  open, onClose, title, children, variant = 'sheet', maxWidth = 'md', fillHeight = false, inline = false,
}: ModalProps) {
  // ESC 키로 닫기 + 바디 스크롤 잠금
  useEffect(() => {
    if (!open || inline) return;
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
  useBackClose(open && !inline, onClose);

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
  // 드래그 시트(page·모바일) — 컨텐츠가 맨 위일 때 아래로 끌면 시트가 따라오고, 120px 넘으면 닫힌다(애플 지도 문법)
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const sheetStart = useRef<number | null>(null);
  const onSheetStart = (e: React.TouchEvent) => {
    if (window.innerWidth >= 1024) return;
    if ((pageScrollRef.current?.scrollTop ?? 1) <= 0) sheetStart.current = e.touches[0].clientY;
  };
  const onSheetMove = (e: React.TouchEvent) => {
    if (sheetStart.current == null) return;
    const dy = e.touches[0].clientY - sheetStart.current;
    if ((pageScrollRef.current?.scrollTop ?? 1) > 0) { sheetStart.current = null; setDragY(0); return; }
    setDragY(dy > 0 ? dy * 0.55 : 0);
  };
  const onSheetEnd = () => {
    const pulled = dragY;
    sheetStart.current = null;
    setDragY(0);
    if (pulled > 120) onClose();
  };
  useEffect(() => {
    if (!open || inline) return;
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

  // 인라인 패널(2-pane 우측) — 오버레이/딤/백버튼 없이 콘텐츠만 카드로.
  if (inline) {
    if (!open) return null;
    return (
      <div className="flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden rounded-card border border-border-default bg-surface-mid">
        {title && (
          <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
            <h2 className="text-[17px] font-bold tracking-tight text-ink-primary">{title}</h2>
            <button type="button" onClick={onClose} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-input text-ink-secondary hover:bg-surface-high hover:text-ink-primary">
              <Icon name="close" size={14} />
            </button>
          </header>
        )}
        <div className="flex-1 overflow-y-auto"><div className={['mx-auto w-full', MAX_W[maxWidth]].join(' ')}>{children}</div></div>
      </div>
    );
  }

  if (!render) return null;

  // 전체화면 페이지 변형 — 불투명 배경으로 뒤 페이지가 절대 비치지 않음(스크롤 누수 방지)
  if (variant === 'page') {
    return (
      <div ref={contentRef}
        onTouchStart={onSheetStart} onTouchMove={onSheetMove} onTouchEnd={onSheetEnd}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : { transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)' }}
        className={['fixed inset-0 z-[55] bg-surface-base flex flex-col', closing ? 'animate-fade-out' : 'animate-fade-in'].join(' ')}>
        {/* 드래그 핸들(모바일) — 시트를 끌어내려 닫기 */}
        <div aria-hidden className="lg:hidden absolute top-1.5 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20" />
        {title && (
          <header className="shrink-0 flex items-center justify-between px-4 h-header-h border-b border-border-subtle bg-surface-base">
            <h2 id="modal-title" className="text-[17px] font-bold tracking-tight text-ink-primary">{title}</h2>
            <button type="button" onClick={onClose} aria-label="닫기"
              className="w-11 h-11 -mr-2 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors">
              <Icon name="close" size={18} />
            </button>
          </header>
        )}
        <div ref={pageScrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          <div className={['mx-auto w-full', MAX_W[maxWidth]].join(' ')}>{children}</div>
        </div>
      </div>
    );
  }

  return (
    // z-[60]: 전체화면 page 변형(z-[55]) 위에도 항상 뜨도록 — 예: 포스터 상세에서 '대회 후기 쓰기' 글쓰기 모달
    <div className={['fixed inset-0 z-[60] flex', closing ? 'animate-fade-out' : 'animate-fade-in'].join(' ')}
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
            <h2 id="modal-title" className="text-[17px] font-bold tracking-tight text-ink-primary">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              // 44px 터치 표준 — 작아서 빗나가던 닫기 버튼 전역 교정
              className="w-11 h-11 -mr-2 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors"
            >
              <Icon name="close" size={18} />
            </button>
          </header>
        )}

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
