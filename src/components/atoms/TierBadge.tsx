// src/components/atoms/TierBadge.tsx
import type { CSSProperties } from 'react';

/**
 * 활동 점수 기반 회원 등급.
 * 포커 포켓페어 22(2-pocket) ~ AA 까지 13단계.
 * 점수 적립: 접속 +1 / 글쓰기 +3 / 댓글 +1 (+ 배드빗·굿런 받으면 +1)
 */
export interface Tier {
  /** 등급 키(포켓페어 표기, 예: 'AA','22'). 호환을 위해 string */
  key: string;
  /** 표시 라벨 (예: 'AA','TT','22') */
  label: string;
  /** 등급 인덱스 0(22) ~ 12(AA) */
  rank: number;
  /** 진입 최소 점수 */
  min: number;
  /** 강조 색 */
  color: string;
}

interface TierDef { pair: string; min: number; color: string; }

// 낮은 등급 -> 높은 등급. 색상은 등급군별로 구분(회색→블루→그린→퍼플→오렌지→레드→골드)
const TIER_DEFS: readonly TierDef[] = [
  { pair: '22', min: 0,    color: '#7C8696' },
  { pair: '33', min: 10,   color: '#7C8696' },
  { pair: '44', min: 25,   color: '#94A0B5' },
  { pair: '55', min: 50,   color: '#5FA8FF' },
  { pair: '66', min: 90,   color: '#5FA8FF' },
  { pair: '77', min: 150,  color: '#4FCB98' },
  { pair: '88', min: 240,  color: '#4FCB98' },
  { pair: '99', min: 360,  color: '#B388FF' },
  { pair: 'TT', min: 520,  color: '#B388FF' },
  { pair: 'JJ', min: 740,  color: '#FF9F45' },
  { pair: 'QQ', min: 1040, color: '#FF7A8A' },
  { pair: 'KK', min: 1450, color: '#FFD100' },
  { pair: 'AA', min: 2000, color: '#FFD100' },
] as const;

/** 활동 점수 -> 등급 */
export function tierOf(points: number): Tier {
  const p = Math.max(0, Math.floor(points || 0));
  let idx = 0;
  for (let i = 0; i < TIER_DEFS.length; i++) {
    if (p >= TIER_DEFS[i].min) idx = i; else break;
  }
  const d = TIER_DEFS[idx];
  return { key: d.pair, label: d.pair, rank: idx, min: d.min, color: d.color };
}

export interface TierProgress {
  current: Tier;
  /** 다음 등급(최고 등급이면 null) */
  next: Tier | null;
  /** 현재 등급 구간 진행률 0~1 (최고 등급이면 1) */
  ratio: number;
  /** 다음 등급까지 남은 점수(최고 등급이면 0) */
  toNext: number;
}

/** 다음 등급까지 진행 상황 */
export function tierProgress(points: number): TierProgress {
  const p = Math.max(0, Math.floor(points || 0));
  const current = tierOf(p);
  if (current.rank >= TIER_DEFS.length - 1) {
    return { current, next: null, ratio: 1, toNext: 0 };
  }
  const nd = TIER_DEFS[current.rank + 1];
  const next: Tier = { key: nd.pair, label: nd.pair, rank: current.rank + 1, min: nd.min, color: nd.color };
  const span = next.min - current.min;
  const done = p - current.min;
  return {
    current,
    next,
    ratio: span > 0 ? Math.min(1, Math.max(0, done / span)) : 1,
    toNext: Math.max(0, next.min - p),
  };
}

/** 전체 등급 목록(낮은→높은) — 안내/범례용 */
export function allTiers(): Tier[] {
  return TIER_DEFS.map((d, i) => ({ key: d.pair, label: d.pair, rank: i, min: d.min, color: d.color }));
}

interface Props {
  points: number;
  /** 옆에 "AA 등급" 라벨 표시 */
  showLabel?: boolean;
  /** 뱃지 한 변 크기(px) */
  size?: number;
}

/** 활동 점수 등급 뱃지 — 포켓페어 카드칩 형태(특수기호 없이 텍스트) */
export default function TierBadge({ points, showLabel = false, size = 14 }: Props) {
  const t = tierOf(points);
  const fontSize = Math.max(8, Math.round(size * 0.62));
  const chip: CSSProperties = {
    height: size,
    minWidth: size,
    padding: '0 2px',
    fontSize,
    color: t.color,
    borderColor: `${t.color}66`,
    background: 'rgba(10,12,15,0.88)',
    boxShadow: t.rank >= 11 ? `0 0 6px ${t.color}99` : undefined,
  };
  return (
    <span
      className="inline-flex items-center gap-1 align-middle"
      title={`활동 ${points}점 · ${t.label} 등급`}
    >
      <span
        className="inline-flex items-center justify-center rounded-[3px] border font-extrabold leading-none tracking-tight tabular-nums"
        style={chip}
      >
        {t.label}
      </span>
      {showLabel && (
        <span className="text-2xs font-bold" style={{ color: t.color }}>
          {t.label} 등급
        </span>
      )}
    </span>
  );
}
