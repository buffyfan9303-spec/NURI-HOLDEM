// src/components/atoms/TitleChip.tsx
// 칭호 칩 — 활동점수 → 레벨 칭호(홀덤 입문~홀덤 마스터)를 닉네임 옆에 작게 표시.
//   points 가 없으면(undefined) 렌더 안 함(로딩 중/미조회). 0이면 최저 칭호 표시.
import { tierOf, tierCss } from './TierBadge';

export default function TitleChip({ points }: { points?: number }) {
  if (points == null) return null;
  const t = tierOf(points);
  return (
    <span
      className="ml-1 inline-flex shrink-0 items-center rounded-badge px-1.5 py-0.5 align-middle text-2xs font-bold leading-none"
      // 글자·틴트 배경은 텍스트급 토큰(합성 후 4.5:1), 테두리는 장식급(채도 유지)
      style={{
        color: tierCss(t.colorVar),
        background: tierCss(t.colorVar, 0.102),
        border: `1px solid ${tierCss(t.vividVar, 0.251)}`,
      }}
      title={`Lv ${t.level} · 활동 ${points.toLocaleString()}점`}
    >
      {t.title}
    </span>
  );
}
