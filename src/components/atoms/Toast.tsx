import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';

// ── 토스트 타입 ─────────────────────────────────────────────────────────────

export type ToastVariant = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

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

  const show = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2400);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* 토스트 컨테이너 — fixed 하단 중앙 */}
      <div
        aria-live="polite"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ message, variant }: Toast) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOut(true), 2100);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      role="status"
      className={[
        'inline-flex items-center gap-2 px-4 py-2.5 rounded-input border shadow-dialog',
        'text-sm font-medium pointer-events-auto',
        'transition-all duration-300',
        COLOR[variant],
        out ? 'opacity-0 translate-y-2' : 'opacity-100 animate-slide-up',
      ].join(' ')}
    >
      <Icon variant={variant} />
      {message}
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
