// src/components/atoms/InstallBanner.tsx
// PWA 홈 화면 설치 안내 배너. beforeinstallprompt 지원 브라우저에서만 노출.
// 이미 설치(standalone)했거나 닫은 적 있으면 표시하지 않는다.
import { useEffect, useState } from 'react';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const DISMISS_KEY = 'nh-install-dismissed';

export default function InstallBanner() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return;
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch { /* noop */ }
    const onP = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); setShow(true); };
    window.addEventListener('beforeinstallprompt', onP);
    return () => window.removeEventListener('beforeinstallprompt', onP);
  }, []);

  const dismiss = () => { setShow(false); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ } };
  const install = async () => {
    if (!evt) return;
    setShow(false);
    try { await evt.prompt(); } catch { /* 사용자 취소 등 무시 */ }
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  };

  if (!show || !evt) return null;
  return (
    // 모바일: 하단 탭바(z-50, ~5.75rem)를 덮지 않게 그 위로 — PC는 기존 위치
    <div className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] lg:bottom-3 left-1/2 z-[60] w-[min(92%,28rem)] -translate-x-1/2 animate-slide-up">
      <div className="flex items-center gap-3 rounded-card border border-accent-400/40 bg-surface-float/95 px-3 py-2.5 shadow-dialog backdrop-blur">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input bg-accent-300/15 text-accent-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v11" /><path d="M8 10l4 4 4-4" /><rect x="4" y="18" width="16" height="3" rx="1" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-ink-primary">홈 화면에 추가</p>
          <p className="truncate text-2xs text-ink-muted">앱처럼 더 빠르게 이용하세요</p>
        </div>
        <button type="button" onClick={install} className="btn-primary shrink-0 px-3 py-1.5 text-xs">설치</button>
        <button type="button" onClick={dismiss} aria-label="닫기" className="shrink-0 px-1 text-ink-muted hover:text-ink-primary">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
        </button>
      </div>
    </div>
  );
}
