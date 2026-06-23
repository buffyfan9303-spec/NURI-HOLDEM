import { useState, useEffect } from 'react';
import Modal from '../atoms/Modal';
import type { MarketplaceListing } from '../../api/marketplace';
import { CATEGORIES, CONDITION_COLOR, STATUS_MAP, relativeTime } from './MarketplaceTab';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlockContext';
import { useToast } from '../atoms/Toast';
import { promptLogin } from '../../lib/requireLogin';
import ReportModal from './ReportModal';
import type { ChatThread } from '../../api/chat';
import { getListingThreads } from '../../api/chat';
import ChatPane from './chat/ChatPane';

interface ListingDetailModalProps {
  listing: MarketplaceListing | null;
  open: boolean;
  onClose: () => void;
  /** 관리자 또는 판매자 삭제 */
  onDelete?: (id: string) => void;
}

export default function ListingDetailModal({ listing, open, onClose, onDelete }: ListingDetailModalProps) {
  const { user }                  = useAuth();
  const { block }                 = useBlocks();
  const [liked, setLiked]         = useState(false);
  const [chatOpen, setChatOpen]   = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const toast                     = useToast();

  if (!listing) return null;

  const status   = STATUS_MAP[listing.status];
  const category = CATEGORIES.find((c) => c.id === listing.category);
  const isSold   = listing.status === 'sold';
  const hasImage = listing.images.length > 0;

  const scrollToComments = () => {
    document.getElementById('listing-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
    <Modal open={open} onClose={onClose} maxWidth="lg" variant="sheet">
      {/* ── 헤더 (이미지가 있으면 이미지, 없으면 슬림 헤더) ───────── */}
      {hasImage ? (
        <div className="relative">
          <div className="aspect-square sm:aspect-[4/3] overflow-hidden bg-surface-mid">
            <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover" />
          </div>
          <CloseButton onClose={onClose} />
          {isSold && <SoldOverlay />}
        </div>
      ) : (
        <div className="relative h-14 flex items-center px-4 border-b border-border-subtle">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
            {category?.label ?? '게시글'}
          </span>
          <CloseButton onClose={onClose} className="!top-2 !right-2 !w-10 !h-10" />
        </div>
      )}

      {/* ── 본문 ─────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-6 space-y-5">

        {/* 메타 라인 */}
        <div className="flex items-center gap-1.5 flex-wrap text-2xs">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-badge bg-surface-high text-ink-secondary font-semibold">
            {category?.label}
          </span>
          <span className={[
            'inline-flex items-center rounded-badge border px-2 py-0.5 font-bold tracking-wide',
            CONDITION_COLOR[listing.condition],
          ].join(' ')}>
            {listing.condition}급
          </span>
          {listing.status !== 'on_sale' && (
            <span className={[
              'inline-flex items-center rounded-badge border px-2 py-0.5 font-bold',
              status.cls,
            ].join(' ')}>
              {status.label}
            </span>
          )}
          <span className="text-ink-muted">{listing.region}</span>
          <span className="text-border-strong">·</span>
          <span className="text-ink-muted">{relativeTime(listing.createdAt)}</span>
          {user && user.id !== listing.sellerId && (
            <button type="button" onClick={() => setReportOpen(true)} className="ml-auto text-ink-muted hover:text-danger-light transition-colors">신고</button>
          )}
          {user && user.id !== listing.sellerId && (
            <button type="button"
              onClick={async () => {
                if (!confirm(`'${listing.sellerName}'님을 차단할까요?\n이 판매자의 매물·글이 보이지 않게 됩니다.`)) return;
                try { await block(listing.sellerId, listing.sellerName); toast.show('차단했습니다 — 이 판매자의 매물이 숨겨집니다', 'info'); onClose(); }
                catch (e) { toast.show(e instanceof Error ? e.message : '차단 실패', 'error'); }
              }}
              className="text-ink-muted hover:text-danger-light transition-colors">차단</button>
          )}
        </div>

        {/* 제목 + 가격 */}
        <section>
          <h1 className="text-lg font-bold text-ink-primary leading-snug">{listing.title}</h1>
          <p className="mt-1.5 text-3xl font-extrabold text-accent-300 tabular-nums leading-none">
            {listing.price.toLocaleString()}
          </p>
        </section>

        {/* 거래 옵션 */}
        <section>
          <h3 className="text-sm font-semibold text-ink-primary mb-2">거래 옵션</h3>
          <div className="space-y-1.5">
            <OptionRow ok={listing.shippingAvailable} label="택배 발송 가능" />
            <OptionRow ok={!listing.pickupOnly}       label="비대면 거래 가능" />
            <OptionRow ok={true}                       label={`직거래 — ${listing.region}`} />
          </div>
        </section>

        {/* 판매자 */}
        <section>
          <h3 className="text-sm font-semibold text-ink-primary mb-2">판매자</h3>
          <div className="flex items-center gap-3 p-3 rounded-card bg-surface-high border border-border-subtle">
            <div
              className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-base font-bold text-white"
              style={{ background: listing.sellerAvatarColor }}
            >
              {listing.sellerName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-ink-primary truncate">{listing.sellerName}</span>
                {listing.sellerVerified && (
                  <span title="본인 인증 완료" className="text-emerald-400">✓</span>
                )}
              </div>
              <p className="mt-0.5 text-2xs text-ink-muted">거래 {listing.sellerTradeCount}회</p>
            </div>
            <button
              type="button"
              onClick={() => toast.show(`${listing.sellerName}님의 다른 상품은 검색창에서 이름으로 찾아보세요`, 'info')}
              className="shrink-0 btn-ghost text-xs px-3 py-1.5"
            >
              판매상품
            </button>
          </div>
        </section>

        {/* 상품 설명 */}
        <section>
          <h3 className="text-sm font-semibold text-ink-primary mb-2">설명</h3>
          <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">
            {listing.description}
          </p>
        </section>

        {/* 통계 */}
        <div className="grid grid-cols-3 gap-2 text-center text-2xs text-ink-muted">
          <Stat label="조회" value={listing.viewCount} />
          <Stat label="찜"   value={listing.likeCount} />
          <Stat label="댓글" value={listing.commentCount} />
        </div>

        {/* 댓글 (게시판형 단순 표시) */}
        <section id="listing-comments">
          <CommentSection initialCount={listing.commentCount} />
        </section>
      </div>

      {/* ── 하단 고정 CTA ─────────────────────────────────────────── */}
      {!isSold && (
        <div className="sticky bottom-0 bg-surface-mid border-t border-border-default px-4 py-3 flex items-center gap-2">
          {/* 찜하기 (토글) */}
          <button
            type="button"
            onClick={() => setLiked((v) => !v)}
            aria-pressed={liked}
            aria-label={liked ? '찜 해제' : '찜하기'}
            className={[
              'shrink-0 w-11 h-11 rounded-input border transition-colors flex items-center justify-center',
              liked
                ? 'bg-danger/15 border-danger text-danger'
                : 'border-border-default text-ink-secondary hover:text-danger',
            ].join(' ')}
          >
            <svg width="20" height="20" viewBox="0 0 22 22"
              fill={liked ? 'currentColor' : 'none'}
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden>
              <path d="M11 19.5L2.5 11C1 9.5 1 6.5 2.5 5C4 3.5 7 3.5 8.5 5L11 7.5L13.5 5C15 3.5 18 3.5 19.5 5C21 6.5 21 9.5 19.5 11L11 19.5Z" />
            </svg>
          </button>

          {onDelete && (user?.role === 'admin' || user?.id === listing.sellerId) && (
            <button
              type="button"
              onClick={() => { if (confirm('이 매물을 삭제하시겠습니까?')) onDelete(listing.id); }}
              className="btn-ghost py-2.5 px-3 text-danger-light hover:bg-danger/10"
            >
              삭제
            </button>
          )}

          {/* 댓글로 스크롤 */}
          <button type="button" onClick={scrollToComments} className="flex-1 btn-ghost py-2.5">
            댓글
          </button>

          {/* 판매자 채팅 모달 열기 */}
          <button type="button" onClick={() => setChatOpen(true)} className="flex-[2] btn-primary py-2.5">
            판매자에게 연락
          </button>
        </div>
      )}

      {/* 채팅 모달 */}
      <SellerChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        listing={listing}
      />
    </Modal>
    <ReportModal open={reportOpen} onClose={() => setReportOpen(false)}
      target={{ type: 'listing', id: listing.id, ownerId: listing.sellerId, summary: listing.title }} />
    </>
  );
}

// ── 판매자 채팅 모달 ────────────────────────────────────────────────────────

function SellerChatModal({
  open, onClose, listing,
}: { open: boolean; onClose: () => void; listing: MarketplaceListing }) {
  const { user } = useAuth();
  const isSeller = !!user && user.id === listing.sellerId;
  const [buyerId, setBuyerId]   = useState<string | null>(null);
  const [threads, setThreads]   = useState<ChatThread[]>([]);

  // 열릴 때 초기화: 구매자는 본인 스레드, 판매자는 받은 문의 목록
  useEffect(() => {
    if (!open || !user) return;
    if (isSeller) {
      setBuyerId(null);
      getListingThreads(listing.id).then(setThreads).catch(() => {});
    } else {
      setBuyerId(user.id);
    }
  }, [open, user, isSeller, listing.id]);

  if (!user) {
    return (
      <Modal open={open} onClose={onClose} title="로그인 필요" maxWidth="sm" variant="center">
        <div className="p-4 space-y-3 text-center">
          <p className="text-sm text-ink-secondary">채팅은 로그인 후 이용 가능합니다.</p>
          <button type="button" onClick={onClose} className="btn-primary w-full">닫기</button>
        </div>
      </Modal>
    );
  }

  const showThreadList = isSeller && !buyerId;
  const headerName = showThreadList
    ? '받은 문의'
    : isSeller
      ? (threads.find((t) => t.buyerId === buyerId)?.buyerName ?? '구매자')
      : listing.sellerName;

  return (
    <Modal open={open} onClose={onClose} maxWidth="md" variant="sheet">
      {/* 채팅 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
        {isSeller && buyerId && (
          <button type="button" onClick={() => setBuyerId(null)} aria-label="목록으로"
            className="w-8 h-8 -ml-1 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="10,3 5,8 10,13" />
            </svg>
          </button>
        )}
        <div
          className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white"
          style={{ background: listing.sellerAvatarColor }}
        >
          {headerName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-primary truncate">{headerName}</p>
          <p className="text-2xs text-ink-muted truncate">상품: {listing.title}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기"
          className="w-8 h-8 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
          </svg>
        </button>
      </div>

      {/* 상품 미리보기 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-high border-b border-border-subtle">
        <div className="w-8 h-8 shrink-0 rounded-input flex items-center justify-center bg-surface-float overflow-hidden">
          {listing.images.length > 0
            ? <img src={listing.images[0]} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30" aria-hidden><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-ink-primary truncate">{listing.title}</p>
          <p className="text-2xs font-bold text-accent-300 tabular-nums">{listing.price.toLocaleString()}</p>
        </div>
      </div>

      {showThreadList ? (
        /* 판매자: 받은 문의 목록 */
        <div className="px-2 py-2 max-h-[55vh] min-h-[160px] overflow-y-auto">
          {threads.length === 0 ? (
            <p className="text-center py-12 text-sm text-ink-muted">아직 받은 문의가 없습니다</p>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((t) => (
                <li key={t.buyerId}>
                  <button type="button" onClick={() => setBuyerId(t.buyerId)}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-input hover:bg-surface-high active:bg-surface-float transition-colors">
                    <div className="w-9 h-9 shrink-0 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold text-white">
                      {t.buyerName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-ink-primary truncate">{t.buyerName}</span>
                        <span className="text-2xs text-ink-muted shrink-0">{relativeTime(t.lastAt)}</span>
                      </div>
                      <p className="text-xs text-ink-secondary truncate mt-0.5">{t.lastContent}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : buyerId ? (
        <div className="flex flex-col h-[52vh]">
          <ChatPane listingId={listing.id} buyerId={buyerId} meId={user.id}
            emptyHint={isSeller ? '구매자에게 답장을 보내보세요' : '판매자에게 첫 메시지를 보내보세요'} />
        </div>
      ) : null}
    </Modal>
  );
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function CloseButton({ onClose, className = '' }: { onClose: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="닫기"
      className={[
        'absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full',
        'bg-surface-base/80 backdrop-blur text-ink-primary hover:bg-surface-high transition-colors z-10',
        className,
      ].join(' ')}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
      </svg>
    </button>
  );
}

function SoldOverlay() {
  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
      <span className="text-3xl font-extrabold text-white rotate-[-8deg] border-4 border-white px-6 py-2 rounded">
        SOLD OUT
      </span>
    </div>
  );
}

function OptionRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={[
        'w-4 h-4 rounded-full flex items-center justify-center shrink-0',
        ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-high text-ink-muted',
      ].join(' ')}>
        {ok ? (
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <polyline points="1.5,4.5 3.5,6.5 7.5,2.5" />
          </svg>
        ) : (
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="2" y1="2" x2="7" y2="7" /><line x1="7" y1="2" x2="2" y2="7" />
          </svg>
        )}
      </span>
      <span className={ok ? 'text-ink-primary' : 'text-ink-muted line-through decoration-1'}>
        {label}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="py-2 rounded-input bg-surface-high">
      <p className="text-sm font-bold text-ink-primary tabular-nums">{value.toLocaleString()}</p>
      <p className="text-2xs text-ink-muted mt-0.5">{label}</p>
    </div>
  );
}

// ── 간단한 댓글 섹션 (인메모리) ─────────────────────────────────────────────

interface DemoComment {
  id: string;
  author: string;
  authorColor: string;
  content: string;
  time: string;
}

function CommentSection({ initialCount }: { initialCount: number }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<DemoComment[]>([]);
  const [draft, setDraft]       = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { promptLogin(); return; }
    if (!draft.trim()) return;
    setComments((prev) => [
      { id: `dc${Date.now()}`, author: '나', authorColor: '#0EA5E9', content: draft.trim(), time: '방금' },
      ...prev,
    ]);
    setDraft('');
  };

  return (
    <section>
      <h3 className="text-sm font-semibold text-ink-primary mb-2">
        댓글 <span className="text-ink-muted">({initialCount + comments.length})</span>
      </h3>
      {user ? (
        <form onSubmit={submit} className="flex gap-2 mb-3">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="댓글로 가격 협상·문의를 남겨보세요"
            className="input flex-1 text-sm"
          />
          <button type="submit" className="btn-primary text-xs px-3 shrink-0" disabled={!draft.trim()}>
            등록
          </button>
        </form>
      ) : (
        <button type="button" onClick={promptLogin} className="mb-3 w-full rounded-input bg-surface-high py-2.5 text-center text-2xs text-ink-muted hover:text-ink-secondary transition-colors">
          로그인하면 댓글을 작성할 수 있습니다
        </button>
      )}
      {comments.length === 0 ? (
        <p className="text-center py-4 text-2xs text-ink-muted">첫 댓글을 남겨보세요</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2 p-2.5 rounded-input bg-surface-high">
              <div
                className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-2xs font-bold text-white"
                style={{ background: c.authorColor }}
              >
                {c.author[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-primary">{c.author}</span>
                  <span className="text-2xs text-ink-muted">· {c.time}</span>
                </div>
                <p className="text-sm text-ink-primary mt-0.5 leading-relaxed">{c.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
