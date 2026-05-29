import { useState, useMemo } from 'react';
import type { Venue, Comment, CommunityPost } from '../../api/community';
import type { MarketplaceNotice } from '../../api/marketplace';
import { useAuth } from '../../contexts/AuthContext';
import { filterContent } from '../../lib/content-filter';
import { useToast } from '../atoms/Toast';

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
  onPostSubmit: (content: string) => void;
  onLikePost: (postId: string) => void;
}

type Section = 'feed' | 'venues';

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return '방금 전';
  if (diff < 3600)  return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  return `${Math.floor(diff/86400)}일 전`;
}

export default function CommunityTab({
  venues, comments, posts, notices = [], isAdmin = false, onWriteNotice, onSelectNotice,
  onSelectVenue, onSelectPost, onPostSubmit, onLikePost,
}: CommunityTabProps) {
  const [section, setSection] = useState<Section>('feed');
  const [query, setQuery] = useState('');

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
        // 1순위: isPaidAd (true가 먼저)
        if (a.venue.isPaidAd !== b.venue.isPaidAd) return a.venue.isPaidAd ? -1 : 1;
        // 2순위: followerCount 내림차순
        return (b.venue.followerCount ?? 0) - (a.venue.followerCount ?? 0);
      });
  }, [venues, comments, query]);

  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts],
  );

  return (
    <div className="space-y-3">
      {/* 섹션 토글 — 전역 피드 vs 매장 목록 */}
      <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5">
        <SectionTab active={section === 'feed'}   label="전역 피드"   onClick={() => setSection('feed')} />
        <SectionTab active={section === 'venues'} label="매장 커뮤니티" onClick={() => setSection('venues')} />
      </div>

      {section === 'feed' ? (
        <FeedSection
          posts={sortedPosts}
          notices={notices}
          isAdmin={isAdmin}
          onWriteNotice={onWriteNotice}
          onSelectNotice={onSelectNotice}
          onSubmit={onPostSubmit}
          onLike={onLikePost}
          onSelectPost={onSelectPost}
        />
      ) : (
        <VenuesSection
          sortedVenues={sortedVenues}
          query={query}
          onQuery={setQuery}
          onSelectVenue={onSelectVenue}
        />
      )}
    </div>
  );
}

// ── 섹션 토글 버튼 ───────────────────────────────────────────────────────────

function SectionTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 py-2 text-xs font-semibold rounded-[6px] transition-all focus:outline-none',
        active ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── 전역 피드 ────────────────────────────────────────────────────────────────

function FeedSection({
  posts, notices, isAdmin, onWriteNotice, onSelectNotice, onSubmit, onLike, onSelectPost,
}: {
  posts: CommunityPost[];
  notices?: MarketplaceNotice[];
  isAdmin?: boolean;
  onWriteNotice?: () => void;
  onSelectNotice?: (notice: MarketplaceNotice) => void;
  onSubmit: (content: string) => void;
  onLike: (id: string) => void;
  onSelectPost: (p: CommunityPost) => void;
}) {
  const { user } = useAuth();
  const toast    = useToast();
  const [draft, setDraft] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const check = filterContent(draft.trim());
    if (check.blocked) {
      toast.show(check.reason!, 'error');
      return;
    }
    onSubmit(draft.trim());
    setDraft('');
  };

  return (
    <div className="space-y-2">
      {/* 글쓰기 박스 — 컴팩트 한 줄 */}
      {user ? (
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="짧은 이야기를 남겨보세요..."
            className="input flex-1"
          />
          <button type="submit" className="btn-primary text-xs" disabled={!draft.trim()}>
            게시
          </button>
        </form>
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
              📢 운영자 공지
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
                  <p className="text-xs font-semibold text-ink-primary truncate">📌 {n.title}</p>
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

      {/* 포스트 목록 — 게시판 형태 (조밀하게 많이 보이게) */}
      {posts.length === 0 ? (
        <p className="text-center py-12 text-xs text-ink-muted">첫 게시글을 남겨보세요</p>
      ) : (
        <div className="rounded-card border border-border-default bg-surface-low overflow-hidden">
          <ul>
            {posts.map((p) => (
              <PostCard key={p.id} post={p} onLike={() => onLike(p.id)} onClick={() => onSelectPost(p)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PostCard({ post, onLike, onClick }: { post: CommunityPost; onLike: () => void; onClick: () => void }) {
  return (
    <li
      onClick={onClick}
      className="py-2 px-3 hover:bg-surface-high/50 transition-colors cursor-pointer border-b border-border-subtle last:border-b-0"
    >
      <div className="flex items-start gap-2">
        <div
          className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-2xs font-bold text-white mt-0.5"
          style={{ background: post.userColor ?? '#5A6175' }}
        >
          {post.userName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-2xs flex-wrap">
            <span className="font-semibold text-ink-primary truncate">{post.userName}</span>
            {post.userRole === 'venue_owner' && (
              <span className="font-bold text-gold-300 bg-gold-300/15 px-1 rounded-badge leading-none">업주</span>
            )}
            {post.userRole === 'admin' && (
              <span className="font-bold text-danger-light bg-danger/15 px-1 rounded-badge leading-none">운영자</span>
            )}
            <span className="text-ink-muted ml-auto shrink-0">{relativeTime(post.createdAt)}</span>
          </div>
          <p className="text-xs text-ink-primary leading-snug line-clamp-2 mt-0.5 break-words">
            {post.content}
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
          </div>
        </div>
      </div>
    </li>
  );
}

// ── 매장 커뮤니티 섹션 ───────────────────────────────────────────────────────

function VenuesSection({
  sortedVenues, query, onQuery, onSelectVenue,
}: {
  sortedVenues: { venue: Venue; commentCount: number; latest?: Comment }[];
  query: string;
  onQuery: (q: string) => void;
  onSelectVenue: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {/* 검색 */}
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="매장명, 지역으로 검색..."
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

      <p className="text-2xs text-ink-muted text-center py-1">
        💬 매장을 선택해 커뮤니티에서 실시간으로 대화하세요
      </p>

      {/* 정렬 안내 */}
      <div className="flex items-center gap-2 text-2xs text-ink-muted">
        <span>정렬:</span>
        <span className="text-gold-300 font-semibold">유료광고</span>
        <span className="text-border-strong">→</span>
        <span className="text-ink-secondary">팔로워순</span>
      </div>

      {/* 매장 리스트 */}
      {sortedVenues.length === 0 ? (
        <p className="text-center py-12 text-xs text-ink-muted">검색 결과가 없습니다</p>
      ) : (
        <ul className="space-y-2">
          {sortedVenues.map(({ venue, commentCount, latest }) => (
            <li key={venue.id}>
              <button
                type="button"
                onClick={() => onSelectVenue(venue.id)}
                className={[
                  'w-full text-left flex gap-3 p-3 rounded-card border transition-all duration-150 cursor-pointer',
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
                        💬 {commentCount}
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
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
