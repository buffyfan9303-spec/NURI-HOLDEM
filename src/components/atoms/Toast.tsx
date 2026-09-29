import { useEffect, useRef, useState, useCallback, useMemo, createContext, useContext } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { ToastViewProps } from './ToastView';

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

export interface Toast {
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 토스트 그림(ToastView — 겹쳐 쌓기·항목·아이콘)은 **지연 청크**다(2026-09-29 #13). 겹쳐 쌓기를 더하자 첫 화면 임계 경로가
  //   예산(여유 0%)을 넘었다 — 올리지 않고 그림을 첫 화면 밖으로 뺐다. 부팅 직후 바로 받아 두므로 첫 조작 전에 와 있고,
  //   받기 전에 뜬 토스트는 상태에 남아 있다가 도착하는 즉시 그려진다. 받기에 실패하면 다음 토스트 때 다시 받는다.
  //   Suspense(lazy) 를 안 쓰는 이유: 캐시에 있어도 첫 렌더를 ~300ms 붙잡는다(CLAUDE.md 참고 메모).
  //   aria-live 컨테이너는 여기(첫 화면)에 둔다 — 알림 영역이 내용보다 먼저 있어야 스크린리더가 읽는다.
  const [View, setView] = useState<ComponentType<ToastViewProps> | null>(null);
  const loading = useRef(false);
  const load = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    import('./ToastView').then((m) => setView(() => m.default), () => { loading.current = false; });
  }, []);
  useEffect(load, [load]);

  const show = useCallback((message: string, variant: ToastVariant = 'info', opts?: ToastOptions) => {
    load();
    const id = Date.now() + Math.random();
    // 되돌리기 버튼이 있으면 읽고 누를 시간이 필요하다 — 2.4초로는 손이 못 따라간다.
    // 에러도 마찬가지 — '왜 실패했는지'를 읽기 전에 사라지면 같은 실수를 반복한다.
    const durationMs = opts?.durationMs ?? (opts?.action ? 6000 : variant === 'error' ? 4500 : 2400);
    setToasts((prev) => [...prev, { id, message, variant, action: opts?.action, durationMs }]);
    // 햅틱 피드백(모바일) — 성공 10ms 한 번, 에러는 짧게 두 번(네이티브 앱 감각)
    // ⚠ 첫 제스처 전(부팅 직후 자동 토스트)에는 Chromium 이 vibrate 를 막고 콘솔에 개입 경고를 남긴다
    //   ("Blocked call to navigator.vibrate because user hasn't tapped on the frame") — 활성화 전이면 부르지 않는다.
    try {
      if (navigator.userActivation?.hasBeenActive === false) return;
      if (variant === 'success') navigator.vibrate?.(10);
      else if (variant === 'error') navigator.vibrate?.([18, 40, 18]);
    } catch { /* 미지원 무시 */ }
    setTimeout(() => { dismiss(id); }, durationMs);
  }, [dismiss, load]);

  // ⚠ value 를 인라인 객체로 주면 toasts 가 바뀔 때마다(=토스트가 뜰 때마다) 새 참조가 되어
  //   useToast 를 쓰는 모든 컴포넌트가 재렌더된다. 장부처럼 무거운 화면에서 바로 체감된다.
  //   show 는 useCallback 으로 안정적이므로 value 만 고정하면 소비자는 영향을 받지 않는다.
  const ctx = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* 토스트 컨테이너 — fixed 하단 중앙.
          ⚠ 예전 left-1/2 + -translate-x-1/2 는 fixed 요소의 shrink-to-fit 가용 폭을 뷰포트의
          '오른쪽 절반'(~50vw)으로 좁혀 버렸다 — 액션 버튼이 있는 토스트에서 텍스트 칸이
          몇 글자 폭으로 짜부라져 1자씩 세로로 꺾이던 원인. inset-x-0 + items-center 로
          가용 폭을 온전히 주고 가운데 정렬한다(pointer-events-none 이라 클릭 방해 없음).
          h-0 + justify-end: 컨테이너 상자는 높이 0 으로 바닥에 고정하고 토스트는 위로 넘쳐 쌓인다(보이는 자리는 같다).
          높이를 내용에 맡기면 오래된 토스트가 빠질 때마다 상자 윗변이 내려와 입력과 무관한 layout-shift 가 났다
          (2026-09-29 장부 연속 바인 실측 1280 0.0167·390 0.0338 매회 — 남은 토스트는 안 움직였는데 상자만 움직였다). */}
      <div
        aria-live="polite"
        className="fixed bottom-(--tabbar-float) lg:bottom-4 inset-x-0 z-120 flex h-0 flex-col items-center justify-end gap-2 pointer-events-none"
      >
        {View && <View toasts={toasts} dismiss={dismiss} />}
      </div>
    </ToastContext.Provider>
  );
}
