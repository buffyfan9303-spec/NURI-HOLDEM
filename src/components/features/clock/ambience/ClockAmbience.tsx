// src/components/features/clock/ambience/ClockAmbience.tsx — 클락 모션 배경 층: 실사 영상 루프 + 효과 캔버스.
//
// 쓰는 법(K단계 배선 예 — 이 파일은 아직 어디서도 import 되지 않는다):
//   const ClockAmbience = lazy(() => import('./ambience/ClockAmbience'));
//   const t = ambienceThemeById(presetId);
//   <div data-amb-root className="relative …" style={{ background: 'var(--clk-bg)' }}>
//     {t && <Suspense fallback={null}><ClockAmbience motion={t.motion} video={ambienceVideoSrc(t)} /></Suspense>}
//     …보드…   ← 층은 absolute inset-0 · pointer-events none. 보드는 z 가 이 층보다 위여야 한다.
//   · lazy 로만 받는다 — 첫 화면 번들 0 바이트. 영상 파일도 이 컴포넌트가 마운트될 때(=그 테마를 골랐을 때)만 받는다.
//   · 글자 금지 영역: [data-amb-root] 안에서 avoidSelector 에 걸리는 요소의 사각형. 그 안에서는 입자 불투명도 0(엔진) +
//     캔버스를 destination-out 으로 한 번 더 지운다(큰 도형·흐린 앞 레이어까지 픽셀 단위로 0).
//     ⚠ ClockStage 의 하단 지표·머리말 우측처럼 testid 가 없는 글자 묶음에는 K단계에서 data-amb-avoid 를 붙여야 한다.
//
// 지키는 것:
//   · 30fps 상한 · devicePixelRatio 상한 1 · 입자 수 상한(엔진) · 느리면 입자 반감(최대 두 번)
//   · document.hidden → rAF·영상 정지, 돌아오면 dt 를 잘라 순간이동 없음
//   · prefers-reduced-motion → 영상은 재생하지 않고 poster 정지 화면, 캔버스는 정지 프레임 한 장
//   · 리사이즈(ResizeObserver) · 언마운트 시 rAF·관찰자·리스너·영상 디코더 전부 해제
//   · 영상 로드 실패 → 영상 층만 숨긴다(뒤의 그라데이션 bg 가 그대로 보인다)

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import {
  AMBIENCE_AVOID_DEFAULT, AMBIENCE_DPR_CAP, AMBIENCE_FPS, AMBIENCE_FRAME_BUDGET_MS,
  type Zone, ambienceUnit, createAmbienceSim, mulberry32,
} from './ambienceEngine';
import { AMBIENCE_EFFECTS, type AmbienceMotionId } from './ambienceEffects';

export interface AmbienceFrameInfo { frame: number; n: number; quality: number; costMs: number; zones: number }

export interface ClockAmbienceProps {
  motion?: AmbienceMotionId | null;
  video?: { mp4: string; poster?: string } | null;
  /** 영상 위 어둡게 하는 막(0~0.7). 중앙(타이머·블라인드)은 이보다 0.18 더 어둡다. 테마마다 실측으로 정한다(AmbienceTheme.dim). */
  dim?: number;
  avoidSelector?: string;
  /** 같은 장면을 다시 그리고 싶을 때(미리보기·측정). 없으면 매번 다르다. */
  seed?: number;
  /** 측정용 — 그린 프레임마다 불린다. 운영 화면에서는 넘기지 않는다. */
  onFrame?: (info: AmbienceFrameInfo) => void;
}

const FILL: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' };

