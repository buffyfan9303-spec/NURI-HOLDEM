import { useEffect, useState, useCallback, useMemo, createContext, useContext } from 'react';
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
  success: 'bg-emerald-700 text-white border-emerald-500',   // 대비 3.15 → 5.5:1
  error:   'bg-danger-dark text-white border-danger',        // 라이트 모드에서 2.38 → 7:1
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, variant: ToastVariant = 'info', opts?: ToastOptions) => {
    const id = Date.now() + Math.random();
    // 되돌리기 버튼이 있으면 읽고 누를 시간이 필요하다 — 2.4초로는 손이 못 따라간다.
    // 에러도 마찬가지 — '왜 실패했는지'를 읽기 전에 사라지면 같은 실수를 반복한다.
    const durationMs = opts?.durationMs ?? (opts?.action ? 6000 : variant === 'error' ? 4500 : 2400);
    setToasts((prev) => [...prev, { id, message, variant, action: opts?.action, durationMs }]);
    // 햅틱 피드백(모바일) — 성공 10ms 한 번, 에러는 짧게 두 번(네이티브 앱 감각)
    try {
      if (variant === 'success') navigator.vibrate?.(10);
      else if (variant === 'error') navigator.vibrate?.([18, 40, 18]);
    } catch { /* 미지원 무시 */ }
    setTimeout(() => { dismiss(id); }, durationMs);
  }, [dismiss]);

  // ⚠ value 를 인라인 객체로 주면 toasts 가 바뀔 때마다(=토스트가 뜰 때마다) 새 참조가 되어
  //   useToast 를 쓰는 모든 컴포넌트가 재렌더된다. 장부처럼 무거운 화면에서 바로 체감된다.
  //   show 는 useCallback 으로 안정적이므로 value 만 고정하면 소비자는 영향을 받지 않는다.
  const ctx = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* 토스트 컨테이너 — fixed 하단 중앙 */}
      <div
        aria-live="polite"
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] lg:bottom-4 left-1/2 -translate-x-1/2 z-[120] flex flex-col items-center gap-2 pointer-events-none"
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
      onClick={onDismiss}
      title="탭하면 닫힘"
      className={[
        'inline-flex items-center gap-2 px-4 py-2.5 rounded-input border shadow-dialog',
        'text-sm font-medium pointer-events-auto max-w-[92vw] cursor-pointer select-none',
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
          onClick={(e) => { e.stopPropagation(); action.onClick(); onDismiss(); }}
          className="hit relative ml-1 shrink-0 -my-1 px-3 py-1.5 rounded-badge border border-current/40 bg-black/15 text-xs font-bold underline underline-offset-2 active:scale-95 transition"
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
