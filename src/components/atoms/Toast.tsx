import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';

// ── 토스트 타입 ─────────────────────────────────────────────────────────────

export type ToastVariant = 'info' | 'success' | 'error';

/** 토스트 안의 실행 버튼 — '삭제됨 · 되돌리기' 처럼 되돌릴 마지막 기회를 주는 용도 */
export interface ToastAction { label: string; onClick: () => void }

export interface ToastOptions {
  /** 되돌리기 등 즉시 실행 버튼. 있으면 기본 노출 시간이 길어진다(읽고 누를 시간). */
  action?: ToastAction;
  /** 노출 시간(ms). 미지정 시 action 있으면 6초, 없으면 2.4초 */
  durationMs?: number;
}

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
  durationMs: number;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- Provider+훅 동거(컨텍스트 표준 패턴)
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// ── Provider ────────────────────────────────────────────────────────────────

const COLOR: Record<ToastVariant, string> = {
  info:    'bg-surface-float text-ink-primary border-border-strong',
  success: 'bg-emerald-500/90 text-white border-emerald-400',
  error:   'bg-danger text-white border-danger-dark',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, variant: ToastVariant = 'info', opts?: ToastOptions) => {
    const id = Date.now() + Math.random();
    // 되돌리기 버튼이 있으면 읽고 누를 시간이 필요하다 — 2.4초로는 손이 못 따라간다.
    const durationMs = opts?.durationMs ?? (opts?.action ? 6000 : 2400);
    setToasts((prev) => [...prev, { id, message, variant, action: opts?.action, durationMs }]);
    // 햅틱 피드백(모바일) — 성공 10ms 한 번, 에러는 짧게 두 번(네이티브 앱 감각)
    try {
      if (variant === 'success') navigator.vibrate?.(10);
      else if (variant === 'error') navigator.vibrate?.([18, 40, 18]);
    } catch { /* 미지원 무시 */ }
    setTimeout(() => { dismiss(id); }, durationMs);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* 토스트 컨테이너 — fixed 하단 중앙 */}
      <div
        aria-live="polite"
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] lg:bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ message, variant, action, durationMs, onDismiss }: Toast & { onDismiss: () => void }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    // 사라지기 300ms 전부터 페이드 — 컨테이너의 제거 타이밍과 맞춘다
    const t = setTimeout(() => setOut(true), Math.max(0, durationMs - 300));
    return () => clearTimeout(t);
  }, [durationMs]);
  return (
    <div
      role="status"
      className={[
        'inline-flex items-center gap-2 px-4 py-2.5 rounded-input border shadow-dialog',
        'text-sm font-medium pointer-events-auto max-w-[92vw]',
        'transition-all duration-300',
        COLOR[variant],
        out ? 'opacity-0 translate-y-2' : 'opacity-100 animate-slide-up',
      ].join(' ')}
    >
      <Icon variant={variant} />
      <span className="min-w-0">{message}</span>
      {action && (
        // 되돌리기는 실수를 되돌리는 마지막 기회다 — 본문과 확실히 구분되고 손가락으로 짚을 크기여야 한다
        <button
          type="button"
          onClick={() => { action.onClick(); onDismiss(); }}
          className="ml-1 shrink-0 -my-1 px-3 py-1.5 rounded-badge border border-current/40 bg-black/15 text-xs font-bold underline underline-offset-2 active:scale-95 transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function Icon({ variant }: { variant: ToastVariant }) {
  const common = 'w-4 h-4 shrink-0';
  if (variant === 'success') {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={common} aria-hidden>
        <circle cx="8" cy="8" r="6.5" />
        <polyline points="5,8 7,10 11,6" />
      </svg>
    );
  }
  if (variant === 'error') {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={common} aria-hidden>
        <circle cx="8" cy="8" r="6.5" />
        <line x1="8" y1="5" x2="8" y2="9" />
        <circle cx="8" cy="11.5" r="0.6" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={common} aria-hidden>
      <circle cx="8" cy="8" r="6.5" />
      <line x1="8" y1="7" x2="8" y2="11.5" />
      <circle cx="8" cy="5" r="0.6" fill="currentColor" />
    </svg>
  );
}
