// src/components/features/OnboardingSheet.tsx
// 첫 진입 온보딩(#29) — 신규 방문자에게 앱 핵심 가치를 단계별로 소개하는 1회성 시트.
// 좌표 기반 스포트라이트 투어는 반응형/모바일에서 레이아웃 깨짐 위험이 커, 요소 타깃팅 없이
// 견고하게 동작하는 단계형 웰컴 시트로 구현(애니메이션은 공용 Modal 재사용).
//  - localStorage 1회 게이트(다시 안 뜸)
//  - 공유 딥링크(?s/?v/?checkin/?display 등) 진입 시엔 방해하지 않도록 표시 안 함
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';

const SEEN_KEY = 'nuri_onboarding_v1';
// 딥링크/QR로 들어온 경우엔 온보딩을 띄우지 않는다(해당 플로우를 가리지 않도록).
// 공유 대회/매장/체크인/디스플레이 + 테이블 바인 QR(buyin·game)·가입 QR(signup) 포함.
const DEEPLINK_KEYS = ['s', 'v', 'venue', 'display', 'checkin', 'post', 'ref', 'shared', 'g', 'buyin', 'game', 'signup'];

interface Step { icon: string; title: string; body: string; }
const STEPS: Step[] = [
  { icon: '👋', title: 'NURI HOLDEM에 오신 걸 환영해요', body: '전국 홀덤 대회 일정 · 홀덤펍 커뮤니티 · 중고장터를 한 곳에서. 핵심만 30초 안에 안내할게요.' },
  { icon: '🗺️', title: '내 주변 대회 찾기', body: '지역 · 날짜 · 바이인으로 토너먼트를 찾고, 마음에 드는 대회는 내 캘린더에 바로 추가하세요.' },
  { icon: '📍', title: '체크인 & 출석', body: '매장 QR로 체크인하면 출석 도장이 쌓이고, 전적이 인정되며 방문 후기를 남길 수 있어요.' },
  { icon: '💬', title: '커뮤니티 & 중고장터', body: '핸드 분석을 공유하고, 칩 · 용품을 안전하게 사고팔 수 있어요.' },
  { icon: '🔒', title: '휴대폰 본인인증 한 번', body: '글쓰기 · 대회 예약 · 전적 인정을 위해 휴대폰 인증을 1회만 하면 모든 기능이 열려요.' },
];

export default function OnboardingSheet() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
      const sp = new URLSearchParams(window.location.search);
      if (DEEPLINK_KEYS.some((k) => sp.has(k))) return; // 공유 링크 진입은 방해하지 않음
      const t = window.setTimeout(() => setOpen(true), 700); // 첫 페인트 후 자연스럽게
      return () => window.clearTimeout(t);
    } catch { /* SSR/no storage */ }
  }, []);

  const finish = () => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* noop */ }
    setOpen(false);
  };
  const next = () => { if (step < STEPS.length - 1) setStep((s) => s + 1); else finish(); };
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

  return (
    <Modal open={open} onClose={finish} variant="sheet" maxWidth="sm" title="시작하기">
      <div className="flex flex-col px-5 pb-5 pt-2">
        {/* 진행 점 */}
        <div className="flex justify-center gap-1.5 pb-4" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={['h-1.5 rounded-full transition-all duration-300',
              i === step ? 'w-5 bg-accent-300' : i < step ? 'w-1.5 bg-accent-300/50' : 'w-1.5 bg-border-strong'].join(' ')} />
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 text-center" aria-live="polite">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-300/[0.12] text-3xl" aria-hidden>{s.icon}</div>
          <h3 className="text-base font-bold text-ink-primary">{s.title}</h3>
          <p className="min-h-[3.5rem] text-2xs leading-relaxed text-ink-secondary">{s.body}</p>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button type="button" onClick={finish} className="btn-ghost px-3 py-2.5 text-xs text-ink-muted">
            건너뛰기
          </button>
          <button type="button" onClick={next} className="btn-primary flex-1 py-3 text-sm">
            {isLast ? '시작하기' : '다음'}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-ink-muted">{step + 1} / {STEPS.length}</p>
      </div>
    </Modal>
  );
}
