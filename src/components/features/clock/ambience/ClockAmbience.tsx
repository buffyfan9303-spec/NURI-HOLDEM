// src/components/features/clock/ambience/ClockAmbience.tsx — 클락 모션 배경 층: 코드로 그린 장면(scene) 또는 실사 영상 루프 + 효과 캔버스.
//
// 배선(2026-09-30): ClockDisplay(TV)·TournamentClock(운영자 스테이지)·ClockThemePanel(썸네일)이 ClockAmbienceSlot → (lazy)
//   ClockAmbienceLayer → 이 컴포넌트로 온다. 테마 id 는 clockThemeVars 의 --clk-amb(clockAmbienceOf).
//   · 한 프레임 그리기는 ambienceRenderer 한 곳(미리보기 녹화기도 같은 함수를 쓴다).
//   · 글자 금지 영역: [data-amb-root] 안에서 avoidSelector 에 걸리는 요소의 사각형. 입자는 그 안에서 0(엔진 + destination-out),
//     장면은 그 뒤를 흐린 유리·그늘(shade 층)로 눌러 글자 대비를 지킨다. ClockStage 의 블린드 묶음·하단 지표 줄에 data-amb-avoid 가 있다.
//
// 지키는 것:
//   · 30fps 상한 · 해상도 상한(영상 효과 1 · 장면 2 = 4K 선명) · 입자 수 상한(엔진) · 느리면 입자 반감(최대 두 번)
//   · document.hidden → rAF·영상 정지, 돌아오면 dt 를 잘라 순간이동 없음
//   · prefers-reduced-motion·still → 영상은 재생하지 않고 poster 정지 화면, 캔버스는 정지 프레임 한 장
//   · 리사이즈(ResizeObserver) · 언마운트 시 rAF·관찰자·리스너·영상 디코더 전부 해제
//   · 영상 로드 실패 → 영상 층만 숨긴다(뒤의 그라데이션 bg 가 그대로 보인다)

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { AMBIENCE_AVOID_DEFAULT, AMBIENCE_DPR_CAP, AMBIENCE_FPS, AMBIENCE_FRAME_BUDGET_MS } from './ambienceEngine';
import { type AmbienceScene, SCENE_DPR_CAP, createAmbienceRenderer, readZones } from './ambienceRenderer';
import { AMBIENCE_EFFECTS, type AmbienceMotionId } from './ambienceEffects';

export interface AmbienceFrameInfo { frame: number; n: number; quality: number; costMs: number; zones: number }

export interface ClockAmbienceProps {
  motion?: AmbienceMotionId | null;
  /** 코드로 그린 일러스트 장면(scenes/scenes.ts) — 주면 motion·video 대신 이것을 그린다(1080p·4K 모두 화면 해상도로). */
  scene?: AmbienceScene | null;
  video?: { mp4: string; poster?: string } | null;
  /** 영상 위 어둡게 하는 막(0~0.7). 중앙(타이머·블라인드)은 이보다 0.18 더 어둡다. 테마마다 실측으로 정한다(AmbienceTheme.dim). */
  dim?: number;
  avoidSelector?: string;
  /** 같은 장면을 다시 그리고 싶을 때(미리보기·측정). 없으면 매번 다르다. */
  seed?: number;
  /** 정지 한 장(테마 고르기 썸네일) — 애니메이션·영상 디코드 없이 한 프레임만 그린다. */
  still?: boolean;
  /** 측정용 — 그린 프레임마다 불린다. 운영 화면에서는 넘기지 않는다. */
  onFrame?: (info: AmbienceFrameInfo) => void;
}

const FILL: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' };

// 정지 썸네일은 한 장씩, 브라우저가 쉴 때 그린다 — 테마 패널이 15장을 한 프레임에 그려 클락 탭을 열 때
// 긴 프레임 중앙값 817ms 였다(PR #58 검토 2026-09-30, base 69ms). 큰 미리보기·TV(움직이는 장면)는 줄을 서지 않는다.
const stillQueue: (() => void)[] = [];
let stillPumping = false;
const whenIdle = (f: () => void) => { if (typeof requestIdleCallback === 'function') requestIdleCallback(f, { timeout: 300 }); else setTimeout(f, 16); };
function pumpStill() {
  if (stillPumping) return;
  stillPumping = true;
  whenIdle(() => {
    stillPumping = false;
    stillQueue.shift()?.();
    if (stillQueue.length) pumpStill();
  });
}
/** 줄에 넣고, 빼는 함수를 돌려준다(언마운트·다시 줄 서기). */
function enqueueStill(job: () => void): () => void {
  stillQueue.push(job);
  pumpStill();
  return () => { const i = stillQueue.indexOf(job); if (i >= 0) stillQueue.splice(i, 1); };
}

