import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { CSS } from '@dnd-kit/utilities';
import { reorderVenues, type Venue } from '../../api/community';

// ── 상태 타입 ────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ── 드래그 핸들 ──────────────────────────────────────────────────────────────

function DragHandle({ listeners, attributes }: {
  listeners?: SyntheticListenerMap;
  attributes?: DraggableAttributes;
}) {
  return (
    <button
      type="button"
      aria-label="드래그하여 매장 순서 변경"
      className="touch-none cursor-grab active:cursor-grabbing p-1 text-ink-muted hover:text-ink-secondary transition-colors"
      {...listeners}
      {...attributes}
    >
      <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden>
        <circle cx="5" cy="4"  r="1.5" /><circle cx="11" cy="4"  r="1.5" />
        <circle cx="5" cy="10" r="1.5" /><circle cx="11" cy="10" r="1.5" />
        <circle cx="5" cy="16" r="1.5" /><circle cx="11" cy="16" r="1.5" />
      </svg>
    </button>
  );
}

// ── 매장 행 ───────────────────────────────────────────────────────────────────

function VenueRow({ venue, index, isDragging }: { venue: Venue; index: number; isDragging: boolean }) {
  const {
    attributes, listeners, setNodeRef, transform, transition,
    isDragging: isSelfDragging,
  } = useSortable({ id: venue.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-3 px-3 py-3',
        'bg-surface-low border border-border-subtle rounded-card',
        'transition-shadow duration-150',
        isSelfDragging ? 'opacity-0' : isDragging ? 'opacity-60' : 'hover:border-border-default hover:shadow-card',
      ].join(' ')}
    >
      <span className="w-6 text-center text-xs text-ink-muted font-mono shrink-0">{index + 1}</span>
      <DragHandle listeners={listeners} attributes={attributes} />

      {/* 매장 아이콘 */}
      <div
        className="w-9 h-9 shrink-0 rounded-card flex items-center justify-center text-sm font-bold text-white"
        style={{ background: `linear-gradient(135deg, ${venue.themeColor ?? '#5A6175'}, #0a0c0f)` }}
        aria-hidden
      >
        {venue.name[0]}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-primary truncate">
          {venue.isPaidAd && (
            <span className="inline-block mr-1.5 text-2xs bg-gold-300 text-ink-inverse px-1.5 py-0.5 rounded-badge font-bold">
              AD
            </span>
          )}
          {venue.name}
        </p>
        <p className="text-xs text-ink-muted mt-0.5 truncate">
          {venue.region}
          {venue.followerCount !== undefined && <> · 팔로워 {venue.followerCount.toLocaleString()}</>}
        </p>
      </div>
    </li>
  );
}

function VenueOverlayCard({ venue }: { venue: Venue }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 bg-surface-float border border-gold-400 rounded-card shadow-gold rotate-1 scale-[1.02] cursor-grabbing">
      <span className="w-6" />
      <DragHandle />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-primary truncate">{venue.name}</p>
        <p className="text-xs text-ink-muted mt-0.5 truncate">{venue.region}</p>
      </div>
    </div>
  );
}

function SaveStatusBar({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  const config = {
    saving: { bg: 'bg-surface-float', text: 'text-ink-secondary', msg: '저장 중…' },
    saved:  { bg: 'bg-green-900/40',  text: 'text-green-400',     msg: '매장 순서가 저장되었습니다.' },
    error:  { bg: 'bg-danger/20',     text: 'text-danger-light',  msg: '저장 실패. 다시 시도해 주세요.' },
  }[status];
  return (
    <div className={['flex items-center gap-2 px-4 py-2 rounded-input text-sm animate-slide-up', config.bg, config.text].join(' ')}>
      {status === 'saving' && <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />}
      {config.msg}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

/**
 * VenueDraggableList — 관리자용 매장 노출 순서 재배치
 * 드래그 종료 시 낙관적 UI 업데이트 → reorderVenues PATCH → 실패 시 롤백.
 */
export default function VenueDraggableList({ initialItems }: { initialItems: Venue[] }) {
  const [items, setItems]           = useState<Venue[]>(initialItems);
  const [activeId, setActiveId]     = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const sensors = useSensors(
    useSensor(PointerSensor,  { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,    { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  const handleDragStart = useCallback(({ active }: DragStartEvent) => setActiveId(String(active.id)), []);

  const handleDragEnd = useCallback(async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // 낙관적 업데이트
    const reordered = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({ ...item, displayOrder: idx + 1 }));
    const previous = items;
    setItems(reordered);

    setSaveStatus('saving');
    try {
      await reorderVenues({ items: reordered.map(({ id, displayOrder }) => ({ id, displayOrder: displayOrder ?? 999 })) });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setItems(previous); // 롤백
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [items]);

  if (items.length === 0) {
    return <p className="py-8 text-center text-xs text-ink-muted">등록된 매장이 없습니다</p>;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink-primary">
          매장 노출 순서
          <span className="ml-2 text-sm font-normal text-ink-muted">({items.length}개)</span>
        </h2>
        <SaveStatusBar status={saveStatus} />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {items.map((item, index) => (
              <VenueRow key={item.id} venue={item} index={index} isDragging={activeId !== null} />
            ))}
          </ol>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
          {activeItem ? <VenueOverlayCard venue={activeItem} /> : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
