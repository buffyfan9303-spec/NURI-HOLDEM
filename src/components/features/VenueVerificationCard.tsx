import { useEffect, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { getMyVenue, requestVenueVerification, type Venue } from '../../api/community';

/** 업주 마이페이지 상단 — 매장 인증 등급 + 인증 신청 */
export default function VenueVerificationCard() {
  const toast = useToast();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    getMyVenue().then(setVenue).catch(() => {}).finally(() => setLoading(false));
  }, [tick]);

  if (loading || !venue) return null;
  const status = venue.verificationStatus ?? 'unverified';

  const submit = async () => {
    setSubmitting(true);
    try {
      await requestVenueVerification(venue.id);
      toast.show('인증을 신청했습니다. 관리자 심사 후 인증됩니다.', 'success');
      setTick((t) => t + 1);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '신청에 실패했습니다', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'verified') {
    return (
      <div className="flex items-center gap-2 rounded-card border-2 border-gold-300 bg-gold-300/[0.08] px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-300 text-ink-inverse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gold-300">인증 매장</p>
          <p className="text-2xs text-ink-muted">포스터(요강)가 관리자 승인 없이 즉시 게시됩니다.</p>
        </div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="rounded-card border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2.5">
        <p className="text-sm font-bold text-amber-400">인증 심사 중</p>
        <p className="mt-0.5 text-2xs text-ink-muted">제출하신 인증 서류를 관리자가 검토하고 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-card border border-border-default bg-surface-low p-3">
      <span className="inline-block rounded-badge bg-surface-float px-2 py-0.5 text-2xs font-bold text-ink-secondary">비인증 매장</span>
      <p className="text-xs leading-relaxed text-ink-secondary">
        인증 매장으로 승급하고 포스터를 즉시 업로드하세요! 인증되면 포스터가 관리자 승인 없이 바로 게시됩니다.
      </p>
      <button type="button" onClick={submit} disabled={submitting} className="btn-primary w-full disabled:opacity-60">
        {submitting ? '신청 중…' : '인증 서류 제출하기'}
      </button>
    </div>
  );
}
