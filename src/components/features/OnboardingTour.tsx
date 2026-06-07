// src/components/features/OnboardingTour.tsx
// 첫 방문 온보딩 — 앱 핵심을 4스텝으로 안내. localStorage로 1회만 노출.
import { useEffect, useState, type ReactNode } from 'react';

const SEEN_KEY = 'nh-onboarded-v1';

interface Step { icon: ReactNode; title: string; desc: string }
const STEPS: Step[] = [
  {
    icon: <><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /></>,
    title: 'NURI HOLDEM에 오신 걸 환영합니다',
    desc: '홀덤 대회 일정 · 커뮤니티 · 중고장터 · 도구를 한 곳에서. 1분이면 둘러보기 끝!',
  },
  {
    icon: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    title: '일정 탐색',
    desc: '지역·날짜·포맷(GTD·MTT·대회)으로 대회를 찾고, 포스터를 눌러 상세·예약까지 한 번에.',
  },
  {
    icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    title: '커뮤니티 · 도구',
    desc: '홀덤펍·게시판·딜러·랭킹으로 소통하고, 상단 「도구」에서 GTO·스타팅핸드·계산기를 바로 사용하세요.',
  },
  {
    icon: <><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" /></>,
    title: '매장 운영(업주)',
    desc: '업주는 「내 매장」에서 장부·클락·예약·직원·통계를 실시간으로 관리합니다. 운영자는 모든 매장 접근 가능.',
  },
];

export default function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { if (!localStorage.getItem(SEEN_KEY)) setShow(true); } catch { /* noop */ }
  }, []);

  const close = () => { setShow(false); try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* noop */ } };
  const next = () => (step >= STEPS.length - 1 ? close() : setStep((s) => s + 1));

  if (!show) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
      <button type="button" aria-label="닫기" onClick={close} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-dialog border border-border-default bg-surface-mid p-5 shadow-dialog animate-slide-up">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gold-300/15 text-gold-300">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{s.icon}</svg>
        </div>
        <h2 className="text-center text-base font-bold text-ink-primary">{s.title}</h2>
        <p className="mt-1.5 text-center text-xs leading-relaxed text-ink-secondary">{s.desc}</p>

        {/* 인디케이터 */}
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-gold-300' : 'w-1.5 bg-border-strong'}`} />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={close} className="btn-ghost flex-1 text-sm">건너뛰기</button>
          <button type="button" onClick={next} className="btn-primary flex-1 text-sm">{last ? '시작하기' : '다음'}</button>
        </div>
      </div>
    </div>
  );
}
