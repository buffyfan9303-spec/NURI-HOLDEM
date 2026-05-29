import { useState, useCallback, useMemo, useEffect } from 'react';
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
import ProfileModal from './components/features/ProfileModal';
import { useAuth } from './contexts/AuthContext';
import {
  MOCK_SCHEDULES, MOCK_VENUES, MOCK_COMMENTS,
  MOCK_NOTIFICATIONS, MOCK_COMMUNITY_POSTS, MOCK_LISTINGS, MOCK_NOTICES, MOCK_USERS,
} from './mock/data';
import type { User } from './api/auth';
import type { Schedule } from './api/schedules';
import type { Comment, CommunityPost } from './api/community';
import type { AppNotification } from './api/notifications';
import type { MarketplaceListing, MarketplaceNotice } from './api/marketplace';

// ── 탭 정의 ──────────────────────────────────────────────────────────────────

type TabId = 'browse' | 'community' | 'market' | 'my-posters' | 'admin';
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
    <header className="sticky top-0 z-40 bg-surface-base/95 backdrop-blur-sm border-b border-border-subtle">
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

        {/* RIGHT: 알림 + 로그인/아바타 */}
        <div className="flex items-center gap-1.5">
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
              {/* 아바타 버튼 — 사진 있으면 이미지, 없으면 색상 이니셜 */}
              <button
                type="button"
                onClick={() => setUserMenu((v) => !v)}
                aria-label={`${user.name} 메뉴`}
                className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center
                           text-xs font-bold select-none transition-transform hover:scale-105
                           ring-1 ring-border-default hover:ring-gold-300"
                style={user.avatarUrl ? undefined : { background: user.avatarColor ?? '#FFD100', color: '#fff' }}
              >
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                  : user.name[0]}
              </button>

              {/* 드롭다운 메뉴 */}
              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-56 bg-surface-mid border border-border-default rounded-card shadow-dialog animate-slide-up z-50 overflow-hidden"
                  onMouseLeave={() => setUserMenu(false)}
                >
                  {/* 사용자 정보 헤더 */}
                  <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border-subtle">
                    <div
                      className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-white"
                      style={user.avatarUrl ? undefined : { background: user.avatarColor ?? '#FFD100' }}
                    >
                      {user.avatarUrl
                        ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : user.name[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-primary truncate">{user.name}</p>
                      <p className="text-2xs text-ink-muted truncate">{user.email}</p>
                    </div>
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

function TabBar({
  tabs, active, onChange,
}: { tabs: TabDef[]; active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="flex border-b border-border-subtle overflow-x-auto scrollbar-none">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onChange(id)}
          className={[
            'shrink-0 px-5 py-3 text-sm font-medium transition-colors duration-150',
            'border-b-2 -mb-px whitespace-nowrap',
            active === id
              ? 'border-gold-300 text-gold-300'
              : 'border-transparent text-ink-muted hover:text-ink-secondary',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
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
        ⏳ 매장 업주 승인 대기 중 — 승인 완료 후 포스터 업로드가 가능합니다
      </p>
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────

const VENUE_IMG_KEY = 'holdem.demo.venueImages';

function loadVenueImages(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VENUE_IMG_KEY) ?? '{}'); }
  catch { return {}; }
}

export default function App() {
  const { user, isAdmin, isOwner } = useAuth();
  const toast = useToast();

  // UI 상태
  const [viewMode, setViewMode]       = useState<ViewMode>('list');
  const [activeTab, setActiveTab]     = useState<TabId>('browse');
  const [searchState, setSearchState] = useState<SearchState>({ query: '', date: null, region: null, format: null, gtdOnly: false });
  const [authOpen, setAuthOpen]       = useState(false);
  const [openVenueId, setOpenVenueId] = useState<string | null>(null);
  const [openSchedule, setOpenSchedule] = useState<Schedule | null>(null);

  // 데이터 (venue 이미지는 localStorage에서 복원)
  const [schedules,     setSchedules]     = useState(MOCK_SCHEDULES);
  const [venues,        setVenues]        = useState(() => {
    const saved = loadVenueImages();
    return MOCK_VENUES.map((v) => saved[v.id] ? { ...v, imageUrl: saved[v.id] } : v);
  });
  const [comments,      setComments]      = useState<Comment[]>(MOCK_COMMENTS);
  const [notifications, setNotifications] = useState<AppNotification[]>(MOCK_NOTIFICATIONS);
  const [posts,         setPosts]         = useState<CommunityPost[]>(MOCK_COMMUNITY_POSTS);
  const [listings]                          = useState<MarketplaceListing[]>(MOCK_LISTINGS);
  const [openListing, setOpenListing]      = useState<MarketplaceListing | null>(null);
  const [openNotice, setOpenNotice]        = useState<MarketplaceNotice | null>(null);
  /** 포스터 폼 — null: 닫힘 / undefined: 신규 / Schedule: 수정 */
  const [posterFormTarget, setPosterFormTarget] = useState<Schedule | null | undefined>(null);
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [openPost, setOpenPost]         = useState<CommunityPost | null>(null);
  const [profileOpen, setProfileOpen]   = useState(false);

  const unreadNotifs = notifications.filter((n) => !n.read).length;

  const tabs: TabDef[] = useMemo(() => {
    const base: TabDef[] = [
      { id: 'browse',    label: '일정 탐색' },
      { id: 'community', label: '커뮤니티' },
      { id: 'market',    label: '중고장터' },
    ];
    if (isOwner)  base.push({ id: 'my-posters', label: '내 포스터' });
    if (isAdmin)  base.push({ id: 'admin',      label: '관리자 설정' });
    return base;
  }, [isOwner, isAdmin]);

  // 탭이 사라지면 (로그아웃 등) browse로 돌아감
  useEffect(() => {
    if (!tabs.find((t) => t.id === activeTab)) setActiveTab('browse');
  }, [tabs, activeTab]);

  const visibleSchedules = useMemo(() => {
    const list = schedules.filter((s) => s.approved);
    const q = searchState.query.trim();
    return list.filter((s) => {
      const matchQ = !q || [s.title, s.pubName, s.region].some((t) => t.includes(q));
      const matchD = !searchState.date   || s.date === searchState.date;
      const matchR = !searchState.region || s.region.includes(searchState.region);
      const matchF = !searchState.format || s.format === searchState.format;
      const matchG = !searchState.gtdOnly || s.guaranteed === true;
      return matchQ && matchD && matchR && matchF && matchG;
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
    setSearchState({ query: '', date: null, region: null, format: null, gtdOnly: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleMarkRead = useCallback((ids: string[]) => {
    setNotifications((prev) =>
      prev.map((n) => ids.includes(n.id) ? { ...n, read: true } : n),
    );
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
      const newComment: Comment = {
        id: `c${Date.now()}`,
        venueId, parentId,
        userId: user.id, userName: user.name, userRole: user.role,
        isOwner: user.role === 'venue_owner' && user.venueId === venueId,
        content, createdAt: new Date().toISOString(),
      };
      setComments((prev) => [newComment, ...prev]);
    },
    [user],
  );

  const handleSubmitScheduleComment = useCallback(
    (scheduleId: string, content: string, parentId?: string) => {
      if (!user) return;
      const s = schedules.find((x) => x.id === scheduleId);
      const newComment: Comment = {
        id: `c${Date.now()}`,
        scheduleId, parentId,
        userId: user.id, userName: user.name, userRole: user.role,
        isOwner: user.role === 'venue_owner' && s?.ownerId === user.id,
        content, createdAt: new Date().toISOString(),
      };
      setComments((prev) => [newComment, ...prev]);
    },
    [user, schedules],
  );

  const handleSubmitPost = useCallback((content: string) => {
    if (!user) return;
    const newPost: CommunityPost = {
      id: `p${Date.now()}`,
      userId: user.id, userName: user.name, userRole: user.role,
      userColor: user.avatarColor,
      content, createdAt: new Date().toISOString(),
      likeCount: 0, commentCount: 0,
    };
    setPosts((prev) => [newPost, ...prev]);
  }, [user]);

  const handleLikePost = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((p) => p.id === postId ? { ...p, likeCount: p.likeCount + 1 } : p),
    );
  }, []);

  // 관리자: 회원 업데이트 (승인/정지/해제)
  const handleUpdateUser = useCallback((id: string, patch: Partial<User>) => {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, ...patch } : u));
  }, []);

  // 관리자: 게시글 삭제
  const handleDeletePost = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleUpdateVenueDescription = useCallback((venueId: string, description: string) => {
    setVenues((prev) => prev.map((v) => v.id === venueId ? { ...v, description } : v));
  }, []);

  const handleUpdateVenueImage = useCallback((venueId: string, dataUrl: string) => {
    setVenues((prev) => prev.map((v) => v.id === venueId ? { ...v, imageUrl: dataUrl } : v));
    // localStorage 영구 저장 (새로고침에도 유지)
    try {
      const saved = loadVenueImages();
      saved[venueId] = dataUrl;
      localStorage.setItem(VENUE_IMG_KEY, JSON.stringify(saved));
      toast.show('배경이 저장되었습니다', 'success');
    } catch {
      toast.show('저장 공간이 부족합니다', 'error');
    }
  }, [toast]);

  const handleDeletePoster = useCallback((id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // 관리자: 포스터 승인 / 반려
  const handleApproveSchedule = useCallback((id: string) => {
    setSchedules((prev) => prev.map((s) => s.id === id ? { ...s, approved: true } : s));
    toast.show('포스터가 승인되어 메인에 게시되었습니다', 'success');
  }, [toast]);

  const handleRejectSchedule = useCallback((id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    toast.show('포스터가 반려되었습니다', 'info');
  }, [toast]);

  const handleSubmitPoster = useCallback((data: PosterFormData) => {
    // 시상품 텍스트 → SeatVoucher 형태로 변환 (간단 파싱: 끝의 "N석" 인식)
    const seatsFromPrizes = data.prizes.map((p) => {
      const m = p.match(/^(.+?)\s*(\d+)\s*석$/);
      return m ? { label: m[1].trim(), count: parseInt(m[2], 10) }
               : { label: p, count: 1 };
    });

    setSchedules((prev) => {
      // 수정 모드
      if (data.id) {
        return prev.map((s) => s.id === data.id ? {
          ...s,
          title:        data.title,
          date:         data.date,
          startTime:    data.startTime,
          duration:     data.regCloseTime || s.duration,
          regCloseTime: data.regCloseTime,
          guaranteed:   data.prizeType === 'GTD',
          prizePool:    data.prizeAmount * 10_000,
          buyIn:        { ...s.buyIn, amount: data.buyIn },
          region:       data.region,
          paymentMethods: data.paymentMethods,
          seats:        seatsFromPrizes.length > 0 ? seatsFromPrizes : undefined,
          posterUrl:    data.posterUrl ?? s.posterUrl,
        } : s);
      }
      // 신규 등록 (승인 대기 상태)
      const newSchedule: Schedule = {
        id: `s${Date.now()}`,
        title: data.title,
        venueId: user?.venueId ?? '',
        pubName: venues.find((v) => v.id === user?.venueId)?.name ?? '',
        region: data.region,
        date: data.date,
        startTime: data.startTime,
        duration: data.regCloseTime || '',
        regCloseTime: data.regCloseTime,
        format: 'MTT',
        guaranteed: data.prizeType === 'GTD',
        prizePool: data.prizeAmount * 10_000,
        buyIn: { amount: data.buyIn },
        paymentMethods: data.paymentMethods,
        seats: seatsFromPrizes.length > 0 ? seatsFromPrizes : undefined,
        posterUrl: data.posterUrl,
        posterColor: '#7C2D7E',
        displayOrder: prev.length + 1,
        isPremium: false,
        ownerId: user?.id ?? '',
        unreadQnaCount: 0,
        approved: false,
      };
      return [...prev, newSchedule];
    });
  }, [user, venues]);

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
      {activeTab === 'browse' && (
        <main>
          <div className="sticky top-header-h z-30 bg-surface-base/95 backdrop-blur-sm border-b border-border-subtle pt-2 pb-3">
            <IntegratedSearchBar onChange={setSearchState} />
            {/* 뷰 모드 토글 — 일정 탐색 컨텍스트 안에 배치 */}
            <div className="flex items-center justify-between px-page-x pt-2">
              <span className="text-2xs text-ink-muted">
                총 <span className="text-ink-secondary tabular-nums font-semibold">{visibleSchedules.length}</span>개
              </span>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
          </div>

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
            notices={MOCK_NOTICES}
            isAdmin={isAdmin}
            onWriteNotice={() => toast.show('공지 작성 기능은 곧 오픈됩니다', 'info')}
            onSelectNotice={setOpenNotice}
            onSelectVenue={handleVenueClick}
            onSelectPost={setOpenPost}
            onPostSubmit={handleSubmitPost}
            onLikePost={handleLikePost}
          />
        </main>
      )}

      {/* 중고장터 */}
      {activeTab === 'market' && (
        <main className="px-page-x py-section animate-fade-in">
          <MarketplaceTab
            listings={listings}
            notices={MOCK_NOTICES}
            onSelect={setOpenListing}
            onSelectNotice={setOpenNotice}
            onCreate={() => toast.show('글쓰기 기능은 곧 오픈됩니다', 'info')}
            canWriteNotice={isAdmin}
            onWriteNotice={() => toast.show('공지 작성 기능은 곧 오픈됩니다', 'info')}
          />
        </main>
      )}

      {/* 내 포스터 (매장업주 전용 — tabs 배열에서 isOwner 시에만 추가됨) */}
      {activeTab === 'my-posters' && (
        <main className="px-page-x py-section animate-fade-in">
          <MyPostersTab
            schedules={schedules}
            onCreate={() => setPosterFormTarget(undefined)}
            onEdit={(id) => {
              const s = schedules.find((x) => x.id === id);
              if (s) setPosterFormTarget(s);
            }}
            onDelete={(id) => { handleDeletePoster(id); toast.show('포스터가 삭제되었습니다', 'success'); }}
          />
        </main>
      )}

      {/* 관리자 */}
      {activeTab === 'admin' && (
        <main className="px-page-x py-section animate-fade-in">
          <AdminTab
            schedules={schedules}
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
      />

      <VenuePage
        open={openVenueId !== null}
        venue={openVenueId ? venues.find((v) => v.id === openVenueId) ?? null : null}
        onClose={() => setOpenVenueId(null)}
        schedules={schedules}
        comments={comments}
        onSubmitComment={handleSubmitVenueComment}
        onUpdateDescription={handleUpdateVenueDescription}
        onUpdateImage={handleUpdateVenueImage}
      />

      <ListingDetailModal
        open={openListing !== null}
        listing={openListing}
        onClose={() => setOpenListing(null)}
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
      />

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
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
