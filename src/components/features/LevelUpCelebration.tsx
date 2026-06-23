// src/components/features/LevelUpCelebration.tsx
// 레벨업 축하 연출(전역) — 활동점수가 임계를 넘어 레벨이 오르면 어디서든 컨페티+레벨카드.
//   LevelUpWatcher 를 App 루트에 마운트하면 user.activityPoints 변동 즉시 감지(대시보드 진입 불필요).
//   localStorage 'nuri:level-seen' 로 1회만, 같은 레벨 중복 방지.
import { useEffect, useRef, useState } from 'react';
import TierBadge, { tierOf } from '../atoms/TierBadge';

const SEEN_KEY = 'nuri:level-seen';

/** 컨페티 — 캔버스 색종이 낙하(의존성 없음, 약 3.5초 후 정지). */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = (c.width = c.offsetWidth || window.innerWidth);
    const H = (c.height = c.offsetHeight || window.innerHeight);
    const colors = ['#FCD535', '#FF7A8A', '#5FA8FF', '#4FCB98', '#B388FF', '#FF9F45'];
    const parts = Array.from({ length: 140 }, () => ({
      x: Math.random() * W, y: -20 - Math.random() * H,
      vx: -1 + Math.random() * 2, vy: 2 + Math.random() * 3.5,
      r: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 6.28, vr: -0.2 + Math.random() * 0.4,
    }));
    let raf = 0; const start = performance.now();
    const tick = (now: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore();
      }
      if (now - start < 3500) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}

/** 레벨업 축하 모달 — 컨페티 + 새 레벨/칭호 카드. */
export function LevelUpCelebration({ points, onClose }: { points: number; onClose: () => void }) {
  const t = tierOf(points);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" role="dialog" aria-label="레벨 업">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/80" />
      <Confetti />
      <div className="relative mx-4 max-w-xs rounded-dialog border border-accent-400/40 bg-surface-mid p-6 text-center animate-slide-up">
        <p className="text-2xs font-extrabold uppercase tracking-[0.3em] text-accent-300">LEVEL UP</p>
        <div className="my-3 flex justify-center"><TierBadge points={points} size={56} /></div>
        <p className="text-3xl font-extrabold leading-none text-ink-primary">Lv {t.level}</p>
        <p className="mt-1.5 text-lg font-bold" style={{ color: t.color }}>{t.title}</p>
        <p className="mt-2 text-2xs text-ink-muted">활동점수 {points.toLocaleString()}점 달성! 🎉</p>
        <button type="button" onClick={onClose} className="btn-primary mt-4 w-full text-sm">확인</button>
      </div>
    </div>
  );
}

/** 전역 레벨업 감지 + 축하 — App 루트에 마운트. points 변동 시 마지막 본 레벨보다 오르면 1회 축하. */
export default function LevelUpWatcher({ points }: { points: number | null | undefined }) {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (points == null) return;
    const lvl = tierOf(points).level;
    let seen: number | null = null;
    try { const s = localStorage.getItem(SEEN_KEY); seen = s ? parseInt(s, 10) : null; } catch { /* ignore */ }
    if (seen != null && lvl > seen) setShown(lvl);
    try { localStorage.setItem(SEEN_KEY, String(lvl)); } catch { /* ignore */ }
  }, [points]);
  if (shown == null || points == null) return null;
  return <LevelUpCelebration points={points} onClose={() => setShown(null)} />;
}
