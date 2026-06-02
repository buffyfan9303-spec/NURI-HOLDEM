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
  pinned:  { icon: '공', cls: 'border-gold-400/40    bg-gold-300/[0.06]',    iconBg: 'bg-gold-300/20 text-gold-300' },
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
  const [viewMode, setViewMode]       = useState<'grid' | 'list'>('grid'); // 번개장터식 바둑판 기본

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
                'shrink-0 h-9 px-4 rounded-input text-xs font-semibold transition-colors',
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
        <div className="flex items-center gap-2">
          <span className="text-ink-muted tabular-nums">총 {visible.length}건</span>
          {/* 뷰 토글 — 바둑판 / 목록 */}
          <div className="flex items-center gap-0.5 bg-surface-high rounded-input p-0.5">
            <button type="button" onClick={() => setViewMode('grid')} aria-label="바둑판 보기" aria-pressed={viewMode === 'grid'}
              className={['p-1 rounded-[6px] transition-colors', viewMode === 'grid' ? 'bg-gold-300 text-ink-inverse' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>
            </button>
            <button type="button" onClick={() => setViewMode('list')} aria-label="목록 보기" aria-pressed={viewMode === 'list'}
              className={['p-1 rounded-[6px] transition-colors', viewMode === 'list' ? 'bg-gold-300 text-ink-inverse' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── 매물 목록: 바둑판(그리드) / 목록(게시판) 토글 ─────────── */}
      {visible.length === 0 ? (
        <div className="rounded-card border border-border-default bg-surface-low py-16 text-center text-xs text-ink-muted">
          조건에 맞는 글이 없습니다
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-card-gap animate-fade-in">
          {visible.map((l) => (
            <ListingCard key={l.id} listing={l} onClick={() => onSelect(l)} />
          ))}
        </div>
      ) : (
        <div className="rounded-card border border-border-default bg-surface-low overflow-hidden animate-fade-in">
          <BoardHeader />
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
        </div>
      )}
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

// ── 카드(바둑판) 아이템 — 번개장터식 ─────────────────────────────────────────

function ListingCard({ listing, onClick }: { listing: MarketplaceListing; onClick: () => void }) {
  const status = STATUS_MAP[listing.status];
  const isSold = listing.status === 'sold';
  const img    = listing.images[0];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-card border border-border-default bg-surface-low overflow-hidden hover:border-border-strong active:scale-[0.98] transition-all duration-150 focus:outline-none"
    >
      {/* 썸네일 (정사각, 비율 고정) + 상태 뱃지 플로팅 */}
      <div className="relative aspect-square bg-surface-mid overflow-hidden">
        {img ? (
          <img
            src={img} alt={listing.title} loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-muted">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40" aria-hidden>
              <path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" />
            </svg>
          </div>
        )}
        <span className={['absolute top-2 left-2 inline-flex items-center rounded-badge border px-1.5 py-0.5 text-2xs font-bold leading-none shadow-sm', status.cls].join(' ')}>
          {status.label}
        </span>
        <span className={['absolute top-2 right-2 inline-flex items-center rounded-badge border px-1 py-0.5 text-2xs font-bold leading-none', CONDITION_COLOR[listing.condition]].join(' ')}>
          {listing.condition}
        </span>
        {isSold && <div className="absolute inset-0 bg-black/45" aria-hidden />}
      </div>

      {/* 정보 */}
      <div className="p-2">
        <p className={['text-xs font-medium leading-snug line-clamp-2 min-h-[2rem]', isSold ? 'text-ink-muted line-through decoration-1' : 'text-ink-primary'].join(' ')}>
          {listing.title}
          {listing.commentCount > 0 && (
            <span className="ml-1 text-2xs text-gold-300 font-bold align-middle">[{listing.commentCount}]</span>
          )}
        </p>
        <p className="mt-1 text-sm font-bold text-ink-primary tabular-nums">{listing.price.toLocaleString()}</p>
        <p className="mt-0.5 text-2xs text-ink-muted truncate">{listing.region} · {relativeTime(listing.createdAt)}</p>
      </div>
    </button>
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