export default function ClockAmbience({ motion, scene, video, dim = 0.3, avoidSelector = AMBIENCE_AVOID_DEFAULT, seed, still = false, onFrame }: ClockAmbienceProps) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const midRef = useRef<HTMLCanvasElement>(null);
  const shadeRef = useRef<HTMLCanvasElement>(null);
  const vRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
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

  // ── 캔버스 층(장면 bg·mid·shade + 입자 fx) — 한 프레임 그리기는 ambienceRenderer 한 곳 ──
  useEffect(() => {
    const cv = cvRef.current;
    const fx = scene ? scene.fx ?? null : motion ? AMBIENCE_EFFECTS[motion] : null;
    // 첫 그림이 나오면 층을 서서히 보인다 — 그 전에는 루트의 CSS 대체 바탕(--clk-bg)이 보이고, 장면이 0.3초 뒤 툭 바뀌지 않게 겹쳐 넘긴다.
    //   ⚠ 마운트한 그 작업 안에서 1 로 바꾸면 브라우저가 0 인 상태를 한 번도 계산하지 않아 전환 없이 바로 1 이 된다(실측: 한 프레임에 툭).
    //   그래서 0 을 먼저 계산시키고(getComputedStyle 읽기) 1 로 바꾼다.
    const reveal = () => { const el = boxRef.current; if (!el || el.style.opacity === '1') return; void getComputedStyle(el).opacity; el.style.opacity = '1'; };
    if (!cv || (!fx && !scene)) { reveal(); return; }

    const r = createAmbienceRenderer(
      { fx: cv, bg: bgRef.current, mid: midRef.current, shade: shadeRef.current },
      fx, scene ?? null, seed ?? (Date.now() & 0x7fffffff), scene ? SCENE_DPR_CAP : AMBIENCE_DPR_CAP,
    );
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const frameMs = 1000 / AMBIENCE_FPS;
    let raf = 0, last = 0, next = 0, frame = 0, avg = 0;

    // 글자 금지 영역 — 보드 레이아웃(시상 장 넘김·글자 길이)이 바뀌므로 2초마다 다시 잰다(요소 열 개 남짓 getBoundingClientRect).
    const measureZones = () => {
      const root = cv.closest('[data-amb-root]') ?? cv.parentElement?.parentElement;
      if (root) r.setZones(readZones(root, cv, avoidSelector));
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now < next) return;
      next = Math.max(next + frameMs, now - frameMs); // 30fps 격자(밀리면 한 칸만 따라잡는다)
      const dt = Math.min(0.1, (now - last) / 1000); // 탭 복귀·일시 멈춤 뒤 몇 초가 한 번에 흐르지 않게
      last = now;
      const t0 = performance.now();
      r.step(dt);
      r.render();
      const cost = performance.now() - t0;
      frame++;
      avg = frame === 1 ? cost : avg * 0.95 + cost * 0.05;
      if (frame > 60 && avg > AMBIENCE_FRAME_BUDGET_MS && r.quality > 0.25) { // 느린 기기 — 입자 반감
        r.setQuality(r.quality / 2);
        frame = 1; avg = 0;
      }
      onFrameRef.current?.({ frame, n: r.count, quality: r.quality, costMs: cost, zones: r.env.zones.length });
    };

    const start = () => {
      if (still || raf || document.hidden || mq?.matches) return;
      last = performance.now(); next = last;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

    // 같은 크기면 다시 그리지 않는다 — 마운트 때 직접 부른 resize 와 ResizeObserver 첫 콜백이 장면을 두 번 그렸다.
    let sizeKey = '';
    const paint = () => {
      const w = cv.clientWidth, h = cv.clientHeight, d = window.devicePixelRatio || 1;
      if (!(w > 0 && h > 0)) return;
      const key = `${w}x${h}@${d}`;
      if (key === sizeKey) return;
      sizeKey = key;
      r.resize(w, h, d);
      measureZones();
      if (!raf) r.render(); // 멈춘 상태(reduced-motion·숨김)에서도 새 크기의 정지 프레임은 그린다
      reveal();
    };
    let dequeue: (() => void) | null = null;
    const resize = still ? () => { dequeue?.(); dequeue = enqueueStill(() => { dequeue = null; paint(); }); } : paint;

    const onVis = () => (document.hidden ? stop() : start());
    const onMotionPref = () => { if (mq?.matches || still) { stop(); r.render(); } else start(); };

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
      dequeue?.();
      ro?.disconnect();
      window.clearInterval(zoneTimer);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      mq?.removeEventListener?.('change', onMotionPref);
    };
  }, [motion, scene, seed, avoidSelector, still]);

  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div ref={boxRef} aria-hidden data-testid="clk-ambience" data-motion={scene?.id ?? motion ?? ''}
      style={{ ...FILL, pointerEvents: 'none', overflow: 'hidden', opacity: 0, transition: reduce ? undefined : 'opacity 450ms ease-out' }}>
      {still && video?.poster && (
        <img src={video.poster} alt="" style={{ ...FILL, objectFit: 'cover' }} />
      )}
      {!still && mp4 && failedSrc !== mp4 && (
        <video ref={vRef} src={mp4} poster={video?.poster} muted loop playsInline preload="metadata" style={{ ...FILL, objectFit: 'cover' }} />
      )}
      {(still ? !!video?.poster : mp4 && failedSrc !== mp4) && (
        // 가독 막 — 정적 그라데이션 한 장(페인트 1회). 영상은 인코딩 때 이미 어둡게·흐리게 구웠고, 이 막이 테마별 차이를 맞춘다.
        <div style={{ ...FILL, background: `radial-gradient(ellipse 58% 52% at 50% 47%, rgba(0,0,0,${Math.min(0.85, dim + 0.18)}) 0%, rgba(0,0,0,${dim}) 72%), rgba(0,0,0,${dim})` }} />
      )}
      {scene && <canvas ref={bgRef} data-amb-layer="bg" style={FILL} />}
      {scene?.under && <canvas ref={midRef} data-amb-layer="mid" style={FILL} />}
      {scene && <canvas ref={shadeRef} data-amb-layer="shade" style={FILL} />}
      {(motion || scene) && <canvas ref={cvRef} data-amb-fx style={FILL} />}
    </div>
  );
}