export default function ClockAmbience({ motion, video, dim = 0.3, avoidSelector = AMBIENCE_AVOID_DEFAULT, seed, onFrame }: ClockAmbienceProps) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const vRef = useRef<HTMLVideoElement>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const mp4 = video?.mp4;

  // ── 영상 층 ──
  useEffect(() => {
    const v = vRef.current;
    if (!v || !mp4) return;
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const sync = () => {
      if (document.hidden || mq?.matches) v.pause();
      else v.play().catch(() => { /* 자동재생 거절 — poster 정지 화면으로 남는다 */ });
    };
    const onErr = () => setFailedSrc(mp4);
    v.addEventListener('error', onErr);
    document.addEventListener('visibilitychange', sync);
    mq?.addEventListener?.('change', sync);
    sync();
    return () => {
      v.removeEventListener('error', onErr);
      document.removeEventListener('visibilitychange', sync);
      mq?.removeEventListener?.('change', sync);
      v.pause();
      v.removeAttribute('src'); // 디코더·버퍼 해제(TV 메모리)
      v.load();
    };
  }, [mp4]);

  // ── 효과 캔버스 ──
  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    const fx = motion ? AMBIENCE_EFFECTS[motion] : null;
    if (!cv || !ctx || !fx) return;

    const sim = createAmbienceSim(fx, mulberry32(seed ?? (Date.now() & 0x7fffffff)));
    const sprites = fx.sprites?.() ?? {};
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const frameMs = 1000 / AMBIENCE_FPS;
    let dpr = 1, raf = 0, last = 0, next = 0, frame = 0, avg = 0;
    let mask: HTMLCanvasElement | null = null, zoneKey = '';

    // 글자 금지 영역 — 보드 레이아웃(시상 장 넘김·글자 길이)이 바뀌므로 2초마다 다시 잰다(요소 열 개 남짓 getBoundingClientRect).
    const measureZones = () => {
      const root = cv.closest('[data-amb-root]') ?? cv.parentElement?.parentElement;
      if (!root) return;
      const cr = cv.getBoundingClientRect();
      const pad = 8 * ambienceUnit(cr.width, cr.height);
      const zones: Zone[] = [];
      root.querySelectorAll(avoidSelector).forEach((el) => {
        if (el.contains(cv)) return;
        const r = el.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0) || r.width * r.height > cr.width * cr.height * 0.6) return; // 보드 전체를 감싸는 요소는 빼고
        zones.push({ x0: r.left - cr.left - pad, y0: r.top - cr.top - pad, x1: r.right - cr.left + pad, y1: r.bottom - cr.top + pad });
      });
      const key = zones.map((z) => `${z.x0 | 0},${z.y0 | 0},${z.x1 | 0},${z.y1 | 0}`).join(';');
      if (key === zoneKey) return;
      zoneKey = key;
      sim.setZones(zones);
      mask = buildMask(zones);
    };

    // 영역을 지우는 마스크 — 가장자리 5겹 부드러운 띠 + 영역 자체는 불투명 1(=완전히 지움).
    const buildMask = (zones: Zone[]) => {
      if (!zones.length || !cv.width) return null;
      const m = document.createElement('canvas');
      m.width = cv.width; m.height = cv.height;
      const g = m.getContext('2d');
      if (!g) return null;
      const F = 28 * sim.env.u * dpr;
      g.fillStyle = '#000';
      for (const z of zones) {
        const x0 = z.x0 * dpr, y0 = z.y0 * dpr, x1 = z.x1 * dpr, y1 = z.y1 * dpr;
        g.globalAlpha = 0.4;
        for (let k = 5; k >= 1; k--) { const d = (F * k) / 5; g.fillRect(x0 - d, y0 - d, x1 - x0 + 2 * d, y1 - y0 + 2 * d); }
        g.globalAlpha = 1;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      return m;
    };

    const render = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, cv.width, cv.height);
      fx.draw(ctx, sim.particles, sim.env, sprites, dpr);
      if (mask) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      }
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now < next) return;
      next = Math.max(next + frameMs, now - frameMs); // 30fps 격자(밀리면 한 칸만 따라잡는다)
      const dt = Math.min(0.1, (now - last) / 1000); // 탭 복귀·일시 멈춤 뒤 몇 초가 한 번에 흐르지 않게
      last = now;
      const t0 = performance.now();
      sim.step(dt);
      render();
      const cost = performance.now() - t0;
      frame++;
      avg = frame === 1 ? cost : avg * 0.95 + cost * 0.05;
      if (frame > 60 && avg > AMBIENCE_FRAME_BUDGET_MS && sim.quality > 0.25) { // 느린 기기 — 입자 반감
        sim.setQuality(sim.quality / 2);
        frame = 1; avg = 0;
      }
      onFrameRef.current?.({ frame, n: sim.particles.length, quality: sim.quality, costMs: cost, zones: sim.env.zones.length });
    };

    const start = () => {
      if (raf || document.hidden || mq?.matches) return;
      last = performance.now(); next = last;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

    const resize = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!(w > 0 && h > 0)) return;
      dpr = Math.min(window.devicePixelRatio || 1, AMBIENCE_DPR_CAP);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      sim.resize(w, h);
      zoneKey = '';
      measureZones();
      if (!raf) render(); // 멈춘 상태(reduced-motion·숨김)에서도 새 크기의 정지 프레임은 그린다
    };

    const onVis = () => (document.hidden ? stop() : start());
    const onMotionPref = () => { if (mq?.matches) { stop(); render(); } else start(); };

    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    ro?.observe(cv);
    const zoneTimer = window.setInterval(() => { if (raf) measureZones(); }, 2000);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    mq?.addEventListener?.('change', onMotionPref);
    resize();
    start();

    return () => {
      stop();
      ro?.disconnect();
      window.clearInterval(zoneTimer);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      mq?.removeEventListener?.('change', onMotionPref);
      mask = null;
    };
  }, [motion, seed, avoidSelector]);

  return (
    <div aria-hidden data-testid="clk-ambience" data-motion={motion ?? ''} style={{ ...FILL, pointerEvents: 'none', overflow: 'hidden' }}>
      {mp4 && failedSrc !== mp4 && (
        <video ref={vRef} src={mp4} poster={video?.poster} muted loop playsInline preload="metadata" style={{ ...FILL, objectFit: 'cover' }} />
      )}
      {mp4 && failedSrc !== mp4 && (
        // 가독 막 — 정적 그라데이션 한 장(페인트 1회). 영상은 인코딩 때 이미 어둡게·흐리게 구웠고, 이 막이 테마별 차이를 맞춘다.
        <div style={{ ...FILL, background: `radial-gradient(ellipse 58% 52% at 50% 47%, rgba(0,0,0,${Math.min(0.85, dim + 0.18)}) 0%, rgba(0,0,0,${dim}) 72%), rgba(0,0,0,${dim})` }} />
      )}
      {motion && <canvas ref={cvRef} style={FILL} />}
    </div>
  );
}
