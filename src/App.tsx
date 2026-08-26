import { useState, useCallback, useMemo, useEffect, useRef, useLayoutEffect, useTransition, startTransition, Suspense, memo, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { withViewTransition } from './lib/viewTransition';
import { getAppSetting } from './api/settings';
import { useToast } from './components/atoms/Toast';
import { checkIn, getMyCheckinStreak } from './api/checkins';
import { requestBuyin, venueTodayGames, getMyBuyinRequestsToday, subscribeMyBuyinRequests, cancelBuyinRequest, type MyBuyinRequest } from './api/ledger';
import UnreadBadge from './components/atoms/UnreadBadge';
import ViewModeToggle from './components/atoms/ViewModeToggle';
import type { ViewMode } from './components/atoms/ViewModeToggle';
import IntegratedSearchBar, { expandRegions } from './components/features/IntegratedSearchBar';
import type { SearchState } from './components/features/IntegratedSearchBar';
import ScheduleCard from './components/features/ScheduleCard';
import WeeklyBestStrip from './components/features/WeeklyBestStrip';
import ScheduleTable from './components/features/ScheduleTable';
import { getWeeklyMoneyinKings, getRankingsBulk, parsePrizeMan, type WeeklyKing, type RankingEntry } from './api/rankings';
import { getReservationCounts, getMyReservations, type MyReservationRow } from './api/reservations';
import { getVenueRatings } from './api/reviews';
import NotificationPanel from './components/features/NotificationPanel';
import VerifyGateSheet from './components/features/VerifyGateSheet';
import OnboardingSheet from './components/features/OnboardingSheet';
import { decodeSpot, readGtoHash } from './components/features/gto/gtoShare';
import type { DeepGtoInit } from './components/features/gto/useDeepGto';
import type { PosterFormData } from './components/features/PosterFormModal';
import NuriHoldemLogo from './components/atoms/NuriHoldemLogo';
import ThemeToggle from './components/atoms/ThemeToggle';
import { useTheme } from './contexts/ThemeContext';
import { PORTONE_CONFIGURED } from './components/features/IdentityVerificationButton';
import StaffInviteBanner from './components/features/StaffInviteBanner';
import TierCelebration from './components/features/TierCelebration';
import ErrorBoundary from './components/atoms/ErrorBoundary';
import InstallBanner from './components/atoms/InstallBanner';
import { promptLogin, REQUIRE_LOGIN_EVENT, OPEN_POST_FORM_EVENT, ensureVerified } from './lib/requireLogin';
import { tierColor } from './components/atoms/TierBadge';
import ConsentGateModal from './components/features/ConsentGateModal';
import type { PostFormData } from './components/features/PostFormModal';
import type { MarketplaceFormData } from './components/features/MarketplaceFormModal';
import { rearmLayer, useBackClose, overlayJustClosed } from './lib/backstack';
import { useVisibilityRefresh } from './lib/useVisibilityRefresh';
import { useScrollY } from './lib/useScrollY';
import { lazyWithReload } from './lib/lazyWithReload';
import { getRunningClocks, type ClockState } from './api/clock';
import { buildRegInfoMap } from './lib/regStatus';
import { myVisitedVenues } from './api/vouchers';
import { haversineKm } from './lib/geo';
import { compareByStartThenBoost } from './lib/scheduleSort';
import { readSnap, writeSnap } from './lib/snapshot';
import { applyScheduleSeo, applyVenueSeo, resetSeo } from './lib/seo';
import { createUndoQueue } from './lib/undoableDelete';
import { scheduleStatus } from './lib/scheduleStatus';
import LoadErrorCard from './components/atoms/LoadErrorCard';
import { SpringButton } from './components/atoms/StatefulActionButton';
import { useAuth } from './contexts/AuthContext';
import { listAllUsers, updateUserStatus, approveOwner } from './api/auth';
import { bumpScheduleView,
  getSchedules, createSchedule, updateSchedule, deleteSchedule, subscribeSchedules,
} from './api/schedules';
import { getPostById,
  getVenues, getComments, getPosts, addComment, addPost, togglePostLike, deletePost, subscribePosts, subscribeComments,
  updateVenueDescription, updateVenueImage, updateVenueImages, deleteComment, logActivity,
  getMyFollowedVenueIds,
} from './api/community';
import { getListings, getNotices, createNotice, updateNotice, deleteNotice, createListing, deleteListing } from './api/marketplace';
import { enablePush, isPushSubscribed, pushSupported } from './api/push';
import { rememberRefCode, pendingRefCode, clearRefCode, recordReferral } from './api/referrals';
import LevelUpWatcher from './components/features/LevelUpCelebration';
import BusinessFooter from './components/features/BusinessFooter';
import { useBlocks } from './contexts/BlockContext';
import type { NoticeFormData } from './components/features/NoticeFormModal';
import type { LegalDoc } from './components/features/LegalDocsModal';
import { getMyNotifications, markNotificationsRead } from './api/notifications';
import { supabase } from './lib/supabase';
import type { User } from './api/auth';
import type { Schedule } from './api/schedules';
import type { Venue, Comment, CommunityPost, PostCategory } from './api/community';
import type { AppNotification } from './api/notifications';
import type { MarketplaceListing, MarketplaceNotice } from './api/marketplace';

// ── 코드 스플리팅: 무거운 탭/오버레이는 지연 로딩(첫 화면 번들에서 분리) ──────────
// 장부·클락·인건비(VenueManageTab/AdminTab), 카카오맵(VenuePage), GTO 엔진(GtoDeepModal)
// 등 첫 화면(일정 탐색)에 불필요한 코드를 별도 청크로 떼어내 초기 로딩을 가볍게 한다.
// 모달류 — 첫 화면에 필요 없으므로 열 때만 로드(메인 번들 축소)
const AuthModal            = lazyWithReload(() => import('./components/features/AuthModal'));
const ScheduleDetailModal  = lazyWithReload(() => import('./components/features/ScheduleDetailModal'));
const PostDetailModal      = lazyWithReload(() => import('./components/features/PostDetailModal'));
const ListingDetailModal   = lazyWithReload(() => import('./components/features/ListingDetailModal'));
const NoticeDetailModal    = lazyWithReload(() => import('./components/features/NoticeDetailModal'));
const PosterFormModal      = lazyWithReload(() => import('./components/features/PosterFormModal'));
const ProfileModal         = lazyWithReload(() => import('./components/features/ProfileModal'));
const GlobalSearchModal    = lazyWithReload(() => import('./components/features/GlobalSearchModal'));
const NoticeFormModal      = lazyWithReload(() => import('./components/features/NoticeFormModal'));
const LegalDocsModal       = lazyWithReload(() => import('./components/features/LegalDocsModal'));
const SupportInquiryModal  = lazyWithReload(() => import('./components/features/SupportInquiryModal'));
const PostFormModal        = lazyWithReload(() => import('./components/features/PostFormModal'));
const MarketplaceFormModal = lazyWithReload(() => import('./components/features/MarketplaceFormModal'));
const AdminTab       = lazyWithReload(() => import('./components/features/AdminTab'));
const CommunityTab   = lazyWithReload(() => import('./components/features/CommunityTab'));
const GtoDeepModal   = lazyWithReload(() => import('./components/features/gto/GtoDeepModal'));
const VenuePage      = lazyWithReload(() => import('./components/features/VenuePage'));
const GroupPage      = lazyWithReload(() => import('./components/features/GroupPage'));
const MarketplaceTab = lazyWithReload(() => import('./components/features/MarketplaceTab'));
const VenueManageTab = lazyWithReload(() => import('./components/features/VenueManageTab'));
const ToolsPanel     = lazyWithReload(() => import('./components/features/ToolsPanel'));
const LiveGamesTab   = lazyWithReload(() => import('./components/features/LiveGamesTab'));

// 최상위 탭은 visitedTabs 로 마운트 유지(display 토글)라, App 재렌더(실시간 데이터·알림 등)마다
// 숨은 탭까지 재렌더됐다. memo 로 감싸 props 안정 시 재렌더 스킵 — 데이터가 실제로 바뀔 때만 갱신.
// ToolsPanel 은 prop 이 없어 마운트 후 재렌더 0. (핸들러는 이미 useCallback, 데이터는 state/useMemo 라 안정)
const LiveGamesTabM   = memo(LiveGamesTab);
const CommunityTabM   = memo(CommunityTab);
const ToolsPanelM     = memo(ToolsPanel);
const VenueManageTabM = memo(VenueManageTab); // 내 매장 keep-alive 전환에 필수 — 숨김 상태에서 App 재렌더에 끌려가지 않게
const CustomerDashboardPage = lazyWithReload(() => import('./components/features/CustomerDashboardPage'));
const ClockDisplay   = lazyWithReload(() => import('./components/features/clock/ClockDisplay'));

// 지연 로딩 폴백 — 청크 받아오는 짧은 순간의 로더(레이아웃 점프 최소화)
function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-24" aria-busy="true" aria-label="불러오는 중">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-ink-secondary" />
    </div>
  );
}
function OverlayFallback() {
  return (
    <div className="fixed inset-0 z-[45] flex items-center justify-center bg-surface-base" aria-busy="true">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-border-strong border-t-ink-secondary" />
    </div>
  );
}

// ── 탭 정의 ──────────────────────────────────────────────────────────────────

type TabId = 'browse' | 'live' | 'community' | 'market' | 'tools' | 'my-store' | 'admin';
interface TabDef { id: TabId; label: string; }

// ── 헤더 ─────────────────────────────────────────────────────────────────────

