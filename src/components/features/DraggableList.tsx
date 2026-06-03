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
import { reorderSchedules, togglePremium, toggleCompetition, type Schedule } from '../../api/schedules';

// ── 상태 타입 ────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ── 서브컴포넌트: 드래그 핸들 ────────────────────────────────────────────────

function DragHandle({ listeners, attributes }: {
  listeners?: SyntheticListenerMap;
  attributes?: DraggableAttributes;
}) {
  return (
    <button
      type="button"
      aria-label="드래그하여 순서 변경"
      className="touch-none cursor-grab active:cursor-grabbing p-1 text-ink-muted hover:text-ink-secondary transition-colors"
      {...listeners}
      {...attributes}
    >
      {/* 6-dot grip 아이콘 */}
      <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden>
        <circle cx="5" cy="4"  r="1.5" /><circle cx="11" cy="4"  r="1.5" />
        <circle cx="5" cy="10" r="1.5" /><circle cx="11" cy="10" r="1.5" />
        <circle cx="5" cy="16" r="1.5" /><circle cx="11" cy="16" r="1.5" />
      </svg>
    </button>
  );
}

// ── 서브컴포넌트: 정렬 가능한 행 ─────────────────────────────────────────────

interface SortableRowProps {
  item: Schedule;
  index: number;
  isDragging: boolean;
  onPremiumToggle: (id: string, current: boolean) => void;
  onCompetitionToggle: (id: string, current: boolean) => void;
}

function SortableRow({ item, index, isDragging, onPremiumToggle, onCompetitionToggle }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSelfDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-3 px-3 py-3',
        'bg-surface-low border border-border-subtle rounded-card',
        'transition-shadow duration-150',
        isSelfDragging
          ? 'opacity-0'                               // 원본은 투명 처리 (Overlay가 대신 표시)
          : isDragging
          ? 'opacity-60'                              // 다른 아이템 드래그 중: 흐리게
          : 'hover:border-border-default hover:shadow-card',
      ].join(' ')}
    >
      {/* 순서 번호 */}
      <span className="w-6 text-center text-xs text-ink-muted font-mono shrink-0">
        {index + 1}
      </span>

      <DragHandle listeners={listeners} attributes={attributes} />

      {/* 프리미엄 배지 토글 */}
      <button
        type="button"
        aria-label={item.isPremium ? '프리미엄 해제' : '프리미엄 지정'}
        title={item.isPremium ? '프리미엄 해제' : '프리미엄으로 상단 고정'}
        onClick={() => onPremiumToggle(item.id, item.isPremium)}
        className="shrink-0 transition-transform hover:scale-110 active:scale-95"
      >
        <svg
          width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden
          className="transition-colors"
        >
          <path
            d="M9 2L11.09 6.26L15.82 6.91L12.41 10.24L13.18 15L9 12.77L4.82 15L5.59 10.24L2.18 6.91L6.91 6.26L9 2Z"
            fill={item.isPremium ? '#FFD100' : 'none'}
            stroke={item.isPremium ? '#FFD100' : '#5A6175'}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* 대회 분류 토글 — [대회] 필터 노출 */}
      <button
        type="button"
        aria-label={item.isCompetition ? '대회 분류 해제' : '대회로 분류'}
        title={item.isCompetition ? '대회 분류 해제' : '[대회] 필터에 노출'}
        onClick={() => onCompetitionToggle(item.id, item.isCompetition ?? false)}
        className={[
          'shrink-0 text-2xs font-bold px-1.5 py-1 rounded-badge border transition-colors active:scale-95',
          item.isCompetition
            ? 'bg-gold-300/15 text-gold-300 border-gold-400/40'
            : 'bg-surface-high text-ink-muted border-border-default hover:text-ink-secondary',
        ].join(' ')}
      >
        대회
      </button>

      {/* 요강 정보 */}
      <div className="flex-1 min-w-0">
        <p className={[
          'text-sm font-medium truncate',
          item.isPremium ? 'text-gold-300' : 'text-ink-primary',
        ].join(' ')}>
          {item.isPremium && (
            <span className="inline-block mr-1.5 text-2xs bg-gold-300 text-ink-inverse px-1.5 py-0.5 rounded-badge font-bold">
              TOP
            </span>
          )}
          {item.title}
        </p>
        <p className="text-xs text-ink-muted mt-0.5 truncate">
          <span className="inline-block mr-1 px-1 py-0.5 rounded-badge bg-surface-high text-2xs">
            {item.format}
          </span>
          {item.pubName} · {item.region} · 바이인 {item.buyIn.amount.toLocaleString()}
        </p>
      </div>

      {/* 날짜 */}
      <span className="shrink-0 text-xs text-ink-muted tabular-nums">
        {item.date.slice(5).replace('-', '/')} {item.startTime}
      </span>
    </li>
  );
}

