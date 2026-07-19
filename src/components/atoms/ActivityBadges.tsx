// src/components/atoms/ActivityBadges.tsx
// 프로필 활동 점수 + 뱃지 진열장.
//  - 커뮤니티 랭킹 점수: 활동 점수(접속/글/댓글). TierBadge 등급과 연동.
//  - 매장 방문 점수: 예약 후 방문(지난 일정 예약) 횟수.
import TierBadge from './TierBadge';

const VISIT_BADGES = [
  { min: 1, label: '첫 방문', color: '#5FA8FF' },
  { min: 5, label: '단골', color: '#4FCB98' },
  { min: 15, label: 'VIP 단골', color: '#B388FF' },
  { min: 30, label: '레전드 단골', color: '#FFD700' },
] as const;

const RANK_BADGES = [
  { min: 300, label: '커뮤니티 새내기', color: '#5FA8FF' },
  { min: 1200, label: '커뮤니티 활동가', color: '#4FCB98' },
  { min: 4000, label: '커뮤니티 코어', color: '#B388FF' },
  { min: 14000, label: '커뮤니티 마스터', color: '#FFD700' },
] as const;

function Chip({ label, color, earned }: { label: string; color: string; earned: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-badge px-2 py-1 text-2xs font-bold leading-none border"
      style={earned
        // 고정 다크 배경 대신 뱃지색 틴트 — 라이트 모드에서도 이질감 없이 원색 유지
        ? { color, borderColor: `${color}66`, background: `color-mix(in srgb, ${color} 14%, transparent)` }
        : { color: 'rgb(var(--ink-muted))', borderColor: 'rgb(var(--border-subtle))', opacity: 0.55 }}
      title={earned ? `${label} 획득` : `${label} (미획득)`}
    >
      {!earned && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      )}
      {label}
    </span>
  );
}

export default function ActivityBadges({ points, visits, upcoming }: { points: number; visits: number; upcoming: number }) {
  const earnedCount = VISIT_BADGES.filter((b) => visits >= b.min).length + RANK_BADGES.filter((b) => points >= b.min).length;

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-surface-low p-3">
      {/* 점수 2종 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-input border border-border-subtle bg-surface-high p-2.5">
          <p className="mb-1 text-2xs text-ink-muted">커뮤니티 랭킹 점수</p>
          <div className="flex items-center gap-1.5">
            <TierBadge points={points} size={18} />
            <span className="text-base font-extrabold leading-none text-ink-primary tabular-nums">{points.toLocaleString()}</span>
            <span className="text-2xs text-ink-muted">점</span>
          </div>
        </div>
        <div className="rounded-input border border-border-subtle bg-surface-high p-2.5">
          <p className="mb-1 text-2xs text-ink-muted">매장 방문 점수</p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-extrabold leading-none text-accent-300 tabular-nums">{visits}</span>
            <span className="text-2xs text-ink-muted">회 방문{upcoming > 0 ? ` · 예정 ${upcoming}` : ''}</span>
          </div>
        </div>
      </div>

      {/* 뱃지 진열장 */}
      <div>
        <p className="mb-1.5 text-2xs text-ink-muted">획득 뱃지 <span className="font-semibold text-ink-secondary">{earnedCount}</span></p>
        <div className="flex flex-wrap gap-1.5">
          {VISIT_BADGES.map((b) => <Chip key={`v${b.min}`} label={b.label} color={b.color} earned={visits >= b.min} />)}
          {RANK_BADGES.map((b) => <Chip key={`r${b.min}`} label={b.label} color={b.color} earned={points >= b.min} />)}
        </div>
      </div>
    </section>
  );
}