const AppHeader = memo(function AppHeader({
  unreadCount, notifications, onMarkRead, onOpenLogin, onNavigateNotification, onHome, onOpenProfile, onOpenSearch, onOpenVouchers,
  onGotoTab, activeTab, suppressed = false,
}: {
  /** (미사용 — 텍스트 내비로 대체) 모바일 헤더 좌측 큰 타이틀 */
  title?: string;
  /** 모바일 헤더 텍스트 내비 강조용 현재 탭 */
  activeTab?: TabId;
  /** 프로필 메뉴에서 탭 직접 이동(모바일 탭바에 없는 도구·관리자 설정) */
  onGotoTab?: (t: TabId) => void;
  unreadCount: number;
  notifications: AppNotification[];
  onMarkRead: (ids: string[]) => void;
  onOpenLogin: () => void;
  onNavigateNotification: (n: AppNotification) => void;
  onHome: () => void;
  onOpenProfile: () => void;
  onOpenSearch: () => void;
  onOpenVouchers: () => void;
  /** 매장 페이지 등 풀스크린 오버레이가 열렸을 때 메인 헤더를 가린다(레이아웃 유지, 페인트만 숨김). */
  suppressed?: boolean;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [notifOpen,    setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenu]  = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 모바일 스크롤 축소 — 내리면 헤더가 낮아져 포스터 화면이 넓어진다(useScrollY 공용 구독 — MO-9A)
  // MO-3: 높이 전환이 즉시가 되면서 단일 임계값(48)은 그 부근 미세 스크롤에서
  // 축소↔복원이 덜덜 떨린다 → 히스테리시스 밴드(내릴 때 56 넘어야 축소, 올릴 때 40 밑이어야 복원)
  const [shrunk, setShrunk] = useState(false);
  useScrollY(useCallback((y: number) => {
    setShrunk((prev) => (prev ? y > 40 : y > 56));
  }, []));

  // 프로필 드롭다운: 바깥(다른 버튼 등)을 클릭/터치하면 자동으로 닫는다.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenu(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [userMenuOpen]);

  return (
    <header
      data-stack-header
      aria-hidden={suppressed || undefined}
      className={[
        'sticky top-0 z-50 bg-surface-base border-b border-border-subtle',
        // PWA(노치 기기): 상태바 영역까지 헤더 배경으로 덮음 — 스크롤 시 위로 컨텐츠 비침 방지
        'pt-[env(safe-area-inset-top)]',
        suppressed ? 'invisible pointer-events-none' : '',
      ].join(' ')}
    >
      {/* ── 단순화된 헤더: 좌(로고) / 우(알림+유저) — 모바일은 스크롤 시 축소 ── */}
      <div className={[
        // [DS] MO-3: height 트랜지션 금지 — 200ms 동안 매 프레임 문서 전체 리레이아웃(+RO 연쇄 재측정)이
        // 스크롤과 겹쳐 얀크의 주범이었다. 즉시 전환 = 리레이아웃 1회. (§20.5 #1 height 애니 금지)
        'flex items-center justify-between px-page-x',
        shrunk ? 'h-11 md:h-header-h' : 'h-header-h',
      ].join(' ')}>

        {/* LEFT: PC=로고 / 모바일=현재 탭 큰 타이틀(Riot Mobile 스타일) */}
        <button
          type="button"
          onClick={onHome}
          aria-label="메인으로 이동"
          className="hidden lg:block active:scale-95 transition-transform origin-left"
        >
          <NuriHoldemLogo />
        </button>
        {/* 모바일: 로고 │ 현재 위치(지금 보고 있는 탭) — 로고 클릭=일정 복귀 */}
        <div className="lg:hidden flex min-w-0 items-center gap-2">
          <button type="button" onClick={onHome} aria-label="일정 탐색으로" className="press-spring shrink-0">
            <NuriHoldemLogo className="!h-7" />
          </button>
          <span className="h-4 w-px shrink-0 bg-border-default" aria-hidden />
          <span className="min-w-0 truncate text-base font-extrabold tracking-tight text-ink-primary" aria-current="page">
            {({ browse: '일정 탐색', live: '라이브', community: '커뮤니티', market: '중고장터', tools: '도구', 'my-store': '내 매장', admin: '관리자 설정' } as Record<string, string>)[activeTab ?? 'browse'] ?? '일정 탐색'}
          </span>
        </div>

        {/* RIGHT: 테마 토글 + 알림 + 로그인/아바타 — 동일 36px 원형 버튼 클러스터 */}
        <div className="flex items-center gap-0.5">
          {/* 통합 검색 */}
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="통합 검색"
            className="hit w-9 h-9 flex items-center justify-center rounded-full text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </button>
          {/* 라이트/다크 모드 전환 */}
          <ThemeToggle className="hidden lg:flex" />

          {/* 알림 벨 — 솔리드 디자인 + 명확한 클릭 영역 */}
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label={`알림 ${unreadCount}개`}
            aria-expanded={notifOpen}
            className={[
              'relative w-9 h-9 flex items-center justify-center rounded-full',
              'transition-colors duration-200 ease-out active:scale-90',
              notifOpen
                ? 'bg-surface-high text-accent-300'
                : unreadCount > 0
                ? 'text-accent-300 hover:bg-surface-high'              // 미읽음: 골드 포인트
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-high',
            ].join(' ')}
          >
            {/* 깔끔한 라인형 종(Bell) 아이콘 (lucide 스타일) */}
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <UnreadBadge count={unreadCount} className="absolute -top-0.5 -right-0.5 ring-2 ring-surface-base" />
          </button>

          {/* 내 매장이용권 지갑 */}
          {user && (
            <button
              type="button"
              onClick={onOpenVouchers}
              aria-label="내 대시보드 (예약·이용권·전적)"
              className="w-9 h-9 flex items-center justify-center rounded-full text-ink-secondary hover:text-accent-300 hover:bg-surface-high transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v14" /></svg>
            </button>
          )}

          {/* 로그인 / 유저 메뉴 */}
          {user ? (
            <div ref={userMenuRef} className="relative">
              {/* 아바타 버튼 — 사진 있으면 이미지, 없으면 색상 이니셜
                  [모바일 접근성] 보이는 아바타는 36px 유지하되, 터치 영역(버튼)을
                  44x44px로 확장(WCAG 2.5.5 최소 타깃). -mr-1로 우측 페이지 여백 정렬 보정. */}
              <button
                type="button"
                onClick={() => setUserMenu((v) => !v)}
                aria-label={`${user.name} 메뉴`}
                className="group relative w-11 h-11 -mr-1 flex items-center justify-center rounded-full focus:outline-none"
              >
                {/* 알림 벨이 모바일에서도 보이므로(숫자 배지 포함) 아바타 점은 제거 */}
                {/* 보이는 아바타 32px(이미지/이니셜) — 터치영역은 44px 유지(WCAG) */}
                {/* 아바타 테두리 = 활동 등급색(운영자=빨강). 별도 22 배지 대신 테두리로 표현 */}
                <span
                  className={`relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center
                             select-none transition-transform group-hover:scale-105 group-active:scale-90 ${
                               user.role === 'admin' ? 'tier-glow-admin' : (user.activityPoints ?? 0) >= 14000 ? 'tier-glow-ace' : ''
                             }`}
                  style={{ background: user.avatarColor ?? '#5A6175', boxShadow: `0 0 0 2px ${tierColor(user.activityPoints ?? 0, user.role === 'admin')}, 0 0 10px ${tierColor(user.activityPoints ?? 0, user.role === 'admin')}aa` }}
                  title="내 등급"
                >
                  <span className="text-xs font-bold text-white">{user.name[0]}</span>
                  {user.avatarUrl && (
                    <img src={user.avatarUrl} alt={user.name}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      className="absolute inset-0 w-full h-full object-cover" />
                  )}
                </span>
              </button>

              {/* 드롭다운 메뉴 */}
              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-56 bg-surface-mid border border-border-default rounded-card shadow-dialog animate-slide-up z-50 overflow-hidden"
                >
                  {/* 사용자 정보 헤더 — 행 전체가 클릭/터치 영역(빈 여백 포함)이 되도록 button으로 확장 */}
                  <button
                    type="button"
                    onClick={() => { onOpenProfile(); setUserMenu(false); }}
                    aria-label="프로필 관리 열기"
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 border-b border-border-subtle
                               hover:bg-surface-high transition-colors focus:outline-none"
                  >
                    <div
                      className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: user.avatarColor ?? '#5A6175' }}
                    >
                      <span>{user.name[0]}</span>
                      {user.avatarUrl && (
                        <img src={user.avatarUrl} alt=""
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          className="absolute inset-0 w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-primary truncate">{user.name}</p>
                      <p className="text-2xs text-ink-muted truncate">{user.email}</p>
                    </div>
                  </button>

                  {/* 모바일 전용 — 헤더에서 빠진 알림/이용권/테마를 메뉴로 제공 */}
                  <div className="lg:hidden border-b border-border-subtle">
                    <button type="button" onClick={() => { setNotifOpen(true); setUserMenu(false); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-xs text-ink-secondary hover:bg-surface-high hover:text-ink-primary transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                      알림{unreadCount > 0 && <span className="ml-auto rounded-badge bg-accent-300 px-1.5 py-0.5 text-2xs font-bold text-white tabular-nums">{unreadCount}</span>}
                    </button>
                    <button type="button" onClick={() => { onOpenVouchers(); setUserMenu(false); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-xs text-ink-secondary hover:bg-surface-high hover:text-ink-primary transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v14" /></svg>
                      내 대시보드 <span className="text-ink-muted">(예약·이용권·전적)</span>
                    </button>
                    <button type="button" onClick={() => { onGotoTab?.('tools'); setUserMenu(false); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-xs text-ink-secondary hover:bg-surface-high hover:text-ink-primary transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.8-.7-.7-2.8 2.5-2.5Z" /></svg>
                      도구
                    </button>
                    {user.role === 'admin' && (
                      <button type="button" onClick={() => { onGotoTab?.('admin'); setUserMenu(false); }}
                        className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-xs text-ink-secondary hover:bg-surface-high hover:text-ink-primary transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
                        관리자 설정
                      </button>
                    )}
                    <button type="button" onClick={() => { toggleTheme(); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-xs text-ink-secondary hover:bg-surface-high hover:text-ink-primary transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
                      {theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
                    </button>
                  </div>

                  {/* 프로필 관리 */}
                  <button
                    type="button"
                    onClick={() => { onOpenProfile(); setUserMenu(false); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-xs
                               text-ink-secondary hover:bg-surface-high hover:text-ink-primary transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    프로필 관리
                  </button>

                  {/* 로그아웃 */}
                  <button
                    type="button"
                    onClick={() => { logout(); setUserMenu(false); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-xs
                               text-ink-secondary hover:bg-surface-high hover:text-ink-primary transition-colors
                               border-t border-border-subtle"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    로그아웃
                  </button>
                </div>
              )}

            </div>
          ) : (
            <SpringButton onClick={onOpenLogin} ariaLabel="로그인"
              className="btn-primary !h-7 !min-h-0 !px-2.5 !py-0 text-2xs shadow-none">
              로그인
            </SpringButton>
          )}
        </div>
      </div>

      {/* 알림 패널 — viewport 기준 fixed 위치 */}
      <NotificationPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onMarkRead={onMarkRead}
        onNavigate={onNavigateNotification}
      />
    </header>
  );
});

// ── 탭 바 ─────────────────────────────────────────────────────────────────────

/* [UI/UX 점검 및 자가 진단] GNB 밑줄 정렬 (요구사항 4-GNB)
 *  - 버그 원인: 기존엔 'border-b-2'(버튼 하단 테두리)를 버튼 셀 전체 폭에 깔았는데,
 *    버튼이 'px-5'(좌우 비대칭 X지만)로 셀 폭이 라벨보다 넓어, 첫 탭(일정탐색)은
 *    좌패딩0 → 우측으로, 마지막 탭(중고장터)은 우패딩0 → 좌측으로 쏠려 보였음.
 *  - 수정: border 제거. 라벨을 inline-flex 래퍼로 감싸고, 밑줄을 '라벨 글자 폭'에
 *    맞춘 absolute span(inset-x-0)으로 깔아 모든 탭에서 글자 정중앙에 정렬.
 *  - 비활성도 transparent 밑줄을 유지 → 활성 전환 시 색만 바뀌어 레이아웃 흔들림 0.
 *  - 예외: 탭이 화면보다 넓어지면 overflow-x-auto로 가로 스크롤(레이아웃 안전).
 */
// 메인 탭 아이콘(라인 스타일 통일: 15px, stroke 1.8)
const tabIcon = (children: ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const TAB_ICON: Record<TabId, ReactNode> = {
  browse: tabIcon(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  live: tabIcon(<><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" /></>),
  community: tabIcon(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />),
  market: tabIcon(<><path d="M3 6h18l-1.6 11.2A2 2 0 0 1 17.4 19H6.6a2 2 0 0 1-2-1.8L3 6Z" /><path d="M8.5 6V5a3.5 3.5 0 0 1 7 0v1" /></>),
  tools: tabIcon(<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.8-.7-.7-2.8 2.5-2.5Z" />),
  'my-store': tabIcon(<><path d="M3 9.5 5 4h14l2 5.5" /><path d="M4 9.5V20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5" /><path d="M9 21v-6h6v6" /></>),
  admin: tabIcon(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />),
};

const TabBar = memo(function TabBar({
  tabs, active, onChange,
}: { tabs: TabDef[]; active: TabId; onChange: (t: TabId) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelRefs    = useRef<Record<string, HTMLSpanElement | null>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  // 활성 탭 '라벨'의 위치/너비를 측정 → 단일 밑줄 바를 그 위치로 슬라이드.
  // (탭 선택 상태/onChange 로직은 일절 변경하지 않고 시각 인디케이터 레이어만 추가)
  const measure = useCallback(() => {
    const container = containerRef.current;
    const labelEl   = labelRefs.current[active];
    if (!container || !labelEl) return;
    const c = container.getBoundingClientRect();
    const l = labelEl.getBoundingClientRect();
    setIndicator({ left: l.left - c.left + container.scrollLeft, width: l.width });
  }, [active]);

  useLayoutEffect(() => { measure(); }, [measure, tabs]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div
      ref={containerRef}
      data-stack-tabbar=""
      // 모바일은 하단 탭바(MobileTabBar)가 내비 담당 — 상단 GNB는 PC(lg+) 전용
      className="sticky top-header-h z-40 bg-surface-base relative hidden lg:flex border-b border-border-subtle overflow-x-auto scrollbar-none px-page-x sm:justify-center"
    >
      {tabs.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={[
              // 모바일: flex-1로 컨테이너 폭을 균등 분배(좌측 쏠림 제거) → 라벨은 셀 정중앙.
              //   min-width:auto(기본) 유지 → 탭이 많아 좁아지면 라벨 폭 이하로 줄지 않고 가로 스크롤(겹침 방지).
              // 데스크톱(sm+): 자연폭 + 컨테이너 sm:justify-center로 중앙 정렬 그룹(과도한 벌어짐 방지).
              'flex-1 px-2 sm:flex-none sm:px-5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 focus:outline-none touch-manipulation rounded-t-input',
              isActive ? 'text-accent-300' : 'text-ink-muted hover:text-ink-secondary',
            ].join(' ')}
          >
            <span
              ref={(el) => { labelRefs.current[id] = el; }}
              className="relative inline-flex items-center justify-center gap-1.5"
            >
              <span className="shrink-0" aria-hidden>{TAB_ICON[id]}</span>
              {label}
            </span>
          </button>
        );
      })}

      {/* 단일 슬라이딩 밑줄 인디케이터 — 활성 탭 라벨 폭/위치로 부드럽게 이동(중앙 정렬) */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-accent-300
                   shadow-[0_0_8px_rgba(94,106,210,0.5)]
                   transition-[left,width] duration-300 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  );
});

// ── 모바일 하단 탭바(Riot Mobile 스타일) — 플로팅 알약 + 아이콘/라벨 + 프레스 스프링 ──
const MobileTabBar = memo(function MobileTabBar({ tabs, active, onChange, dot, count, onOpenMe }: {
  tabs: TabDef[]; active: TabId; onChange: (t: TabId) => void;
  dot?: Partial<Record<TabId, boolean>>;
  /** 숫자 배지(예: 라이브 'N게임 진행중') — dot 보다 정보량이 높은 칸에만 */
  count?: Partial<Record<TabId, number>>;
  /** 일반 유저 5번째 칸 '내 정보'(개인 대시보드 — 비로그인이면 로그인 유도) */
  onOpenMe: () => void;
}) {
  // 5칸 고정: 일정/라이브/커뮤니티/장터 + (업주·직원·관리자=내 매장 | 일반=내 정보)
  // 관리자 설정·도구는 프로필 메뉴에서 진입(탭바는 핵심 동선만)
  const hasStore = tabs.some((t) => t.id === 'my-store');
  // 유튜브식 자동 숨김 — TB2 재작성(§13-A): 이벤트 델타 임계(속도 의존)가 4가지로 고장나 있었다.
  // ①느린 끌기는 무판정 구간에 머물러 바닥까지 탭바가 안 숨고 ②문서끝 감지 부재(삼성 '맨 위로'와 겹침)
  // ③iOS 고무줄·툴바 개폐가 가짜 음수 dy 를 만들고 ④탭 복원(behavior:'instant')의 거대 dy 가 탭바를 증발시켰다.
  // OBS-8 킬스위치: app_settings.tabbar_autohide_v2 = 'off' → 구 동작 복구(앱 재접속만으로, 재배포 불필요).
  const [hidden, setHidden] = useState(false);
  const [autohideV2, setAutohideV2] = useState(true);
  useEffect(() => { getAppSetting('tabbar_autohide_v2').then((v) => { if (v === 'off') setAutohideV2(false); }).catch(() => {}); }, []);
  // 탭 전환 억제창 — 자식 layoutEffect 가 부모(App)의 복원 스크롤보다 먼저 실행되므로
  // 복원 이벤트 도착 전에 창이 열려 순서가 보장된다. |dy| 크기 추정은 빠른 플링(프레임당 200px+)을 삼키므로 금지.
  const suppressUntil = useRef(0);
  const tb2Ref = useRef({ lastY: 0, acc: 0 });
  useLayoutEffect(() => { suppressUntil.current = performance.now() + 300; }, [active]);
  useEffect(() => {
    if (!autohideV2) {
      // 구(레거시) 경로 — 킬스위치 off 시 그대로 복구
      let lastY = window.scrollY;
      const onScroll = () => {
        const y = window.scrollY;
        const dy = y - lastY;
        if (y < 80) setHidden(false);
        else if (dy > 14) setHidden(true);
        else if (dy < -8) setHidden(false);
        lastY = y;
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }
    // MO-9A: 공용 useScrollY 브로드캐스트에 합류(별도 리스너·rAF 가드 제거 — 훅이 프레임당 1회 보장)
    tb2Ref.current = { lastY: window.scrollY, acc: 0 };
    const resync = () => { tb2Ref.current = { lastY: window.scrollY, acc: 0 }; };
    window.addEventListener('resize', resync);
    window.visualViewport?.addEventListener('resize', resync);
    return () => { window.removeEventListener('resize', resync); window.visualViewport?.removeEventListener('resize', resync); };
  }, [autohideV2]);
  useScrollY(useCallback((sy: number) => {
    if (!autohideV2) return; // 킬스위치 off — 레거시 리스너가 담당
    const st = tb2Ref.current;
    if (performance.now() < suppressUntil.current) { st.lastY = sy; st.acc = 0; return; }
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max < 200) { setHidden(false); st.lastY = sy; st.acc = 0; return; }  // 짧은 화면 — 내비 영구 소멸·깜빡임 방지
    const cy = Math.min(Math.max(sy, 0), max);                               // 고무줄·툴바 개폐 클램프 흡수
    const dy = cy - st.lastY; st.lastY = cy;
    if (cy >= max - 4) { setHidden(true); st.acc = 0; return; }              // 문서 끝 — 무조건 숨김(삼성 버튼과 시간축 배타)
    if (cy < 80) { setHidden(false); st.acc = 0; return; }
    st.acc = (dy > 0) === (st.acc > 0) ? st.acc + dy : dy;                   // 방향 바뀌면 리셋되는 누적 — 느린 끌기도 판정
    if (st.acc > 48) { setHidden(true); st.acc = 0; }
    else if (st.acc < -24) { setHidden(false); st.acc = 0; }
  }, [autohideV2]));
  // 장터는 커뮤니티 서브탭으로 이동(사용 빈도 기준) — 탭바 4번째 칸은 도구
  const items: { key: string; tab?: TabId; label: string }[] = [
    { key: 'browse', tab: 'browse', label: '일정' },
    { key: 'live', tab: 'live', label: '라이브' },
    { key: 'community', tab: 'community', label: '커뮤니티' },
    { key: 'tools', tab: 'tools', label: '도구' },
    hasStore ? { key: 'my-store', tab: 'my-store', label: '내 매장' } : { key: 'me', label: '내 정보' },
  ];
  // 장터 화면에선 '커뮤니티' 칸을 활성으로(장터 진입 경로가 커뮤니티)
  const mappedActive: TabId = active === 'market' ? 'community' : active;
  // 낙관적 활성 — 클릭 즉시 인디케이터가 미끄러지고, 실제 탭 커밋(transition) 후 동기화
  const [optimistic, setOptimistic] = useState<TabId | null>(null);
  useEffect(() => { setOptimistic(null); }, [active]);
  const shown: TabId = optimistic ?? mappedActive;
  const ME_ICON = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
  return (
    <nav
      className={['fixed inset-x-0 bottom-0 z-50 lg:hidden pointer-events-none transition-transform duration-300',
        hidden ? 'translate-y-[120%]' : 'translate-y-0'].join(' ')}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', transitionTimingFunction: 'var(--ease)' }}
      aria-label="하단 내비게이션"
    >
      {/* 탭바 밖(좌우·아래) 틈으로 스크롤 컨텐츠가 비치지 않게 — 베이스색 그라데이션 커튼 */}
      <div aria-hidden className="absolute inset-x-0 -top-3 bottom-0 bg-gradient-to-t from-surface-base via-surface-base/90 to-transparent" />
      <div className="pointer-events-auto mx-2.5 mb-2 flex rounded-2xl border border-border-default bg-surface-mid shadow-dialog">
        {items.map(({ key, tab, label }) => {
          const on = tab ? shown === tab : false;
          return (
            <button
              key={key} type="button"
              // 같은 탭 재탭 = 맨 위로(iOS 관례). 다른 탭 이동은 changeTab 의 스크롤 저장/복원이 맡는다 —
              // 예전엔 무조건 맨 위로 튕겨서, 목록을 한참 내려 보다 다른 탭을 잠깐 다녀오면 위치를 전부 잃었다.
              onClick={() => { if (tab) { if (tab === shown) { window.scrollTo({ top: 0, behavior: 'smooth' }); } else { setOptimistic(tab); onChange(tab); } } else onOpenMe(); }}
              aria-current={on ? 'page' : undefined}
              className="press-spring flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 touch-manipulation focus:outline-none"
            >
              {/* 아이콘 22px · 라벨 11px — 공백 줄이고 또렷하게 */}
              <span className={['relative flex h-7 w-12 items-center justify-center rounded-full [&_svg]:h-[21px] [&_svg]:w-[21px] transition-colors duration-200',
                on ? 'text-accent-300 animate-tab-bounce' : 'text-ink-secondary'].join(' ')}>
                {/* 활성 알약 — 각 칸이 자기 핀을 갖고 opacity 만 토글(transform·layout 0). 전환 시 크로스페이드 */}
                <span aria-hidden
                  className={['pointer-events-none absolute inset-0 rounded-full bg-accent-300/15 transition-opacity duration-200',
                    on ? 'opacity-100' : 'opacity-0'].join(' ')} />
                {tab ? TAB_ICON[tab] : ME_ICON}
                {tab && dot?.[tab] && !on && <span className="absolute right-2 top-0.5 h-1.5 w-1.5 rounded-full bg-accent-300" aria-hidden />}
                {tab && (count?.[tab] ?? 0) > 0 && (
                  <span aria-label={`진행 중 ${count![tab]}게임`}
                    className="absolute -top-0.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-extrabold tabular-nums text-white ring-2 ring-surface-mid">
                    {count![tab]}
                  </span>
                )}
              </span>
              <span className={['text-[11px] font-bold leading-none transition-colors duration-200',
                on ? 'text-accent-300' : 'text-ink-secondary'].join(' ')}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

// ── 승인 대기 배너 ───────────────────────────────────────────────────────────

function PendingApprovalBanner() {
  const { user } = useAuth();
  if (user?.role !== 'venue_owner' || user.approved) return null;
  return (
    <div className="px-page-x py-2 bg-amber-500/10 border-b border-amber-500/30 text-center">
      <p className="text-xs text-amber-400">
        매장 업주 승인 대기 중 — 승인 완료 후 포스터 업로드가 가능합니다
      </p>
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────

// 데스크탑(lg+) 여부 — 일정탐색 2-pane 분기용
export default function App() {
  const { user, isAdmin, isOwner, loading: authLoading } = useAuth();
  const toast = useToast();

  // UI 상태
  const [viewMode, setViewMode]       = useState<ViewMode>('list');
  // 일정탐색 FOMO — 예약자 수(예약 N명 · 마감 임박 뱃지)
  const [browseResCounts, setBrowseResCounts] = useState<Record<string, number>>({});
  // 매장 후기 별점(체크인 인증) — 카드 매장명 옆 ⭐4.8(12)
  const [venueRatings, setVenueRatings] = useState<Record<string, { avg: number; count: number }>>({});
  // (별점 로드는 loadDeferred 로 이동 — 부팅 임계경로에서 제외)
  // 알림 딥링크 → 내 매장 탭의 특정 섹션(예: 📒 장부 시작 → 장부)
  const [myStoreDeep, setMyStoreDeep] = useState<'ledger' | null>(null);
  const [buyinPick, setBuyinPick] = useState<{ venueId: string; games: { gameSeq: number; title: string }[] } | null>(null); // 바인요청 게임 선택
  const [myBuyinReqs, setMyBuyinReqs] = useState<MyBuyinRequest[]>([]); // 손님 본인 오늘 바인요청(상태 배너)
  const [updateReady, setUpdateReady] = useState(false); // 새 버전(SW) 감지 → 새로고침 배너
  const [pushNudge, setPushNudge] = useState(false); // 운영자 푸시 권한 온보딩 배너(설치형·1회)
  // 시작 탭 — PWA 바로가기(?tab=)·딥링크 지원(앱 아이콘 길게 누르기 메뉴)
  const [activeTab, setActiveTab]     = useState<TabId>(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab');
      const valid: TabId[] = ['browse', 'live', 'community', 'market', 'tools', 'my-store', 'admin'];
      if ((valid as string[]).includes(t ?? '')) return t as TabId;
      // 16-2 마지막 탭 복원 — 우선순위: 딥링크 > 마지막 탭 > 온보딩 persona 기본.
      // Phase 4-3 의 탭별 스크롤 복원과 결합되어 '어제 보던 그 자리'로 돌아간다.
      const last = localStorage.getItem('nuri:last-tab');
      if ((valid as string[]).includes(last ?? '') && last !== 'admin') return last as TabId;
      if (localStorage.getItem('nuri:persona') === 'gto') return 'tools';
      return 'browse';
    } catch { return 'browse'; }
  });
  // 탭 전환을 트랜지션으로 — lazy 청크/무거운 렌더 동안 이전 화면을 유지해
  // '이전 메뉴 → 스피너 깜빡 → 새 메뉴' 3단 플래시를 없앤다(React 공식 패턴).
  const [, startTabTransition] = useTransition();
  const closeOverlaysRef = useRef<(() => void) | null>(null);
  // 탭 전환은 즉시 스왑(인스타·유튜브 문법) — 컨텐츠 페이드·슬라이드는 큰 면적에서 '깜빡임'으로 인지돼 전부 제거.
  // 모션은 알약 인디케이터(layoutId)가 전담한다.
  // 탭별 스크롤 위치 — keep-alive 로 DOM 은 남지만 스크롤러가 window(html) 하나라
  // 탭을 오가면 위치가 섞였다. 떠날 때 저장하고 도착하면 되돌린다.
  const tabScrollRef = useRef(new Map<TabId, number>());
  const activeTabRef = useRef<TabId>('browse');
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  const changeTab = useCallback((t: TabId) => {
    // 탭 이동은 '화면 전환' — 떠 있는 매장 페이지 오버레이는 닫는다(탭을 눌렀는데 그대로 보이는 혼란 방지)
    closeOverlaysRef.current?.();
    tabScrollRef.current.set(activeTabRef.current, window.scrollY);
    try { localStorage.setItem('nuri:last-tab', t); } catch { /* noop */ } // 16-2 재방문 복원용
    // 메이저 사이트의 '부드러움'은 전환 커밋 비용이 0이라서가 아니라, 스냅샷 크로스페이드가
    // 무거운 프레임을 가리기 때문이다(View Transition). 재방문 탭(keep-alive)은 동기 커밋이
    // 가능하므로 flushSync 를 트랜지션 콜백 안에서 돌려 display 토글·스크롤 복원 비용 전부를
    // 이전 화면 스냅샷 '뒤에서' 치르고, 완성된 새 화면으로 180ms 크로스페이드만 보여준다.
    // 첫 방문(lazy 청크)은 Suspense 가 끼므로 기존 startTransition 유지(이전 화면 유지 효과 동일).
    if (visitedTabs.has(t)) {
      // 애플식 방향성: 탭바에서 오른쪽 탭으로 가면 새 화면이 오른쪽에서 밀려 들어온다(반대는 반대).
      const ORDER: TabId[] = ['browse', 'live', 'community', 'tools', 'my-store', 'admin'];
      const from = ORDER.indexOf(activeTabRef.current);
      const to = ORDER.indexOf(t);
      withViewTransition(
        () => { flushSync(() => setActiveTab(t)); },
        () => startTabTransition(() => setActiveTab(t)),
        to >= from ? 'forward' : 'back',
      );
    } else {
      startTabTransition(() => setActiveTab(t));
    }
    // visitedTabs 는 안정 Set 인스턴스(useState 초기화) — 참조 불변
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 복원은 layout 단계에서 — 페인트 전에 위치를 잡아야 '맨 위가 번쩍했다가 내려가는' 깜빡임이 없다.
  // keep-alive 라 재방문 탭의 DOM 높이는 이미 존재한다(복원 위치가 잘릴 일 없음).
  useLayoutEffect(() => {
    window.scrollTo({ top: tabScrollRef.current.get(activeTab) ?? 0, behavior: 'instant' as ScrollBehavior });
  }, [activeTab]);

  // keep-alive: 한 번 방문한 핵심 탭은 언마운트하지 않고 display만 끈다 — 재방문 시 로드·마운트 비용 0(끊김 제거)
  const [visitedTabs] = useState(() => new Set<TabId>(['browse']));
  useEffect(() => { visitedTabs.add(activeTab); }, [activeTab, visitedTabs]);
  // 프리마운트 커밋 트리거 — visitedTabs 는 렌더를 못 깨우는 가변 Set 이라 상태 범프가 필요
  const [, setPremountTick] = useState(0);

  // 17-5 오프라인·재연결 — 홀덤펍은 지하 매장이 많다: 단절이 예외가 아니라 일상 조건.
  // 캐시 퍼스트(Phase 6) 덕에 화면은 살아 있으므로, 배너로 상태만 알리고
  // 재연결 시 현재 탭 데이터를 조용히 재검증한다.
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  useEffect(() => {
    const onOff = () => setOffline(true);
    const onOn = () => {
      setOffline(false);
      reloadSchedules(); reloadVenues(); reloadNotices();
      if (user) getMyNotifications().then(setNotifications).catch(() => {});
    };
    window.addEventListener('offline', onOff);
    window.addEventListener('online', onOn);
    return () => { window.removeEventListener('offline', onOff); window.removeEventListener('online', onOn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // 온보딩 1문답(persona) → 즉시 탭 전환 이벤트 수신 (Phase 13-4)
  useEffect(() => {
    const h = (e: Event) => {
      const t = (e as CustomEvent).detail as TabId;
      if (t) changeTab(t);
    };
    window.addEventListener('nuri:goto-tab', h);
    return () => window.removeEventListener('nuri:goto-tab', h);
  }, [changeTab]);

  // 새 버전(배포) 감지(main.tsx의 SW updatefound) → 새로고침 배너
  useEffect(() => {
    const onUpd = () => setUpdateReady(true);
    window.addEventListener('nuri:sw-update', onUpd);
    return () => window.removeEventListener('nuri:sw-update', onUpd);
  }, []);
  // 푸시 온보딩 — 설치형(앱)에서 알림 미설정 시 1회 안내.
  // 예전엔 운영자 전용 게이트라 손님은 푸시의 존재조차 몰랐다 — 리마인더·이용권 도착이
  // 앱 안에 갇히는 원인. 로그인한 모두에게 열고 문구만 역할별로 바꾼다.
  useEffect(() => {
    if (!user || !pushSupported()) return;
    try { if (localStorage.getItem('nuri:push-nudge-dismissed') === '1') return; } catch { /* noop */ }
    if (!window.matchMedia('(display-mode: standalone)').matches) return; // 설치형에서만
    isPushSubscribed().then((sub) => { if (!sub) setPushNudge(true); }).catch(() => {});
  }, [user, isOwner, isAdmin]);
  const doEnablePush = async () => {
    try { await enablePush(); setPushNudge(false); toast.show('알림을 켰습니다 — 중요한 소식을 폰으로 받습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '알림 설정 실패', 'error'); }
  };
  const dismissPushNudge = () => { setPushNudge(false); try { localStorage.setItem('nuri:push-nudge-dismissed', '1'); } catch { /* noop */ } };
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setGlobalSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // 일정탐색 기본값 — 무선택('오늘부터 앞으로'). 예전 '오늘' 기본 선택은 심야·평일 오전
  // 첫 방문을 빈 화면으로 만들었고, 프리스틴 상태가 '필터 걸림'으로 판정되는 부작용도 있었다.
  const [searchState, setSearchState] = useState<SearchState>({ query: '', dates: [], regions: [], format: null, gtdOnly: false, competitionOnly: false, grade: null, budget: null });
  // 전체 초기화 버튼을 '총 N개' 줄에 두기 위해 검색바의 clearAll 을 ref 로 끌어올림
  const searchBarRef = useRef<{ clearAll: () => void } | null>(null);
  const hasActiveSearchFilter = !!(searchState.query || searchState.dates.length || searchState.regions.length || searchState.format || searchState.gtdOnly || searchState.competitionOnly || searchState.grade);
  const [authOpen, setAuthOpen]       = useState(false);
  const [authMode, setAuthMode]       = useState<'login' | 'signup-user'>('login'); // QR 회원가입 진입용
  const [openVenueId, setOpenVenueId] = useState<string | null>(null);
  // changeTab(상단 선언)에서 TDZ 없이 오버레이를 닫기 위한 ref 바인딩
  closeOverlaysRef.current = () => setOpenVenueId(null);
  const [openSchedule, setOpenSchedule] = useState<Schedule | null>(null);
  // 포스터 조회수 — 상세가 열리는 모든 경로(카드·검색·배너·딥링크)를 한 곳에서 집계.
  // 세션당 포스터별 1회(새로고침 어뷰징 방지), 실패 무시(장식 지표가 UX 를 막으면 안 된다).
  useEffect(() => {
    const sid = openSchedule?.id;
    if (!sid) return;
    try {
      const k = `nuri:viewed:${sid}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch { /* 스토리지 불가 시 그냥 1회 발사 */ }
    bumpScheduleView(sid).catch(() => {});
  }, [openSchedule?.id]);
  const [displayTarget, setDisplayTarget] = useState<{ venueId: string; gameSeq: number } | null>(null); // 관전/대형 디스플레이
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set()); // 팔로우한 매장 id
  const [followedOnly, setFollowedOnly] = useState(false); // 일정탐색: 팔로우 매장 포스터만
  // 📍 가까운 순(Phase 14 보류 해제 — venues.lat/lng 신설): 위치 1회 요청, 거부 시 지역 필터 안내.
  const [nearSort, setNearSort] = useState(false);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  // 온보딩 '매장 단골' 선택 → 가까운 순을 실제로 켠다('첫 화면을 맞춰드려요' 약속 이행)
  useEffect(() => {
    const h = () => { if (!nearSort) toggleNearSort(); };
    window.addEventListener('nuri:enable-near', h);
    return () => window.removeEventListener('nuri:enable-near', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearSort, myPos]);
  const toggleNearSort = () => {
    if (nearSort) { setNearSort(false); return; }
    if (myPos) { setNearSort(true); return; }
    if (!('geolocation' in navigator)) { toast.show('이 기기에서 위치를 사용할 수 없어요 — 지역 필터를 이용해 주세요', 'error'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setNearSort(true); },
      () => toast.show('위치 권한이 거부되었어요 — 지역 필터로 좁혀 보세요', 'error'),
      { timeout: 8000, maximumAge: 300_000 },
    );
  };
  // 🎁 오픈 이벤트 배너(~2026-08-03 KST 자동 소멸) — 닫으면 localStorage 유지
  const [eventBannerHidden, setEventBannerHidden] = useState(() => { try { return localStorage.getItem('nuri:event-2607-hidden') === '1'; } catch { return false; } });

  // ── QR 체크인 (?checkin=<venueId>) ─────────────────────────────────────
  // QR엔 venue_id만(비민감). 로그인 회원만 기록(check_in RPC, 4시간 중복 방지). 미로그인 시 로그인 후 재진입에서 처리.
  useEffect(() => {
    const cv = new URLSearchParams(window.location.search).get('checkin');
    if (!cv) return;
    if (!user) { setAuthOpen(true); return; }
    checkIn(cv)
      .then(async (name) => {
        const streak = await getMyCheckinStreak().catch(() => 0);
        const bonus = streak > 0 && streak % 7 === 0 ? ` · 7일 연속 보너스 +10점!` : '';
        const fire = streak >= 2 ? ` 🔥 ${streak}일 연속` : '';
        // 🎁 오픈 이벤트(~2026-08-03): 출석 도장 2배 — 서버(check_in)와 동일한 KST 날짜 게이트
        const kstToday = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
        const eventOn = kstToday >= '2026-07-20' && kstToday <= '2026-08-03';
        toast.show(`${name || '매장'} 체크인 완료! 출석 도장 +${eventOn ? '6점 (오픈 이벤트 2배!)' : '3점'}${fire}${bonus} 🎉`, 'success');
        // 매장 QR 스캔은 '그 매장에 와 있다'는 뜻 — 홈이 아니라 그 매장 페이지(오늘 대회·내 활동)에 착지
        setOpenVenueId(cv);
      })
      .catch((e) => toast.show(e instanceof Error ? e.message : '체크인 실패', 'error'))
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('checkin');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      });
    // user '객체 참조'가 아닌 id 기준 — 로그인 직후 프로필 갱신으로 참조만 바뀌어도
    // effect가 재실행되어 체크인 RPC가 중복 호출되던 문제 방지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── QR 자가 바인요청 (?buyin=<venueId>) — 로그인 회원만, 운영자 승인 대기 ──
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const bv = sp.get('buyin');
    if (!bv) return;
    if (!user) { setAuthOpen(true); return; }
    const gm = sp.get('game'); // 테이블별 QR — 지정 게임(game_seq)
    const url = new URL(window.location.href);
    url.searchParams.delete('buyin'); url.searchParams.delete('game');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    const submitDirect = (g: number | null) => requestBuyin(bv, g)
      .then((name) => { toast.show(`${name || '매장'} 참가(바인) 요청 전송! 운영자 승인을 기다려 주세요 🙋`, 'success'); getMyBuyinRequestsToday().then(setMyBuyinReqs).catch(() => {}); })
      .catch((e) => toast.show(e instanceof Error ? e.message : '요청 전송 실패', 'error'));
    const gNum = gm ? parseInt(gm, 10) : NaN;
    if (Number.isFinite(gNum) && gNum > 0) { submitDirect(gNum); return; } // 게임 지정 QR → 바로 요청
    (async () => {
      const games = await venueTodayGames(bv).catch(() => [] as { gameSeq: number; title: string }[]);
      if (games.length > 1) { setBuyinPick({ venueId: bv, games }); return; } // 게임 여러 개면 선택 모달
      submitDirect(games[0]?.gameSeq ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 손님: 오늘 내가 보낸 바인 요청 상태(배너) — 로그인 시 로드 + 창 포커스 시 갱신(운영자 승인 반영)
  useEffect(() => {
    if (!user) { setMyBuyinReqs([]); return; }
    const load = () => getMyBuyinRequestsToday().then(setMyBuyinReqs).catch(() => {});
    load();
    window.addEventListener('focus', load);
    const unsub = subscribeMyBuyinRequests(user.id, load); // 운영자 승인/거절 즉시 반영
    return () => { window.removeEventListener('focus', load); unsub(); };
    // (A3) user.id 로만 의존 — user 객체 참조 변경(일일점수 갱신 등)마다 채널 재구독되던 churn 방지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── QR 회원가입 (?signup=1) — 매장 QR 옆 가입 QR 스캔 시 회원가입 모달 바로 열기 ──
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('signup') !== '1') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('signup');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    if (!user) { setAuthMode('signup-user'); setAuthOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 친구 초대 (?ref=<추천코드>) — 코드 기억 + 비로그인 시 가입 유도 ──
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ref = sp.get('ref');
    if (!ref) return;
    rememberRefCode(ref);
    const url = new URL(window.location.href);
    url.searchParams.delete('ref');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    if (!user) { setAuthMode('signup-user'); setAuthOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 로그인/가입 완료 후 — 기억해둔 추천 코드가 있으면 record_referral 1회(신규 14일내만 서버에서 수락)
  const refRecorded = useRef(false);
  useEffect(() => {
    if (!user || refRecorded.current) return;
    const code = pendingRefCode();
    if (!code) return;
    refRecorded.current = true;
    recordReferral(code).then((ok) => { if (ok) toast.show('추천 가입이 연결됐어요 · 본인인증하면 둘 다 활동점수!', 'success'); clearRefCode(); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 비로그인 사용자가 쓰기(글·댓글·반응·채팅·예약)를 시도하면 로그인 모달을 띄운다.
  useEffect(() => {
    const h = () => { setAuthMode('login'); setAuthOpen(true); };
    window.addEventListener(REQUIRE_LOGIN_EVENT, h);
    return () => window.removeEventListener(REQUIRE_LOGIN_EVENT, h);
  }, []);

  // 본인인증 게이트 안내는 <VerifyGateSheet/> 가 REQUIRE_VERIFY_EVENT 를 직접 듣고 시트로 띄운다(#31).
  // (기존: 사라지는 토스트 → 무엇이 왜 필요한지 설명하는 하단 시트로 교체)

  // 어디서든 글쓰기 모달 열기 — 포스터 상세 '대회 후기 쓰기' 등(카테고리 프리셋). 본인인증 회원만.
  useEffect(() => {
    const h = (e: Event) => {
      if (!ensureVerified(user, '글쓰기')) return;
      const cat = (e as CustomEvent).detail?.category as PostCategory | undefined;
      setPostFormCategory(cat ?? 'free');
      setPostFormOpen(true);
    };
    window.addEventListener(OPEN_POST_FORM_EVENT, h);
    return () => window.removeEventListener(OPEN_POST_FORM_EVENT, h);
  }, [user]);

  // ── 게시물 공유 딥링크 (?post=<id>) — 링크로 들어오면 비로그인도 해당 글 열람 ──
  const [pendingPostId, setPendingPostId] = useState<string | null>(() => {
    try { return new URLSearchParams(window.location.search).get('post'); } catch { return null; }
  });
  useEffect(() => {
    if (!pendingPostId) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('post');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }, [pendingPostId]);

  // 홈(browse) 외 탭에서 브라우저/모바일 뒤로가기 → 홈 탭으로 복귀(앱 종료 방지).
  // 오버레이가 열려 있으면 중앙 back-stack 이 LIFO 로 그 오버레이부터 닫는다.
  // 오버레이(모달)가 막 닫힌 직후의 잘못된 popstate 는 무시 — 모달 닫힘이 일정탐색으로
  // 튀던 간헐 버그(탭 레이어 pushState throttle 시 history.back 과열) 방지.
  // 모달 닫힘 직후(디바운스 창) 들어온 뒤로가기는 오발동 방지로 무시하되,
  // 소진된 탭 레이어를 즉시 재적립(rearmLayer) — 안 그러면 다음 뒤로가기가 앱을 종료시켰다.
  const tabBackRef = useRef<() => void>(() => {});
  tabBackRef.current = () => {
    if (overlayJustClosed()) { rearmLayer(() => tabBackRef.current()); return; }
    changeTab('browse');
  };
  useBackClose(activeTab !== 'browse', () => tabBackRef.current());

  // ── 데이터 (Supabase에서 로드) ──────────────────────────────────────────────
  // 캐시 퍼스트(Phase 6): 직전 세션 스냅샷이 있으면 네트워크를 기다리지 않고 먼저 그린다.
  // ⚠ isPremium 은 rowToSchedule 이 '조회 시각' 기준으로 계산한 파생값이다 — 스냅샷을
  //   그대로 복원하면 밤새 만료된 부스트가 아침에도 상단 고정된다. premiumUntil 로 재계산.
  const [schedules,     setSchedules]     = useState<Schedule[]>(() => {
    const snap = readSnap<Schedule[]>('schedules');
    if (!snap) return [];
    const now = Date.now();
    return snap.map((sc) => ({
      ...sc,
      isPremium: sc.isPremium && (sc.premiumUntil == null || new Date(sc.premiumUntil).getTime() > now),
    }));
  });
  // 스냅샷이 있으면 스켈레톤을 건너뛴다 — '열자마자 내용이 있다' 가 이 기능의 전부다.
  const [schedulesLoaded, setSchedulesLoaded] = useState(() => readSnap<Schedule[]>('schedules') != null); // (B1)
  // 목록을 못 불러온 것과 '대회가 없는 것'은 다르다 — 구분하지 않으면
  // 서비스가 죽은 날에도 사용자는 '대회가 없나 보다' 하고 조용히 떠난다.
  const [schedulesError, setSchedulesError] = useState<unknown>(null);

  // 탭 청크 idle 프리로드 — 동일 동적 import는 Vite가 같은 청크로 캐시한다
  useEffect(() => {
    // ⚠ 첫 화면 데이터가 도착하기 전에는 프리페치를 시작하지 않는다.
    //   라이브 실측에서 idle 콜백이 t=115ms 에 떨어졌는데 Supabase 첫 응답은 170~215ms 라,
    //   '사용자가 기다리는 목록'보다 '나중에 쓸지도 모르는 청크'가 먼저 대역폭·메인스레드를 가져갔다.
    if (!schedulesLoaded) return;
    const idle = (cb: () => void) => {
      const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 10000 });
      else setTimeout(cb, 5000);
    };
    const warm = () => {
      void Promise.allSettled([
        import('./components/features/CommunityTab'),
        import('./components/features/MarketplaceTab'),
        import('./components/features/LiveGamesTab'),
        // ⚠ VenueManageTab 은 여기 넣지 않는다 — 업주 전용 스위트(장부·통계·클락·급여)를 static import 로
        //   끌고 와서 306KB + LedgerStatsPanel 155KB 가 '비로그인 손님'에게도 내려갔다.
        //   아래 prefetch() 가 이미 `if (isOwner)` 로 게이팅하고 있는데 여기가 그걸 무력화하고 있었다.
        import('./components/features/ToolsPanel'),
        import('./components/features/VenuePage'),
        import('./components/features/ScheduleDetailModal'),
        import('./components/features/CustomerDashboardPage'),
        import('./components/features/AuthModal'),
        import('./components/features/ProfileModal'),
        import('./components/features/GlobalSearchModal'),
        import('./components/features/PostDetailModal'),
        import('./components/features/ListingDetailModal'),
        // 역할 전용 청크 — 해당 역할일 때만(손님에게 업주 스위트를 내려보내지 않는다)
        // 직원(venue_staff)도 내 매장 탭을 쓰므로 업주와 같은 게이트에 포함
        ...((isOwner || isAdmin || user?.role === 'venue_staff') ? [import('./components/features/VenueManageTab')] : []),
        ...(isAdmin ? [import('./components/features/AdminTab')] : []),
      ]).then(() => {
        // 프리마운트: 청크가 데워진 뒤, 핵심 탭을 idle 마다 하나씩 숨김 마운트해 둔다.
        // 이유 — '첫 탭 진입'만 VT 마스킹이 못 가리는 경로(Suspense·startTransition 커밋)라
        // 실측에서 유일하게 잡히는 상호작용 멈칫(스로틀 4x 67~150ms·6x 최대 250ms)이었다.
        // 미리 방문 처리하면 사용자 첫 탭도 재방문(스냅샷 뒤 flushSync) 경로가 된다.
        // 한 번에 하나씩인 이유: 3개 동시 커밋은 그 자체가 idle 롱태스크가 된다.
        // 내 매장은 역할 보유자에게 최우선 프리마운트 — '다른 탭→내 매장'이 사장님 핵심 동선이자
        // 가장 무거운 스위트(320KB+)라, 이걸 idle 에 미리 치러야 첫 진입 멈칫이 사라진다.
        const canStore = isOwner || isAdmin || user?.role === 'venue_staff';
        const seq: TabId[] = [...(canStore ? (['my-store'] as TabId[]) : []), 'live', 'community', 'tools'];
        const mountNext = () => {
          const t = seq.find((x) => !visitedTabs.has(x));
          if (!t) return;
          visitedTabs.add(t);
          startTransition(() => setPremountTick((n) => n + 1)); // transition: 만약 suspend 돼도 폴백 커밋 없음
          idle(mountNext);
        };
        idle(mountNext);
      });
    };
    // timeout 을 늘린 이유: 4초는 '한가하지 않아도 4초 뒤엔 무조건 실행'이라 첫 화면과 자주 겹쳤다.
    idle(warm);
    // visitedTabs 는 안정 Set 인스턴스 — 참조 불변
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedulesLoaded, isOwner, isAdmin, user?.role]);
  // FOMO 뱃지용 예약자 수 — 다가오는 대회만 1회 조회.
  // ⚠ [schedules] 배열 의존이면 스냅샷→네트워크 교체(내용 동일)에도 재조회·리렌더가 났다 —
  //   id 집합 문자열 키로 좁혀 '같은 대회 목록'이면 건너뛴다(PastTournaments pastKey 패턴).
  const resIdsKey = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    return schedules.filter((sc) => sc.approved && sc.date >= today).map((sc) => sc.id).sort().join('|');
  }, [schedules]);
  useEffect(() => {
    if (!resIdsKey) { setBrowseResCounts({}); return; }
    getReservationCounts(resIdsKey.split('|')).then(setBrowseResCounts).catch(() => {});
  }, [resIdsKey]);
  const [venues,        setVenues]        = useState<Venue[]>(() => readSnap<Venue[]>('venues') ?? []);
  const venueById = useMemo(() => new Map(venues.map((v) => [v.id, v])), [venues]);
  const [comments,      setComments]      = useState<Comment[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [posts,         setPosts]         = useState<CommunityPost[]>(() => readSnap<CommunityPost[]>('posts') ?? []);
  const [listings,      setListings]      = useState<MarketplaceListing[]>(() => readSnap<MarketplaceListing[]>('listings') ?? []);
  const [marketLoaded,  setMarketLoaded]  = useState(() => readSnap<MarketplaceListing[]>('listings') != null); // 장터 첫 로딩 여부 — 스냅샷 있으면 스켈레톤 생략
  const [notices,       setNotices]       = useState<MarketplaceNotice[]>(() => readSnap<MarketplaceNotice[]>('notices') ?? []);
  // MO-7B: 공지 스냅샷조차 없는 최초 방문에서 섹션이 늦게 끼어들며 목록을 밀지 않도록,
  // 응답 전에는 섹션 셸(헤더만)을 자리에 둔다. 스냅샷이 있으면 이미 확정 상태.
  const [noticesLoaded, setNoticesLoaded] = useState<boolean>(() => readSnap<MarketplaceNotice[]>('notices') != null);
  const [users,         setUsers]         = useState<User[]>([]);
  const [openListing, setOpenListing]      = useState<MarketplaceListing | null>(null);
  const [openNotice, setOpenNotice]        = useState<MarketplaceNotice | null>(null);
  /** 포스터 폼 — null: 닫힘 / undefined: 신규 / Schedule: 수정 */
  const [posterFormTarget, setPosterFormTarget] = useState<Schedule | null | undefined>(null);
  const [openPost, setOpenPost]         = useState<CommunityPost | null>(null);
  // 공유 딥링크로 받은 글이 로드되면 상세를 연다(비로그인 열람 허용).
  useEffect(() => {
    if (!pendingPostId || posts.length === 0) return;
    const found = posts.find((p) => p.id === pendingPostId);
    if (found) setOpenPost(found);
    // 링크가 최근 50건 밖(오래된 글)이면 조용히 실패하던 구간 — 단건 조회로 살린다
    else {
      const missingId = pendingPostId;
      getPostById(missingId).then((fetched) => {
        if (fetched) setOpenPost(fetched);
        else toast.show('삭제되었거나 찾을 수 없는 글이에요', 'info');
      }).catch(() => {});
    }
    setPendingPostId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPostId, posts]);
  const [profileOpen, setProfileOpen]   = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null); // 약관·정책 모달
  const [supportOpen, setSupportOpen] = useState(false); // 1:1 고객센터 문의
  const [voucherWalletOpen, setVoucherWalletOpen] = useState(false);
  // 비밀번호 변경 OTP 진행 중 페이지가 리로드되면(모바일에서 메일 앱을 다녀온 경우)
  // 프로필 모달을 다시 열어 코드 입력 화면으로 복귀시킨다.
  useEffect(() => {
    const pending = sessionStorage.getItem('nh_pw_otp');
    if (pending && Date.now() - Number(pending) < 5 * 60 * 1000) setProfileOpen(true);
  }, []);
  const [noticeFormOpen, setNoticeFormOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<MarketplaceNotice | null>(null); // 있으면 공지 수정 모드
  const [postFormOpen, setPostFormOpen]     = useState(false);   // 커뮤니티 글쓰기
  const [postFormCategory, setPostFormCategory] = useState<PostCategory>('free'); // 글쓰기 기본 카테고리(공부 탭=study)
  const [shareText, setShareText] = useState(''); // 공유 타깃(share_target) 프리필 본문
  // PWA 공유 타깃 — 다른 앱에서 NURI로 공유하면 ?text/url을 받아 커뮤니티 글쓰기 프리필
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (!sp.has('shared')) return;
      const parts = [sp.get('title'), sp.get('text'), sp.get('url')].filter(Boolean);
      setShareText(parts.join('\n'));
      setPostFormCategory('free'); setPostFormOpen(true);
      const url = new URL(window.location.href);
      ['shared', 'title', 'text', 'url'].forEach((k) => url.searchParams.delete(k));
      history.replaceState(null, '', url.pathname + url.search);
    } catch { /* noop */ }
  }, []);
  const [marketFormOpen, setMarketFormOpen] = useState(false);   // 중고장터 글쓰기

  // GTO 공유 링크(#gto=...) 진입 — 받은 사람이 열면 같은 스팟으로 GTO 검색 모달 표시
  const [gtoInit, setGtoInit] = useState<DeepGtoInit | null>(null);
  useEffect(() => {
    const apply = () => {
      const code = readGtoHash(window.location.hash);
      if (!code) { setGtoInit(null); return; }
      const { hero, villain, board } = decodeSpot(code);
      setGtoInit({ hero, villain, board });
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);
  const closeGto = useCallback(() => {
    setGtoInit(null);
    if (window.location.hash.startsWith('#gto=')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // 서버 재조회 헬퍼
  // 내용이 같으면 이전 참조를 유지 — no-op 재조회(실시간 디바운스·창 복귀)가 카드 전체·
  // keep-alive 탭들의 memo 를 깨지 않게. 동일 참조 반환 시 React 는 리렌더 자체를 생략한다.
  // (목록이 작아 stringify 비용은 수 ms — memo 파손 비용보다 훨씬 싸다)
  const sameJson = (a: unknown, b: unknown) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } };
  const reloadSchedules = useCallback(() => {
    getSchedules()
      .then((v) => {
        setSchedules((prev) => (sameJson(prev, v) ? prev : v)); setSchedulesError(null);
        writeSnap('schedules', v); // 다음 방문의 '즉시 콘텐츠' — realtime 재조회도 이 길을 지나므로 자동 최신화
        // 서드파티(GA·AdSense) 게이트 해제 — **네트워크 응답** 이 왔다는 신호.
        // ⚠ schedulesLoaded 에 걸면 안 된다: 캐시 복원이 그 플래그를 부팅 즉시 켜므로
        //   광고가 재검증 요청과 대역폭을 다시 다투게 된다(이 게이트를 만든 이유가 무색해짐).
        window.dispatchEvent(new Event('nuri:first-data-requested'));
      })
      .catch((e) => setSchedulesError(e))
      .finally(() => setSchedulesLoaded(true));
  }, []);
  // 당겨서 새로고침(유튜브·당근) — 최상단에서 아래로 56px+ 당기면 갱신
  // [DS] MO-4: 드래그 값은 React 상태 밖(§20.5 #2) — 예전엔 touchmove 마다 setPtr 로
  // App 전체가 프레임당 리렌더됐고, in-flow height 인디케이터가 리스트 전체를 매 프레임 밀었다.
  // 이제 인디케이터는 out-of-flow(fixed) + transform/opacity 전용, 값은 ref + rAF 직접 기록.
  // React 상태는 '갱신 중' 스피너 불리언 하나뿐이다.
  const [ptrRefreshing, setPtrRefreshing] = useState(false);
  const ptrRefreshingRef = useRef(false);
  const ptrStart = useRef<number | null>(null);
  const ptrVal = useRef(0);
  const ptrRaf = useRef(0);
  const ptrBoxRef = useRef<HTMLDivElement | null>(null);
  const ptrIconRef = useRef<HTMLSpanElement | null>(null);
  const ptrPaint = () => {
    ptrRaf.current = 0;
    const box = ptrBoxRef.current, icon = ptrIconRef.current;
    if (!box || !icon) return;
    const v = ptrVal.current;
    box.style.transform = `translateY(${Math.min(110, v) - 52}px)`;
    icon.style.transform = `rotate(${v * 3}deg)`;
    icon.style.opacity = String(Math.min(1, v / 56));
  };
  // 놓은 뒤 스냅백/정착 — transform 전용 트랜지션(컴포지터). 드래그 중엔 start 에서 none 으로 끈다.
  const ptrSettle = (y: number, iconOpacity: string) => {
    const box = ptrBoxRef.current, icon = ptrIconRef.current;
    if (!box) return;
    box.style.transition = 'transform 0.2s var(--ease)';
    box.style.transform = `translateY(${y}px)`;
    if (icon) { icon.style.transform = ''; icon.style.opacity = iconOpacity; }
  };
  const onPtrStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0 && !ptrRefreshingRef.current) {
      ptrStart.current = e.touches[0].clientY;
      if (ptrBoxRef.current) ptrBoxRef.current.style.transition = 'none';
    }
  };
  const onPtrMove = (e: React.TouchEvent) => {
    if (ptrStart.current == null || ptrRefreshingRef.current) return;
    const dy = e.touches[0].clientY - ptrStart.current;
    ptrVal.current = dy > 8 && window.scrollY <= 0 ? Math.min(110, dy * 0.5) : 0;
    if (!ptrRaf.current) ptrRaf.current = requestAnimationFrame(ptrPaint);
  };
  const onPtrEnd = () => {
    const pulled = ptrVal.current;
    ptrStart.current = null;
    ptrVal.current = 0;
    if (ptrRaf.current) { cancelAnimationFrame(ptrRaf.current); ptrRaf.current = 0; }
    if (pulled >= 56) {
      ptrRefreshingRef.current = true;
      setPtrRefreshing(true);
      ptrSettle(4, '1'); // 헤더 바로 아래 정착 후 스핀
      reloadSchedules();
      setTimeout(() => {
        ptrRefreshingRef.current = false;
        setPtrRefreshing(false);
        ptrSettle(-52, '0');
      }, 900);
    } else ptrSettle(-52, '0');
  };
  const reloadVenues    = useCallback(() => { getVenues().then((v) => { setVenues((prev) => (sameJson(prev, v) ? prev : v)); writeSnap('venues', v); }).catch(() => {}); }, []);  
  const reloadPosts     = useCallback(() => { getPosts().then((v) => { setPosts(v); writeSnap('posts', v); }).catch(() => {}); }, []);
  const reloadComments  = useCallback(() => { getComments({}).then(setComments).catch(() => {}); }, []);
  const reloadNotices   = useCallback(() => { getNotices().then((v) => { setNotices(v); writeSnap('notices', v); setNoticesLoaded(true); }).catch(() => {}); }, []);

  // 공개 데이터 초기 로드 — **첫 화면(일정탐색)에 필요한 것만** 즉시 받는다.
  // 예전엔 게시글·댓글·장터까지 6종을 부팅과 동시에 쐈다. 사용자가 기다리는 건 대회 목록인데
  // 안 보이는 탭의 데이터가 같은 대역폭·같은 DB 를 두고 경쟁했다.
  useEffect(() => {
    // 실측(2026-08-17 끊김 심층분석): 부팅 5초간 App 풀 리렌더가 ~17회였다 — setState 가
    // 각자 다른 마이크로태스크에서 발화한 탓. React 18 자동 배칭은 '같은 콜백 안'만 묶으므로,
    // 세 응답을 allSettled 로 모아 **한 콜백에서 일괄 반영**한다(3렌더→1렌더).
    Promise.allSettled([getSchedules(), getVenues(), getNotices()]).then(([sr, vr, nr]) => {
      if (sr.status === 'fulfilled') {
        setSchedules((prev) => (sameJson(prev, sr.value) ? prev : sr.value));
        setSchedulesError(null);
        writeSnap('schedules', sr.value);
        window.dispatchEvent(new Event('nuri:first-data-requested')); // 광고 게이트(응답 후)
      } else setSchedulesError(sr.reason);
      setSchedulesLoaded(true);
      if (vr.status === 'fulfilled') { setVenues((prev) => (sameJson(prev, vr.value) ? prev : vr.value)); writeSnap('venues', vr.value); }
      if (nr.status === 'fulfilled') { setNotices(nr.value); writeSnap('notices', nr.value); setNoticesLoaded(true); }
    });
     
  }, []);
  // (서드파티 게이트 신호는 reloadSchedules 의 네트워크 성공 콜백에서 발사 — 위 주석 참고.
  //  schedulesLoaded 기반이었으나 캐시 복원이 그 플래그를 즉시 켜게 되면서 이전했다.)

  // 커뮤니티·장터·별점: '부팅이 끝난 뒤 유휴' 와 '해당 탭 진입' 중 먼저 오는 쪽에서 1회.
  // 유휴만 기다리면 유휴 전에 탭을 누른 사람이 빈 화면을 보고,
  // 탭 진입만 기다리면 매번 스켈레톤을 본다 — 둘을 합치면 양쪽 다 없다.
  // 라이브 탭 배지 — '지금 N게임 진행중'(Phase 14, PokerAtlas real-time counts).
  const [liveCount, setLiveCount] = useState(0);
  // UX-1: 진행 중 클락 원본 — '지금 등록 되나' 판정을 browse 카드·상세로 승격(추가 네트워크 0, 기존 조회 재사용)
  const [liveClocks, setLiveClocks] = useState<ClockState[]>([]);
  // 16-1 '이어서 하기' — 최근 방문 매장 1곳(my_visited_venues 재활용, 신규 쿼리 0)
  const [recentVenue, setRecentVenue] = useState<{ venueId: string; venueName: string | null } | null>(null);
  useEffect(() => {
    if (!user) { setRecentVenue(null); return; }
    myVisitedVenues().then((vs) => setRecentVenue(vs[0] ?? null)).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const deferredLoadedRef = useRef(false);
  const loadDeferred = useCallback(() => {
    if (deferredLoadedRef.current) return;
    deferredLoadedRef.current = true;
    // 5개 응답을 한 콜백에서 일괄 반영(5렌더→1렌더) — 부팅 리렌더 폭풍 계측의 직접 조치
    Promise.allSettled([getPosts(), getComments({}), getListings(), getVenueRatings(), getRunningClocks()])
      .then(([pr, cr, lr, rr, kr]) => {
        if (pr.status === 'fulfilled') { setPosts(pr.value); writeSnap('posts', pr.value); }
        if (cr.status === 'fulfilled') setComments(cr.value);
        if (lr.status === 'fulfilled') { setListings(lr.value); writeSnap('listings', lr.value); }
        setMarketLoaded(true);
        if (rr.status === 'fulfilled') setVenueRatings(rr.value);
        if (kr.status === 'fulfilled') { setLiveCount(kr.value.length); setLiveClocks(kr.value); }
      });
     
  }, []);
  useEffect(() => {
    type IdleWin = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const w = window as IdleWin;
    const kick = () => {
      if (w.requestIdleCallback) w.requestIdleCallback(loadDeferred, { timeout: 4000 });
      else window.setTimeout(loadDeferred, 2500);
    };
    if (document.readyState === 'complete') kick();
    else { window.addEventListener('load', kick, { once: true }); return () => window.removeEventListener('load', kick); }
  }, [loadDeferred]);
  useEffect(() => {
    if (activeTab === 'community') loadDeferred();
  }, [activeTab, loadDeferred]);

  // (탭 청크 프리페치는 위 warm() 하나로 통합 — 여기 있던 두 번째 프리페처가
  //  schedulesLoaded 게이트 **없이** 유휴 즉시(실측 138ms) CommunityTab 등을 내려받아,
  //  첫 화면 데이터(142ms)보다 먼저 대역폭을 가져갔다. 게이트를 만든 warm 과 중복이기도 했다.
  //  역할 게이팅(isOwner/isAdmin 전용 청크)은 warm 안으로 이사.)

  // 헤더+탭바 실제 높이를 측정 → 일정탐색 sticky 필터가 정확히 그 아래에 붙도록 --stack-top 노출.
  // (토큰 추정/-1rem 보정 대신 실측값을 사용해 모바일 sticky 겹침을 방지)
  useEffect(() => {
    const headerEl = document.querySelector('[data-stack-header]');
    // [DS] MO-3(B-2): RO 콜백에서 직접 측정+setProperty 하면
    //   레이아웃 변경 → RO 발화 → 측정(강제 동기 레이아웃) → CSS 변수 쓰기 → 또 레이아웃 …
    // 의 되먹임이 프레임마다 돌았다. rAF 로 한 프레임 1회로 코얼레스하고,
    // 값이 실제로 변했을 때만 setProperty(같은 값 재기록도 스타일 무효화를 일으킨다).
    // (헤더 height 트랜지션 제거로 축소는 이제 1회성 이벤트 — RO 는 폰트 로드·회전 등 안전판)
    let raf = 0;
    let last = '';
    const measure = () => {
      raf = 0;
      const tabbar = document.querySelector('[data-stack-tabbar]');
      let next: string;
      // 데스크톱: 헤더 아래 sticky 탭바까지가 상단 스택 — 탭바 고정 하단 = 필터가 붙을 지점
      if (tabbar && tabbar.getBoundingClientRect().height > 0) {
        const stickyTop = parseFloat(getComputedStyle(tabbar).top) || 56;
        next = `${Math.round(stickyTop + tabbar.getBoundingClientRect().height)}px`;
      } else if (headerEl) {
        // 모바일: 탭바가 숨겨져 있음 → 헤더의 '현재' 하단을 그대로 사용.
        // (미축소 높이로 한 번만 재면 축소 후 헤더 하단과 검색바 sticky top 사이에 비침 띠가 생긴다)
        next = `${Math.round(headerEl.getBoundingClientRect().bottom)}px`;
      } else {
        next = '97px';
      }
      if (next !== last) {
        last = next;
        document.documentElement.style.setProperty('--stack-top', next);
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('resize', schedule);
    let ro: ResizeObserver | undefined;
    if (headerEl && 'ResizeObserver' in window) { ro = new ResizeObserver(schedule); ro.observe(headerEl); }
    const t = setTimeout(schedule, 300); // 폰트/레이아웃 안정화 후 재측정
    return () => {
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [activeTab]);

  // #13 커뮤니티 게시글·댓글 실시간 — 다른 사용자가 올린 글/댓글이 즉시 반영(알림/일정/장부와 동일 수준).
  // 700ms 디바운스로 이벤트 폭주 시 getPosts(50건+내좋아요) 재조회를 1회로 합침(부하 점검 #1).
  // ⚡ 트래픽 대비: 실시간 채널은 접속자 1명당 서버가 WAL을 상시 폴링하므로(전체 DB 시간의 대부분),
  //    "지금 보고 있는 화면"에서만 구독한다. 커뮤니티/글상세를 볼 때만 연결하고 떠나면 즉시 해제.
  //    구독 해제 구간의 변경분은 탭 복귀 시 reload* 로 어차피 다시 불러오므로 사용자 체감은 동일.
  const wantCommunityRealtime = activeTab === 'community' || openPost !== null;
  useEffect(() => {
    if (!wantCommunityRealtime) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribePosts(() => { if (t) clearTimeout(t); t = setTimeout(reloadPosts, 700); });
    return () => { if (t) clearTimeout(t); unsub(); };
  }, [reloadPosts, wantCommunityRealtime]);
  useEffect(() => {
    if (!wantCommunityRealtime) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeComments(() => { if (t) clearTimeout(t); t = setTimeout(reloadComments, 700); });
    return () => { if (t) clearTimeout(t); unsub(); };
  }, [reloadComments, wantCommunityRealtime]);
  // 열린 상세(openPost)를 피드 갱신과 동기화 — 실시간/리로드로 posts 가 바뀌면 좋아요·댓글수·조회수도 상세에 반영
  useEffect(() => { setOpenPost((cur) => (cur ? (posts.find((p) => p.id === cur.id) ?? cur) : cur)); }, [posts]);

  // 로그인 사용자: 내 알림 로드
  useEffect(() => {
    if (user) getMyNotifications().then(setNotifications).catch(() => {});
    else setNotifications([]);
    // ⚠ [user] 객체 의존이면 일일 출석점수 반영(setUser 참조 교체)에도 재실행돼 fetch·리렌더가 2배였다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // 창/탭 복귀(focus·visibility) 시 모든 주요 데이터 자동 동기화
  //  → 다른 기기·다른 사용자가 바꾼 일정·매장·게시글·댓글·장터·공지·알림이 즉시 최신화
  // ⚠ 예전엔 복귀 때마다 8종을 전부 다시 받았다. 문제는 요청 수만이 아니다 —
  //   getSchedules() 는 매번 '완전히 새 Schedule 객체 배열'을 만들므로, ScheduleCard 가 memo 여도
  //   prop 참조가 전부 바뀌어 화면의 모든 카드가 재렌더된다(카톡 갔다 온 순간 뻑뻑해지는 정체).
  //   게다가 schedules 참조 변경이 예약자 수·지난대회 순위·매장 별점 재조회를 연쇄로 부른다.
  //   → '지금 보고 있는 탭'에 필요한 것만 갱신하고, 디바운스를 실제 사용 리듬에 맞춰 늘린다.
  //   (다른 탭 데이터는 그 탭으로 이동할 때 어차피 최신화된다 + 실시간 구독이 이미 돌고 있다)
  useVisibilityRefresh(() => {
    // 알림은 탭과 무관하게 항상 — 뱃지 숫자가 틀리면 바로 눈에 띈다(가볍기도 하다)
    if (user) getMyNotifications().then(setNotifications).catch(() => {});
    switch (activeTab) {
      case 'browse':
      case 'live':
      case 'my-store':
        getRunningClocks().then((cs) => { setLiveCount(cs.length); setLiveClocks(cs); }).catch(() => {});
        reloadSchedules(); reloadVenues(); reloadNotices();
        break;
      case 'community':
        reloadPosts(); reloadComments();
        // 장터는 커뮤니티 서브탭 — 복귀 갱신도 함께(은퇴한 market 탭의 케이스 흡수)
        getListings().then((l) => { setListings(l); setMarketLoaded(true); writeSnap('listings', l); }).catch(() => setMarketLoaded(true));
        break;
      case 'admin':
        reloadSchedules(); reloadVenues();
        if (isAdmin) listAllUsers().then(setUsers).catch(() => {});
        break;
      default:
        break;
    }
  }, [activeTab, user, isAdmin, reloadSchedules, reloadVenues, reloadPosts, reloadComments, reloadNotices]);

  // 알림 실시간 수신(신규/읽음)
  useEffect(() => {
    if (!user) return;
    const reload = () => getMyNotifications().then(setNotifications).catch(() => {});
    const ch = supabase
      .channel(`notif:${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // 일정(포스터/게임) 실시간 동기화 — 다른 기기/사용자의 등록·수정·삭제 즉시 반영
  // #7 일정 실시간 — 700ms 디바운스로 변경 폭주 시 전체 refetch 를 1회로 합침(동시접속 팬아웃 완화).
  // ⚡ 트래픽 대비: 일정이 실제로 보이는 화면(일정탐색·라이브·내매장/관리자·대회상세)에서만 구독.
  //    커뮤니티·장터·도구만 보는 사용자는 채널을 열지 않는다.
  const wantScheduleRealtime = activeTab === 'browse' || activeTab === 'live'
    || activeTab === 'my-store' || activeTab === 'admin' || openSchedule !== null;
  useEffect(() => {
    if (!wantScheduleRealtime) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeSchedules(() => { if (t) clearTimeout(t); t = setTimeout(reloadSchedules, 700); });
    return () => { if (t) clearTimeout(t); unsub(); };
  }, [reloadSchedules, wantScheduleRealtime]);

  // 관리자: 회원 목록 로드
  useEffect(() => {
    if (isAdmin) listAllUsers().then(setUsers).catch(() => {});
    else setUsers([]);
  }, [isAdmin]);

  const unreadNotifs = notifications.filter((n) => !n.read).length;
  // 설치형 PWA 아이콘 배지(Badging API) — 앱을 안 열어도 미읽음이 홈 화면에 보인다
  useEffect(() => {
    try {
      const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      if (unreadNotifs > 0) nav.setAppBadge?.(unreadNotifs);
      else nav.clearAppBadge?.();
    } catch { /* 미지원 무시 */ }
  }, [unreadNotifs]);
  const isStaff = user?.role === 'venue_staff';

  const tabs: TabDef[] = useMemo(() => {
    const base: TabDef[] = [
      { id: 'browse',    label: '일정 탐색' },
      { id: 'live',      label: '라이브' },
      { id: 'community', label: '커뮤니티' },
      { id: 'tools',     label: '도구' },
    ];
    if (isOwner || isStaff || isAdmin) base.push({ id: 'my-store', label: '내 매장' });
    if (isAdmin)            base.push({ id: 'admin',       label: '관리자 설정' });
    return base;
  }, [isOwner, isStaff, isAdmin]);

  // 커뮤니티 탭 새 글 점(모바일 탭바) — 마지막 방문 이후 새 글이 있으면 골드 점
  const [commSeenAt, setCommSeenAt] = useState(() => { try { return localStorage.getItem('nuri:comm-seen') ?? ''; } catch { return ''; } });
  useEffect(() => {
    if (activeTab !== 'community') return;
    const now = new Date().toISOString();
    try { localStorage.setItem('nuri:comm-seen', now); } catch { /* storage 차단/쿼터 초과 무시 */ }
    setCommSeenAt(now);
  }, [activeTab]);
  const commHasNew = useMemo(
    () => activeTab !== 'community' && posts.some((p) => !commSeenAt || p.createdAt > commSeenAt),
    [posts, commSeenAt, activeTab],
  );

  // 탭이 사라지면 (로그아웃 등) browse로 돌아감.
  // ⚠ 부팅 시 auth 는 비동기 — 해석 전엔 my-store/admin 이 잠시 목록에 없어서
  //   업주의 '마지막 탭 복원'이 매번 browse 로 덮이던 문제. 해석 끝날 때까지 보류.
  useEffect(() => {
    if (!tabs.find((t) => t.id === activeTab)) {
      if (authLoading && (activeTab === 'my-store' || activeTab === 'admin')) return;
      changeTab('browse');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTab, authLoading]);

  // 팔로우한 매장 id 로드(로그인 시)
  useEffect(() => {
    if (!user) { setFollowedIds(new Set()); setFollowedOnly(false); return; }
    getMyFollowedVenueIds().then((ids) => setFollowedIds(new Set(ids))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const visibleSchedules = useMemo(() => {
    const list = schedules.filter((s) => s.approved);
    const q = searchState.query.trim();
    // 검색은 사람이 치는 대로 맞춘다 — 'gtd'로 'GTD'를, '누리 홀덤'으로 '누리홀덤'을 찾게.
    // 그리고 주소를 넣는다: 손님이 실제로 치는 건 '강남역·서면'인데 region 은 '강남' 같은 대분류뿐이었다.
    const norm = (t: string) => t.toLowerCase().replace(/\s+/g, '');
    const nq = norm(q);
    // 권역 묶음 펼치기(예: 서울 → 서울/강남/강서) — 매 일정마다 재계산하지 않도록 1회만
    const regionKeys = expandRegions(searchState.regions);
    // 아무 조건도 안 걸었을 때(= 앱을 막 켠 상태)는 끝난 대회를 첫 화면에서 뺀다.
    // 왜 조건부인가: 검색어나 날짜를 직접 고른 사람은 지난 대회를 찾고 있을 수 있다 —
    //   그때까지 숨기면 '검색했는데 없다'가 되어 더 나쁘다. 지난 대회는 하단 🏁 섹션이 담당한다.
    const hideEnded = !q && searchState.dates.length === 0;
    return list.filter((s) => {
      if (hideEnded && scheduleStatus(s.date, s.startTime) === 'ended') return false;
      const matchQ = !nq || [s.title, s.pubName, s.region, s.address ?? ''].some((t) => norm(t).includes(nq));
      // 복수 선택: 비어있으면 전체 통과, 아니면 선택된 값 중 하나라도 일치(OR)
      const matchD = searchState.dates.length === 0   || searchState.dates.includes(s.date);
      const matchR = regionKeys.length === 0 || regionKeys.some((r) => s.region.includes(r));
      const matchF = !searchState.format || s.format === searchState.format;
      const matchG = !searchState.gtdOnly || s.guaranteed === true;
      const matchC = !searchState.competitionOnly || s.isCompetition === true;
      const matchGr = !searchState.grade || s.grade === searchState.grade; // 등급 축(Phase 14)
      // 예산 축(UX-2) — 바이인 상한(원). 금액 미입력(0)은 통과(무료·미정 대회를 숨기지 않는다)
      const matchB = !searchState.budget || (s.buyIn?.amount ?? 0) <= searchState.budget;
      const matchFollow = !followedOnly || (!!s.venueId && followedIds.has(s.venueId));
      return matchQ && matchD && matchR && matchF && matchG && matchC && matchGr && matchB && matchFollow;
    })
      // 정렬이 아예 없어서 '업주가 정한 진열 순서'로 나왔다 — 손님은 '지금 갈 수 있는 게 뭐지'를
      // 시간순으로 훑을 수가 없었다. 1차 키는 날짜+시각, 부스트는 동시각 tie-break(scheduleSort.ts).
      .sort((a, b) => {
        // 📍 가까운 순 — 좌표 있는 매장이 앞, 좌표 없으면 뒤(라이트백이 채우면 자연 편입).
        if (nearSort && myPos) {
          const dOf = (x: Schedule) => {
            const v = x.venueId ? venueById.get(x.venueId) : undefined;
            return v && v.lat != null && v.lng != null ? haversineKm(myPos.lat, myPos.lng, v.lat, v.lng) : Infinity;
          };
          const dd = dOf(a) - dOf(b);
          if (dd !== 0 && Number.isFinite(dd)) return dd;
        }
        return compareByStartThenBoost(a, b);
      });
  }, [schedules, searchState, followedOnly, followedIds, nearSort, myPos, venueById]);
  // 날짜 슬라이더 점 표시용 — 승인된 대회가 있는 날짜 집합(헛탭 방지)
  const eventDates = useMemo(() => new Set(schedules.filter((sc) => sc.approved).map((sc) => sc.date)), [schedules]);
  // 📍 가까운 순일 때 카드에 실제 거리를 보여준다 — 정렬만 하고 숫자를 감추면 체감·검증 불가
  const distanceOf = useCallback((sc: Schedule): number | undefined => {
    if (!nearSort || !myPos) return undefined;
    const v = sc.venueId ? venueById.get(sc.venueId) : undefined;
    return v && v.lat != null && v.lng != null ? haversineKm(myPos.lat, myPos.lng, v.lat, v.lng) : undefined;
  }, [nearSort, myPos, venueById]);
  // UX-1: scheduleId → 레지 실측 상태(클락 기반). 클락 없는 대회는 맵에 없다 → 카드·모달이 기존 추정으로 폴백.
  const regInfoBySchedule = useMemo(() => buildRegInfoMap(liveClocks, schedules), [liveClocks, schedules]);
  // 🎯 내 토너 — 오늘 승인된 내 바인의 게임 목록(라이브 탭 참가자 시점 카드)
  const myApprovedGames = useMemo(() => myBuyinReqs
    .filter((r) => r.status === 'approved')
    .map((r) => ({ venueId: r.venueId, venueName: r.venueName, gameSeq: r.gameSeq })), [myBuyinReqs]);
  // 🎫 오늘 예약한 대회 — 대회 당일 홈에서 '내 예약'이 안 보이던 격차(예약→방문 전환 지원)
  const [myTodayRes, setMyTodayRes] = useState<MyReservationRow[]>([]);
  useEffect(() => {
    if (!user) { setMyTodayRes([]); return; }
    const today = new Date().toLocaleDateString('en-CA');
    getMyReservations(30).then((list) => setMyTodayRes(list.filter((r) => r.date === today))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── 핸들러 ─────────────────────────────────────────────────────────────

  const handleVenueClick = useCallback((venueId: string) => {
    if (!venueId) return; // 직접입력 포스터 등 매장 미연결 시 무시
    // 풀페이지 마운트(지도 임베드 포함)를 스냅샷 뒤에서 끝낸다 — 포스터→매장 전환도 크로스페이드
    withViewTransition(() => flushSync(() => {
      setOpenSchedule(null);   // 일정 모달이 열려있으면 닫고 매장으로 전환
      setOpenVenueId(venueId);
    }));
  }, []);

  // 딥링크: ?s=<scheduleId> — 대회 공유 링크로 들어오면 해당 포스터 상세 자동 오픈
  const schedDeepLinked = useRef(false);
  useEffect(() => {
    if (schedDeepLinked.current || schedules.length === 0) return;
    const sid = new URLSearchParams(window.location.search).get('s');
    if (!sid) { schedDeepLinked.current = true; return; }
    const target = schedules.find((x) => x.id === sid);
    if (target) {
      setOpenSchedule(target);
      schedDeepLinked.current = true;
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('s');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch { /* ignore */ }
    }
  }, [schedules]);

  // 딥링크: ?v=<8자리코드>(단축) 또는 ?venue=<전체id>(구버전 호환) 진입 시 매장 페이지 자동 오픈
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || venues.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const full = params.get('venue');
    const short = params.get('v');
    const target = full
      ? venues.find((v) => v.id === full)
      : short
        // 커스텀 슬러그 정확 일치 우선 → 구형 8자리 id 프리픽스 폴백
        ? venues.find((v) => v.slug && v.slug.toLowerCase() === short.toLowerCase())
          ?? venues.find((v) => v.id.startsWith(short))
        : null;
    if (target) {
      setOpenVenueId(target.id);
      deepLinked.current = true;
      // URL 에서 v/venue 파라미터 제거 → 매장을 닫고 앱을 둘러보다 새로고침해도
      // 다시 그 매장 페이지로 돌아가지 않도록 한다(공유 링크 1회성 진입).
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('v');
        url.searchParams.delete('venue');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch { /* ignore */ }
    }
  }, [venues]);

  // 동적 SEO — 대회/매장 상세가 열리면 <head> 메타·canonical·JSON-LD 를 그에 맞게 갱신,
  // 둘 다 닫히면 홈 기본값으로 복원. Googlebot/네이버의 JS 렌더링이 읽어 개별 페이지 색인.
  useEffect(() => {
    if (openSchedule) { applyScheduleSeo(openSchedule); return; }
    const ov = openVenueId ? venues.find((v) => v.id === openVenueId) : null;
    if (ov) { applyVenueSeo(ov); return; }
    resetSeo();
  }, [openSchedule, openVenueId, venues]);

  // 딥링크: ?display=<venueId>&g=<gameSeq> — 매장 TV/빔프로젝터용 대형 관전 디스플레이 바로 열기.
  // venues 로드와 무관(디스플레이가 자체적으로 클락 조회) → 마운트 1회. URL 은 유지(새로고침해도 다시 표시).
  const displayDeepLinked = useRef(false);
  useEffect(() => {
    if (displayDeepLinked.current) return;
    displayDeepLinked.current = true;
    const sp = new URLSearchParams(window.location.search);
    const vid = sp.get('display');
    if (!vid) return;
    setDisplayTarget({ venueId: vid, gameSeq: Number(sp.get('g') || '1') || 1 });
  }, []);

  // 관전 디스플레이 열기(라이브 카드/운영자 클락에서) — 같은 탭에서 풀스크린 오버레이로
  const openDisplay = useCallback((venueId: string, gameSeq = 1) => setDisplayTarget({ venueId, gameSeq }), []);
  const closeDisplay = useCallback(() => {
    setDisplayTarget(null);
    try { const url = new URL(window.location.href); url.searchParams.delete('display'); url.searchParams.delete('g'); window.history.replaceState(null, '', url.pathname + url.search + url.hash); } catch { /* ignore */ }
  }, []);
  // 뒤로가기로 풀스크린 디스플레이 닫기 — App 레벨(초기 null→effect 세팅)이라 StrictMode 더블인보크 레이스 회피
  useBackClose(displayTarget !== null, closeDisplay);
  // 뒤로가기로 내 정보(지갑) 페이지 닫기 — 동일하게 App 레벨 게이트
  useBackClose(voucherWalletOpen, () => setVoucherWalletOpen(false));

  const handleScheduleSelect = useCallback((s: Schedule) => {
    // 포스터 상세는 전체화면 2열 모달(PC: 포스터 좌+정보 우)로 표시 — 좁은 패널보다 가독성↑
    // 마운트 비용을 스냅샷 뒤에서 치러 sheet-up 첫 프레임 드랍을 없앤다(미지원은 기존 경로)
    withViewTransition(
      () => flushSync(() => setOpenSchedule(s)),
      () => startTabTransition(() => setOpenSchedule(s)),
    );
  }, []);

  // 로고 클릭 → 메인(일정 탐색)으로 + 모든 모달/패널 닫기
  const handleHome = useCallback(() => {
    changeTab('browse');
    setOpenSchedule(null);
    setOpenVenueId(null);
    setOpenListing(null);
    setOpenNotice(null);
    setOpenPost(null);
    setPosterFormTarget(null);
    setSearchState({ query: '', dates: [], regions: [], format: null, gtdOnly: false, competitionOnly: false, grade: null, budget: null });
    tabScrollRef.current.set('browse', 0); // 홈 = 처음부터 — 복원 로직이 옛 위치로 되돌리지 않게
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkRead = useCallback((ids: string[]) => {
    setNotifications((prev) =>
      prev.map((n) => ids.includes(n.id) ? { ...n, read: true } : n),
    );
    // 실패 시 서버 상태로 재동기화 — 배지가 사라졌다 되살아나는 왕복 방지
    markNotificationsRead(ids).catch(() => { getMyNotifications().then(setNotifications).catch(() => {}); });
  }, []);

  // 알림 클릭 → 해당 페이지로 이동
  const handleNavigateNotification = useCallback((n: AppNotification) => {
    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
    const link = n.link ?? '';
    // /schedules/:id
    const sm = link.match(/^\/schedules\/(.+)$/);
    if (sm) {
      const sched = schedules.find((s) => s.id === sm[1]);
      if (sched) setOpenSchedule(sched);
      else toast.show('종료되었거나 내려간 포스터예요', 'info'); // 조용한 무반응 방지
      return;
    }
    // /community/:venueId
    const cm = link.match(/^\/community\/(.+)$/);
    if (cm) { setOpenVenueId(cm[1]); return; }
    // /posts/:id → 커뮤니티 탭 이동 + 해당 게시글 열기
    const pm = link.match(/^\/posts\/(.+)$/);
    if (pm) {
      changeTab('community');
      setPosts((prev) => {
        const found = prev.find((p) => p.id === pm[1]);
        if (found) setOpenPost(found);
        // 최근 50건 밖의 글(오래된 글에 달린 좋아요·댓글 알림)은 단건 조회로 연다
        else getPostById(pm[1]).then((fetched) => {
          if (fetched) setOpenPost(fetched);
          else toast.show('삭제되었거나 찾을 수 없는 글이에요', 'info');
        }).catch(() => {});
        return prev;
      });
      return;
    }
    // /guide/* (사용설명서 등 정적 가이드) → 새 탭으로 열기 — approval 타입 분기보다 먼저 평가해야 함
    if (link.startsWith('/guide/')) {
      window.open(link, '_blank', 'noopener');
      return;
    }
    // /invites (매장 구성원 초대) → 상단 초대 배너로 안내
    if (link === '/invites') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.show('상단의 초대 배너에서 수락/거절할 수 있습니다', 'info');
      return;
    }
    // /my-store/ledger (📒 장부 시작 알림) → 내 매장 탭 장부 섹션으로 바로
    if (link === '/my-store/ledger') {
      changeTab('my-store');
      setMyStoreDeep('ledger');
      return;
    }
    // /admin (포스터 승인 알림)
    if (link === '/admin' || n.type === 'approval') {
      changeTab(isAdmin ? 'admin' : 'my-store');
      return;
    }
    // /support (1:1 문의 답변 알림) → 고객센터 모달 열기
    if (link === '/support') { setSupportOpen(true); return; }
    // /wallet (🎟 이용권 도착) → 내 지갑(이용권 대시보드) 바로 열기
    if (link === '/wallet') { setVoucherWalletOpen(true); return; }
    // '/' (홈 안내형 알림) → 홈 탭으로 — 제목만 다시 토스트하는 막다른 길 방지
    if (link === '/') { changeTab('browse'); return; }
    toast.show(n.title, 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, isAdmin, toast]);

  const handleSubmitVenueComment = useCallback(
    (venueId: string, content: string, parentId?: string) => {
      if (!user) return;
      addComment({
        venueId, parentId,
        userId: user.id, userName: user.name, userRole: user.role,
        isOwner: user.role === 'venue_owner' && user.venueId === venueId,
        content,
      })
        .then((saved) => setComments((prev) => [saved, ...prev]))
        .catch(() => toast.show('댓글 등록에 실패했습니다', 'error'));
    },
    [user, toast],
  );

  const handleSubmitScheduleComment = useCallback(
    (scheduleId: string, content: string, parentId?: string) => {
      if (!user) return;
      const s = schedules.find((x) => x.id === scheduleId);
      addComment({
        scheduleId, parentId,
        userId: user.id, userName: user.name, userRole: user.role,
        isOwner: user.role === 'venue_owner' && s?.ownerId === user.id,
        content,
      })
        .then((saved) => setComments((prev) => [saved, ...prev]))
        .catch(() => toast.show('댓글 등록에 실패했습니다', 'error'));
    },
    [user, schedules, toast],
  );

  // 커뮤니티 글쓰기 모달 제출 — 카테고리·제목·내용·이미지 포함 (Stage 2)
  const handleCreatePost = useCallback(async (data: PostFormData) => {
    if (!user) throw new Error('로그인이 필요합니다');
    const saved = await addPost({
      userId: user.id, userName: user.name, userRole: user.role,
      userColor: user.avatarColor,
      content: data.content,
      category: data.category,
      title: data.title || undefined,
      images: data.images.length > 0 ? data.images : undefined,
    });
    setPosts((prev) => [saved, ...prev]);
  }, [user]);

  // 중고장터 글쓰기 모달 제출 — createListing 연동 (Stage 2)
  const handleCreateListing = useCallback(async (data: MarketplaceFormData) => {
    if (!user) throw new Error('로그인이 필요합니다');
    const saved = await createListing({
      title: data.title,
      category: data.category,
      description: data.description,
      price: data.price,
      condition: data.condition,
      status: 'on_sale',
      images: data.images,
      region: data.region,
      shippingAvailable: data.shippingAvailable,
      pickupOnly: data.pickupOnly,
      sellerId: user.id,
      sellerName: user.name,
      sellerAvatarColor: user.avatarColor ?? '#5A6175',
      sellerTradeCount: 0,
      sellerVerified: !!user.verified, // '본인 인증 ✓'가 업주 여부로 찍히던 가짜 신호 — CI 인증 기준으로 정직화
    });
    setListings((prev) => [saved, ...prev]);
  }, [user]);

  const handleLikePost = useCallback((postId: string) => {
    if (!userRefForGate.current) { promptLogin(); return; } // 비로그인: flip→서버실패→롤백 소음 대신 바로 유도
    // 낙관적 토글(1인 1회) → 서버 권위값 보정, 실패 시 롤백. 피드(posts)와 상세(openPost) 동시 반영.
    const flip = (p: CommunityPost) => ({ ...p, liked: !p.liked, likeCount: Math.max(0, p.likeCount + (p.liked ? -1 : 1)) });
    const apply = (fn: (p: CommunityPost) => CommunityPost) => {
      setPosts((prev) => prev.map((p) => p.id === postId ? fn(p) : p));
      setOpenPost((cur) => (cur && cur.id === postId ? fn(cur) : cur));
    };
    apply(flip);
    togglePostLike(postId)
      .then(({ liked, count }) => apply((p) => ({ ...p, liked, likeCount: count })))
      .catch((e) => { apply(flip); toast.show(e instanceof Error ? e.message : '좋아요 처리 실패', 'error'); }); // 되돌리기
  }, [toast]);

  // 관리자: 회원 업데이트 (승인/정지/해제) — 서버 반영
  const handleUpdateUser = useCallback((id: string, patch: Partial<User>) => {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, ...patch } : u));
    if (patch.approved !== undefined) {
      // 실패 시 낙관적 패치를 서버 상태로 재동기화 — 승인 실패가 '승인됨'으로 남는 불일치 방지
      approveOwner(id, patch.approved).catch(() => { toast.show('승인 처리에 실패했습니다', 'error'); listAllUsers().then(setUsers).catch(() => {}); });
    }
    if (patch.status !== undefined) {
      updateUserStatus(id, patch.status, patch.suspendedUntil, patch.sanctionReason)
        .catch(() => { toast.show('상태 변경에 실패했습니다', 'error'); listAllUsers().then(setUsers).catch(() => {}); });
    }
  }, [toast]);

  // 관리자/작성자: 게시글 삭제 — 서버 삭제 + 활동로그 기록(권한은 RLS가 강제)
  const handleDeletePost = useCallback((id: string) => {
    const target = posts.find((p) => p.id === id);
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setOpenPost((cur) => (cur?.id === id ? null : cur));
    deletePost(id)
      .then(() => {
        logActivity({ action: 'delete', targetType: 'post', targetId: id, targetOwnerId: target?.userId, targetSummary: target?.title || target?.content, actorName: user?.name });
        toast.show('게시글이 삭제되었습니다', 'success');
      })
      .catch(() => { toast.show('삭제에 실패했습니다', 'error'); reloadPosts(); }); // #12 실패 시 목록 복원
  }, [posts, user, toast, reloadPosts]);

  // 관리자/판매자: 매물 삭제 — 서버 삭제 + 활동로그
  const handleDeleteListing = useCallback((id: string) => {
    const target = listings.find((l) => l.id === id);
    setListings((prev) => prev.filter((l) => l.id !== id));
    setOpenListing((cur) => (cur?.id === id ? null : cur));
    deleteListing(id)
      .then(() => {
        logActivity({ action: 'delete', targetType: 'listing', targetId: id, targetOwnerId: target?.sellerId, targetSummary: target?.title, actorName: user?.name });
        toast.show('매물이 삭제되었습니다', 'success');
      })
      .catch(() => { toast.show('삭제에 실패했습니다', 'error'); getListings().then(setListings).catch(() => {}); }); // #12 실패 시 목록 복원
  }, [listings, user, toast]);

  // 관리자: 댓글 삭제 — 낙관적 제거 후 서버 반영(권한은 RLS가 강제)
  const handleDeleteComment = useCallback((commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentId !== commentId));
    deleteComment(commentId)
      .then(() => toast.show('댓글이 삭제되었습니다', 'success'))
      .catch(() => { toast.show('댓글 삭제에 실패했습니다', 'error'); reloadComments(); });
  }, [toast, reloadComments]);

  // 관리자: 공지 작성/수정 — 등록·수정 후 목록 갱신 (권한은 RLS가 강제)
  const handleSubmitNotice = useCallback(async (data: NoticeFormData) => {
    if (!user) throw new Error('로그인이 필요합니다');
    if (editingNotice) {
      await updateNotice(editingNotice.id, { type: data.type, title: data.title, body: data.body, board: data.board });
      setNotices((prev) => prev.map((n) => (n.id === editingNotice.id ? { ...n, type: data.type, title: data.title, body: data.body, board: data.board } : n)));
      setEditingNotice(null);
    } else {
      const saved = await createNotice({
        type: data.type, title: data.title, body: data.body, authorName: user.name, board: data.board,
      });
      setNotices((prev) => [saved, ...prev]);
    }
  }, [user, editingNotice]);
  const handleDeleteNotice = useCallback(async (id: string) => {
    try {
      await deleteNotice(id);
      setNotices((prev) => prev.filter((n) => n.id !== id));
      setOpenNotice(null);
      toast.show('공지사항이 삭제되었습니다', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : '삭제에 실패했습니다', 'error'); }
  }, [toast]);

  // 매장 소개/이미지 저장 — 실패 시 낙관적 반영을 서버 상태로 되돌림(저장된 것처럼 보이는 불일치 방지)
  const handleUpdateVenueDescription = useCallback((venueId: string, description: string) => {
    setVenues((prev) => prev.map((v) => v.id === venueId ? { ...v, description } : v));
    updateVenueDescription(venueId, description).catch(() => { toast.show('저장에 실패했습니다', 'error'); reloadVenues(); });
  }, [toast, reloadVenues]);

  const handleUpdateVenueImage = useCallback((venueId: string, dataUrl: string) => {
    setVenues((prev) => prev.map((v) => v.id === venueId ? { ...v, imageUrl: dataUrl } : v));
    updateVenueImage(venueId, dataUrl)
      .then(() => toast.show('배경이 저장되었습니다', 'success'))
      .catch(() => { toast.show('저장에 실패했습니다', 'error'); reloadVenues(); });
  }, [toast, reloadVenues]);

  const handleUpdateVenueImages = useCallback((venueId: string, urls: string[]) => {
    setVenues((prev) => prev.map((v) => v.id === venueId ? { ...v, images: urls } : v));
    updateVenueImages(venueId, urls)
      .then(() => toast.show('매장 사진이 저장되었습니다', 'success'))
      .catch(() => { toast.show('저장에 실패했습니다', 'error'); reloadVenues(); });
  }, [toast, reloadVenues]);

  // 포스터 삭제 유예 큐 — schedules 삭제는 예약(schedule_reservations)과 문의(comments)를
  // FK CASCADE 로 물리 삭제한다(ledger_sessions 만 SET NULL 로 살아남는다).
  // 지운 뒤 되살릴 방법이 없으므로 '5초 동안 서버로 안 보내기'가 유일한 실행취소다.
  const posterDeleteQ = useMemo(() => createUndoQueue(5000), []);
  const handleDeletePoster = useCallback((id: string) => {
    const target = schedules.find((s) => s.id === id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    setOpenSchedule((cur) => (cur?.id === id ? null : cur));
    posterDeleteQ.schedule(id, () => {
      deleteSchedule(id)
        .then(() => logActivity({ action: 'delete', targetType: 'schedule', targetId: id, targetOwnerId: target?.ownerId, targetSummary: target?.title, actorName: user?.name }))
        .catch(() => { toast.show('삭제에 실패했습니다', 'error'); reloadSchedules(); });
    });
    // durationMs 를 유예 시간(5초)에 맞춘다 — 토스트가 더 오래 남으면 이미 삭제된 뒤에도
    // '되돌리기'가 눌러지는 것처럼 보여 사장님을 두 번 속인다.
    toast.show(`'${target?.title ?? '포스터'}' 삭제됨`, 'info', {
      durationMs: 5000,
      action: { label: '되돌리기', onClick: () => {
        // 취소 성공 = 서버엔 아무 일도 일어나지 않았다는 뜻 — 목록은 서버에서 다시 받아 정렬까지 원복
        if (posterDeleteQ.cancel(id)) { reloadSchedules(); toast.show('삭제를 취소했습니다', 'success'); }
        else toast.show('이미 삭제되어 되돌릴 수 없습니다', 'error');
      } },
    });
  }, [schedules, user, toast, reloadSchedules, posterDeleteQ]);

  // 탭을 닫거나 앱을 벗어나면 대기 중인 삭제를 즉시 흘려보낸다 —
  // 안 그러면 '지웠는데 새로고침하면 살아있는' 상태로 남는다.
  useEffect(() => {
    const flush = () => posterDeleteQ.flushAll();
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [posterDeleteQ]);

  // 내 매장 keep-alive(memo) 전용 — 인라인 클로저면 App 재렌더마다 새 참조라 memo 가 무력화된다
  const handleCreatePosterFromStore = useCallback(() => {
    // 승인 전 업주는 포스터 등록 차단(서버 RLS와 이중 방어 + 명확한 안내)
    if (user?.role === 'venue_owner' && !user.approved) {
      toast.show('매장 승인 완료 후 포스터를 등록할 수 있습니다', 'error');
      return;
    }
    setPosterFormTarget(undefined);
  }, [user, toast]);
  const handleEditPosterFromStore = useCallback((id: string) => {
    const s = schedules.find((x) => x.id === id);
    if (s) setPosterFormTarget(s);
  }, [schedules]);
  const handleConsumeMyStoreDeep = useCallback(() => setMyStoreDeep(null), []);

  // 관리자: 포스터 승인 / 반려 — 서버 반영
  const handleApproveSchedule = useCallback((id: string) => {
    setSchedules((prev) => prev.map((s) => s.id === id ? { ...s, approved: true } : s));
    updateSchedule(id, { approved: true })
      .then(() => toast.show('포스터가 승인되어 메인에 게시되었습니다', 'success'))
      .catch(() => { toast.show('승인에 실패했습니다', 'error'); reloadSchedules(); });
  }, [toast, reloadSchedules]);

  const handleRejectSchedule = useCallback((id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    deleteSchedule(id)
      .then(() => toast.show('포스터가 반려되었습니다', 'info'))
      .catch(() => { toast.show('반려에 실패했습니다', 'error'); reloadSchedules(); });
  }, [toast, reloadSchedules]);

  const handleSubmitPoster = useCallback((data: PosterFormData) => {
    // 시상품 텍스트 → SeatVoucher 형태로 변환 (간단 파싱: 끝의 "N석" 인식)
    const seatsFromPrizes = data.prizes.map((p) => {
      const m = p.match(/^(.+?)\s*(\d+)\s*석$/);
      return m ? { label: m[1].trim(), count: parseInt(m[2], 10) }
               : { label: p, count: 1 };
    });
    const seats = seatsFromPrizes.length > 0 ? seatsFromPrizes : undefined;

    // ── 수정 모드 ──
    if (data.id) {
      const patch: Partial<Schedule> = {
        title:        data.title,
        date:         data.date,
        startTime:    data.startTime,
        regCloseTime: data.regCloseTime,
        duration:     data.duration,
        blinds:       data.blinds,
        ...(data.blindLevels && data.blindLevels.length ? { structure: { ...(schedules.find((s) => s.id === data.id)?.structure ?? {}), levels: data.blindLevels } } : {}),
        guaranteed:   data.prizeType === 'GTD',
        isCompetition: data.isCompetition,
        prizePool:    data.prizeType === 'GTD'   ? data.prizeAmount * 10_000 : 0,
        prizePercent: data.prizeType === 'ENTRY' ? data.prizePercent : 0,
        buyIn:        { amount: data.buyIn, gameType: data.gameType?.trim() || undefined, addonStack: data.addonStack || undefined, addon: data.addonCost || undefined, startStack: data.startStack || undefined, rebuyStack: data.rebuyStack || undefined },
        region:       data.region,
        paymentMethods: data.paymentMethods,
        partners:     data.partners,
        rankingPrizes: data.rankingPrizes.filter((r) => r.amount > 0),
        promotions:   data.events,
        seats,
      };
      if (data.posterUrl !== undefined) patch.posterUrl = data.posterUrl;

      setSchedules((prev) => prev.map((s) =>
        s.id === data.id ? { ...s, ...patch, posterUrl: data.posterUrl ?? s.posterUrl } : s));
      updateSchedule(data.id, patch)
        .then(reloadSchedules)
        .catch(() => { toast.show('수정 저장에 실패했습니다', 'error'); reloadSchedules(); });
      return;
    }

    // ── 신규 등록 ──
    if (!user) return;
    const adminPosting = user.role === 'admin';
    // 관리자: 선택/직접입력한 홀덤펍 사용, 즉시 승인. 업주: 본인 매장, 승인 대기.
    const venueIdToUse = adminPosting ? (data.venueId || '') : (user.venueId ?? '');
    const pubNameToUse = adminPosting
      ? (venues.find((v) => v.id === data.venueId)?.name ?? data.pubName ?? '미지정')
      : (venues.find((v) => v.id === user.venueId)?.name ?? user.name);
    const addDays = (iso: string, n: number) => { const dd = new Date(iso + 'T00:00:00'); dd.setDate(dd.getDate() + n); return dd.toLocaleDateString('en-CA'); };
    const mkPayload = (dateStr: string) => ({
      title:          data.title,
      venueId:        venueIdToUse,
      pubName:        pubNameToUse,
      approved:       adminPosting ? true : false,
      region:         data.region,
      date:           dateStr,
      startTime:      data.startTime,
      duration:       data.duration,
      blinds:         data.blinds,
      structure:      data.blindLevels && data.blindLevels.length ? { levels: data.blindLevels } : undefined,
      regCloseTime:   data.regCloseTime,
      format:         'MTT' as const,
      guaranteed:     data.prizeType === 'GTD',
      isCompetition:  data.isCompetition,
      prizePool:      data.prizeType === 'GTD'   ? data.prizeAmount * 10_000 : 0,
      prizePercent:   data.prizeType === 'ENTRY' ? data.prizePercent : undefined,
      buyIn:          { amount: data.buyIn, gameType: data.gameType?.trim() || undefined, addonStack: data.addonStack || undefined, addon: data.addonCost || undefined, startStack: data.startStack || undefined, rebuyStack: data.rebuyStack || undefined },
      paymentMethods: data.paymentMethods,
      partners:       data.partners,
      rankingPrizes:  data.rankingPrizes.filter((r) => r.amount > 0),
      promotions:     data.events,
      seats,
      posterUrl:      data.posterUrl,
      posterColor:    '#7C2D7E',
      displayOrder:   999,
      isPremium:      false,
      ownerId:        user.id,
    });
    // 반복 등록: 매주 같은 요일/시간으로 N주 생성(1=반복 없음, 최대 12)
    const weeks = Math.max(1, Math.min(data.repeatWeeks ?? 1, 12));
    const dates = Array.from({ length: weeks }, (_, i) => addDays(data.date, i * 7));
    Promise.all(dates.map((dt) => createSchedule(mkPayload(dt))))
      .then(reloadSchedules)
      .then(() => { if (weeks > 1) toast.show(`${weeks}주 반복 일정이 등록되었습니다`, 'success'); })
      .catch(() => toast.show('포스터 등록에 실패했습니다. 매장 승인 상태를 확인해 주세요.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, venues, toast, reloadSchedules]);

  // 일정탐색(browse) 상단 공지 — 전체('all') 공지만 노출(게시판/딜러/장터 전용 공지는 제외)
  const [noticesOpen, setNoticesOpen] = useState(false); // 공지는 기본 접힘 — 첫 화면 밀도 우선
  const browseNotices = useMemo(
    () => notices.filter((n) => !n.board || n.board === 'all'),
    [notices],
  );

  // (A2) CommunityTab/MarketplaceTab props 안정화 — memo 적용 시 App의 무관한 재렌더(알림·바인요청 등)에 피드가 재렌더되지 않게.
  const communityNotices = useMemo(() => notices.filter((n) => !n.board || n.board === 'all' || n.board === 'community'), [notices]);
  const marketNotices    = useMemo(() => notices.filter((n) => !n.board || n.board === 'all' || n.board === 'market'), [notices]);
  const handleWriteNotice = useCallback(() => setNoticeFormOpen(true), []);
  // 헤더·탭바에 인라인 화살표를 넘기면 memo 를 걸어도 매 렌더 무효 — 참조 고정 콜백으로.
  const openLoginCb = useCallback(() => setAuthOpen(true), []);
  const openProfileCb = useCallback(() => setProfileOpen(true), []);
  const openSearchCb = useCallback(() => setGlobalSearchOpen(true), []);
  const openVouchersCb = useCallback(() => setVoucherWalletOpen(true), []);
  const pcTabs = useMemo(() => tabs.filter((t) => t.id !== 'market'), [tabs]);
  const tabDot = useMemo(() => ({ community: commHasNew }), [commHasNew]);
  const tabCount = useMemo(() => ({ live: liveCount }), [liveCount]);
  const openMeCb = useCallback(() => { if (userRefForGate.current) setVoucherWalletOpen(true); else setAuthOpen(true); }, []);
  // ⚠ deps 에 user '객체'를 두면 부팅 중 참조 교체(로그인→일일점수)마다 콜백이 재생성돼
  //   CommunityTabM·MarketplaceTabM·marketSlot 세 곳의 memo 가 동시에 깨졌다(실측).
  //   최신 user 는 ref 로 읽고 콜백 참조는 고정한다.
  const userRefForGate = useRef(user);
  useEffect(() => { userRefForGate.current = user; });
  const handleOpenWrite = useCallback((category?: PostCategory) => {
    if (!ensureVerified(userRefForGate.current, '글쓰기')) return; // 본인인증 회원만 글쓰기
    setPostFormCategory(category ?? 'free');
    setPostFormOpen(true);
  }, []);
  const handleMarketCreate = useCallback(() => { if (ensureVerified(userRefForGate.current, '중고장터 등록')) setMarketFormOpen(true); }, []);
  const handleListingsChanged = useCallback(() => { getListings().then(setListings).catch(() => {}); }, []);
  const marketSlot = useMemo(() => (
    <MarketplaceTab listings={listings} loading={!marketLoaded} notices={marketNotices}
      onSelect={setOpenListing} onSelectNotice={setOpenNotice} onCreate={handleMarketCreate}
      canWriteNotice={isAdmin} onWriteNotice={handleWriteNotice} onListingsChanged={handleListingsChanged} />
  ), [listings, marketLoaded, marketNotices, isAdmin, handleMarketCreate, handleWriteNotice, handleListingsChanged]);

  // ── 렌더 ──────────────────────────────────────────────────────────────

  return (
    // 모바일: 폭 그대로(full). 데스크톱: 중앙 정렬 + 최대폭으로 무한 확장 방지 + 프레임.
    <div className="min-h-screen bg-surface-base mx-auto w-full max-w-6xl xl:border-x xl:border-border-subtle">
      {/* 오프라인 배너(Phase 17-5) — 토스트(z-100)와 층 분리, 헤더 위 상시 고정 */}
      {offline && (
        <div role="status" className="sticky top-0 z-[60] flex items-center justify-center gap-1.5 bg-amber-500/95 px-3 py-1.5 text-xs font-bold text-black">
          <span aria-hidden>📡</span> 오프라인 — 저장된 정보를 보여드려요. 연결되면 자동으로 새로고침합니다.
        </div>
      )}
      <AppHeader
        title={activeTab === 'browse' ? undefined : tabs.find((t) => t.id === activeTab)?.label}
        activeTab={activeTab}
        onGotoTab={changeTab}
        unreadCount={unreadNotifs}
        notifications={notifications}
        onMarkRead={handleMarkRead}
        onOpenLogin={openLoginCb}
        onNavigateNotification={handleNavigateNotification}
        onHome={handleHome}
        onOpenProfile={openProfileCb}
        onOpenSearch={openSearchCb}
        onOpenVouchers={openVouchersCb}
        suppressed={openVenueId !== null}
      />

      {/* 🔄 새 버전 배너 — 배포 감지 시 새로고침 유도(앱이 멈춰 보이지 않게). 오프라인 배너처럼 sticky로 스크롤 중에도 보이게(z는 오프라인 바로 아래) */}
      {updateReady && (
        <button type="button" onClick={() => location.reload()}
          className="sticky top-0 z-[59] flex w-full items-center justify-center gap-2 bg-accent-300 px-3 py-2 text-xs font-bold text-white active:opacity-80">
          🔄 새 버전이 있어요 — 탭하여 새로고침
        </button>
      )}
      {/* 🔔 운영자 푸시 온보딩(설치형·1회) — 새 바인요청 폰 알림 */}
      {pushNudge && (
        <div className="flex items-center gap-2 border-b border-accent-400/30 bg-accent-300/[0.08] px-3 py-2.5">
          <span className="text-lg" aria-hidden>🔔</span>
          <p className="min-w-0 flex-1 text-2xs leading-snug text-ink-secondary">
            {(isOwner || isAdmin || user?.role === 'venue_staff')
              ? <>새 <b className="text-accent-300">바인요청</b>을 폰 알림으로 받으세요 — 게임 중에도 놓치지 않아요.</>
              : <>예약한 대회 <b className="text-accent-300">1시간 전 리마인더</b>와 이용권 도착을 폰으로 받으세요.</>}
          </p>
          <button type="button" onClick={doEnablePush} className="btn-primary shrink-0 px-3 py-1.5 text-2xs">알림 켜기</button>
          <button type="button" onClick={dismissPushNudge} aria-label="닫기" className="hit relative shrink-0 px-1 text-ink-muted hover:text-ink-secondary">✕</button>
        </div>
      )}

      {/* 본인인증 유도 배너 (미인증·PortOne 설정 시) */}
      {user && !user.verified && PORTONE_CONFIGURED && (
        <button type="button" onClick={() => setProfileOpen(true)}
          className="w-full flex items-center gap-2 bg-accent-300/[0.08] border-b border-accent-400/30 px-page-x py-2 text-left hover:bg-accent-300/[0.12] transition-colors">
          <span className="text-sm" aria-hidden>🔒</span>
          <span className="flex-1 text-2xs text-accent-300">휴대폰 본인인증이 필요합니다 — 안전한 이용을 위해 인증해 주세요.</span>
          <span className="shrink-0 text-2xs font-bold text-accent-300">인증하기 →</span>
        </button>
      )}

      {/* 본인인증 게이트 안내 시트(#31) — 미인증 회원이 민감 기능 시도 시 자동 표시 */}
      <VerifyGateSheet onStart={() => setProfileOpen(true)} />

      {/* 첫 진입 온보딩(#29) — 신규 방문자 1회성 웰컴 시트(딥링크 진입 시 미표시) */}
      <OnboardingSheet />

      {voucherWalletOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <CustomerDashboardPage open={voucherWalletOpen} onClose={() => setVoucherWalletOpen(false)}
            unread={notifications.filter((n) => !n.read)}
            onOpenNotification={(id) => {
              const n = notifications.find((x) => x.id === id);
              setVoucherWalletOpen(false);
              if (n) { handleMarkRead([n.id]); handleNavigateNotification(n); }
            }}
            onOpenPost={(pp) => { setVoucherWalletOpen(false); changeTab('community'); setOpenPost(pp); }}
            onOpenProfile={() => { setVoucherWalletOpen(false); setProfileOpen(true); }}
            onOpenMarket={() => {
              setVoucherWalletOpen(false);
              window.dispatchEvent(new CustomEvent('nuri:community-section', { detail: 'market' }));
              try { sessionStorage.setItem('nuri:community-section', 'market'); } catch { /* noop */ }
              changeTab('community');
            }} />
        </Suspense>
      )}

      {/* 관전 / 대형 디스플레이(매장 TV·빔프로젝터) — 풀스크린 읽기전용 */}
      {displayTarget && (
        <Suspense fallback={<OverlayFallback />}>
          <ClockDisplay venueId={displayTarget.venueId} gameSeq={displayTarget.gameSeq}
            venueName={venues.find((v) => v.id === displayTarget.venueId)?.name}
            onClose={closeDisplay} />
        </Suspense>
      )}

      {/* 전역 레벨업 감지 + 축하 — 점수 변동 즉시(대시보드 밖에서도) */}
      <LevelUpWatcher points={user?.activityPoints} />

      <PendingApprovalBanner />
      <InstallBanner />
      <TierCelebration />

      <TabBar tabs={pcTabs} active={activeTab} onChange={changeTab} />
      {/* 모바일 하단 탭바(Riot Mobile 스타일) — 상단 GNB 대체 */}
      <MobileTabBar tabs={tabs} active={activeTab} onChange={changeTab} dot={tabDot} count={tabCount}
        onOpenMe={openMeCb} />

      {/* 일정 탐색 */}
      <div className="px-page-x"><StaffInviteBanner /></div>

      {(activeTab === 'browse' || visitedTabs.has('browse')) && (
        <main className="tab-pane" style={activeTab !== 'browse' ? { display: 'none' } : undefined}
          onTouchStart={onPtrStart} onTouchMove={onPtrMove} onTouchEnd={onPtrEnd}>
          {/* 당겨서 새로고침 인디케이터 — ♠ 회전. out-of-flow(fixed) 오버레이(MO-4):
              헤더(z-50) 아래 z-40 에서 translateY 로 내려온다 — 콘텐츠를 밀지 않는다(리레이아웃 0).
              대기 시 translateY(-52px)로 불투명 헤더 뒤에 숨는다. */}
          <div ref={ptrBoxRef}
            className="pointer-events-none fixed inset-x-0 z-40 flex h-[52px] items-center justify-center lg:hidden"
            style={{ top: 'var(--stack-top, 97px)', transform: 'translateY(-52px)' }} aria-hidden>
            <span ref={ptrIconRef}
              className={['text-2xl text-accent-300', ptrRefreshing ? 'animate-spin' : ''].join(' ')}
              style={{ opacity: 0 }}>♠</span>
          </div>
          {/* display:contents 로 래퍼 박스를 없애 검색+날짜 sticky 가 '긴 컨텐츠 컨테이너'의 직계자식이 되도록
              (짧은 헤더 박스에 갇히면 리스트를 스크롤할 때 검색+날짜가 같이 사라짐) */}
          <div className="contents">
            {/* 검색바+날짜만 sticky(아래 필터·카운트는 스크롤되어 사라짐) */}
            <IntegratedSearchBar ref={searchBarRef} onChange={setSearchState} eventDates={eventDates} stickyTop="calc(var(--stack-top, 6.0625rem) - 1px)" />
            {/* 뷰 모드 토글 + 팔로우 매장만 보기 — 일정 탐색 컨텍스트 안에 배치 */}
            <div className="flex items-center justify-between gap-2 px-page-x pt-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-2xs text-ink-muted">
                  총 <span className="text-ink-secondary tabular-nums font-semibold">{visibleSchedules.length}</span>개
                  {followedOnly && <span className="ml-1 text-accent-300">· 팔로우</span>}
                </span>
                {/* 📍 가까운 순 — 위치 1회 요청 토글(Phase 14). 좌표 없는 매장은 뒤로. */}
                <button
                  type="button"
                  onClick={toggleNearSort}
                  aria-pressed={nearSort}
                  className={['hit shrink-0 -my-1.5 inline-flex h-8 items-center gap-1 rounded-badge border px-2 text-2xs font-bold transition-colors',
                    nearSort ? 'border-accent-300 bg-accent-300/10 text-accent-300' : 'border-border-default text-ink-secondary hover:text-ink-primary'].join(' ')}>
                  📍 가까운 순
                </button>
                {/* 전체 초기화 — 별도 줄 차지하지 않게 '총 N개' 옆에 배치(검색바 clearAll 호출) */}
                {hasActiveSearchFilter && (
                  <button
                    type="button"
                    onClick={() => searchBarRef.current?.clearAll()}
                    // 22px 였다 — 빈 화면에서 유일한 탈출구인데 9px 아이콘에 회색 글씨라
                    // 눈에도 안 띄고 손가락으로도 짚기 어려웠다. 히트영역을 키우고 대비를 올린다.
                    className="shrink-0 -my-1.5 inline-flex h-8 items-center gap-1 rounded-badge border border-border-default px-2 text-2xs text-ink-secondary transition-colors hover:border-danger/40 hover:text-danger focus:outline-none"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4h8v2m-1 0v14H9V6" /></svg>
                    초기화
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {user && (
                  <button
                    type="button"
                    onClick={() => setFollowedOnly((v) => !v)}
                    aria-pressed={followedOnly}
                    className={[
                      'inline-flex h-9 items-center gap-1 rounded-input border px-2.5 text-2xs font-bold leading-none transition-colors',
                      followedOnly ? 'border-accent-300 bg-accent-300 text-white' : 'border-border-subtle bg-surface-high/60 text-ink-secondary hover:text-ink-primary',
                    ].join(' ')}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill={followedOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 17.3l-5.4 3 1-6L3 9.8l6-.9L12 3.5l3 5.4 6 .9-4.6 4.5 1 6z" /></svg>
                    팔로우{followedIds.size > 0 ? ` ${followedIds.size}` : ''}
                  </button>
                )}
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
              </div>
            </div>
          </div>

          {/* 🎁 오픈 이벤트 배너 — 서버(check_in 등)와 동일한 KST 날짜 게이트, 8/3 이후 자동 소멸 */}
          {(() => {
            const kst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
            if (kst < '2026-07-20' || kst > '2026-08-03' || eventBannerHidden) return null;
            const evNotice = browseNotices.find((n) => n.title.includes('오픈 기념 이벤트'));
            return (
              <div className="px-page-x pt-3">
                <div className="relative flex items-center gap-2.5 overflow-hidden rounded-card border border-accent-400/45 bg-gradient-to-r from-accent-300/[0.16] via-accent-300/[0.07] to-transparent px-3 py-2.5">
                  <span className="shrink-0 text-lg" aria-hidden>🎁</span>
                  <button
                    type="button"
                    onClick={() => { if (evNotice) setOpenNotice(evNotice); }}
                    className="min-w-0 flex-1 text-left focus:outline-none"
                  >
                    <p className="truncate text-xs font-bold text-ink-primary">오픈 이벤트 — 출석 도장 2배 · 첫 예약 +50 · 웰컴 +100</p>
                    <p className="text-2xs text-ink-muted">8/3(월)까지 · 자세히 보기 →</p>
                  </button>
                  <button
                    type="button"
                    aria-label="이벤트 배너 닫기"
                    onClick={() => { setEventBannerHidden(true); try { localStorage.setItem('nuri:event-2607-hidden', '1'); } catch { /* 무시 */ } }}
                    className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-surface-high hover:text-ink-primary transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" /></svg>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* 주간 베스트 — 이번 주 머니인 킹 TOP3 롤링 (MO-7B: 래퍼·로딩 스켈레톤 내장) */}
          <WeeklyBestStrip active={activeTab === 'browse'} />

          {/* 공지 — 일정탐색 상단 (전체 공통 공지만) */}
          {(browseNotices.length > 0 || isAdmin || !noticesLoaded) && (
            <div className="px-page-x pt-3">
              <section className="rounded-card border border-accent-400/30 bg-gradient-to-br from-accent-300/[0.05] to-transparent overflow-hidden">
                <header className="flex items-center justify-between px-3 py-2 border-b border-accent-400/20">
                  <button
                    type="button"
                    onClick={() => setNoticesOpen((v) => !v)}
                    aria-expanded={noticesOpen}
                    // 글자 높이 그대로면 17px 다. 헤더의 py-2 를 음수 마진으로 되먹여
                    // 헤더 높이는 유지한 채 손가락이 닿는 영역만 33px 로 넓힌다.
                    className="-my-2 py-2 -ml-1 pl-1 pr-2 flex items-center gap-1.5 text-xs font-bold text-accent-300 focus:outline-none"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                      className={['transition-transform duration-200', noticesOpen ? '' : '-rotate-90'].join(' ')}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    공지사항 {browseNotices.length > 0 && <span className="text-2xs text-ink-muted font-normal">({browseNotices.length})</span>}
                  </button>
                  {isAdmin && (
                    <button type="button" onClick={() => setNoticeFormOpen(true)} className="-my-2 py-2 pl-2 text-2xs text-accent-300 hover:text-accent-200 font-semibold">
                      + 공지 작성
                    </button>
                  )}
                </header>
                {noticesOpen && (browseNotices.length > 0 ? (
                  <ul>
                    {browseNotices.slice(0, 3).map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => setOpenNotice(n)}
                          className="w-full text-left px-3 py-2 border-b border-border-subtle last:border-b-0 hover:bg-surface-high/50 transition-colors focus:outline-none"
                        >
                          <p className="text-xs font-semibold text-ink-primary truncate">{n.title}</p>
                          {n.body && <p className="text-2xs text-ink-muted line-clamp-1 mt-0.5">{n.body}</p>}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-3 text-center text-2xs text-ink-muted">등록된 공지가 없습니다</p>
                ))}
              </section>
            </div>
          )}

          <div className="px-page-x pt-3 pb-section lg:pt-4">
            {/* PC 3컬럼: 중앙 콘텐츠 + 우측 위젯 레일(xl 이상) — 바이낸스식 정보 밀도 */}
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                {!schedulesLoaded ? (
                  <ScheduleSkeletonGrid viewMode={viewMode} />
                ) : schedulesError && schedules.length === 0 ? (
                  <LoadErrorCard error={schedulesError} what="대회 목록"
                    onRetry={() => { setSchedulesLoaded(false); reloadSchedules(); }} />
                ) : visibleSchedules.length === 0 ? (
                  <EmptyState
                    filtered={!!searchState.query.trim() || searchState.dates.length > 0
                      || searchState.regions.length > 0 || !!searchState.format
                      || searchState.gtdOnly || searchState.competitionOnly}
                    filterSummary={[
                      searchState.query.trim() && `검색어 "${searchState.query.trim()}"`,
                      searchState.dates.length > 0 && `날짜 ${searchState.dates.length}일`,
                      searchState.regions.length > 0 && `지역 ${searchState.regions.join('·')}`,
                      searchState.format,
                      searchState.grade && ({ daily: '데일리', satellite: '새틀', series: '시리즈' } as Record<string, string>)[searchState.grade],
                      searchState.gtdOnly && 'GTD',
                      searchState.competitionOnly && '대회',
                    ].filter(Boolean).join(' · ')}
                    followedOnly={followedOnly}
                    onClearFilters={() => searchBarRef.current?.clearAll()}
                    onClearFollow={() => setFollowedOnly(false)}
                    upcoming={schedules.filter((s) => s.approved && scheduleStatus(s.date, s.startTime) !== 'ended').length}
                  />
                ) : viewMode === 'table' ? (
                  <div className="hidden md:block">
                    <ScheduleTable schedules={visibleSchedules} onSelect={handleScheduleSelect} onVenueClick={handleVenueClick} />
                  </div>
                ) : (
                  <div className={[
                    viewMode === 'grid'
                      // 그리드 뷰: 모바일 2열 → 데스크톱 4~5열
                      ? 'grid grid-cols-2 gap-card-gap sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                      // 리스트 뷰: 모바일 1열(가로 카드) → PC 2열(공간 활용·광고 여백 확보)
                      : 'grid grid-cols-1 lg:grid-cols-2 gap-card-gap',
                  ].join(' ')}>
                    {visibleSchedules.map((s, i) => (
                      <ScheduleCard
                        key={s.id}
                        mode={viewMode}
                        schedule={s}
                        reserveCount={browseResCounts[s.id]}
                        rating={venueRatings[s.venueId]}
                        distanceKm={distanceOf(s)}
                        regInfo={regInfoBySchedule.get(s.id)}
                        onVenueClick={handleVenueClick}
                        onSelect={handleScheduleSelect}
                        // ⚡ 첫 화면에 보이는 상단 카드만 포스터를 즉시 로드(LCP 단축).
                        //    그리드는 한 화면에 더 많이 보이므로 6장, 리스트는 4장.
                        priority={i < (viewMode === 'grid' ? 6 : 4)}
                      />
                    ))}
                  </div>
                )}
                {/* 표 모드는 PC 전용 — 모바일 폭에선 리스트로 자동 표시 */}
                {viewMode === 'table' && visibleSchedules.length > 0 && (
                  <div className="grid grid-cols-1 gap-card-gap md:hidden">
                    {visibleSchedules.map((s, i) => (
                      <ScheduleCard key={s.id} mode="list" schedule={s} reserveCount={browseResCounts[s.id]} rating={venueRatings[s.venueId]} distanceKm={distanceOf(s)} regInfo={regInfoBySchedule.get(s.id)} onVenueClick={handleVenueClick} onSelect={handleScheduleSelect} priority={i < 4} />
                    ))}
                  </div>
                )}

                {/* 🏁 지난 대회 — 완료된 대회 아카이브(결과는 상세에서) */}
                <PastTournaments schedules={schedules} onSelect={handleScheduleSelect} />

                {/* [DS] MO-7B 규칙 A — 개인화 블록(오늘예약·바인요청·이어서하기)은 auth 왕복
                    '뒤'에 도착해 목록 위에 끼어들며 매 로그인 부팅마다 계단식 밀림을 만들었다.
                    결과가 오기 전에는 자리를 만들지 않고, 오면 목록 아래에 붙인다 — 상단 스택 불변.
                    (알림함·마이에서도 같은 정보에 접근 가능해 기능 손실 없음) */}
          {/* 손님: 오늘 내 바인(참가) 요청 상태 배너 */}
                {myTodayRes.length > 0 && (
                  <div className="animate-fade-in overflow-hidden px-page-x pt-3 space-y-1.5">
                    <p className="px-1 text-2xs font-bold text-ink-secondary">🎫 오늘 예약한 대회</p>
                    {myTodayRes.map((r) => {
                      const sc = schedules.find((x) => x.id === r.scheduleId);
                      return (
                        <button key={r.scheduleId} type="button"
                          onClick={() => { if (sc) setOpenSchedule(sc); }}
                          className="w-full flex items-center gap-2.5 rounded-card border border-accent-400/45 bg-gradient-to-r from-accent-300/[0.12] to-transparent px-3 py-2.5 text-left hover:border-accent-300 transition-colors">
                          <span className="shrink-0 text-lg" aria-hidden>🎫</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-ink-primary">{r.title}</span>
                            <span className="block truncate text-2xs text-ink-muted">
                              {r.venueName ?? '매장'} · {r.startTime ? r.startTime.slice(0, 5) : '19:00'} 시작 · 예약명 {r.displayName}
                            </span>
                          </span>
                          <span className="shrink-0 text-2xs font-bold text-accent-300">포스터 →</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {myBuyinReqs.length > 0 && (
                  <div className="animate-fade-in overflow-hidden px-page-x pt-3 space-y-1.5">
                    <p className="px-1 text-2xs font-bold text-ink-secondary">🎮 내 참가 게임 · 바인 요청</p>
                    {myBuyinReqs.map((r) => (
                      <div key={r.id} className={['flex items-center gap-2 rounded-card border px-3 py-2 text-xs',
                        r.status === 'approved' ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : r.status === 'rejected' ? 'border-border-default bg-surface-low' : 'border-sky-500/40 bg-sky-500/[0.07]'].join(' ')}>
                        <span className="shrink-0" aria-hidden>{r.status === 'approved' ? '✅' : r.status === 'rejected' ? '❌' : '⏳'}</span>
                        <span className="min-w-0 flex-1 truncate text-ink-secondary"><b className="text-ink-primary">{r.venueName}</b>{(() => { const n = r.status === 'approved' ? r.gameSeq : r.requestedGameSeq; return n != null ? ` · ${n === 1 ? '메인' : '사이드' + (n - 1)}` : ''; })()} {r.status === 'approved' ? '참가 승인 — 입장하세요! 🎉' : r.status === 'rejected' ? `요청 거절됨${r.rejectReason ? ` — ${r.rejectReason}` : ''}` : '바인 요청 대기중'}</span>
                        {r.status === 'pending' && <button type="button" onClick={() => cancelBuyinRequest(r.id).then(() => getMyBuyinRequestsToday().then(setMyBuyinReqs)).catch((e) => toast.show(e instanceof Error ? e.message : '취소 실패', 'error'))} className="shrink-0 rounded-input border border-border-default px-2 py-1 text-2xs font-bold text-ink-muted hover:text-danger-light hover:border-danger/40">취소</button>}
                      </div>
                    ))}
                  </div>
                )}

            {/* 16-1 이어서 하기 — 재방문 사용자의 반복 여정(최근 매장 → 체크인/오늘 대회)을 한 탭으로.
                    비로그인·이력 없음이면 DOM 미렌더(10-1 원칙). */}
                {recentVenue && (
                  <div className="px-page-x pt-3">
                    <button type="button" onClick={() => handleVenueClick(recentVenue.venueId)}
                      className="w-full flex items-center gap-2.5 rounded-card border border-border-default bg-surface-low px-3 py-2.5 text-left hover:border-accent-400/50 transition-colors">
                      <span className="shrink-0 text-lg" aria-hidden>↩️</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-2xs font-bold text-ink-muted">이어서 하기</span>
                        <span className="block truncate text-sm font-bold text-ink-primary">{recentVenue.venueName ?? '최근 방문 매장'}</span>
                      </span>
                      <span className="shrink-0 text-2xs font-bold text-accent-300">체크인 · 오늘 대회 ›</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 우측 위젯 레일 — 주간 머니인 킹·HOT 게시글·오늘 요약 */}
              <BrowseSideRail
                posts={posts}
                schedules={schedules}
                onSelectPost={setOpenPost}
                onSelectSchedule={handleScheduleSelect}
              />
            </div>
          </div>
        </main>
      )}

      {/* 탭 컨텐츠(지연 로딩) — 일정 탐색 이후 탭들은 청크 분리, 전환 시 짧은 로더 표시 */}
      <Suspense fallback={<LazyFallback />}>
      {/* 라이브 — 진행 중 게임 현황 */}
      {(activeTab === 'live' || visitedTabs.has('live')) && (
        <div className="tab-pane" style={activeTab !== 'live' ? { display: 'none' } : undefined}>
          <ErrorBoundary inline resetKey="live">
            <LiveGamesTabM venues={venues} schedules={schedules} onVenue={handleVenueClick} onSchedule={handleScheduleSelect} onDisplay={openDisplay} active={activeTab === 'live'} myGames={myApprovedGames} />
          </ErrorBoundary>
        </div>
      )}

      {/* 커뮤니티 */}
      {(activeTab === 'community' || visitedTabs.has('community')) && (
        <main className="tab-pane px-page-x pb-section" style={activeTab !== 'community' ? { display: 'none' } : undefined}>
          <ErrorBoundary inline resetKey="community">
          <CommunityTabM
            marketSlot={marketSlot}
            venues={venues}
            comments={comments}
            posts={posts}
            notices={communityNotices}
            isAdmin={isAdmin}
            onWriteNotice={handleWriteNotice}
            onSelectNotice={setOpenNotice}
            onSelectVenue={handleVenueClick}
            onSelectPost={setOpenPost}
            onOpenWrite={handleOpenWrite}
            onLikePost={handleLikePost}
            onDeletePost={handleDeletePost}
            onReloadVenues={reloadVenues}
          />
          </ErrorBoundary>
        </main>
      )}

      {/* (중고장터 독립 페인 은퇴 — 실경로는 커뮤니티 서브탭 '장터'(marketSlot). ?tab=market 은 리다이렉트) */}

      {/* 도구 — 매장 운영·플레이어 도구 모음 (메인 탭) */}
      {(activeTab === 'tools' || visitedTabs.has('tools')) && (
        <main className="tab-pane px-page-x pt-3 pb-section" style={activeTab !== 'tools' ? { display: 'none' } : undefined}>
          <ErrorBoundary inline resetKey="tools">
            <ToolsPanelM />
          </ErrorBoundary>
        </main>
      )}

      {/* 내 매장 — 게임관리 + 매장운영 통합 허브 (업주/직원/운영자)
          keep-alive: 가장 무거운 스위트(장부·클락·통계)를 탭 전환마다 완전 재마운트하던 것이
          '다른 탭→내 매장' 멈칫의 근본 원인. 다른 탭과 같은 display 토글로 전환하고,
          tabActive 로 숨김 중 구독·틱을 끈다. 역할 게이트(로그아웃 시 즉시 언마운트) 필수. */}
      {(isOwner || isStaff || isAdmin) && (activeTab === 'my-store' || visitedTabs.has('my-store')) && (
        <main className="tab-pane px-page-x pt-3 pb-section" style={activeTab !== 'my-store' ? { display: 'none' } : undefined}>
          <ErrorBoundary inline resetKey="my-store">
          <VenueManageTabM
            schedules={schedules}
            deepSection={myStoreDeep}
            onConsumeDeepSection={handleConsumeMyStoreDeep}
            tabActive={activeTab === 'my-store'}
            onCreatePoster={handleCreatePosterFromStore}
            onEditPoster={handleEditPosterFromStore}
            onDeletePoster={handleDeletePoster}
          />
          </ErrorBoundary>
        </main>
      )}

      {/* 관리자 */}
      {activeTab === 'admin' && (
        <main className="px-page-x py-section">
          <ErrorBoundary inline resetKey="admin">
          <AdminTab
            schedules={schedules}
            venues={venues}
            users={users}
            posts={posts}
            onApproveSchedule={handleApproveSchedule}
            onRejectSchedule={handleRejectSchedule}
            onUpdateUser={handleUpdateUser}
            onDeletePost={handleDeletePost}
            onReloadVenues={() => { reloadVenues(); if (isAdmin) listAllUsers().then(setUsers).catch(() => {}); }}
          />
          </ErrorBoundary>
        </main>
      )}
      </Suspense>

      {/* 사업자 정보 푸터 — 전 화면 하단 상시 노출(전자상거래법 표시의무 + 약관 링크 + 고객센터) */}
      <div className="reveal">
        <BusinessFooter onOpenLegal={(d) => setLegalDoc(d)} onOpenSupport={() => setSupportOpen(true)} />
      </div>

      {/* ── 모달 — 전부 lazy: 여는 순간에만 해당 청크 로드(첫 화면 가볍게) ── */}
      {/* 모달 렌더 크래시가 앱 전체 폴백으로 번지지 않게 묶음 단위 바운더리 — 대상이 바뀌면 자동 리셋 */}
      <Suspense fallback={<OverlayFallback />}>
      <ErrorBoundary inline resetKey={`${openSchedule?.id ?? ''}:${openVenueId ?? ''}:${openPost?.id ?? ''}`}>
      {buyinPick && (() => {
        const submit = (g: number | null) => {
          const v = buyinPick.venueId; setBuyinPick(null);
          requestBuyin(v, g).then((name) => { toast.show(`${name || '매장'} 참가(바인) 요청 전송! 🙋`, 'success'); getMyBuyinRequestsToday().then(setMyBuyinReqs).catch(() => {}); }).catch((e) => toast.show(e instanceof Error ? e.message : '요청 실패', 'error'));
        };
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setBuyinPick(null)}>
            <div className="w-full max-w-xs rounded-card border border-border-default bg-surface-high p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-bold text-ink-primary">참가(바인) 요청 — 게임 선택</p>
              <p className="text-2xs text-ink-muted">참가할 게임을 고르면 운영자에게 요청이 전송됩니다.</p>
              <div className="space-y-1.5 pt-1">
                {buyinPick.games.map((g) => (
                  <button key={g.gameSeq} type="button" onClick={() => submit(g.gameSeq)}
                    className="w-full rounded-input border border-accent-400/40 bg-accent-300/[0.06] px-3 py-2.5 text-left text-sm font-bold text-ink-primary hover:bg-accent-300/15">
                    {g.gameSeq === 1 ? '🏆' : '🎲'} {g.title}
                  </button>
                ))}
                <button type="button" onClick={() => submit(null)}
                  className="w-full rounded-input border border-border-default px-3 py-2 text-xs text-ink-secondary hover:text-ink-primary">아무 게임이나 (운영자가 배정)</button>
              </div>
              <button type="button" onClick={() => setBuyinPick(null)} className="w-full pt-1 text-2xs text-ink-muted">취소</button>
            </div>
          </div>
        );
      })()}

      {authOpen && (
        <AuthModal key={authMode} open onClose={() => { setAuthOpen(false); setAuthMode('login'); }} initialMode={authMode} />
      )}

      {openSchedule !== null && (
      <ScheduleDetailModal
        open
        schedule={openSchedule}
        onClose={() => setOpenSchedule(null)}
        onVenueClick={handleVenueClick}
        rating={openSchedule ? venueRatings[openSchedule.venueId] : undefined}
        regInfo={openSchedule ? regInfoBySchedule.get(openSchedule.id) : undefined}
        comments={comments}
        onSubmitComment={(content, parentId) =>
          openSchedule && handleSubmitScheduleComment(openSchedule.id, content, parentId)
        }
        onDeleteComment={handleDeleteComment}
        onDeletePoster={handleDeletePoster}
      />
      )}

      {openVenueId !== null && (() => {
        const ov = venues.find((v) => v.id === openVenueId) ?? null;
        const isGroup = !!ov?.kind && ov.kind !== 'venue';
        return (
          <Suspense fallback={<OverlayFallback />}>
            {isGroup ? (
              <GroupPage open group={ov} onClose={() => setOpenVenueId(null)} />
            ) : (
              <VenuePage
                open
                venue={ov}
                onClose={() => setOpenVenueId(null)}
                schedules={schedules}
                comments={comments}
                notices={browseNotices}
                onSubmitComment={handleSubmitVenueComment}
                onDeleteComment={handleDeleteComment}
                onUpdateDescription={handleUpdateVenueDescription}
                onUpdateImage={handleUpdateVenueImage}
                onUpdateImages={handleUpdateVenueImages}
                onSelectSchedule={handleScheduleSelect}
                onOpenWallet={() => setVoucherWalletOpen(true)}
              />
            )}
          </Suspense>
        );
      })()}

      {openListing !== null && (
      <ListingDetailModal
        open
        listing={openListing}
        onClose={() => setOpenListing(null)}
        onDelete={handleDeleteListing}
        onStatusChanged={(id, st) => {
          setOpenListing((cur) => (cur && cur.id === id ? { ...cur, status: st } : cur));
          setListings((prev) => prev.map((l) => (l.id === id ? { ...l, status: st } : l)));
        }}
      />
      )}

      {openNotice !== null && (
      <NoticeDetailModal
        open
        notice={openNotice}
        onClose={() => setOpenNotice(null)}
        isAdmin={user?.role === 'admin'}
        onEdit={() => { setEditingNotice(openNotice); setOpenNotice(null); setNoticeFormOpen(true); }}
        onDelete={() => { if (openNotice) handleDeleteNotice(openNotice.id); }}
      />
      )}

      {posterFormTarget !== null && (
      <PosterFormModal
        open
        schedule={posterFormTarget}
        onClose={() => setPosterFormTarget(null)}
        onSubmit={handleSubmitPoster}
        venues={venues.map((v) => ({ id: v.id, name: v.name, region: v.region }))}
        pastPosters={schedules}
      />
      )}

      {openPost !== null && (
      <PostDetailModal
        open
        post={openPost}
        onClose={() => setOpenPost(null)}
        onLike={handleLikePost}
        onDelete={handleDeletePost}
        venues={venues}
        onVenueClick={(vid) => { setOpenPost(null); handleVenueClick(vid); }}
      />
      )}

      {profileOpen && (
      <ProfileModal
        open
        onClose={() => setProfileOpen(false)}
        onOpenLegal={(d) => setLegalDoc(d)}
        onOpenSupport={() => setSupportOpen(true)}
      />
      )}

      {legalDoc !== null && (
      <LegalDocsModal open initial={legalDoc} onClose={() => setLegalDoc(null)} />
      )}

      {supportOpen && (
      <SupportInquiryModal open onClose={() => setSupportOpen(false)} />
      )}

      {globalSearchOpen && (
      <GlobalSearchModal
        open
        onClose={() => setGlobalSearchOpen(false)}
        venues={venues}
        schedules={schedules}
        posts={posts}
        listings={listings}
        notices={notices}
        onVenue={handleVenueClick}
        onSchedule={handleScheduleSelect}
        onPost={setOpenPost}
        onListing={setOpenListing}
        onNotice={setOpenNotice}
      />
      )}

      {/* 관리자 전용 공지 작성 모달 (커뮤니티/장터 '공지 작성' 버튼에서 진입) */}
      {noticeFormOpen && (
      <NoticeFormModal
        open
        onClose={() => { setNoticeFormOpen(false); setEditingNotice(null); }}
        onSubmit={handleSubmitNotice}
        editing={editingNotice}
      />
      )}

      {/* 커뮤니티 글쓰기 모달 (Stage 2) */}
      {postFormOpen && (
      <PostFormModal
        open
        onClose={() => setPostFormOpen(false)}
        onSubmit={handleCreatePost}
        defaultCategory={postFormCategory}
        defaultContent={shareText}
      />
      )}

      {/* GTO 공유 링크로 진입 시 같은 스팟으로 GTO 검색 모달 표시 */}
      {gtoInit && (
        <Suspense fallback={<OverlayFallback />}>
          <GtoDeepModal
            key={typeof window !== 'undefined' ? window.location.hash : 'gto'}
            open
            onClose={closeGto}
            initialState={gtoInit}
          />
        </Suspense>
      )}

      {/* 법적 동의 게이트 — 구글 등 미동의 가입자(관리자 제외)에게 1회 필수 동의 */}
      <ConsentGateModal open={!!user && user.agreedToTerms === false && user.role !== 'admin'} />

      {/* ↑ 맨 위로 — 600px 이상 스크롤 시 표시(우하단 플로팅) */}
      <ScrollTopButton />

      {/* 중고장터 글쓰기 모달 (Stage 2) */}
      {marketFormOpen && (
      <MarketplaceFormModal
        open
        onClose={() => setMarketFormOpen(false)}
        onSubmit={handleCreateListing}
      />
      )}
      </ErrorBoundary>
      </Suspense>
    </div>
  );
}

// ── ↑ 맨 위로 플로팅 버튼 — 무한 스크롤 보조(Reddit 문법) ───────────────────────
function ScrollTopButton() {
  const [show, setShow] = useState(false);
  // MO-9A: 공용 useScrollY 구독(개별 리스너 제거) + 마운트 유지 —
  // 예전 `return null` 은 fixed 요소를 스크롤 중에 삽입/제거해 DOM 변동을 만들었다.
  // opacity/pointer-events 토글은 컴포지터에서 끝난다.
  useScrollY(useCallback((y: number) => setShow(y > 600), []));
  return (
    <button
      type="button"
      aria-label="맨 위로"
      aria-hidden={!show || undefined}
      tabIndex={show ? undefined : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      // 모바일: 하단 탭바 위로 띄움(--tabbar-float, 누락됐던 safe-area 복구) / PC: 기존 위치
      className={[
        'fixed bottom-[var(--tabbar-float)] lg:bottom-5 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border-default bg-surface-mid text-ink-secondary shadow-dialog transition-opacity hover:text-accent-300',
        show ? 'opacity-100' : 'pointer-events-none opacity-0',
      ].join(' ')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}

// ── 🏁 지난 대회 아카이브 — 일정탐색 하단(완료 대회, 최근 5개) ─────────────────
// 순위가 입력된 대회면 행에 👑 우승자 표시 + 클릭 시 입상 순위 펼침(미입력이면 바로 상세).
const PastTournaments = memo(function PastTournaments({ schedules, onSelect }: { schedules: Schedule[]; onSelect: (s: Schedule) => void }) {
  const today = new Date().toLocaleDateString('en-CA');
  const past = [...schedules]
    .filter((s) => s.approved && s.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const [results, setResults] = useState<Record<string, RankingEntry[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  // ⚠ 의존성을 배열 참조([schedules])로 두면 실시간 갱신·창 복귀·당겨서 새로고침마다
  //   내용이 똑같아도 다시 돈다. 실제로 보는 값(매장·날짜 쌍)을 문자열 키로 만들어 그것에만 반응한다.
  const pastKey = past.map((s) => `${s.venueId ?? ''}:${s.date}`).join('|');
  useEffect(() => {
    const pairs = past.filter((s) => s.venueId).map((s) => ({ venueId: s.venueId as string, date: s.date }));
    if (pairs.length === 0) return;
    let alive = true;
    // 항목마다 1건씩 쏘던 것을 한 번에 — 5요청 → 1요청(데이터가 0행이어도 5건이 나가던 구조였다)
    getRankingsBulk(pairs)
      .then((byKey) => {
        if (!alive) return;
        const next: Record<string, RankingEntry[]> = {};
        for (const s of past) {
          const e = s.venueId ? byKey[`${s.venueId}|${s.date}`] : undefined;
          if (e && e.length > 0) next[s.id] = e;
        }
        setResults(next);
      })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastKey]);
  if (past.length === 0) return null;
  const day = (d: string) => ['일', '월', '화', '수', '목', '금', '토'][new Date(`${d}T00:00:00`).getDay()];
  const medal = (p: number) => (p === 1 ? '👑' : p === 2 ? '🥈' : p === 3 ? '🥉' : null);
  return (
    <section className="reveal mt-4 overflow-hidden rounded-card border border-border-subtle bg-surface-low">
      <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <h2 className="text-xs font-bold text-ink-secondary">🏁 지난 대회</h2>
        <span className="text-2xs text-ink-muted">눌러서 결과·정보 보기</span>
      </header>
      <ul>
        {past.map((s) => {
          const entries = results[s.id];
          const champ = entries?.find((e) => e.position === 1);
          const opened = openId === s.id;
          return (
            <li key={s.id} className="border-b border-border-subtle last:border-b-0">
              <button type="button"
                onClick={() => (entries ? setOpenId(opened ? null : s.id) : onSelect(s))}
                className={['flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-high/70', opened ? 'bg-surface-high/50' : ''].join(' ')}>
                <span className="shrink-0 rounded-badge bg-surface-high px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-ink-muted">
                  {s.date.slice(5).replace('-', '/')}({day(s.date)})
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{s.title}</span>
                {champ && <span className="shrink-0 text-xs font-bold text-gold-300">👑 {champ.nickname}</span>}
                <span className="hidden shrink-0 text-xs text-ink-muted sm:inline">{s.pubName}</span>
              </button>
              {opened && entries && (
                <div className="border-t border-border-subtle bg-surface-base/40 px-3 py-2 animate-fade-in">
                  <ul className="space-y-1">
                    {[...entries].sort((a, b) => a.position - b.position).slice(0, 5).map((e) => (
                      <li key={`${e.position}-${e.nickname}`} className="flex items-center gap-2 text-sm">
                        <span className="w-8 shrink-0 text-center text-xs font-bold tabular-nums text-ink-muted">
                          {medal(e.position) ?? `${e.position}위`}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink-primary">{e.nickname}</span>
                        {/* prize 는 만원 단위 텍스트 — 개인 대시보드(CustomerDashboardPage)와 같은 표기로 맞춘다 */}
                        {e.prize && <span className="shrink-0 text-xs tabular-nums text-accent-300">{parsePrizeMan(e.prize) ? `${parsePrizeMan(e.prize).toLocaleString()}만` : e.prize}</span>}
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => onSelect(s)}
                    className="mt-1.5 text-xs font-semibold text-ink-muted transition-colors hover:text-accent-300">
                    대회 정보 전체 보기 →
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
});

// ── PC 우측 위젯 레일(일정탐색) — 오늘 요약·주간 머니인 킹·HOT 게시글 ──────────
const BrowseSideRail = memo(function BrowseSideRail({ posts, schedules, onSelectPost, onSelectSchedule }: {
  posts: CommunityPost[];
  schedules: Schedule[];
  onSelectPost: (p: CommunityPost) => void;
  onSelectSchedule: (s: Schedule) => void;
}) {
  const [kings, setKings] = useState<WeeklyKing[]>([]);
  useEffect(() => {
    getWeeklyMoneyinKings(3).then((r) => setKings(r.kings)).catch(() => {});
  }, []);
  const today = new Date().toLocaleDateString('en-CA');
  const { isBlocked } = useBlocks();
  const hot = [...posts]
    .filter((p) => !isBlocked(p.userId) && !p.blinded && (p.viewCount ?? 0) > 0 && Date.now() - new Date(p.createdAt).getTime() < 6 * 3600 * 1000)
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, 3);
  const medal = ['👑', '🥈', '🥉'];
  // 곧 시작 — 오늘 이후 가장 가까운 대회 3개(날짜→시간 순)
  const upcoming = [...schedules]
    .filter((s) => s.approved && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    .slice(0, 3);
  const dday = (date: string) => {
    const diff = Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
    return diff === 0 ? '오늘' : diff === 1 ? '내일' : `D-${diff}`;
  };

  // sticky 요소에 reveal을 걸면 view() 진행도가 고정될 수 있어 내부 섹션에 개별 적용
  return (
    <aside className="sticky top-[calc(var(--stack-top,6.0625rem)+0.75rem)] hidden w-72 shrink-0 space-y-3 xl:block">
      {/* 곧 시작하는 대회 — 시간 임박 순 3개 */}
      {upcoming.length > 0 && (
        <section className="reveal overflow-hidden rounded-card border border-border-subtle bg-surface-low">
          <header className="border-b border-border-subtle px-3 py-2 text-xs font-bold text-ink-secondary">⏰ 곧 시작</header>
          <ul>
            {upcoming.map((s) => (
              <li key={s.id} className="border-b border-border-subtle last:border-b-0">
                <button type="button" onClick={() => onSelectSchedule(s)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-high/70">
                  <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums', s.date === today ? 'bg-accent-300/15 text-accent-300' : 'bg-surface-high text-ink-muted'].join(' ')}>{dday(s.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-primary">{s.title}</span>
                    <span className="block truncate text-xs text-ink-muted">{s.pubName} · {s.startTime}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 주간 머니인 킹 */}
      {kings.length > 0 && (
        <section className="reveal rounded-card border border-accent-400/25 bg-surface-low overflow-hidden">
          <header className="border-b border-border-subtle px-3 py-2 text-xs font-bold text-accent-300">이번 주 머니인 킹</header>
          <ul>
            {kings.map((k, i) => (
              <li key={k.nickname} className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 last:border-b-0">
                <span aria-hidden className="shrink-0 text-sm leading-none">{medal[i] ?? '🏅'}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-primary">{k.nickname}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-muted">{k.moneyinCount}회</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* HOT 게시글 */}
      {hot.length > 0 && (
        <section className="reveal rounded-card border border-danger/25 bg-surface-low overflow-hidden">
          <header className="border-b border-border-subtle px-3 py-2 text-xs font-bold text-danger-light">🔥 지금 HOT</header>
          <ul>
            {hot.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onSelectPost(p)}
                  className="flex w-full items-center gap-2 border-b border-border-subtle px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface-high/60">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{p.title || p.content.slice(0, 30)}</span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-muted">👁{p.viewCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 광고 자리 — 비어 있을 땐 문의 안내(수익 슬롯) */}
      <section className="reveal rounded-card border border-dashed border-border-default bg-surface-low/60 px-3 py-3 text-center">
        <p className="text-xs font-bold text-ink-secondary">📢 광고 자리</p>
        <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">이 자리에 매장·브랜드 광고를 게재할 수 있습니다.<br />내 매장 → 포스터 상단 고정 카드에서 문의하세요.</p>
      </section>
    </aside>
  );
});

// ── 빈 상태 ─────────────────────────────────────────────────────────────────

// (B1) 일정 로딩 스켈레톤 — 카드 자리(aspect-ratio 고정)를 미리 잡아 CLS·빈결과 깜빡임 방지
// [DS] MO-6: 스켈레톤은 '실제 카드 마크업의 텍스트만 치환' — 새로 그리지 않는다.
// 전엔 grid 가 포스터 높이(aspect-[3/4])만 있어 실데이터 교체 순간 본문 높이만큼(+713px/10장)
// 낙하했고, list 는 임의값 h-24(96px) vs 실측 87px 로 어긋났다. 골격을 복제하면 높이가
// 구조적으로 일치한다(list 는 실측 87px 고정 — 2026-08-25, 375px, html 17px).
function ScheduleSkeletonGrid({ viewMode }: { viewMode: 'grid' | 'list' | 'table' }) {
  const grid = viewMode === 'grid';
  const n = grid ? 10 : 6;
  return (
    <div className={[grid ? 'grid grid-cols-2 gap-card-gap sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid grid-cols-1 lg:grid-cols-2 gap-card-gap'].join(' ')} aria-busy="true">
      {Array.from({ length: n }).map((_, i) =>
        grid ? (
          // GridCard 골격: 포스터 3/4 + 본문(p-2.5 gap-1.5: 제목 2줄 + 매장 1줄 + 구분선 + 바인 1줄)
          <div key={i} className="flex flex-col overflow-hidden rounded-card border border-border-subtle bg-surface-low">
            <div className="skeleton aspect-[3/4] w-full rounded-none" />
            <div className="flex flex-col gap-1.5 p-2.5">
              <div className="skeleton h-4" />
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-1/2" />
              <div className="border-t border-border-subtle my-0.5" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          </div>
        ) : (
          // ListCard 골격: p-2 + 64px 썸네일 + 압축 3행
          <div key={i} className="flex min-h-[87px] items-center gap-2.5 rounded-card border border-border-subtle bg-surface-low p-2">
            <div className="skeleton h-16 w-16 shrink-0 rounded-input" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="skeleton h-[17px] w-3/4" />
              <div className="skeleton h-[17px]" />
              <div className="skeleton h-[17px] w-1/2" />
            </div>
          </div>
        )
      )}
    </div>
  );
}

// 빈 화면은 앱의 첫인상이 되는 경우가 많다(대회가 없는 시간대·평일 오전).
// 예전엔 '검색 결과가 없습니다' 한 줄로 끝나 다음에 누를 것이 하나도 없었다 —
// 사용자는 자기가 잘못 검색한 줄 알거나 '대회가 없는 서비스'로 오해하고 나간다.
// 그래서 ① 왜 비었는지(필터 때문인지 진짜 없는 건지)를 구분해 말하고 ② 반드시 다음 행동을 하나 준다.
function EmptyState({ filtered, followedOnly, onClearFilters, onClearFollow, upcoming, filterSummary }: {
  filtered: boolean;          // 검색어·날짜·지역 등 조건이 걸려 있는가
  followedOnly: boolean;
  onClearFilters: () => void;
  onClearFollow: () => void;
  upcoming: number;           // 조건을 풀면 보일 예정 대회 수
  /** 현재 걸린 조건 요약 — '무엇 때문에 0건인지'를 보여줘야 사용자가 하나만 풀 수 있다 */
  filterSummary?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-ink-muted">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none"
        stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <circle cx="22" cy="22" r="14" />
        <line x1="32" y1="32" x2="44" y2="44" />
        <line x1="16" y1="22" x2="28" y2="22" />
        <line x1="22" y1="16" x2="22" y2="28" />
      </svg>
      {followedOnly ? (
        <>
          <p className="text-sm">팔로우한 매장의 예정 대회가 없어요</p>
          <button type="button" onClick={onClearFollow} className="btn-primary px-4 py-2 text-xs">전체 매장 보기</button>
        </>
      ) : filtered ? (
        <>
          <p className="text-sm">조건에 맞는 대회가 없어요</p>
          {filterSummary && <p className="max-w-xs text-center text-2xs text-ink-muted">걸린 조건: <b className="text-ink-secondary">{filterSummary}</b> — 검색바에서 하나만 풀어도 달라져요</p>}
          <p className="text-xs">{upcoming > 0 ? `조건을 풀면 예정 대회 ${upcoming}개를 볼 수 있어요` : '조건을 바꿔 다시 찾아보세요'}</p>
          <button type="button" onClick={onClearFilters} className="btn-primary px-4 py-2 text-xs">조건 초기화</button>
        </>
      ) : (
        <>
          <p className="text-sm">예정된 대회가 없어요</p>
          <p className="text-xs">아래 <b className="text-ink-secondary">🏁 지난 대회</b>에서 결과를 볼 수 있어요</p>
        </>
      )}
    </div>
  );
}
