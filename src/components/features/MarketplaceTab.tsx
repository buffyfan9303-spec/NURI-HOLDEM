import { memo, useMemo, useState, useEffect } from 'react';
import type {
  ListingCategory, ListingCondition, ListingStatus,
  MarketplaceListing, MarketplaceNotice,
} from '../../api/marketplace';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlockContext';
import { getMyChatThreads } from '../../api/chat';
import { MessagesModal, MyListingsModal, MyLikesModal } from './MyMarketModal';
import { useSkeletonGate } from '../../lib/useSkeletonGate';
import Icon from '../atoms/Icon';
import EmptyState from '../atoms/EmptyState';
import { onColorInkClass } from '../../lib/color';
import { goSubTab } from '../../lib/subTabTransition';
import NoticeSection from './NoticeSection';

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

/** 카테고리 칩 진열 순서 — 하위 탭 전환 방향(forward/back) 기준. */
const CAT_ORDER = CATEGORIES.map((c) => c.id);
/** 정렬 칩 진열 순서 — 카테고리와 같은 스코프(목록 하나가 갈리는 같은 전환이다). */
const SORT_ORDER = ['recent', 'popular'] as const;

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
  const showSkel = useSkeletonGate(loading && listings.length === 0); // MO-6C: 200ms 내 도착하면 스켈레톤 생략
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const [category, setCategory]       = useState<ListingCategory | 'all'>('all');
  const [includeSold, setIncludeSold] = useState(false);
  const [query, setQuery]             = useState('');
  const [sortBy, setSortBy]           = useState<SortBy>('recent');
  const [myListOpen, setMyListOpen]   = useState(false);
  const [likesOpen, setLikesOpen]     = useState(false);
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
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-input chip-aura text-xs font-semibold transition-colors">
            <Icon name="package" size={14} className="shrink-0" />내 판매목록
          </button>
          {/* 찜은 재방문 1순위 동선이라 판매목록·메시지함과 같은 높이에 둔다 */}
          <button type="button" onClick={() => setLikesOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-input chip-aura text-xs font-semibold transition-colors">
            <Icon name="heart" size={14} className="shrink-0" />찜한 매물
          </button>
          <button type="button" onClick={() => setMsgOpen(true)}
            className="flex-1 relative flex items-center justify-center gap-1.5 py-2 rounded-input chip-aura text-xs font-semibold transition-colors">
            <Icon name="comment" size={14} className="shrink-0" />메시지함
            {msgCount > 0 && <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-accent-300 text-white text-2xs font-bold tabular-nums">{msgCount}</span>}
          </button>
        </div>
      )}

      {/* 전자상거래법 §20 통신판매중개자 개별고지 — 거래 전 상시 노출(LAW-8) */}
      <p data-testid="broker-notice" className="rounded-input border border-border-subtle bg-surface-low px-3 py-2 text-2xs leading-relaxed text-ink-muted">
        본 장터의 거래는 회원 간 직거래이며, 엔에이치홀딩스는 통신판매중개자로서 거래의 당사자가 아닙니다.
        상품·거래정보 및 거래에 대한 책임은 판매 회원에게 있습니다.
      </p>

      {/* ── 액션 바 (검색 + 글쓰기) ────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="search" enterKeyHint="search"
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
      {/* 오너 지시(2026-08-28): 칩(pill) 형태 제거 — 커뮤니티 홀덤펍 필터와 같은
          배경·보더 없는 텍스트 필터(활성 = 액센트 색+굵기만). */}
      {/* 44px 탭 타깃(오너 승인 2026-09-03): 버튼 h-11, 레일 -my-2.5 로 원래 24px 행 높이 유지.
          부모 space-y-3 이 자식 margin 을 덮어쓰므로 h-6 래퍼 안에서 상쇄한다(data-market-catbar 는 그대로). */}
      <div className="h-6">
      <div data-market-catbar="" className="-my-2.5 flex items-center gap-3 overflow-x-auto scrollbar-none [-webkit-overflow-scrolling:touch]">
        {CATEGORIES.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              aria-pressed={active}
              onClick={() => goSubTab('market-cat', CAT_ORDER, category, cat.id, () => setCategory(cat.id))}
              className={[
                'shrink-0 inline-flex h-11 items-center whitespace-nowrap text-xs transition-colors',
                active ? 'font-bold text-accent-200' : 'font-semibold text-ink-muted hover:text-ink-primary',
              ].join(' ')}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
      </div>

      {/* ── 정렬·필터 바 ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 text-2xs">
        <div className="flex items-center gap-1">
          <SortPill active={sortBy === 'recent'}  onClick={() => goSubTab('market-cat', SORT_ORDER, sortBy, 'recent',  () => setSortBy('recent'))}  label="최신순"   />
          <SortPill active={sortBy === 'popular'} onClick={() => goSubTab('market-cat', SORT_ORDER, sortBy, 'popular', () => setSortBy('popular'))} label="조회수순" />
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

      {/* ── 매물 목록: 게시판(리스트) 전용 ─────────────────────────
          data-market-panel: 카테고리·정렬 전환의 본문(방향성 푸시 대상). 위 바들은 제자리. */}
      <div data-market-panel="">
      {loading && listings.length === 0 && !showSkel ? null : loading && listings.length === 0 ? (
        // [DS] MO-6 스켈레톤 — 실제 ListingRow 골격 복제(배지행+제목+모바일 메타행, --row-h-md 계약).
        // BoardHeader 를 스켈레톤에도 그대로 렌더 — 전엔 데이터 도착 때 데스크톱 헤더 행이
        // 나중에 끼어들어 목록 전체가 한 번 더 밀렸다.
        <div className="rounded-aura border card-aura overflow-hidden" aria-hidden>
          <BoardHeader />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="grid min-h-[var(--row-h-md)] grid-cols-[1fr_auto] items-center gap-2 border-b border-border-subtle px-3 py-2.5 last:border-b-0 sm:grid-cols-[3rem_1fr_5rem_6rem_5rem_5rem]">
              <span className="hidden sm:block" />
              <div className="min-w-0">
                <div className="skeleton h-[18px] rounded" style={{ width: `${[34, 42, 30, 38, 33, 40, 36][i]}%` }} />
                <div className="skeleton mt-0.5 h-5 rounded" style={{ width: `${[70, 55, 64, 48, 60, 52, 68][i]}%` }} />
                <div className="skeleton mt-1 h-4 w-1/2 rounded sm:hidden" />
              </div>
              <div className="skeleton h-3.5 w-12 shrink-0 rounded" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-aura border card-aura">
          <EmptyState icon={<Icon name="package" />} title="조건에 맞는 글이 없습니다" />
        </div>
      ) : (
        <div className="rounded-aura border card-aura overflow-hidden">
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
      </div>

      {visible.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((v) => v + 20)}
          className="w-full py-2.5 rounded-input bg-surface-high text-xs font-semibold tabular-nums text-ink-secondary hover:text-ink-primary active:bg-surface-float transition-colors"
        >
          더보기 ({(visible.length - limit).toLocaleString()})
        </button>
      )}

      <MyListingsModal open={myListOpen} onClose={() => setMyListOpen(false)}
        onOpenListing={(l) => { setMyListOpen(false); onSelect(l); }}
        onChanged={onListingsChanged} />
      <MyLikesModal open={likesOpen} onClose={() => setLikesOpen(false)}
        onOpenListing={(l) => { setLikesOpen(false); onSelect(l); }} />
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
    <NoticeSection notices={notices} onSelect={onSelect} canWrite={canWrite} onWrite={onWrite} />
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
    <li className="cv-row-md min-h-[var(--row-h-md)]">
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
            {/* 장터 [n] 배지 제거 — comments 테이블에 listing_id 컬럼 자체가 없어
                marketplace_listings.comment_count 는 구조적으로 0 이상이 될 수 없다.
                문의는 1:1 채팅으로 일원화됐으므로 남겨두면 '문의 0건'이라는 거짓 신호만 준다. */}
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
            className={['w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0', onColorInkClass(listing.sellerAvatarColor)].join(' ')}
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

// eslint-disable-next-line react-refresh/only-export-components -- 장터 상수/유틸을 외부와 공유(기존 구조 유지)
export { CATEGORIES, CONDITION_COLOR, STATUS_MAP, relativeTime };

// (A2) 장터 탭 memo — App 무관 재렌더 차단. props는 App에서 안정화(marketNotices·handleMarketCreate 등).
export default memo(MarketplaceTab);
