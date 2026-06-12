// src/components/atoms/StatefulActionButton.tsx
// 상태 주도형 액션 버튼 — Idle → Loading → Success 를 한 컴포넌트 안에서 모핑.
// Framer Motion layout으로 너비 변화가 끊기지 않고, 성공 시 체크마크가 SVG path로 그려진다.
// 매장 인증 요청·토너먼트 참가 등 "한 번 누르고 결과를 기다리는" 비동기 액션 전용.
import { useState, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Phase = 'idle' | 'loading' | 'success';

const SPRING = { type: 'spring', stiffness: 520, damping: 32 } as const;

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
  // w-full은 Idle에서만 — Loading/Success는 컨텐츠 폭으로 줄어 캡슐 모핑(layout이 보간)
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
    }
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      layout
      onClick={run}
      disabled={disabled || phase !== 'idle'}
      whileTap={phase === 'idle' ? { scale: 0.95 } : undefined}
      whileHover={phase === 'idle' ? { scale: 0.97 } : undefined}
      transition={SPRING}
      animate={{
        backgroundColor:
          phase === 'success' ? '#19b8e6' : phase === 'loading' ? '#3a4253' : '#FCD535',
      }}
      style={{ borderRadius: 999 }}
      className={[
        'inline-flex h-10 items-center justify-center gap-1.5 overflow-hidden font-bold',
        phase === 'idle' ? 'px-5 text-ink-inverse' : 'px-4',
        phase === 'success' ? 'text-white' : phase === 'loading' ? 'text-ink-secondary' : '',
        'disabled:cursor-default focus:outline-none',
        phase === 'idle' && wantsFull ? 'w-full' : '',
        restClass,
      ].join(' ')}
      aria-live="polite"
      aria-busy={phase === 'loading'}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {phase === 'idle' && (
          <motion.span
            key="idle"
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="whitespace-nowrap text-sm"
          >
            {label}
          </motion.span>
        )}
        {phase === 'loading' && (
          <motion.span
            key="loading"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="flex items-center justify-center"
            aria-label="처리 중"
          >
            <motion.span
              className="block h-4 w-4 rounded-full border-2 border-white/25 border-t-white"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
            />
          </motion.span>
        )}
        {phase === 'success' && (
          <motion.span
            key="success"
            layout
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={SPRING}
            className="flex items-center gap-1.5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <motion.path
                d="M4.5 12.5l5 5L19.5 7"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }}
              />
            </svg>
            {successLabel && <span className="whitespace-nowrap text-sm">{successLabel}</span>}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
});
export default StatefulActionButton;

/** 스프링 프레스 버튼 — 정적 그림자 없이 물리 피드백만. 헤더 로그인 등 컴팩트 CTA용 */
export function SpringButton({
  children, onClick, className = '', ariaLabel,
}: { children: React.ReactNode; onClick: () => void; className?: string; ariaLabel?: string }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      whileHover={{ scale: 0.97 }}
      whileTap={{ scale: 0.95 }}
      transition={SPRING}
      className={['focus:outline-none', className].join(' ')}
    >
      {children}
    </motion.button>
  );
}
