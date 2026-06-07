// src/components/atoms/Skeleton.tsx
// 공용 로딩 스켈레톤 + 빈 상태 — 화면 간 로딩/빈 화면 표현을 통일.
import type { ReactNode } from 'react';

/** 블록형 스켈레톤(기본 높이 3rem). className으로 높이/형태 조정. */
export function Skeleton({ className = 'h-12' }: { className?: string }) {
  return <div className={`skeleton rounded-input ${className}`} aria-hidden />;
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

/** 공용 빈 상태 — 아이콘 + 제목 + 설명 + (선택) 액션 버튼. */
export function EmptyState({ icon, title, desc, action, className = '' }: { icon?: ReactNode; title: string; desc?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-ink-muted ${className}`}>
      {icon && <span className="opacity-30 [&>svg]:h-10 [&>svg]:w-10" aria-hidden>{icon}</span>}
      <p className="text-sm font-semibold text-ink-secondary">{title}</p>
      {desc && <p className="text-2xs leading-relaxed">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
