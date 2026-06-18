// src/components/atoms/TitleChip.tsx
// 칭호 칩 — 활동점수 → 레벨 칭호(홀덤 입문~홀덤 마스터)를 닉네임 옆에 작게 표시.
//   points 가 없으면(undefined) 렌더 안 함(로딩 중/미조회). 0이면 최저 칭호 표시.
import { tierOf } from './TierBadge';

export default function TitleChip({ points }: { points?: number }) {
  if (points == null) return null;
  const t = tierOf(points);
  return (
    <span
      className="ml-1 inline-flex shrink-0 items-center rounded-badge px-1.5 py-0.5 align-middle text-[10px] font-bold leading-none"
      style={{ color: t.color, background: `${t.color}1a`, border: `1px solid ${t.color}40` }}
      title={`Lv ${t.level} · 활동 ${points.toLocaleString()}점`}
    >
      {t.title}
    </span>
  );
}
