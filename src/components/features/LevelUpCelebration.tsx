// src/components/features/LevelUpCelebration.tsx
// 레벨업 축하 연출(전역) — 활동점수가 임계를 넘어 레벨이 오르면 어디서든 컨페티+레벨카드.
//   LevelUpWatcher 를 App 루트에 마운트하면 user.activityPoints 변동 즉시 감지(대시보드 진입 불필요).
//   승급 감지는 **여기 한 곳**이다 — TierCelebration(f4a1b7c)과 이 파일(519c8af)이 같은 임계표를
//   각자 보던 동안 승급 한 번에 z-90 다이얼로그가 두 겹 떠서 두 번 닫아야 했다(2026-09-09 통합).
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBackClose } from '../../lib/backstack';
import TierBadge, { tierOf, tierCss } from '../atoms/TierBadge';

/** 마지막으로 본 등급(rank) — **계정별** 키. 전역 키('nuri:level-seen')였을 때는 같은 기기에서
 *  다른 계정으로 로그인하면 이전 계정의 레벨과 비교해 가짜 LEVEL UP 이 떴다.
 *  키 이름은 TierCelebration 이 쓰던 것을 그대로 물려받아 배포 전후로 추적이 끊기지 않는다. */
const SEEN_KEY = (uid: string) => `nuri:tier-rank:${uid}`;

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
  // 뒤로가기가 이 축하만 닫는다 — 등록이 없던 동안 Android 뒤로가기는 아래 겹(열려 있던 시트)을 닫거나
  // 사이트를 이탈했고 축하는 그대로 남았다. ESC 는 backstack 의 전역 처리에 맡긴다(개별 리스너 없음).
  useBackClose(true, onClose);
  // OS '동작 줄이기' — index.css 의 reduced-motion 블록은 CSS 애니메이션만 끄고 캔버스 rAF 에는 닿지 않으므로
  // 캔버스를 아예 마운트하지 않는다('깜빡임 0' 계약).
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="레벨 업">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/80" />
      {!reduced && <Confetti />}
      <div className="relative mx-4 max-w-xs rounded-dialog border border-accent-400/40 bg-surface-mid p-6 text-center animate-slide-up">
        <p className="text-2xs font-extrabold uppercase tracking-[0.3em] text-accent-300">LEVEL UP</p>
        <div className="my-3 flex justify-center"><TierBadge points={points} size={56} /></div>
        <p className="text-3xl font-extrabold leading-none text-ink-primary">Lv {t.level}</p>
        <p className="mt-1.5 text-lg font-bold" style={{ color: tierCss(t.colorVar) }}>{t.title}</p>
        <p className="mt-2 text-2xs text-ink-muted">활동점수 {points.toLocaleString()}점 달성!</p>
        <button type="button" onClick={onClose} className="btn-primary mt-4 w-full text-sm">확인</button>
      </div>
    </div>
  );
}

/** 전역 레벨업 감지 + 축하 — App 루트에 `key={user.id}` 로 마운트(계정이 바뀌면 열린 축하도 함께 버린다).
 *  점수 변동 시 마지막 본 등급보다 오르면 1회 축하. 운영자는 제외, 승급 햅틱 포함(TierCelebration 에서 물려받음). */
export default function LevelUpWatcher() {
  const { user } = useAuth();
  const [shown, setShown] = useState<number | null>(null); // 승급 순간의 점수(카드에 그 값을 고정)
  const uid = user?.id;
  const pts = user?.activityPoints;
  const admin = user?.role === 'admin';
  useEffect(() => {
    if (!uid || admin || pts == null) return;
    const rank = tierOf(pts).rank;
    try {
      const prev = Number(localStorage.getItem(SEEN_KEY(uid)) ?? '-1');
      if (prev >= 0 && rank > prev) {
        setShown(pts);
        navigator.vibrate?.([20, 60, 20, 60, 40]); // 승급 햅틱 팡파레
      }
      localStorage.setItem(SEEN_KEY(uid), String(rank));
    } catch { /* storage 미지원 무시 */ }
  }, [uid, admin, pts]);
  if (shown == null || !uid) return null;
  return <LevelUpCelebration points={shown} onClose={() => setShown(null)} />;
}
