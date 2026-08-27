import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useBackClose } from '../../lib/backstack';
import { lockScroll, unlockScroll } from '../../lib/scrollLock';
import Icon from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** sheet: 하단 시트 / center: 센터 / page: 전체화면 불투명 페이지(뒤 비침 없음) */
  variant?: 'center' | 'sheet' | 'page';
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl';
  /** true면 모달 높이를 최대치로 고정 (탭 전환 시 크기 변동 방지) */
  fillHeight?: boolean;
  /** true면 오버레이가 아닌 인라인 패널로 렌더(데스크탑 2-pane 우측 패널용). */
  inline?: boolean;
  /** false면 배경(공백) 클릭으로 닫히지 않음 — 작성 폼에서 실수로 닫힘 방지(X·ESC는 유지). 기본 true. */
  dismissOnBackdrop?: boolean;
}

const MAX_W: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
};

export default function Modal({
  open, onClose, title, children, variant = 'sheet', maxWidth = 'md', fillHeight = false, inline = false, dismissOnBackdrop = true,
}: ModalProps) {
  // ESC 키로 닫기 + 바디 스크롤 잠금
  useEffect(() => { if (open) { setDragY(0); setFlingOut(false); } }, [open]);
  useEffect(() => {
    if (!open || inline) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    lockScroll(); // 뷰포트 스크롤러는 html — body만 잠그면 무효(scrollLock 유틸이 둘 다 처리)
    return () => {
      window.removeEventListener('keydown', onKey);
      unlockScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  // 뒤로가기(브라우저/모바일 back) → 페이지 이탈 대신 "이 모달만" 닫기.
  // 중앙 back-stack 매니저가 중첩/충돌/이중 pop 을 모두 처리한다.
  useBackClose(open && !inline, onClose);

  // 열기/닫기 애니메이션: 닫힐 때 잠깐 더 렌더링하여 시트가 아래로 슬라이드되며 사라지게 한다.
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setRender(true); setClosing(false); return; }
    setClosing(true);
    const t = window.setTimeout(() => setRender(false), 200);
    return () => window.clearTimeout(t);
  }, [open]);

  // 접근성: 모달 내부 포커스 트랩 + 열릴 때 첫 포커스(키보드 내비)
  const contentRef = useRef<HTMLDivElement>(null);
  // 드래그 시트(page·모바일) — 컨텐츠가 맨 위일 때 아래로 끌면 시트가 따라오고, 120px 넘으면 닫힌다(애플 지도 문법)
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [flingOut, setFlingOut] = useState(false); // 드래그 퇴장 중(감속 트랜지션 유지)
  const sheetStart = useRef<number | null>(null);
  // ⚠ `?? 1` 이면 시트에서 드래그가 시작조차 안 된다 — pageScrollRef 는 page 변형에만 붙어 있어
  //   시트에서는 항상 null 이고, 1 <= 0 이 거짓이라 매번 무시됐다(그래서 그립 핸들이 죽어 있었다).
  //   ref 가 없다 = 추적할 스크롤 영역이 없다(핸들을 직접 잡았다) = 맨 위로 간주하는 게 맞다.
  const onSheetStart = (e: React.TouchEvent) => {
    if (window.innerWidth >= 1024) return;
    if ((pageScrollRef.current?.scrollTop ?? 0) <= 0) sheetStart.current = e.touches[0].clientY;
  };
  // 플릭 속도 추적 — 마지막 두 이동 샘플로 px/ms 를 구한다(짧게 튕겨도 닫히는 iOS 감각)
  const velSample = useRef<{ t: number; y: number } | null>(null);
  const velocity = useRef(0);
  const onSheetMove = (e: React.TouchEvent) => {
    if (sheetStart.current == null) return;
    const dy = e.touches[0].clientY - sheetStart.current;
    if ((pageScrollRef.current?.scrollTop ?? 0) > 0) { sheetStart.current = null; setDragY(0); return; }
    const now = e.timeStamp;
    if (velSample.current) {
      const dt = now - velSample.current.t;
      if (dt > 0) velocity.current = (dy - velSample.current.y) / dt;
    }
    velSample.current = { t: now, y: dy };
    // 1:1 추종 — 손가락에 정확히 붙어야 '내가 쥐고 있다'는 감각이 난다(iOS 시트).
    setDragY(dy > 0 ? dy : 0);
  };
  const onSheetEnd = () => {
    const pulled = dragY;
    const v = velocity.current;
    sheetStart.current = null;
    velSample.current = null;
    velocity.current = 0;
    // 거리(120px) 또는 속도(0.6px/ms 플릭) — 짧게 튕겨도 닫힌다
    if (pulled > 120 || (pulled > 24 && v > 0.6)) {
      // 끌던 방향 그대로 감속하며 화면 밖으로(예전엔 transition:none 이라 순간이동으로 사라졌다)
      setFlingOut(true);
      setDragY(window.innerHeight);
      window.setTimeout(onClose, 180);
      return;
    }
    setDragY(0); // 임계 미만 — 스프링(--spring)으로 제자리 복귀
  };
  useEffect(() => {
    if (!open || inline) return;
    const el = contentRef.current;
    if (!el) return;

    // 열기 직전에 포커스가 있던 곳을 기억한다. 닫을 때 여기로 돌려보내지 않으면
    // 포커스가 문서 맨 앞으로 튀어, 방금 누른 버튼으로 못 돌아간다(키보드·스크린리더 사용자는
    // 자기가 어디 있었는지 잃어버린다). 모달의 '되돌리기' 는 시각만이 아니라 포커스에도 필요하다.
    const opener = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(
      el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'),
    ).filter((n) => n.offsetParent !== null);
    const t = window.setTimeout(() => { (focusables()[0] ?? el).focus(); }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', onKey);

    // ⚠ Tab 키만 막는 건 반쪽짜리다. 포커스는 Tab 말고도 새는 길이 많다 —
    //   배경 dim 버튼 클릭, 주소창에서 F6 로 돌아오기, 스크린리더의 가상 커서 이동,
    //   모달 밖 요소가 자기 자신에게 focus() 를 거는 경우 등.
    //   그래서 '탭 순서'가 아니라 '실제로 포커스가 어디에 들어왔는가'를 보고 되잡는다.
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (!target || el.contains(target)) return;
      (focusables()[0] ?? el).focus();
    };
    document.addEventListener('focusin', onFocusIn);

    return () => {
      window.clearTimeout(t);
      el.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      // 아직 화면에 붙어 있는 요소일 때만 되돌린다(그 사이 언마운트됐으면 건드리지 않는다).
      if (opener && document.contains(opener)) {
        // 되돌리는 순간의 focusin 이 위 가드에 걸리지 않도록 리스너 해제 뒤에 실행한다.
        try { opener.focus({ preventScroll: true }); } catch { /* 포커스 불가 요소 무시 */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 인라인 패널(2-pane 우측) — 오버레이/딤/백버튼 없이 콘텐츠만 카드로.
  if (inline) {
    if (!open) return null;
    return (
      <div className="flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden rounded-card border border-border-default bg-surface-mid">
        {title && (
          <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
            <h2 className="text-[17px] font-bold tracking-tight text-ink-primary">{title}</h2>
            <button type="button" onClick={onClose} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-input text-ink-secondary hover:bg-surface-high hover:text-ink-primary">
              <Icon name="close" size={14} />
            </button>
          </header>
        )}
        <div className="flex-1 overflow-y-auto"><div className={['mx-auto w-full', MAX_W[maxWidth]].join(' ')}>{children}</div></div>
      </div>
    );
  }

  if (!render) return null;

  // 전체화면 페이지 변형 — 불투명 배경으로 뒤 페이지가 절대 비치지 않음(스크롤 누수 방지)
  if (variant === 'page') {
    return (
      <div ref={contentRef}
        // ⚠ 여기에 role/aria 가 아예 없었다. 전체화면 변형(포스터 상세·매장 페이지 등)이
        //   스크린리더에게는 그냥 div 였고, 뒤 페이지도 여전히 읽혔다.
        //   sheet/center 변형만 dialog 로 선언돼 있어 '어떤 모달은 접근 가능하고 어떤 건 아닌' 상태였다.
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        // 제목이 없는 전체화면은 이름이 없어 그냥 '대화상자' 로만 읽힌다 — 최소한의 이름을 준다.
        aria-label={title ? undefined : '전체화면 보기'}
        onTouchStart={onSheetStart} onTouchMove={onSheetMove} onTouchEnd={onSheetEnd}
        style={flingOut
          ? { transform: `translateY(${dragY}px)`, transition: 'transform 0.2s var(--ease)' }
          : dragY > 0
            ? { transform: `translateY(${dragY}px)`, transition: 'none' }
            : { transition: 'transform 0.5s var(--spring)' }}
        className={['fixed inset-0 z-[55] bg-surface-base flex flex-col pt-[env(safe-area-inset-top)]', closing ? 'animate-fade-out' : 'animate-fade-in'].join(' ')}>
        {/* 드래그 핸들(모바일) — 시트를 끌어내려 닫기 */}
        <div aria-hidden className="lg:hidden absolute top-1.5 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-ink-primary/25" />
        {title && (
          <header className="shrink-0 flex items-center justify-between px-4 h-header-h border-b border-border-subtle bg-surface-base">
            <h2 id="modal-title" className="text-[17px] font-bold tracking-tight text-ink-primary">{title}</h2>
            <button type="button" onClick={onClose} aria-label="닫기"
              className="w-11 h-11 -mr-2 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors">
              <Icon name="close" size={18} />
            </button>
          </header>
        )}
        <div ref={pageScrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          <div className={['mx-auto w-full', MAX_W[maxWidth]].join(' ')}>{children}</div>
        </div>
      </div>
    );
  }

  return (
    // z-[60]: 전체화면 page 변형(z-[55]) 위에도 항상 뜨도록 — 예: 포스터 상세에서 '대회 후기 쓰기' 글쓰기 모달
    <div className={['fixed inset-0 z-[60] flex', closing ? 'animate-fade-out' : 'animate-fade-in'].join(' ')}
      style={{
        alignItems: variant === 'sheet' ? 'flex-end' : 'center',
        justifyContent: 'center',
      }}
    >
      {/* 배경 dim — dismissOnBackdrop=false면 클릭해도 닫히지 않음(작성 중 실수 방지) */}
      {dismissOnBackdrop ? (
        <button
          type="button"
          // ⚠ 화면 전체를 덮는 이 버튼이 dialog **바깥**에 있어서, 탭 순서상 모달 내용보다 먼저 잡혔다.
          //   키보드 사용자는 모달을 열자마자 '화면만 한 닫기 버튼' 에 착지했고,
          //   스크린리더는 대화상자에 들어가기 전에 "닫기, 버튼" 을 먼저 읽었다.
          //   배경 클릭은 마우스·터치용 편의지 키보드 경로가 아니다 — 키보드에는 ESC 와 헤더 X 가 있다.
          //   그래서 탭 순서·접근성 트리에서 빼고, 포인터 동작만 남긴다.
          tabIndex={-1}
          aria-hidden
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-default"
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      )}
      {/* 본문 */}
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={[
          // card-elev: 전 모달 공용 깊이(수직 광원+상단 헤어라인). box-shadow 는 캐스케이드상
          // shadow-dialog 를 대체하지만, dim(black/80) 위에서 외부 섀도는 사실상 비가시 — 순손실 없음.
          'card-elev relative w-full bg-surface-mid shadow-dialog',
          closing
            ? (variant === 'sheet' ? 'animate-slide-down' : 'animate-fade-out')
            // 시트는 아래에서 올라오고(sheet-up), 가운데 모달은 기존의 짧은 넛지(slide-up).
            // 열림과 닫힘이 같은 문법을 쓰게 맞춘 것 — 예전엔 닫힘만 100% 이동이라 짝이 안 맞았다.
            : (variant === 'sheet' ? 'animate-sheet-up' : 'animate-slide-up'),
          variant === 'sheet'
            ? 'rounded-t-dialog sm:rounded-dialog sm:my-auto sm:max-h-[85vh]'
            : 'rounded-dialog my-auto max-h-[85vh]',
          MAX_W[maxWidth],
          'flex flex-col overflow-hidden',
        ].join(' ')}
        style={{
          // 시트는 상단에 여백을 남겨(상단이 눌려 보이지 않도록) 88vh 로 제한
          maxHeight: variant === 'sheet' ? '88vh' : '85vh',
          // fillHeight: 콘텐츠 양과 무관하게 높이 고정 (탭 전환 시 크기 변동 방지)
          height: fillHeight ? (variant === 'sheet' ? '88vh' : '85vh') : undefined,
          // 손끝 추종 — 끄는 동안엔 트랜지션을 끄고(지연 없이 손가락을 따라옴),
          // 손을 떼면 트랜지션으로 부드럽게 제자리 또는 화면 밖으로. 이 둘을 섞으면 '고무줄'이 된다.
          ...(variant === 'sheet' && flingOut
            ? { transform: `translateY(${dragY}px)`, transition: 'transform 0.2s var(--ease)', animation: 'none' }
            : variant === 'sheet' && dragY > 0
              ? { transform: `translateY(${dragY}px)`, transition: 'none', animation: 'none' }
              : variant === 'sheet'
                ? { transition: 'transform 0.5s var(--spring)' }
                : {}),
        }}
      >
        {/* 그립 핸들 (sheet 전용) — 실제로 끌어서 닫을 수 있다.
            ⚠ 예전엔 드래그 핸들러가 page 변형에만 붙어 있어서, 핸들이 '끌 수 있다'고 말해 놓고
              잡아끌면 아무 반응이 없었다. UI 가 거짓말을 하면 사용자는 앱을 못 믿게 된다.
            영역을 핸들 자체가 아니라 이 래퍼로 잡은 이유: 1px 짜리 막대를 정확히 짚기 어렵다. */}
        {variant === 'sheet' && (
          <div
            className="flex justify-center pt-2 pb-1 sm:hidden touch-none cursor-grab active:cursor-grabbing"
            onTouchStart={onSheetStart}
            onTouchMove={onSheetMove}
            onTouchEnd={onSheetEnd}
          >
            <div className="w-10 h-1 rounded-full bg-border-strong" aria-hidden />
          </div>
        )}

        {/* 헤더 */}
        {title && (
          <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <h2 id="modal-title" className="text-[17px] font-bold tracking-tight text-ink-primary">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              // 44px 터치 표준 — 작아서 빗나가던 닫기 버튼 전역 교정
              className="w-11 h-11 -mr-2 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors"
            >
              <Icon name="close" size={18} />
            </button>
          </header>
        )}

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
