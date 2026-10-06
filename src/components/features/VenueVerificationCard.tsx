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
/** reserve — 등급 칸(대시보드 판 안 · part='grade' 전용)을 **세 등급 카드를 한 칸에 겹쳐 세운 격자**로 그린다.
 *  확인 중엔 셋 다 보이지 않게 두고 뼈대로 덮고, 정해지면 그 등급만 보인다 — 칸 높이는 늘 셋 중 가장 큰 카드 높이다.
 *  2026-10-06 store-p3-1006: 조회가 끝날 때 카드(60px + 아래 여백 12)가 판 맨 위에 늦게 끼어들어 대시보드 전체가 72px 밀렸다
 *  (1440 첫 로드 rAF 실측 1200→1272). 인증 카드 한 장 높이로만 예약하면 좁은 폭에서 설명이 두 줄인 비인증 카드(390 이하 76px)가
 *  +16 자랐다(독립 검토 P2) — 겹쳐 세우면 폭과 등급에 상관없이 확인 중 = 정착 높이다.
 *  숨김 매장(등급 카드 없음)은 정착 때 자리가 접힌다 — 숨김 여부도 같은 조회(venues)에서야 알 수 있어 확인 전엔 모른다. */
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
  if (loading && reserve && part === 'grade' && showVerification) return gradeSlot(null, false);
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

  const grade: Grade = status === 'verified' ? 'verified' : status === 'pending' ? 'pending' : 'unverified';
  return reserve && part === 'grade' ? gradeSlot(grade, venue.isPaidAd) : gradeCard(grade, '', venue.isPaidAd);
}

type Grade = 'verified' | 'pending' | 'unverified';
const GRADES: readonly Grade[] = ['verified', 'pending', 'unverified'];

/** 등급 칸 — 세 카드를 같은 격자 칸(1/1)에 겹쳐 세워 칸 높이 = 셋 중 최대(폭마다 다르다). shown 만 보이고, null 이면 확인 중 뼈대. */
function gradeSlot(shown: Grade | null, paid?: boolean) {
  return (
    <div className="grid" aria-busy={shown == null || undefined}>
      {GRADES.map((g) => (
        <div key={g} style={{ gridArea: '1 / 1', ...(g === shown ? null : { visibility: 'hidden' as const }) }} aria-hidden={g === shown ? undefined : true}>
          {/* 숨은 인증 카드는 더 긴 프리미엄 문구로 세워 둔다 — 확인 중 높이가 정착 높이보다 작아지지 않게. */}
          {gradeCard(g, 'h-full', g === shown ? paid : true)}
        </div>
      ))}
      {shown == null && <span aria-hidden className="skeleton rounded-card" style={{ gridArea: '1 / 1' }} />}
    </div>
  );
}

/** 등급 카드 셋 — 같은 두 줄 틀(제목 text-sm + 설명 text-2xs, 위아래 py-2.5). 칸에 늘려 세울 때(h-full)는 세로 가운데. */
function gradeCard(g: Grade, fill = '', paid?: boolean) {
  if (g === 'verified') {
    return (
      <div className={`flex items-center gap-2 rounded-card border border-border-default bg-surface-low px-3 py-2.5 ${fill}`}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-primary">인증 매장</p>
          {/* 즉시 게시는 인증이 아니라 **기간 안 프리미엄 매장**만이다 — 서버 auto_approve_verified_poster(20261002h, 오너 10-02 A).
              isPaidAd 는 기간이 지나면 거짓으로 읽힌다(communityCore). 10회차 실연(2026-10-06): 인증 매장인데 '즉시 게시' 라고 약속했다. */}
          <p className="text-2xs text-ink-secondary">{paid
            ? '프리미엄 매장 — 포스터(요강)가 관리자 승인 없이 바로 공개됩니다.'
            : '포스터(요강)는 관리자 승인 후 공개됩니다.'}</p>
        </div>
      </div>
    );
  }
  if (g === 'pending') {
    return (
      <div className={`flex flex-col justify-center rounded-card border border-amber-500/40 bg-amber-500/8 px-3 py-2.5 ${fill}`}>
        <p className="text-sm font-bold text-amber-400">인증 심사 중</p>
        <p className="text-2xs text-ink-muted">관리자가 인증을 검토하고 있습니다.</p>
      </div>
    );
  }
  return (
    <div className={`flex flex-col justify-center rounded-aura border card-aura px-3 py-2.5 ${fill}`}>
      <p className="text-sm font-bold text-ink-secondary">비인증 매장</p>
      <p className="break-keep text-2xs text-ink-secondary">
        인증받으면 인증 배지 · 목록 상단 우선 노출 · 공식 결과 기록지(지류) 발급. (관리자 검토 후 부여)
      </p>
    </div>
  );
}