// ── 드래그 오버레이 카드 (드래그 중인 아이템 고스트) ─────────────────────────

function DragOverlayCard({ item }: { item: Schedule }) {
  return (
    <div className={[
      'flex items-center gap-3 px-3 py-3',
      'bg-surface-float border border-gold-400 rounded-card shadow-gold',
      'rotate-1 scale-[1.02] cursor-grabbing',
    ].join(' ')}>
      <span className="w-6" />
      <DragHandle />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-primary truncate">{item.title}</p>
        <p className="text-xs text-ink-muted mt-0.5 truncate">{item.pubName}</p>
      </div>
    </div>
  );
}

// ── 저장 상태 피드백 바 ───────────────────────────────────────────────────────

function SaveStatusBar({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;

  const config = {
    saving: { bg: 'bg-surface-float',  text: 'text-ink-secondary', msg: '저장 중…' },
    saved:  { bg: 'bg-green-900/40',   text: 'text-green-400',     msg: '순서가 저장되었습니다.' },
    error:  { bg: 'bg-danger/20',      text: 'text-danger-light',  msg: '저장 실패. 다시 시도해 주세요.' },
  }[status];

  return (
    <div className={[
      'flex items-center gap-2 px-4 py-2 rounded-input text-sm animate-slide-up',
      config.bg, config.text,
    ].join(' ')}>
      {status === 'saving' && (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {config.msg}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

interface DraggableListProps {
  initialItems: Schedule[];
}

/**
 * DraggableList — 관리자용 노출 순서 재배치 컴포넌트
 *
 * - @dnd-kit: Pointer / Touch / Keyboard 세 가지 센서 지원 (접근성 포함)
 * - 드래그 종료 시 낙관적 UI 업데이트 → API PATCH 요청 → 실패 시 롤백
 * - 별(★) 버튼으로 프리미엄 상단 고정 즉시 적용
 */
export default function DraggableList({ initialItems }: DraggableListProps) {
  const [items, setItems]         = useState<Schedule[]>(initialItems);
  const [activeId, setActiveId]   = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // 센서: 마우스/터치는 5px 이동 후 드래그 시작 (클릭 오인 방지)
  const sensors = useSensors(
    useSensor(PointerSensor,  { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,    { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  // ── 드래그 핸들러 ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  }, []);

  const handleDragEnd = useCallback(async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // 낙관적 UI 업데이트
    const reordered = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      displayOrder: idx + 1,
    }));
    const previous = items; // 롤백용 스냅샷
    setItems(reordered);

    // API 전송
    setSaveStatus('saving');
    try {
      await reorderSchedules({
        items: reordered.map(({ id, displayOrder }) => ({ id, displayOrder })),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setItems(previous);          // 롤백
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [items]);

  // ── 프리미엄 토글 ─────────────────────────────────────────────────────────

  const handlePremiumToggle = useCallback(async (id: string, current: boolean) => {
    // 낙관적 업데이트
    setItems((prev) =>
      prev.map((item) => item.id === id ? { ...item, isPremium: !current } : item),
    );
    try {
      await togglePremium(id, !current);
    } catch {
      // 실패 시 롤백
      setItems((prev) =>
        prev.map((item) => item.id === id ? { ...item, isPremium: current } : item),
      );
    }
  }, []);

  // ── 대회 분류 토글 ───────────────────────────────────────────────────────
  const handleCompetitionToggle = useCallback(async (id: string, current: boolean) => {
    setItems((prev) =>
      prev.map((item) => item.id === id ? { ...item, isCompetition: !current } : item),
    );
    try {
      await toggleCompetition(id, !current);
    } catch {
      setItems((prev) =>
        prev.map((item) => item.id === id ? { ...item, isCompetition: current } : item),
      );
    }
  }, []);

  // ── 렌더링 ────────────────────────────────────────────────────────────────

  return (
    <section className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink-primary">
          노출 순서 관리
          <span className="ml-2 text-sm font-normal text-ink-muted">
            ({items.length}개)
          </span>
        </h2>
        <SaveStatusBar status={saveStatus} />
      </div>

      {/* 드래그 컨텍스트 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {items.map((item, index) => (
              <SortableRow
                key={item.id}
                item={item}
                index={index}
                isDragging={activeId !== null}
                onPremiumToggle={handlePremiumToggle}
                onCompetitionToggle={handleCompetitionToggle}
              />
            ))}
          </ol>
        </SortableContext>

        {/* 드래그 중 마우스/손가락을 따라다니는 고스트 카드 */}
        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
          {activeItem ? <DragOverlayCard item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
