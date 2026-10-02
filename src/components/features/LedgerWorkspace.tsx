// src/components/features/LedgerWorkspace.tsx — 장부 작업대.
//
// 오너 지시(2026-09-06) 두 가지를 한 껍데기로 묶는다:
//  ① **전체화면 모드.** 모니터가 작으면 장부의 이름 칸이 잘려 누가 누군지 안 보였다. 레이아웃을 비트는
//     대신 화면을 넓히는 쪽을 택했다(오너 판단) — 앱 크롬(헤더·탭바)까지 걷어내고 브라우저 UI 도 접는다.
//  ② **우측 이용권 실시간 레일.** 평소엔 장부 옆, 전체화면에선 방송 채팅 자리처럼 세로로 길게.
//
// 🔴 2026-10-02 오너 1b — 레일을 다시 **장부 오른쪽**에 둔다. 09-27 에 '모든 폭에서 장부 아래'로 옮긴 것(cd2d97e0)은
//   "장부를 보며 옆에서 이용권 발급·전송·사용이 새로고침 없이 들어오는지 본다" 는 오너 의도와 어긋났다(레일이 표 아래 1.5~2.2 화면).
//   그때 옮긴 이유(표가 1024 에서 1칸·1440 에서 5칸)는 폭별로 푼다 — 감사 실측(audit-mystore-ui-1002 §1-2):
//   · ≥1440 : 판 폭 상한(앱 프레임·main 1224px)을 **장부 판이 보일 때만** 풀고 레일 18rem 을 상시 펼친다(1440 바인 9칸).
//   · 768~1439 : 접힌 띠(3rem) + 새 이용권 배지. 누르면 표 위로 20rem 레일이 펼쳐진다(표 폭은 그대로 — 1280 10칸).
//   · <768 : 종전처럼 표 아래(모바일은 폭이 없다) + 상단 [이용권] 바로가기.
//   레일은 어느 폭에서도 **한 인스턴스**다 — 접고 펼쳐도 구독·폴링이 끊기지 않고(배지를 세야 한다) 재조회도 없다.
//
// ⚠ 장부(NuriPosLedger)는 이 파일이 주는 도구(전체화면·이용권 바로가기)를 LedgerToolsContext 로 받아
//   자기 날짜 줄 끝에 그린다(혼자 한 줄을 차지하던 도구 줄 41px 회수 — 감사 L-4·L-9).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Icon from '../atoms/Icon';
import LedgerVoucherRail from './LedgerVoucherRail';
import { LedgerToolsContext, LedgerFullscreenContext } from './ledgerTools';
import { useIsDesktop, useIsMdUp, useIsWide } from '../../lib/responsive';

import { useUncapAncestors } from '../../lib/uncapAncestors';
import './ledgerLazy.css';

// 펼친 띠(표 위로 덮음) — 쌓임 35 는 레일(30)·복제본(tabCover) 사이. 그림자는 종전 큰 그림자 유틸(25px·50px·-12px·25% 검정)과 같다.
const RAIL_POP_STYLE = { zIndex: 35, boxShadow: '0 25px 50px -12px #00000040' };
/** 펼친 띠 레일의 최소 높이(px) — 윗변을 표에 맞춰 내려도 검색칸 + 목록 몇 줄은 남게(B1). */
const RAIL_POP_MIN = 260;

