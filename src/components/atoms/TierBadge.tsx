// src/components/atoms/TierBadge.tsx
import type { CSSProperties } from 'react';

/**
 * 활동 점수 기반 회원 등급. 카드 랭크 2 ~ K (점수 절대평가).
 * 최고 등급 'A(Ace)'는 상대평가 — K(14,000점) 달성자 중 전체 랭킹 상위 10명에게만
 * 부여되는 명예 등급이다. (점수만으로는 A 에 도달할 수 없다)
 *
 * 점수 적립: 접속 +1 / 글쓰기 +3 / 댓글 +1
 */
export interface Tier {
  /** 등급 키(예: 'K','2') */
  key: string;
  /** 표시 라벨 */
  label: string;
  /** 등급 인덱스 0(2) ~ 11(K) */
  rank: number;
  /** 진입 최소 점수 */
  min: number;
  /** 강조 색 */
  color: string;
}

interface TierDef { rank: string; min: number; color: string; }

// 점수로 도달 가능한 최대 등급은 K. A 는 상대평가(별도)로만 부여.
// 색상은 등급군별로 구분(회색→블루→그린→퍼플→오렌지→레드→골드)
const RANK_THRESHOLDS: readonly TierDef[] = [
  { rank: '2',  min: 0,     color: '#7C8696' },
  { rank: '3',  min: 20,    color: '#7C8696' },
  { rank: '4',  min: 60,    color: '#94A0B5' },
  { rank: '5',  min: 150,   color: '#5FA8FF' },
  { rank: '6',  min: 300,   color: '#5FA8FF' },
  { rank: '7',  min: 600,   color: '#4FCB98' },
  { rank: '8',  min: 1200,  color: '#4FCB98' },
  { rank: '9',  min: 2500,  color: '#B388FF' },
  { rank: '10', min: 4000,  color: '#B388FF' },
  { rank: 'J',  min: 7000,  color: '#FF9F45' },
  { rank: 'Q',  min: 10000, color: '#FF7A8A' },
  { rank: 'K',  min: 14000, color: '#FFD100' },
] as const;

// A(Ace) 부여 조건 — 상대평가
export const ACE_MIN_POINTS = 14000;
export const ACE_TOP_RANK   = 10;
const ACE_COLOR = '#FFD700';

/** 활동 점수 -> 등급(2~K) */
export function tierOf(points: number): Tier {
  const p = Math.max(0, Math.floor(points || 0));
  let idx = 0;
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (p >= RANK_THRESHOLDS[i].min) idx = i; else break;
  }
  const d = RANK_THRESHOLDS[idx];
  return { key: d.rank, label: d.rank, rank: idx, min: d.min, color: d.color };
}

/** A 등급 자격 여부(상대평가): K(14,000점) 달성 + 전체 순위 10위 이내 */
export function isAceRank(points: number, overallRank?: number | null): boolean {
  return points >= ACE_MIN_POINTS && overallRank != null && overallRank <= ACE_TOP_RANK;
}

/**
 * 최종 등급 라벨 산출. 유저의 points 와 overallRank(전체 순위)를 받아
 * 조건을 만족하면 'A'(상대평가), 아니면 점수에 맞는 2~K 등급을 반환한다.
 *
 *   if (points >= 14000 && overallRank <= 10) return 'A';
 *   else return 점수 매칭 등급;
 */
export function calculateRank(points: number, overallRank?: number | null): string {
  if (isAceRank(points, overallRank)) return 'VIP';
  return tierOf(points).label;
}

export interface TierProgress {
  current: Tier;
  /** 다음 등급(K=최고 점수 등급이면 null) */
  next: Tier | null;
  /** 현재 등급 구간 진행률 0~1 */
  ratio: number;
  /** 다음 등급까지 남은 점수 */
  toNext: number;
}

/** 다음 등급까지 진행 상황 (점수 기준 2~K) */
export function tierProgress(points: number): TierProgress {
  const p = Math.max(0, Math.floor(points || 0));
  const current = tierOf(p);
  if (current.rank >= RANK_THRESHOLDS.length - 1) {
    return { current, next: null, ratio: 1, toNext: 0 };
  }
  const nd = RANK_THRESHOLDS[current.rank + 1];
  const next: Tier = { key: nd.rank, label: nd.rank, rank: current.rank + 1, min: nd.min, color: nd.color };
  const span = next.min - current.min;
  const done = p - current.min;
  return {
    current,
    next,
    ratio: span > 0 ? Math.min(1, Math.max(0, done / span)) : 1,
    toNext: Math.max(0, next.min - p),
  };
}

/** 전체 등급 목록(낮은→높은) — 안내/범례용 (2~K) */
export function allTiers(): Tier[] {
  return RANK_THRESHOLDS.map((d, i) => ({ key: d.rank, label: d.rank, rank: i, min: d.min, color: d.color }));
}

// 운영자(관리자) 전용 최상위 등급. 랭킹에는 집계하지 않는다.
const ADMIN_TIER_COLOR = '#FF4D6D';

interface Props {
  points: number;
  /** 옆에 "K 등급" 라벨 표시 */
  showLabel?: boolean;
  /** 뱃지 한 변 크기(px) */
  size?: number;
  /** 운영자(관리자)면 점수와 무관하게 SS 등급으로 표시 */
  admin?: boolean;
  /** 전체 순위 — A(상대평가) 판정용. 미전달 시 점수 등급(최대 K)만 표시. */
  overallRank?: number | null;
}

/** 활동 점수 등급 뱃지 — 카드 랭크 칩. 운영자=SS, 상위 10위 K달성자=A(골드). */
export default function TierBadge({ points, showLabel = false, size = 14, admin = false, overallRank }: Props) {
  const ace = !admin && isAceRank(points, overallRank);
  const t = tierOf(points);
  const label = admin ? 'SS' : ace ? 'VIP' : t.label;
  const color = admin ? ADMIN_TIER_COLOR : ace ? ACE_COLOR : t.color;
  const glow = admin || ace || t.rank >= 11;
  const fontSize = Math.max(8, Math.round(size * 0.62));

  // A 등급: 골드 그라디언트 + 강한 글로우 + 어두운 글자(다른 뱃지와 확연히 구분)
  const chip: CSSProperties = ace
    ? {
        height: size, minWidth: size, padding: '0 2px', fontSize,
        color: '#1a1200',
        border: '1px solid #FFE680',
        background: 'linear-gradient(135deg, #FFF1A8 0%, #FFD100 50%, #E0A500 100%)',
        boxShadow: '0 0 8px rgba(255,209,0,0.85)',
      }
    : {
        height: size, minWidth: size, padding: '0 2px', fontSize,
        color,
        border: `1px solid ${color}66`,
        background: 'rgba(10,12,15,0.88)',
        boxShadow: glow ? `0 0 6px ${color}99` : undefined,
      };

  return (
    <span
      className="inline-flex items-center gap-1 align-middle"
      title={
        admin
          ? '운영자 · SS 등급'
          : ace
          ? `VIP 등급 · 전체 상위 ${ACE_TOP_RANK}위 (활동 ${points}점)`
          : `활동 ${points}점 · ${t.label} 등급`
      }
    >
      <span
        className="inline-flex items-center justify-center rounded-[3px] font-extrabold leading-none tracking-tight tabular-nums"
        style={chip}
      >
        {label}
      </span>
      {showLabel && (
        <span className="text-2xs font-bold" style={{ color: ace ? ACE_COLOR : color }}>
          {label} 등급
        </span>
      )}
    </span>
  );
}
