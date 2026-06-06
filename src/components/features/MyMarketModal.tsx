// src/components/features/MyMarketModal.tsx
// 중고장터 — 통합 메시지함(MessagesModal) + 내 판매목록(MyListingsModal)
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import type { InboxThread } from '../../api/chat';
import { getMyChatThreads } from '../../api/chat';
import type { MarketplaceListing, ListingStatus } from '../../api/marketplace';
import { getMyListings, updateListingStatus, deleteListing } from '../../api/marketplace';
import { relativeTime, STATUS_MAP } from './MarketplaceTab';
import ChatPane from './chat/ChatPane';

function Thumb({ src, size = 'w-12 h-12' }: { src: string | null; size?: string }) {
  return (
    <div className={`${size} shrink-0 rounded-input overflow-hidden bg-surface-float flex items-center justify-center`}>
      {src
        ? <img src={src} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30" aria-hidden><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /></svg>}
    </div>
  );
}

function LoginRequired({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="로그인 필요" maxWidth="sm" variant="center">
      <div className="p-4 space-y-3 text-center">
        <p className="text-sm text-ink-secondary">로그인 후 이용할 수 있습니다.</p>
        <button type="button" onClick={onClose} className="btn-primary w-full">닫기</button>
      </div>
    </Modal>
  );
}

// ── 통합 메시지함 ────────────────────────────────────────────────────────────
export function MessagesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<InboxThread | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setActive(null); setLoading(true);
    getMyChatThreads().then(setThreads).catch(() => {}).finally(() => setLoading(false));
  }, [open, user]);

  if (!user) return <LoginRequired open={open} onClose={onClose} />;

  return (
    <Modal open={open} onClose={onClose} maxWidth="md" variant="sheet">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border-subtle">
        {active && (
          <button type="button" onClick={() => setActive(null)} aria-label="목록으로"
            className="w-8 h-8 -ml-1 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="10,3 5,8 10,13" /></svg>
          </button>
        )}
        {active && <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: active.counterpartyColor }}>{active.counterpartyName[0]}</div>}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-ink-primary truncate">{active ? active.counterpartyName : '메시지'}</p>
          {active && <p className="text-2xs text-ink-muted truncate">{active.role === 'seller' ? '구매 문의' : '판매자'} · {active.listingTitle}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
        </button>
      </div>

      {active ? (
        <div className="flex flex-col h-[60vh]">
          {/* 상품 미리보기 */}
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-high border-b border-border-subtle shrink-0">
            <Thumb src={active.listingImage} size="w-8 h-8" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink-primary truncate">{active.listingTitle}</p>
              <p className="text-2xs font-bold text-gold-300 tabular-nums">{active.listingPrice.toLocaleString()}</p>
            </div>
          </div>
          <ChatPane listingId={active.listingId} buyerId={active.buyerId} meId={user.id}
            emptyHint={active.role === 'seller' ? '구매자에게 답장을 보내보세요' : '판매자에게 메시지를 보내보세요'}
            onRead={() => getMyChatThreads().then(setThreads).catch(() => {})} />
        </div>
      ) : (
        <div className="max-h-[62vh] min-h-[200px] overflow-y-auto p-2">
          {loading ? (
            <p className="text-center py-14 text-sm text-ink-muted">불러오는 중…</p>
          ) : threads.length === 0 ? (
            <div className="text-center py-14 text-ink-muted">
              <p className="text-sm">아직 대화가 없습니다</p>
              <p className="text-2xs mt-1">판매글의 "판매자에게 연락"으로 대화를 시작하세요.</p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((t) => (
                <li key={`${t.listingId}|${t.buyerId}`}>
                  <button type="button" onClick={() => setActive(t)}
                    className="w-full text-left flex items-center gap-3 p-2.5 rounded-card hover:bg-surface-high active:bg-surface-float transition-colors">
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: t.counterpartyColor }}>{t.counterpartyName[0]}</div>
                      <span className={['absolute -bottom-1 -right-1 text-[8px] font-bold px-1 py-px rounded-badge ring-2 ring-surface-mid',
                        t.role === 'seller' ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white'].join(' ')}>{t.role === 'seller' ? '판매' : '구매'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-ink-primary truncate">{t.counterpartyName}</span>
                        <span className="flex items-center gap-1 shrink-0">
                          {t.unread > 0 && <span className="inline-flex items-center justify-center min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-gold-300 text-ink-inverse text-[10px] font-bold tabular-nums">{t.unread}</span>}
                          <span className="text-2xs text-ink-muted">{relativeTime(t.lastAt)}</span>
                        </span>
                      </div>
                      <p className={['text-xs truncate mt-0.5', t.unread > 0 ? 'text-ink-primary font-semibold' : 'text-ink-secondary'].join(' ')}>{t.lastContent}</p>
                      <p className="text-2xs text-ink-muted truncate mt-0.5">📦 {t.listingTitle}</p>
                    </div>
                    <Thumb src={t.listingImage} size="w-10 h-10" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── 내 판매목록 ──────────────────────────────────────────────────────────────
const STATUS_OPTS: ListingStatus[] = ['on_sale', 'reserved', 'sold'];

export function MyListingsModal({ open, onClose, onOpenListing, onChanged }: {
  open: boolean; onClose: () => void;
  onOpenListing: (l: MarketplaceListing) => void;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => getMyListings().then(setItems).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { if (open && user) { setLoading(true); reload(); } }, [open, user]);

  if (!user) return <LoginRequired open={open} onClose={onClose} />;

  const setStatus = async (l: MarketplaceListing, status: ListingStatus) => {
    if (l.status === status) return;
    try { await updateListingStatus(l.id, status); setItems((arr) => arr.map((x) => x.id === l.id ? { ...x, status } : x)); onChanged?.(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '변경 실패', 'error'); }
  };
  const del = async (l: MarketplaceListing) => {
    if (!confirm(`"${l.title}" 판매글을 삭제할까요?`)) return;
    try { await deleteListing(l.id); setItems((arr) => arr.filter((x) => x.id !== l.id)); onChanged?.(); toast.show('삭제했습니다', 'info'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '삭제 실패', 'error'); }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth="md" variant="sheet">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
        <p className="flex-1 text-sm font-bold text-ink-primary">내 판매목록 {items.length > 0 && <span className="text-ink-muted font-normal">({items.length})</span>}</p>
        <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
        </button>
      </div>

      <div className="max-h-[64vh] min-h-[200px] overflow-y-auto p-2 space-y-2">
        {loading ? (
          <p className="text-center py-14 text-sm text-ink-muted">불러오는 중…</p>
        ) : items.length === 0 ? (
          <div className="text-center py-14 text-ink-muted">
            <p className="text-sm">등록한 판매글이 없습니다</p>
            <p className="text-2xs mt-1">중고장터에서 "글쓰기"로 등록하세요.</p>
          </div>
        ) : items.map((l) => (
          <div key={l.id} className="rounded-card border border-border-subtle bg-surface-low p-2.5 space-y-2">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => onOpenListing(l)} className="shrink-0"><Thumb src={l.images[0] ?? null} /></button>
              <button type="button" onClick={() => onOpenListing(l)} className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-ink-primary truncate">{l.title}</p>
                <p className="text-sm font-bold text-gold-300 tabular-nums">{l.price.toLocaleString()}</p>
                <p className="text-2xs text-ink-muted">조회 {l.viewCount} · 찜 {l.likeCount} · {relativeTime(l.createdAt)}</p>
              </button>
              <button type="button" onClick={() => del(l)} className="shrink-0 text-2xs text-ink-muted hover:text-danger-light px-1">삭제</button>
            </div>
            <div className="flex items-center gap-1">
              {STATUS_OPTS.map((s) => {
                const on = l.status === s;
                return (
                  <button key={s} type="button" onClick={() => setStatus(l, s)}
                    className={['flex-1 text-2xs font-bold py-1.5 rounded-input border transition-colors',
                      on ? STATUS_MAP[s].cls : 'bg-surface-high text-ink-muted border-border-default hover:text-ink-secondary'].join(' ')}>
                    {STATUS_MAP[s].label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
