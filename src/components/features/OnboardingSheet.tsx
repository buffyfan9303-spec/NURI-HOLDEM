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

export default function OnboardingSheet() {
  // 마스터 지시서 Phase 13-4: 최초 방문에 단 하나만 묻는다 — 3초 안에 끝나고 건너뛸 수 있다.
  // (예전 5스텝 스와이프 투어는 문서 원칙 '풀스크린 투어 금지 — 스킵된다'에 따라 1문답으로 교체.
  //  각 화면의 사용법 안내는 코치마크(CoachMark)가 그 자리에서 1개씩 담당한다.)
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
      const sp = new URLSearchParams(window.location.search);
      if (DEEPLINK_KEYS.some((k) => sp.has(k))) return; // 공유 링크 진입은 방해하지 않음
      const t = window.setTimeout(() => setOpen(true), 700); // 첫 페인트 후 자연스럽게
      return () => window.clearTimeout(t);
    } catch { /* SSR/no storage */ }
  }, []);

  const finish = (persona?: 'tourney' | 'regular' | 'gto') => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
      if (persona) localStorage.setItem('nuri:persona', persona);
    } catch { /* noop */ }
    setOpen(false);
    // 선택이 실제 화면을 바꾼다 — '첫 화면을 맞춰드려요' 약속의 이행.
    // gto → 도구 탭 / regular(매장 단골) → 가까운 순 정렬 켜기(위치 1회 요청) / tourney → 기본 일정탐색.
    if (persona === 'gto') window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'tools' }));
    else if (persona === 'regular') window.dispatchEvent(new Event('nuri:enable-near'));
  };

  const OPTIONS: { key: 'tourney' | 'regular' | 'gto'; icon: string; title: string; desc: string }[] = [
    { key: 'tourney', icon: '🏆', title: '대회 찾기', desc: '내 주변 토너먼트 일정을 본다' },
    { key: 'regular', icon: '📍', title: '매장 단골', desc: '내 주변 매장부터 — 가까운 순으로 보여드려요' },
    { key: 'gto', icon: '🎯', title: 'GTO 공부', desc: '핸드 분석 · 트레이너로 연습' },
  ];

  return (
    <Modal open={open} onClose={() => finish()} variant="sheet" maxWidth="sm" title="시작하기">
      <div className="flex flex-col gap-2 px-5 pb-5 pt-2">
        <p className="text-sm font-bold text-ink-primary">주로 무엇을 하시나요?</p>
        <p className="-mt-1 text-2xs text-ink-muted">첫 화면을 맞춰드려요 — 언제든 바꿀 수 있어요.</p>
        {OPTIONS.map((o) => (
          <button key={o.key} type="button" onClick={() => finish(o.key)}
            className="flex items-center gap-3 rounded-card border border-border-default bg-surface-high px-3.5 py-3 text-left transition-colors hover:border-accent-400/50 hover:bg-accent-300/[0.06] active:scale-[0.99]">
            <span className="text-2xl" aria-hidden>{o.icon}</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink-primary">{o.title}</span>
              <span className="block text-2xs text-ink-secondary">{o.desc}</span>
            </span>
          </button>
        ))}
        <button type="button" onClick={() => finish()} className="btn-ghost mt-1 py-2.5 text-xs text-ink-muted">
          건너뛰기
        </button>
      </div>
    </Modal>
  );
}
