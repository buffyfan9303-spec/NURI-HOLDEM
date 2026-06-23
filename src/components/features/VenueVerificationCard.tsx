import { useEffect, useState } from 'react';
import { getMyVenue, type Venue } from '../../api/community';

/** 업주 마이페이지 상단 — 매장 인증 등급 표시(인증 부여는 관리자 전용) */
export default function VenueVerificationCard() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyVenue().then(setVenue).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading || !venue) return null;
  const status = venue.verificationStatus ?? 'unverified';

  if (status === 'verified') {
    return (
      <div className="flex items-center gap-2 rounded-card border-2 border-accent-300 bg-accent-300/[0.08] px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-300 text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-accent-300">인증 매장</p>
          <p className="text-2xs text-ink-muted">포스터(요강)가 운영자 승인 없이 즉시 게시됩니다.</p>
        </div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="rounded-card border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2.5">
        <p className="text-sm font-bold text-amber-400">인증 심사 중</p>
        <p className="mt-0.5 text-2xs text-ink-muted">운영자가 인증을 검토하고 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-card border border-border-default bg-surface-low p-3">
      <span className="inline-block rounded-badge bg-surface-float px-2 py-0.5 text-2xs font-bold text-ink-secondary">비인증 매장</span>
      <p className="text-xs leading-relaxed text-ink-secondary">
        운영자 인증을 받으면 포스터가 승인 없이 즉시 게시되고, 매장 목록 상단에 인증 배지와 함께 우선 노출됩니다. 인증은 운영자가 검토 후 부여합니다.
      </p>
    </div>
  );
}
