import { useEffect, useRef, useState } from 'react';
import { useBackClose } from '../../lib/backstack';

const BOX = 256; // 편집 뷰포트(px, 정사각)
const OUT = 256; // 출력 크기(px)

/**
 * 프로필 사진 크롭/줌 편집기.
 *  - 드래그로 위치 이동, 슬라이더로 확대
 *  - "적용" 시 정사각 256×256 webp Blob을 onApply로 전달
 *  로컬에서 선택한 File만 사용(원격 이미지는 canvas CORS 오염 위험으로 제외).
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
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

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

  const clamp = (x: number, y: number, w = dispW, h = dispH) => ({
    x: Math.min(0, Math.max(BOX - w, x)),
    y: Math.min(0, Math.max(BOX - h, y)),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(clamp(
      drag.current.ox + (e.clientX - drag.current.x),
      drag.current.oy + (e.clientY - drag.current.y),
    ));
  };
  const endDrag = () => { drag.current = null; };

  const onZoom = (z: number) => {
    const cx = BOX / 2, cy = BOX / 2;
    const prevEff = baseScale.current * zoom;
    const nextEff = baseScale.current * z;
    const ratio = nextEff / prevEff;
    const nx = cx - (cx - offset.x) * ratio;
    const ny = cy - (cy - offset.y) * ratio;
    setZoom(z);
    setOffset(clamp(nx, ny, natural.current.w * nextEff, natural.current.h * nextEff));
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
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    canvas.toBlob((b) => { if (b) onApply(b); }, 'image/webp', 0.9);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xs bg-surface-mid rounded-dialog overflow-hidden shadow-dialog">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-ink-primary">사진 편집</h3>
          <p className="text-2xs text-ink-muted mt-0.5">드래그로 위치, 슬라이더로 확대를 조절하세요</p>
        </div>

        <div className="p-4 flex flex-col items-center gap-4">
          <div
            className="relative overflow-hidden rounded-full bg-surface-low touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ width: BOX, height: BOX }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
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

          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => onZoom(Number(e.target.value))}
            className="w-full accent-gold-300"
            aria-label="확대"
          />
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border-subtle">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">취소</button>
          <button type="button" onClick={apply} className="btn-primary flex-1">적용</button>
        </div>
      </div>
    </div>
  );
}
