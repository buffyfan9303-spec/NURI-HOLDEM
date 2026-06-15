// src/components/features/WeeklyBestStrip.tsx — 메인 상단 "이번 주 머니인 킹 TOP3" 롤링 위젯.
// 이번 주(월~) 전 매장 순위 등록을 닉네임별 집계해 3.5초 간격으로 1~3위를 한 줄씩 돌려 보여준다.
import { useEffect, useState } from 'react';
import { getWeeklyMoneyinKings, type WeeklyKing } from '../../api/rankings';

const MEDAL = ['👑', '🥈', '🥉'];

export default function WeeklyBestStrip({ active = true }: { active?: boolean }) {
  const [kings, setKings] = useState<WeeklyKing[]>([]);
  const [isLastWeek, setIsLastWeek] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    getWeeklyMoneyinKings(3).then((r) => { setKings(r.kings); setIsLastWeek(r.isLastWeek); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (kings.length <= 1 || !active) return; // 홈 숨김 시 회전 정지(백그라운드 타이머 제거)
    const t = setInterval(() => setIdx((i) => (i + 1) % kings.length), 3500);
    return () => clearInterval(t);
  }, [kings.length, active]);

  if (kings.length === 0) return null;
  const k = kings[idx];

  return (
    <div className="flex items-center gap-2 overflow-hidden rounded-card border border-gold-400/25 bg-gradient-to-r from-gold-300/10 via-surface-low to-surface-low px-3 py-2">
      <span className="shrink-0 text-xs font-extrabold tracking-wide text-gold-300">{isLastWeek ? '지난주' : '이번 주'} 머니인 킹</span>
      <div key={idx} className="flex min-w-0 flex-1 animate-fade-in items-center gap-1.5">
        <span aria-hidden className="shrink-0 text-sm leading-none">{MEDAL[idx] ?? '🏅'}</span>
        <span className="min-w-0 truncate text-sm font-bold text-ink-primary">{k.nickname}</span>
        <span className="shrink-0 text-2xs text-ink-muted">머니인 {k.moneyinCount}회{k.bestPosition <= 3 ? ` · 최고 ${k.bestPosition}위` : ''}</span>
      </div>
      {kings.length > 1 && (
        <span className="flex shrink-0 gap-1" aria-hidden>
          {kings.map((_, i) => (
            <span key={i} className={['h-1 w-1 rounded-full transition-colors', i === idx ? 'bg-gold-300' : 'bg-surface-float'].join(' ')} />
          ))}
        </span>
      )}
    </div>
  );
}