export default function LedgerWorkspace({ venueId, active, canViewVouchers, children }: {
  venueId: string;
  /** 장부 판이 실제로 보이는가 — 레일의 구독·폴링을 이 값으로 끊는다 */
  active: boolean;
  /** 이용권 내역 열람 권한(VenueManageTab 의 caps.voucher).
   *  🔴 없으면 레일을 **아예 그리지 않는다**(2026-09-17). 장부 권한과 이용권 권한은 서버에서 갈린다 —
   *  can_access_ledger = can_manage_pos ‖ ledger_access / can_view_vouchers = can_manage_pos ‖ voucher_access.
   *  '장부만 준 직원' 조합이 실제로 만들어지는데(초대 화면의 grant_ledger·grant_voucher 가 따로다),
   *  그 사람에게 레일을 그리면 RLS(store_vouchers_select)가 **에러 없이 0행**을 준다.
   *  PostgREST 는 RLS 거부를 에러가 아니라 빈 배열로 돌려주므로 `if (error) throw` 로는 못 잡는다.
   *  그 0행을 레일이 '보낸 기록이 없어요' 라고 **단언**한다 — 카운터에서 손님에게 틀린 답을 하는 자리다. */
  canViewVouchers: boolean;
  children: ReactNode;
}) {
  const [full, setFull] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const setHostEl = useCallback((el: HTMLDivElement | null) => { hostRef.current = el; setHost(el); }, []);
  // 🔴 LVR-1(2026-09-22) — 전체화면 레일 wrapper 는 `hidden … md:block` 이라 <768px 에서는 **보이지도 조작되지도 않는다.**
  //   CSS 의 `md:` 와 반드시 같은 768px 이어야 767~768 경계에서 '보이는데 안 도는' 창이 안 생긴다.
  const isMdUp = useIsMdUp();
  const isLg = useIsDesktop();
  const isWide = useIsWide();
  /** 표 옆 레일(상시 펼침 또는 접힌 띠). <768 은 표 아래. */
  const side = canViewVouchers && isMdUp;
  /** 접힌 띠 구간(768~1439) */
  const strip = side && !isWide;
  const [railOpen, setRailOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  // 장부를 떠나면(다른 단계·탭) 펼쳐 둔 레일을 접는다 — 돌아왔을 때 표 위를 덮은 채로 남지 않게.
  useEffect(() => { if (!active) setRailOpen(false); }, [active]);
  // M-1·M-3(design-reviewer 2026-10-02) — 펼친 띠 레일은 표 위를 덮는다([+ 유저 추가]·정렬·총바인·미수 열).
  //   ① 레일 밖을 누르면 접는다(표로 돌아가는 손이 곧 닫는 손). ② 펼치면 접기 버튼으로, 접히면 띠 버튼으로 포커스를 옮긴다
  //   (예전엔 펼치는 순간 누른 띠 버튼이 사라져 포커스가 BODY 로 빠졌다). 검색칸이 아니라 접기 버튼인 이유: 터치 태블릿에서 키보드가 뜬다.
  const stripBoxRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    const box = stripBoxRef.current;
    if (railOpen) {
      wasOpen.current = true;
      // [이용권 확인] 이 검색칸에 준 포커스는 지킨다 — 그쪽 rAF 가 먼저 돌므로 판정도 rAF 안에서 한다.
      requestAnimationFrame(() => { if (box && !box.contains(document.activeElement)) box.querySelector<HTMLElement>('[data-voucher-collapse]')?.focus({ preventScroll: true }); });
      // C1 d(2026-10-02, review-mystore-b1-1002 §3-3) — 레일을 펼친 채 표의 빈 + 칸을 누르면 레일이 닫히면서 **결제창까지** 열렸다(클릭 관통).
      //   표 안을 누른 첫 클릭은 '레일 닫기'로만 쓴다(이어지는 click 한 번을 삼킨다). 표 위 도구 줄·사이드 메뉴 등 표 밖은 종전대로 바로 동작한다.
      const onDown = (e: PointerEvent) => {
        const t = e.target as Element;
        if (!box || box.contains(t)) return;
        setRailOpen(false);
        if (!t.closest?.('table') || !colRef.current?.contains(t)) return;
        // C1 후속(review-mystore-c1-1002 §2-d) — 삼키는 건 **이 누름의 click** 하나뿐이다. 터치 스와이프는 click 없이 pointercancel 로
        //   끝나서 리스너가 800ms 남아 바로 다음 탭(+ 칸)을 먹었다. 이 누름이 취소되거나 다음 누름이 시작되면 즉시 뗀다.
        //   (다음 pointerdown 리스너는 지금 디스패치 중에 붙여도 이번 이벤트엔 불리지 않는다 — DOM 은 리스너 목록을 미리 복사한다.)
        const off = () => {
          document.removeEventListener('click', eat, true);
          document.removeEventListener('pointercancel', off, true);
          document.removeEventListener('pointerdown', off, true);
        };
        const eat = (c: MouseEvent) => { c.preventDefault(); c.stopPropagation(); off(); };
        document.addEventListener('click', eat, true);
        document.addEventListener('pointercancel', off, true);
        document.addEventListener('pointerdown', off, true);
        setTimeout(off, 800);
      };
      document.addEventListener('pointerdown', onDown, true);
      return () => document.removeEventListener('pointerdown', onDown, true);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      // 레일 안에 있던 포커스(또는 갈 곳을 잃은 포커스)만 띠로 돌린다 — 바깥을 눌러 닫았으면 그쪽 포커스를 뺏지 않는다.
      const a = document.activeElement;
      if (box && (!a || a === document.body || box.contains(a))) requestAnimationFrame(() => box.querySelector<HTMLElement>('[data-voucher-strip]')?.focus({ preventScroll: true }));
    }
  }, [railOpen]);

  // B1(2026-10-02, review-store-ledger-1002b §4) — 펼친 띠 레일(20rem)이 띠 상자 꼭대기부터 표 위를 덮어
  //   장부 도구 줄([+ 유저 추가]·정렬·[클락]·[세션 정보 수정])까지 가렸다 — 덮인 [+ 유저 추가] 를 누르면 레일 안에 맞아 아무 일도 없었다.
  //   펼친 레일의 윗변을 **표 윗변**에 맞춘다: 도구 줄은 늘 보이고 눌리며, 덮이는 것은 표 오른쪽 열뿐이다(종전 의도 그대로).
  //   스크롤로 표 윗변이 띠 상자 위로 올라가면 0(띠 상자 꼭대기 = 헤더 밑)이다. 표가 없는 판(목록·세팅)도 0 — 덮을 도구 줄이 표 위에 없다.
  //   레일이 너무 낮아지지 않게 아래 RAIL_POP_MIN 만큼은 남긴다(그 경우만 표 머리 일부를 덮는다 — 도구 줄은 표 위라 영향 없다).
  const [popTop, setPopTop] = useState(0);
  useLayoutEffect(() => {
    const box = stripBoxRef.current, col = colRef.current;
    if (!strip || !railOpen || !box || !col) { setPopTop(0); return; }
    const measure = () => {
      const t = [...col.querySelectorAll('table')].find((x) => x.getClientRects().length > 0);
      const b = box.getBoundingClientRect();
      const top = t ? Math.round(t.getBoundingClientRect().top - b.top) : 0;
      setPopTop(Math.max(0, Math.min(top, Math.round(b.height) - RAIL_POP_MIN)));
    };
    measure();   // 펼친 첫 프레임부터 — 덮었다가 내려가는 프레임이 없게(레이아웃 effect)
    let raf = 0;
    const sync = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const ro = new ResizeObserver(sync);
    ro.observe(col);
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('scroll', sync); window.removeEventListener('resize', sync); };
  }, [strip, railOpen]);

  // ≥1440 · 장부 판이 보일 때 판 폭 상한을 푼다(감사 시뮬 B: 1440 바인 9칸 · 1920 10칸).
  //   F-2(2026-10-02) — 앱 프레임·main·내 매장 루트는 VenueManageTab 이 탭 단위로 푼다. 여기선 그 루트 **안쪽**만(셸이 튀지 않게).
  useUncapAncestors(host, active && !full && isWide && side, { stopAtRoot: true });

  // 정산바(position:fixed, NuriPosLedger)의 좌우 경계를 **표 칸**에 맞춘다 — 레일이 옆에 서면 바가 레일 밑까지 뻗지 않게.
  //   값은 표 칸의 실제 좌우 끝(뷰포트 기준). 바는 CSS 변수(--ledger-bar-left/right/max)를 읽는다(전체화면은 index.css 가 같은 일을 한다).
  const colRef = useRef<HTMLDivElement>(null);
  const [barVars, setBarVars] = useState<Record<string, string> | undefined>(undefined);
  useLayoutEffect(() => {
    const col = colRef.current;
    if (!side || full || !isLg || !col) { setBarVars(undefined); return; }
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = col.getBoundingClientRect();
        if (r.width <= 0) return;   // 숨은 판(display:none) — 다음 발화에서 다시 잰다
        const vw = document.documentElement.clientWidth;
        const next = { '--ledger-bar-left': `${Math.max(0, Math.round(r.left))}px`, '--ledger-bar-right': `${Math.max(0, Math.round(vw - r.right))}px`, '--ledger-bar-max': 'none' };
        setBarVars((p) => (p && p['--ledger-bar-left'] === next['--ledger-bar-left'] && p['--ledger-bar-right'] === next['--ledger-bar-right'] ? p : next));
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(col);
    window.addEventListener('resize', sync);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', sync); };
  }, [side, full, isLg, active, isWide]);

  // [이용권 확인] — 모바일은 표 아래 레일까지 내려가고, 접힌 띠는 펼친 뒤, 상시 레일은 그대로 검색칸에 포커스한다.
  //   레일 상자의 scroll-mt 가 앱 헤더(--stack-top) 아래에 멈추게 한다 — 검색칸은 레일 맨 위라 하단 정산바와 겹치지 않는다.
  const jumpToRail = useCallback(() => {
    const focus = () => searchRef.current?.focus({ preventScroll: true });
    if (!side) {
      const box = railRef.current;
      if (!box) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      box.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      focus();
      return;
    }
    if (strip && !railOpen) { setRailOpen(true); requestAnimationFrame(focus); return; }
    focus();
  }, [side, strip, railOpen]);

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
  // Esc 로도 닫힌다(브라우저 전체화면이 거부된 경우 fullscreenchange 가 오지 않는다). 펼친 띠 레일도 Esc 로 접힌다.
  useEffect(() => {
    if (!full && !railOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (full) exit(); else setRailOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, railOpen, exit]);

  // 도구 — 장부 날짜 줄(또는 목록 검색 줄) 끝에 붙는다. 모바일은 글자를 줄여 날짜 칸과 한 줄에 선다.
  // 🔴 2026-09-20 — 유효 표적 30.7px → 32px 상자 + `tap-y-44`(::before inset -6px 0) = 누름영역 44px.
  const toolBtn = 'tap-y-44 inline-flex min-h-[32px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-input border border-border-default bg-surface-high px-2.5 text-2xs font-bold text-ink-secondary transition-colors hover:border-accent-400/40 hover:text-accent-300';
  const toggle = (
    <button type="button" onClick={full ? exit : enter} data-testid="ledger-fullscreen" aria-label={full ? '전체화면 끄기' : '전체화면'} className={toolBtn}>
      <Icon name={full ? 'minimize' : 'maximize'} size={13} className="shrink-0" />
      <span className={full ? undefined : 'max-sm:hidden'}>{full ? '전체화면 끄기' : '전체화면'}</span>
    </button>
  );
  const tools = (
    <>
      {/* 권한 없는 직원은 레일이 없으니 바로가기도 없다(아래 레일과 같은 게이트) */}
      {canViewVouchers && (
        <button type="button" onClick={jumpToRail} data-testid="ledger-voucher-jump" className={toolBtn}>
          <Icon name="ticket" size={13} className="shrink-0" />
          이용권<span className="max-sm:hidden"> 확인</span>
        </button>
      )}
      {toggle}
    </>
  );

  if (full) {
    return (
      /* data-ledger-fullscreen: 정산바(NuriPosLedger, position:fixed)가 화면이 아니라
         **이 안의 장부 칸**에 맞도록 좌우 경계를 넘긴다. 값은 index.css 에 있다 —
         레일 폭(20rem)과 칸 여백(px-3)이 바뀌면 그 한 곳만 고치면 된다. */
      /* 안전영역: 브라우저 전체화면이 거부되면(iOS 사파리 등) 이건 그냥 `fixed inset-0` 오버레이라
          viewport-fit=cover 아래에서 머리말이 상태바 밑으로, 바닥이 홈 인디케이터 밑으로 들어간다.
          데스크톱에서는 env(...) 가 0 이라 PC 렌더는 한 픽셀도 안 바뀐다. */
      <div ref={setHostEl} data-ledger-fullscreen className="fixed inset-0 z-70 flex flex-col bg-surface-base pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-primary">장부 · 전체화면</span>
          <span className="hidden text-2xs text-ink-muted sm:inline">Esc 로 나가기</span>
          {toggle}
        </div>
        {/* 좌: 장부(스크롤) / 우: 이용권 레일(고정). 레일은 세로로 길수록 쓸모가 커진다. */}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto px-3 py-2">
            <LedgerFullscreenContext.Provider value><LedgerToolsContext.Provider value={null}>{children}</LedgerToolsContext.Provider></LedgerFullscreenContext.Provider>
          </div>
          {canViewVouchers && (
            <div className="hidden w-[20rem] shrink-0 border-l border-border-subtle p-3 md:block">
              <LedgerVoucherRail venueId={venueId} active={active && isMdUp} dense />
            </div>
          )}
        </div>
      </div>
    );
  }

  // 레일 칸 높이 — 앱 헤더(--stack-top) 밑에서 하단 고정 바(--footer-reserve = 정산바+여유, 정산바 없는 화면은 0) 위까지.
  //   lg 미만(768~1023)은 하단 탭바가 있다 — 정산바가 없는 목록 모드에서도 탭바 밑으로 들어가지 않게 둘 중 큰 쪽을 뺀다.
  const railBox = 'sticky top-[calc(var(--stack-top,6.0625rem)+0.75rem)] shrink-0';
  // 높이·폭은 인라인 — 2026-10-02 번들 예산(전역 CSS 임의값 클래스 → 첫 화면 267.2/267). 값은 종전 유틸과 같다.
  const railBoxStyle = {
    height: isLg
      ? 'calc(100svh - var(--stack-top,6.0625rem) - var(--footer-reserve,0px) - 1.5rem)'
      : 'calc(100svh - var(--stack-top,6.0625rem) - max(var(--footer-reserve,0px), var(--tabbar-safe,0px)) - 1.5rem)',
    minHeight: '20rem',
    width: strip ? '48px' : '18rem',
  };
  return (
    <div ref={setHostEl} data-ledger-workspace={side ? (strip ? 'strip' : 'rail') : 'below'} style={barVars}
      className={side ? 'flex items-start gap-3' : undefined}>
      <div ref={colRef} className="min-w-0 flex-1">
        <LedgerToolsContext.Provider value={tools}>{children}</LedgerToolsContext.Provider>
      </div>
      {/* 표 옆(≥768) — 펼친 띠는 표 위로 덮는다(표 칸 폭은 그대로라 바인 칸이 다시 접히지 않는다). */}
      {canViewVouchers && side && (
        <div ref={stripBoxRef} style={railBoxStyle} className={[railBox, strip ? 'relative' : ''].join(' ')}>
          <div style={strip && railOpen ? { ...RAIL_POP_STYLE, top: popTop } : undefined} className={strip && railOpen ? 'absolute inset-y-0 right-0 w-[20rem] rounded-aura' : 'h-full'}>
            <LedgerVoucherRail venueId={venueId} active={active} searchRef={searchRef}
              collapsed={strip && !railOpen} onToggle={strip ? () => setRailOpen((v) => !v) : undefined} />
          </div>
        </div>
      )}
      {/* 표 아래(<768) — 모바일은 폭이 없다. 상단 [이용권] 이 여기까지 내려와 검색칸에 포커스한다. */}
      {canViewVouchers && !side && (
        <div ref={railRef} className="mt-4 h-104 scroll-mt-[calc(var(--stack-top,6.0625rem)+0.75rem)]">
          <LedgerVoucherRail venueId={venueId} active={active} searchRef={searchRef} />
        </div>
      )}
    </div>
  );
}
