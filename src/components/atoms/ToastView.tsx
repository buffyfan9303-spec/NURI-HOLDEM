// src/components/atoms/ToastView.tsx
// 토스트 그림 — Toast.tsx 의 ToastProvider 가 부팅 직후 동적 import 로 받는다(첫 화면 예산 밖, Toast.tsx 머리 주석).
// 항목(ToastItem)·아이콘은 종전 Toast.tsx 에서 글자 그대로 옮겼고, 더한 것은 겹쳐 쌓기뿐이다.
import { useEffect, useRef, useState } from 'react';
import type { Toast, ToastVariant } from './Toast';

export interface ToastViewProps { toasts: Toast[]; dismiss: (id: number) => void }

const COLOR: Record<ToastVariant, string> = {
  info:    'bg-surface-float text-ink-primary border-border-strong',
  success: 'bg-emerald-700 text-white border-emerald-500',   // 대비 3.15 → 5.5:1
  error:   'bg-danger-dark text-white border-danger',        // 라이트 모드에서 2.38 → 7:1
};

// ── 겹쳐 쌓기(2026-09-29 #13) ─────────────────────────────────────────────
// 390 에서 장부 연속 바인 되돌리기 토스트 3장이 세로로 쌓여 화면 아래 38%(324px)를 덮고 다음 바인 '+' 칸 3개를 가렸다.
// 장수 제한·합치기는 앞 바인의 되돌리기를 없애거나(제한) 무엇을 되돌리는지 흐리게(합치기) 해서 버렸다.
// → 2장 이상이면 최신 1장만 흐름에 두고 나머지는 같은 바닥(absolute bottom-0)에서 뒤로 10px 씩 비치게 겹친다.
//   되돌리기는 **전부 살아 있다** — 더미를 누르거나(터치·마우스) 키보드로 포커스하면 종전처럼 세로로 늘어선다.
//   수명은 종전과 같다(멈추지 않는다): 포스터·예약 삭제는 토스트 수명 = 서버 유예(5초)로 맞춘 계약이다(App.tsx 주석).
// CLS: 새 토스트가 오면 앞 토스트는 흐름 바닥 → absolute 바닥으로 **같은 자리**에서 바뀌고, 뒤 배치는 transform 뿐이다.
//   접힘↔펼침은 누름·키 입력 직후에만 일어난다(입력 제외). 마우스 올림으로 펼치지 않는 이유가 이것이다.
export default function ToastView({ toasts, dismiss }: ToastViewProps) {
  const [opened, setOpened] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef(-1e9);
  const pile = toasts.length > 1;
  if (!pile && opened) setOpened(false);
  const collapsed = pile && !opened && !focusIn;
  useEffect(() => {
    // 포커스를 쥔 토스트가 닫히면 blur 없이 포커스가 사라진다 — 토스트가 바뀔 때마다 실제 위치로 맞춘다
    if (focusIn && !boxRef.current?.contains(document.activeElement)) setFocusIn(false);
    if (!opened) return;
    // 펼친 더미는 바깥을 누르면 접힌다(다음 바인 '+' 를 누르는 순간 다시 작아진다)
    const onDown = (e: PointerEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpened(false); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [opened, focusIn, toasts]);
  const open = () => { openedAt.current = performance.now(); setOpened(true); };
  // 🔴 펼치는 누름의 click 은 **펼친 뒤** 손가락 아래에 온 요소로 간다(터치 click 은 touchend 뒤 합성) — 실측: 펼치는 탭이
  //   다른 토스트를 닫았다. 그 자리에 되돌리기가 오면 원치 않는 되돌리기가 된다 → 펼친 직후 600ms 의 click 은 삼킨다.
  const justOpened = () => performance.now() - openedAt.current < 600;
  return (
    // display:contents — 상자를 만들지 않아 토스트는 그대로 Toast.tsx 컨테이너(flex·h-0)의 자식처럼 배치된다.
    //   포커스 이벤트와 contains 판정을 위한 DOM 묶음일 뿐이다.
    // 키보드 포커스만 펼친다(:focus-visible) — 터치로 누른 버튼도 포커스를 받는데, 그 버튼이 토스트째 사라지면
    //   blur 가 오지 않아 펼침이 남았다(실측).
    <div ref={boxRef} style={{ display: 'contents' }}
      onFocus={(e) => { if ((e.target as Element).matches(':focus-visible')) setFocusIn(true); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false); }}>
      {toasts.map((t, i) => (
        <ToastItem key={t.id} {...t} k={collapsed ? toasts.length - 1 - i : 0} onOpen={collapsed ? open : undefined}
          justOpened={justOpened} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

/** k = 접힌 더미에서 최신(0)으로부터의 거리. 0 이면 종전 그대로 흐름 배치, 1 이상은 앞 토스트 뒤에 겹친다. */
function ToastItem({ message, variant, action, durationMs, onDismiss, k, onOpen, justOpened }: Toast & {
  onDismiss: () => void; k: number; onOpen?: () => void; justOpened: () => boolean;
}) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    // 사라지기 300ms 전부터 페이드 — 컨테이너의 제거 타이밍과 맞춘다
    const t = setTimeout(() => setOut(true), Math.max(0, durationMs - 300));
    return () => clearTimeout(t);
  }, [durationMs]);
  return (
    <div
      role="status"
      // 접힌 더미를 누르면 '닫기' 가 아니라 '펼치기' — 앞 토스트의 되돌리기 버튼은 접힌 채로도 바로 눌린다
      onPointerDown={onOpen && ((e) => { if (!(e.target as Element).closest('button')) onOpen(); })}
      onClick={() => { if (!justOpened()) onDismiss(); }}
      title="탭하면 닫힘"
      // 뒤 토스트: 10px 씩 위로 비치고 5% 씩 작게, 넷째부터는 숨김(포커스·스크린리더에는 남는다 — 포커스하면 펼쳐진다)
      style={k ? { transform: `translateY(${-10 * k}px) scale(${1 - k / 20})`, transformOrigin: 'bottom', ...(k > 2 && { opacity: 0, pointerEvents: 'none' }) } : undefined}
      className={[
        // max-w: 모바일은 화면의 92%, PC 는 읽기 좋은 28rem 상한(끝없이 옆으로 길어지는 것 방지)
        'inline-flex shrink-0 items-center gap-2 px-4 py-2.5 rounded-input border shadow-dialog',
        // 앞(흐름) 토스트는 relative — 그래야 absolute 인 뒤 토스트들보다 위에 그려진다
        k ? 'absolute bottom-0 inset-x-0 mx-auto w-fit' : 'relative',
        'text-sm font-medium pointer-events-auto max-w-[92vw] sm:max-w-md cursor-pointer select-none',
        'transition-[transform,opacity] duration-(--dur-panel)',
        COLOR[variant],
        out ? 'opacity-0 translate-y-2' : 'opacity-100 animate-slide-up',
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
          onClick={(e) => { e.stopPropagation(); if (justOpened()) return; action.onClick(); onDismiss(); }}
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
