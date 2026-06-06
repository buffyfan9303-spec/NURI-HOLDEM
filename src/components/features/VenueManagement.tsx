// src/components/features/VenueManagement.tsx
// 관리자 '게시물 관리' > 매장 관리: 노출 순서(드래그) + 활성/비활성/정지/숨김 + AD + 인증 + 삭제.
import { useEffect, useState, useCallback } from 'react';
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
  getAllVenues, updateVenueStatus, setVenueAd, deleteVenue, logActivity, setVenueVerification, reorderVenues,
} from '../../api/community';
import type { Venue, VenueStatus, VenueVerificationStatus } from '../../api/community';

const STATUS_LABEL: Record<VenueStatus, { label: string; cls: string }> = {
  active:    { label: '활성',   cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  inactive:  { label: '비활성', cls: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40' },
  suspended: { label: '정지',   cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  hidden:    { label: '숨김',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
};

interface RowHandlers {
  onStatus: (v: Venue, status: VenueStatus, label: string) => void;
  onToggleAd: (v: Venue) => void;
  onVerify: (v: Venue, status: VenueVerificationStatus) => void;
  onRemove: (v: Venue) => void;
}

export default function VenueManagement() {
  const toast = useToast();
  const { user } = useAuth();
  const [venues, setVenues]   = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let active = true;
    getAllVenues()
      .then((v) => { if (active) setVenues(v); })
      .catch(() => { if (active) toast.show('매장 목록을 불러오지 못했습니다', 'error'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const toggleAd = async (v: Venue) => {
    const next = !v.isPaidAd;
    try {
      await setVenueAd(v.id, next);
      setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, isPaidAd: next } : x)));
      toast.show(`${v.name} AD ${next ? 'ON' : 'OFF'}`, 'info');
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
    if (!confirm(`'${v.name}' 매장을 완전히 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteVenue(v.id);
      await logActivity({
        action: 'delete', targetType: 'venue', targetId: v.id, targetOwnerId: v.ownerId,
        targetSummary: v.name, actorName: user?.name,
      });
      setVenues((prev) => prev.filter((x) => x.id !== v.id));
      toast.show(`${v.name} 삭제됨`, 'error');
    } catch { toast.show('삭제에 실패했습니다', 'error'); }
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
        type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="매장명·지역 검색" className="input"
      />
      {!query && venues.length > 1 && (
        <p className="text-2xs text-ink-muted px-0.5">
          왼쪽 <b className="text-ink-secondary">손잡이</b>를 꾹 눌러 <b className="text-ink-secondary">드래그</b>하면 노출 순서를 바꿀 수 있어요. (앞 번호 순서대로 노출 · 검색 중에는 순서 변경 불가)
        </p>
      )}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-muted">매장이 없습니다</p>
      ) : query ? (
        // 검색 중: 순서 변경 없이 일반 목록
        <ul className="space-y-1.5">
          {filtered.map((v) => (
            <li key={v.id} className="rounded-card border border-border-default bg-surface-low p-2.5 space-y-2">
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
        'rounded-card border bg-surface-low p-2.5 space-y-2',
        isDragging ? 'border-gold-400 shadow-gold opacity-90 z-10' : 'border-border-default',
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
  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {dragHandle}
        <span className="shrink-0 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-badge bg-surface-high border border-border-default text-2xs font-bold text-ink-secondary tabular-nums">{order}</span>
        <span className="text-sm font-semibold text-ink-primary truncate">{v.name}</span>
        <span className={['text-2xs px-1.5 py-0.5 rounded-badge border font-semibold', st.cls].join(' ')}>{st.label}</span>
        {v.isPaidAd && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-gold-300 text-ink-inverse font-bold">AD</span>}
        {v.verificationStatus === 'verified' && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-gold-300/15 text-gold-300 border border-gold-400/40 font-bold">인증</span>}
        {v.verificationStatus === 'pending' && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">인증 심사중</span>}
        {!v.approved && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">미승인</span>}
        <span className="text-2xs text-ink-muted ml-auto truncate">{v.region}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {v.status !== 'active'    && <Btn onClick={() => handlers.onStatus(v, 'active', '활성화')}    variant="success">활성화</Btn>}
        {v.status !== 'hidden'    && <Btn onClick={() => handlers.onStatus(v, 'hidden', '숨김')}      variant="warn">숨김</Btn>}
        {v.status !== 'suspended' && <Btn onClick={() => handlers.onStatus(v, 'suspended', '정지')}   variant="warn">정지</Btn>}
        {v.status !== 'inactive'  && <Btn onClick={() => handlers.onStatus(v, 'inactive', '비활성')}  variant="muted">비활성</Btn>}
        <Btn onClick={() => handlers.onToggleAd(v)} variant={v.isPaidAd ? 'muted' : 'gold'}>{v.isPaidAd ? 'AD 끄기' : 'AD 켜기'}</Btn>
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
    gold:    'bg-gold-300/15 text-gold-300 border-gold-400/30 hover:bg-gold-300/25',
  }[variant];
  return (
    <button type="button" onClick={onClick} className={`text-2xs font-semibold px-2 py-1 rounded-badge border transition-colors active:scale-95 ${cls}`}>
      {children}
    </button>
  );
}
