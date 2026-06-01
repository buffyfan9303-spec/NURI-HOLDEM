import { useMemo, useState } from 'react';
import type {
  ListingCategory, ListingCondition, ListingStatus,
  MarketplaceListing, MarketplaceNotice, NoticeType,
} from '../../api/marketplace';

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
  pinned:  { icon: '📌', cls: 'border-gold-400/40    bg-gold-300/[0.06]',    iconBg: 'bg-gold-300/20 text-gold-300' },
  event:   { icon: '🎉', cls: 'border-blue-500/40    bg-blue-500/[0.06]',    iconBg: 'bg-blue-500/20 text-blue-400' },
  caution: { icon: '⚠',  cls: 'border-amber-500/40   bg-amber-500/[0.06]',   iconBg: 'bg-amber-500/20 text-amber-400' },
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
}

type SortBy = 'recent' | 'popular';

export default function MarketplaceTab({
  listings, notices, onSelect, onSelectNotice, onCreate,
  canWriteNotice = false, onWriteNotice,
}: MarketplaceTabProps) {
  const [category, setCategory]       = useState<ListingCategory | 'all'>('all');
  const [includeSold, setIncludeSold] = useState(false);
  const [query, setQuery]             = useState('');
  const [sortBy, setSortBy]           = useState<SortBy>('recent');

  const visible = useMemo(() => {
    const filtered = listings.filter((l) => {
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
  }, [listings, category, includeSold, query, sortBy]);

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

      {/* ── 액션 바 (검색 + 글쓰기) ────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목으로 검색..."
            className="input pl-9"
          />
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="btn-primary text-xs px-3 shrink-0"
        >
          ✎ 글쓰기
        </button>
      </div>

      {/* ── 카테고리 4분할 (한 줄에 모두 표시) ───────────────────── */}
      <div className="grid grid-cols-4 gap-1">
        {CATEGORIES.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={[
                'h-9 rounded-input text-xs font-semibold transition-colors',
                active
                  ? 'bg-gold-300 text-ink-inverse'
                  : 'bg-surface-high text-ink-secondary hover:text-ink-primary border border-border-default',
              ].join(' ')}
            >
              {cat.label}
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
              className="accent-gold-300 mr-1 align-middle"
            />
            <label htmlFor="includeSold" className="cursor-pointer">거래완료 포함</label>
          </span>
        </div>
        <span className="text-ink-muted tabular-nums">총 {visible.length}건</span>
      </div>

      {/* ── 게시판 (테이블 헤더 + 행) ──────────────────────────────── */}
      <div className="rounded-card border border-border-default bg-surface-low overflow-hidden">
        <BoardHeader />
        {visible.length === 0 ? (
          <div className="py-16 text-center text-xs text-ink-muted">
            조건에 맞는 글이 없습니다
          </div>
        ) : (
          <ul>
            {visible.map((l, idx) => (
              <ListingRow
                key={l.id}
                listing={l}
                index={idx + 1}
                onClick={() => onSelect(l)}
              />
            ))}
          </ul>
        )}
      </div>
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
    <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 border-b border-gold-400/20">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-bold text-gold-300">
          <span aria-hidden>📢</span>
          공지사항
          <span className="text-2xs text-ink-muted font-normal">({notices.length})</span>
        </h2>
        {canWrite && (
          <button
            type="button"
            onClick={onWrite}
            className="text-2xs text-gold-300 hover:text-gold-200 font-semibold"
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
        active ? 'text-gold-300 font-bold' : 'text-ink-muted hover:text-ink-secondary',
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
          'hover:bg-surface-high transition-colors cursor-pointer',
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
            <span className="text-2xs text-ink-muted">📍 {listing.region}</span>
          </div>
          <p className={[
            'mt-0.5 text-sm font-medium leading-snug truncate',
            isSold ? 'text-ink-muted line-through decoration-1' : 'text-ink-primary',
          ].join(' ')}>
            {listing.title}
            {listing.commentCount > 0 && (
              <span className="ml-1.5 text-2xs text-gold-300 font-bold align-middle">
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
