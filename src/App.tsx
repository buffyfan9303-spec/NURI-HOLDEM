import { useState, useCallback, useMemo, useEffect, useRef, useLayoutEffect, useTransition, Suspense, memo, type ReactNode } from 'react';
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
import { getWeeklyMoneyinKings, getVenueRankings, type WeeklyKing, type RankingEntry } from './api/rankings';
import { getReservationCounts } from './api/reservations';
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
import { REQUIRE_LOGIN_EVENT, OPEN_POST_FORM_EVENT, ensureVerified } from './lib/requireLogin';
import { tierColor } from './components/atoms/TierBadge';
import ConsentGateModal from './components/features/ConsentGateModal';
import type { PostFormData } from './components/features/PostFormModal';
import type { MarketplaceFormData } from './components/features/MarketplaceFormModal';
import { useBackClose, overlayJustClosed } from './lib/backstack';
import { useVisibilityRefresh } from './lib/useVisibilityRefresh';
import { lazyWithReload } from './lib/lazyWithReload';
import { applyScheduleSeo, applyVenueSeo, resetSeo } from './lib/seo';
import { SpringButton } from './components/atoms/StatefulActionButton';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './contexts/AuthContext';
import { listAllUsers, updateUserStatus, approveOwner } from './api/auth';
import {
  getSchedules, createSchedule, updateSchedule, deleteSchedule, subscribeSchedules,
} from './api/schedules';
import {
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
const MarketplaceTabM = memo(MarketplaceTab);
const ToolsPanelM     = memo(ToolsPanel);
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

function AppHeader({
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

  // 모바일 스크롤 축소 — 내리면 헤더가 낮아져 포스터 화면이 넓어진다(rAF 스로틀)
  const [shrunk, setShrunk] = useState(false);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { setShrunk(window.scrollY > 48); raf = 0; });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

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
        'flex items-center justify-between px-page-x transition-[height] duration-200 ease-out',
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
            className="w-9 h-9 flex items-center justify-center rounded-full text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors"
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
              aria-label="내 매장이용권"
              className="w-9 h-9 hidden lg:flex items-center justify-center rounded-full text-ink-secondary hover:text-accent-300 hover:bg-surface-high transition-colors"
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
                  onMouseLeave={() => setUserMenu(false)}
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
                      내 매장이용권
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
}

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

function TabBar({
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
              // transition에 text-shadow 포함 → 활성 전환 시 글로우가 '톡' 튀지 않고 은은히 이징(터치 시 노란색 깜빡임 제거)
              'flex-1 px-2 sm:flex-none sm:px-5 py-2.5 text-sm font-medium whitespace-nowrap transition-[color,text-shadow] duration-200 focus:outline-none touch-manipulation rounded-t-input',
              isActive ? 'text-accent-300 text-gold-glow' : 'text-ink-muted [text-shadow:0_0_0_rgba(255,209,0,0)] hover:text-ink-secondary',
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
                   shadow-[0_0_8px_rgba(255,209,0,0.5)]
                   transition-[left,width] duration-300 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  );
}

// ── 모바일 하단 탭바(Riot Mobile 스타일) — 플로팅 알약 + 아이콘/라벨 + 프레스 스프링 ──
function MobileTabBar({ tabs, active, onChange, dot, onOpenMe }: {
  tabs: TabDef[]; active: TabId; onChange: (t: TabId) => void;
  dot?: Partial<Record<TabId, boolean>>;
  /** 일반 유저 5번째 칸 '내 정보'(개인 대시보드 — 비로그인이면 로그인 유도) */
  onOpenMe: () => void;
}) {
  // 5칸 고정: 일정/라이브/커뮤니티/장터 + (업주·직원·관리자=내 매장 | 일반=내 정보)
  // 관리자 설정·도구는 프로필 메뉴에서 진입(탭바는 핵심 동선만)
  const hasStore = tabs.some((t) => t.id === 'my-store');
  // 유튜브식 자동 숨김 — 아래로 스크롤하면 숨고(몰입), 위로 살짝 올리면 즉시 복귀
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      if (y < 80) setHidden(false);            // 최상단 근처에선 항상 표시
      else if (dy > 14) setHidden(true);       // 아래로 — 숨김
      else if (dy < -8) setHidden(false);      // 위로 — 즉시 복귀
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
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
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      aria-label="하단 내비게이션"
    >
      {/* 탭바 밖(좌우·아래) 틈으로 스크롤 컨텐츠가 비치지 않게 — 베이스색 그라데이션 커튼 */}
      <div aria-hidden className="absolute inset-x-0 -top-3 bottom-0 bg-gradient-to-t from-surface-base via-surface-base/90 to-transparent" />
      <div className="pointer-events-auto mx-2.5 mb-2 flex rounded-2xl border border-border-default bg-surface-mid/95 shadow-dialog backdrop-blur-md">
        {items.map(({ key, tab, label }) => {
          const on = tab ? shown === tab : false;
          return (
            <button
              key={key} type="button"
              onClick={() => { if (tab) { setOptimistic(tab); onChange(tab); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); } else onOpenMe(); }}
              aria-current={on ? 'page' : undefined}
              className="press-spring flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 touch-manipulation focus:outline-none"
            >
              {/* 아이콘 22px · 라벨 11px — 공백 줄이고 또렷하게 */}
              <span className={['relative flex h-7 w-12 items-center justify-center rounded-full [&_svg]:h-[21px] [&_svg]:w-[21px] transition-colors duration-200',
                on ? 'text-accent-300' : 'text-ink-secondary'].join(' ')}>
                {/* 활성 알약 — 각 칸이 자기 핀을 갖고 opacity 만 토글(transform·layout 0). 전환 시 크로스페이드 */}
                <span aria-hidden
                  className={['pointer-events-none absolute inset-0 rounded-full bg-accent-300/15 transition-opacity duration-200',
                    on ? 'opacity-100' : 'opacity-0'].join(' ')} />
                {tab ? TAB_ICON[tab] : ME_ICON}
                {tab && dot?.[tab] && !on && <span className="absolute right-2 top-0.5 h-1.5 w-1.5 rounded-full bg-accent-300" aria-hidden />}
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
}

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
  const { user, isAdmin, isOwner } = useAuth();
  const toast = useToast();

  // UI 상태
  const [viewMode, setViewMode]       = useState<ViewMode>('list');
  // 일정탐색 FOMO — 예약자 수(예약 N명 · 마감 임박 뱃지)
  const [browseResCounts, setBrowseResCounts] = useState<Record<string, number>>({});
  // 매장 후기 별점(체크인 인증) — 카드 매장명 옆 ⭐4.8(12)
  const [venueRatings, setVenueRatings] = useState<Record<string, { avg: number; count: number }>>({});
  useEffect(() => { getVenueRatings().then(setVenueRatings).catch(() => {}); }, []);
  // 탭 청크 idle 프리로드 — 동일 동적 import는 Vite가 같은 청크로 캐시한다
  useEffect(() => {
    const warm = () => {
      void Promise.allSettled([
        import('./components/features/CommunityTab'),
        import('./components/features/MarketplaceTab'),
        import('./components/features/LiveGamesTab'),
        import('./components/features/VenueManageTab'),
        import('./components/features/ToolsPanel'),
        import('./components/features/VenuePage'),
        import('./components/features/ScheduleDetailModal'),
        import('./components/features/CustomerDashboardPage'),
        import('./components/features/AuthModal'),
        import('./components/features/ProfileModal'),
        import('./components/features/GlobalSearchModal'),
        import('./components/features/PostDetailModal'),
        import('./components/features/ListingDetailModal'),
      ]);
    };
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 2500);
  }, []);
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
      return (valid as string[]).includes(t ?? '') ? (t as TabId) : 'browse';
    } catch { return 'browse'; }
  });
  // 탭 전환을 트랜지션으로 — lazy 청크/무거운 렌더 동안 이전 화면을 유지해
  // '이전 메뉴 → 스피너 깜빡 → 새 메뉴' 3단 플래시를 없앤다(React 공식 패턴).
  const [, startTabTransition] = useTransition();
  const closeOverlaysRef = useRef<(() => void) | null>(null);
  // 탭 전환은 즉시 스왑(인스타·유튜브 문법) — 컨텐츠 페이드·슬라이드는 큰 면적에서 '깜빡임'으로 인지돼 전부 제거.
  // 모션은 알약 인디케이터(layoutId)가 전담한다.
  const changeTab = useCallback((t: TabId) => {
    // 탭 이동은 '화면 전환' — 떠 있는 매장 페이지 오버레이는 닫는다(탭을 눌렀는데 그대로 보이는 혼란 방지)
    closeOverlaysRef.current?.();
    startTabTransition(() => setActiveTab(t));
  }, []);

  // keep-alive: 한 번 방문한 핵심 탭은 언마운트하지 않고 display만 끈다 — 재방문 시 로드·마운트 비용 0(끊김 제거)
  const [visitedTabs] = useState(() => new Set<TabId>(['browse']));
  useEffect(() => { visitedTabs.add(activeTab); }, [activeTab, visitedTabs]);

  // 새 버전(배포) 감지(main.tsx의 SW updatefound) → 새로고침 배너
  useEffect(() => {
    const onUpd = () => setUpdateReady(true);
    window.addEventListener('nuri:sw-update', onUpd);
    return () => window.removeEventListener('nuri:sw-update', onUpd);
  }, []);
  // 운영자 푸시 온보딩 — 설치형(앱)에서 운영자가 알림 미설정 시 1회 안내(새 바인요청 푸시)
  useEffect(() => {
    if (!(isOwner || isAdmin || user?.role === 'venue_staff') || !pushSupported()) return;
    try { if (localStorage.getItem('nuri:push-nudge-dismissed') === '1') return; } catch { /* noop */ }
    if (!window.matchMedia('(display-mode: standalone)').matches) return; // 설치형에서만
    isPushSubscribed().then((sub) => { if (!sub) setPushNudge(true); }).catch(() => {});
  }, [user, isOwner, isAdmin]);
  const doEnablePush = async () => {
    try { await enablePush(); setPushNudge(false); toast.show('알림을 켰습니다 — 새 바인요청을 폰으로 받습니다', 'success'); }
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
  // 일정탐색 기본값 — 당일(오늘)이 선택된 상태로 시작(오늘 열리는 대회를 바로 보여줌)
  const [searchState, setSearchState] = useState<SearchState>({ query: '', dates: [new Date().toLocaleDateString('en-CA')], regions: [], format: null, gtdOnly: false, competitionOnly: false });
  // 전체 초기화 버튼을 '총 N개' 줄에 두기 위해 검색바의 clearAll 을 ref 로 끌어올림
  const searchBarRef = useRef<{ clearAll: () => void } | null>(null);
  const hasActiveSearchFilter = !!(searchState.query || searchState.dates.length || searchState.regions.length || searchState.format || searchState.gtdOnly || searchState.competitionOnly);
  const [authOpen, setAuthOpen]       = useState(false);
  const [authMode, setAuthMode]       = useState<'login' | 'signup-user'>('login'); // QR 회원가입 진입용
  const [openVenueId, setOpenVenueId] = useState<string | null>(null);
  // changeTab(상단 선언)에서 TDZ 없이 오버레이를 닫기 위한 ref 바인딩
  closeOverlaysRef.current = () => setOpenVenueId(null);
  const [openSchedule, setOpenSchedule] = useState<Schedule | null>(null);
  const [displayTarget, setDisplayTarget] = useState<{ venueId: string; gameSeq: number } | null>(null); // 관전/대형 디스플레이
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set()); // 팔로우한 매장 id
  const [followedOnly, setFollowedOnly] = useState(false); // 일정탐색: 팔로우 매장 포스터만
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
  useBackClose(activeTab !== 'browse', () => { if (!overlayJustClosed()) changeTab('browse'); });

  // ── 데이터 (Supabase에서 로드) ──────────────────────────────────────────────
  const [schedules,     setSchedules]     = useState<Schedule[]>([]);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false); // (B1) 첫 로드 완료 여부 — 로딩 중엔 스켈레톤(빈결과 메시지 깜빡임 방지)
  // FOMO 뱃지용 예약자 수 — 다가오는 대회만 1회 조회
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA');
    const ids = schedules.filter((s) => s.approved && s.date >= today).map((s) => s.id);
    if (ids.length === 0) { setBrowseResCounts({}); return; }
    getReservationCounts(ids).then(setBrowseResCounts).catch(() => {});
  }, [schedules]);
  const [venues,        setVenues]        = useState<Venue[]>([]);
  const [comments,      setComments]      = useState<Comment[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [posts,         setPosts]         = useState<CommunityPost[]>([]);
  const [listings,      setListings]      = useState<MarketplaceListing[]>([]);
  const [marketLoaded,  setMarketLoaded]  = useState(false); // 장터 최초 로딩 완료 여부(스켈레톤 게이팅)
  const [notices,       setNotices]       = useState<MarketplaceNotice[]>([]);
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
    setPendingPostId(null);
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
  const reloadSchedules = useCallback(() => { getSchedules().then(setSchedules).catch(() => {}).finally(() => setSchedulesLoaded(true)); }, []);
  // 당겨서 새로고침(유튜브·당근) — 최상단에서 아래로 80px+ 당기면 갱신
  const [ptr, setPtr] = useState(0); // 0=대기, 양수=당김(px), -1=갱신 중
  const ptrStart = useRef<number | null>(null);
  const onPtrStart = (e: React.TouchEvent) => { if (window.scrollY <= 0) ptrStart.current = e.touches[0].clientY; };
  const onPtrMove = (e: React.TouchEvent) => {
    if (ptrStart.current == null || ptr === -1) return;
    const dy = e.touches[0].clientY - ptrStart.current;
    setPtr(dy > 8 && window.scrollY <= 0 ? Math.min(110, dy * 0.5) : 0);
  };
  const onPtrEnd = () => {
    const pulled = ptr;
    ptrStart.current = null;
    if (pulled >= 56) {
      setPtr(-1);
      reloadSchedules();
      setTimeout(() => setPtr(0), 900);
    } else setPtr(0);
  };
  const reloadVenues    = useCallback(() => { getVenues().then(setVenues).catch(() => {}); }, []);
  const reloadPosts     = useCallback(() => { getPosts().then(setPosts).catch(() => {}); }, []);
  const reloadComments  = useCallback(() => { getComments({}).then(setComments).catch(() => {}); }, []);
  const reloadNotices   = useCallback(() => { getNotices().then(setNotices).catch(() => {}); }, []);

  // 공개 데이터 초기 로드
  useEffect(() => {
    reloadSchedules();
    reloadVenues();
    reloadPosts();
    reloadComments();
    reloadNotices();
    getListings().then((l) => { setListings(l); setMarketLoaded(true); }).catch(() => setMarketLoaded(true));
  }, [reloadSchedules, reloadVenues, reloadPosts, reloadComments, reloadNotices]);

  // 유휴 시간에 다음에 열 가능성이 큰 청크를 미리 받아둔다 → 탭 전환/매장 진입 시 로더 깜빡임 제거.
  useEffect(() => {
    const prefetch = () => {
      import('./components/features/CommunityTab');
      import('./components/features/MarketplaceTab');
      import('./components/features/VenuePage');
      if (isOwner) import('./components/features/VenueManageTab');
      if (isAdmin) import('./components/features/AdminTab');
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const id = w.requestIdleCallback
      ? w.requestIdleCallback(prefetch, { timeout: 3000 })
      : window.setTimeout(prefetch, 1500);
    return () => { if (w.cancelIdleCallback) w.cancelIdleCallback(id as number); else window.clearTimeout(id as number); };
  }, [isOwner, isAdmin]);

  // 헤더+탭바 실제 높이를 측정 → 일정탐색 sticky 필터가 정확히 그 아래에 붙도록 --stack-top 노출.
  // (토큰 추정/-1rem 보정 대신 실측값을 사용해 모바일 sticky 겹침을 방지)
  useEffect(() => {
    const headerEl = document.querySelector('[data-stack-header]');
    const update = () => {
      const tabbar = document.querySelector('[data-stack-tabbar]');
      // 데스크톱: 헤더 아래 sticky 탭바까지가 상단 스택 — 탭바 고정 하단 = 필터가 붙을 지점
      if (tabbar && tabbar.getBoundingClientRect().height > 0) {
        const stickyTop = parseFloat(getComputedStyle(tabbar).top) || 56;
        const h = stickyTop + tabbar.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--stack-top', `${Math.round(h)}px`);
        return;
      }
      // 모바일: 탭바가 숨겨져 있음 → 헤더의 '현재' 하단을 그대로 사용.
      // 헤더는 스크롤 시 축소(h-header-h→h-11)되는데, --stack-top을 미축소 높이로 한 번만 재면
      // 축소 후 헤더 하단과 검색바 sticky top 사이에 비침 띠(gap)가 생긴다.
      // ResizeObserver로 헤더 높이 변화(축소 애니메이션 매 프레임 포함)를 추적해 검색바가 항상 헤더 바로 아래에 붙게 한다.
      if (headerEl) {
        document.documentElement.style.setProperty('--stack-top', `${Math.round(headerEl.getBoundingClientRect().bottom)}px`);
      } else {
        document.documentElement.style.setProperty('--stack-top', '97px');
      }
    };
    update();
    window.addEventListener('resize', update);
    let ro: ResizeObserver | undefined;
    if (headerEl && 'ResizeObserver' in window) { ro = new ResizeObserver(update); ro.observe(headerEl); }
    const t = setTimeout(update, 300); // 폰트/레이아웃 안정화 후 재측정
    return () => { window.removeEventListener('resize', update); ro?.disconnect(); clearTimeout(t); };
  }, [activeTab]);

  // #13 커뮤니티 게시글·댓글 실시간 — 다른 사용자가 올린 글/댓글이 즉시 반영(알림/일정/장부와 동일 수준).
  // 700ms 디바운스로 이벤트 폭주 시 getPosts(50건+내좋아요) 재조회를 1회로 합침(부하 점검 #1).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribePosts(() => { if (t) clearTimeout(t); t = setTimeout(reloadPosts, 700); });
    return () => { if (t) clearTimeout(t); unsub(); };
  }, [reloadPosts]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeComments(() => { if (t) clearTimeout(t); t = setTimeout(reloadComments, 700); });
    return () => { if (t) clearTimeout(t); unsub(); };
  }, [reloadComments]);
  // 열린 상세(openPost)를 피드 갱신과 동기화 — 실시간/리로드로 posts 가 바뀌면 좋아요·댓글수·조회수도 상세에 반영
  useEffect(() => { setOpenPost((cur) => (cur ? (posts.find((p) => p.id === cur.id) ?? cur) : cur)); }, [posts]);

  // 로그인 사용자: 내 알림 로드
  useEffect(() => {
    if (user) getMyNotifications().then(setNotifications).catch(() => {});
    else setNotifications([]);
  }, [user]);

  // 창/탭 복귀(focus·visibility) 시 모든 주요 데이터 자동 동기화
  //  → 다른 기기·다른 사용자가 바꾼 일정·매장·게시글·댓글·장터·공지·알림이 즉시 최신화
  useVisibilityRefresh(() => {
    reloadSchedules();
    reloadVenues();
    reloadPosts();
    reloadComments();
    reloadNotices();
    getListings().then((l) => { setListings(l); setMarketLoaded(true); }).catch(() => setMarketLoaded(true));
    if (user) getMyNotifications().then(setNotifications).catch(() => {});
    if (isAdmin) listAllUsers().then(setUsers).catch(() => {});
  }, [user, isAdmin, reloadSchedules, reloadVenues, reloadPosts, reloadComments, reloadNotices]);

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
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeSchedules(() => { if (t) clearTimeout(t); t = setTimeout(reloadSchedules, 700); });
    return () => { if (t) clearTimeout(t); unsub(); };
  }, [reloadSchedules]);

  // 관리자: 회원 목록 로드
  useEffect(() => {
    if (isAdmin) listAllUsers().then(setUsers).catch(() => {});
    else setUsers([]);
  }, [isAdmin]);

  const unreadNotifs = notifications.filter((n) => !n.read).length;
  const isStaff = user?.role === 'venue_staff';

  const tabs: TabDef[] = useMemo(() => {
    const base: TabDef[] = [
      { id: 'browse',    label: '일정 탐색' },
      { id: 'live',      label: '라이브' },
      { id: 'community', label: '커뮤니티' },
      { id: 'market',    label: '중고장터' },
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

  // 탭이 사라지면 (로그아웃 등) browse로 돌아감
  useEffect(() => {
    if (!tabs.find((t) => t.id === activeTab)) changeTab('browse');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTab]);

  // 팔로우한 매장 id 로드(로그인 시)
  useEffect(() => {
    if (!user) { setFollowedIds(new Set()); setFollowedOnly(false); return; }
    getMyFollowedVenueIds().then((ids) => setFollowedIds(new Set(ids))).catch(() => {});
  }, [user]);

  const visibleSchedules = useMemo(() => {
    const list = schedules.filter((s) => s.approved);
    const q = searchState.query.trim();
    // 권역 묶음 펼치기(예: 서울 → 서울/강남/강서) — 매 일정마다 재계산하지 않도록 1회만
    const regionKeys = expandRegions(searchState.regions);
    return list.filter((s) => {
      const matchQ = !q || [s.title, s.pubName, s.region].some((t) => t.includes(q));
      // 복수 선택: 비어있으면 전체 통과, 아니면 선택된 값 중 하나라도 일치(OR)
      const matchD = searchState.dates.length === 0   || searchState.dates.includes(s.date);
      const matchR = regionKeys.length === 0 || regionKeys.some((r) => s.region.includes(r));
      const matchF = !searchState.format || s.format === searchState.format;
      const matchG = !searchState.gtdOnly || s.guaranteed === true;
      const matchC = !searchState.competitionOnly || s.isCompetition === true;
      const matchFollow = !followedOnly || (!!s.venueId && followedIds.has(s.venueId));
      return matchQ && matchD && matchR && matchF && matchG && matchC && matchFollow;
    });
  }, [schedules, searchState, followedOnly, followedIds]);

  // ── 핸들러 ─────────────────────────────────────────────────────────────

  const handleVenueClick = useCallback((venueId: string) => {
    if (!venueId) return; // 직접입력 포스터 등 매장 미연결 시 무시
    setOpenSchedule(null);   // 일정 모달이 열려있으면 닫고 매장으로 전환
    setOpenVenueId(venueId);
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
    startTabTransition(() => setOpenSchedule(s));
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
    setSearchState({ query: '', dates: [], regions: [], format: null, gtdOnly: false, competitionOnly: false });
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
      sellerVerified: user.role === 'venue_owner' || user.role === 'admin',
    });
    setListings((prev) => [saved, ...prev]);
  }, [user]);

  const handleLikePost = useCallback((postId: string) => {
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

  const handleDeletePoster = useCallback((id: string) => {
    const target = schedules.find((s) => s.id === id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    setOpenSchedule((cur) => (cur?.id === id ? null : cur));
    deleteSchedule(id)
      .then(() => logActivity({ action: 'delete', targetType: 'schedule', targetId: id, targetOwnerId: target?.ownerId, targetSummary: target?.title, actorName: user?.name }))
      .catch(() => { toast.show('삭제에 실패했습니다', 'error'); reloadSchedules(); });
  }, [schedules, user, toast, reloadSchedules]);

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
  const handleOpenWrite = useCallback((category?: PostCategory) => {
    if (!ensureVerified(user, '글쓰기')) return; // 본인인증 회원만 글쓰기
    setPostFormCategory(category ?? 'free');
    setPostFormOpen(true);
  }, [user]);
  const handleMarketCreate = useCallback(() => { if (ensureVerified(user, '중고장터 등록')) setMarketFormOpen(true); }, [user]);
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
      <AppHeader
        title={activeTab === 'browse' ? undefined : tabs.find((t) => t.id === activeTab)?.label}
        activeTab={activeTab}
        onGotoTab={(t) => changeTab(t)}
        unreadCount={unreadNotifs}
        notifications={notifications}
        onMarkRead={handleMarkRead}
        onOpenLogin={() => setAuthOpen(true)}
        onNavigateNotification={handleNavigateNotification}
        onHome={handleHome}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenSearch={() => setGlobalSearchOpen(true)}
        onOpenVouchers={() => setVoucherWalletOpen(true)}
        suppressed={openVenueId !== null}
      />

      {/* 🔄 새 버전 배너 — 배포 감지 시 새로고침 유도(앱이 멈춰 보이지 않게) */}
      {updateReady && (
        <button type="button" onClick={() => location.reload()}
          className="flex w-full items-center justify-center gap-2 bg-accent-300 px-3 py-2 text-xs font-bold text-white active:opacity-80">
          🔄 새 버전이 있어요 — 탭하여 새로고침
        </button>
      )}
      {/* 🔔 운영자 푸시 온보딩(설치형·1회) — 새 바인요청 폰 알림 */}
      {pushNudge && (
        <div className="flex items-center gap-2 border-b border-accent-400/30 bg-accent-300/[0.08] px-3 py-2.5">
          <span className="text-lg" aria-hidden>🔔</span>
          <p className="min-w-0 flex-1 text-2xs leading-snug text-ink-secondary">새 <b className="text-accent-300">바인요청</b>을 폰 알림으로 받으세요 — 게임 중에도 놓치지 않아요.</p>
          <button type="button" onClick={doEnablePush} className="btn-primary shrink-0 px-3 py-1.5 text-2xs">알림 켜기</button>
          <button type="button" onClick={dismissPushNudge} aria-label="닫기" className="shrink-0 px-1 text-ink-muted hover:text-ink-secondary">✕</button>
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

      <TabBar tabs={tabs.filter((t) => t.id !== 'market')} active={activeTab} onChange={changeTab} />
      {/* 모바일 하단 탭바(Riot Mobile 스타일) — 상단 GNB 대체 */}
      <MobileTabBar tabs={tabs} active={activeTab} onChange={changeTab} dot={{ community: commHasNew }}
        onOpenMe={() => { if (user) setVoucherWalletOpen(true); else setAuthOpen(true); }} />

      {/* 일정 탐색 */}
      <div className="px-page-x"><StaffInviteBanner /></div>

      {(activeTab === 'browse' || visitedTabs.has('browse')) && (
        <main className="tab-pane" style={activeTab !== 'browse' ? { display: 'none' } : undefined}
          onTouchStart={onPtrStart} onTouchMove={onPtrMove} onTouchEnd={onPtrEnd}>
          {/* 당겨서 새로고침 인디케이터 — ♠ 회전 */}
          {ptr !== 0 && (
            <div className="flex items-center justify-center overflow-hidden transition-[height] lg:hidden"
              style={{ height: ptr === -1 ? 52 : ptr }} aria-hidden>
              <span className={['text-2xl text-accent-300', ptr === -1 ? 'animate-spin' : ''].join(' ')}
                style={ptr !== -1 ? { transform: `rotate(${ptr * 3}deg)`, opacity: Math.min(1, ptr / 56) } : undefined}>♠</span>
            </div>
          )}
          {/* display:contents 로 래퍼 박스를 없애 검색+날짜 sticky 가 '긴 컨텐츠 컨테이너'의 직계자식이 되도록
              (짧은 헤더 박스에 갇히면 리스트를 스크롤할 때 검색+날짜가 같이 사라짐) */}
          <div className="contents">
            {/* 검색바+날짜만 sticky(아래 필터·카운트는 스크롤되어 사라짐) */}
            <IntegratedSearchBar ref={searchBarRef} onChange={setSearchState} stickyTop="calc(var(--stack-top, 6.0625rem) - 1px)" />
            {/* 뷰 모드 토글 + 팔로우 매장만 보기 — 일정 탐색 컨텍스트 안에 배치 */}
            <div className="flex items-center justify-between gap-2 px-page-x pt-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-2xs text-ink-muted">
                  총 <span className="text-ink-secondary tabular-nums font-semibold">{visibleSchedules.length}</span>개
                  {followedOnly && <span className="ml-1 text-accent-300">· 팔로우</span>}
                </span>
                {/* 전체 초기화 — 별도 줄 차지하지 않게 '총 N개' 옆에 배치(검색바 clearAll 호출) */}
                {hasActiveSearchFilter && (
                  <button
                    type="button"
                    onClick={() => searchBarRef.current?.clearAll()}
                    className="shrink-0 inline-flex items-center gap-0.5 rounded-badge border border-transparent px-1.5 py-0.5 text-2xs text-ink-muted transition-colors hover:border-danger/40 hover:text-danger focus:outline-none"
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4h8v2m-1 0v14H9V6" /></svg>
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

          {/* 주간 베스트 — 이번 주 머니인 킹 TOP3 롤링 */}
          <div className="px-page-x pt-3">
            <WeeklyBestStrip active={activeTab === 'browse'} />
          </div>

          {/* 손님: 오늘 내 바인(참가) 요청 상태 배너 — (B3) 등장/퇴장 height·opacity 트랜지션으로 CLS 완화 */}
          <AnimatePresence initial={false}>
          {myBuyinReqs.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }} className="overflow-hidden px-page-x pt-3 space-y-1.5">
              <p className="px-1 text-2xs font-bold text-ink-secondary">🎮 내 참가 게임 · 바인 요청</p>
              {myBuyinReqs.map((r) => (
                <div key={r.id} className={['flex items-center gap-2 rounded-card border px-3 py-2 text-xs',
                  r.status === 'approved' ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : r.status === 'rejected' ? 'border-border-default bg-surface-low' : 'border-sky-500/40 bg-sky-500/[0.07]'].join(' ')}>
                  <span className="shrink-0" aria-hidden>{r.status === 'approved' ? '✅' : r.status === 'rejected' ? '❌' : '⏳'}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-secondary"><b className="text-ink-primary">{r.venueName}</b>{(() => { const n = r.status === 'approved' ? r.gameSeq : r.requestedGameSeq; return n != null ? ` · ${n === 1 ? '메인' : '사이드' + (n - 1)}` : ''; })()} {r.status === 'approved' ? '참가 승인 — 입장하세요! 🎉' : r.status === 'rejected' ? `요청 거절됨${r.rejectReason ? ` — ${r.rejectReason}` : ''}` : '바인 요청 대기중'}</span>
                  {r.status === 'pending' && <button type="button" onClick={() => cancelBuyinRequest(r.id).then(() => getMyBuyinRequestsToday().then(setMyBuyinReqs)).catch((e) => toast.show(e instanceof Error ? e.message : '취소 실패', 'error'))} className="shrink-0 rounded-input border border-border-default px-2 py-1 text-2xs font-bold text-ink-muted hover:text-danger-light hover:border-danger/40">취소</button>}
                </div>
              ))}
            </motion.div>
          )}
          </AnimatePresence>

          {/* 공지 — 일정탐색 상단 (전체 공통 공지만) */}
          {(browseNotices.length > 0 || isAdmin) && (
            <div className="px-page-x pt-3">
              <section className="rounded-card border border-accent-400/30 bg-gradient-to-br from-accent-300/[0.05] to-transparent overflow-hidden">
                <header className="flex items-center justify-between px-3 py-2 border-b border-accent-400/20">
                  <button
                    type="button"
                    onClick={() => setNoticesOpen((v) => !v)}
                    aria-expanded={noticesOpen}
                    className="flex items-center gap-1.5 text-xs font-bold text-accent-300 focus:outline-none"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                      className={['transition-transform duration-200', noticesOpen ? '' : '-rotate-90'].join(' ')}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    공지사항 {browseNotices.length > 0 && <span className="text-2xs text-ink-muted font-normal">({browseNotices.length})</span>}
                  </button>
                  {isAdmin && (
                    <button type="button" onClick={() => setNoticeFormOpen(true)} className="text-2xs text-accent-300 hover:text-accent-200 font-semibold">
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
                ) : visibleSchedules.length === 0 ? (
                  <EmptyState />
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
                    {visibleSchedules.map((s) => (
                      <ScheduleCard
                        key={s.id}
                        mode={viewMode}
                        schedule={s}
                        reserveCount={browseResCounts[s.id]}
                        rating={venueRatings[s.venueId]}
                        onVenueClick={handleVenueClick}
                        onSelect={handleScheduleSelect}
                      />
                    ))}
                  </div>
                )}
                {/* 표 모드는 PC 전용 — 모바일 폭에선 리스트로 자동 표시 */}
                {viewMode === 'table' && visibleSchedules.length > 0 && (
                  <div className="grid grid-cols-1 gap-card-gap md:hidden">
                    {visibleSchedules.map((s) => (
                      <ScheduleCard key={s.id} mode="list" schedule={s} reserveCount={browseResCounts[s.id]} rating={venueRatings[s.venueId]} onVenueClick={handleVenueClick} onSelect={handleScheduleSelect} />
                    ))}
                  </div>
                )}

                {/* 🏁 지난 대회 — 완료된 대회 아카이브(결과는 상세에서) */}
                <PastTournaments schedules={schedules} onSelect={handleScheduleSelect} />
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
            <LiveGamesTabM venues={venues} schedules={schedules} onVenue={handleVenueClick} onSchedule={handleScheduleSelect} onDisplay={openDisplay} active={activeTab === 'live'} />
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

      {/* 중고장터 */}
      {(activeTab === 'market' || visitedTabs.has('market')) && (
        <main className="tab-pane px-page-x pt-3 pb-section" style={activeTab !== 'market' ? { display: 'none' } : undefined}>
          <ErrorBoundary inline resetKey="market">
          <MarketplaceTabM
            listings={listings}
            loading={!marketLoaded}
            notices={marketNotices}
            onSelect={setOpenListing}
            onSelectNotice={setOpenNotice}
            onCreate={handleMarketCreate}
            canWriteNotice={isAdmin}
            onWriteNotice={handleWriteNotice}
            onListingsChanged={handleListingsChanged}
          />
          </ErrorBoundary>
        </main>
      )}

      {/* 도구 — 매장 운영·플레이어 도구 모음 (메인 탭) */}
      {(activeTab === 'tools' || visitedTabs.has('tools')) && (
        <main className="tab-pane px-page-x pt-3 pb-section" style={activeTab !== 'tools' ? { display: 'none' } : undefined}>
          <ErrorBoundary inline resetKey="tools">
            <ToolsPanelM />
          </ErrorBoundary>
        </main>
      )}

      {/* 내 매장 — 게임관리 + 매장운영 통합 허브 (업주/직원/운영자) */}
      {activeTab === 'my-store' && (
        <main className="px-page-x pt-3 pb-section">
          <ErrorBoundary inline resetKey="my-store">
          <VenueManageTab
            schedules={schedules}
            deepSection={myStoreDeep}
            onConsumeDeepSection={() => setMyStoreDeep(null)}
            onCreatePoster={() => {
              // 승인 전 업주는 포스터 등록 차단(서버 RLS와 이중 방어 + 명확한 안내)
              if (user?.role === 'venue_owner' && !user.approved) {
                toast.show('매장 승인 완료 후 포스터를 등록할 수 있습니다', 'error');
                return;
              }
              setPosterFormTarget(undefined);
            }}
            onEditPoster={(id) => {
              const s = schedules.find((x) => x.id === id);
              if (s) setPosterFormTarget(s);
            }}
            onDeletePoster={(id) => { handleDeletePoster(id); toast.show('포스터가 삭제되었습니다', 'success'); }}
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
      <BusinessFooter onOpenLegal={(d) => setLegalDoc(d)} onOpenSupport={() => setSupportOpen(true)} />

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
        onVenue={handleVenueClick}
        onSchedule={handleScheduleSelect}
        onPost={setOpenPost}
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
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      type="button"
      aria-label="맨 위로"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      // 모바일: 하단 탭바(≈4.5rem+safe-area) 위로 띄움 / PC: 기존 위치
      className="fixed bottom-[5.75rem] lg:bottom-5 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border-default bg-surface-mid/95 text-ink-secondary shadow-dialog backdrop-blur transition-colors hover:text-accent-300 animate-fade-in"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}

// ── 🏁 지난 대회 아카이브 — 일정탐색 하단(완료 대회, 최근 5개) ─────────────────
// 순위가 입력된 대회면 행에 👑 우승자 표시 + 클릭 시 입상 순위 펼침(미입력이면 바로 상세).
function PastTournaments({ schedules, onSelect }: { schedules: Schedule[]; onSelect: (s: Schedule) => void }) {
  const today = new Date().toLocaleDateString('en-CA');
  const past = [...schedules]
    .filter((s) => s.approved && s.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const [results, setResults] = useState<Record<string, RankingEntry[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    past.forEach((s) => {
      if (!s.venueId) return;
      getVenueRankings(s.venueId, s.date)
        .then((r) => { if (r.entries.length > 0) setResults((prev) => ({ ...prev, [s.id]: r.entries })); })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules]);
  if (past.length === 0) return null;
  const day = (d: string) => ['일', '월', '화', '수', '목', '금', '토'][new Date(`${d}T00:00:00`).getDay()];
  const medal = (p: number) => (p === 1 ? '👑' : p === 2 ? '🥈' : p === 3 ? '🥉' : null);
  return (
    <section className="mt-4 overflow-hidden rounded-card border border-border-subtle bg-surface-low">
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
                        {e.prize && <span className="shrink-0 text-xs tabular-nums text-accent-300">{e.prize}</span>}
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
}

// ── PC 우측 위젯 레일(일정탐색) — 오늘 요약·주간 머니인 킹·HOT 게시글 ──────────
function BrowseSideRail({ posts, schedules, onSelectPost, onSelectSchedule }: {
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

  return (
    <aside className="sticky top-[calc(var(--stack-top,6.0625rem)+0.75rem)] hidden w-72 shrink-0 space-y-3 xl:block">
      {/* 곧 시작하는 대회 — 시간 임박 순 3개 */}
      {upcoming.length > 0 && (
        <section className="overflow-hidden rounded-card border border-border-subtle bg-surface-low">
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
        <section className="rounded-card border border-accent-400/25 bg-surface-low overflow-hidden">
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
        <section className="rounded-card border border-danger/25 bg-surface-low overflow-hidden">
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
      <section className="rounded-card border border-dashed border-border-default bg-surface-low/60 px-3 py-3 text-center">
        <p className="text-xs font-bold text-ink-secondary">📢 광고 자리</p>
        <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">이 자리에 매장·브랜드 광고를 게재할 수 있습니다.<br />내 매장 → 포스터 상단 고정 카드에서 문의하세요.</p>
      </section>
    </aside>
  );
}

// ── 빈 상태 ─────────────────────────────────────────────────────────────────

// (B1) 일정 로딩 스켈레톤 — 카드 자리(aspect-ratio 고정)를 미리 잡아 CLS·빈결과 깜빡임 방지
function ScheduleSkeletonGrid({ viewMode }: { viewMode: 'grid' | 'list' | 'table' }) {
  const grid = viewMode === 'grid';
  const n = grid ? 10 : 6;
  return (
    <div className={[grid ? 'grid grid-cols-2 gap-card-gap sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid grid-cols-1 lg:grid-cols-2 gap-card-gap'].join(' ')} aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={[grid ? 'aspect-[3/4]' : 'h-24', 'animate-pulse rounded-card border border-border-subtle bg-surface-high'].join(' ')} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-ink-muted">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none"
        stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <circle cx="22" cy="22" r="14" />
        <line x1="32" y1="32" x2="44" y2="44" />
        <line x1="16" y1="22" x2="28" y2="22" />
        <line x1="22" y1="16" x2="22" y2="28" />
      </svg>
      <p className="text-sm">검색 결과가 없습니다</p>
      <p className="text-xs">다른 키워드나 날짜를 선택해 보세요</p>
    </div>
  );
}
