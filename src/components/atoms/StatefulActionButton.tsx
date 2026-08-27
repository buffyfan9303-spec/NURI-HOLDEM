// src/components/atoms/StatefulActionButton.tsx
// 상태 주도형 액션 버튼 — Idle → Loading → Success 를 한 컴포넌트 안에서 모핑.
// 매장 인증 요청·토너먼트 참가 등 "한 번 누르고 결과를 기다리는" 비동기 액션 전용.
//
// framer-motion 제거 재작성(FLIP 전환의 마지막 조각):
//  · 폭 모핑은 2026-07-20 에 이미 폐기(w-full 폭 고정) — layout 애니메이션이 필요 없어짐.
//  · 단계 교차는 key 교체 + CSS 등장(nuri-pop/fade), 배경색은 transition-colors,
//    체크 드로잉은 stroke-dasharray 트랜지션, 스피너는 animate-spin — 전부 컴포지터/CSS.
import { useEffect, useState, forwardRef } from 'react';

type Phase = 'idle' | 'loading' | 'success';

const BG: Record<string, string> = {
  success: '#0ECB81', // 팔레트 밖 청록이던 성공색 → emerald(토스트 성공과 동일 계열)
  loading: 'rgb(var(--surface-float))',
  disabled: 'rgb(var(--surface-float))', /* 미완성: 회색 — 입력이 완성되는 순간 인디고로 살아난다(토스 패턴) */
  idle: 'rgb(var(--accent-300))', /* 테마 변수 — 다크 #805FDA / 라이트 #6946C8 (h256 어워드 정합, 2026-08-27) */
};

/** 성공 체크 — path 를 dasharray 로 그려낸다(마운트 후 dashoffset 24→0 트랜지션) */
function DrawnCheck() {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 12.5l5 5L19.5 7"
        stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="24"
        strokeDashoffset={drawn ? 0 : 24}
        style={{ transition: 'stroke-dashoffset 0.45s var(--ease) 0.05s' }}
      />
    </svg>
  );
}

const StatefulActionButton = forwardRef<HTMLButtonElement, {
  label?: string;
  /** 성공 시 체크 옆에 짧게 보여줄 텍스트(생략 가능) */
  successLabel?: string;
  /** 실제 비동기 작업 — 생략 시 2초 모방. throw 하면 idle로 복귀 */
  onAction?: () => Promise<void>;
  className?: string;
  disabled?: boolean;
  /** 성공 애니메이션이 끝난 뒤 호출(모달 닫기 등) */
  onDone?: () => void;
}>(function StatefulActionButton({
  label = '요청',
  successLabel,
  onAction,
  className = '',
  disabled = false,
  onDone,
}, ref) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [shakeKey, setShakeKey] = useState(0); // 실패 복귀 시 좌우 흔들기 트리거
  // w-full 버튼은 '전 단계' 폭 고정 — 내용(라벨→스피너→체크)만 교체한다.
  // (과거의 캡슐 폭 모핑은 '늘었다→줄었다→늘었다' 튐으로 폐기 — 2026-07-20)
  const wantsFull = className.includes('w-full');
  const restClass = className.split(/\s+/).filter((c) => c !== 'w-full').join(' ');

  const run = async () => {
    if (phase !== 'idle' || disabled) return;
    setPhase('loading');
    try {
      await (onAction ? onAction() : new Promise((r) => setTimeout(r, 2000)));
      setPhase('success');
      if (onDone) setTimeout(onDone, 900);
    } catch {
      setPhase('idle'); // 실패 토스트는 onAction 쪽 책임 — 버튼은 재시도 가능 상태로
      setShakeKey((k) => k + 1); // '아니야'를 몸짓으로 — 좌우 6px 흔들기
    }
  };

  const bg = phase === 'success' ? BG.success : phase === 'loading' ? BG.loading : disabled ? BG.disabled : BG.idle;
  // idle = 그라데이션 CTA(.btn-primary·.pill-active 와 동일한 var(--grad-cta)) — 단색 accent 위에 얹는다.
  // background-image 는 애니 불가라 즉시 교체되고, 밑의 background-color 전환이 페이즈 색을 잇는다.
  const bgImage = phase === 'idle' && !disabled ? 'var(--grad-cta)' : 'none';

  return (
    <button
      ref={ref}
      type="button"
      onClick={run}
      disabled={disabled || phase !== 'idle'}
      style={{ borderRadius: 999, backgroundColor: bg, backgroundImage: bgImage, transition: 'background-color var(--dur-base) var(--ease), transform var(--dur-fast) var(--ease)' }}
      key={shakeKey > 0 ? `shake-${shakeKey}` : undefined}
      className={[
        shakeKey > 0 ? 'anim-shake' : '',
        'inline-flex h-10 items-center justify-center gap-1.5 overflow-hidden font-bold',
        phase === 'idle' ? (disabled ? 'text-ink-muted' : 'text-white enabled:hover:scale-[0.97] enabled:active:scale-95') : '',
        wantsFull || phase === 'idle' ? 'px-5' : 'px-4',
        phase === 'success' ? 'text-white' : phase === 'loading' ? 'text-ink-secondary' : '',
        'disabled:cursor-default focus:outline-none',
        wantsFull ? 'w-full' : '',
        restClass,
      ].join(' ')}
      aria-live="polite"
      aria-busy={phase === 'loading'}
    >
      {phase === 'idle' && (
        <span key="idle" className="animate-fade-in whitespace-nowrap text-sm">{label}</span>
      )}
      {phase === 'loading' && (
        <span key="loading" className="animate-fade-in flex items-center justify-center" aria-label="처리 중">
          <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        </span>
      )}
      {phase === 'success' && (
        <span key="success" className="anim-pop flex items-center gap-1.5">
          <DrawnCheck />
          {successLabel && <span className="whitespace-nowrap text-sm">{successLabel}</span>}
        </span>
      )}
    </button>
  );
});
export default StatefulActionButton;

/** 프레스 버튼 — 정적 그림자 없이 눌림 피드백만. 헤더 로그인 등 컴팩트 CTA용 (CSS 전환) */
export function SpringButton({
  children, onClick, className = '', ariaLabel,
}: { children: React.ReactNode; onClick: () => void; className?: string; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={['transition-transform hover:scale-[0.97] active:scale-95 focus:outline-none', className].join(' ')}
    >
      {children}
    </button>
  );
}
