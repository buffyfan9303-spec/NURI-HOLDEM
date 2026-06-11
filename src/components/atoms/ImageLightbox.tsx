// 이미지 라이트박스 — 포스터 풀스크린 확대. 핀치줌(모바일)·더블탭 줌·드래그 팬·휠줌(PC).
// 리렌더 없이 ref로 transform을 직접 조작해 60fps 제스처를 유지한다.
import { useEffect, useRef } from 'react';
import { useBackClose } from '../../lib/backstack';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

const MIN = 1, MAX = 5;

export default function ImageLightbox({ src, alt, onClose }: Props) {
  useBackClose(true, onClose);
  const imgRef = useRef<HTMLImageElement>(null);
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // 배경 스크롤 잠금
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 animate-fade-in"
      role="dialog" aria-modal="true" aria-label={`${alt} 확대 보기`}
      onWheel={onWheel}
    >
      <button
        type="button" onClick={onClose} aria-label="닫기"
        className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 active:opacity-80"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
      <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-2xs text-white/80 backdrop-blur">
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
