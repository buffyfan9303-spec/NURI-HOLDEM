// src/components/features/VenueManagement.tsx
// 관리자 '게시물 관리' > 매장 관리: 노출 순서(드래그) + 활성/비활성/정지/숨김 + 프리미엄(AD) + 인증(비인증/인증) + 삭제.
import { useEffect, useState, useCallback } from 'react';
import LoadErrorCard from '../atoms/LoadErrorCard';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  getAllVenues, updateVenueStatus, setVenueAd, logActivity, setVenueVerification, reorderVenues,
} from '../../api/community';
import { removeOrArchiveVenue } from '../../lib/venueRemove';
import type { Venue, VenueStatus, VenueVerificationStatus } from '../../api/community';
import Icon from '../atoms/Icon';
import { msgOf } from '../../lib/dbError';

const STATUS_LABEL: Record<VenueStatus, { label: string; cls: string }> = {
  active:    { label: '활성',   cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  inactive:  { label: '비활성', cls: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40' },
  suspended: { label: '정지',   cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  hidden:    { label: '숨김',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
};

/** 프리미엄 기간 선택지(일). 0 = 기한 없음. */
const PREMIUM_DAYS: [number, string][] = [[0, '기한 없음'], [7, '7일'], [30, '30일'], [90, '90일'], [180, '180일']];
/** 프리미엄 끝 날짜 'MM.DD'(KST). */
function premiumEnd(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

interface RowHandlers {
  onStatus: (v: Venue, status: VenueStatus, label: string) => void;
  /** days — 지정할 때 기간(일). 0 = 기한 없음. 해제에는 쓰지 않는다. */
  onToggleAd: (v: Venue, days: number) => void;
  onVerify: (v: Venue, status: VenueVerificationStatus) => void;
  onRemove: (v: Venue) => void;
}

export default function VenueManagement() {
  const toast = useToast();
  const { user } = useAuth();
  const [venues, setVenues]   = useState<Venue[]>([]);
  // ⚠ 실패와 '0건' 을 가른다. 종전엔 catch 가 토스트만 띄우고 venues 를 [] 로 둬서,
  //   토스트가 사라진 뒤에는 화면이 '매장이 없습니다' 라고 단언했다 — 운영자는 데이터가
  //   날아간 줄 알고, 순서·인증·정지 조작이 왜 안 되는지 알 수 없었다(2026-09-11 점검).
  const [err, setErr]         = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(() => {
    setLoading(true);
    getAllVenues()
      .then((v) => { setVenues(v); setErr(null); })
      .catch((e) => { setErr(e); toast.show('매장 목록을 불러오지 못했습니다', 'error'); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = venues.filter((v) => !query || v.name.includes(query) || v.region.includes(query));

  const changeStatus = async (v: Venue, status: VenueStatus, actionLabel: string) => {
    try {
      await updateVenueStatus(v.id, status);
      await logActivity({
        action: status === 'active' ? 'restore' : status,
        targetType: 'venue', targetId: v.id, targetOwnerId: v.ownerId,
        targetSummary: v.name, actorName: user?.name,
      });
      setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, status } : x)));
      toast.show(`${v.name} ${actionLabel}`, 'info');
    } catch { toast.show('변경에 실패했습니다', 'error'); }
  };

  // 프리미엄 매장(20261002h): 지정하면 그 기간 동안 포스터가 관리자 승인 없이 바로 공개된다.
  //   지정 때는 기간을 **항상** 함께 쓴다(기한 없음 = null) — 지난 기간이 남아 있으면 다시 지정해도 곧바로 만료로 읽히기 때문.
  //   해제는 is_paid_ad 만 내린다(기간 칸은 건드리지 않음).
  const toggleAd = async (v: Venue, days: number) => {
    const next = !v.isPaidAd;
    const until = next ? (days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null) : undefined;
    try {
      await setVenueAd(v.id, next, until);
      setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, isPaidAd: next, ...(until !== undefined && { premiumUntil: until }) } : x)));
      toast.show(next ? `${v.name} 프리미엄 지정 — ${until ? `${premiumEnd(until)}까지 ` : ''}포스터가 승인 없이 바로 공개됩니다` : `${v.name} 프리미엄 해제 — 이제 포스터는 관리자 승인 후 공개됩니다`, 'info');
    } catch { toast.show('변경에 실패했습니다', 'error'); }
  };

  const setVerify = async (v: Venue, status: VenueVerificationStatus) => {
    try {
      await setVenueVerification(v.id, status);
      setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, verificationStatus: status } : x)));
      toast.show(`${v.name} 인증 ${status === 'verified' ? '승인' : '해제'}`, 'info');
    } catch { toast.show('변경에 실패했습니다', 'error'); }
  };

  const remove = async (v: Venue) => {
    try {
      // 서버는 장부·이용권·출석 등 기록이 있는 매장의 삭제를 거부한다(20261001d) — 그때는 숨김(보관)으로 안내한다.
      const r = await removeOrArchiveVenue(v);
      if (r === 'cancelled') return;
      if (r === 'archived') {
        setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: 'hidden' } : x)));
        toast.show(`${v.name} 숨김(보관) 처리됨 — 기록은 보존됩니다`, 'info');
        return;
      }
      await logActivity({
        action: 'delete', targetType: 'venue', targetId: v.id, targetOwnerId: v.ownerId,
        targetSummary: v.name, actorName: user?.name,
      });
      setVenues((prev) => prev.filter((x) => x.id !== v.id));
      toast.show(`${v.name} 삭제됨`, 'error');
    } catch (e) { toast.show(msgOf(e, '삭제에 실패했습니다'), 'error'); }
  };

  // 드래그 종료 → 순서 재배치 + 저장(낙관적, 실패 시 롤백)
  const handleDragEnd = useCallback(async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    let reordered: Venue[] | null = null;
    let previous: Venue[] | null = null;
    setVenues((prev) => {
      const oldIndex = prev.findIndex((x) => x.id === active.id);
      const newIndex = prev.findIndex((x) => x.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      previous = prev;
      reordered = arrayMove(prev, oldIndex, newIndex).map((x, i) => ({ ...x, displayOrder: i + 1 }));
      return reordered;
    });
    if (!reordered) return;
    try {
      await reorderVenues({ items: (reordered as Venue[]).map((x, i) => ({ id: x.id, displayOrder: i + 1 })) });
      toast.show('노출 순서를 변경했습니다', 'info');
    } catch {
      if (previous) setVenues(previous);
      toast.show('순서 변경에 실패했습니다', 'error');
    }
  }, [toast]);

  const handlers: RowHandlers = { onStatus: changeStatus, onToggleAd: toggleAd, onVerify: setVerify, onRemove: remove };

  if (loading) return <p className="py-8 text-center text-xs text-ink-muted">불러오는 중…</p>;

  return (
    <div className="space-y-2">
      <input
        type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="매장명·지역 검색" className="input"
      />
      {!query && venues.length > 1 && (
        <p className="text-2xs text-ink-muted px-0.5">
          왼쪽 <b className="text-ink-secondary">손잡이</b>를 꾹 눌러 <b className="text-ink-secondary">드래그</b>하면 노출 순서를 바꿀 수 있습니다. (앞 번호 순서대로 노출 · 검색 중에는 순서 변경 불가)
        </p>
      )}
      {err != null ? (
        <LoadErrorCard error={err} what="매장 목록" onRetry={load} />
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-muted">매장이 없습니다</p>
      ) : query ? (
        // 검색 중: 순서 변경 없이 일반 목록
        <ul className="space-y-1.5">
          {filtered.map((v) => (
            <li key={v.id} className="rounded-aura border card-aura p-2.5 space-y-2">
              <RowContent venue={v} order={venues.findIndex((x) => x.id === v.id) + 1} handlers={handlers} />
            </li>
          ))}
        </ul>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={venues.map((v) => v.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1.5">
              {venues.map((v, i) => (
                <SortableVenueRow key={v.id} venue={v} order={i + 1} handlers={handlers} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

// ── 드래그 핸들 ───────────────────────────────────────────────────────────────
function GripIcon() {
  return (
    <svg width="14" height="18" viewBox="0 0 16 20" fill="currentColor" aria-hidden>
      <circle cx="5" cy="4"  r="1.5" /><circle cx="11" cy="4"  r="1.5" />
      <circle cx="5" cy="10" r="1.5" /><circle cx="11" cy="10" r="1.5" />
      <circle cx="5" cy="16" r="1.5" /><circle cx="11" cy="16" r="1.5" />
    </svg>
  );
}

// ── 정렬 가능한 매장 행 ────────────────────────────────────────────────────────
function SortableVenueRow({ venue, order, handlers }: { venue: Venue; order: number; handlers: RowHandlers }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: venue.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'rounded-aura border card-aura p-2.5 space-y-2',
        // 드래그 중엔 accent 테두리 + 링(유틸이 card-aura 의 테두리·그림자를 이긴다). 평소 테두리는 card-aura 몫.
        isDragging ? 'border-accent-400 shadow-[0_0_12px_rgb(var(--accent-300)/0.22)] opacity-90 z-10' : '',
      ].join(' ')}
    >
      <RowContent
        venue={venue}
        order={order}
        handlers={handlers}
        dragHandle={
          <button
            type="button"
            aria-label="드래그하여 순서 변경"
            className="shrink-0 touch-none cursor-grab active:cursor-grabbing -ml-1 p-1 text-ink-muted hover:text-ink-secondary"
            {...attributes}
            {...listeners}
          >
            <GripIcon />
          </button>
        }
      />
    </li>
  );
}

// ── 행 내용(드래그/검색 공통) ──────────────────────────────────────────────────
function RowContent({ venue: v, order, handlers, dragHandle }: {
  venue: Venue; order: number; handlers: RowHandlers; dragHandle?: React.ReactNode;
}) {
  const st = STATUS_LABEL[v.status ?? 'active'];
  const [premiumDays, setPremiumDays] = useState(0);
  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {dragHandle}
        <span className="shrink-0 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-badge bg-surface-high border border-border-default text-2xs font-bold text-ink-secondary tabular-nums">{order}</span>
        <span className="text-sm font-semibold text-ink-primary truncate">{v.name}</span>
        <span className={['text-2xs px-1.5 py-0.5 rounded-badge border font-semibold', st.cls].join(' ')}>{st.label}</span>
        {v.isPaidAd && <span data-testid="venue-premium-badge" title="프리미엄 매장 — 포스터가 관리자 승인 없이 바로 공개됩니다" className="inline-flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded-badge bg-accent-300 text-white font-bold"><Icon name="star-fill" size={10} className="shrink-0" />프리미엄{v.premiumUntil ? ` ~${premiumEnd(v.premiumUntil)}` : ''}</span>}
        {v.verificationStatus === 'verified' && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-accent-300/15 text-accent-300 border border-accent-400/40 font-bold">인증</span>}
        {v.verificationStatus === 'pending' && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">인증 심사 중</span>}
        {(v.kind ?? 'venue') !== 'venue' && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-surface-high text-ink-secondary border border-border-default font-semibold">그룹</span>}
        {!v.approved && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">미승인 · 승인은 '승인 대기' 섹션</span>}
        <span className="text-2xs text-ink-muted ml-auto truncate">{v.region}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {v.status !== 'active'    && <Btn onClick={() => handlers.onStatus(v, 'active', '활성화')}    variant="success">활성화</Btn>}
        {v.status !== 'hidden'    && <Btn onClick={() => handlers.onStatus(v, 'hidden', '숨김')}      variant="warn">숨김</Btn>}
        {v.status !== 'suspended' && <Btn onClick={() => handlers.onStatus(v, 'suspended', '정지')}   variant="warn">정지</Btn>}
        {v.status !== 'inactive'  && <Btn onClick={() => handlers.onStatus(v, 'inactive', '비활성')}  variant="muted">비활성</Btn>}
        {/* 프리미엄 기간. 포스터 즉시 공개는 매장(kind='venue')만이다 — 그룹은 상단 정렬·배지만(서버 _venue_premium_active). */}
        {!v.isPaidAd && (
          <select aria-label={`${v.name} 프리미엄 기간`} value={premiumDays} onChange={(e) => setPremiumDays(Number(e.target.value))}
            className="h-7 rounded-input border border-border-default bg-surface-high px-1.5 text-2xs font-semibold text-ink-secondary">
            {PREMIUM_DAYS.map(([d, label]) => <option key={d} value={d}>{label}</option>)}
          </select>
        )}
        <Btn onClick={() => handlers.onToggleAd(v, premiumDays)} variant={v.isPaidAd ? 'muted' : 'gold'}>{v.isPaidAd ? '프리미엄 해제' : '프리미엄 지정'}</Btn>
        {v.verificationStatus !== 'verified'
          ? <Btn onClick={() => handlers.onVerify(v, 'verified')} variant="gold">인증 승인</Btn>
          : <Btn onClick={() => handlers.onVerify(v, 'unverified')} variant="muted">인증 해제</Btn>}
        <Btn onClick={() => handlers.onRemove(v)} variant="danger">삭제</Btn>
      </div>
    </>
  );
}

function Btn({ onClick, variant, children }: {
  onClick: () => void;
  variant: 'success' | 'warn' | 'danger' | 'muted' | 'gold';
  children: React.ReactNode;
}) {
  const cls = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25',
    warn:    'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25',
    danger:  'bg-danger/15 text-danger-light border-danger/30 hover:bg-danger/25',
    muted:   'bg-surface-high text-ink-muted border-border-default hover:text-ink-secondary',
    gold:    'bg-accent-300/15 text-accent-300 border-accent-400/30 hover:bg-accent-300/25',
  }[variant];
  return (
    <button type="button" onClick={onClick} className={`text-2xs font-semibold px-2 py-1 rounded-chip border transition-colors active:scale-95 ${cls}`}>
      {children}
    </button>
  );
}
