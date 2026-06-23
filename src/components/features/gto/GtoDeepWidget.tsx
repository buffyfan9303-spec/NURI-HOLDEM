// src/components/features/gto/GtoDeepWidget.tsx
import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../atoms/Toast';
import GtoDeepModal from './GtoDeepModal';

/** 커뮤니티 > 홀덤 공부 진입 위젯 (비로그인 차단) */
export default function GtoDeepWidget() {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    if (!user) {
      toast.show('로그인 후 이용할 수 있습니다', 'error');
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center gap-3 rounded-card border border-accent-400/40 bg-gradient-to-br from-accent-300/[0.08] to-transparent p-3 text-left transition-all hover:border-accent-300 active:scale-[0.99]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-300/15 text-accent-300">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink-primary">GTO 검색</span>
          <span className="block text-2xs text-ink-muted">Hero / Villain / Board 카드를 직접 지정해 실시간 에퀴티와 GTO 액션 분석</span>
        </span>
        <span className="shrink-0 text-2xs font-bold text-accent-300">{user ? '열기' : '로그인 필요'}</span>
      </button>

      {user && <GtoDeepModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
