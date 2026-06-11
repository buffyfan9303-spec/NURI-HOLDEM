import { useState, useMemo, useEffect } from 'react';
import type { Venue, Comment, CommunityPost, LiveMessage, PostCategory, GroupKind, JoinedGroup } from '../../api/community';
import { getLiveMessages, addLiveMessage, deleteLiveMessage, subscribeLiveWall, createMyVenue, createGroup, GROUP_KIND_LABEL, getMyOwnedCommunities, getMyJoinedGroups, removeMember } from '../../api/community';
import { REGION_CHIPS } from './IntegratedSearchBar';
import type { MarketplaceNotice } from '../../api/marketplace';
import { useAuth } from '../../contexts/AuthContext';
import OwnerCommunity from './OwnerCommunity';
import DealerCommunity from './DealerCommunity';
import TierLeaderboard from './TierLeaderboard';
import { useToast } from '../atoms/Toast';
import { filterContent } from '../../lib/content-filter';
import { parseAttachments } from '../../lib/hand';
import Avatar from '../atoms/Avatar';
import Modal from '../atoms/Modal';
import PostDetailModal from './PostDetailModal';
import { useIsDesktop } from '../../lib/responsive';

interface CommunityTabProps {
  venues: Venue[];
  comments: Comment[];
  posts: CommunityPost[];
  /** 운영자 공지 (전역 피드 최상단에 핀 고정) */
  notices?: MarketplaceNotice[];
  isAdmin?: boolean;
  onWriteNotice?: () => void;
  /** 공지 클릭 시 상세 모달 열기 */
  onSelectNotice?: (notice: MarketplaceNotice) => void;
  onSelectVenue: (venueId: string) => void;
  onSelectPost: (post: CommunityPost) => void;
  /** 글쓰기 버튼 → 글쓰기 모달 열기. category로 기본 카테고리 지정('홀덤 공부' 탭=study) */
  onOpenWrite: (category?: PostCategory) => void;
  onLikePost: (postId: string) => void;
  /** 데스크탑 2-pane 인라인 상세에서 게시글 삭제(관리자/작성자) */
  onDeletePost?: (postId: string) => void;
  /** 업주가 본인 홀덤펍 생성 후 목록/프로필 새로고침 */
  onReloadVenues?: () => void;
}

// 커뮤니티 섹션 — 홀덤펍 / 실시간 댓글 / 게시판 / 딜러 / 랭킹 / 업주
// (홀덤 공부는 게시판으로 통합, 도구는 메인 탭으로 분리)
type Section = 'live' | 'board' | 'venues' | 'rank' | 'dealer' | 'owner';
// 다른 메인 탭(중고장터 등)으로 갔다 돌아와도 커뮤니티 섹션이 유지되도록 모듈 레벨에 기억
let lastCommunitySection: Section = 'venues';

// 게시판 카테고리 필터
const BOARD_CATEGORIES: { id: PostCategory | 'all'; label: string }[] = [
  { id: 'all',      label: '전체' },
  { id: 'hand',     label: '핸드 분석' },
  { id: 'tourney',  label: '대회 후기' },
  { id: 'question', label: '질문' },
  { id: 'info',     label: '정보' },
  { id: 'review',   label: '후기' },
  { id: 'free',     label: '자유' },
  { id: 'study',    label: '공부' },
];

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return '방금 전';
  if (diff < 3600)  return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  return `${Math.floor(diff/86400)}일 전`;
}

