import { useState, useCallback, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { useToast } from './components/atoms/Toast';
import UnreadBadge from './components/atoms/UnreadBadge';
import ViewModeToggle from './components/atoms/ViewModeToggle';
import type { ViewMode } from './components/atoms/ViewModeToggle';
import IntegratedSearchBar from './components/features/IntegratedSearchBar';
import type { SearchState } from './components/features/IntegratedSearchBar';
import ScheduleCard from './components/features/ScheduleCard';
import ScheduleDetailModal from './components/features/ScheduleDetailModal';
import AdminTab from './components/features/AdminTab';
import AuthModal from './components/features/AuthModal';
import PostDetailModal from './components/features/PostDetailModal';
import NotificationPanel from './components/features/NotificationPanel';
import CommunityTab from './components/features/CommunityTab';
import VenuePage from './components/features/VenuePage';
import MyPostersTab from './components/features/MyPostersTab';
import MarketplaceTab from './components/features/MarketplaceTab';
import ListingDetailModal from './components/features/ListingDetailModal';
import NoticeDetailModal from './components/features/NoticeDetailModal';
import PosterFormModal from './components/features/PosterFormModal';
import type { PosterFormData } from './components/features/PosterFormModal';
import NuriHoldemLogo from './components/atoms/NuriHoldemLogo';
import ThemeToggle from './components/atoms/ThemeToggle';
import ProfileModal from './components/features/ProfileModal';
import VenueManageTab from './components/features/VenueManageTab';
import StaffInviteBanner from './components/features/StaffInviteBanner';
import TierBadge, { tierOf } from './components/atoms/TierBadge';
import NoticeFormModal from './components/features/NoticeFormModal';
import PostFormModal from './components/features/PostFormModal';
import ConsentGateModal from './components/features/ConsentGateModal';
import type { PostFormData } from './components/features/PostFormModal';
import MarketplaceFormModal from './components/features/MarketplaceFormModal';
import type { MarketplaceFormData } from './components/features/MarketplaceFormModal';
import { useAuth } from './contexts/AuthContext';
import { listAllUsers, updateUserStatus, approveOwner } from './api/auth';
import {
  getSchedules, createSchedule, updateSchedule, deleteSchedule,
} from './api/schedules';
import {
  getVenues, getComments, getPosts, addComment, addPost, likePost, deletePost,
  updateVenueDescription, updateVenueImage, deleteComment, logActivity,
} from './api/community';
import { getListings, getNotices, createNotice, createListing, deleteListing } from './api/marketplace';
import type { NoticeFormData } from './components/features/NoticeFormModal';
import { getMyNotifications, markNotificationsRead } from './api/notifications';
import type { User } from './api/auth';
import type { Schedule } from './api/schedules';
import type { Venue, Comment, CommunityPost, PostCategory } from './api/community';
import type { AppNotification } from './api/notifications';
import type { MarketplaceListing, MarketplaceNotice } from './api/marketplace';

// ── 탭 정의 ──────────────────────────────────────────────────────────────────

type TabId = 'browse' | 'community' | 'market' | 'my-posters' | 'my-venue' | 'admin';
interface TabDef { id: TabId; label: string; }

// ── 헤더 ─────────────────────────────────────────────────────────────────────

function AppHeader({
  unreadCount, notifications, onMarkRead, onOpenLogin, onNavigateNotification, onHome, onOpenProfile,
}: {
  unreadCount: number;
  notifications: AppNotification[];
  onMarkRead: (ids: string[]) => void;
  onOpenLogin: () => void;
  onNavigateNotification: (n: AppNotification) => void;
  onHome: () => void;
  onOpenProfile: () => void;
}) {
  const { user, logout } = useAuth();
  const [notifOpen,    setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenu]  = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-surface-base border-b border-border-subtle">
      {/* ── 단순화된 헤더: 좌(로고) / 우(알림+유저) ──────────────── */}
      <div className="flex items-center justify-between h-header-h px-page-x">

        {/* LEFT: NURI HOLDEM 로고 — 클릭 시 메인으로 */}
        <button
          type="button"
          onClick={onHome}
          aria-label="메인으로 이동"
          className="active:scale-95 transition-transform"
        >
          <NuriHoldemLogo />
        </button>

        {/* RIGHT: 테마 토글 + 알림 + 로그인/아바타 */}
        <div className="flex items-center gap-1.5">
          {/* 라이트/다크 모드 전환 */}
          <ThemeToggle />

          {/* 알림 벨 — 솔리드 디자인 + 명확한 클릭 영역 */}
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label={`알림 ${unreadCount}개`}
            aria-expanded={notifOpen}
            className={[
              'relative w-9 h-9 flex items-center justify-center rounded-input transition-colors',
              'active:scale-95',
              notifOpen
                ? 'bg-surface-high text-gold-300'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-high',
            ].join(' ')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6.29-4.71L18 17V11c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.64 5.36 6 7.92 6 11v6l-.29.29A1 1 0 0 0 6.41 19h11.18a1 1 0 0 0 .7-1.71z" />
            </svg>
            <UnreadBadge count={unreadCount} className="absolute top-0 right-0" />
          </button>

          {/* 로그인 / 유저 메뉴 */}
          {user ? (
            <div className="relative">
              {/* 아바타 버튼 — 사진 있으면 이미지, 없으면 색상 이니셜
                  [모바일 접근성] 보이는 아바타는 36px 유지하되, 터치 영역(버튼)을
                  44x44px로 확장(WCAG 2.5.5 최소 타깃). -mr-1로 우측 페이지 여백 정렬 보정. */}
              <button
                type="button"
                onClick={() => setUserMenu((v) => !v)}
                aria-label={`${user.name} 메뉴`}
                className="group relative w-11 h-11 -mr-1 flex items-center justify-center rounded-full focus:outline-none"
              >
                <span
                  className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center
                             text-xs font-bold text-white select-none transition-transform
                             ring-1 ring-border-default group-hover:ring-gold-300
                             group-hover:scale-105 group-active:scale-95"
                  style={user.avatarUrl ? undefined : { background: user.avatarColor ?? '#FFD100' }}
                >
                  {user.avatarUrl
                    ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                    : user.name[0]}
                </span>
                {tierOf(user.activityPoints ?? 0).key !== 'none' && (
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface-base p-[1px] leading-none">
                    <TierBadge points={user.activityPoints ?? 0} size={12} />
                  </span>
                )}
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
                      className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-white"
                      style={user.avatarUrl ? undefined : { background: user.avatarColor ?? '#FFD100' }}
                    >
                      {user.avatarUrl
                        ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : user.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-primary truncate">{user.name}</p>
                      <p className="text-2xs text-ink-muted truncate">{user.email}</p>
                    </div>
                  </button>

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
            <button
              type="button"
              onClick={onOpenLogin}
              className="btn-primary text-xs h-9 px-3"
            >
              로그인
            </button>
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
      className="relative flex border-b border-border-subtle overflow-x-auto scrollbar-none px-page-x
                 [&>button:first-child]:pl-0 [&>button:last-child]:pr-0"
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
              'shrink-0 px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors duration-200 focus:outline-none active:bg-surface-high/40 rounded-t-input',
              isActive ? 'text-gold-300 text-gold-glow' : 'text-ink-muted hover:text-ink-secondary',
            ].join(' ')}
          >
            <span
              ref={(el) => { labelRefs.current[id] = el; }}
              className="relative inline-flex items-center justify-center"
            >
              {label}
            </span>
          </button>
        );
      })}

      {/* 단일 슬라이딩 밑줄 인디케이터 — 활성 탭 라벨 폭/위치로 부드럽게 이동(중앙 정렬) */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-gold-300
                   shadow-[0_0_8px_rgba(255,209,0,0.5)]
                   transition-[left,width] duration-300 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
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

export default function App() {
  const { user, isAdmin, isOwner } = useAuth();
  const toast = useToast();

  // UI 상태
  const [viewMode, setViewMode]       = useState<ViewMode>('list');
  const [activeTab, setActiveTab]     = useState<TabId>('browse');
  const [searchState, setSearchState] = useState<SearchState>({ query: '', dates: [], regions: [], format: null, gtdOnly: false, competitionOnly: false });
  const [authOpen, setAuthOpen]       = useState(false);
  const [openVenueId, setOpenVenueId] = useState<string | null>(null);
  const [openSchedule, setOpenSchedule] = useState<Schedule | null>(null);

  // ── 데이터 (Supabase에서 로드) ──────────────────────────────────────────────
  const [schedules,     setSchedules]     = useState<Schedule[]>([]);
  const [venues,        setVenues]        = useState<Venue[]>([]);
  const [comments,      setComments]      = useState<Comment[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [posts,         setPosts]         = useState<CommunityPost[]>([]);
  const [listings,      setListings]      = useState<MarketplaceListing[]>([]);
  const [notices,       setNotices]       = useState<MarketplaceNotice[]>([]);
  const [users,         setUsers]         = useState<User[]>([]);
  const [openListing, setOpenListing]      = useState<MarketplaceListing | null>(null);
  const [openNotice, setOpenNotice]        = useState<MarketplaceNotice | null>(null);
  /** 포스터 폼 — null: 닫힘 / undefined: 신규 / Schedule: 수정 */
  const [posterFormTarget, setPosterFormTarget] = useState<Schedule | null | undefined>(null);
  const [openPost, setOpenPost]         = useState<CommunityPost | null>(null);
  const [profileOpen, setProfileOpen]   = useState(false);
  // 비밀번호 변경 OTP 진행 중 페이지가 리로드되면(모바일에서 메일 앱을 다녀온 경우)
  // 프로필 모달을 다시 열어 코드 입력 화면으로 복귀시킨다.
  useEffect(() => {
    const pending = sessionStorage.getItem('nh_pw_otp');
    if (pending && Date.now() - Number(pending) < 5 * 60 * 1000) setProfileOpen(true);
  }, []);
  const [noticeFormOpen, setNoticeFormOpen] = useState(false);
  const [postFormOpen, setPostFormOpen]     = useState(false);   // 커뮤니티 글쓰기
  const [postFormCategory, setPostFormCategory] = useState<PostCategory>('free'); // 글쓰기 기본 카테고리(공부 탭=study)
  const [marketFormOpen, setMarketFormOpen] = useState(false);   // 중고장터 글쓰기

  // 서버 재조회 헬퍼
  const reloadSchedules = useCallback(() => { getSchedules().then(setSchedules).catch(() => {}); }, []);
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
    getListings().then(setListings).catch(() => {});
  }, [reloadSchedules, reloadVenues, reloadPosts, reloadComments, reloadNotices]);

  // 로그인 사용자: 내 알림 로드
  useEffect(() => {
    if (user) getMyNotifications().then(setNotifications).catch(() => {});
    else setNotifications([]);
  }, [user]);

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
      { id: 'community', label: '커뮤니티' },
      { id: 'market',    label: '중고장터' },
    ];
    if (isOwner)            base.push({ id: 'my-posters', label: '내 포스터' });
    if (isOwner || isStaff) base.push({ id: 'my-venue',   label: '매장 관리' });
    if (isAdmin)            base.push({ id: 'admin',       label: '관리자 설정' });
    return base;
  }, [isOwner, isStaff, isAdmin]);

  // 탭이 사라지면 (로그아웃 등) browse로 돌아감
  useEffect(() => {
    if (!tabs.find((t) => t.id === activeTab)) setActiveTab('browse');
  }, [tabs, activeTab]);

  const visibleSchedules = useMemo(() => {
    const list = schedules.filter((s) => s.approved);
    const q = searchState.query.trim();
    return list.filter((s) => {
      const matchQ = !q || [s.title, s.pubName, s.region].some((t) => t.includes(q));
      // 복수 선택: 비어있으면 전체 통과, 아니면 선택된 값 중 하나라도 일치(OR)
      const matchD = searchState.dates.length === 0   || searchState.dates.includes(s.date);
      const matchR = searchState.regions.length === 0 || searchState.regions.some((r) => s.region.includes(r));
      const matchF = !searchState.format || s.format === searchState.format;
      const matchG = !searchState.gtdOnly || s.guaranteed === true;
      const matchC = !searchState.competitionOnly || s.isCompetition === true;
      return matchQ && matchD && matchR && matchF && matchG && matchC;
    });
  }, [schedules, searchState]);

  // ── 핸들러 ─────────────────────────────────────────────────────────────

  const handleVenueClick = useCallback((venueId: string) => {
    setOpenSchedule(null);   // 일정 모달이 열려있으면 닫고 매장으로 전환
    setOpenVenueId(venueId);
  }, []);

  const handleScheduleSelect = useCallback((s: Schedule) => {
    setOpenSchedule(s);
  }, []);

  // 로고 클릭 → 메인(일정 탐색)으로 + 모든 모달/패널 닫기
  const handleHome = useCallback(() => {
    setActiveTab('browse');
    setOpenSchedule(null);
    setOpenVenueId(null);
    setOpenListing(null);
    setOpenNotice(null);
    setOpenPost(null);
    setPosterFormTarget(null);
    setSearchState({ query: '', dates: [], regions: [], format: null, gtdOnly: false, competitionOnly: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleMarkRead = useCallback((ids: string[]) => {
    setNotifications((prev) =>
      prev.map((n) => ids.includes(n.id) ? { ...n, read: true } : n),
    );
    markNotificationsRead(ids).catch(() => {});
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
      setActiveTab('community');
      setPosts((prev) => {
        const found = prev.find((p) => p.id === pm[1]);
        if (found) setOpenPost(found);
        return prev;
      });
      return;
    }
    // /admin (포스터 승인 알림)
    if (link === '/admin' || n.type === 'approval') {
      setActiveTab(isAdmin ? 'admin' : 'my-posters');
      return;
    }
    toast.show(n.title, 'info');
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
    setPosts((prev) =>
      prev.map((p) => p.id === postId ? { ...p, likeCount: p.likeCount + 1 } : p),
    );
    likePost(postId).catch(() => {});
  }, []);

  // 관리자: 회원 업데이트 (승인/정지/해제) — 서버 반영
  const handleUpdateUser = useCallback((id: string, patch: Partial<User>) => {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, ...patch } : u));
    if (patch.approved !== undefined) {
      approveOwner(id, patch.approved).catch(() => toast.show('승인 처리에 실패했습니다', 'error'));
    }
    if (patch.status !== undefined) {
      updateUserStatus(id, patch.status, patch.suspendedUntil, patch.sanctionReason)
        .catch(() => toast.show('상태 변경에 실패했습니다', 'error'));
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
      .catch(() => toast.show('삭제에 실패했습니다', 'error'));
  }, [posts, user, toast]);

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
      .catch(() => toast.show('삭제에 실패했습니다', 'error'));
  }, [listings, user, toast]);

  // 관리자: 댓글 삭제 — 낙관적 제거 후 서버 반영(권한은 RLS가 강제)
  const handleDeleteComment = useCallback((commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentId !== commentId));
    deleteComment(commentId)
      .then(() => toast.show('댓글이 삭제되었습니다', 'success'))
      .catch(() => { toast.show('댓글 삭제에 실패했습니다', 'error'); reloadComments(); });
  }, [toast, reloadComments]);

  // 관리자: 공지사항 작성 — 등록 후 목록 갱신 (권한은 RLS가 강제)
  const handleCreateNotice = useCallback(async (data: NoticeFormData) => {
    if (!user) throw new Error('로그인이 필요합니다');
    const saved = await createNotice({
      type: data.type, title: data.title, body: data.body, authorName: user.name,
    });
    setNotices((prev) => [saved, ...prev]);
  }, [user]);

  const handleUpdateVenueDescription = useCallback((venueId: string, description: string) => {
    setVenues((prev) => prev.map((v) => v.id === venueId ? { ...v, description } : v));
    updateVenueDescription(venueId, description).catch(() => toast.show('저장에 실패했습니다', 'error'));
  }, [toast]);

  const handleUpdateVenueImage = useCallback((venueId: string, dataUrl: string) => {
    setVenues((prev) => prev.map((v) => v.id === venueId ? { ...v, imageUrl: dataUrl } : v));
    updateVenueImage(venueId, dataUrl)
      .then(() => toast.show('배경이 저장되었습니다', 'success'))
      .catch(() => toast.show('저장에 실패했습니다', 'error'));
  }, [toast]);

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
        guaranteed:   data.prizeType === 'GTD',
        isCompetition: data.isCompetition,
        prizePool:    data.prizeAmount * 10_000,
        buyIn:        { amount: data.buyIn },
        region:       data.region,
        paymentMethods: data.paymentMethods,
        seats,
      };
      if (data.regCloseTime)            patch.duration  = data.regCloseTime;
      if (data.posterUrl !== undefined) patch.posterUrl = data.posterUrl;

      setSchedules((prev) => prev.map((s) =>
        s.id === data.id ? { ...s, ...patch, posterUrl: data.posterUrl ?? s.posterUrl } : s));
      updateSchedule(data.id, patch)
        .then(reloadSchedules)
        .catch(() => { toast.show('수정 저장에 실패했습니다', 'error'); reloadSchedules(); });
      return;
    }

    // ── 신규 등록 (승인 대기) ──
    if (!user) return;
    createSchedule({
      title:          data.title,
      venueId:        user.venueId ?? '',
      pubName:        venues.find((v) => v.id === user.venueId)?.name ?? user.name,
      region:         data.region,
      date:           data.date,
      startTime:      data.startTime,
      duration:       data.regCloseTime || '',
      regCloseTime:   data.regCloseTime,
      format:         'MTT',
      guaranteed:     data.prizeType === 'GTD',
      isCompetition:  data.isCompetition,
      prizePool:      data.prizeAmount * 10_000,
      buyIn:          { amount: data.buyIn },
      paymentMethods: data.paymentMethods,
      seats,
      posterUrl:      data.posterUrl,
      posterColor:    '#7C2D7E',
      displayOrder:   999,
      isPremium:      false,
      ownerId:        user.id,
    })
      .then(reloadSchedules)
      .catch(() => toast.show('포스터 등록에 실패했습니다. 매장 승인 상태를 확인해 주세요.', 'error'));
  }, [user, venues, toast, reloadSchedules]);

  // ── 렌더 ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-base">
      <AppHeader
        unreadCount={unreadNotifs}
        notifications={notifications}
        onMarkRead={handleMarkRead}
        onOpenLogin={() => setAuthOpen(true)}
        onNavigateNotification={handleNavigateNotification}
        onHome={handleHome}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <PendingApprovalBanner />

      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* 일정 탐색 */}
      <div className="px-page-x"><StaffInviteBanner /></div>

      {activeTab === 'browse' && (
        <main>
          <div className="sticky top-header-h z-30 bg-surface-base border-b border-border-subtle pt-2 pb-3">
            <IntegratedSearchBar onChange={setSearchState} />
            {/* 뷰 모드 토글 — 일정 탐색 컨텍스트 안에 배치 */}
            <div className="flex items-center justify-between px-page-x pt-2">
              <span className="text-2xs text-ink-muted">
                총 <span className="text-ink-secondary tabular-nums font-semibold">{visibleSchedules.length}</span>개
              </span>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
          </div>

          {/* 공지 — 일정탐색 상단 (관리자가 작성, 전 영역 공통 공지) */}
          {(notices.length > 0 || isAdmin) && (
            <div className="px-page-x pt-3">
              <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent overflow-hidden">
                <header className="flex items-center justify-between px-3 py-2 border-b border-gold-400/20">
                  <h2 className="text-xs font-bold text-gold-300">
                    공지사항 {notices.length > 0 && <span className="text-2xs text-ink-muted font-normal">({notices.length})</span>}
                  </h2>
                  {isAdmin && (
                    <button type="button" onClick={() => setNoticeFormOpen(true)} className="text-2xs text-gold-300 hover:text-gold-200 font-semibold">
                      + 공지 작성
                    </button>
                  )}
                </header>
                {notices.length > 0 ? (
                  <ul>
                    {notices.slice(0, 3).map((n) => (
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
                )}
              </section>
            </div>
          )}

          <div className="px-page-x py-section">
            {visibleSchedules.length === 0 ? (
              <EmptyState />
            ) : (
              <div className={[
                'animate-fade-in',
                viewMode === 'grid'
                  ? 'grid grid-cols-2 gap-card-gap sm:grid-cols-3'
                  : 'flex flex-col gap-card-gap',
              ].join(' ')}>
                {visibleSchedules.map((s) => (
                  <ScheduleCard
                    key={s.id}
                    mode={viewMode}
                    schedule={s}
                    onVenueClick={handleVenueClick}
                    onSelect={handleScheduleSelect}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* 커뮤니티 */}
      {activeTab === 'community' && (
        <main className="px-page-x py-section animate-fade-in">
          <CommunityTab
            venues={venues}
            comments={comments}
            posts={posts}
            notices={notices}
            isAdmin={isAdmin}
            onWriteNotice={() => setNoticeFormOpen(true)}
            onSelectNotice={setOpenNotice}
            onSelectVenue={handleVenueClick}
            onSelectPost={setOpenPost}
            onOpenWrite={(category) => {
              if (!user) { setAuthOpen(true); return; }
              setPostFormCategory(category ?? 'free');
              setPostFormOpen(true);
            }}
            onLikePost={handleLikePost}
          />
        </main>
      )}

      {/* 중고장터 */}
      {activeTab === 'market' && (
        <main className="px-page-x py-section animate-fade-in">
          <MarketplaceTab
            listings={listings}
            notices={notices}
            onSelect={setOpenListing}
            onSelectNotice={setOpenNotice}
            onCreate={() => user ? setMarketFormOpen(true) : setAuthOpen(true)}
            canWriteNotice={isAdmin}
            onWriteNotice={() => setNoticeFormOpen(true)}
          />
        </main>
      )}

      {/* 내 포스터 (매장업주 전용 — tabs 배열에서 isOwner 시에만 추가됨) */}
      {activeTab === 'my-posters' && (
        <main className="px-page-x py-section animate-fade-in">
          <MyPostersTab
            schedules={schedules}
            onCreate={() => {
              // 승인 전 업주는 포스터 등록 차단(서버 RLS와 이중 방어 + 명확한 안내)
              if (user?.role === 'venue_owner' && !user.approved) {
                toast.show('매장 승인 완료 후 포스터를 등록할 수 있습니다', 'error');
                return;
              }
              setPosterFormTarget(undefined);
            }}
            onEdit={(id) => {
              const s = schedules.find((x) => x.id === id);
              if (s) setPosterFormTarget(s);
            }}
            onDelete={(id) => { handleDeletePoster(id); toast.show('포스터가 삭제되었습니다', 'success'); }}
          />
        </main>
      )}

      {/* 매장 관리 (업주/직원 전용) */}
      {activeTab === 'my-venue' && (
        <main className="px-page-x py-section animate-fade-in">
          <VenueManageTab />
        </main>
      )}

      {/* 관리자 */}
      {activeTab === 'admin' && (
        <main className="px-page-x py-section animate-fade-in">
          <AdminTab
            schedules={schedules}
            venues={venues}
            users={users}
            posts={posts}
            onApproveSchedule={handleApproveSchedule}
            onRejectSchedule={handleRejectSchedule}
            onUpdateUser={handleUpdateUser}
            onDeletePost={handleDeletePost}
          />
        </main>
      )}

      {/* ── 모달 ─────────────────────────────────────────────────────── */}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

      <ScheduleDetailModal
        open={openSchedule !== null}
        schedule={openSchedule}
        onClose={() => setOpenSchedule(null)}
        onVenueClick={handleVenueClick}
        comments={comments}
        onSubmitComment={(content, parentId) =>
          openSchedule && handleSubmitScheduleComment(openSchedule.id, content, parentId)
        }
        onDeleteComment={handleDeleteComment}
        onDeletePoster={handleDeletePoster}
      />

      <VenuePage
        open={openVenueId !== null}
        venue={openVenueId ? venues.find((v) => v.id === openVenueId) ?? null : null}
        onClose={() => setOpenVenueId(null)}
        schedules={schedules}
        comments={comments}
        notices={notices}
        onSubmitComment={handleSubmitVenueComment}
        onDeleteComment={handleDeleteComment}
        onUpdateDescription={handleUpdateVenueDescription}
        onUpdateImage={handleUpdateVenueImage}
      />

      <ListingDetailModal
        open={openListing !== null}
        listing={openListing}
        onClose={() => setOpenListing(null)}
        onDelete={handleDeleteListing}
      />

      <NoticeDetailModal
        open={openNotice !== null}
        notice={openNotice}
        onClose={() => setOpenNotice(null)}
      />

      <PosterFormModal
        open={posterFormTarget !== null}
        schedule={posterFormTarget}
        onClose={() => setPosterFormTarget(null)}
        onSubmit={handleSubmitPoster}
      />

      <PostDetailModal
        open={openPost !== null}
        post={openPost}
        onClose={() => setOpenPost(null)}
        onLike={handleLikePost}
        onDelete={handleDeletePost}
      />

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />

      {/* 관리자 전용 공지 작성 모달 (커뮤니티/장터 '공지 작성' 버튼에서 진입) */}
      <NoticeFormModal
        open={noticeFormOpen}
        onClose={() => setNoticeFormOpen(false)}
        onSubmit={handleCreateNotice}
      />

      {/* 커뮤니티 글쓰기 모달 (Stage 2) */}
      <PostFormModal
        open={postFormOpen}
        onClose={() => setPostFormOpen(false)}
        onSubmit={handleCreatePost}
        defaultCategory={postFormCategory}
      />

      {/* 법적 동의 게이트 — 구글 등 미동의 가입자(관리자 제외)에게 1회 필수 동의 */}
      <ConsentGateModal open={!!user && user.agreedToTerms === false && user.role !== 'admin'} />

      {/* 중고장터 글쓰기 모달 (Stage 2) */}
      <MarketplaceFormModal
        open={marketFormOpen}
        onClose={() => setMarketFormOpen(false)}
        onSubmit={handleCreateListing}
      />
    </div>
  );
}

// ── 빈 상태 ─────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-ink-muted animate-fade-in">
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
