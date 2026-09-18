// 이미지 라이트박스 — 포스터 풀스크린 확대. 핀치줌(모바일)·더블탭 줌·드래그 팬·휠줌(PC).
// 리렌더 없이 ref로 transform을 직접 조작해 60fps 제스처를 유지한다.
import { useEffect, useRef, useState } from 'react';
import { useBackClose } from '../../lib/backstack';
import { lockScroll, unlockScroll } from '../../lib/scrollLock';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

const MIN = 1, MAX = 5;

export default function ImageLightbox({ src, alt, onClose }: Props) {
  // [C] 닫는 모션 — 이 컴포넌트는 open prop 없이 부모가 그냥 마운트/언마운트한다(Modal 과 다른 문법).
  //   그래서 onClose 를 바로 부르면 즉시 언마운트되어 fade-out 이 0 프레임이었다. Modal.tsx 의
  //   'render/closing + 지연 unmount' 를 그대로 이식하는 대신, 여기서는 언마운트를 부모가 쥐고 있으므로
  //   **먼저 fade-out 을 켜고, CSS 애니 길이(0.18s)만큼 뒤에 진짜 onClose 를 불러 부모가 그때 언마운트**하게 한다.
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => { if (closeTimer.current != null) window.clearTimeout(closeTimer.current); }, []);
  const startClose = () => {
    if (closing) return; // 중복 트리거(빠른 연타·ESC+클릭) 방지
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 180);
  };
  // 뒤로가기·ESC → 라이트박스만 닫기. ESC 를 여기서 직접 들으면 아래 포스터 상세까지 같이 닫힌다(MODAL-01).
  useBackClose(true, startClose, { escape: true });
  const imgRef = useRef<HTMLImageElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const g = useRef({
    scale: 1, tx: 0, ty: 0,
    pointers: new Map<number, { x: number; y: number }>(),
    lastDist: 0, lastMid: { x: 0, y: 0 }, lastTap: 0, moved: false,
  });

  const apply = () => {
    const s = g.current;
    if (imgRef.current) imgRef.current.style.transform = `translate(${s.tx}px, ${s.ty}px) scale(${s.scale})`;
  };
  const reset = () => { const s = g.current; s.scale = 1; s.tx = 0; s.ty = 0; apply(); };
  const zoomAt = (cx: number, cy: number, nextScale: number) => {
    // 화면 좌표(cx,cy)를 고정점으로 스케일 — 확대 중심이 손가락/커서를 따라간다
    const s = g.current;
    const k = Math.min(MAX, Math.max(MIN, nextScale));
    const cxr = cx - window.innerWidth / 2, cyr = cy - window.innerHeight / 2;
    s.tx = cxr - (k / s.scale) * (cxr - s.tx);
    s.ty = cyr - (k / s.scale) * (cyr - s.ty);
    s.scale = k;
    if (s.scale <= 1.02) { s.scale = 1; s.tx = 0; s.ty = 0; }
    apply();
  };

  useEffect(() => {
    // 배경 스크롤 잠금 — 뷰포트 스크롤러는 html(공용 유틸이 ref-count로 중첩까지 처리)
    lockScroll();
    // 포커스 계약(Modal.tsx 와 동일): 열릴 때 안으로, 닫힐 때 연 버튼으로. 없으면 키보드 포커스가
    // z-100 오버레이 **아래** '포스터 확대 보기' 버튼에 남아 Tab 이 가려진 상세 페이지를 순회했다(MODAL-02).
    // 포커스 가능 요소가 닫기 하나뿐이라 트랩은 focusin 되잡기 한 줄이면 충분하다.
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onFocusIn = (e: FocusEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeRef.current?.focus();
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      unlockScroll();
      // 리스너 해제 뒤에 되돌린다 — 되돌리는 focusin 이 위 가드에 걸리지 않게.
      if (opener && document.contains(opener)) {
        try { opener.focus({ preventScroll: true }); } catch { /* 포커스 불가 요소 무시 */ }
      }
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const s = g.current;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    s.moved = false;
    if (s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()];
      s.lastDist = Math.hypot(a.x - b.x, a.y - b.y);
      s.lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s.pointers.has(e.pointerId)) return;
    const before = s.pointers.get(e.pointerId)!;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.abs(e.clientX - before.x) + Math.abs(e.clientY - before.y) > 3) s.moved = true;

    if (s.pointers.size === 2) {
      // 핀치 — 두 손가락 거리 비율로 스케일, 중점 이동은 팬으로
      const [a, b] = [...s.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (s.lastDist > 0) zoomAt(mid.x, mid.y, s.scale * (dist / s.lastDist));
      s.tx += mid.x - s.lastMid.x; s.ty += mid.y - s.lastMid.y;
      s.lastDist = dist; s.lastMid = mid;
      apply();
    } else if (s.pointers.size === 1 && s.scale > 1) {
      // 확대 상태 팬
      s.tx += e.clientX - before.x;
      s.ty += e.clientY - before.y;
      apply();
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = g.current;
    s.pointers.delete(e.pointerId);
    s.lastDist = 0;
    if (s.pointers.size === 0 && !s.moved) {
      const now = Date.now();
      if (now - s.lastTap < 320) {
        // 더블탭 — 2.5배 ↔ 원본 토글
        if (s.scale > 1) reset(); else zoomAt(e.clientX, e.clientY, 2.5);
        s.lastTap = 0;
      } else {
        s.lastTap = now;
      }
    }
    if (s.scale <= 1.02 && s.pointers.size === 0) reset();
  };
  const onWheel = (e: React.WheelEvent) => {
    zoomAt(e.clientX, e.clientY, g.current.scale * (e.deltaY < 0 ? 1.18 : 0.85));
  };

  return (
    <div
      ref={rootRef}
      // data-scroll-lock: 스크롤 잠금 소유자 표식(scrollLock.ts 의 sweep 이 미아 잠금을 골라낸다)
      data-scroll-lock
      // 🔴 2026-09-19 (추론으로 넣은 방어 — 이 파일에서 실제로 재현하지는 않았다) — 퇴장 애니 동안 이 풀스크린
      // 오버레이가 뒤 화면 클릭을 계속 가로챌 수 있다. closing 이 되는 즉시(시각적 퇴장은 느려도)
      // pointer-events 를 꺼서 입력 차단은 바로 풀리게 한다.
      className={['fixed inset-0 z-[100] flex items-center justify-center bg-black/95',
        closing ? 'pointer-events-none animate-fade-out' : 'animate-fade-in'].join(' ')}
      role="dialog" aria-modal="true" aria-label={`${alt} 확대 보기`}
      onWheel={onWheel}
      // 배경 탭 닫기 — 이미지 제스처(포인터 캡처)와 충돌하지 않게 배경 자신을 탭했을 때만
      onClick={(e) => { if (e.target === e.currentTarget) startClose(); }}
      // 포커스 가능 요소가 닫기 하나뿐 — Tab/Shift+Tab 은 제자리(브라우저 UI 로 빠져나가면 focusin 이 안 와 되잡지 못한다)
      onKeyDown={(e) => { if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); } }}
    >
      <button
        ref={closeRef}
        type="button" onClick={startClose} aria-label="닫기"
        /* top-[calc(...)]: 노치·상태바 아래로 내린다. 사진을 열었을 때 **닫을 방법**이
           상태바에 가리면 빠져나갈 길이 없다(전체화면이라 뒤 크롬도 안 보인다).
           h-11 w-11: 44px 터치 표준. `hit` 토큰은 position:relative 라 이 absolute 배치를 깨뜨려 실제 크기를 키운다. */
        className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 active:opacity-80"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
      {/* 터치 전용 조작 힌트 — PC(휠줌)에서는 불필요해 숨김 */}
      <p className="pointer-events-none absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-2xs text-white/80 backdrop-blur lg:hidden">
        두 손가락으로 확대 · 두 번 탭하면 줌
      </p>
      <img
        ref={imgRef}
        src={src} alt={alt} draggable={false}
        className="max-h-full max-w-full select-none object-contain will-change-transform"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}
