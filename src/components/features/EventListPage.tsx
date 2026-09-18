// src/components/features/EventListPage.tsx — 이벤트 목록.
//
// 오너 지시(2026-09-18): "이벤트 탭을 누르면 이벤트 리스트로 이동하게 해".
// 종전에는 슬러그 없이 열면 '지금 열려 있는 캠페인' 보드로 바로 들어갔다 — 캠페인이 여럿일 때
// 나머지로 가는 길이 화면에 없었다(api/events.ts listEvents 주석 참고). 이 화면이 그 길이다.
//
// ⚠ 상태 판정은 다시 하지 않는다 — `listEvents()`(api/events.ts)가 `evaluateEvent` 하나로 이미 판정해
//   내려준 `state` 를 그대로 배지로만 옮긴다. 여기서 날짜를 다시 비교하면 홈·목록·상세가 다른 말을 한다.
// ⚠ 부제는 서버 값이 있을 때만 그린다(오너: 불필요한 설명줄을 만들지 마라) — 빈 줄을 만들지 않는다.
// ⚠ 글로우는 '진행 중' 에만(오너 2026-09-18) — 화면당 1곳 제한(구 v6)은 삭제되어 여러 칸에 걸어도 된다.
import { useEffect, useState } from 'react';
import Icon from '../atoms/Icon';
import EmptyState from '../atoms/EmptyState';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { listEvents, type EventListItem } from '../../api/events';
import type { EventState } from '../../lib/eventState';

/** 목록 배지는 셋뿐이다(오너 지시) — 소진·기간종료 등 세부 상태는 '종료' 로 접는다.
 *  라벨 문구 자체는 `EVENT_STATE_LABEL`(lib/eventState)과 다르다 — 그건 상세 화면의 세부 사유고,
 *  여기는 목록이라 세 갈래로 뭉뚱그린다(다른 화면이라 같은 상수를 억지로 맞추지 않는다). */
function badgeOf(state: EventState): { label: string; cls: string } {
  if (state === 'live') return { label: '진행 중', cls: 'border-accent-400/40 bg-accent-300/10 text-accent-200' };
  if (state === 'scheduled') return { label: '예정', cls: 'border-border-default bg-surface-high text-ink-secondary' };
  return { label: '종료', cls: 'border-border-subtle bg-surface-low text-ink-muted' };
}

/** `M/D` 만 — 목록 카드 한 줄에 들어갈 최소 정보. 연도까지 적으면 좁은 폭에서 줄바꿈된다. */
function fmtDate(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function EventListPage({ open, onClose, onSelect }: {
  open: boolean;
  onClose: () => void;
  /** 카드를 고르면 그 slug 로 보드를 연다 — App 의 `openEvent(slug)` 종전 보드-직행 경로를 그대로 탄다. */
  onSelect: (slug: string) => void;
}) {
  const [items, setItems] = useState<EventListItem[] | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setErr(null);
    setLoading(true);
    listEvents().then(setItems).catch(setErr).finally(() => setLoading(false));
  };
  // 열릴 때마다 새로 — 그 사이 캠페인이 새로 열리거나 끝났을 수 있다(EventPage.load 와 같은 이유).
  useEffect(() => { if (open) load(); }, [open]);

  if (!open) return null;

  return (
    // z-[55] — EventPage(보드)와 같은 층이다. 이 컴포넌트가 App 에서 EventPage 보다 **먼저** 렌더되므로
    // 보드가 목록 위에서 이긴다(같은 z-index 는 DOM 순서가 이긴다) — 목록에서 카드를 고르면 보드가 덮고,
    // 보드를 닫으면 이 화면이 그대로 드러난다. z-[60]은 쓰지 않는다(Modal.tsx 의 시트·모달 층이라 겹치면
    // 안내 시트가 뒤에 깔린다 — EventPage 머리말 참고).
    <div data-testid="event-list-page" className="fixed inset-0 z-[55] overflow-y-auto bg-surface-base" role="dialog" aria-modal="true" aria-label="이벤트 목록">
      {/* 헤더 구조는 EventPage 와 동일 — 노치 안전영역·히트영역 계약을 그대로 따른다. */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-subtle bg-surface-base/95 px-page-x pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] backdrop-blur">
        <button type="button" onClick={onClose} aria-label="닫기"
          className="hit -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-input text-ink-secondary transition-colors hover:bg-surface-high">
          <Icon name="chevron-left" size={20} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold text-ink-primary">이벤트</h1>
      </header>

      <div className="px-page-x pb-24 pt-3">
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-aura" />)}
          </div>
        ) : err ? (
          <LoadErrorCard error={err} what="이벤트 목록" onRetry={load} />
        ) : !items || items.length === 0 ? (
          <EmptyState title="진행 중인 이벤트가 없어요" hint="새 이벤트가 열리면 여기서 볼 수 있어요" icon={<Icon name="gift" />} />
        ) : (
          <ul className="space-y-2">
            {items.map((ev) => {
              const b = badgeOf(ev.state);
              const date = ev.state === 'scheduled' ? fmtDate(ev.startsAt) : ev.state === 'ended' ? fmtDate(ev.endsAt) : '';
              return (
                <li key={ev.slug}>
                  <button type="button" onClick={() => onSelect(ev.slug)} data-testid="event-list-item"
                    className={['flex w-full min-h-[44px] items-center gap-3 rounded-aura border card-aura px-3.5 py-3 text-left transition-colors hover:bg-surface-high/50 active:scale-[0.995]',
                      ev.state === 'live' ? 'ring-aura ring-aura-glow' : ''].join(' ')}>
                    <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input tile-grad">
                      <Icon name="gift" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-ink-primary">{ev.title}</span>
                        <span className={['shrink-0 rounded-chip border px-1.5 py-0.5 text-[10px] font-bold', b.cls].join(' ')}>{b.label}</span>
                      </div>
                      {/* 부제는 값이 있을 때만 — 빈 설명줄을 만들지 않는다(오너 지시). */}
                      {ev.subtitle && <p className="mt-0.5 truncate text-2xs text-ink-secondary">{ev.subtitle}</p>}
                      {date && <p className="mt-0.5 text-2xs text-ink-muted">{ev.state === 'scheduled' ? `${date} 시작` : `${date} 종료`}</p>}
                    </div>
                    <Icon name="chevron-right" size={16} className="shrink-0 text-ink-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
