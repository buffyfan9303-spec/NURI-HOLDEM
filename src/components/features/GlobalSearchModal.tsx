// src/components/features/GlobalSearchModal.tsx
// 통합 검색 — 매장(홀덤펍)·대회/일정·게시글을 한 번에 검색해 바로 이동. (헤더 검색 아이콘 / ⌘K)
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Modal from '../atoms/Modal';
import type { Venue, CommunityPost } from '../../api/community';
import type { Schedule } from '../../api/schedules';
import type { MarketplaceListing, MarketplaceNotice } from '../../api/marketplace';

interface Props {
  open: boolean;
  onClose: () => void;
  venues: Venue[];
  schedules: Schedule[];
  posts: CommunityPost[];
  /** 중고장터 매물·공지 — 검색 사각지대 해소(탭 미방문 시 빈 배열이어도 동작) */
  listings?: MarketplaceListing[];
  notices?: MarketplaceNotice[];
  onListing?: (l: MarketplaceListing) => void;
  onNotice?: (n: MarketplaceNotice) => void;
  onVenue: (id: string) => void;
  onSchedule: (s: Schedule) => void;
  onPost: (p: CommunityPost) => void;
}

export default function GlobalSearchModal({ open, onClose, venues, schedules, posts, listings = [], notices = [], onVenue, onSchedule, onPost, onListing, onNotice }: Props) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  // 16-3 최근 검색어(5개, 개별 삭제) — 열자마자 입력 전 화면이 빈 안내문이 아니라 출발점이 되게.
  const [recents, setRecents] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('nuri:recent-search') || '[]'); } catch { return []; }
  });
  const saveRecent = (kw: string) => {
    const w = kw.trim();
    if (w.length < 2) return;
    setRecents((prev) => {
      const next = [w, ...prev.filter((x) => x !== w)].slice(0, 5);
      try { localStorage.setItem('nuri:recent-search', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };
  const removeRecent = (kw: string) => setRecents((prev) => {
    const next = prev.filter((x) => x !== kw);
    try { localStorage.setItem('nuri:recent-search', JSON.stringify(next)); } catch { /* noop */ }
    return next;
  });
  // 결과를 실제로 열었을 때만 기록(오타·중간 입력을 저장하지 않게)
  const openAnd = (fn: () => void) => { saveRecent(q); fn(); };

  const query = q.trim().toLowerCase();
  const res = useMemo(() => {
    if (!query) return { v: [] as Venue[], s: [] as Schedule[], p: [] as CommunityPost[], l: [] as MarketplaceListing[], n: [] as MarketplaceNotice[] };
    const has = (t?: string | null) => (t ?? '').toLowerCase().includes(query);
    return {
      s: schedules.filter((x) => has(x.title) || has(x.pubName) || has(x.region)).slice(0, 8),
      v: venues.filter((x) => has(x.name) || has(x.region)).slice(0, 6),
      p: posts.filter((x) => has(x.title) || has(x.content)).slice(0, 8),
      l: listings.filter((x) => has(x.title) || has(x.description) || has(x.sellerName)).slice(0, 6),
      n: notices.filter((x) => has(x.title) || has(x.body)).slice(0, 4),
    };
  }, [query, venues, schedules, posts, listings, notices]);

  const empty = !!query && !res.v.length && !res.s.length && !res.p.length && !res.l.length && !res.n.length;

  return (
    <Modal open={open} onClose={onClose} title="통합 검색" maxWidth="md" variant="sheet">
      <div className="p-4 space-y-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="매장·대회·게시글·장터 매물·공지 검색…"
          className="input w-full text-sm"
        />
        {!query ? (
          recents.length > 0 ? (
            <div className="space-y-1.5 py-2">
              <p className="text-2xs font-bold text-ink-muted">최근 검색어</p>
              <ul className="space-y-1">{recents.map((r) => (
                <li key={r} className="flex items-center gap-1">
                  <button type="button" onClick={() => setQ(r)}
                    className="min-w-0 flex-1 truncate rounded-input px-2.5 py-2 text-left text-sm text-ink-secondary hover:bg-surface-high hover:text-ink-primary transition-colors">
                    🕐 {r}
                  </button>
                  <button type="button" onClick={() => removeRecent(r)} aria-label={`'${r}' 삭제`}
                    className="hit h-9 w-9 shrink-0 rounded-input text-ink-muted hover:text-danger-light transition-colors">✕</button>
                </li>
              ))}</ul>
            </div>
          ) : (
            <p className="py-8 text-center text-2xs text-ink-muted">매장 · 대회 · 게시글을 한 번에 검색하세요. (단축키 ⌘K / Ctrl+K)</p>
          )
        ) : empty ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-2xs text-ink-muted">"{q}" 검색 결과가 없습니다 — 철자를 바꾸거나 더 짧게 검색해 보세요.</p>
            <button type="button" onClick={() => setQ('')} className="btn-ghost mx-auto text-xs">검색어 지우기</button>
          </div>
        ) : (
          <div className="space-y-3">
            {res.s.length > 0 && (
              <Group title="대회 · 일정">
                {res.s.map((s) => (
                  <Row key={s.id} title={s.title} sub={[s.pubName, s.region].filter(Boolean).join(' · ')} onClick={() => openAnd(() => { onSchedule(s); onClose(); })} />
                ))}
              </Group>
            )}
            {res.v.length > 0 && (
              <Group title="홀덤펍">
                {res.v.map((v) => (
                  <Row key={v.id} title={v.name} sub={v.region} onClick={() => openAnd(() => { onVenue(v.id); onClose(); })} />
                ))}
              </Group>
            )}
            {res.p.length > 0 && (
              <Group title="게시글">
                {res.p.map((p) => (
                  <Row key={p.id} title={p.title || '(제목 없음)'} sub={(p.content || '').replace(/\n/g, ' ').slice(0, 50)} onClick={() => openAnd(() => { onPost(p); onClose(); })} />
                ))}
              </Group>
            )}
            {res.l.length > 0 && onListing && (
              <Group title="중고장터">
                {res.l.map((l) => (
                  <Row key={l.id} title={l.title} sub={`${l.price.toLocaleString()}원 · ${l.sellerName}`} onClick={() => openAnd(() => { onListing(l); onClose(); })} />
                ))}
              </Group>
            )}
            {res.n.length > 0 && onNotice && (
              <Group title="공지">
                {res.n.map((nn) => (
                  <Row key={nn.id} title={nn.title} sub={(nn.body || '').replace(/\n/g, ' ').slice(0, 50)} onClick={() => openAnd(() => { onNotice(nn); onClose(); })} />
                ))}
              </Group>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-2xs font-bold text-ink-muted">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ title, sub, onClick }: { title: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-input border border-border-subtle bg-surface-low px-3 py-2 text-left transition-colors hover:bg-surface-high active:scale-[0.99]">
      <p className="truncate text-sm font-semibold text-ink-primary">{title}</p>
      {sub && <p className="truncate text-2xs text-ink-muted">{sub}</p>}
    </button>
  );
}