export default function CommunityTab({
  venues, comments, posts, notices = [], isAdmin = false, onWriteNotice, onSelectNotice,
  onSelectVenue, onSelectPost, onOpenWrite, onLikePost, onDeletePost, onReloadVenues,
}: CommunityTabProps) {
  const [section, setSectionState] = useState<Section>(lastCommunitySection);
  const setSection = (s: Section) => { lastCommunitySection = s; setSectionState(s); };
  const [query, setQuery] = useState('');
  const { user } = useAuth();
  // 데스크탑 게시판 2-pane: 좌측 목록 + 우측 인라인 상세. 모바일은 기존 오버레이 모달(onSelectPost) 사용.
  const isDesktop = useIsDesktop();
  const [boardSelected, setBoardSelected] = useState<CommunityPost | null>(null);
  const canOwnerCommunity = isAdmin || (user?.role === 'venue_owner' && user?.venueVerified === true);

  // 매장 정렬: 1) 유료광고(isPaidAd) → 2) 팔로워수 내림차순
  const sortedVenues = useMemo(() => {
    return venues
      .filter((v) => !query || v.name.includes(query) || v.region.includes(query))
      .map((v) => {
        const venueComments = comments
          .filter((c) => c.venueId === v.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return { venue: v, commentCount: venueComments.length, latest: venueComments[0] };
      })
      .sort((a, b) => {
        // 1순위: 인증 매장(verified) 우선
        const av = a.venue.verificationStatus === 'verified' ? 1 : 0;
        const bv = b.venue.verificationStatus === 'verified' ? 1 : 0;
        if (av !== bv) return bv - av;
        // 2순위: isPaidAd (true가 먼저)
        if (a.venue.isPaidAd !== b.venue.isPaidAd) return a.venue.isPaidAd ? -1 : 1;
        // 3순위: followerCount 내림차순
        return (b.venue.followerCount ?? 0) - (a.venue.followerCount ?? 0);
      });
  }, [venues, comments, query]);

  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts],
  );

  // 게시판 = 전체 글(홀덤 공부 탭을 게시판으로 통합)
  const boardPosts = sortedPosts;

  return (
    <div className="space-y-3">
      {/* 섹션 토글 — 실시간 댓글 / 게시판 / 홀덤 공부 / 홀덤펍 (Task 4) */}
      {/* 스크롤해도 항상 보이도록 헤더+메인탭 바로 아래에 고정 */}
      <div className="sticky top-[calc(theme(spacing.header-h)+theme(spacing.tab-h)-0.5rem)] z-30 -mx-page-x px-page-x bg-surface-base pt-3.5 pb-2 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5 w-max min-w-full">
          <SectionTab active={section === 'venues'} label="커뮤니티"    onClick={() => setSection('venues')} />
          <SectionTab active={section === 'live'}   label="실시간 댓글" onClick={() => setSection('live')} />
          <SectionTab active={section === 'board'}  label="게시판"      onClick={() => setSection('board')} />
          <SectionTab active={section === 'dealer'} label="딜러"        onClick={() => setSection('dealer')} />
          <SectionTab active={section === 'rank'}   label="랭킹"        onClick={() => setSection('rank')} />
          {canOwnerCommunity && (
            <SectionTab active={section === 'owner'} label="업주" onClick={() => setSection('owner')} />
          )}
        </div>
      </div>

      {/* 섹션 콘텐츠 — 게시판은 2-pane 전체폭, 그 외 단일 컬럼은 읽기폭(max-w-3xl)으로 제한 */}
      <div className={section === 'board' ? '' : 'mx-auto w-full max-w-3xl'}>
      {section === 'live' && <LiveWallSection />}

      {section === 'board' && (
        <div className="lg:flex lg:items-start lg:gap-4">
          {/* 좌측: 목록(압축) */}
          <div className="min-w-0 lg:w-[19rem] lg:shrink-0">
            <FeedSection
              posts={boardPosts}
              notices={notices}
              isAdmin={isAdmin}
              onWriteNotice={onWriteNotice}
              onSelectNotice={onSelectNotice}
              onOpenWrite={() => onOpenWrite('free')}
              onLike={onLikePost}
              onSelectPost={isDesktop ? setBoardSelected : onSelectPost}
              selectedId={isDesktop ? boardSelected?.id : undefined}
              placeholder="나누고 싶은 이야기를 적어보세요…"
              emptyText="첫 게시글을 남겨보세요"
              enableCategory
            />
          </div>
          {/* 우측: 게시글 상세(크게) */}
          <aside className="hidden lg:sticky lg:top-[8.5rem] lg:block lg:min-w-0 lg:flex-1">
            {boardSelected ? (
              <PostDetailModal
                inline open
                post={boardSelected}
                onClose={() => setBoardSelected(null)}
                onLike={onLikePost}
                onDelete={onDeletePost ? (id) => { onDeletePost(id); setBoardSelected(null); } : undefined}
                venues={venues}
                onVenueClick={(vid) => { setBoardSelected(null); onSelectVenue(vid); }}
              />
            ) : (
              <div className="flex h-72 items-center justify-center rounded-card border border-dashed border-border-default px-4 text-center text-2xs text-ink-muted">
                왼쪽에서 게시글을 선택하면<br />여기에 상세가 표시됩니다.
              </div>
            )}
          </aside>
        </div>
      )}

      {section === 'venues' && (
        <div className="space-y-3">
          <MyCommunitiesAction onSelectVenue={onSelectVenue} onCreated={onReloadVenues} />
          <VenuesSection
            sortedVenues={sortedVenues}
            query={query}
            onQuery={setQuery}
            onSelectVenue={onSelectVenue}
            onReloadVenues={onReloadVenues}
          />
        </div>
      )}

      {section === 'rank' && <TierLeaderboard />}

      {section === 'dealer' && <DealerCommunity />}

      {section === 'owner' && canOwnerCommunity && <OwnerCommunity />}
      </div>
    </div>
  );
}

// ── 섹션 토글 버튼 ───────────────────────────────────────────────────────────

function SectionTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      // 탭 시 골드 포커스링이 깜빡이지 않도록 클릭 후 포커스 해제
      onClick={(e) => { e.currentTarget.blur(); onClick(); }}
      className={[
        'flex-1 px-2 py-2 text-xs font-semibold rounded-[6px] whitespace-nowrap',
        'transition-colors duration-200 ease-out',
        'focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
        active ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── 전역 피드 ────────────────────────────────────────────────────────────────

function FeedSection({
  posts, notices, isAdmin, onWriteNotice, onSelectNotice, onOpenWrite, onLike, onSelectPost,
  selectedId,
  placeholder = '나누고 싶은 이야기를 적어보세요…', emptyText = '첫 게시글을 남겨보세요',
  enableCategory = false,
}: {
  posts: CommunityPost[];
  notices?: MarketplaceNotice[];
  isAdmin?: boolean;
  onWriteNotice?: () => void;
  onSelectNotice?: (notice: MarketplaceNotice) => void;
  onOpenWrite: () => void;
  onLike: (id: string) => void;
  onSelectPost: (p: CommunityPost) => void;
  /** 데스크탑 2-pane: 현재 열린 게시글 id(목록 하이라이트용) */
  selectedId?: string;
  placeholder?: string;
  emptyText?: string;
  /** 게시판: 카테고리 필터 + HOT(최근 6시간 최다 조회) 노출 */
  enableCategory?: boolean;
}) {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<PostCategory | 'all'>('all');
  const [visible, setVisible] = useState(15);
  // 보기 모드: compact(에펨코리아식 한 줄, 기본) / feed(미리보기 포함)
  const [view, setView] = useState<'compact' | 'feed'>(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem('nuri:board-view') === 'feed') ? 'feed' : 'compact');
  const switchView = (v: 'compact' | 'feed') => { setView(v); try { localStorage.setItem('nuri:board-view', v); } catch { /* noop */ } };

  // HOT: 최근 6시간 내 조회수 상위 2개 (검색·카테고리 미적용 상태에서만 핀 고정)
  const hotPosts = useMemo(() => {
    if (!enableCategory) return [] as CommunityPost[];
    const since = Date.now() - 6 * 3600 * 1000;
    return [...posts]
      .filter((p) => new Date(p.createdAt).getTime() >= since && (p.viewCount ?? 0) > 0)
      .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
      .slice(0, 2);
  }, [posts, enableCategory]);
  const hotIds = useMemo(() => new Set(hotPosts.map((p) => p.id)), [hotPosts]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return posts.filter((p) => {
      if (enableCategory && cat !== 'all' && (p.category ?? 'free') !== cat) return false;
      if (kw && !(p.content.toLowerCase().includes(kw) || (p.title?.toLowerCase().includes(kw) ?? false) || p.userName.toLowerCase().includes(kw))) return false;
      return true;
    });
  }, [posts, q, cat, enableCategory]);

  const pinHot = enableCategory && cat === 'all' && !q.trim() && hotPosts.length > 0;
  const listSource = pinHot ? filtered.filter((p) => !hotIds.has(p.id)) : filtered;
  const shown = listSource.slice(0, visible);

  return (
    <div className="space-y-2">
      {/* 글쓰기 — '글쓰기' 버튼 → 글쓰기 모달(카테고리·제목·내용·이미지) (Stage 2) */}
      {user ? (
        <button
          type="button"
          onClick={onOpenWrite}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-input bg-surface-high border border-border-default hover:border-gold-400/50 transition-colors text-left"
        >
          <span className="text-xs text-ink-muted">{placeholder}</span>
          <span className="shrink-0 inline-flex items-center gap-1 text-2xs font-bold text-gold-300">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            글쓰기
          </span>
        </button>
      ) : (
        <div className="p-2 rounded-input bg-surface-high text-center text-2xs text-ink-muted">
          로그인하면 게시글을 작성할 수 있습니다
        </div>
      )}

      {/* ── 관리자 공지 (게시판 맨 위) ───────────────────────── */}
      {(notices && notices.length > 0) || isAdmin ? (
        <section className="rounded-card border border-gold-400/40 bg-gradient-to-br from-gold-300/[0.06] to-transparent overflow-hidden">
          <header className="flex items-center justify-between px-3 py-2 border-b border-gold-400/20">
            <h2 className="inline-flex items-center gap-1.5 text-xs font-bold text-gold-300">
              공지사항
              {notices && <span className="text-2xs text-ink-muted font-normal">({notices.length})</span>}
            </h2>
            {isAdmin && (
              <button
                type="button"
                onClick={onWriteNotice}
                className="text-2xs text-gold-300 hover:text-gold-200 font-semibold"
              >
                + 공지 작성
              </button>
            )}
          </header>
          {notices && notices.length > 0 ? (
            <ul>
              {notices.map((n) => (
                <li
                  key={n.id}
                  onClick={() => onSelectNotice?.(n)}
                  role={onSelectNotice ? 'button' : undefined}
                  tabIndex={onSelectNotice ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (onSelectNotice && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onSelectNotice(n);
                    }
                  }}
                  className={[
                    'px-3 py-2 border-b border-border-subtle last:border-b-0 transition-colors focus:outline-none',
                    onSelectNotice
                      ? 'hover:bg-surface-high/50 focus-visible:bg-surface-high/50 cursor-pointer'
                      : 'cursor-default',
                  ].join(' ')}
                >
                  <p className="text-xs font-semibold text-ink-primary truncate">{n.title}</p>
                  {n.body && (
                    <p className="text-2xs text-ink-muted line-clamp-1 mt-0.5">{n.body}</p>
                  )}
                  <p className="text-2xs text-ink-muted mt-1">{n.authorName} · {relativeTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-center text-2xs text-ink-muted">등록된 공지가 없습니다</p>
          )}
        </section>
      ) : null}

      {/* 검색 + 카테고리 필터 */}
      {posts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden>
                <circle cx="6" cy="6" r="4.5" /><line x1="9.5" y1="9.5" x2="13" y2="13" />
              </svg>
              <input
                type="search"
                value={q}
                onChange={(e) => { setQ(e.target.value); setVisible(15); }}
                placeholder="게시글 검색 (제목·내용·작성자)"
                className="input w-full pl-9 text-sm"
              />
            </div>
            {/* 보기 모드 토글 — 한 줄 목록 / 미리보기 피드 */}
            <div className="flex shrink-0 rounded-input border border-border-default bg-surface-high p-0.5">
              <button type="button" aria-label="한 줄 목록" title="한 줄 목록"
                onClick={() => switchView('compact')}
                className={['rounded-[6px] px-2 py-1.5 transition-colors', view === 'compact' ? 'bg-surface-float text-gold-300' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
                </svg>
              </button>
              <button type="button" aria-label="미리보기 피드" title="미리보기 피드"
                onClick={() => switchView('feed')}
                className={['rounded-[6px] px-2 py-1.5 transition-colors', view === 'feed' ? 'bg-surface-float text-gold-300' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" />
                </svg>
              </button>
            </div>
          </div>
          {enableCategory && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {BOARD_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCat(c.id); setVisible(15); }}
                  className={[
                    'shrink-0 inline-flex items-center h-7 px-3 rounded-badge text-2xs font-semibold leading-none border transition-colors',
                    cat === c.id
                      ? 'bg-gold-300/20 border-gold-300 text-gold-300'
                      : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary',
                  ].join(' ')}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* HOT — 최근 6시간 최다 조회 글 (게시판 기본 화면) */}
      {pinHot && (
        <div className="rounded-card border border-danger/30 bg-danger/[0.04] overflow-hidden">
          <ul>
            {hotPosts.map((p) => view === 'compact'
              ? <PostRow key={p.id} post={p} hot selected={p.id === selectedId} onClick={() => onSelectPost(p)} />
              : <PostCard key={p.id} post={p} hot selected={p.id === selectedId} onLike={() => onLike(p.id)} onClick={() => onSelectPost(p)} />)}
          </ul>
        </div>
      )}

      {/* 포스트 목록 — 게시판 형태 (조밀하게 많이 보이게) */}
      {posts.length === 0 ? (
        <p className="text-center py-12 text-xs text-ink-muted">{emptyText}</p>
      ) : listSource.length === 0 ? (
        <p className="text-center py-12 text-xs text-ink-muted">{pinHot ? '다른 글이 없습니다' : '검색 결과가 없습니다'}</p>
      ) : (
        <>
          <div className="rounded-card border border-border-default bg-surface-low overflow-hidden">
            <ul>
              {shown.map((p) => view === 'compact'
                ? <PostRow key={p.id} post={p} selected={p.id === selectedId} onClick={() => onSelectPost(p)} />
                : <PostCard key={p.id} post={p} selected={p.id === selectedId} onLike={() => onLike(p.id)} onClick={() => onSelectPost(p)} />)}
            </ul>
          </div>
          {listSource.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + 15)}
              className="w-full py-2.5 rounded-input bg-surface-high text-xs font-semibold text-ink-secondary hover:text-ink-primary active:bg-surface-float transition-colors"
            >
              더보기 ({(listSource.length - visible).toLocaleString()})
            </button>
          )}
        </>
      )}
    </div>
  );
}

// 에펨코리아식 한 줄 행 — 제목 크게(타이포 위계), 메타는 작고 연하게. 바이낸스 표 밀도(py-2).
function PostRow({ post, onClick, hot = false, selected = false }: { post: CommunityPost; onClick: () => void; hot?: boolean; selected?: boolean }) {
  const catLabel = BOARD_CATEGORIES.find((c) => c.id === (post.category ?? 'free'))?.label ?? '자유';
  const { replay, hand } = parseAttachments(post.content);
  return (
    <li
      onClick={onClick}
      aria-current={selected || undefined}
      className={[
        'flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border-subtle last:border-b-0 transition-colors',
        selected ? 'bg-gold-300/10' : 'hover:bg-surface-high/60 active:bg-surface-high',
      ].join(' ')}
    >
      {hot
        ? <span className="shrink-0 rounded-badge bg-danger/15 px-1 text-2xs font-extrabold leading-none tracking-wide text-danger-light">HOT</span>
        : <span className="shrink-0 rounded-badge bg-surface-high px-1 py-0.5 text-2xs font-semibold leading-none text-ink-muted">{catLabel}</span>}
      <span className="min-w-0 flex-1 truncate">
        <span className="text-[15px] font-bold leading-tight text-ink-primary">{post.title || post.content.slice(0, 40)}</span>
        {(replay || hand) && <span className="ml-1 align-middle text-2xs text-gold-300">{replay ? '🎬' : '♠'}</span>}
        {post.commentCount > 0 && <span className="ml-1 align-middle text-xs font-bold text-gold-300">[{post.commentCount}]</span>}
      </span>
      <span className="shrink-0 text-xs text-ink-muted">{post.userName}</span>
      <span className="hidden shrink-0 text-xs tabular-nums text-ink-muted sm:inline">{relativeTime(post.createdAt)}</span>
      {(post.viewCount ?? 0) > 0 && <span className="shrink-0 w-10 text-right text-xs tabular-nums text-ink-muted">👁{post.viewCount}</span>}
    </li>
  );
}

function PostCard({ post, onLike, onClick, hot = false, selected = false }: { post: CommunityPost; onLike: () => void; onClick: () => void; hot?: boolean; selected?: boolean }) {
  return (
    <li
      onClick={onClick}
      aria-current={selected || undefined}
      className={[
        'py-1.5 px-3 transition-colors cursor-pointer border-b border-border-subtle last:border-b-0',
        selected
          ? 'bg-gold-300/10 border-l-2 border-l-gold-300 -ml-px pl-[calc(0.75rem-1px)]'
          : 'hover:bg-surface-high/50 active:bg-surface-high',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <Avatar name={post.userName} src={post.userAvatar} color={post.userColor} size={24} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-2xs flex-wrap">
            {hot && (
              <span className="inline-flex items-center font-extrabold text-danger-light bg-danger/15 px-1 rounded-badge leading-none tracking-wide">HOT</span>
            )}
            <span className="font-semibold text-ink-primary truncate">{post.userName}</span>
            {post.userRole === 'venue_owner' && (
              <span className="font-bold text-gold-300 bg-gold-300/15 px-1 rounded-badge leading-none">업주</span>
            )}
            {post.userRole === 'admin' && (
              <span className="font-bold text-danger-light bg-danger/15 px-1 rounded-badge leading-none">운영자</span>
            )}
            <span className="text-ink-muted ml-auto shrink-0">{relativeTime(post.createdAt)}</span>
          </div>
          {post.title && (
            <p className="text-xs font-bold text-ink-primary mt-0.5 truncate">{post.title}</p>
          )}
          <p className="text-xs text-ink-primary leading-snug line-clamp-2 mt-0.5 break-words">
            {(() => {
              const { text, hand, replay } = parseAttachments(post.content);
              return (
                <>
                  {(hand || replay) && (
                    <span className="inline-flex items-center mr-1 px-1 rounded-badge bg-gold-300/15 text-gold-300 font-bold leading-none align-middle">
                      {replay ? '🎬 리플레이' : '핸드'}
                    </span>
                  )}
                  {text || (replay ? '핸드 리플레이를 공유했습니다' : hand ? '핸드를 공유했습니다' : '')}
                </>
              );
            })()}
          </p>
          <div className="mt-1 flex items-center gap-2.5 text-2xs text-ink-muted">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onLike(); }}
              className="inline-flex items-center gap-1 hover:text-gold-300 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M6.5 11.5L1.5 6.5C0.5 5.5 0.5 3.5 1.5 2.5C2.5 1.5 4.5 1.5 5.5 2.5L6.5 3.5L7.5 2.5C8.5 1.5 10.5 1.5 11.5 2.5C12.5 3.5 12.5 5.5 11.5 6.5L6.5 11.5Z" strokeLinejoin="round" />
              </svg>
              {post.likeCount}
            </button>
            <span className="inline-flex items-center gap-1">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M11 7.5C11 8.5 10.5 9.5 9 9.5H4L2 11.5V3.5C2 2.5 3 1.5 4 1.5H9C10 1.5 11 2.5 11 3.5V7.5Z" strokeLinejoin="round" />
              </svg>
              {post.commentCount}
            </span>
            {(post.viewCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                  <path d="M1 6.5C2.2 4 4.2 2.7 6.5 2.7S10.8 4 12 6.5C10.8 9 8.8 10.3 6.5 10.3S2.2 9 1 6.5Z" /><circle cx="6.5" cy="6.5" r="1.8" />
                </svg>
                {post.viewCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

// ── 매장 커뮤니티 섹션 ───────────────────────────────────────────────────────

// 내 커뮤니티 관리 — 내가 운영(매장+그룹) + 가입한 그룹(탈퇴). 업주는 홀덤펍 생성도.
function MyCommunitiesAction({ onSelectVenue, onCreated }: {
  onSelectVenue: (id: string) => void;
  onCreated?: () => void;
}) {
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [owned, setOwned] = useState<Venue[]>([]);
  const [joined, setJoined] = useState<JoinedGroup[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => {
    getMyOwnedCommunities().then(setOwned).catch(() => {});
    getMyJoinedGroups().then(setJoined).catch(() => {});
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  if (!user) return null;
  const isOwner = user.role === 'venue_owner';
  const hasVenue = owned.some((v) => (v.kind ?? 'venue') === 'venue');

  const createVenue = async () => {
    if (!name.trim() || !region.trim()) { toast.show('매장명과 지역은 필수입니다', 'error'); return; }
    setBusy(true);
    try {
      const id = await createMyVenue({ name, region, address });
      toast.show('홀덤펍 커뮤니티를 생성했습니다', 'success');
      setCreateOpen(false); setName(''); setRegion(''); setAddress('');
      await refreshProfile().catch(() => {});
      onCreated?.(); reload(); onSelectVenue(id);
    } catch (e) { toast.show(e instanceof Error ? e.message : '생성 실패', 'error'); }
    finally { setBusy(false); }
  };
  const leave = async (j: JoinedGroup) => {
    if (!confirm(`'${j.group.name}' 커뮤니티에서 탈퇴하시겠습니까?`)) return;
    try { await removeMember(j.membershipId); toast.show('탈퇴했습니다', 'info'); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); }
  };

  return (
    <div className="rounded-card border border-gold-400/40 bg-gradient-to-br from-gold-300/[0.08] to-transparent">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-gold-300/15 text-gold-300">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink-primary leading-tight">내 커뮤니티 관리</span>
          <span className="block text-2xs text-ink-muted">내가 운영 {owned.length} · 가입한 그룹 {joined.length}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={['shrink-0 text-gold-300 transition-transform duration-200', open ? 'rotate-180' : ''].join(' ')} aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 animate-slide-up">
          <div>
            <p className="text-2xs font-bold text-ink-secondary mb-1">내가 운영 ({owned.length})</p>
            {owned.length === 0 ? (
              <p className="text-2xs text-ink-muted">운영 중인 커뮤니티가 없습니다</p>
            ) : (
              <ul className="space-y-1">
                {owned.map((v) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => onSelectVenue(v.id)} className="w-full flex items-center gap-1.5 rounded-input bg-surface-high px-2.5 py-1.5 text-left hover:bg-surface-float">
                      <span className="shrink-0 rounded-badge bg-gold-300/15 px-1.5 py-0.5 text-2xs font-bold text-gold-300">{GROUP_KIND_LABEL[v.kind ?? 'venue']}</span>
                      <span className="text-xs font-semibold text-ink-primary truncate">{v.name}</span>
                      {!v.approved && <span className="ml-auto shrink-0 text-2xs text-ink-muted">승인 대기</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-2xs font-bold text-ink-secondary mb-1">가입한 그룹 ({joined.length})</p>
            {joined.length === 0 ? (
              <p className="text-2xs text-ink-muted">가입한 그룹이 없습니다</p>
            ) : (
              <ul className="space-y-1">
                {joined.map((j) => (
                  <li key={j.membershipId} className="flex items-center gap-1.5 rounded-input bg-surface-high px-2.5 py-1.5">
                    <button type="button" onClick={() => onSelectVenue(j.group.id)} className="flex items-center gap-1.5 min-w-0 flex-1 text-left">
                      <span className="shrink-0 rounded-badge bg-surface-float px-1.5 py-0.5 text-2xs font-bold text-ink-secondary">{GROUP_KIND_LABEL[j.group.kind ?? 'other']}</span>
                      <span className="text-xs font-semibold text-ink-primary truncate">{j.group.name}</span>
                      {j.status === 'pending' && <span className="text-2xs text-ink-muted">대기</span>}
                    </button>
                    <button type="button" onClick={() => leave(j)} className="shrink-0 text-2xs text-ink-muted hover:text-danger-light">탈퇴</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {isOwner && !hasVenue && (
            !createOpen ? (
              <button type="button" onClick={() => setCreateOpen(true)} className="w-full rounded-input border border-gold-400/40 py-1.5 text-2xs font-bold text-gold-300">+ 홀덤펍 커뮤니티 생성</button>
            ) : (
              <div className="space-y-2 rounded-input border border-border-default p-2.5">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="매장명 (예: 강남 로얄 홀덤)" className="input w-full text-sm" />
                <select value={region} onChange={(e) => setRegion(e.target.value)} className="input w-full text-sm">
                  <option value="">지역 선택 *</option>
                  {REGION_CHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                  <option value="기타">기타</option>
                </select>
                <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={80} placeholder="주소 (선택)" className="input w-full text-sm" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setCreateOpen(false)} className="btn-ghost text-xs px-3">취소</button>
                  <button type="button" onClick={createVenue} disabled={busy} className="btn-primary text-xs px-4 disabled:opacity-60">생성</button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

const VENUE_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '전체' }, { key: 'venue', label: '홀덤펍' },
  { key: 'dealer_team', label: '딜러팀' }, { key: 'club', label: '동호회' }, { key: 'youtuber', label: '유튜버' },
];
function VenuesSection({
  sortedVenues, query, onQuery, onSelectVenue, onReloadVenues,
}: {
  sortedVenues: { venue: Venue; commentCount: number; latest?: Comment }[];
  query: string;
  onQuery: (q: string) => void;
  onSelectVenue: (id: string) => void;
  onReloadVenues?: () => void;
}) {
  const { user } = useAuth();
  const [kindFilter, setKindFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const filtered = kindFilter === 'all' ? sortedVenues : sortedVenues.filter((x) => (x.venue.kind ?? 'venue') === kindFilter);
  return (
    <div className="space-y-3">
      {/* 검색 */}
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="매장명, 지역으로 검색…"
          className="input pl-9"
        />
        <svg
          width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
          aria-hidden
        >
          <circle cx="8" cy="8" r="5.5" />
          <line x1="12.5" y1="12.5" x2="16" y2="16" />
        </svg>
      </div>

      {/* 종류 필터 + 그룹 만들기 */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {VENUE_FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setKindFilter(f.key)}
            className={['shrink-0 rounded-badge px-2.5 py-1 text-2xs font-bold border transition-colors',
              kindFilter === f.key ? 'bg-gold-300 text-ink-inverse border-gold-300' : 'bg-surface-high text-ink-secondary border-border-default hover:text-ink-primary'].join(' ')}>
            {f.label}
          </button>
        ))}
        {user && (
          <button type="button" onClick={() => setCreateOpen(true)} className="ml-auto shrink-0 rounded-badge px-2.5 py-1 text-2xs font-bold border border-gold-400/50 text-gold-300 hover:bg-gold-300/10">+ 그룹 만들기</button>
        )}
      </div>

      <p className="text-2xs text-ink-muted text-center py-1">
        홀덤펍·딜러팀·동호회·유튜버 그룹을 선택해 커뮤니티를 이용하세요
      </p>

      {/* 정렬 안내 */}
      <div className="flex items-center gap-2 text-2xs text-ink-muted">
        <span>정렬:</span>
        <span className="text-gold-300 font-semibold">유료광고</span>
        <span className="text-border-strong">→</span>
        <span className="text-ink-secondary">팔로워순</span>
      </div>

      {/* 리스트 */}
      {filtered.length === 0 ? (
        <p className="text-center py-12 text-xs text-ink-muted">결과가 없습니다</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(({ venue, commentCount, latest }) => (
            <li key={venue.id}>
              <button
                type="button"
                onClick={() => onSelectVenue(venue.id)}
                className={[
                  'w-full text-left flex gap-3 p-3 rounded-card border transition-all duration-150 cursor-pointer active:bg-surface-high',
                  venue.isPaidAd
                    ? 'bg-surface-low border-gold-400/50 shadow-gold hover:border-gold-400'
                    : 'bg-surface-low border-border-default hover:border-border-strong hover:bg-surface-high',
                ].join(' ')}
              >
                {/* 매장 아이콘 */}
                <div
                  className="w-12 h-12 shrink-0 rounded-card flex items-center justify-center text-lg font-bold text-white relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${venue.themeColor ?? '#5A6175'}, #0a0c0f)` }}
                  aria-hidden
                >
                  <span className="opacity-30 text-2xl absolute -top-1 -left-1">♠</span>
                  <span className="relative text-base">{venue.name[0]}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        {venue.isPaidAd && (
                          <span className="rounded-badge bg-gold-300 px-1.5 py-0.5 text-2xs font-bold text-ink-inverse leading-none">
                            AD
                          </span>
                        )}
                        {venue.verificationStatus === 'verified' && (
                          <span className="inline-flex items-center gap-0.5 rounded-badge border border-gold-400/50 bg-gold-300/15 px-1.5 py-0.5 text-2xs font-bold text-gold-300 leading-none">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
                            인증
                          </span>
                        )}
                        <p className="text-sm font-semibold text-ink-primary truncate">{venue.name}</p>
                      </div>
                      <p className="text-2xs text-ink-muted truncate">
                        {venue.region}
                        {venue.followerCount !== undefined && (
                          <> · 팔로워 {venue.followerCount.toLocaleString()}</>
                        )}
                      </p>
                    </div>
                    {commentCount > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-2xs text-gold-300 font-semibold">
                        댓글 {commentCount}
                      </span>
                    )}
                  </div>

                  {latest && (
                    <div className="mt-1.5 px-2 py-1.5 bg-surface-base/50 rounded-input border-l-2 border-gold-400/40">
                      <p className="text-2xs text-ink-muted leading-tight">
                        <span className={[
                          'font-semibold',
                          latest.isOwner ? 'text-gold-300' : 'text-ink-secondary',
                        ].join(' ')}>
                          {latest.userName}
                          {latest.isOwner && ' (매장)'}
                        </span>
                        <span className="mx-1">·</span>
                        {relativeTime(latest.createdAt)}
                      </p>
                      <p className="text-xs text-ink-secondary line-clamp-1 mt-0.5">
                        {latest.content}
                      </p>
                    </div>
                  )}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="self-center shrink-0 text-ink-muted" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {createOpen && <CreateGroupModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); onReloadVenues?.(); }} />}
    </div>
  );
}

// ── 그룹 만들기 모달(운영자 승인 후 공개) ─────────────────────────────────────
function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('dealer_team');
  const [region, setRegion] = useState('');
  const [description, setDescription] = useState('');
  const [joinApproval, setJoinApproval] = useState(true);
  const [sending, setSending] = useState(false);
  const KINDS: GroupKind[] = ['dealer_team', 'club', 'youtuber', 'other'];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.show('그룹 이름을 입력해 주세요', 'error'); return; }
    setSending(true);
    try {
      await createGroup({ name, kind, region, description, joinApproval });
      toast.show('그룹 개설을 신청했습니다. 운영자 승인 후 공개됩니다.', 'success');
      onCreated();
    } catch (err) { toast.show(err instanceof Error ? err.message : '개설 실패', 'error'); }
    finally { setSending(false); }
  };

  return (
    <Modal open onClose={onClose} title="그룹 만들기" maxWidth="sm">
      <form onSubmit={submit} className="p-4 space-y-3">
        <div>
          <span className="block text-2xs text-ink-secondary mb-1">종류</span>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={['rounded-badge border px-3 py-1.5 text-xs font-semibold transition-colors',
                  kind === k ? 'bg-gold-300 text-ink-inverse border-gold-300' : 'bg-surface-high text-ink-secondary border-border-default'].join(' ')}>
                {GROUP_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="block text-2xs text-ink-secondary mb-1">그룹 이름 <span className="text-danger">*</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="예: 강남 딜러팀" className="input w-full text-sm" />
        </label>
        <label className="block">
          <span className="block text-2xs text-ink-secondary mb-1">지역 (선택)</span>
          <input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={20} placeholder="예: 서울" className="input w-full text-sm" />
        </label>
        <label className="block">
          <span className="block text-2xs text-ink-secondary mb-1">소개 (선택)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="그룹 소개를 적어주세요" className="input w-full resize-none text-sm" />
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={joinApproval} onChange={(e) => setJoinApproval(e.target.checked)} className="accent-gold-300" />
          <span className="text-xs text-ink-secondary">가입 시 내 승인 필요 (해제 시 누구나 즉시 가입)</span>
        </label>
        <p className="text-2xs text-ink-muted">개설하면 내가 매니저가 되며, 운영자 승인 후 목록에 공개됩니다.</p>
        <button type="submit" disabled={sending || !name.trim()} className="btn-primary w-full disabled:opacity-60">{sending ? '신청 중…' : '개설 신청'}</button>
      </form>
    </Modal>
  );
}

// ── 실시간 댓글 (한 줄 라이브 월) ──────────────────────────────────────────────
// 제목 없이 짧게(최대 140자) 올리는 실시간 보드. Supabase Realtime 구독으로 즉시 수신.
function LiveWallSection() {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [draft,    setDraft]    = useState('');
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);

  useEffect(() => {
    let active = true;
    getLiveMessages(50)
      .then((m) => { if (active) setMessages(m); })
      .catch(() => { /* 조회 실패 시 빈 목록 유지 */ })
      .finally(() => { if (active) setLoading(false); });
    // 실시간 수신 — 새 메시지 prepend (id 중복 방지)
    const unsub = subscribeLiveWall((msg) => {
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [msg, ...prev]));
    });
    return () => { active = false; unsub(); };
  }, []);

  const canDelete = (m: LiveMessage) => !!user && (user.id === m.userId || user.role === 'admin');
  const remove = async (m: LiveMessage) => {
    try { await deleteLiveMessage(m.id); setMessages((prev) => prev.filter((x) => x.id !== m.id)); }
    catch (err) { toast.show(err instanceof Error ? err.message : '삭제에 실패했습니다', 'error'); }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.show('로그인이 필요합니다', 'error');
    const body = draft.trim();
    if (!body) return;
    const check = filterContent(body);
    if (check.blocked) return toast.show(check.reason!, 'error');

    setSending(true);
    try {
      const msg = await addLiveMessage({
        userId:    user.id,
        userName:  user.nickname ?? user.name,
        userRole:  user.role,
        userColor: user.avatarColor,
        content:   body,
      });
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [msg, ...prev]));
      setDraft('');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '전송에 실패했습니다', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      {user ? (
        <form onSubmit={send} className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={140}
            placeholder="한 줄로 빠르게 (최대 140자)"
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="btn-primary px-4 shrink-0 disabled:opacity-50"
          >
            {sending ? '…' : '전송'}
          </button>
        </form>
      ) : (
        <div className="p-2 rounded-input bg-surface-high text-center text-2xs text-ink-muted">
          로그인하면 실시간 댓글을 남길 수 있습니다
        </div>
      )}

      {loading ? (
        <p className="text-center py-12 text-xs text-ink-muted">불러오는 중…</p>
      ) : messages.length === 0 ? (
        <p className="text-center py-12 text-xs text-ink-muted">첫 한 줄을 남겨보세요</p>
      ) : (
        <ul className="space-y-1">
          {messages.map((m) => (
            <li key={m.id} className="flex items-start gap-2 px-2.5 py-1.5 rounded-input bg-surface-low border border-border-subtle">
              <Avatar name={m.userName} src={m.userAvatar} color={m.userColor} size={24} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-2xs">
                  <span className="font-semibold text-ink-primary truncate">{m.userName}</span>
                  {m.userRole === 'venue_owner' && (
                    <span className="font-bold text-gold-300 bg-gold-300/15 px-1 rounded-badge leading-none">업주</span>
                  )}
                  {m.userRole === 'admin' && (
                    <span className="font-bold text-danger-light bg-danger/15 px-1 rounded-badge leading-none">운영자</span>
                  )}
                  <span className="text-ink-muted ml-auto shrink-0">{relativeTime(m.createdAt)}</span>
                  {canDelete(m) && (
                    <button type="button" onClick={() => remove(m)} aria-label="삭제"
                      className="shrink-0 text-ink-muted hover:text-danger-light leading-none">
                      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
                    </button>
                  )}
                </div>
                <p className="text-xs text-ink-primary leading-snug mt-0.5 break-words">{m.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
