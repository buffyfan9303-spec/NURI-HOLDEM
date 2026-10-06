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
/** off — 조회 상태는 들고 있되 아무것도 그리지 않는다(E3 M-1: 메뉴를 오갈 때 다시 마운트·재조회하며 늦게 생기지 않게, DOM 사본도 남기지 않게). */
/** reserve — 확인 중에 '인증 매장' 카드와 같은 틀을 보이지 않게 세워 자리를 잡아 둔다(대시보드 판 안 · part='grade' 전용).
 *  2026-10-06 store-p3-1006: 조회가 끝날 때 카드(60px + 아래 여백 12)가 판 맨 위에 늦게 끼어들어 대시보드 전체가 72px 밀렸다
 *  (1440 첫 로드 rAF 실측 1200→1272). 세 등급 카드는 같은 두 줄 틀(제목 text-sm + 설명 text-2xs, 위아래 py-2.5)이라 높이가 같다.
 *  숨김 매장(등급 카드 없음)만 정착 때 자리가 접힌다 — 숨김은 드문 관리자 조치다. */
export default function VenueVerificationCard({ venueId, showVerification = true, part = 'all', off = false, reserve = false }: { venueId?: string | null; showVerification?: boolean; part?: 'all' | 'hidden' | 'grade'; off?: boolean; reserve?: boolean } = {}) {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;   // 매장 전환 중 앞 매장 응답이 늦게 와서 덮지 않게
    setLoading(true);
    const load = venueId ? getAllVenues().then((vs) => vs.find((v) => v.id === venueId) ?? null) : getMyVenue();
    load.then((v) => { if (alive) setVenue(v); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [venueId]);

  if (off) return null;
  if (loading && reserve && part === 'grade' && showVerification) {
    return (
      <div className="relative" aria-busy="true">
        <div aria-hidden style={{ visibility: 'hidden' }}>{verifiedCard()}</div>
        <span aria-hidden className="skeleton absolute inset-0 rounded-card" />
      </div>
    );
  }
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

  if (status === 'verified') return verifiedCard();

  // 세 등급 카드는 **같은 두 줄 틀**(제목 text-sm 22 + 설명 text-2xs 16, 위아래 py-2.5)이다 — 확인 중 자리 예약(reserve)이
  //   인증 카드 틀로 재므로, 등급이 무엇으로 정해져도 높이가 같아야 판이 안 움직인다(2026-10-06 store-p3-1006).
  if (status === 'pending') {
    return (
      <div className="rounded-card border border-amber-500/40 bg-amber-500/8 px-3 py-2.5">
        <p className="text-sm font-bold text-amber-400">인증 심사 중</p>
        <p className="text-2xs text-ink-muted">관리자가 인증을 검토하고 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-aura border card-aura px-3 py-2.5">
      <p className="text-sm font-bold text-ink-secondary">비인증 매장</p>
      <p className="break-keep text-2xs text-ink-secondary">
        인증받으면 포스터 즉시 게시 · 목록 상단 우선 노출. (관리자 검토 후 부여)
      </p>
    </div>
  );
}

/** 인증 매장 카드 — 등급 카드 셋의 기준 틀(확인 중 자리 예약도 이 틀을 보이지 않게 세워 잰다). */
function verifiedCard() {
  return (
    <div className="flex items-center gap-2 rounded-card border border-border-default bg-surface-low px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-primary">인증 매장</p>
        <p className="text-2xs text-ink-secondary">포스터(요강)가 관리자 승인 없이 즉시 게시됩니다.</p>
      </div>
    </div>
  );
}
