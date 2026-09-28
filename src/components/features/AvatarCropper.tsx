import { useEffect, useRef, useState } from 'react';
import { useBackClose } from '../../lib/backstack';
import { clampState, cropSource, initialState, pinchStep, zoomAt, MIN_ZOOM, MAX_ZOOM, type CropGeom, type CropState } from '../../lib/avatarCrop';

const BOX = 256;       // 편집 뷰포트(px, 정사각)
const OUT = 320;       // 출력 크기(px) — 레티나 대비 선명도 약간 상향
/** 저장 뒤 실제로 보일 크기 — 헤더·글 작성자(32) · 대시보드 머리(104). 원형 미리보기로 그 크기 그대로 보여 준다. */
const PREVIEWS = [32, 104];

/**
 * 프로필 사진 크롭/줌 편집기.
 *  - 드래그(한 손가락)로 위치 이동
 *  - 핀치(두 손가락 — 벌리면 확대, 함께 끌면 이동) / 마우스 휠 / 슬라이더로 확대(1~5배)
 *  - 아래 원형 미리보기 두 개 = 저장 뒤 헤더·대시보드에 보일 모습
 *  - "적용" 시 정사각 webp Blob 을 onApply 로 전달
 *  좌표 계산은 src/lib/avatarCrop.ts(단위 테스트로 '원 안에 보인 것 = 저장되는 것'을 잠근다).
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
  const [geom, setGeom] = useState<CropGeom | null>(null);
  const [st, setSt] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  // 이벤트 핸들러가 **방금 쓴 값**을 보도록 — 렌더 사이에 이벤트가 여럿 와도(빠른 휠·핀치) 앞선 값을 잃지 않는다.
  const live = useRef<{ g: CropGeom | null; s: CropState }>({ g: null, s: st });
  const put = (s: CropState) => { live.current.s = s; setSt(s); };

  const boxRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ s: CropState; m: { x: number; y: number }; d: number } | null>(null);
  const drag = useRef<{ x: number; y: number; s: CropState } | null>(null);

  // 뒤로가기·ESC → 크롭 편집기만 닫기(escape 가 없으면 ESC 가 부모 '내 정보' Modal 을 대신 닫는다 — MODAL-01)
  useBackClose(true, onCancel, { escape: true });

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const img = new Image();
    img.onload = () => {
      const g = { nw: img.naturalWidth, nh: img.naturalHeight, box: BOX };
      imgRef.current = img;
      const s0 = initialState(g);
      live.current = { g, s: s0 };
      setGeom(g);
      setSt(s0);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const zoomTo = (z: number, fx = BOX / 2, fy = BOX / 2) => { const g = live.current.g; if (g) put(zoomAt(g, live.current.s, z, fx, fy)); };
  const local = (x: number, y: number) => { const r = boxRef.current!.getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; };

  // 휠 줌 — React onWheel 은 passive 라 preventDefault 가 안 되므로 네이티브 비-passive 로 등록.
  //   상태는 live(ref)에서 읽고 쓴다 — 핸들러를 한 번만 붙여도 늘 최신 값으로 계산된다.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !geom) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const s = zoomAt(geom, live.current.s, live.current.s.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
      live.current.s = s;
      setSt(s);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [geom]);

  const twoFingers = () => {
    const [a, b] = [...pointers.current.values()];
    return { m: local((a.x + b.x) / 2, (a.y + b.y) / 2), d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  };
  const restart = () => {
    const n = pointers.current.size;
    if (n >= 2) { const t = twoFingers(); pinch.current = { s: live.current.s, m: t.m, d: t.d }; drag.current = null; }
    else if (n === 1) { const [p] = [...pointers.current.values()]; drag.current = { x: p.x, y: p.y, s: live.current.s }; pinch.current = null; }
    else { drag.current = null; pinch.current = null; }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    restart();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = live.current.g;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const t = twoFingers();
      put(pinchStep(g, pinch.current.s, pinch.current.m, pinch.current.d, t.m, t.d));
    } else if (drag.current) {
      const d = drag.current;
      put(clampState(g, { ...d.s, x: d.s.x + (e.clientX - d.x), y: d.s.y + (e.clientY - d.y) }));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    restart(); // 남은 손가락 기준으로 다시 시작 — 두 손가락→한 손가락 전환에서 튀지 않게
  };

  const apply = () => {
    const img = imgRef.current;
    const g = live.current.g;
    if (!img || !g) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = cropSource(g, live.current.s);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, c.sx, c.sy, c.size, c.size, 0, 0, OUT, OUT);
    canvas.toBlob((b) => { if (b) onApply(b); }, 'image/webp', 0.9);
  };

  /** 틀(BOX) 안의 그림을 크기 k 로 줄여 그린다 — 편집 틀과 미리보기가 같은 식이라 어긋날 수 없다. */
  const shot = (k: number) => geom && src && (
    <img src={src} alt="" draggable={false}
      style={{ position: 'absolute', left: 0, top: 0, width: geom.nw * (BOX / Math.min(geom.nw, geom.nh)) * st.zoom * k, height: geom.nh * (BOX / Math.min(geom.nw, geom.nh)) * st.zoom * k, transform: `translate(${st.x * k}px, ${st.y * k}px)`, maxWidth: 'none' }} />
  );

  return (
    // aria-labelledby: 이름 없는 dialog 는 '대화상자' 로만 읽힌다(MODAL-03). 초기 포커스는 아래 '적용' autoFocus.
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="avatar-cropper-title">
      <div className="w-full max-w-xs bg-surface-mid rounded-dialog overflow-hidden shadow-dialog">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h3 id="avatar-cropper-title" className="text-sm font-semibold text-ink-primary">사진 편집</h3>
          <p className="text-2xs text-ink-muted mt-0.5">드래그로 위치, 두 손가락(핀치)·휠·슬라이더로 확대를 조절하세요</p>
        </div>

        <div className="p-4 flex flex-col items-center gap-4">
          <div
            ref={boxRef}
            data-testid="avatar-crop-box"
            className="relative overflow-hidden rounded-full bg-surface-low touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ width: BOX, height: BOX }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onDoubleClick={(e) => {
              const p = local(e.clientX, e.clientY);
              zoomTo(MIN_ZOOM, p.x, p.y); // 더블클릭 → 1배(원본 채움)로 리셋
            }}
          >
            {shot(1)}
            <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/40" />
          </div>

          <div className="flex w-full items-center gap-2">
            <button type="button" aria-label="축소" onClick={() => zoomTo(live.current.s.zoom - 0.3)}
              className="w-7 h-7 shrink-0 rounded-input bg-surface-high text-ink-secondary hover:text-ink-primary text-base leading-none">−</button>
            <input
              type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={st.zoom}
              onChange={(e) => zoomTo(Number(e.target.value))}
              className="flex-1 accent-accent-300" aria-label="확대"
            />
            <button type="button" aria-label="확대" onClick={() => zoomTo(live.current.s.zoom + 0.3)}
              className="w-7 h-7 shrink-0 rounded-input bg-surface-high text-ink-secondary hover:text-ink-primary text-base leading-none">+</button>
          </div>

          {/* 원형 미리보기 — 저장 뒤 헤더·글 작성자(32px)와 대시보드 머리(104px)에 보일 모습 그대로 */}
          <div className="flex items-end justify-center gap-4" aria-hidden>
            {PREVIEWS.map((d) => (
              <div key={d} data-testid={`avatar-crop-preview-${d}`} className="relative shrink-0 overflow-hidden rounded-full bg-surface-low" style={{ width: d, height: d }}>
                {shot(d / BOX)}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border-subtle">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">취소</button>
          {/* autoFocus: 열리자마자 포커스가 안으로 — 안 옮기면 뒤쪽 프로필 폼 필드에 남아 Tab 이 배경을 돈다 */}
          <button type="button" onClick={apply} autoFocus disabled={!geom} className="btn-primary flex-1">적용</button>
        </div>
      </div>
    </div>
  );
}
