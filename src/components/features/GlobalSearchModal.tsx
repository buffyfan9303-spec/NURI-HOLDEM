// src/components/features/GlobalSearchModal.tsx
// 통합 검색 — 매장(홀덤펍)·대회/일정·게시글을 한 번에 검색해 바로 이동. (헤더 검색 아이콘 / ⌘K)
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Modal from '../atoms/Modal';
import type { Venue, CommunityPost } from '../../api/community';
import type { Schedule } from '../../api/schedules';

interface Props {
  open: boolean;
  onClose: () => void;
  venues: Venue[];
  schedules: Schedule[];
  posts: CommunityPost[];
  onVenue: (id: string) => void;
  onSchedule: (s: Schedule) => void;
  onPost: (p: CommunityPost) => void;
}

export default function GlobalSearchModal({ open, onClose, venues, schedules, posts, onVenue, onSchedule, onPost }: Props) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);

  const query = q.trim().toLowerCase();
  const res = useMemo(() => {
    if (!query) return { v: [] as Venue[], s: [] as Schedule[], p: [] as CommunityPost[] };
    const has = (t?: string | null) => (t ?? '').toLowerCase().includes(query);
    return {
      s: schedules.filter((x) => has(x.title) || has(x.pubName) || has(x.region)).slice(0, 8),
      v: venues.filter((x) => has(x.name) || has(x.region)).slice(0, 6),
      p: posts.filter((x) => has(x.title) || has(x.content)).slice(0, 8),
    };
  }, [query, venues, schedules, posts]);

  const empty = !!query && !res.v.length && !res.s.length && !res.p.length;

  return (
    <Modal open={open} onClose={onClose} title="통합 검색" maxWidth="md" variant="sheet">
      <div className="p-4 space-y-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="매장 이름·지역, 대회명, 게시글 검색…"
          className="input w-full text-sm"
        />
        {!query ? (
          <p className="py-8 text-center text-2xs text-ink-muted">매장 · 대회 · 게시글을 한 번에 검색하세요. (단축키 ⌘K / Ctrl+K)</p>
        ) : empty ? (
          <p className="py-8 text-center text-2xs text-ink-muted">"{q}" 검색 결과가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {res.s.length > 0 && (
              <Group title="대회 · 일정">
                {res.s.map((s) => (
                  <Row key={s.id} title={s.title} sub={[s.pubName, s.region].filter(Boolean).join(' · ')} onClick={() => { onSchedule(s); onClose(); }} />
                ))}
              </Group>
            )}
            {res.v.length > 0 && (
              <Group title="홀덤펍">
                {res.v.map((v) => (
                  <Row key={v.id} title={v.name} sub={v.region} onClick={() => { onVenue(v.id); onClose(); }} />
                ))}
              </Group>
            )}
            {res.p.length > 0 && (
              <Group title="게시글">
                {res.p.map((p) => (
                  <Row key={p.id} title={p.title || '(제목 없음)'} sub={(p.content || '').replace(/\n/g, ' ').slice(0, 50)} onClick={() => { onPost(p); onClose(); }} />
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
