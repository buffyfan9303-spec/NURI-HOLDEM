// src/components/atoms/TierBadge.tsx
/* eslint-disable react-refresh/only-export-components -- 등급 유틸(tierOf 등)+뱃지 컴포넌트 동거 파일: 기존 공개 API 유지(분리 시 임포트 전면 수정) */
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
  /** 강조 색 — 다크 기준 6자리 hex. canvas(프로필 카드)처럼 CSS 변수를 못 읽는 곳 전용. */
  color: string;
  /** 텍스트용 등급색 CSS 변수명(테마 인지) — tierCss() 로 감싸 쓴다. WCAG 4.5:1 보장. */
  colorVar: string;
  /** 장식용(글로우·그라데이션·테두리) 등급색 CSS 변수명 — 라이트에서도 채도 유지. */
  vividVar: string;
  /** 레벨 (1~12, rank+1) */
  level: number;
  /** 한글 칭호 */
  title: string;
}

interface TierDef { rank: string; min: number; color: string; token: string; title: string; }

/**
 * 등급 색 CSS 값. surface 스케일과 같은 `rgb(var(--x) / a)` 문법으로 통일한다
 * (color-mix 는 computed 가 color(srgb ...) 로 갈려 섞이면 그게 다음 회귀다).
 * @param varName `--tier-blue` 같은 토큰명
 * @param alpha   0~1. 생략 시 불투명
 */
export function tierCss(varName: string, alpha?: number): string {
  return alpha == null ? `rgb(var(${varName}))` : `rgb(var(${varName}) / ${alpha})`;
}

/** AA(상대평가)·SS(운영자) 등급색 토큰 — RANK_THRESHOLDS 밖이라 별도 상수 */
export const ACE_VAR         = '--tier-ace';
export const ACE_VIVID_VAR   = '--tier-ace-vivid';
export const ADMIN_VAR       = '--tier-admin';
export const ADMIN_VIVID_VAR = '--tier-admin-vivid';

/** TierDef -> Tier (색 토큰 결합 지점 일원화) */
function toTier(d: TierDef, idx: number): Tier {
  return {
    key: d.rank, label: d.rank, rank: idx, min: d.min, color: d.color,
    colorVar: `--tier-${d.token}`, vividVar: `--tier-${d.token}-vivid`,
    level: idx + 1, title: d.title,
  };
}

// 점수로 도달 가능한 최대 등급은 K. A 는 상대평가(별도)로만 부여.
// 색상은 등급군별로 구분(회색→블루→그린→퍼플→오렌지→레드→골드). title=레벨별 한글 칭호.
const RANK_THRESHOLDS: readonly TierDef[] = [
  { rank: '22',   min: 0,     color: '#7C8696', token: 'slate',    title: '홀덤 입문' },
  { rank: '33',   min: 20,    color: '#7C8696', token: 'slate',    title: '뉴비' },
  { rank: '44',   min: 60,    color: '#94A0B5', token: 'steel',    title: '루키' },
  { rank: '55',   min: 150,   color: '#5FA8FF', token: 'blue',     title: '레귤러' },
  { rank: '66',   min: 300,   color: '#5FA8FF', token: 'blue',     title: '그라인더' },
  { rank: '77',   min: 600,   color: '#4FCB98', token: 'green',    title: '세미프로' },
  { rank: '88',   min: 1200,  color: '#4FCB98', token: 'green',    title: '프로' },
  { rank: '99',   min: 2500,  color: '#B388FF', token: 'purple',   title: '하이롤러' },
  { rank: '1010', min: 4000,  color: '#B388FF', token: 'purple',   title: '샤크' },
  { rank: 'JJ',   min: 7000,  color: '#FF9F45', token: 'orange',   title: '레전드' },
  { rank: 'QQ',   min: 10000, color: '#FF7A8A', token: 'rose',     title: '챔피언' },
  { rank: 'KK',   min: 14000, color: '#FFD100', token: 'gold',     title: '홀덤 마스터' },
] as const;

// A(Ace) 부여 조건 — 상대평가
export const ACE_MIN_POINTS = 14000;
export const ACE_TOP_RANK   = 10;
/** SS(운영자) 다크 기준 hex — tierColor() 의 hex 반환 계약 유지용(App.tsx·canvas). */
const ADMIN_HEX = '#FF4D6D';

/** 활동 점수 -> 등급(2~K) */
export function tierOf(points: number): Tier {
  const p = Math.max(0, Math.floor(points || 0));
  let idx = 0;
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (p >= RANK_THRESHOLDS[i].min) idx = i; else break;
  }
  return toTier(RANK_THRESHOLDS[idx], idx);
}

/**
 * 등급 강조색(6자리 hex, 다크 기준) — 운영자=빨강, 그 외 점수 등급색.
 * ⚠ 반환 계약(6자리 hex)을 바꾸지 말 것: 소비처가 `${tierColor(...)}aa` 처럼 알파를 문자열로
 *   결합한다(App.tsx 아바타 링 — 오케스트레이터 소유 파일). 또 canvas 2D(profileCard.ts)는
 *   CSS 변수를 해석하지 못해 hex 가 필요하다.
 * 테마를 따라야 하는 곳은 아래 tierColorVar/tierVividVar + tierCss 를 쓴다.
 */
export function tierColor(points: number, admin = false): string {
  return admin ? ADMIN_HEX : tierOf(points).color;
}

/** 등급 강조색 — 텍스트용 CSS 변수명(테마 인지). 운영자 포함. */
export function tierColorVar(points: number, admin = false): string {
  return admin ? ADMIN_VAR : tierOf(points).colorVar;
}

/** 등급 강조색 — 장식용 CSS 변수명(테마 인지, 채도 유지). 운영자 포함. */
export function tierVividVar(points: number, admin = false): string {
  return admin ? ADMIN_VIVID_VAR : tierOf(points).vividVar;
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
  if (isAceRank(points, overallRank)) return 'AA';
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
  const next: Tier = toTier(RANK_THRESHOLDS[current.rank + 1], current.rank + 1);
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
  return RANK_THRESHOLDS.map(toTier);
}

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
  const label = admin ? 'SS' : ace ? 'AA' : t.label;
  // 텍스트는 --tier-*(4.5:1 보장), 테두리·글로우는 --tier-*-vivid(3:1 기준 · 채도 유지)
  const inkVar   = admin ? ADMIN_VAR       : ace ? ACE_VAR       : t.colorVar;
  const vividVar = admin ? ADMIN_VIVID_VAR : ace ? ACE_VIVID_VAR : t.vividVar;
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
        color: tierCss(inkVar),
        border: `1px solid ${tierCss(vividVar, 0.4)}`,
        background: 'rgb(var(--surface-base) / 0.9)', // 토큰 — 라이트 모드에서도 자동 대응
        boxShadow: glow ? `0 0 6px ${tierCss(vividVar, 0.6)}` : undefined,
      };

  return (
    <span
      className="inline-flex items-center gap-1 align-middle"
      title={
        admin
          ? '운영자 · SS 등급'
          : ace
          ? `AA 등급 · 전체 상위 ${ACE_TOP_RANK}위 (활동 ${points}점)`
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
        <span className="text-2xs font-bold" style={{ color: tierCss(inkVar) }}>
          {label} 등급
        </span>
      )}
    </span>
  );
}
