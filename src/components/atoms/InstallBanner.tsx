// src/components/atoms/InstallBanner.tsx
// PWA 홈 화면 설치 안내 배너. beforeinstallprompt 지원 브라우저에서만 노출.
// 이미 설치(standalone)했거나 닫은 적 있으면 표시하지 않는다.
import { useEffect, useState } from 'react';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const DISMISS_KEY = 'nh-install-dismissed';

// beforeinstallprompt 는 **페이지당 1회만** 발화한다. 이 배너는 전면 오버레이(상세·내 정보·매장)가
// 열려 있는 동안 App 이 언마운트하므로(F10), 이벤트를 컴포넌트 안에서만 기다리면 그 사이에 발화한
// 참조를 영영 못 잡아 설치 기능이 통째로 사라진다 → 모듈 로드 시점에 붙잡아 둔다.
// (CustomerDashboardPage.tsx 도 같은 조리법으로 저장만 한다 — prompt() 는 여전히 1회.)
let deferred: BIPEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIPEvent; });
}

/** 이미 설치(standalone)했거나 닫은 적이 있으면 다시 띄우지 않는다 */
function suppressed(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    return !!localStorage.getItem(DISMISS_KEY);
  } catch { return false; }
}

export default function InstallBanner() {
  const [evt, setEvt] = useState<BIPEvent | null>(deferred);
  // 닫힘은 localStorage 에도 남으므로(아래 dismiss) 오버레이로 언마운트됐다 돌아와도 되살아나지 않는다.
  const [hidden, setHidden] = useState(suppressed);

  useEffect(() => {
    if (suppressed()) return;
    const onP = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener('beforeinstallprompt', onP);
    return () => window.removeEventListener('beforeinstallprompt', onP);
  }, []);

  const dismiss = () => { setHidden(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ } };
  const install = async () => {
    if (!evt) return;
    setHidden(true);
    try { await evt.prompt(); } catch { /* 사용자 취소 등 무시 */ }
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  };

  if (hidden || !evt) return null;
  return (
    // 모바일: 하단 탭바 쪽으로 더 내린다(오너 지시 2026-09-14: "하단 메뉴바쪽으로 조금 더") — PC는 기존 위치.
    // ⚠ --tabbar-float 은 토스트(Toast.tsx)·맨 위로 버튼(App.tsx)과 공유하는 변수라 값 자체는 안 건드린다.
    //   이 배너만 낮추려고 rem 부분만 5.75→4.5 로 줄인 값을 여기 하드코딩한다(safe-area·tabbar-lift 항은 그대로
    //   물려받는다 — 실기기 안전영역·삼성 보정을 잃지 않는다).
    //   실측(390×844, safe-area 0): 탭바 top=769.75px. 기존 배너 bottom=734.25px(탭바까지 35.5px 여백) →
    //   4.5rem 로 낮추면 bottom≈755.5px(탭바까지 14.25px 여백) — 탭 버튼 히트 영역(top 770.75px)과
    //   14px 넘게 떨어져 있어 덮지 않는다. "조금 더"의 상한("탭바 바로 위에 붙는 정도")을 넘지 않는 선.
    <div className="fixed bottom-[calc(4.5rem_+_var(--tabbar-lift)_+_max(env(safe-area-inset-bottom),12px))] lg:bottom-3 left-1/2 z-[60] w-[min(92%,28rem)] -translate-x-1/2 animate-slide-up">
      <div className="flex items-center gap-3 rounded-card border border-accent-400/40 bg-surface-float/95 px-3 py-2.5 shadow-dialog backdrop-blur">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input bg-accent-300/15 text-accent-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v11" /><path d="M8 10l4 4 4-4" /><rect x="4" y="18" width="16" height="3" rx="1" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-ink-primary">홈 화면에 추가</p>
          {/* 2026-09-18 오너 지시로 설명줄 제거 — 홈 화면 추가의 이점은 이미 널리 알려진 통념 — 뻔한 마케팅 카피, 제목 '홈 화면에 추가'만으로 충분. */}
        </div>
        <button type="button" onClick={install} className="btn-primary shrink-0 px-3 py-1.5 text-xs">설치</button>
        {/* 34x34 + 세로 보탬(tap-y-44). ⚠ .hit 는 금지 — 44x44 가 왼쪽 '설치' 버튼 위로 번져
            설치를 누르려다 배너가 닫힌다. 가로는 실제 패딩으로만 넓힌다. */}
        <button type="button" onClick={dismiss} aria-label="닫기" className="tap-y-44 shrink-0 -mr-1 p-2.5 text-ink-muted hover:text-ink-primary">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
        </button>
      </div>
    </div>
  );
}
