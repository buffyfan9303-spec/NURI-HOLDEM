// src/components/atoms/HoldToConfirmButton.tsx
// 홀드 투 컨펌 — 위험/되돌리기 어려운 액션은 0.7초 꾹 눌러 실행(Telegram·게임 UI 패턴).
// 확인 팝업 한 단계가 사라져 더 빠르면서, 스치는 탭으로는 절대 실행되지 않아 더 안전하다.
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';

const HOLD_MS = 700;

export default function HoldToConfirmButton({
  children, onConfirm, className = '', disabled = false, holdingLabel = '계속 누르세요…',
}: {
  children: React.ReactNode;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
  holdingLabel?: string;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    if (disabled || holding) return;
    setHolding(true);
    timer.current = setTimeout(() => { setHolding(false); onConfirm(); }, HOLD_MS);
  };
  const cancel = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setHolding(false);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={['relative overflow-hidden select-none touch-none', className].join(' ')}
      aria-label={typeof children === 'string' ? children : undefined}
    >
      {/* 게이지 — 누르는 동안 좌→우로 차오르고, 떼면 빠르게 리셋 */}
      <motion.span
        aria-hidden
        className="absolute inset-0 origin-left bg-white/25"
        initial={false}
        animate={{ scaleX: holding ? 1 : 0 }}
        transition={holding ? { duration: HOLD_MS / 1000, ease: 'linear' } : { duration: 0.15 }}
      />
      <span className="relative">{holding ? holdingLabel : children}</span>
    </button>
  );
}
