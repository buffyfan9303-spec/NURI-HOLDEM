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
import { useEffect, useRef, useState } from 'react';
import Icon from '../atoms/Icon';
import EmptyState from '../atoms/EmptyState';
import LoadErrorCard from '../atoms/LoadErrorCard';
import type { EventListItem } from '../../api/events';
import { peekEventList, fetchEventList } from '../../lib/eventListCache';
import type { EventState } from '../../lib/eventState';
import { useDialogFocus } from '../atoms/useDialogFocus';
// 아래로 끌어 닫기(2026-09-21 추가 요구, 실행문 §5) — Modal.tsx 의 page 변형(bodyDrag)과 **같은 조리법**을
// 그대로 재사용한다. 새 제스처 라이브러리를 넣지 않는다 — presentationY/springTo 는 atoms/Modal.tsx 가
// 이미 실전에서 검증한 WAAPI 스프링이다(src/lib/spring.ts). 여기서는 판정 순서만 재구현한다.
import { presentationY, project, releaseVelocity, rubberband, springTo, type VelSample } from '../../lib/spring';

/** 텍스트를 편집 중인 컨트롤 — 여기서 시작한 손짓은 절대 '닫기'로 해석하지 않는다(Modal.tsx 와 같은 목록). */
const EDITABLE_SEL = 'input,textarea,select,[contenteditable=""],[contenteditable="true"],[data-no-drag-close]';

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
  // 캐시가 있으면 첫 프레임부터 목록이다 — 스켈레톤을 거치지 않는다.
  const [items, setItems] = useState<EventListItem[] | null>(peekEventList);
  const [err, setErr] = useState<unknown>(null);
  const [loading, setLoading] = useState(() => peekEventList() === null);

  const load = () => {
    setErr(null);
    setLoading(items === null); // 이미 그린 목록(캐시)이 있으면 스켈레톤으로 되돌리지 않는다
    fetchEventList().then(setItems).catch(setErr).finally(() => setLoading(false));
  };
  // 열릴 때마다 새로 — 그 사이 캠페인이 새로 열리거나 끝났을 수 있다(EventPage.load 와 같은 이유).
  // 캐시로 먼저 그렸어도 여기서 다시 받아 덮는다(상태 배지가 낡은 채 남지 않게).
  useEffect(() => { if (open) load(); }, [open]);

  // U06(2026-09-12) 공유 계약 — Modal 을 쓰지 않는 풀스크린 오버레이(VenuePage·GroupPage 와 같은 부류)도
  // 같은 포커스 트랩·복원을 쓴다. 루트 자체가 스크롤러이자 dialog 라 같은 ref 하나를 씌운다.
  const rootRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, rootRef);

  // ── 아래로 끌어 닫기(E1·E2, 실행문 §5) ──────────────────────────────────────────
  // 루트 스크롤러 자체가 [data-testid=event-list-page] 다(중첩 overflow 스크롤러 없음 — 이미 확정된 사실).
  // React 합성 onTouchMove 는 passive 라 preventDefault 가 안 먹는다 → touchmove 만 네이티브 non-passive 로 건다.
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startOffset = useRef(0);
  const samples = useRef<VelSample[]>([]);
  const dragging = useRef(false); // 8px 히스테리시스를 넘겨 '드래그'로 확정됐는가
  // 드래그 뒤 브라우저가 보내는 합성 click 이 카드를 여는 것을 막는다. 다음 onTouchStart 에서
  // 무조건 다시 풀어준다 — click 이 끝내 안 오는 바운스백(원위치 복귀) 뒤에도 다음 탭이 영영 막히지 않게.
  const suppressClick = useRef(false);

  const resetGesture = () => {
    startX.current = null; startY.current = null; samples.current = []; dragging.current = false;
  };
  /** 확정되지 않았거나 취소된 드래그를 제자리로. presentationY 가 이미 0 이면 아무 일도 안 한다. */
  const cancelDrag = () => {
    const el = rootRef.current;
    resetGesture();
    if (el && presentationY(el) !== 0) void springTo(el, 0, { damping: 1, response: 0.3 });
  };

  const onListTouchStart = (e: React.TouchEvent) => {
    suppressClick.current = false;
    if (window.innerWidth >= 1024) return;
    const t = e.target as Element | null;
    if (t?.closest?.(EDITABLE_SEL)) return; // 입력 컨트롤 위에서 시작한 손짓은 닫기가 아니다
    if (e.touches.length > 1) return; // 멀티터치는 후보조차 아니다
    const el = rootRef.current;
    if (!el) return;
    if (el.scrollTop > 1) return; // 목록이 맨 위가 아니면 스크롤에 양보
    // ⚠ 순서 고정 — Modal.tsx 의 증명된 순서(먼저 읽고 그 다음 취소). 거꾸로 하면 WAAPI cancel() 이
    //   동기적으로 효과를 제거해, 닫히는 애니메이션 도중 재터치 시 시작 오프셋을 엉뚱한 값으로 읽어 패널이 튄다.
    const from = presentationY(el);
    for (const a of el.getAnimations()) a.cancel();
    startOffset.current = from;
    if (from) el.style.transform = `translateY(${from}px)`; // 닫히는 중 다시 잡은 경우 — 보이는 값에서 이어받는다
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    samples.current = [{ t: e.timeStamp, y: from }];
    dragging.current = false;
  };
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      const root = rootRef.current;
      if (!root) return;
      if (e.touches.length > 1) { cancelDrag(); return; }
      const dx = e.touches[0].clientX - (startX.current ?? 0);
      const dy = e.touches[0].clientY - startY.current;
      if (!dragging.current) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return; // 히스테리시스 — 탭과 드래그를 가른다
        // 가로 우세·위 방향·스크롤 중이면 닫지 않는다 — 스크롤에 양보(제자리 정리만 한다)
        if (Math.abs(dx) > Math.abs(dy) || dy < 0 || root.scrollTop > 1) { cancelDrag(); return; }
        dragging.current = true;
        suppressClick.current = true; // 확정된 순간부터 합성 click 가드를 건다
      }
      e.preventDefault(); // 확정된 뒤에만 — 네이티브 스크롤·삼성 당겨 새로고침을 막는다
      const y = startOffset.current + dy;
      const shown = y < 0 ? rubberband(y, root.offsetHeight || window.innerHeight) : y; // 위로는 고무줄
      root.style.transform = `translateY(${shown}px)`;
      samples.current.push({ t: e.timeStamp, y });
      if (samples.current.length > 8) samples.current.shift();
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    // 언마운트(X·브라우저 Back 이 App 의 onClose 로 이 컴포넌트를 즉시 걷어낸다) 시 남은 WAAPI 애니를
    // 정리한다 — springTo 는 취소된 애니의 완료 Promise 를 resolve 하지 않으므로(spring.ts 불변식),
    // 진행 중이던 닫기 애니의 옛 then(onClose) 가 나중에 되살아나 onClose 를 또 부르지 않는다.
    // ⚠ `el` 은 이 effect 가 처음 돈 시점에 잡은 변수다 — cleanup 시점의 rootRef.current 를 다시 읽지
    //   않는다(그때는 React 가 이미 ref 를 null 로 되돌렸을 수 있다).
    return () => {
      el.removeEventListener('touchmove', onMove);
      for (const a of el.getAnimations()) a.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onListTouchEnd = () => {
    if (startY.current == null) return;
    const el = rootRef.current;
    const wasDragging = dragging.current;
    const v = releaseVelocity(samples.current); // px/s — 아래가 양
    resetGesture();
    if (!el) return;
    if (!wasDragging) {
      // 짧은 터치·8px 미만도 되돌린다 — onListTouchStart 가 진행 중 애니를 취소하며 인라인 transform 으로
      // 얼렸을 수 있어서, 그냥 두면 시트가 그 위치에 굳는다(Modal.tsx onSheetEnd 와 같은 이유).
      if (presentationY(el) !== 0) void springTo(el, 0, { damping: 1, response: 0.3 });
      return;
    }
    const y = presentationY(el);
    const landing = y + project(v); // 투영 — 이 속도로 놓으면 어디까지 미끄러지나(Modal.tsx:269-290 조리법)
    if (v > 600 || (v >= 0 && landing > 120)) {
      const gone = y + (window.innerHeight - el.getBoundingClientRect().top) + 8;
      void springTo(el, gone, { damping: 1, response: 0.3, velocity: Math.max(v, 300) }).then(onClose);
      return;
    }
    void springTo(el, 0, { damping: Math.abs(v) > 400 ? 0.8 : 1, response: 0.35, velocity: v });
  };
  const onListTouchCancel = () => { if (startY.current != null) cancelDrag(); };
  // 드래그로 확정된 뒤 브라우저가 보내는 합성 click 을 한 번만 삼킨다(카드가 저절로 열리는 것을 막는다).
  const onListClickCapture = (e: React.MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };
  // MOTION-UNIFY P3 — 닫혀도 App 이 220ms 더 붙들어 둔다(useDelayedUnmount). 그동안 fade-out 으로 그린다.

  return (
    // z-[55] — EventPage(보드)와 같은 층이다. 이 컴포넌트가 App 에서 EventPage 보다 **먼저** 렌더되므로
    // 보드가 목록 위에서 이긴다(같은 z-index 는 DOM 순서가 이긴다) — 목록에서 카드를 고르면 보드가 덮고,
    // 보드를 닫으면 이 화면이 그대로 드러난다. z-[60]은 쓰지 않는다(Modal.tsx 의 시트·모달 층이라 겹치면
    // 안내 시트가 뒤에 깔린다 — EventPage 머리말 참고).
    <div ref={rootRef} data-testid="event-list-page" inert={!open || undefined}
      className={['fixed inset-0 z-[55] overflow-y-auto overscroll-contain bg-surface-base',
        open ? '' : 'animate-fade-out pointer-events-none'].join(' ')}
      role="dialog" aria-modal="true" aria-label="이벤트 목록"
      onTouchStart={onListTouchStart} onTouchEnd={onListTouchEnd} onTouchCancel={onListTouchCancel}
      onClickCapture={onListClickCapture}>
      {/* 작은 드래그 그립 — 모바일에서만, 조작 가능성을 알린다(Modal.tsx page 변형의 그립과 같은 문법).
          PC 는 onListTouchStart 가 1024px 이상에서 바로 return 해 드래그 자체가 없다 — 장식일 뿐이라 lg:hidden. */}
      <div aria-hidden data-testid="event-list-drag-grip"
        className="lg:hidden absolute top-1.5 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-ink-primary/25" />
      {/* 🔴 2026-09-18 오너: "PC 버젼에서 모든 탭이 제대로 잘 움직이다가 이벤트만 가면 갑자기
          전체화면으로 바뀌면서 지혼자서 이상하게 돼 이 부분도 수정 다른 탭들처럼".
          원인: 이 화면은 탭 pane 이 아니라 `fixed inset-0` 오버레이인데(App.tsx 의 'event' 는 pane 이 없다)
          안에 폭 제한이 하나도 없어 1440px 에서 **혼자만 풀블리드**로 펼쳐졌다.
          다른 탭은 전부 App.tsx:3450 의 셸(`mx-auto w-full max-w-6xl xl:border-x`) 안에서 그려진다.
          → 오버레이 **본문에 같은 셸**을 씌운다. 오버레이 자체는 inset-0 그대로 둔다 —
            배경이 화면을 덮어야 뒤 탭이 비쳐 보이지 않고, 뒤로가기 계약(useBackClose)도 그대로다.
          ⚠ `min-h-full` 이 필요하다. 없으면 xl 의 세로 테두리가 내용 높이에서 끊겨 셸이 반만 그려진다. */}
      <div className="mx-auto w-full max-w-6xl xl:min-h-full xl:border-x xl:border-border-subtle">
      {/* 헤더 구조는 EventPage 와 동일 — 노치 안전영역·히트영역 계약을 그대로 따른다. */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-subtle bg-surface-base/95 px-page-x pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] backdrop-blur">
        <button type="button" onClick={onClose} aria-label="닫기"
          className="hit -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-input text-ink-secondary transition-colors hover:bg-surface-high">
          <Icon name="chevron-left" size={20} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold text-ink-primary">이벤트</h1>
      </header>

      <div className="px-page-x pb-24 pt-3">
        {/* 스켈레톤은 **카드 한 장과 같은 상자**다(EVT-OPEN-STUTTER) — 테두리 1px·py-3·h-10 아이콘 = 카드 70px.
            예전엔 h-20 ×3(85px×3)이라 카드가 오는 순간 아래 경계가 202px 줄었다. 줄 수를 늘리지 마라
            (spaceReservation.contract.test.ts ⑤ 가 잠근다). */}
        {loading ? (
          <div aria-busy="true">
            <div className="skeleton rounded-aura border border-transparent py-3"><div className="h-10" /></div>
          </div>
        ) : err && !items ? (
          <LoadErrorCard error={err} what="이벤트 목록" onRetry={load} />
        ) : !items || items.length === 0 ? (
          err
            // 지난 목록이 비어 있었고 새로 받기도 실패 — '없어요'로 위장하지 않는다(K-03).
            ? <LoadErrorCard error={err} what="이벤트 목록" onRetry={load} />
            : <EmptyState title="진행 중인 이벤트가 없어요" hint="새 이벤트가 열리면 여기서 볼 수 있어요" icon={<Icon name="gift" />} />
        ) : (
          <>
          {/* 캐시로 그린 목록을 새로 받다 실패 — 목록은 두고(지우면 멀쩡한 정보가 사라진다) 낡았을 수 있다고 알린다(K-03). */}
          {err != null && <div className="mb-2"><LoadErrorCard compact error={err} what="최신 이벤트 목록" hint="아래는 마지막으로 불러온 목록이에요." onRetry={load} /></div>}
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
          </>
        )}
      </div>
      </div>
    </div>
  );
}
