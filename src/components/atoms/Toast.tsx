import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, createContext, useContext } from 'react';
import type { PointerEvent as RPointerEvent, ReactNode } from 'react';

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
    // ⚠ 첫 제스처 전(부팅 직후 자동 토스트)에는 Chromium 이 vibrate 를 막고 콘솔에 개입 경고를 남긴다
    //   ("Blocked call to navigator.vibrate because user hasn't tapped on the frame") — 활성화 전이면 부르지 않는다.
    try {
      if (navigator.userActivation?.hasBeenActive === false) return;
      if (variant === 'success') navigator.vibrate?.(10);
      else if (variant === 'error') navigator.vibrate?.([18, 40, 18]);
    } catch { /* 미지원 무시 */ }
    setTimeout(() => { dismiss(id); }, durationMs);
  }, [dismiss]);

  // ⚠ value 를 인라인 객체로 주면 toasts 가 바뀔 때마다(=토스트가 뜰 때마다) 새 참조가 되어
  //   useToast 를 쓰는 모든 컴포넌트가 재렌더된다. 장부처럼 무거운 화면에서 바로 체감된다.
  //   show 는 useCallback 으로 안정적이므로 value 만 고정하면 소비자는 영향을 받지 않는다.
  const ctx = useMemo(() => ({ show }), [show]);

  // ── 겹쳐 쌓기(2026-09-29 #13) ─────────────────────────────────────────────
  // 390 에서 장부 연속 바인 되돌리기 토스트 3장이 세로로 쌓여 화면 아래 38%(324px)를 덮고 다음 바인 '+' 칸 3개를 가렸다.
  // 장수 제한·합치기는 앞 바인의 되돌리기를 없애거나(제한) 무엇을 되돌리는지 흐리게(합치기) 해서 버렸다.
  // → 2장 이상이면 최신 토스트만 앞에 두고 나머지는 뒤에 10px 씩 비치게 겹친다. 되돌리기는 **전부 살아 있다**:
  //   탭(터치)·마우스 올림·키보드 포커스로 더미를 펼치면 종전처럼 세로로 늘어선다. 수명은 **종전과 같다**(멈추지 않는다) —
  //   포스터·예약 삭제는 토스트 수명 = 서버 유예(5초)로 맞춰 둬서, 수명을 늘리면 이미 지워진 뒤 되돌리기가 눌린다(App.tsx 주석).
  // 🔴 모든 토스트는 레이아웃상 **같은 자리(bottom-0)** 에 있고 위치는 transform 으로만 바꾼다 — 뜨고 빠지고 펼쳐도
  //   layout-shift 가 0 이다(D4 교훈: 보이지 않는 상자가 움직여도 CLS 로 잡힌다).
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [opened, setOpened] = useState(false);   // 터치 탭으로 펼침 — 한 장 이하로 줄면 접힌다
  const boxRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const [heights, setHeights] = useState<Record<number, number>>({});
  useLayoutEffect(() => {   // 펼친 배치에 쓸 높이 — transform 은 offsetHeight 를 바꾸지 않는다
    const next: Record<number, number> = {};
    for (const t of toasts) next[t.id] = nodes.current.get(t.id)?.offsetHeight ?? 0;
    const ks = Object.keys(next);
    if (ks.length !== Object.keys(heights).length || ks.some((k) => next[+k] !== heights[+k])) setHeights(next);
    // 포커스를 쥔 토스트가 닫히면 blur 없이 포커스가 사라진다 — 매 렌더 실제 위치로 맞춘다
    if (focusIn && !boxRef.current?.contains(document.activeElement)) setFocusIn(false);
  }, [toasts, heights, focusIn]);
  const pile = toasts.length > 1;
  if (!pile && opened) setOpened(false);
  const expanded = pile && (hover || focusIn || opened);
  const leaveT = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 펼친 줄 사이 8px 틈을 마우스가 지나는 동안 접혔다 펴지지 않게 — 떠날 때만 늦춘다
  const onEnter = (e: RPointerEvent) => { if (e.pointerType !== 'mouse') return; clearTimeout(leaveT.current); setHover(true); };
  const onLeave = (e: RPointerEvent) => { if (e.pointerType !== 'mouse') return; clearTimeout(leaveT.current); leaveT.current = setTimeout(() => setHover(false), 150); };
  useEffect(() => () => clearTimeout(leaveT.current), []);
  const openedAt = useRef(-Infinity);
  const onOpen = () => { openedAt.current = performance.now(); setOpened(true); };
  const justOpened = () => performance.now() - openedAt.current < 600;   // 터치 click 합성은 touchend 뒤 수십~300ms
  // 탭으로 펼친 더미는 바깥을 누르면 접힌다(다음 바인 '+' 를 누르는 순간 다시 작아진다).
  useEffect(() => {
    if (!opened) return;
    const onDown = (e: PointerEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpened(false); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [opened]);

  const n = toasts.length;
  let below = 0;   // 펼친 배치: 자기보다 새(아래) 토스트들의 높이 + 틈
  const place: { y: number; s: number; hidden: boolean }[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const k = n - 1 - i;   // 0 = 최신(맨 앞)
    place[i] = expanded ? { y: -below, s: 1, hidden: false } : { y: -k * PILE_PEEK, s: 1 - k * 0.05, hidden: k >= PILE_SHOWN };
    below += (heights[toasts[i].id] ?? 0) + PILE_GAP;
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* 토스트 컨테이너 — fixed 하단 중앙.
          ⚠ 예전 left-1/2 + -translate-x-1/2 는 fixed 요소의 shrink-to-fit 가용 폭을 뷰포트의
          '오른쪽 절반'(~50vw)으로 좁혀 버렸다 — 액션 버튼이 있는 토스트에서 텍스트 칸이
          몇 글자 폭으로 짜부라져 1자씩 세로로 꺾이던 원인. inset-x-0 + items-center 로
          가용 폭을 온전히 주고 가운데 정렬한다(pointer-events-none 이라 클릭 방해 없음).
          h-0: 컨테이너 상자는 높이 0 으로 바닥에 고정하고 토스트는 위로 넘쳐 쌓인다(보이는 자리는 같다).
          높이를 내용에 맡기면 오래된 토스트가 빠질 때마다 상자 윗변이 내려와 입력과 무관한 layout-shift 가 났다
          (2026-09-29 장부 연속 바인 실측 1280 0.0167·390 0.0338 매회 — 남은 토스트는 안 움직였는데 상자만 움직였다).
          토스트는 전부 absolute bottom-0 — 같은 자리에서 transform 으로만 쌓는다(위 '겹쳐 쌓기'). */}
      <div
        aria-live="polite"
        className="fixed bottom-(--tabbar-float) lg:bottom-4 inset-x-0 z-120 h-0 pointer-events-none"
        ref={boxRef}
        // 키보드 포커스만 펼친다(:focus-visible) — 터치로 누른 버튼도 포커스를 받는데, 그 버튼이 토스트째 사라지면
        //   blur 가 오지 않아 펼침이 영영 남았다(실측: 되돌리기를 누른 뒤 더미가 다시 접히지 않음).
        onFocus={(e) => { if ((e.target as Element).matches(':focus-visible')) setFocusIn(true); }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false); }}
      >
        {toasts.map((t, i) => (
          <ToastItem key={t.id} {...t} dismiss={dismiss} place={place[i]}
            collapsed={pile && !expanded} onOpen={onOpen} justOpened={justOpened} onEnter={onEnter} onLeave={onLeave}
            nodeRef={(el) => { if (el) nodes.current.set(t.id, el); else nodes.current.delete(t.id); }} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** 겹친 더미에서 뒤 토스트가 앞 토스트 위로 비치는 높이(px) · 비쳐 보이는 최대 장수 · 펼친 줄 사이 틈(px, 종전 gap-2) */
const PILE_PEEK = 10;
const PILE_SHOWN = 3;
const PILE_GAP = 8;

type ItemProps = Toast & {
  dismiss: (id: number) => void;
  place: { y: number; s: number; hidden: boolean };
  collapsed: boolean;
  onOpen: () => void;
  justOpened: () => boolean;
  onEnter: (e: RPointerEvent) => void;
  onLeave: (e: RPointerEvent) => void;
  nodeRef: (el: HTMLDivElement | null) => void;
};

function ToastItem({ id, message, variant, action, durationMs, dismiss, place, collapsed, onOpen, justOpened, onEnter, onLeave, nodeRef }: ItemProps) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    // 사라지기 300ms 전부터 페이드 — 컨테이너의 제거 타이밍과 맞춘다
    const t = setTimeout(() => setOut(true), Math.max(0, durationMs - 300));
    return () => clearTimeout(t);
  }, [durationMs]);
  // 접힌 더미를 누른 손가락은 '닫기' 가 아니라 '펼치기' 다 — pointerdown 시점(펼치기 전)의 상태로 가른다.
  // 🔴 그 탭의 click 은 **펼친 뒤** 손가락 아래에 온 요소로 간다(터치 click 은 touchend 뒤 합성) — 실측: 펼치는 탭이
  //   다른 토스트를 닫았다. 그 자리에 되돌리기가 오면 원치 않는 되돌리기가 된다 → 펼친 직후의 click 은 전부 삼킨다.
  return (
    <div
      ref={nodeRef}
      role="status"
      onPointerDown={(e) => { if (collapsed && !(e.target as Element).closest('button')) onOpen(); }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onClick={() => { if (!justOpened()) dismiss(id); }}
      title={collapsed ? '탭하면 펼침' : '탭하면 닫힘'}
      style={{
        transform: `translateY(${place.y + (out ? 8 : 0)}px) scale(${place.s})`,
        ...(place.hidden ? { opacity: 0, pointerEvents: 'none' as const } : null),
      }}
      className={[
        // absolute bottom-0 + inset-x-0 mx-auto w-fit: 가용 폭은 화면 전체, 내용 폭으로 가운데(위 컨테이너 주석).
        // max-w: 모바일은 화면의 92%, PC 는 읽기 좋은 28rem 상한(끝없이 옆으로 길어지는 것 방지)
        'absolute bottom-0 inset-x-0 mx-auto w-fit origin-bottom',
        'flex items-center gap-2 px-4 py-2.5 rounded-input border shadow-dialog',
        'text-sm font-medium pointer-events-auto max-w-[92vw] sm:max-w-md cursor-pointer select-none',
        'transition-[transform,opacity] duration-(--dur-panel)',
        COLOR[variant],
        out ? 'opacity-0' : 'opacity-100 animate-slide-up',
      ].join(' ')}
    >
      <Icon variant={variant} />
      {/* flex-1 min-w-0: 액션 버튼(shrink-0)과 공존할 때도 텍스트가 남은 폭을 온전히 차지.
          break-keep: 한국어 어절 단위 줄바꿈(1자씩 꺾임 방지) + overflow-wrap 으로 긴 토큰만 예외 절단 */}
      <span className="flex-1 min-w-0 whitespace-normal break-keep wrap-anywhere">{message}</span>
      {action && (
        // 되돌리기는 실수를 되돌리는 마지막 기회다 — 본문과 확실히 구분되고 손가락으로 짚을 크기여야 한다
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (justOpened()) return; action.onClick(); dismiss(id); }}
          className="hit relative ml-1 shrink-0 -my-1 px-3 py-1.5 rounded-badge border border-white/40 bg-black/15 text-xs font-bold underline underline-offset-2 active:scale-95 transition"
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
