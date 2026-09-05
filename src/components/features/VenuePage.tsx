import { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { goSubTab } from '../../lib/subTabTransition';
import { onColorInkClass } from '../../lib/color';
import { Map, MapMarker, useKakaoLoader } from 'react-kakao-maps-sdk';
import {
  naverMapConfigured, naverMapState, onNaverMapState, loadNaverMaps, naverMaps, geocodeAddress, probeNaverAuth,
  type NaverMapState,
} from '../../lib/naverMap';
import CommentThread from './CommentThread';
import RotiArenaLogo from '../atoms/RotiArenaLogo';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import type { Venue, Comment, VenueContact } from '../../api/community';
import type { Schedule } from '../../api/schedules';
import type { MarketplaceNotice } from '../../api/marketplace';
import { useAuth } from '../../contexts/AuthContext';
import { setVenueCoords, followVenue, unfollowVenue, getMyFollowedVenueIds, updateVenueContact, venueContacts } from '../../api/community';
import { getVenueNotices, createVenueNotice, deleteVenueNotice, type VenueNotice } from '../../api/community';
import { getVenueRatings } from '../../api/reviews';
import { getVenueMessages, sendVenueMessage, deleteVenueMessage, subscribeVenueMessages, type VenueMessage } from '../../api/community';
import Avatar from '../atoms/Avatar';
import EmptyState from '../atoms/EmptyState';
import { SkeletonList } from '../atoms/Skeleton';
import { relativeTime } from './MarketplaceTab';
import { promptLogin } from '../../lib/requireLogin';
import { checkIn, getMyCheckinStreak } from '../../api/checkins';
import { myVisitedVenues } from '../../api/vouchers';
import { scheduleStatus } from '../../lib/scheduleStatus';
import { thumbUrl } from '../../lib/imageUrl';
import CoachMark from '../atoms/CoachMark';
import {
  getVenueRankings, getVenueRankingTotals, subscribeRankings, rankDisplay, getVenueRealNameOptIns,
  getVenuePageConfig, getScoreEntries, getVenuePlayerCounts,
  boardLabel, boardDesc, boardUnit, isCustomBoard, customKeyOf, boardPeriodStart,
  DEFAULT_RANK_METRICS, RANK_METRIC_LABEL,
  type RankingEntry, type RankingTotal, type VenuePageConfig, type RankBoardId, type ScoreEntry, type PlayerCounts,
} from '../../api/rankings';
import { listVenueCheckins } from '../../api/checkins';
import { uploadVenueImages } from '../../lib/storage';
import { useBackClose } from '../../lib/backstack';
import { lockScroll, unlockScroll } from '../../lib/scrollLock';
import VenueReviews from './VenueReviews';
import { PhoneActionButton, KakaoActionButton, KakaoChatRow, ContactRows } from './ContactActions';
import ContactListEditor from './VenueContactFields';
import { cleanContacts, ensureOneContact } from '../../lib/venueContacts';
import QrScanModal from './QrScanModal';
import SeasonPanel from './SeasonPanel';
import { getVenuesSeasonLeaders, type SeasonLeader } from '../../api/seasons';
import SlidingPill from '../atoms/SlidingPill';

interface VenuePageProps {
  venue: Venue | null;
  open: boolean;
  onClose: () => void;
  schedules: Schedule[];
  comments: Comment[];
  /** 포스터 탭의 '금일 포스터'에 함께 노출할 공지글 */
  notices?: MarketplaceNotice[];
  onSubmitComment: (venueId: string, content: string, parentId?: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onUpdateDescription?: (venueId: string, description: string) => void;
  onUpdateImage?: (venueId: string, dataUrl: string) => void;
  onUpdateImages?: (venueId: string, urls: string[]) => void;
  /** 포스터/진행예정 클릭 시 일정 상세 열기 */
  onSelectSchedule?: (s: Schedule) => void;
  /** Tier3 '내 활동'에서 이용권·포인트 지갑(내 정보) 열기 */
  onOpenWallet?: () => void;
}

type Tab = 'about' | 'ranking' | 'posters' | 'schedules' | 'community';
const TABS: Tab[] = ['about', 'ranking', 'posters', 'schedules', 'community'];

const TAB_LABEL: Record<Tab, string> = {
  about:     '매장 소개',
  ranking:   '순위',
  posters:   '포스터',
  schedules: '진행 예정',
  community: '커뮤니티',
};

/**
 * VenuePage — 풀스크린 매장 홈페이지
 *
 * 모달 대신 페이지 전환 방식:
 * - 헤더 sticky (back arrow + 매장명)
 * - 히어로 영역 (배경 이미지 업로드 가능)
 * - 탭바 sticky (고정 grid-cols-3)
 * - 탭 컨텐츠는 일반 스크롤
 * - 브라우저 뒤로가기 지원 (popstate)
 */
export default function VenuePage({
  venue, open, onClose, schedules, comments, notices = [],
  onSubmitComment, onDeleteComment, onUpdateDescription, onUpdateImage, onUpdateImages,
  onSelectSchedule, onOpenWallet,
}: VenuePageProps) {
  const [tab, setTabState] = useState<Tab>('about');
  const { user, isApprovedOwner } = useAuth();
  const toast = useToast();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // 매장 별점(방문 후기 평균) — 매장명 옆 ⭐
  const [rating, setRating] = useState<{ avg: number; count: number } | null>(null);
  useEffect(() => {
    setRating(null);
    if (!venue?.id) return;
    let alive = true;
    getVenueRatings().then((m) => { if (alive) setRating(m[venue.id] ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, [venue?.id]);

  // Tier1 요약·Tier3 게이트용 내 활동(연속 출석·이 매장 방문 횟수) — 로그인 시 1회
  const [myAct, setMyAct] = useState<{ streak: number; visits: number } | null>(null);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [qrScanOpen, setQrScanOpen] = useState(false);
  useEffect(() => {
    setMyAct(null);
    if (!user || !venue?.id) return;
    let alive = true;
    Promise.all([getMyCheckinStreak().catch(() => 0), myVisitedVenues().catch(() => [])])
      .then(([streak, visited]) => {
        if (!alive) return;
        const mine = visited.find((v) => v.venueId === venue.id);
        setMyAct({ streak, visits: mine?.visits ?? 0 });
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, venue?.id]);

  // 업주가 설정한 탭 순서(page_config.tabOrder) — 미설정 시 기본 순서
  const [tabOrder, setTabOrder] = useState<Tab[] | null>(null);
  useEffect(() => {
    setTabOrder(null);
    if (!venue?.id) return;
    let alive = true;
    getVenuePageConfig(venue.id).then((c) => {
      if (!alive || !c?.tabOrder?.length) return;
      const valid = c.tabOrder.filter((t): t is Tab => (TABS as string[]).includes(t));
      if (valid.length) setTabOrder([...valid, ...TABS.filter((t) => !valid.includes(t))]);
    }).catch(() => {});
    return () => { alive = false; };
  }, [venue?.id]);
  const orderedTabs = tabOrder ?? TABS;

  /**
   * 탭 전환에 방향성 View Transition 을 건다(2026-08-29 오너 지적:
   * "대메뉴 아래 소메뉴들에 부드러운 모션이 아무것도 적용이 안 되어 있다").
   * 여태 setTab 만 불러서 내용이 즉시 갈아끼워졌다 — 대메뉴·커뮤니티 서브탭과 문법이 달랐다.
   *
   * 조리법은 CommunityTab.setSection 과 동일하게 맞춘다:
   *   ① 진열 순서로 forward/back 을 정해 밀리는 방향이 손가락 방향과 맞게 하고
   *   ② 전환 동안만 탭바에 자기 스냅샷 이름을 줘(vtScope) 본문만 크로스페이드되게 한다.
   *      상시 name 이면 페이지를 닫을 때 탭바 스냅샷이 얼어붙는 잔상이 생긴다(실측된 함정).
   *   ③ 마커 해제는 전환이 실제로 끝난 뒤(finished) — goSubTab/withViewTransition 이 맡는다.
   *      고정 타이머는 느린 기기에서 전환보다 먼저 끝나 root 가 blur 로 밀렸다(2026-09-05 실측).
   */
  const setTab = useCallback((next: Tab) => {
    goSubTab('venue-tab', orderedTabs, tab, next, () => setTabState(next));
  }, [tab, orderedTabs]);

  // 배경 스크롤 잠금 (페이지가 열려있는 동안) — 뷰포트 스크롤러는 html이라 공용 유틸 사용
  useEffect(() => {
    if (!open || !venue) return;
    lockScroll();
    return () => { unlockScroll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, venue?.id]);

  // 브라우저/모바일 뒤로가기 → 매장 페이지만 닫기 (중앙 back-stack 매니저가 중첩/충돌 처리)
  useBackClose(!!open && !!venue, onClose);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 승인(approved)된 포스터만 매장 페이지에 노출 — 미승인은 「내 포스터」에서만 관리.
  const venueSchedules = useMemo(
    () => (venue ? schedules.filter((s) => s.venueId === venue.id && s.approved) : []),
    [venue, schedules],
  );

  /**
   * 배너(히어로 슬라이드) 탭 → 그 사진이 포스터인 대회 상세로.
   * 매장 배너는 실제로 대회 포스터다 — venue.images 의 URL 이 schedules.poster_url 과
   * 같은 값으로 들어 있다. 그래서 사진 하나가 곧 대회 하나를 가리킨다.
   * 같은 포스터를 여러 회차가 쓰는 경우가 있어(로티 1000GTD 는 5회차가 공유) **가장 임박한
   * 진행 예정 회차**를 고른다 — 지난 회차로 보내면 유저가 '끝난 대회'를 보게 된다.
   * 매칭이 없으면(로고 사진 등) 아무 일도 하지 않는다 — 없는 곳으로 보내는 것보다 낫다.
   */
  const openScheduleByPoster = useCallback((src: string) => {
    if (!src || !onSelectSchedule) return;
    const same = venueSchedules.filter((s) => s.posterUrl === src);
    if (same.length === 0) return;
    const now = Date.now();
    const upcoming = same
      .filter((s) => new Date(`${s.date}T${s.startTime || '00:00'}`).getTime() >= now)
      .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
    onSelectSchedule(upcoming[0] ?? same[same.length - 1]);
  }, [venueSchedules, onSelectSchedule]);
  const venueComments = useMemo(
    () => (venue ? comments.filter((c) => c.venueId === venue.id) : []),
    [venue, comments],
  );
  // 금일 포스터 — 오늘 날짜(YYYY-MM-DD)와 일치하는 매장 포스터
  const todayPosters = useMemo(() => {
    const todayIso = new Date().toLocaleDateString('en-CA');
    return venueSchedules.filter((s) => s.date === todayIso);
  }, [venueSchedules]);

  if (!open || !venue) return null;

  const isMyVenue = isApprovedOwner && user?.venueId === venue.id;
  const isRoti    = venue.id === 'v_roti';
  // 카카오톡 링크의 정본은 「내 매장 → 매장 설정 → 매장 페이지」(VenueCustomizePanel). 예전 window.prompt 편집은 제거.
  const kakao     = (venue.kakaoUrl ?? '').trim();
  // Tier1 [QR 체크인] — 오너 리포트(2026-08-27): 버튼이 스캔 없이 즉시 체크인되던 결함 교정.
  // '체크인'은 매장에 실제로 왔다는 증명 — 버튼은 스캐너 모달만 열고, 체크인 RPC(doCheckin)는
  // 매장 비치 QR(?checkin=<venueId>) 스캔 검증 후에만 실행된다. 딥링크 자동 체크인은 App.tsx 보존.
  const openQrScan = () => {
    if (!user) { toast.show('로그인 후 체크인할 수 있습니다', 'error'); promptLogin(); return; }
    if (checkinBusy) return;
    setQrScanOpen(true);
  };
  const doCheckin = async () => {
    if (!user) { toast.show('로그인 후 체크인할 수 있습니다', 'error'); promptLogin(); return; }
    if (checkinBusy) return;
    setCheckinBusy(true);
    try {
      const name = await checkIn(venue!.id);
      const streak = await getMyCheckinStreak().catch(() => 0);
      // ICON-2(오너 지시 2026-08-29): 토스트는 문자열만 받으므로 아이콘을 넣을 수 없다 →
      // 이모지를 그냥 뺀다. 'success' 톤(초록)이 이미 축하 신호라 🎉 는 중복이었고,
      // 🔥 는 OS 마다 다른 그림으로 떠서 통제가 안 됐다(같은 이유로 본문 전역에서 제거).
      const fire = streak >= 2 ? ` · ${streak}일 연속` : '';
      const bonus = streak > 0 && streak % 7 === 0 ? ' · 7일 연속 보너스 +10점!' : '';
      // 16-4 성공 = 다음 여정의 출발점: 오늘 대회가 있으면 바로 열어볼 수 있게.
      toast.show(`${name || venue!.name} 체크인 완료! 출석 도장 +3점${fire}${bonus}`, 'success',
        todayPosters.length > 0 ? { action: { label: '오늘 대회 보기', onClick: () => onSelectSchedule?.(todayPosters[0]) } } : undefined);
      setMyAct((cur) => (cur ? { ...cur, streak } : { streak, visits: 0 }));
    } catch (e) { toast.show(e instanceof Error ? e.message : '체크인 실패', 'error'); }
    finally { setCheckinBusy(false); }
  };
  const shareVenue = async () => {
    // 단축 + 카톡 미리보기: /s/<커스텀 슬러그 또는 8자리> → 봇은 OG 카드, 사람은 /?v= 앱으로.
    const url = `${location.origin}/s/${venue.slug || venue.id.slice(0, 8)}`;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((navigator as any).share) await (navigator as any).share({ title: venue.name, text: `${venue.name} · 홀덤펍`, url });
      else { await navigator.clipboard.writeText(url); toast.show('매장 링크를 복사했습니다', 'success'); }
    } catch { /* 사용자 취소 */ }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${venue.name} 매장 페이지`}
      className="fixed inset-0 z-40 bg-surface-base flex flex-col animate-slide-up pt-[env(safe-area-inset-top)]"
      style={{ animationDuration: '0.25s' }}
    >
      {/* ── 최상단: 뒤로가기 헤더 ──────────────────────────────────────── */}
      {/* 헤더 배경·구분선은 전폭(상시 크롬), 내용물은 본문과 같은 중앙 컬럼(max-w-3xl)에 정렬한다.
          PC 실측 2026-08-29: 헤더만 full-bleed 라 1440 에서 [뒤로]는 화면 맨 왼쪽, [팔로우·공유]는
          맨 오른쪽, 본문은 가운데 768px — 시선이 세 갈래로 찢어졌다. 폭만 맞추면 한 축으로 모인다. */}
      <header className="shrink-0 sticky top-0 z-30 h-header-h bg-surface-base border-b border-border-subtle">
        <div className="mx-auto flex h-full w-full max-w-3xl items-center px-page-x">
        <button
          type="button"
          onClick={onClose}
          aria-label="뒤로 가기"
          className="w-11 h-11 -ml-2 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors"
        >
          <Icon name="back" size={22} />
        </button>
        <h1 className="ml-1 text-sm font-semibold text-ink-primary truncate flex-1">
          {venue.name}
        </h1>
        {isMyVenue && (
          <span className="ml-2 shrink-0 inline-block px-1.5 py-0.5 text-2xs font-bold rounded-badge bg-accent-300 text-white">
            내 매장
          </span>
        )}
        {/* Phase 10: 팔로우·공유를 헤더로 — 히어로는 '지금 필요한 행동' 4개만 남긴다 */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <FollowButton venueId={venue.id} followerCount={venue.followerCount} compact />
          {/* 공유 글리프는 손으로 그린 인라인 SVG(stroke 1.9)였다 — 옆 아이콘(stroke 2)과 굵기가
              갈려 '아이콘이 섞여 보이는' 원인이었다. 레지스트리 share 로 통일(ICON-2). */}
          <button type="button" onClick={shareVenue} aria-label="매장 링크 공유"
            className="hit w-9 h-9 flex items-center justify-center rounded-full text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors">
            <Icon name="share" size={17} />
          </button>
        </div>
        </div>
      </header>

      {/* QR 스캐너 — 스캔으로 이 매장의 체크인 QR 이 확인된 뒤에만 doCheckin 실행 */}
      <QrScanModal
        open={qrScanOpen}
        onClose={() => setQrScanOpen(false)}
        venueId={venue.id}
        venueName={venue.name}
        onMatch={() => { setQrScanOpen(false); void doCheckin(); }}
      />

      {/* ── 스크롤 컨테이너 ────────────────────────────────────────────── */}
      {/* 모바일 하단 탭바(z-50)가 이 오버레이(z-40) 위에 떠 있으므로 마지막 콘텐츠가 가려지지 않게 하단 여백 확보 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-[var(--tabbar-safe)] lg:pb-0">
        {/* PC 에서 전체 폭으로 퍼져 공백이 과해지지 않도록 중앙 컬럼(최대 768px)으로 제한 */}
        <div className="mx-auto w-full max-w-3xl">

        {/* 히어로 (배경 이미지) */}
        <HeroSection
          venue={venue}
          editable={isMyVenue}
          onUpdateImage={onUpdateImage}
          onUpdateImages={onUpdateImages}
          showRotiMark={isRoti}
          onSlideTap={openScheduleByPoster}
        />

        {/* 매장 아이덴티티 — 오버랩 로고 아바타 + 중앙 정렬 + 3-스탯 행(오너 레퍼런스 2026-08-27).
            대표 이미지(image_url)를 원형 아바타로 재사용 — 새 fetch 0. 스탯 행은 비인터랙티브라
            venue-ia 첫 뷰포트 행동 예산(≤6)에 셈되지 않는다. */}
        <div className="px-page-x pb-3 border-b border-border-subtle">
          {/* relative: HeroSection(positioned)이 static 아바타 위에 페인트돼 로고 상반이
              히어로에 가려 반원으로 잘렸다(PC 점검 2026-08-28) — 오버랩 의도(-mt-8·border 링)대로 위로.
              72→64px: 375×667 실측에서 Tier1 행동 행이 하단 탭바에 덮여 있었다(아래 주석 참조). */}
          <div className="relative -mt-8 mb-1.5 flex justify-center">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-4 border-surface-base bg-surface-high shadow-dialog">
              {venue.imageUrl ? (
                <img src={thumbUrl(venue.imageUrl, 144) ?? venue.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-ink-secondary">{venue.name[0]}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="mb-1 flex flex-wrap items-center justify-center gap-1.5">
              <span className="inline-flex items-center px-2 py-[3px] leading-none text-2xs font-semibold rounded-badge bg-surface-high text-ink-secondary">
                {venue.region}
              </span>
              {venue.isPaidAd && (
                <span className="inline-flex items-center px-2 py-[3px] leading-none text-2xs font-bold rounded-badge bg-accent-300 text-white">
                  프리미엄
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-ink-primary">{venue.name}</h2>
            {/* 주소·영업시간은 '갈까 말까'의 1차 판단 재료다 — muted(보조 톤)에서 secondary 로 올리고,
                여태 AboutPanel 접힌 섹션에만 있던 **영업시간을 첫 화면으로 승격**한다.
                (실측 2026-08-29: 손님은 '지금 문 열었나'를 탭 이동 + 아코디언 펼치기 2단계 뒤에야 알 수 있었다.
                 데이터는 기존 venue.businessHours 그대로 — 새 fetch 0, 없는 매장은 줄 자체가 안 생긴다.) */}
            {venue.address && <p className="mt-1 text-xs text-ink-secondary">{venue.address}</p>}
            {venue.businessHours && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-2xs text-ink-muted">
                <Icon name="clock" size={12} className="shrink-0" />
                <span className="whitespace-pre-line">{venue.businessHours}</span>
              </p>
            )}
            {/* 카카오톡 링크는 Tier1 행동 행 + '매장 정보'(AboutPanel) — 아이덴티티 블록은 비인터랙티브 유지 */}
          </div>
          {/* 3-스탯 행 — 팔로워 · 후기 · 오늘 대회.
              아이콘을 숫자 위에서 **숫자 옆으로** 옮겨 3줄(53px)을 2줄(34px)로 접었다. 정보는 동일하고
              세로만 줄어든다 — 그 19px 이 아래 Tier1 행동 행을 하단 탭바 위로 끌어올리는 데 쓰인다. */}
          <div className="mt-2.5 grid grid-cols-3 divide-x divide-border-subtle rounded-aura border card-aura py-2">
            {([
              { icon: 'users' as const, value: (venue.followerCount ?? 0).toLocaleString(), label: '팔로워' },
              { icon: 'star' as const, value: rating && rating.count > 0 ? `${rating.avg.toFixed(1)} (${rating.count})` : '—', label: '방문 후기' },
              { icon: 'trophy' as const, value: String(todayPosters.length), label: '오늘 대회' },
            ]).map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <span className="flex items-center gap-1">
                  <Icon name={s.icon} size={13} className="text-ink-muted" />
                  <span className="text-sm font-bold tabular-nums text-ink-primary">{s.value}</span>
                </span>
                <span className="mt-0.5 text-2xs text-ink-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tier 1: 지금 필요한 행동 (마스터 지시서 Phase 10-1) ──────────────
            매장 상세의 물리적 최종 행동은 '도착을 알리거나(체크인)·걸거나(전화)·묻거나(카카오톡)·
            찾아가는(길찾기)' 것이다 — 스크롤 없이 첫 화면에 있어야 한다. PokerAtlas·러너러너·와홀덤·apis
            4개 서비스 공통으로 최상단은 '지금 무슨 게임이 도는가'다. 존재하는 데이터만 렌더.
            행동 예산(venue-ia ≤6): 체크인+전화+길찾기+카카오=4 + 헤더 팔로우·공유=6 — 여기에 더 추가 금지. */}
        <div className="px-page-x py-2.5 border-b border-border-subtle space-y-2">
          {todayPosters.length > 0 && (() => {
            const t0 = todayPosters[0];
            const st = scheduleStatus(t0.date, t0.startTime);
            return (
              <button type="button" onClick={() => onSelectSchedule?.(t0)}
                className={['w-full flex items-center gap-2.5 rounded-aura border bg-accent-300/[0.06] px-3 py-2.5 text-left hover:bg-accent-300/10 transition-colors',
                  // v6.5 글로우 = '지금 진행 중' 신호(오너 승인 2026-09-02) — live 일 때만. 링 헤어라인이 테두리를 대신하므로 accent 테두리는 낮춘다
                  st === 'live' ? 'border-accent-400/15 ring-aura ring-aura-glow' : 'border-accent-400/30'].join(' ')}>
                <Icon name="flame" size={18} className="shrink-0 text-accent-200" />
                <span className="min-w-0 flex-1">
                  {/* 다크에서 accent-300(#805FDA) 은 surface-base 대비 4.0:1 로 AA 미달이었다(실측).
                      accent-200 은 다크 6.94 · 라이트 5.87 로 양 테마를 통과한다(index.css 의
                      html.light .text-accent-200 오버라이드가 라이트에서 같은 보라를 유지). */}
                  <span className="block text-2xs font-bold text-accent-200">
                    오늘의 대회{todayPosters.length > 1 ? ` 외 ${todayPosters.length - 1}건` : ''}
                  </span>
                  <span className="block truncate text-sm font-bold text-ink-primary">{t0.title}</span>
                  <span className="block text-2xs text-ink-secondary tabular-nums">
                    {t0.startTime} 시작{t0.buyIn?.amount ? ` · 바이인 ${t0.buyIn.amount.toLocaleString()}원` : ''}
                  </span>
                </span>
                <span className={['shrink-0 text-2xs font-bold px-2 py-0.5 rounded-badge',
                  st === 'live' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-surface-high text-ink-secondary'].join(' ')}>
                  {st === 'live' ? '진행중' : st === 'ended' ? '종료' : '예정'}
                </span>
              </button>
            );
          })()}
          {/* ⚠ 375·390 실측(2026-08-29): 이 행은 `flex gap-2` 한 줄이었는데 4개 버튼의 최소 폭 합이
              438px 이라 375 뷰포트에서 scrollWidth 457 > clientWidth 375 — **카카오톡 버튼이 화면 밖으로
              잘려 나가 있었다**(오너가 직접 지목한 행이다). 버튼을 줄이거나 라벨을 깎는 대신
              위계대로 2행으로 쌓는다: 프라이머리(QR 체크인)는 전폭, 보조 3개는 균등 분할.
              행동 개수는 그대로 4개 — 행동 예산(체크인·전화·길찾기·카카오 + 헤더 팔로우·공유 = 6)은 불변.
              보조 행은 `flex` + `flex-1` 이라 전화·주소가 없는 매장에서도 남은 것끼리 자동 균등이 된다
              (grid-cols-3 고정이면 빈 칸이 생긴다). */}
          <div className="space-y-2">
            <button type="button" onClick={openQrScan} disabled={checkinBusy} data-coach="venue-checkin"
              className="btn-primary h-11 w-full text-sm font-bold disabled:opacity-60">
              <Icon name="map-pin" size={16} className="-mt-px" />
              {checkinBusy ? '체크인 중…' : 'QR 체크인'}
            </button>
            <div className="flex gap-2">
            {/* 대표 번호 = 다중 연락처의 첫 항목(신 필드 우선, 없으면 기존 contactPhone 폴백) */}
            <PhoneActionButton phone={venueContacts(venue)[0]?.phone} />
            {venue.address && (
              <a href={`https://map.kakao.com/link/search/${encodeURIComponent(venue.address)}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-input border border-border-default bg-surface-high px-2 text-sm font-semibold text-ink-secondary hover:text-ink-primary transition-colors">
                <Icon name="map" size={16} className="shrink-0" /> 길찾기
              </a>
            )}
            {/* 카카오톡 — 2026-08-29 오너 지시로 **링크가 없어도 항상 보인다**.
                예전엔 링크가 있을 때만 렌더해서, 등록하지 않은 매장에선 버튼이 통째로 사라졌다
                → 업주는 그런 기능이 있는 줄 모르고, 손님은 자리가 비어 행동 4개 정렬이 무너졌다.
                이제 자리는 늘 지키고 상태만 달라진다:
                  · 링크 있음        → 새 탭으로 채팅방
                  · 없음 + 업주 본인 → 바로 등록 프롬프트(발견 → 설정이 한 번에)
                  · 없음 + 손님      → 왜 못 여는지 말해 준다(무반응 클릭 금지)

                ⚠ 2026-08-29 손님 케이스를 버튼 → **비인터랙티브 칩**으로 바꿨다. 종전에는 눌러야
                  '아직 등록 안 했어요' 토스트가 떴다 — 즉 손님에게 이 버튼은 눌러도 아무 데도 못 가는,
                  '없다'는 사실만 알려 주는 컨트롤이었다. 그건 행동이 아니라 상태다. 라벨에 '미등록'을
                  적으면 **누르기 전에** 같은 사실을 알 수 있어 '무반응 클릭 금지' 의도에 더 충실하고,
                  첫 뷰포트 행동 예산(≤6, venue-ia 게이트)도 가짜 행동으로 채우지 않게 된다.
                  자리(오너 지시의 핵심)는 그대로 지킨다 — 업주 본인에게는 여전히 등록 버튼이다. */}
            <KakaoActionButton kakao={kakao} />
            </div>
          </div>
          <CoachMark id="venue-checkin">체크인하면 출석 도장 · 전적 인정 · 방문 후기가 열려요. 하루 한 번이면 충분해요.</CoachMark>
          {user && myAct && (myAct.streak > 0 || myAct.visits > 0) && (
            <p className="flex items-center gap-1 text-2xs text-ink-muted tabular-nums">
              {myAct.streak > 0 && <><Icon name="flame" size={13} className="shrink-0" />연속 출석 <b className="text-ink-secondary">{myAct.streak}일</b></>}
              {myAct.streak > 0 && myAct.visits > 0 && <span aria-hidden>·</span>}
              {myAct.visits > 0 && <>이 매장 방문 <b className="text-ink-secondary">{myAct.visits}회</b></>}
            </p>
          )}
        </div>

        {/* ── Sticky 탭바 ─────────────────────────────────────────── */}
        <div data-venue-tabbar className="sticky top-0 z-20 bg-surface-base border-b border-border-subtle">
          <div className="relative grid grid-cols-5 lg:flex">
            <SlidingPill activeKey={tab} underline className="rounded-full bg-accent-300" />
            {orderedTabs.map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  aria-selected={active}
                  data-pill-active={active || undefined}
                  role="tab"
                  className={[
                    // §T1: 모바일 13px 는 사다리 밖 → text-xs(12.75). PC 는 페이지 주 탭이라 text-sm 유지.
                    'lg:flex-1 whitespace-nowrap px-0.5 lg:px-2 py-3 text-xs lg:text-sm transition-colors text-center relative',
                    // §T1 탭 굵기 규격: 비활성 600 / 활성 700. 굵기는 한쪽만 준다(semibold+bold 동시 지정 시 semibold 가 이긴다).
                    // 활성 색 accent-300 → accent-200: 다크에서 4.0:1(AA 미달)이던 것이 6.94:1 로 올라간다(실측).
                    active ? 'font-bold text-accent-200' : 'font-semibold text-ink-muted hover:text-ink-secondary',
                  ].join(' ')}
                >
                  {TAB_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 탭 컨텐츠 ──────────────────────────────────────────── */}
        {/* data-venue-tabpanel: 전환 때 **이 영역만** 밀리게 하는 표식(index.css).
            어제 붙인 전환은 방향 애니가 root 에 걸려 있어 헤더·히어로·행동 버튼까지 통째로
            움직였다(오너 지적). 이 컨테이너에 자기 스냅샷 이름을 주면 root 에서 분리돼
            위쪽은 정지하고 여기만 슬라이드한다. */}
        <div data-venue-tabpanel className="px-page-x py-4 min-h-[50vh]">
          {tab === 'about' && (
            <div className="space-y-4">
              <SeasonLeaderBanner venueId={venue.id} onRanking={() => setTab('ranking')} />
              <AboutPanel
                venue={venue}
                editable={isMyVenue}
                onUpdateDescription={onUpdateDescription}
                kakao={kakao}
                onCoords={(la, ln) => {
                  // 매장 관리자(또는 admin) 기기이고 좌표 미보유일 때만 조용히 저장 — 거리순 데이터 자급.
                  if ((isMyVenue || user?.role === 'admin') && venue.lat == null) {
                    setVenueCoords(venue.id, la, ln).catch(() => { /* 권한·일시 오류 무시 */ });
                  }
                }}
              />
              <div className="reveal">
                <VenueReviews
                  venueId={venue.id}
                  userId={user?.id ?? null}
                  nickname={user?.nickname ?? null}
                  isAdmin={user?.role === 'admin'}
                  canReply={isMyVenue || user?.role === 'admin'}
                />
              </div>
              {/* ── Tier 3: 내 활동 (Phase 10-1 계층3) ──────────────────────────
                  단골에게만 의미 있는 것들(이용권·포인트·시즌)은 접힌 채로 —
                  처음 온 사용자는 이 블록 자체가 DOM 에 없다(display:none 이 아니라 미렌더).
                  게이트: 로그인 + 활동 이력(연속출석 또는 이 매장 방문 기록). */}
              {user && myAct && (myAct.streak > 0 || myAct.visits > 0) && (
                // data-testid: 이 블록의 존재 여부를 e2e(venue-ia)가 확인한다. 종전 셀렉터는
                // `text=🙋 내 활동` 으로 **이모지에 결합**돼 있었다 — 아이콘으로 바꾸는 순간
                // 항상 0건이 되어 게이트가 조용히 무력화된다. 같은 커밋에서 testid 로 교체(규약).
                <details data-testid="venue-my-activity" className="reveal group rounded-aura border border-border-subtle overflow-hidden">
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-3 py-3 text-sm font-semibold text-ink-primary hover:bg-surface-high/50 transition-colors">
                    <span className="inline-flex items-center gap-1.5"><Icon name="hand" size={16} className="text-ink-muted" />내 활동</span>
                    <Icon name="chevron-down" size={16} className="shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-border-subtle divide-y divide-border-subtle">
                    <button type="button" onClick={onOpenWallet}
                      className="w-full flex items-center justify-between gap-2 px-3 py-3 text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-high/50 transition-colors">
                      <span className="inline-flex items-center gap-1.5"><Icon name="ticket" size={16} className="text-ink-muted" />이용권 · 포인트 관리</span>
                      <Icon name="chevron-right" size={16} className="shrink-0 text-ink-muted" />
                    </button>
                    <button type="button" onClick={() => setTab('ranking')}
                      className="w-full flex items-center justify-between gap-2 px-3 py-3 text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-high/50 transition-colors">
                      <span className="inline-flex items-center gap-1.5"><Icon name="medal" size={16} className="text-ink-muted" />시즌 순위 · 명예의 전당</span>
                      <Icon name="chevron-right" size={16} className="shrink-0 text-ink-muted" />
                    </button>
                  </div>
                </details>
              )}
            </div>
          )}
          {tab === 'ranking' && <><SeasonPanel venueId={venue.id} venueName={venue.name} /><div className="mt-5 border-t border-border-subtle pt-4"><VenueRankingPanel venueId={venue.id} /></div></>}
          {tab === 'posters' && (
            <PostersPanel
              todayPosters={todayPosters}
              allPosters={venueSchedules}
              notices={notices}
              onSelect={onSelectSchedule}
            />
          )}
          {tab === 'schedules' && <SchedulesPanel schedules={venueSchedules} onSelect={onSelectSchedule} />}
          {tab === 'community' && (
            <div className="space-y-3">
              <VenueNoticeBoard venueId={venue.id} canManage={isMyVenue || user?.role === 'admin'} />
              {/* 모든 커뮤니티 공통 구성(그룹과 동일): 실시간 채팅 | 게시판 */}
              <VenueCommunitySection
                venueId={venue.id}
                canManage={isMyVenue || user?.role === 'admin'}
                board={
                  <CommentThread
                    comments={venueComments}
                    onSubmit={(content, parentId) => onSubmitComment(venue.id, content, parentId)}
                    onDelete={onDeleteComment}
                    moderator={isMyVenue}
                    emptyText="이 매장의 첫 게시글(댓글)을 남겨보세요."
                  />
                }
              />
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

// ── 히어로 (배경 이미지 업로드 가능) ──────────────────────────────────────

function HeroSection({
  venue, editable, onUpdateImage, onUpdateImages, showRotiMark, onSlideTap,
}: {
  venue: Venue;
  editable?: boolean;
  onUpdateImage?: (id: string, dataUrl: string) => void;
  onUpdateImages?: (id: string, urls: string[]) => void;
  showRotiMark?: boolean;
  /**
   * 배너를 탭했을 때(2026-08-29 오너 지시: "해당 사진의 게시판으로 갈 수 있게").
   * 매장 배너는 실제로 **대회 포스터**다 — venue.images 의 URL 이 schedules.poster_url 과
   * 같은 값으로 들어 있다(로티아레나 실측). 그래서 '그 사진의 글' = 그 대회 상세다.
   * 매칭되는 대회가 없는 사진(로고 등)이면 호출부가 아무것도 하지 않는다.
   */
  onSlideTap?: (src: string) => void;
}) {
  const bgInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0);
  const toast = useToast();

  const gallery = venue.images ?? [];
  // 갤러리가 있으면 갤러리, 없으면 기존 단일 배경, 그것도 없으면 빈 배열
  const slides = gallery.length > 0 ? gallery : (venue.imageUrl ? [venue.imageUrl] : []);
  const usingGallery = gallery.length > 0;
  const safeIdx = slides.length ? Math.min(idx, slides.length - 1) : 0;

  // 네이버 지도 스타일 자동 슬라이드(이미지 2장 이상). 사용자가 조작하면 잠시 멈춤.
  const pausedUntil = useRef(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setIdx((i) => (i + 1) % slides.length);
    }, 3500);
    return () => clearInterval(t);
  }, [slides.length]);

  // 수동 넘김(스와이프/버튼) — 조작 후 6초간 자동 슬라이드 일시정지
  const go = (n: number) => {
    if (!slides.length) return;
    pausedUntil.current = Date.now() + 6000;
    setIdx(((n % slides.length) + slides.length) % slides.length);
  };
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current; touchRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { go(safeIdx + (dx < 0 ? 1 : -1)); return; }
    // 거의 안 움직였으면 스와이프가 아니라 **탭**이다 — 그 배너가 가리키는 대회로 보낸다.
    // (click 이벤트를 따로 듣지 않는 이유: 스와이프 끝에도 click 이 따라와 오작동한다.)
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) onSlideTap?.(slides[safeIdx]);
  };

  // 단일 배경 업로드(레거시 — 갤러리 없을 때만 노출)
  const handleBgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.show('5MB 이하의 이미지만 업로드 가능합니다', 'error'); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => { onUpdateImage?.(venue.id, ev.target?.result as string); setUploading(false); };
    reader.onerror = () => { toast.show('이미지 읽기에 실패했습니다', 'error'); setUploading(false); };
    reader.readAsDataURL(file);
  };

  // 갤러리 다중 업로드 → 스토리지 → images 배열에 추가
  const handleGalleryChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = '';
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const urls = await uploadVenueImages(venue.id, files);
      onUpdateImages?.(venue.id, [...gallery, ...urls]);
      toast.show('사진을 추가했습니다', 'success');
    } catch {
      toast.show('사진 업로드에 실패했습니다', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeCurrent = () => {
    if (!usingGallery) return;
    onUpdateImages?.(venue.id, gallery.filter((_, k) => k !== safeIdx));
    setIdx(0);
  };

  // 히어로 높이 176→144px(모바일). 375×667 실측에서 첫 화면 세로 예산의 28%를 히어로가 먹었고,
  // 그 결과 Tier1 행동 행(QR 체크인·전화·길찾기·카카오)이 하단 탭바 뒤로 밀려 가려져 있었다.
  // 사진의 존재감이 유지되는 최소선까지만 줄인다(sm 이상은 화면이 크므로 완만하게).
  return (
    <div
      className="relative w-full overflow-hidden h-36 sm:h-48 md:h-56"
      onTouchStart={slides.length > 1 ? onTouchStart : undefined}
      onTouchEnd={slides.length > 1 ? onTouchEnd : undefined}
    >
      {slides.length > 0 ? (
        // 슬라이드 트랙(자동 + 스와이프)
        <div
          className="absolute inset-0 flex transition-transform duration-[var(--dur-panel)] ease-out touch-pan-y select-none"
          style={{ transform: `translateX(-${safeIdx * 100}%)` }}
        >
          {slides.map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt={`${venue.name} 사진 ${i + 1}`}
              draggable={false}
              loading="lazy"
              decoding="async"
              className="h-full w-full shrink-0 object-cover"
            />
          ))}
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, #161922 0%, #0a0c0f 100%)' }}
        >
          {/* 테마 글로우 — 상단 중앙(좌우 대칭) */}
          <div
            aria-hidden
            className="absolute left-1/2 -top-1/4 h-2/3 w-2/3 -translate-x-1/2 rounded-full blur-3xl opacity-25 pointer-events-none"
            style={{ background: venue.themeColor ?? '#3A4253' }}
          />
          {/* 카드 무늬 패턴 */}
          <div className="absolute inset-0 grid grid-cols-6 gap-2 p-3 opacity-[0.06] select-none pointer-events-none" aria-hidden>
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} className="text-2xl text-white text-center">{['♠', '♥', '♦', '♣'][i % 4]}</span>
            ))}
          </div>
          {showRotiMark ? (
            <div className="absolute inset-0 flex items-center justify-center opacity-90">
              <div className="scale-150"><RotiArenaLogo variant="mark" /></div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 select-none pointer-events-none">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold shadow-lg ring-1 ring-white/10 ${onColorInkClass(venue.themeColor ?? '#3A4253')}`}
                style={{ background: venue.themeColor ?? '#3A4253' }}
              >
                {venue.name[0]}
              </div>
              {editable && <p className="text-2xs text-white/55">사진을 추가하면 매장이 더 돋보입니다</p>}
            </div>
          )}
        </div>
      )}

      {/* 그라디언트 오버레이 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 30%, rgba(10,12,15,0.5) 100%)' }}
      />

      {/* 좌/우 넘김 버튼 — PC 전용(Phase 10-1 첫 뷰포트 ≤6 행동 예산).
          모바일은 스와이프 + 자동 슬라이드가 내비게이션을 담당하므로 버튼 2개는 소음이다. */}
      {/* 배너 활성화 — 터치는 onTouchEnd 의 '탭' 판정이 처리하고, 여기는 **마우스·키보드** 몫이다.
          슬라이드마다 버튼을 두면 사진 n장 = 버튼 n개가 되어 보조기술에 n개로 읽힌다.
          한 장만 화면에 있으므로 **버튼 하나**가 현재 슬라이드를 활성화하는 구조로 둔다.
          좌우 화살표(z-10)보다 아래(z-0)에 깔아 화살표 클릭을 가로채지 않는다. */}
      {onSlideTap && (
        <button
          type="button"
          onClick={() => onSlideTap(slides[safeIdx])}
          aria-label={`${venue.name} 배너 · 이 대회 자세히 보기`}
          className="absolute inset-0 z-0 hidden lg:block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-300"
        />
      )}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(safeIdx - 1)}
            aria-label="이전 사진"
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 hidden lg:flex h-8 w-8 items-center justify-center rounded-full bg-surface-base/55 text-ink-primary backdrop-blur transition-colors hover:bg-surface-base/80"
          >
            <Icon name="chevron-left" size={14} />
          </button>
          <button
            type="button"
            onClick={() => go(safeIdx + 1)}
            aria-label="다음 사진"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 hidden lg:flex h-8 w-8 items-center justify-center rounded-full bg-surface-base/55 text-ink-primary backdrop-blur transition-colors hover:bg-surface-base/80"
          >
            <Icon name="chevron-right" size={14} />
          </button>
        </>
      )}

      {/* 슬라이드 점 — 상태 표시기(비인터랙티브). 이동은 스와이프(모바일)·화살표(PC)가 담당 —
          도트를 버튼으로 두면 사진 n장 = 행동 n개가 되어 계층 예산(≤6)이 데이터에 따라 무너진다. */}
      {/* 인디케이터 — 하단 **오른쪽**. 예전엔 하단 중앙이었는데, 히어로 아래 원형 로고 아바타가
          가운데에서 위로 겹쳐 올라오기(-mt-8) 때문에 도트가 아바타에 정면으로 깔렸다
          (2026-08-29 오너 지적: "동그라미 프로필에 겹쳐 스크롤바가 있다").
          아바타는 가운데 정렬이 고정이므로 도트를 옆으로 비키는 게 맞다 — 아바타를 옮기면
          아이덴티티 블록의 중앙 정렬이 깨진다.
          읽힘을 위해 얇은 알약 배경을 깐다(사진이 밝으면 흰 점이 사라져 몇 장인지 알 수 없었다). */}
      {slides.length > 1 && (
        <div
          aria-hidden
          className="absolute bottom-2.5 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/35 px-2 py-1"
        >
          {slides.map((_, i) => (
            <span
              key={i}
              className={['h-1.5 rounded-full transition-[width,background-color]', i === safeIdx ? 'w-5 bg-accent-300' : 'w-1.5 bg-white/60'].join(' ')}
            />
          ))}
        </div>
      )}

      {/* 편집 컨트롤 (업주) */}
      {editable && (
        <div className="absolute top-3 right-3 z-10 flex gap-1.5">
          {!usingGallery && (
            <button
              type="button"
              onClick={() => bgInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-8 items-center gap-1.5 rounded-input bg-surface-base/85 px-3 text-xs font-semibold text-ink-primary backdrop-blur transition-colors hover:bg-surface-high disabled:opacity-50"
            >
              {uploading ? '업로드 중' : (venue.imageUrl ? '배경 변경' : '배경 업로드')}
            </button>
          )}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-input bg-accent-300/90 px-3 text-xs font-bold text-white backdrop-blur transition-colors hover:bg-accent-200 disabled:opacity-50"
          >
            {busy ? '추가 중' : '사진 추가'}
          </button>
        </div>
      )}
      {editable && usingGallery && (
        <button
          type="button"
          onClick={removeCurrent}
          aria-label="현재 사진 삭제"
          className="absolute top-3 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-danger/70"
        >
          <Icon name="close" size={14} />
        </button>
      )}

      <input ref={bgInputRef} type="file" accept="image/*" onChange={handleBgChange} className="hidden" />
      <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={handleGalleryChange} className="hidden" />
    </div>
  );
}

