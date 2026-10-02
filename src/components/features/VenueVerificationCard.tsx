import { useEffect, useState } from 'react';
import { getAllVenues, getMyVenue, type Venue } from '../../api/community';
import { venueHiddenFromGuests } from '../../lib/venueHidden';

/**
 * 업주 마이페이지 상단 — 매장 인증 등급 표시(인증 부여는 관리자 전용) + 숨김 상태 안내(S-06).
 *
 * venueId 를 주면 **지금 고른 매장**을 읽는다. 예전엔 owner_id 로 첫 매장 하나만 읽어(getMyVenue)
 * 매장이 여럿인 업주는 다른 매장의 등급을 봤다. showVerification=false 면 숨김 안내만(공동 운영자·직원).
 */
// part — 2026-10-02(감사 H-2): 'hidden' = 숨김 경고만(전 메뉴 상단), 'grade' = 인증 등급만(대시보드 판 안). 기본 'all' 은 종전 그대로.
export default function VenueVerificationCard({ venueId, showVerification = true, part = 'all' }: { venueId?: string | null; showVerification?: boolean; part?: 'all' | 'hidden' | 'grade' } = {}) {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;   // 매장 전환 중 앞 매장 응답이 늦게 와서 덮지 않게
    setLoading(true);
    const load = venueId ? getAllVenues().then((vs) => vs.find((v) => v.id === venueId) ?? null) : getMyVenue();
    load.then((v) => { if (alive) setVenue(v); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [venueId]);

  if (loading || !venue) return null;
  const status = venue.verificationStatus ?? 'unverified';
  // S-06(2026-10-01) — 숨김(status ≠ active)이면 서버 RLS 가 손님 화면의 일정·매장·로그인 안 한 TV 클락을 가린다
  //   (venue_is_hidden · schedules_select · clock_states_public_read · venues_select). 업주 화면엔 그 사실이 0곳에 표시돼
  //   '즉시 게시됩니다' 를 본 채 포스터를 계속 올렸다. 순위 기록은 유지된다(오너 결정 '매장 자체는 숨기고 순위 유지').
  //   해제는 관리자만(admin_set_venue_archived) — 업주에게 버튼을 주지 않고 문의로 안내한다.
  const hidden = venueHiddenFromGuests(venue.status);
  const hiddenBand = hidden ? (
    <div role="status" data-testid="venue-hidden-band" className="rounded-card border border-danger/40 bg-danger/10 px-3 py-2.5">
      <p className="text-sm font-bold text-danger-light">이 매장은 숨김 상태입니다</p>
      <p className="mt-0.5 t-desc break-keep text-ink-secondary">
        손님 화면(매장·포스터·일정)과 로그인하지 않은 TV 클락에 보이지 않습니다. 새로 등록한 포스터도 손님에게 보이지 않습니다.
        장부·클락·순위 기록은 그대로 쓰고 남습니다. TV 는 매장 계정(업주·장부 권한)으로 로그인하면 송출됩니다. 해제는 운영자에게 문의하세요.
      </p>
    </div>
  ) : null;
  if (part === 'hidden') return hiddenBand;
  if (part === 'grade' && (hidden || !showVerification)) return null;
  if (!showVerification) return hiddenBand;
  if (hidden) return hiddenBand;   // 숨김이면 '즉시 게시됩니다' 류 안내는 거짓이 된다 — 숨김 안내만.

  if (status === 'verified') {
    return (
      <div className="flex items-center gap-2 rounded-card border-2 border-accent-300 bg-accent-300/8 px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-300 text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-accent-300">인증 매장</p>
          <p className="text-2xs text-ink-secondary">포스터(요강)가 관리자 승인 없이 즉시 게시됩니다.</p>
        </div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="rounded-card border border-amber-500/40 bg-amber-500/8 px-3 py-2.5">
        <p className="text-sm font-bold text-amber-400">인증 심사 중</p>
        <p className="mt-0.5 text-2xs text-ink-muted">관리자가 인증을 검토하고 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-aura border card-aura p-3">
      <span className="inline-block rounded-badge bg-surface-float px-2 py-0.5 text-2xs font-bold text-ink-secondary">비인증 매장</span>
      {/* 12.75px 설명문의 행간 정본은 t-desc(19.13 = 1.5배) 하나다 — leading-relaxed 는 20.72 라
          같은 크기 설명문이 두 리듬으로 갈렸다(SectionHeader 가 이미 같은 이유로 t-desc 로 통일돼 있다). */}
      <p className="t-desc break-keep text-ink-secondary">
        인증받으면 포스터 즉시 게시 · 목록 상단 우선 노출. (관리자 검토 후 부여)
      </p>
    </div>
  );
}
