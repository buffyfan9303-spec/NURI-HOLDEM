import { memo, useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type {
  ListingCategory, ListingCondition, ListingStatus,
  MarketplaceListing, MarketplaceNotice, NoticeType,
} from '../../api/marketplace';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlockContext';
import { getMyChatThreads } from '../../api/chat';
import { MessagesModal, MyListingsModal } from './MyMarketModal';

// ── 상수 ─────────────────────────────────────────────────────────────────────

// [UI/UX 점검 및 자가 진단] 카테고리(요구사항 4): '게임머니' 삭제 → [전체, 용품, 아이템, 기타]
//  id 매핑: all / pokerGear(용품) / item(아이템·신규) / etc(기타).
//  item은 신규 카테고리 → 데이터 없으면 빈 결과만 반환(런타임 오류 없음).
//  기존 gameMoney 데이터는 어느 탭에도 안 잡히나, '아이템'으로 마이그레이션은 Stage 2 글쓰기에서 처리.
const CATEGORIES: { id: ListingCategory | 'all'; label: string }[] = [
  { id: 'all',       label: '전체'   },
  { id: 'pokerGear', label: '용품'   },
  { id: 'item',      label: '아이템' },
  { id: 'etc',       label: '기타'   },
];

const CONDITION_COLOR: Record<ListingCondition, string> = {
  S: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  A: 'bg-blue-500/15    text-blue-400    border-blue-500/30',
  B: 'bg-amber-500/15   text-amber-400   border-amber-500/30',
  C: 'bg-danger/15      text-danger-light border-danger/30',
};

const STATUS_MAP: Record<ListingStatus, { label: string; cls: string }> = {
  on_sale:  { label: '판매중',   cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  reserved: { label: '예약중',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30'      },
  sold:     { label: '거래완료', cls: 'bg-surface-float text-ink-muted border-border-default'   },
};

const NOTICE_STYLE: Record<NoticeType, { icon: string; cls: string; iconBg: string }> = {
  pinned:  { icon: '공', cls: 'border-accent-400/40    bg-accent-300/[0.06]',    iconBg: 'bg-accent-300/20 text-accent-300' },
  event:   { icon: '이', cls: 'border-blue-500/40    bg-blue-500/[0.06]',    iconBg: 'bg-blue-500/20 text-blue-400' },
  caution: { icon: '주', cls: 'border-amber-500/40   bg-amber-500/[0.06]',   iconBg: 'bg-amber-500/20 text-amber-400' },
};

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return '방금';
  if (diff < 3600)  return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  return `${Math.floor(diff/86400)}일 전`;
}

// ── 메인 ────────────────────────────────────────────────────────────────────

interface MarketplaceTabProps {
  listings: MarketplaceListing[];
  notices: MarketplaceNotice[];
  onSelect: (listing: MarketplaceListing) => void;
  onSelectNotice: (notice: MarketplaceNotice) => void;
  onCreate?: () => void;
  /** 관리자만 공지 작성 가능 */
  canWriteNotice?: boolean;
  onWriteNotice?: () => void;
  /** 내 판매목록에서 상태/삭제 변경 시 목록 새로고침 */
  onListingsChanged?: () => void;
  /** 최초 목록 로딩 중 — 빈 화면 깜빡임 대신 스켈레톤 표시 */
  loading?: boolean;
}

type SortBy = 'recent' | 'popular';

function MarketplaceTab({
  listings, notices, onSelect, onSelectNotice, onCreate,
  canWriteNotice = false, onWriteNotice, onListingsChanged, loading = false,
}: MarketplaceTabProps) {
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const [category, setCategory]       = useState<ListingCategory | 'all'>('all');
  const [includeSold, setIncludeSold] = useState(false);
  const [query, setQuery]             = useState('');
  const [sortBy, setSortBy]           = useState<SortBy>('recent');
  const [myListOpen, setMyListOpen]   = useState(false);
  const [msgOpen, setMsgOpen]         = useState(false);
  const [msgCount, setMsgCount]       = useState(0);

  // 메시지함 대화 수(배지)
  useEffect(() => {
    if (!user) { setMsgCount(0); return; }
    getMyChatThreads().then((t) => setMsgCount(t.reduce((s, x) => s + (x.unread || 0), 0))).catch(() => {});
  }, [user, msgOpen]);

  const visible = useMemo(() => {
    const filtered = listings.filter((l) => {
      if (isBlocked(l.sellerId))                          return false; // 차단한 판매자 숨김
      if (category !== 'all' && l.category !== category) return false;
      if (!includeSold && l.status === 'sold')           return false;
      if (query && !l.title.includes(query))             return false;
      return true;
    });
    return [...filtered].sort((a, b) =>
      sortBy === 'recent'
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : b.viewCount - a.viewCount,
    );
  }, [listings, category, includeSold, query, sortBy, isBlocked]);

  const [limit, setLimit] = useState(20);
  useEffect(() => { setLimit(20); }, [category, includeSold, query, sortBy]);
  const shown = visible.slice(0, limit);

  return (
    <div className="space-y-3">
      {/* ── 공지 게시판 ────────────────────────────────────────────── */}
      {(notices.length > 0 || canWriteNotice) && (
        <NoticeBoard
          notices={notices}
          canWrite={canWriteNotice}
          onWrite={onWriteNotice}
          onSelect={onSelectNotice}
        />
      )}

      {/* ── 내 거래(판매목록 · 메시지함) ─────────────────────────── */}
      {user && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setMyListOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-input bg-surface-high border border-border-default text-xs font-semibold text-ink-secondary hover:text-ink-primary transition-colors">
            <span aria-hidden>📦</span> 내 판매목록
          </button>
          <button type="button" onClick={() => setMsgOpen(true)}
            className="flex-1 relative flex items-center justify-center gap-1.5 py-2 rounded-input bg-surface-high border border-border-default text-xs font-semibold text-ink-secondary hover:text-ink-primary transition-colors">
            <span aria-hidden>💬</span> 메시지함
            {msgCount > 0 && <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-accent-300 text-white text-[10px] font-bold tabular-nums">{msgCount}</span>}
          </button>
        </div>
      )}

      {/* ── 액션 바 (검색 + 글쓰기) ────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목으로 검색…"
            className="input pl-9"
          />
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="btn-primary text-xs px-3 shrink-0"
        >
          글쓰기
        </button>
      </div>

      {/* ── 카테고리 — 가로 스크롤(번개장터식, 줄바꿈 없음) ───────── */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none [-webkit-overflow-scrolling:touch]">
        {CATEGORIES.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={[
                'relative shrink-0 h-9 px-4 rounded-input text-xs font-semibold transition-colors',
                active
                  ? 'text-ink-inverse'
                  : 'bg-surface-high text-ink-secondary hover:text-ink-primary border border-border-default',
              ].join(' ')}
            >
              {active && (
                <motion.span layoutId="market-cat-pill" aria-hidden
                  className="absolute inset-0 rounded-input bg-accent-300"
                  transition={{ type: 'spring', stiffness: 700, damping: 42 }} />
              )}
              <span className="relative">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── 정렬·필터 바 ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 text-2xs">
        <div className="flex items-center gap-1">
          <SortPill active={sortBy === 'recent'}  onClick={() => setSortBy('recent')}  label="최신순"   />
          <SortPill active={sortBy === 'popular'} onClick={() => setSortBy('popular')} label="조회수순" />
          <span className="ml-2 text-ink-muted">
            <input
              id="includeSold"
              type="checkbox"
              checked={includeSold}
              onChange={(e) => setIncludeSold(e.target.checked)}
              className="accent-accent-300 mr-1 align-middle"
            />
            <label htmlFor="includeSold" className="cursor-pointer">거래완료 포함</label>
          </span>
        </div>
        <span className="text-ink-muted tabular-nums">총 {visible.length}건</span>
      </div>

      {/* ── 매물 목록: 게시판(리스트) 전용 ───────────────────────── */}
      {loading && listings.length === 0 ? (
        // 스켈레톤 — 최초 로딩 시 빈 화면/깜빡임 대신 게시판 행 형태의 시머 로더
        <div className="rounded-card border border-border-default bg-surface-low overflow-hidden" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border-subtle px-3 py-2.5 last:border-b-0">
              <div className="skeleton h-10 w-10 shrink-0 rounded-input" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="skeleton h-3 rounded" style={{ width: `${[70, 55, 64, 48, 60, 52, 68][i]}%` }} />
                <div className="skeleton h-2.5 rounded" style={{ width: `${[35, 42, 30, 38, 33, 40, 36][i]}%` }} />
              </div>
              <div className="skeleton h-3.5 w-12 shrink-0 rounded" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-card border border-border-default bg-surface-low py-16 text-center text-xs text-ink-muted">
          조건에 맞는 글이 없습니다
        </div>
      ) : (
        <div className="rounded-card border border-border-default bg-surface-low overflow-hidden">
          <BoardHeader />
          <ul>
            {shown.map((l, idx) => (
              <ListingRow
                key={l.id}
                listing={l}
                index={idx + 1}
                onClick={() => onSelect(l)}
              />
            ))}
          </ul>
        </div>
      )}

      {visible.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((v) => v + 20)}
          className="w-full py-2.5 rounded-input bg-surface-high text-xs font-semibold text-ink-secondary hover:text-ink-primary active:bg-surface-float transition-colors"
        >
          더보기 ({(visible.length - limit).toLocaleString()})
        </button>
      )}

      <MyListingsModal open={myListOpen} onClose={() => setMyListOpen(false)}
        onOpenListing={(l) => { setMyListOpen(false); onSelect(l); }}
        onChanged={onListingsChanged} />
      <MessagesModal open={msgOpen} onClose={() => setMsgOpen(false)} />
    </div>
  );
}

// ── 공지 게시판 ──────────────────────────────────────────────────────────────

function NoticeBoard({
  notices, canWrite, onWrite, onSelect,
}: {
  notices: MarketplaceNotice[];
  canWrite?: boolean;
  onWrite?: () => void;
  onSelect: (n: MarketplaceNotice) => void;
}) {
  return (
    <section className="rounded-card border border-accent-400/30 bg-gradient-to-br from-accent-300/[0.05] to-transparent overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 border-b border-accent-400/20">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-300">
          공지사항
          <span className="text-2xs text-ink-muted font-normal">({notices.length})</span>
        </h2>
        {canWrite && (
          <button
            type="button"
            onClick={onWrite}
            className="text-2xs text-accent-300 hover:text-accent-200 font-semibold"
          >
            + 공지 작성
          </button>
        )}
      </header>
      {notices.length === 0 ? (
        <p className="py-4 text-center text-2xs text-ink-muted">등록된 공지가 없습니다</p>
      ) : (
        <ul>
          {notices.map((n) => {
            const style = NOTICE_STYLE[n.type];
            return (
              <li key={n.id} className="border-b border-border-subtle last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(n)}
                  className="w-full text-left flex items-start gap-2 px-3 py-2 hover:bg-surface-high/50 transition-colors"
                >
                  <span className={[
                    'shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs',
                    style.iconBg,
                  ].join(' ')}>
                    {style.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-ink-primary truncate">{n.title}</p>
                      <span className="shrink-0 text-2xs text-ink-muted">
                        {relativeTime(n.createdAt)}
                      </span>
                    </div>
                    {n.body && (
                      <p className="mt-0.5 text-2xs text-ink-muted line-clamp-2 leading-snug">
                        {n.body}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── 게시판 헤더 (sm 이상에서 컬럼 라벨) ─────────────────────────────────────

function BoardHeader() {
  return (
    <div className="hidden sm:grid grid-cols-[3rem_1fr_5rem_6rem_5rem_5rem] gap-2 px-3 py-2 border-b border-border-default bg-surface-mid text-2xs font-semibold text-ink-muted uppercase tracking-wider">
      <span className="text-center">#</span>
      <span>제목</span>
      <span className="text-right">가격</span>
      <span>판매자</span>
      <span className="text-right">조회</span>
      <span className="text-right">등록</span>
    </div>
  );
}

// ── 정렬 칩 ─────────────────────────────────────────────────────────────────

function SortPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2 py-0.5 rounded-badge transition-colors',
        active ? 'text-accent-300 font-bold' : 'text-ink-muted hover:text-ink-secondary',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── 단일 게시글 행 ──────────────────────────────────────────────────────────

function ListingRow({
  listing, index, onClick,
}: { listing: MarketplaceListing; index: number; onClick: () => void }) {
  const status = STATUS_MAP[listing.status];
  const isSold = listing.status === 'sold';

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={[
          'w-full text-left',
          'grid grid-cols-[1fr_auto] sm:grid-cols-[3rem_1fr_5rem_6rem_5rem_5rem]',
          'gap-2 px-3 py-2.5 items-center',
          'border-b border-border-subtle last:border-b-0',
          'hover:bg-surface-high active:bg-surface-high transition-colors cursor-pointer',
          isSold && 'opacity-50',
        ].filter(Boolean).join(' ')}
      >
        {/* # 번호 (sm 이상) */}
        <span className="hidden sm:block text-center text-2xs text-ink-muted tabular-nums">
          {index}
        </span>

        {/* 제목 영역 */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={[
              'inline-flex items-center rounded-badge border px-1 py-0.5 text-2xs font-bold leading-none',
              CONDITION_COLOR[listing.condition],
            ].join(' ')}>
              {listing.condition}
            </span>
            {listing.status !== 'on_sale' && (
              <span className={[
                'inline-flex items-center rounded-badge border px-1.5 py-0.5 text-2xs font-bold leading-none',
                status.cls,
              ].join(' ')}>
                {status.label}
              </span>
            )}
            <span className="text-2xs text-ink-muted">{listing.region}</span>
          </div>
          <p className={[
            'mt-0.5 text-sm font-medium leading-snug truncate',
            isSold ? 'text-ink-muted line-through decoration-1' : 'text-ink-primary',
          ].join(' ')}>
            {listing.title}
            {listing.commentCount > 0 && (
              <span className="ml-1.5 text-2xs text-accent-300 font-bold align-middle">
                [{listing.commentCount}]
              </span>
            )}
          </p>
          {/* 모바일에서는 가격·판매자·시간을 제목 아래에 1줄로 압축 */}
          <div className="sm:hidden flex items-center gap-2 mt-1 text-2xs">
            <span className="font-bold text-ink-primary tabular-nums">
              {listing.price.toLocaleString()}
            </span>
            <span className="text-border-strong">·</span>
            <span className="text-ink-muted truncate">{listing.sellerName}</span>
            <span className="text-border-strong">·</span>
            <span className="text-ink-muted shrink-0">{relativeTime(listing.createdAt)}</span>
          </div>
        </div>

        {/* sm 이상에서만 보이는 컬럼들 */}
        <span className="hidden sm:block text-right text-sm font-bold text-ink-primary tabular-nums">
          {listing.price.toLocaleString()}
        </span>
        <span className="hidden sm:flex items-center gap-1 text-xs">
          <span
            className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
            style={{ background: listing.sellerAvatarColor }}
          >
            {listing.sellerName[0]}
          </span>
          <span className="text-ink-secondary truncate">{listing.sellerName}</span>
        </span>
        <span className="hidden sm:block text-right text-2xs text-ink-muted tabular-nums">
          {listing.viewCount.toLocaleString()}
        </span>
        <span className="hidden sm:block text-right text-2xs text-ink-muted">
          {relativeTime(listing.createdAt)}
        </span>
      </button>
    </li>
  );
}

// ── 아이콘 ─────────────────────────────────────────────────────────────────

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 18 18"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden
    >
      <circle cx="8" cy="8" r="5.5" />
      <line x1="12.5" y1="12.5" x2="16" y2="16" />
    </svg>
  );
}

export { CATEGORIES, CONDITION_COLOR, STATUS_MAP, relativeTime };

// (A2) 장터 탭 memo — App 무관 재렌더 차단. props는 App에서 안정화(marketNotices·handleMarketCreate 등).
export default memo(MarketplaceTab);