// ── 매장 커뮤니티(그룹과 동일 구성: 실시간 채팅 | 게시판) ─────────────────────
function VenueCommunitySection({ venueId, canManage, board }: { venueId: string; canManage: boolean; board: ReactNode }) {
  const [sub, setSub] = useState<'chat' | 'board'>('chat');
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5">
        {(['chat', 'board'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setSub(t)}
            className={['hit flex-1 py-1.5 text-xs font-bold rounded-[6px] transition-colors',
              sub === t ? 'bg-accent-300 text-white' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
            {t === 'chat' ? '실시간 채팅' : '게시판'}
          </button>
        ))}
      </div>
      {sub === 'chat' ? <VenueChat venueId={venueId} canManage={canManage} /> : board}
    </div>
  );
}

// 매장 실시간 채팅 — 공개 열람, 로그인 시 작성(그룹 채팅과 동일 UX)
function VenueChat({ venueId, canManage }: { venueId: string; canManage: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<VenueMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let active = true;
    getVenueMessages(venueId, 80).then((m) => { if (active) setMessages(m.reverse()); }).catch(() => {});
    const unsub = subscribeVenueMessages(venueId, (m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])));
    return () => { active = false; unsub(); };
  }, [venueId]);
  // scrollIntoView 는 조상 스크롤러까지 끌어내려 페이지 점프 유발 → 채팅 ul 내부만 스크롤
  useEffect(() => { const ul = listRef.current; if (ul) ul.scrollTop = ul.scrollHeight; }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.show('로그인 후 채팅할 수 있습니다', 'error'); promptLogin(); return; }
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const m = await sendVenueMessage(venueId, { userName: user.nickname ?? user.name, userColor: user.avatarColor, content: body });
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setDraft('');
    } catch (err) { toast.show(err instanceof Error ? err.message : '전송 실패', 'error'); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-2">
      <ul ref={listRef} className="space-y-1.5 max-h-[55vh] overflow-y-auto">
        {messages.length === 0 ? <li className="py-8 text-center text-2xs text-ink-muted">이 매장의 첫 메시지를 남겨보세요</li> : messages.map((m) => (
          <li key={m.id} className="flex items-start gap-2">
            <Avatar name={m.userName} color={m.userColor} size={24} className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-2xs">
                <span className="font-semibold text-ink-primary truncate">{m.userName}</span>
                <span className="text-ink-muted ml-auto shrink-0">{relativeTime(m.createdAt)}</span>
                {(canManage || m.userId === user?.id) && (
                  <button type="button" onClick={() => deleteVenueMessage(m.id).then(() => setMessages((p) => p.filter((x) => x.id !== m.id))).catch(() => {})} aria-label="삭제" className="hit shrink-0 text-ink-muted hover:text-danger-light"><Icon name="close" size={12} /></button>
                )}
              </div>
              <p className="text-xs text-ink-primary leading-snug mt-0.5 break-words whitespace-pre-wrap">{m.content}</p>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="flex items-center gap-2">
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500}
          placeholder={user ? '메시지 입력…' : '로그인 후 채팅할 수 있어요'} className="input flex-1" />
        <button type="submit" disabled={sending || !draft.trim()} className="btn-primary px-4 shrink-0 disabled:opacity-50">전송</button>
      </form>
    </div>
  );
}

// ── 팔로우 버튼 ────────────────────────────────────────────────────────────

// 탭 전환 시 깜빡임 방지 — 매장별 마지막 로드 결과 캐시(원격 변경은 백그라운드 갱신, 스켈레톤 미표시).
interface RankPanelCache {
  cfg: VenuePageConfig | null; totals: RankingTotal[]; manual: ScoreEntry[];
  buyinCounts: Record<string, number>; latest: { date: string | null; entries: RankingEntry[] };
  playerCounts: PlayerCounts[]; checkinRows: { name: string; count: number }[]; metric: RankBoardId | null;
}
const rankPanelCache = new globalThis.Map<string, RankPanelCache>();
// 새로고침 후에도 깜빡임 없도록 localStorage에 영속(메모리 우선, 없으면 LS 폴백 → 즉시 표시 후 백그라운드 갱신)
const RANK_LS = (venueId: string) => `nuri:rankcache:${venueId}`;
function readRankCache(venueId: string): RankPanelCache | undefined {
  const mem = rankPanelCache.get(venueId);
  if (mem) return mem;
  try { const s = localStorage.getItem(RANK_LS(venueId)); if (s) { const p = JSON.parse(s) as RankPanelCache; rankPanelCache.set(venueId, p); return p; } } catch { /* noop */ }
  return undefined;
}
function writeRankCache(venueId: string, e: RankPanelCache) {
  rankPanelCache.set(venueId, e);
  try { localStorage.setItem(RANK_LS(venueId), JSON.stringify(e)); } catch { /* noop */ }
}

/** 현 시즌 선두 위젯 — 매장 페이지 상단. 진행 시즌의 1위(닉네임·점수). 탭하면 시즌 랭킹으로. */
function SeasonLeaderBanner({ venueId, onRanking }: { venueId: string; onRanking: () => void }) {
  const [leader, setLeader] = useState<SeasonLeader | null>(null);
  // 오너 #14 — 여기도 순위표다. 실명은 본인이 '실명'을 고른 경우에만 붙인다(기본은 닉네임).
  //   빈 Set 으로 시작하는 게 안전한 기본값이다: 응답 전에는 실명이 아예 그려지지 않는다.
  //   조회는 순위 패널과 같은 캐시를 타므로 매장 페이지당 요청은 1건이다.
  const [optIns, setOptIns] = useState<ReadonlySet<string>>(() => new Set<string>());
  useEffect(() => {
    let alive = true;
    getVenuesSeasonLeaders([venueId]).then((m) => { if (alive) setLeader(m[venueId] ?? null); }).catch(() => {});
    getVenueRealNameOptIns(venueId).then((s) => { if (alive) setOptIns(s); }).catch(() => {});
    return () => { alive = false; };
  }, [venueId]);
  if (!leader) return null;
  return (
    // data-nav="venue-tab": 이 버튼의 행동은 setTab('ranking') 하나 — 매장 페이지 '자기 탭'으로의
    // 셔틀이라 콘텐츠 행동이 아니라 내비게이션 레벨이다(venue-ia 게이트가 role=tab 을 제외하는 것과
    // 동일 근거). 게이트(첫 뷰포트 행동 ≤6)는 이 속성이 붙은 요소를 세지 않는다.
    // ⚠ 이 속성은 '페이지 내부 탭 전환만 하는 요소'에만 허용 — 다른 행동 버튼에 붙이면 게이트 무력화다.
    <button type="button" onClick={onRanking} data-nav="venue-tab"
      className="flex w-full items-center gap-2.5 rounded-aura border border-accent-400/30 bg-accent-300/[0.06] px-3 py-2.5 text-left transition-colors hover:border-accent-400/50 active:scale-[0.99]">
      {/* 종전엔 👑 과 🏆 두 이모지가 같은 카드에 겹쳐 있었다(같은 뜻을 두 번). 왕관 하나만 아이콘으로
          남기고 헤드라인의 트로피는 뺀다 — gold 톤이 이미 '1등'을 말한다. */}
      <Icon name="crown" size={20} className="shrink-0 text-gold-300" />
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-bold text-gold-300">현 시즌 선두 · {leader.seasonName}</p>
        <p className="truncate text-sm font-bold text-ink-primary">{leader.nickname}{leader.realName && optIns.has(leader.nickname.trim().toLowerCase()) ? <span className="text-2xs font-normal text-ink-muted"> ({leader.realName})</span> : null}</p>
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-accent-200">{leader.points}점</span>
      <Icon name="chevron-right" size={14} className="shrink-0 text-ink-muted" />
    </button>
  );
}

function VenueRankingPanel({ venueId }: { venueId: string }) {
  const cached0 = readRankCache(venueId);
  const [cfg, setCfg] = useState<VenuePageConfig | null>(cached0?.cfg ?? null);
  const [metric, setMetric] = useState<RankBoardId | null>(cached0?.metric ?? null);
  const [totals, setTotals] = useState<RankingTotal[]>(cached0?.totals ?? []);
  const [manual, setManual] = useState<ScoreEntry[]>(cached0?.manual ?? []);
  // 주의: 이 파일에 지도용 Map 컴포넌트가 있어 내장 Map 생성이 가려짐 → Record 사용
  const [buyinCounts, setBuyinCounts] = useState<Record<string, number>>(cached0?.buyinCounts ?? {});
  const [latest, setLatest] = useState<{ date: string | null; entries: RankingEntry[] }>(cached0?.latest ?? { date: null, entries: [] });
  const [loading, setLoading] = useState(!cached0); // 캐시 있으면 스켈레톤 없이 바로 표시(깜빡임 제거)

  // 오너 #14 — 이 매장 순위표에서 '실명 표시'를 본인이 고른 닉네임(소문자 키).
  //   RankPanelCache 에 넣지 않는다: Set 은 JSON 직렬화가 안 되고, 무엇보다 **캐시된 동의는 위험하다** —
  //   유저가 실명 공개를 껐는데 localStorage 가 옛 답을 들고 있으면 끈 뒤에도 실명이 계속 뜬다.
  //   매번 새로 받고, 받기 전/실패 시에는 빈 집합 = 전원 닉네임(덜 공개하는 쪽이 안전한 기본값).
  const [realNameOptIns, setRealNameOptIns] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [playerCounts, setPlayerCounts] = useState<PlayerCounts[]>(cached0?.playerCounts ?? []);
  const [checkinRows, setCheckinRows] = useState<{ name: string; count: number }[]>(cached0?.checkinRows ?? []); // QR 출석 집계
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const c = await getVenuePageConfig(venueId).catch(() => null);
        const ms = c?.rankMetrics ?? [];
        const wantsCounts = ms.includes('moneyin_rate') || ms.includes('buyin_count') || ms.includes('visit_count');
        const [t, d, m, optIns] = await Promise.all([
          getVenueRankingTotals(venueId, c),
          getVenueRankings(venueId),
          getScoreEntries(venueId).catch(() => [] as ScoreEntry[]),
          getVenueRealNameOptIns(venueId).catch(() => new Set<string>()),
        ]);
        const pc: PlayerCounts[] = wantsCounts ? await getVenuePlayerCounts(venueId).catch(() => []) : [];
        const bc: Record<string, number> = {};
        for (const p of pc) bc[p.name.toLowerCase()] = p.buyins;
        // 출석왕 = QR 체크인 누적(유저별) — 체크인 기록이 있으면 장부 방문 대신 이걸 쓴다
        let ck: { name: string; count: number }[] = [];
        if (ms.includes('visit_count')) {
          const list = await listVenueCheckins(venueId, '2020-01-01T00:00:00Z').catch(() => []);
          const agg = new globalThis.Map<string, { name: string; count: number }>();
          for (const e of list) {
            const nm = (e.displayName ?? '').trim();
            if (!nm) continue;
            const k = nm.toLowerCase();
            const cAgg = agg.get(k) ?? { name: nm, count: 0 };
            cAgg.count += 1;
            agg.set(k, cAgg);
          }
          ck = [...agg.values()];
        }
        if (!active) return;
        setCfg(c); setTotals(t); setLatest(d); setManual(m); setBuyinCounts(bc); setPlayerCounts(pc); setCheckinRows(ck);
        setRealNameOptIns(optIns);
        setMetric((cur) => cur ?? (c?.rankMetrics?.[0] ?? 'score'));
        writeRankCache(venueId, { cfg: c, totals: t, manual: m, buyinCounts: bc, latest: d, playerCounts: pc, checkinRows: ck, metric: rankPanelCache.get(venueId)?.metric ?? (c?.rankMetrics?.[0] ?? 'score') });
      } catch { /* noop */ }
      finally { if (active) setLoading(false); }
    };
    if (!rankPanelCache.has(venueId)) setLoading(true); // 캐시 있으면 스켈레톤 생략(깜빡임 제거), 백그라운드 갱신
    load();
    const unsub = subscribeRankings(venueId, load); // 실시간: 순위 입력 시 자동 반영
    return () => { active = false; unsub(); };
  }, [venueId]);

  // 보드 선택을 캐시에 유지(탭 떠났다 복귀해도 같은 보드)
  useEffect(() => { const e = rankPanelCache.get(venueId); if (e && metric) writeRankCache(venueId, { ...e, metric }); }, [metric, venueId]);

  // 업주가 고른 보드(1~2개). 미설정 시 기본 2종.
  // 'prize'(상금 합산) 보드는 2026-09-05 폐지 — 저장된 설정에 남아 있어도 걸러 낸다(page_config 데이터는 건드리지 않는다).
  const metrics: RankBoardId[] = (() => {
    const known = (cfg?.rankMetrics ?? []).filter((m) => isCustomBoard(m) || m in RANK_METRIC_LABEL);
    return (known.length > 0 ? known : DEFAULT_RANK_METRICS).slice(0, 2);
  })();
  const cur: RankBoardId = metric && metrics.includes(metric) ? metric : metrics[0];

  // 수동 포인트 합산(기본 매장 포인트 보드 — 커스텀 보드 항목 제외)
  const manualByName = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of manual) {
      if (e.boardKey) continue;
      const k = e.name.trim().toLowerCase();
      m[k] = (m[k] ?? 0) + e.points;
    }
    return m;
  }, [manual]);

  // 메트릭별 값 계산 + 정렬
  const rows = useMemo(() => {
    // 커스텀 보드: 업주가 직접 입력한 항목 합산(이름별) — 월간/시즌 기간 필터 반영
    if (isCustomBoard(cur)) {
      const key = customKeyOf(cur);
      const start = boardPeriodStart((cfg?.customBoards ?? []).find((b) => b.key === key));
      const m = new globalThis.Map<string, { name: string; value: number }>();
      for (const e of manual) {
        if (e.boardKey !== key) continue;
        if (start && e.entryDate < start) continue;
        const k = e.name.trim().toLowerCase();
        const c = m.get(k) ?? { name: e.name, value: 0 };
        c.value += e.points;
        m.set(k, c);
      }
      return [...m.values()]
        .map((x) => ({ nickname: x.name, realName: '', moneyPoints: 0, appearances: 0, bestPosition: 0, value: x.value }))
        .filter((b) => b.value > 0)
        .sort((a, b) => b.value - a.value);
    }
    // 출석왕: QR 체크인 누적 — 체크인 기록이 1건이라도 있으면 그 기준(없으면 장부 방문 폴백)
    if (cur === 'visit_count' && checkinRows.length > 0) {
      return checkinRows
        .map((p) => ({ nickname: p.name, realName: '', moneyPoints: 0, appearances: 0, bestPosition: 0, value: p.count }))
        .filter((b) => b.value > 0)
        .sort((a, b) => b.value - a.value);
    }
    // 바인왕/출석왕(폴백): 장부 집계(전 플레이어) 기반 — 랭킹 등록 여부와 무관
    if (cur === 'buyin_count' || cur === 'visit_count') {
      return playerCounts
        .map((p) => ({ nickname: p.name, realName: '', moneyPoints: 0, appearances: 0, bestPosition: 0, value: cur === 'buyin_count' ? p.buyins : p.visits }))
        .filter((b) => b.value > 0)
        .sort((a, b) => b.value - a.value);
    }
    const base = totals.map((t) => {
      const k = t.nickname.toLowerCase();
      const buyins = buyinCounts[k] ?? 0;
      const value =
        cur === 'score'         ? t.moneyPoints + (manualByName[k] ?? 0)
        : cur === 'moneyin_count' ? t.appearances
        : buyins >= 5 ? Math.round((t.appearances / buyins) * 100) : -1; // rate: 표본 5바인 미만 제외
      return { ...t, value };
    });
    // 수동 포인트만 있고 순위 등록이 없는 사람도 score 보드에 포함
    if (cur === 'score') {
      for (const [k, pts] of Object.entries(manualByName)) {
        if (!base.some((b) => b.nickname.toLowerCase() === k)) {
          const src = manual.find((e) => e.name.trim().toLowerCase() === k);
          base.push({ nickname: src?.name ?? k, realName: '', moneyPoints: 0, appearances: 0, bestPosition: 0, value: pts });
        }
      }
    }
    return base.filter((b) => b.value >= 0)
      // 동점은 비금전 규칙으로만 가른다(등수 점수 → 최고 등수 → 이름) — 상금 합산 동점결정은 2026-09-05 폐지.
      .sort((a, b) => (b.value - a.value) || (b.moneyPoints - a.moneyPoints) || (a.bestPosition - b.bestPosition) || a.nickname.localeCompare(b.nickname));
  }, [totals, cur, manualByName, buyinCounts, manual, playerCounts, checkinRows, cfg]);

  if (loading) return <SkeletonList rows={6} rowClassName="h-14" />;
  if (totals.length === 0 && manual.length === 0 && playerCounts.length === 0) {
    return <EmptyState title="아직 등록된 순위가 없어요" hint="매장에서 순위를 등록하면 누적 랭킹이 자동으로 집계됩니다." />;
  }

  const unit = boardUnit(cur, cfg);
  const fmtVal = (v: number) => `${v.toLocaleString()}${unit}`;
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3, 20);
  // 1~3등 칭호 — 업주 설정(예: 로티아레나 포식자), 미설정 시 기본
  const titleOf = (rank: number) => cfg?.rankTitles?.[String(rank)]?.trim()
    || (rank === 1 ? '챔피언' : rank === 2 ? '준우승' : '3위');

  return (
    <div className="space-y-3">
      {/* 보드 토글 — 업주가 1개만 골랐으면 라벨 헤더로 표시 */}
      {metrics.length > 1 ? (
        <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5">
          {metrics.map((id) => (
            <button key={id} type="button" onClick={() => setMetric(id)}
              className={['hit flex-1 py-1.5 text-xs font-bold rounded-[6px] transition-colors',
                cur === id ? 'bg-accent-300 text-white' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
              {boardLabel(id, cfg)}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm font-bold text-accent-200">{boardLabel(cur, cfg)} 순위</p>
      )}
      <p className="text-2xs text-ink-muted">{boardDesc(cur, cfg)} · 매장 커뮤니티 순위용 점수(금전적 가치 없음)</p>

      {/* ── 포디움(1~3등 명예 표기) ── */}
      {podium.length > 0 && (
        <div className="flex items-end justify-center gap-2 pt-2">
          {[podium[1], podium[0], podium[2]].map((e, slot) => {
            if (!e) return <div key={slot} className="flex-1" />;
            const rank = slot === 1 ? 1 : slot === 0 ? 2 : 3;
            const { main: rMain, sub: rSub } = rankDisplay(e, realNameOptIns);
            const big = rank === 1;
            const ring = rank === 1 ? 'border-accent-300/80 bg-gradient-to-b from-accent-300/[0.14] to-transparent'
              : rank === 2 ? 'border-slate-300/50 bg-gradient-to-b from-slate-300/[0.08] to-transparent'
              : 'border-amber-700/50 bg-gradient-to-b from-amber-700/[0.10] to-transparent';
            // 2등 메달은 `bg-slate-300 text-white` 였다 — 흰 글자 대비 **1.48:1**(다크·라이트 공통, AA 근처도 못 감).
            // 밝은 은색 배지 위 숫자는 어두운 글자여야 읽힌다. 1등(보라)·3등(동)은 흰 글자로 4.5 이상이라 유지.
            const medal = rank === 1 ? 'bg-accent-300 text-white' : rank === 2 ? 'bg-slate-300 text-slate-900' : 'bg-amber-700 text-white';
            return (
              <div key={e.nickname} className={['flex-1 max-w-[9.5rem] rounded-aura border p-2.5 text-center', ring, big ? 'pb-4 -translate-y-2 shadow-[0_0_18px_rgb(var(--accent-300)/0.18)]' : ''].join(' ')}>
                {big && <Icon name="crown" size={16} className="mx-auto mb-1 text-gold-300" />}
                <span className={['mx-auto flex items-center justify-center rounded-full font-extrabold tabular-nums', medal, big ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-2xs'].join(' ')}>{rank}</span>
                <p className={['mt-1 font-bold uppercase tracking-wide', rank === 1 ? 'text-accent-200' : 'text-ink-secondary', 'text-2xs'].join(' ')}>{titleOf(rank)}</p>
                <p className={['font-extrabold text-ink-primary truncate', big ? 'text-base' : 'text-sm'].join(' ')}>{rMain}</p>
                {rSub && <p className="text-2xs text-ink-muted">({rSub})</p>}
                <p className={['font-bold tabular-nums', big ? 'text-sm text-accent-200' : 'text-xs text-ink-secondary'].join(' ')}>{fmtVal(e.value)}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* 4등~ 리스트 — 바이낸스 표 문법(구분선·행 40px대·숫자 우측 tabular) */}
      <ol className="reveal overflow-hidden rounded-input border border-border-subtle bg-surface-high divide-y divide-border-subtle">
        {rest.map((e, i) => {
          const { main: rMain, sub: rSub } = rankDisplay(e, realNameOptIns);
          return (
            <li key={e.nickname} className="flex items-center gap-2.5 px-2.5 py-2 transition-colors hover:bg-surface-float/50">
              <span className="w-6 shrink-0 text-center text-xs font-bold tabular-nums text-ink-muted">{i + 4}</span>
              <span className="min-w-0 truncate text-sm font-semibold text-ink-primary">{rMain}</span>
              {rSub && <span className="shrink-0 text-2xs text-ink-muted">({rSub})</span>}
              <span className="ml-auto shrink-0 text-right">
                <span className="text-sm font-bold tabular-nums text-accent-200">{fmtVal(e.value)}</span>
                {e.appearances > 0 && <span className="block text-xs leading-tight text-ink-muted">{e.appearances}회{e.bestPosition > 0 && e.bestPosition < 9999 ? ` · 최고 ${e.bestPosition}등` : ''}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {latest.date && latest.entries.length > 0 && (
        <div className="reveal pt-2 border-t border-border-subtle">
          <p className="text-2xs font-semibold text-ink-secondary mb-1.5">최근 등록 · {latest.date}</p>
          {/* 같은 날 여러 게임(메인+사이드)이면 게임별로 묶어 표시 */}
          {[...new Set(latest.entries.map((e) => e.eventName ?? ''))].map((ev, _i, evs) => {
            const group = latest.entries.filter((e) => (e.eventName ?? '') === ev);
            const multi = evs.length > 1;
            return (
              <div key={ev || '_main'} className={multi ? 'mb-1.5' : ''}>
                {multi && <p className="text-2xs font-bold text-accent-200 mb-1">{ev || '메인'}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {group.map((e) => {
                    const { main: rMain, sub: rSub } = rankDisplay(e, realNameOptIns);
                    return (
                      <span key={`${ev}-${e.position}`} className="text-2xs px-2 py-0.5 rounded-badge bg-surface-float text-ink-primary">
                        {e.position}. {rMain}{rSub ? `(${rSub})` : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FollowButton({ venueId, followerCount, compact }: { venueId: string; followerCount?: number; compact?: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getMyFollowedVenueIds().then((ids) => { if (active) setFollowing(ids.includes(venueId)); }).catch(() => {});
    return () => { active = false; };
  }, [user, venueId]);

  const toggle = async () => {
    if (!user) return toast.show('로그인이 필요합니다', 'error');
    const next = !following;
    setFollowing(next); setBusy(true);
    try {
      if (next) await followVenue(venueId); else await unfollowVenue(venueId);
      toast.show(next ? '팔로우 완료. 새 대회 포스터가 올라오면 알려드려요' : '팔로우를 해제했습니다', next ? 'success' : 'info');
    } catch (e) {
      setFollowing(!next);
      toast.show(e instanceof Error ? e.message : '처리에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };

  const count = followerCount ?? 0;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      aria-label={following ? '팔로우 해제' : '매장 팔로우'}
      className={[
        // compact: 헤더용 — 높이만 헤더 아이콘(36px)에 맞추고 라벨은 유지(팔로워 수는 숨김).
        // hit: 실측 62×38 로 44px 최소 터치타깃 미달이었다 — 옆 공유 버튼과 달리 .hit 이 빠져 있었다.
        compact
          ? 'hit shrink-0 inline-flex items-center justify-center gap-1 px-2.5 h-9 rounded-full text-xs font-semibold transition-colors disabled:opacity-60'
          : 'shrink-0 inline-flex items-center justify-center gap-1 px-3 h-9 rounded-input text-xs font-semibold transition-colors disabled:opacity-60',
        following
          ? 'bg-accent-300 text-white'
          : 'bg-surface-high text-ink-secondary border border-border-default hover:text-ink-primary',
      ].join(' ')}
    >
      {following ? '팔로잉' : '팔로우'}
      {!compact && <span className="text-2xs opacity-80">({count.toLocaleString()})</span>}
    </button>
  );
}

// ── About 패널 ───────────────────────────────────────────────────────────────

function AboutPanel({
  venue, editable, onUpdateDescription, kakao, onCoords,
}: { venue: Venue; editable?: boolean; onUpdateDescription?: (id: string, desc: string) => void; kakao?: string; onCoords?: (lat: number, lng: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(venue.description ?? '');
  // 매장 정보(주소·전화·영업시간) 통합 편집
  const [addr, setAddr]       = useState(venue.address);
  // 연락처는 배열이 진실이다(오너 #17). 신 필드가 비어 있으면 venueContacts 가 기존 contactPhone 을 승격한다.
  const [contacts, setContacts] = useState<VenueContact[]>(() => venueContacts(venue));
  const [hours, setHours]     = useState(venue.businessHours ?? '');
  const [infoEditing, setInfoEditing] = useState(false);
  const [addrDraft, setAddrDraft]     = useState(venue.address);
  const [contactsDraft, setContactsDraft] = useState<VenueContact[]>(() => ensureOneContact(venueContacts(venue)));
  const [hoursDraft, setHoursDraft]   = useState(venue.businessHours ?? '');
  const [infoSaving, setInfoSaving]   = useState(false);
  const toast = useToast();

  const openInfoEdit = () => {
    setAddrDraft(addr); setContactsDraft(ensureOneContact(contacts)); setHoursDraft(hours); setInfoEditing(true);
  };
  const saveInfo = async () => {
    const next = cleanContacts(contactsDraft);
    // '1개 필수' — 서버는 0개도 받지만(주소만 고치는 매장이 인질이 되면 안 된다) 이 편집기는
    // 오너 지시대로 최소 1개를 요구한다. 지우고 싶으면 그 의도가 드러나야 한다.
    if (next.length === 0) { toast.show('연락처는 1개 이상 입력해 주세요', 'error'); return; }
    setInfoSaving(true);
    try {
      await updateVenueContact(venue.id, { address: addrDraft, hours: hoursDraft, contacts: next });
      setAddr(addrDraft.trim()); setContacts(next); setHours(hoursDraft.trim());
      setInfoEditing(false);
      toast.show('매장 정보가 저장되었습니다', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
    finally { setInfoSaving(false); }
  };

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ink-primary">매장 소개</h3>
          {editable && !editing && (
            <button
              type="button"
              onClick={() => { setDraft(venue.description ?? ''); setEditing(true); }}
              className="text-2xs text-ink-muted hover:text-accent-200"
            >
              편집
            </button>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              className="input resize-none w-full"
              placeholder="매장 소개를 입력하세요…"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(false)}>취소</button>
              <button
                type="button"
                className="btn-primary text-xs"
                onClick={() => {
                  onUpdateDescription?.(venue.id, draft);
                  setEditing(false);
                  toast.show('매장 소개가 저장되었습니다', 'success');
                }}
              >
                저장
              </button>
            </div>
          </div>
        ) : (
          venue.description ? (
            <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">{venue.description}</p>
          ) : editable ? (
            <button type="button" onClick={() => { setDraft(venue.description ?? ''); setEditing(true); }}
              className="inline-flex h-9 items-center gap-1.5 rounded-input border border-dashed border-accent-400/40 bg-accent-300/[0.06] px-3.5 text-xs font-bold text-accent-200 hover:bg-accent-300/10 transition-colors">
              + 소개 쓰기
            </button>
          ) : (
            <p className="text-sm text-ink-muted">아직 등록된 소개가 없습니다.</p>
          )
        )}
      </section>

      <div className="border-t border-border-subtle" />

      {/* 계층 2(Phase 10): 위치·연락처·영업시간 상세 — 손님에게는 접힌 채로 시작한다(기존 유지).
          ⚠ 2026-08-29 실측: 이 섹션 안에만 있던 **영업시간**은 [매장 소개] 탭 이동 + 아코디언 펼치기
          두 단계를 거쳐야 보였다. '지금 문 열었나'는 갈까 말까의 1차 판단 재료인데 두 번 숨어 있었다.
          → 요약(주소·영업시간)은 첫 화면 아이덴티티 블록으로 승격했고(위), 여기는 '확인·복사·지도'
            계층으로 남긴다. 기본 펼침도 검토했으나 그러면 주소 복사 버튼이 첫 뷰포트로 올라와
            행동 예산(≤6, venue-ia)을 넘긴다 — 정보는 올리고 컨트롤은 계층 2에 두는 쪽이 맞다.
          손잡이(summary)는 44px 히트영역을 갖도록 py-1 → py-3. */}
      <details className="group/vinfo" open={editable || undefined}>
        <summary className="cursor-pointer list-none flex items-center justify-between gap-2 py-3">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-primary">
            <Icon name="map-pin" size={15} className="text-ink-muted" />위치 · 연락처 · 영업시간
          </h3>
          <Icon name="chevron-down" size={16} className="shrink-0 text-ink-muted transition-transform group-open/vinfo:rotate-180" />
        </summary>
      {/* ── 간격 스케일(오너 #17) ─────────────────────────────────────────────
          실측(375·412): 여기는 세 덩어리(정보 dl · 지도 · 지도 링크)가 서로 다른 규칙으로
          붙어 있었다. dl 행 간 6px(space-y-1.5) = 연락처 칩 사이 6px 라 '행'과 '칩'이 같은
          간격이어서 위계가 뭉갰고, section→지도 0px · 지도→지도칩줄 0px 로 덩어리 경계가
          아예 없었다(0 / 8 / 0 의 뒤죽박죽).
          → 스케일을 셋으로 고정한다:  칩 사이 6px < 행 사이 8px < 덩어리 사이 12px.
             같은 위계는 같은 값만 쓴다. */}
      <div className="space-y-3 pt-1.5">
      <section className="space-y-2">
        {editable && !infoEditing && (
          <div className="flex justify-end">
            <button type="button" onClick={openInfoEdit}
              className="text-2xs text-ink-muted hover:text-accent-200">정보 편집</button>
          </div>
        )}
        {infoEditing ? (
          <div className="space-y-2">
            <label className="block">
              <span className="mb-0.5 block text-2xs font-semibold text-ink-secondary">주소</span>
              <input value={addrDraft} onChange={(e) => setAddrDraft(e.target.value)} maxLength={120}
                placeholder="도로명 주소" className="input w-full text-sm" autoFocus />
            </label>
            <div>
              <span className="mb-1 block text-2xs font-semibold text-ink-secondary">
                연락처 <span className="font-normal text-ink-muted">(1개 필수 · [+]로 추가)</span>
              </span>
              <ContactListEditor contacts={contactsDraft} onChange={setContactsDraft} idPrefix="venue-about" />
            </div>
            <label className="block">
              <span className="mb-0.5 block text-2xs font-semibold text-ink-secondary">영업시간</span>
              <input value={hoursDraft} onChange={(e) => setHoursDraft(e.target.value)} maxLength={60}
                placeholder="예: 매일 18:00 ~ 익일 04:00" className="input w-full text-sm" />
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-ghost text-xs" onClick={() => setInfoEditing(false)}>취소</button>
              <button type="button" className="btn-primary text-xs disabled:opacity-60" disabled={infoSaving} onClick={saveInfo}>
                {infoSaving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        ) : (
          <dl className="space-y-2">
            <AddressRow address={addr} />
            {contacts.length > 0 ? <ContactRows contacts={contacts} /> : editable && (
              <button type="button" onClick={openInfoEdit}
                className="inline-flex h-8 items-center gap-1.5 rounded-input border border-dashed border-accent-400/40 bg-accent-300/[0.06] px-3 text-2xs font-bold text-accent-200 hover:bg-accent-300/10 transition-colors">
                + 전화번호 등록
              </button>
            )}
            {hours && <Row dt="영업시간" dd={hours} />}
          </dl>
        )}
      </section>

      {/* 카카오톡 오픈채팅 — 첫 화면(Tier1)에서 매장 정보로 이동(Phase 10).
          정보 행(dl)과 다른 덩어리라 12px 자리로 내려 세운다(예전엔 section 안 pt-1 로 8+4=12px 를
          우연히 맞추고 있었다 — 같은 값이라도 규칙이 없으면 다음 사람이 깬다). */}
      <KakaoChatRow kakao={kakao} />

      {/* 카카오맵 위치 + 외부 지도 링크(주소 행에서 재배치) */}
      <VenueLocationMap address={addr} name={venue.name} lat={venue.lat} lng={venue.lng} onCoords={onCoords} />
      <div className="flex gap-1.5">
        <a href={`https://map.kakao.com/link/search/${encodeURIComponent(addr)}`} target="_blank" rel="noopener noreferrer" className={MAP_CHIP}>
          <span aria-hidden className="h-2 w-2 rounded-full bg-[#FEE500]" /> 카카오맵에서 보기
        </a>
        <a href={`https://map.naver.com/v5/search/${encodeURIComponent(addr)}`} target="_blank" rel="noopener noreferrer" className={MAP_CHIP}>
          <span aria-hidden className="h-2 w-2 rounded-full bg-[#03C75A]" /> 네이버지도
        </a>
      </div>
      </div>
      </details>
    </div>
  );
}

function Row({ dt, dd }: { dt: string; dd: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <dt className="w-14 shrink-0 text-ink-muted">{dt}</dt>
      <dd className="text-ink-secondary flex-1 whitespace-pre-line">{dd}</dd>
    </div>
  );
}

// 매장 정보 액션 칩 공통 규격 — 높이·글자·여백 통일(조잡함 방지)
const MAP_CHIP = 'hit inline-flex h-8 items-center justify-center gap-1.5 rounded-input border border-border-default bg-surface-high px-2 text-2xs font-semibold text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary active:scale-95';

// 주소 — 클릭하면 클립보드 복사 + 외부 지도 링크
function AddressRow({ address }: { address: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.show('주소가 복사되었습니다', 'success');
    } catch {
      toast.show('복사에 실패했습니다', 'error');
    }
  };
  return (
    <div className="flex items-start gap-2 text-xs">
      <dt className="w-14 shrink-0 text-ink-muted">주소</dt>
      <dd className="flex-1 space-y-1.5">
        {/* Phase 10 재배치: 주소 텍스트 탭 = 복사(칩 3개 → 1컨트롤 통합).
            카카오맵/네이버지도 링크는 지도 임베드 하단으로 이동 — Tier1 [길찾기]와
            같은 목적지를 첫 화면에 세 번 반복하지 않기 위해서다(기능은 전부 보존). */}
        <button type="button" onClick={copy} title="탭하면 주소가 복사됩니다"
          className="hit group flex w-full items-start gap-1.5 py-1 text-left text-ink-secondary hover:text-ink-primary transition-colors">
          <span className="whitespace-pre-line">{address}</span>
          {/* 손으로 그린 복사 SVG(stroke 2.2)였다 — 레지스트리 규격(stroke 2)과 굵기가 갈렸다(ICON-2) */}
          <Icon name="copy" size={12} className="mt-0.5 shrink-0 text-ink-muted group-hover:text-accent-200" />
        </button>
      </dd>
    </div>
  );
}

// ── 카카오맵 ─────────────────────────────────────────────────────────────────

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined;

function KakaoMap({ address, name, onCoords }: { address: string; name: string; onCoords?: (lat: number, lng: number) => void }) {
  // 부모가 인라인 함수를 넘겨도 지오코딩 이펙트가 렌더마다 재실행되지 않게 ref 로 고정
  const onCoordsRef = useRef(onCoords);
  onCoordsRef.current = onCoords;
  const [loading, error] = useKakaoLoader({
    appkey: KAKAO_KEY ?? '',
    libraries: ['services'],
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (loading || error || !KAKAO_KEY) return;
    setGeocoding(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geocoder = new (window as any).kakao.maps.services.Geocoder();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geocoder.addressSearch(address, (result: any[], status: string) => {
      setGeocoding(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (status === (window as any).kakao.maps.services.Status.OK && result[0]) {
        setCoords({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
        // 좌표 라이트백(Phase 14 거리순의 데이터 공급) — 관리자 기기에서만 저장(부모 게이트)
        onCoordsRef.current?.(parseFloat(result[0].y), parseFloat(result[0].x));
      }
    });
  }, [loading, error, address]);

  // 카카오 앱키 미설정 시 숨김
  if (!KAKAO_KEY) return null;

  return (
    <section className="reveal space-y-2">
      <h3 className="text-sm font-semibold text-ink-primary">위치</h3>
      <div className="rounded-aura overflow-hidden border border-border-subtle" style={{ height: 200 }}>
        {loading || geocoding ? (
          <div className="w-full h-full flex items-center justify-center bg-surface-high">
            <span className="w-5 h-5 rounded-full border-2 border-accent-300 border-t-transparent animate-spin" />
          </div>
        ) : error || !coords ? (
          <div className="w-full h-full flex items-center justify-center bg-surface-high">
            <p className="text-xs text-ink-muted">지도를 불러올 수 없습니다</p>
          </div>
        ) : (
          <Map
            center={coords}
            level={4}
            style={{ width: '100%', height: '100%' }}
          >
            <MapMarker position={coords}>
              <div className="px-2 py-1 text-xs font-semibold text-surface-base whitespace-nowrap">
                {name}
              </div>
            </MapMarker>
          </Map>
        )}
      </div>
      <a
        href={`https://map.kakao.com/link/search/${encodeURIComponent(address)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-2xs text-ink-muted hover:text-accent-200 transition-colors"
      >
        카카오맵에서 보기 <Icon name="external" size={12} />
      </a>
    </section>
  );
}


// ── 네이버 지도 v3 ───────────────────────────────────────────────────────────
//
// 왜 카카오를 지우지 않고 '분기'인가:
//   카카오 지도는 코드가 멀쩡한데 **키(VITE_KAKAO_MAP_KEY)만 비어 있어** 안 뜬다.
//   코드를 지우면 키가 생겼을 때 되돌릴 수단이 사라진다. 그래서 아래 우선순위로 고른다.
//     ① VITE_NAVER_MAP_KEY 있음  → 네이버(오너 지시 공급자)
//     ② 없고 VITE_KAKAO_MAP_KEY 있음 → 기존 카카오 경로 그대로(무회귀 롤백 경로)
//     ③ 둘 다 없음               → **'위치 정보 준비 중' 대체 UI**(조용한 빈 화면 금지)
//   네이버 키가 채워지면 ①이 이기므로 전환에 코드 변경이 필요 없다.

/** 로더 상태 구독 — 인증 실패가 ready 뒤에 늦게 와도 화면이 따라간다. */
function useNaverMapState(): NaverMapState {
  const state = useSyncExternalStore(onNaverMapState, naverMapState, naverMapState);
  useEffect(() => { loadNaverMaps(); }, []);
  return state;
}

/** 지도 자리 공통 껍데기 — 지도가 못 떠도 '위치' 섹션과 외부 지도 링크는 남는다. */
function MapShell({ address, children }: { address: string; children: ReactNode }) {
  return (
    <section className="reveal space-y-2">
      <h3 className="text-sm font-semibold text-ink-primary">위치</h3>
      <div className="rounded-aura overflow-hidden border border-border-subtle" style={{ height: 200 }}>
        {children}
      </div>
      <a
        href={`https://map.naver.com/p/search/${encodeURIComponent(address)}`}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-2xs text-ink-muted hover:text-accent-200 transition-colors"
      >
        네이버 지도에서 보기 <Icon name="external" size={12} />
      </a>
    </section>
  );
}

function MapSpinner() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-surface-high">
      <span className="w-5 h-5 rounded-full border-2 border-accent-300 border-t-transparent animate-spin" />
    </div>
  );
}

/** 지도를 못 띄우는 모든 경우의 **보이는** 안내. 빈 화면으로 남기지 않는 것이 이 컴포넌트의 목적이다. */
function MapNotice({ icon, title, desc }: { icon: 'map-pin' | 'alert'; title: string; desc: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-surface-high px-4 text-center">
      <Icon name={icon} size={18} className="text-ink-muted" />
      <p className="text-xs font-semibold text-ink-secondary">{title}</p>
      <p className="text-2xs leading-relaxed text-ink-muted">{desc}</p>
    </div>
  );
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function NaverVenueMap({
  address, name, lat, lng, onCoords,
}: { address: string; name: string; lat?: number | null; lng?: number | null; onCoords?: (lat: number, lng: number) => void }) {
  const state = useNaverMapState();
  const onCoordsRef = useRef(onCoords);
  onCoordsRef.current = onCoords;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    lat != null && lng != null ? { lat, lng } : null,
  );
  const [geoFailed, setGeoFailed] = useState(false);

  // 매장이 바뀌면(주소/DB좌표 변경) 좌표를 다시 잡는다 — 이전 매장 좌표가 남아 엉뚱한 위치를 찍는 것 방지.
  useEffect(() => {
    setCoords(lat != null && lng != null ? { lat, lng } : null);
    setGeoFailed(false);
  }, [address, lat, lng]);

  // DB 좌표가 없을 때만 지오코딩(네트워크·쿼터 절약).
  useEffect(() => {
    if (state !== 'ready' || coords) return;
    let alive = true;
    geocodeAddress(address).then((c) => {
      if (!alive) return;
      // 좌표 실패의 원인이 '주소'인지 '키'인지 가른다 — 틀린 안내를 내보내지 않기 위해.
      if (!c) { setGeoFailed(true); probeNaverAuth(); return; }
      setCoords(c);
      // 좌표 라이트백(거리순 정렬의 데이터 공급) — 저장 권한 게이트는 부모가 쥔다.
      onCoordsRef.current?.(c.lat, c.lng);
    });
    return () => { alive = false; };
  }, [state, address, coords]);

  // 지도 인스턴스 생성/파기.
  useEffect(() => {
    const maps = naverMaps();
    const el = boxRef.current;
    if (state !== 'ready' || !maps || !coords || !el) return;
    const center = new maps.LatLng(coords.lat, coords.lng);
    const map = new maps.Map(el, {
      center,
      zoom: 16,
      scaleControl: false,
      logoControl: true,
      mapDataControl: false,
      zoomControl: false,
    });
    const marker = new maps.Marker({
      position: center,
      map,
      title: name,
      icon: {
        content:
          '<div style="transform:translate(-50%,-100%);white-space:nowrap;pointer-events:none">'
          + `<span class="inline-block rounded-badge bg-accent-400 px-2 py-0.5 text-2xs font-bold text-white shadow-lg">${escapeHtml(name)}</span>`
          + '<span class="mx-auto mt-0.5 block h-2.5 w-2.5 rounded-full bg-accent-400 ring-2 ring-white"></span>'
          + '</div>',
        anchor: new maps.Point(0, 0),
      },
    });
    return () => { marker.setMap(null); map.destroy?.(); };
  }, [state, coords, name]);

  return (
    <MapShell address={address}>
      {state === 'auth-failed' ? (
        <MapNotice icon="alert" title="지도 인증에 실패했습니다"
          desc="지도 서비스 키 또는 도메인 설정을 확인해 주세요. 아래 링크로 위치를 볼 수 있어요." />
      ) : state === 'error' ? (
        <MapNotice icon="alert" title="지도를 불러올 수 없습니다"
          desc="네트워크 상태를 확인한 뒤 다시 시도해 주세요." />
      ) : geoFailed ? (
        <MapNotice icon="map-pin" title="지도 위치를 찾지 못했습니다"
          desc={address} />
      ) : state !== 'ready' || !coords ? (
        <MapSpinner />
      ) : (
        <div ref={boxRef} className="w-full h-full" />
      )}
    </MapShell>
  );
}

/** 공급자 선택 진입점 — 키 유무로만 갈린다(코드 삭제 없음). */
function VenueLocationMap({
  address, name, lat, lng, onCoords,
}: { address: string; name: string; lat?: number | null; lng?: number | null; onCoords?: (lat: number, lng: number) => void }) {
  if (naverMapConfigured()) {
    return <NaverVenueMap address={address} name={name} lat={lat} lng={lng} onCoords={onCoords} />;
  }
  if (KAKAO_KEY) return <KakaoMap address={address} name={name} onCoords={onCoords} />;
  return (
    <MapShell address={address}>
      <MapNotice icon="map-pin" title="위치 정보 준비 중"
        desc="지도를 준비하고 있어요. 아래 링크에서 위치와 길찾기를 볼 수 있어요." />
    </MapShell>
  );
}

// ── Schedules 패널 ──────────────────────────────────────────────────────────

// ── 포스터 탭 ────────────────────────────────────────────────────────────────
// '금일 포스터' 카테고리 — 클릭 시 공지글이 포함된 상태로 아코디언이 열린다.
// (오늘 진행 포스터 + 운영 공지를 함께 묶어 보여줌)

function PostersPanel({
  todayPosters, allPosters, notices, onSelect,
}: {
  todayPosters: Schedule[];
  allPosters: Schedule[];
  notices: MarketplaceNotice[];
  onSelect?: (s: Schedule) => void;
}) {
  // 금일 포스터가 있으면 기본 열림, 없으면 접힘
  const [open, setOpen] = useState(todayPosters.length > 0);
  const dows = ['일', '월', '화', '수', '목', '금', '토'];

  // 오늘이 아닌 예정 포스터 (날짜 오름차순)
  const upcoming = allPosters
    .filter((s) => !todayPosters.some((t) => t.id === s.id))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      {/* ── 금일 포스터 아코디언 ───────────────────────────────── */}
      <section className="rounded-aura border border-accent-400/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-gradient-to-br from-accent-300/[0.08] to-transparent hover:from-accent-300/[0.12] transition-colors focus:outline-none"
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-accent-200">
            금일 포스터
            <span className="text-2xs text-ink-muted font-normal">({todayPosters.length})</span>
          </span>
          {/* 펼침/접힘 화살표 — 손그림 SVG(viewBox 16)를 레지스트리 글리프(viewBox 24)로 통일.
              duration-200 유틸은 모션 헌법 §20.4 #2 위반(토큰과 분리돼 표류) → --dur-base 토큰으로. */}
          <Icon
            name="chevron-down"
            size={16}
            className={['text-ink-secondary transition-transform duration-[var(--dur-base)] [transition-timing-function:var(--ease)]', open ? 'rotate-180' : ''].join(' ')}
          />
        </button>

        {/* 아코디언 본문 — 공지글 + 금일 포스터 */}
        {open && (
          <div className="px-3 py-3 space-y-3 border-t border-accent-400/20 animate-slide-up">
            {/* 공지글 (있을 때만) */}
            {notices.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-2xs font-bold text-ink-muted">공지</p>
                <ul className="space-y-1.5">
                  {notices.slice(0, 3).map((n) => (
                    <li key={n.id} className="px-2.5 py-2 rounded-input bg-surface-high border-l-2 border-accent-400/50">
                      <p className="text-xs font-semibold text-ink-primary">{n.title}</p>
                      {n.body && <p className="text-2xs text-ink-muted line-clamp-2 mt-0.5">{n.body}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 금일 포스터 목록 */}
            {todayPosters.length === 0 ? (
              <p className="text-center py-4 text-xs text-ink-muted">오늘 진행되는 포스터가 없습니다. 아래 예정 포스터를 확인해 보세요.</p>
            ) : (
              <ul className="space-y-2">
                {todayPosters.map((s) => (
                  <li key={s.id} onClick={() => onSelect?.(s)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(s); } }}
                    className="flex items-center gap-3 p-2.5 rounded-input bg-surface-low border border-border-subtle cursor-pointer hover:border-accent-400/40 focus:outline-none focus-visible:border-accent-300 transition-colors">
                    {/* 포스터 썸네일 */}
                    <div
                      className="w-10 h-14 shrink-0 rounded-input overflow-hidden flex items-center justify-center"
                      style={s.posterUrl ? undefined : { background: `linear-gradient(135deg, ${s.posterColor ?? '#1a1d24'}, #0a0c0f)` }}
                    >
                      {s.posterUrl
                        ? <img src={s.posterUrl} alt={`${s.title} 포스터`} className="w-full h-full object-cover" loading="lazy" />
                        : <span className="text-lg opacity-30">♠</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-primary truncate">{s.title}</p>
                      <p className="text-2xs text-ink-muted mt-0.5">
                        {/* 바이인 미입력(0)이면 '바이인 0'(거짓 정보) 대신 세그먼트 자체를 생략 — Tier1 오늘의 대회와 동일 문법 */}
                        {s.startTime}{s.buyIn.amount > 0 ? ` · 바이인 ${s.buyIn.amount.toLocaleString()}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-2xs font-bold text-accent-200 bg-accent-300/15 px-1.5 py-0.5 rounded-badge">
                      TODAY
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ── 예정 포스터 ─────────────────────────────────────────── */}
      <div className="reveal space-y-2">
        <p className="text-2xs font-bold text-ink-muted px-0.5">예정 포스터 ({upcoming.length})</p>
        {/* 빈 상태를 회색 한 줄에서 공용 EmptyState 로 — 카피는 보존하고 '그래서 뭘 하면 되는지'를 덧댄다.
            (순위 탭은 이미 EmptyState 를 쓰고 있었다 — 탭마다 빈 화면의 문법이 달랐던 것을 맞춘다) */}
        {upcoming.length === 0 ? (
          <EmptyState title="예정된 포스터가 없습니다." hint="매장을 팔로우하면 새 대회 포스터가 올라올 때 알려드려요." />
        ) : (
          <ul className="space-y-2">
            {upcoming.map((s) => {
              const d = new Date(s.date);
              return (
                <li key={s.id} onClick={() => onSelect?.(s)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(s); } }}
                  className="flex items-center gap-3 p-3 rounded-input bg-surface-high border border-border-subtle cursor-pointer hover:border-accent-400/40 focus:outline-none focus-visible:border-accent-300 transition-colors">
                  <div className="text-center shrink-0">
                    <p className="text-2xs text-ink-muted">{dows[d.getDay()]}</p>
                    <p className="text-lg font-bold text-accent-200 tabular-nums leading-none">{d.getDate()}</p>
                    <p className="text-2xs text-ink-muted">{d.getMonth() + 1}월</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-primary truncate">{s.title}</p>
                    <p className="text-2xs text-ink-muted mt-0.5">
                      {s.startTime}{s.buyIn.amount > 0 ? ` · 바이인 ${s.buyIn.amount.toLocaleString()}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// 매장 공지 — 업주 + 관리자만 작성/삭제, 누구나 열람
function VenueNoticeBoard({ venueId, canManage }: { venueId: string; canManage: boolean }) {
  const toast = useToast();
  const [notices, setNotices] = useState<VenueNotice[]>([]);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getVenueNotices(venueId).then(setNotices).catch(() => {}); }, [venueId]);
  const reload = () => getVenueNotices(venueId).then(setNotices).catch(() => {});

  const submit = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await createVenueNotice(venueId, draft);
      setDraft(''); setOpen(false);
      toast.show('공지를 등록했습니다', 'success');
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '등록에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return;
    try { await deleteVenueNotice(id); reload(); } catch { toast.show('삭제에 실패했습니다', 'error'); }
  };

  if (notices.length === 0 && !canManage) return null;

  return (
    <section className="rounded-aura border border-accent-400/30 bg-gradient-to-br from-accent-300/[0.06] to-transparent overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 border-b border-accent-400/20">
        <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-200">
          매장 공지 <span className="text-2xs text-ink-muted font-normal">({notices.length})</span>
        </h3>
        {canManage && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-2xs text-accent-200 hover:text-accent-100 font-semibold">
            {open ? '닫기' : '+ 공지 작성'}
          </button>
        )}
      </header>

      {canManage && open && (
        <div className="p-2.5 border-b border-border-subtle space-y-2">
          <textarea
            value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} rows={2}
            placeholder="매장 손님에게 전할 공지를 작성하세요"
            className="input w-full resize-none text-sm"
          />
          <div className="flex justify-end">
            <button type="button" onClick={submit} disabled={busy || !draft.trim()} className="btn-primary px-4 text-xs disabled:opacity-60">등록</button>
          </div>
        </div>
      )}

      {notices.length === 0 ? (
        <p className="py-3 text-center text-2xs text-ink-muted">등록된 공지가 없습니다</p>
      ) : (
        <ul>
          {notices.map((n) => (
            <li key={n.id} className="px-3 py-2 border-b border-border-subtle last:border-b-0">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-xs text-ink-primary whitespace-pre-wrap break-words leading-relaxed">{n.content}</p>
                {canManage && (
                  <button type="button" onClick={() => remove(n.id)} className="shrink-0 text-2xs text-ink-muted hover:text-danger-light">삭제</button>
                )}
              </div>
              <p className="mt-1 text-2xs text-ink-muted">{n.authorName} · {new Date(n.createdAt).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SchedulesPanel({ schedules, onSelect }: { schedules: Schedule[]; onSelect?: (s: Schedule) => void }) {
  if (schedules.length === 0) {
    return <EmptyState title="예정된 토너먼트가 없습니다." hint="매장을 팔로우하면 새 일정이 등록될 때 알려드려요." />;
  }
  const dows = ['일','월','화','수','목','금','토'];
  return (
    <ul className="space-y-2">
      {schedules.map((s) => {
        const d = new Date(s.date);
        return (
          <li key={s.id} onClick={() => onSelect?.(s)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(s); } }}
            className="flex items-center gap-3 p-3 rounded-input bg-surface-high border border-border-subtle cursor-pointer hover:border-accent-400/40 focus:outline-none focus-visible:border-accent-300 transition-colors">
            <div className="text-center shrink-0">
              <p className="text-2xs text-ink-muted">{dows[d.getDay()]}</p>
              <p className="text-lg font-bold text-accent-200 tabular-nums leading-none">{d.getDate()}</p>
              <p className="text-2xs text-ink-muted">{d.getMonth() + 1}월</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-primary truncate">{s.title}</p>
              <p className="text-2xs text-ink-muted mt-0.5">
                {s.startTime} · {s.duration}{s.buyIn.amount > 0 ? ` · 바이인 ${s.buyIn.amount.toLocaleString()}` : ''}
              </p>
            </div>
            <span className={[
              'shrink-0 text-2xs font-bold px-1.5 py-0.5 rounded-badge border',
              s.format === 'MTT'    && 'bg-blue-500/15   text-blue-400   border-blue-500/30',
              s.format === 'SNG'    && 'bg-purple-500/15 text-purple-400 border-purple-500/30',
              s.format === 'PKO'    && 'bg-teal-500/15   text-teal-400   border-teal-500/30',
              s.format === 'Bounty' && 'bg-amber-500/15  text-amber-400  border-amber-500/30',
              s.format === 'Mix'    && 'bg-pink-500/15   text-pink-400   border-pink-500/30',
            ].filter(Boolean).join(' ')}>
              {s.format}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
