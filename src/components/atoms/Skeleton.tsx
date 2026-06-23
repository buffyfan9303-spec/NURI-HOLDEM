// src/components/atoms/Skeleton.tsx
// 공용 로딩 스켈레톤 + 빈 상태 — 화면 간 로딩/빈 화면 표현을 통일.
import type { ReactNode } from 'react';
import CardEmptyState from './EmptyState';

/** 블록형 스켈레톤(기본 높이 3rem). className으로 높이/형태 조정. */
export function Skeleton({ className = 'h-12' }: { className?: string }) {
  return <div className={`skeleton rounded-input ${className}`} aria-hidden />;
}

/** 리스트 행 스켈레톤 — "불러오는 중…" 텍스트 대신 뼈대→내용 페이드 통일용. */
export function SkeletonList({ rows = 4, rowClassName = 'h-12' }: { rows?: number; rowClassName?: string }) {
  return (
    // 스태거(행마다 70ms 지연)를 제거 — 로딩 시 위→아래로 '주르륵' 흐르며 깜빡이던 느낌 제거(균일 셰이드).
    <div className="space-y-1.5" aria-hidden aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`skeleton rounded-input ${rowClassName}`} />
      ))}
    </div>
  );
}

/** 여러 줄 텍스트 스켈레톤. 마지막 줄은 짧게. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-3 rounded" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

/** 공용 빈 상태 — 화면별 icon 이 주어지면 그것을, 아니면 카드 캐릭터(atoms/EmptyState). */
export function EmptyState({ icon, title, desc, action, className = '' }: { icon?: ReactNode; title: string; desc?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <CardEmptyState icon={icon} title={title} hint={desc} action={action} />
    </div>
  );
}
