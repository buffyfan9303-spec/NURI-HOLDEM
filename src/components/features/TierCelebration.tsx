// 등급 승급 풀스크린 축하 — 활동 점수 티어가 올라간 순간 1회 표시(계정별 localStorage 추적).
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import TierBadge, { tierOf } from '../atoms/TierBadge';

const KEY = (uid: string) => `nuri:tier-rank:${uid}`;

export default function TierCelebration() {
  const { user } = useAuth();
  const [show, setShow] = useState<{ label: string; points: number } | null>(null);

  useEffect(() => {
    if (!user || user.role === 'admin') return;
    const pts = user.activityPoints ?? 0;
    const cur = tierOf(pts);
    try {
      const prev = Number(localStorage.getItem(KEY(user.id)) ?? '-1');
      if (prev >= 0 && cur.rank > prev) {
        setShow({ label: cur.label, points: pts });
        navigator.vibrate?.([20, 60, 20, 60, 40]); // 승급 햅틱 팡파레
      }
      localStorage.setItem(KEY(user.id), String(cur.rank));
    } catch { /* storage 미지원 무시 */ }
  }, [user, user?.activityPoints]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center animate-fade-in"
      onClick={() => setShow(null)} role="dialog" aria-label="등급 승급 축하">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
      {/* 골드 컨페티 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} className="confetti absolute block h-2.5 w-1.5 rounded-[2px]"
            style={{
              left: `${(i * 53) % 100}%`,
              background: i % 3 === 0 ? '#FFD100' : i % 3 === 1 ? '#FFE680' : '#FF4D6D',
              animationDelay: `${(i % 9) * 0.18}s`,
              animationDuration: `${2.2 + (i % 5) * 0.35}s`,
            }} />
        ))}
      </div>
      <div className="relative mx-6 max-w-sm rounded-card border border-gold-400/60 bg-gradient-to-b from-gold-300/[0.12] to-surface-base p-8 text-center shadow-[0_0_60px_rgba(255,209,0,0.25)] animate-slide-up">
        <p className="text-2xs font-bold uppercase tracking-[0.2em] text-gold-300">RANK UP</p>
        <div className="mt-4 flex justify-center"><TierBadge points={show.points} size={72} /></div>
        <p className="mt-4 text-3xl font-extrabold text-gold-300">{show.label} <span className="text-base font-bold text-ink-secondary">등급 달성!</span></p>
        <p className="mt-2 text-2xs leading-relaxed text-ink-muted">활동 점수 {show.points.toLocaleString()}점 — 꾸준한 활동의 결과예요.<br />다음 등급까지 계속 달려볼까요?</p>
        <button type="button" onClick={() => setShow(null)} className="btn-primary mt-5 w-full py-2.5 text-sm">좋아요!</button>
      </div>
    </div>
  );
}
