// src/components/atoms/TierBadge.tsx
import type { CSSProperties } from 'react';

export interface Tier {
  key: 'none' | 'spade' | 'diamond';
  label: string;
  color: string;
}

/** 활동 점수 구간 -> 티어 */
export function tierOf(points: number): Tier {
  if (points >= 100) return { key: 'diamond', label: '다이아', color: '#FFD100' };
  if (points >= 30) return { key: 'spade', label: '스페이드', color: '#C0C8D8' };
  return { key: 'none', label: '', color: '' };
}

interface Props {
  points: number;
  showLabel?: boolean;
  size?: number;
}

/** 활동 점수 티어 뱃지(스페이드/다이아몬드). 특수기호 없이 SVG 도형으로 표현 */
export default function TierBadge({ points, showLabel = false, size = 14 }: Props) {
  const t = tierOf(points);
  if (t.key === 'none') return null;
  const style: CSSProperties = { color: t.color };
  return (
    <span className="inline-flex items-center gap-0.5 align-middle" title={`활동 점수 ${points} · ${t.label}`} style={style}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        {t.key === 'diamond' ? (
          <path d="M12 2 L22 12 L12 22 L2 12 Z" />
        ) : (
          <path d="M12 3 C9 8 3 10 3 14.5 C3 17 5 18.5 7.2 18.5 C8.6 18.5 9.7 17.8 10.3 16.8 C10.2 18.6 9.4 20 8 21 L16 21 C14.6 20 13.8 18.6 13.7 16.8 C14.3 17.8 15.4 18.5 16.8 18.5 C19 18.5 21 17 21 14.5 C21 10 15 8 12 3 Z" />
        )}
      </svg>
      {showLabel && <span className="text-2xs font-bold">{t.label}</span>}
    </span>
  );
}
