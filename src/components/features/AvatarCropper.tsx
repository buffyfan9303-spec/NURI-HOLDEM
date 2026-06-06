import { useEffect, useRef, useState } from 'react';
import { useBackClose } from '../../lib/backstack';

const BOX = 256;       // 편집 뷰포트(px, 정사각)
const OUT = 320;       // 출력 크기(px) — 레티나 대비 선명도 약간 상향
const MIN_ZOOM = 1;    // 1 = 원 안을 꽉 채움(빈 공간 없음)
const MAX_ZOOM = 5;    // 최대 5배 확대(자유로운 확대)

/**
 * 프로필 사진 크롭/줌 편집기.
 *  - 드래그(한 손가락)로 위치 이동
 *  - 핀치(두 손가락) / 마우스 휠 / 슬라이더로 확대(1~5배)
 *  - "적용" 시 정사각 webp Blob 을 onApply 로 전달
 *  로컬에서 선택한 File 만 사용(원격 이미지는 canvas CORS 오염 위험으로 제외).
 */
export default function AvatarCropper({
  file, onCancel, onApply,
}: {
  file: File;
  onCancel: () => void;
  onApply: (blob: Blob) => void;
}) {
  const [src, setSrc] = useState('');
  const imgRef = useRef<HTMLImageElement | null>(null);
  const natural = useRef({ w: 0, h: 0 });
  const baseScale = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  // 멀티 포인터(핀치) 추적 + 단일 드래그
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // 이벤트 핸들러(특히 비-passive 휠)가 최신 상태를 보도록 ref 로 미러링
  const stateRef = useRef({ offset, zoom });
  stateRef.current = { offset, zoom };

  // 뒤로가기 → 크롭 편집기 닫기
  useBackClose(true, onCancel);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const img = new Image();
    img.onload = () => {
      natural.current = { w: img.naturalWidth, h: img.naturalHeight };
      baseScale.current = BOX / Math.min(img.naturalWidth, img.naturalHeight);
      imgRef.current = img;
      const eff = baseScale.current;
      setZoom(1);
      setOffset({ x: (BOX - img.naturalWidth * eff) / 2, y: (BOX - img.naturalHeight * eff) / 2 });
      setReady(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const eff = baseScale.current * zoom;
  const dispW = natural.current.w * eff;
  const dispH = natural.current.h * eff;

  const clampOff = (x: number, y: number, w: number, h: number) => ({
    x: Math.min(0, Math.max(BOX - w, x)),
    y: Math.min(0, Math.max(BOX - h, y)),
  });

  // 초점(focal, box 좌표) 기준 확대/축소 — 손가락/커서 위치를 중심으로 자연스럽게
  const zoomAround = (rawZoom: number, fx: number, fy: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rawZoom));
    const cur = stateRef.current;
    const prevEff = baseScale.current * cur.zoom;
    const nextEff = baseScale.current * next;
    const ratio = nextEff / prevEff;
    const nx = fx - (fx - cur.offset.x) * ratio;
    const ny = fy - (fy - cur.offset.y) * ratio;
    setZoom(next);
    setOffset(clampOff(nx, ny, natural.current.w * nextEff, natural.current.h * nextEff));
  };
  const zoomAroundRef = useRef(zoomAround);
  zoomAroundRef.current = zoomAround;

  // 휠 줌 — React onWheel 은 passive 라 preventDefault 가 안 되므로 네이티브 비-passive 로 등록
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !ready) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAroundRef.current(stateRef.current.zoom * factor, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ready]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: stateRef.current.zoom };
      dragRef.current = null;
    } else {
      const o = stateRef.current.offset;
      dragRef.current = { x: e.clientX, y: e.clientY, ox: o.x, oy: o.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const r = (e.currentTarget as Element).getBoundingClientRect();
      zoomAround(pinch.current.zoom * (dist / pinch.current.dist), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    } else if (dragRef.current) {
      const d = dragRef.current;
      const z = stateRef.current.zoom;
      const e2 = baseScale.current * z;
      setOffset(clampOff(d.ox + (e.clientX - d.x), d.oy + (e.clientY - d.y), natural.current.w * e2, natural.current.h * e2));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      const o = stateRef.current.offset;
      dragRef.current = { x: p.x, y: p.y, ox: o.x, oy: o.y };
    } else if (pointers.current.size === 0) {
      dragRef.current = null;
    }
  };

  const apply = () => {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const e2 = baseScale.current * zoom;
    const sx = -offset.x / e2;
    const sy = -offset.y / e2;
    const sSize = BOX / e2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    canvas.toBlob((b) => { if (b) onApply(b); }, 'image/webp', 0.9);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xs bg-surface-mid rounded-dialog overflow-hidden shadow-dialog">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-ink-primary">사진 편집</h3>
          <p className="text-2xs text-ink-muted mt-0.5">드래그로 위치, 두 손가락(핀치)·휠·슬라이더로 확대를 조절하세요</p>
        </div>

        <div className="p-4 flex flex-col items-center gap-4">
          <div
            ref={boxRef}
            className="relative overflow-hidden rounded-full bg-surface-low touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ width: BOX, height: BOX }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onDoubleClick={(e) => {
              const r = (e.currentTarget as Element).getBoundingClientRect();
              // 더블클릭 → 1배(원본 채움)로 리셋
              zoomAround(MIN_ZOOM, e.clientX - r.left, e.clientY - r.top);
            }}
          >
            {ready && src && (
              <img
                src={src}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: dispW,
                  height: dispH,
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                  maxWidth: 'none',
                }}
              />
            )}
            <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/40" />
          </div>

          <div className="flex w-full items-center gap-2">
            <button type="button" aria-label="축소" onClick={() => zoomAround(zoom - 0.3, BOX / 2, BOX / 2)}
              className="w-7 h-7 shrink-0 rounded-input bg-surface-high text-ink-secondary hover:text-ink-primary text-base leading-none">−</button>
            <input
              type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={zoom}
              onChange={(e) => zoomAround(Number(e.target.value), BOX / 2, BOX / 2)}
              className="flex-1 accent-gold-300" aria-label="확대"
            />
            <button type="button" aria-label="확대" onClick={() => zoomAround(zoom + 0.3, BOX / 2, BOX / 2)}
              className="w-7 h-7 shrink-0 rounded-input bg-surface-high text-ink-secondary hover:text-ink-primary text-base leading-none">+</button>
          </div>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border-subtle">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">취소</button>
          <button type="button" onClick={apply} className="btn-primary flex-1">적용</button>
        </div>
      </div>
    </div>
  );
}
