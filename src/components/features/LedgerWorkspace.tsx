// src/components/features/LedgerWorkspace.tsx — 장부 작업대.
//
// 오너 지시(2026-09-06) 두 가지를 한 껍데기로 묶는다:
//  ① **전체화면 모드.** 모니터가 작으면 장부의 이름 칸이 잘려 누가 누군지 안 보였다. 레이아웃을 비트는
//     대신 화면을 넓히는 쪽을 택했다(오너 판단) — 앱 크롬(헤더·탭바)까지 걷어내고 브라우저 UI 도 접는다.
//  ② **우측 이용권 실시간 레일.** 평소엔 장부 옆, 전체화면에선 방송 채팅 자리처럼 세로로 길게.
//
// ⚠ 장부(NuriPosLedger, 2800줄)는 건드리지 않는다. 이 파일은 자리만 만들어 준다 —
//   장부 안에 전체화면 상태를 심으면 그 큰 파일의 조건 분기가 하나 더 늘고, 되돌리기도 어려워진다.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from '../atoms/Icon';
import LedgerVoucherRail from './LedgerVoucherRail';

export default function LedgerWorkspace({ venueId, active, children }: {
  venueId: string;
  /** 장부 판이 실제로 보이는가 — 레일의 구독·폴링을 이 값으로 끊는다 */
  active: boolean;
  children: ReactNode;
}) {
  const [full, setFull] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  // 브라우저 전체화면은 '되면 좋은 것'이다 — 거부돼도(권한·iOS 사파리) 앱 안에서의 전체화면은 그대로 된다.
  const enter = useCallback(() => {
    setFull(true);
    const el = hostRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => { /* 앱 내 전체화면만으로 충분 */ });
  }, []);
  const exit = useCallback(() => {
    setFull(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  // Esc·브라우저 UI 로 전체화면이 풀리면 앱 상태도 같이 내린다(둘이 어긋나면 '나갈 수 없는 화면'이 된다).
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  // 전체화면 중에는 뒤의 문서가 스크롤되지 않게 — 배경이 움직이면 어느 판을 보는지 헷갈린다.
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [full]);
  // Esc 로도 닫힌다(브라우저 전체화면이 거부된 경우 fullscreenchange 가 오지 않는다)
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, exit]);

  const toggle = (
    <button type="button" onClick={full ? exit : enter}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-input border border-border-default bg-surface-high px-2.5 py-1.5 text-2xs font-bold text-ink-secondary transition-colors hover:border-accent-400/40 hover:text-accent-300">
      <Icon name={full ? 'minimize' : 'maximize'} size={13} className="shrink-0" />
      {full ? '전체화면 끄기' : '전체화면'}
    </button>
  );

  if (full) {
    return (
      /* data-ledger-fullscreen: 정산바(NuriPosLedger, position:fixed)가 화면이 아니라
         **이 안의 장부 칸**에 맞도록 좌우 경계를 넘긴다. 값은 index.css 에 있다 —
         레일 폭(20rem)과 칸 여백(px-3)이 바뀌면 그 한 곳만 고치면 된다. */
      <div ref={hostRef} data-ledger-fullscreen className="fixed inset-0 z-[70] flex flex-col bg-surface-base">
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-primary">장부 · 전체화면</span>
          <span className="hidden text-2xs text-ink-muted sm:inline">Esc 로 나가기</span>
          {toggle}
        </div>
        {/* 좌: 장부(스크롤) / 우: 이용권 레일(고정). 레일은 세로로 길수록 쓸모가 커진다. */}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
          <div className="hidden w-[20rem] shrink-0 border-l border-border-subtle p-3 md:block">
            <LedgerVoucherRail venueId={venueId} active dense />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={hostRef}>
      <div className="mb-2 flex items-center justify-end">{toggle}</div>
      {/* PC 는 2단(장부 + 레일), 좁은 폭은 장부 아래에 레일을 둔다 — 좁은 화면에서 옆에 붙이면 둘 다 못 쓴다. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-4">
        <div className="min-w-0">{children}</div>
        <div className="mt-4 h-[26rem] lg:sticky lg:top-[calc(var(--stack-top,6.0625rem)+0.75rem)] lg:mt-0 lg:h-[calc(100vh-var(--stack-top,6.0625rem)-2rem)]">
          <LedgerVoucherRail venueId={venueId} active={active} />
        </div>
      </div>
    </div>
  );
}
