// src/components/features/WeeklyBestStrip.tsx — 메인 상단 "이번 주 머니인 킹 TOP3" 롤링 위젯.
// 이번 주(월~) 전 매장 순위 등록을 닉네임별 집계해 3.5초 간격으로 1~3위를 한 줄씩 돌려 보여준다.
//
// [DS] MO-7B: 래퍼(px-page-x pt-3)를 컴포넌트 안으로 — 응답 전에는 실제 스트립과 같은
// 높이의 스켈레톤을 자리에 두고(도착해도 안 밀림), '없음' 확정 시에만 통째로 접는다.
// 예전엔 App 쪽 래퍼가 항상 13px 를 차지한 채 스트립이 늦게 삽입되어 목록이 밀렸다.
import { useEffect, useState } from 'react';
import { getWeeklyMoneyinKings, type WeeklyKing } from '../../api/rankings';
import Icon from '../atoms/Icon';


export default function WeeklyBestStrip({ active = true }: { active?: boolean }) {
  const [kings, setKings] = useState<WeeklyKing[]>([]);
  const [isLastWeek, setIsLastWeek] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    getWeeklyMoneyinKings(3)
      .then((r) => { setKings(r.kings); setIsLastWeek(r.isLastWeek); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (kings.length <= 1 || !active) return; // 홈 숨김 시 회전 정지(백그라운드 타이머 제거)
    const t = setInterval(() => setIdx((i) => (i + 1) % kings.length), 3500);
    return () => clearInterval(t);
  }, [kings.length, active]);

  if (!loaded) {
    // 실측 스트립 높이 38px(px-3 py-2 + 본문 1행) — 도착 시 같은 자리를 그대로 채운다
    return (
      <div className="px-page-x pt-3" aria-hidden>
        <div className="skeleton rounded-card" style={{ height: 38 }} />
      </div>
    );
  }
  if (kings.length === 0) return null;
  const k = kings[idx];

  return (
    <div className="reveal px-page-x pt-3">
      {/* DAI-3·4: 그라데이션·메달 이모지 → 헤어라인 + trophy 글리프 + 순위 텍스트(골드는 상금·트로피 전용 예산) */}
      <div className="flex items-center gap-2 overflow-hidden rounded-card border border-border-subtle bg-surface-low px-3 py-2">
        <span className="flex shrink-0 items-center gap-1 text-xs font-extrabold tracking-wide text-gold-300"><Icon name="trophy" size={13} />{isLastWeek ? '지난주' : '이번 주'} 머니인 킹</span>
        <div key={idx} className="flex min-w-0 flex-1 animate-fade-in items-center gap-1.5">
          <span aria-hidden className="shrink-0 text-2xs font-bold tabular-nums text-ink-muted">{idx + 1}위</span>
          <span className="min-w-0 truncate text-sm font-bold text-ink-primary">{k.nickname}</span>
          <span className="shrink-0 text-2xs text-ink-muted">머니인 {k.moneyinCount}회{k.bestPosition <= 3 ? ` · 최고 ${k.bestPosition}위` : ''}</span>
        </div>
        {kings.length > 1 && (
          <span className="flex shrink-0 gap-1" aria-hidden>
            {kings.map((_, i) => (
              <span key={i} className={['h-1 w-1 rounded-full transition-colors', i === idx ? 'bg-accent-300' : 'bg-surface-float'].join(' ')} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
