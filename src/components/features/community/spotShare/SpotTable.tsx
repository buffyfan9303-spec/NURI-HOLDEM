// 게시판 SPOT 공유 — 시안 A(테이블 그림, 오너 2026-10-01 선택). 좌석 배치가 곧 상황 설명이다:
// 내 자리(아래 가운데)·Villain 자리·보드가 한눈에. 정본 캡처: spot-share-design/proto/a-*.png
// 원본: 시안 브랜치 NURI/spot-share-design-1001(b8982254) VariantTable.tsx.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { positionsFor, type SpotPosition } from '../../../../lib/spot';
import type { ShareView } from './shareView';
import { decisionLine, matchupLine } from './shareView';
import { Cards, ContextChips, StreetTimeline, type CardSize } from './ShareParts';
import { layoutFelt, type Box, type FeltOut } from './feltLayout';

/** 마지막으로 그 자리가 한 액션 — 좌석 아래 한 줄 */
function lastActionOf(v: ShareView, pos: SpotPosition): string | null {
  for (let i = v.streets.length - 1; i >= 0; i--) {
    const a = [...v.streets[i].actions].reverse().find((x) => x.pos === pos);
    if (a) return `${a.label}${a.sizeBb !== undefined ? ` ${a.sizeBb}` : ''}`;
  }
  return null;
}

//  ⚠ Tailwind 는 소스의 **글자 그대로**만 클래스로 만든다 — 변수로 조립한 변형(`${X}:flex-row`)은 CSS 가 안 생긴다
//    (2026-10-01 실측: 조립했더니 빌드 CSS 에 해당 규칙 0건). 그래서 아래 '@min-[290px]:' 를 매번 그대로 적는다.

const sizeOf = (el: Element | null | undefined): Box =>
  el instanceof HTMLElement ? { w: el.offsetWidth, h: el.offsetHeight } : { w: 0, h: 0 };

/**
 * 테이블 — 좌석은 시안 A 처럼 **타원 둘레**에(오너 2026-10-01 "시안처럼 타원 둘레로"), 보드는 좌석이 비운 자리에.
 * 자리 계산은 feltLayout.ts: 실제 상자 크기(px)를 재서 좌석끼리·좌석과 보드가 닿지 않게, 보드는 타원 안·내 카드 위에 놓는다.
 *   (타원 면의 inset-x-[8%] 는 feltLayout 의 OVAL_SIDE 와 짝이다 — 하나만 바꾸면 '타원 안' 판정이 어긋난다.)
 *   (구현 1차는 각도 % 로만 놓아 보드 4~5장에서 이름표가 보드를 덮었다 — e2e/spot-felt-geometry.spec.ts 가 잰다.)
 * 첫 그림은 레이아웃 효과에서 재고 바로 다시 그리므로(그리기 전) 자리 없는 프레임은 보이지 않는다.
 */
function Felt({ v, big }: { v: ShareView; big: boolean }) {
  const ring = positionsFor(v.tableSize);
  const heroIdx = Math.max(0, ring.indexOf(v.heroPos));
  const n = ring.length;
  // 내 자리(아래 가운데)에서 시계 방향 — 예전 타원 배치와 같은 각도
  const others = Array.from({ length: n - 1 }, (_, i) => ({ pos: ring[(heroIdx + i + 1) % n], angle: Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n }));
  const ref = useRef<HTMLDivElement>(null);
  const [lay, setLay] = useState<FeltOut | null>(null);

  useLayoutEffect(() => {
    const felt = ref.current;
    if (!felt) return;
    let lastKey = '';
    const run = () => {
      const W = felt.clientWidth;
      if (!W) return;
      const seats = [...felt.querySelectorAll<HTMLElement>('[data-slot]')]
        .map((el) => ({ key: el.dataset.slot!, angle: Number(el.dataset.angle), box: sizeOf(el) }))
        .filter((s) => s.box.w > 0);   // 숨긴 빈 좌석(display:none)은 자리를 차지하지 않는다
      const heroEl = felt.querySelector('[data-seat="hero"]');
      const next = layoutFelt({
        W,
        // 피드는 시안 피드 카드(≈320px)에 맞춘 낮은 테이블, 상세는 정사각에서 시작한다. 모자라면 feltLayout 이 키운다.
        minH: big ? W : Math.min(175, Math.max(150, W * 0.5)),
        maxH: big ? W * 1.5 : 260,
        hero: sizeOf(heroEl), heroCardH: sizeOf(heroEl?.firstElementChild).h,
        seats, board: sizeOf(felt.querySelector('[data-board]')),
      });
      const key = JSON.stringify(next);
      if (key !== lastKey) { lastKey = key; setLay(next); }
    };
    run();
    if (typeof ResizeObserver === 'undefined') return;
    // 폭(컨테이너 쿼리로 이름표 줄 수가 바뀐다)·글꼴 로드로 상자 크기가 바뀌면 다시 잰다. 자리 이동은 크기를 안 바꾼다(되먹임 없음).
    const ro = new ResizeObserver(run);
    ro.observe(felt);
    felt.querySelectorAll('[data-slot], [data-seat="hero"], [data-board]').forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [v, big]);

  const at = (p: { x: number; y: number } | undefined) =>
    p ? { left: p.x, top: p.y, transform: 'translate(-50%, -50%)' } : { left: 0, top: 0, visibility: 'hidden' as const };

  const label = (text: string, pos: SpotPosition) => (
    // 'Villain A · BTN'(오너 표기) — 인원·폭과 무관하게 **한 줄**(오너 2026-10-02 "7~9인도 한 줄, 좁으면 글자 축소").
    //   글자: 기본 text-2xs(11.7px). 7인 이상이거나 테이블 폭 290px 미만(320 화면)이면 10px — 최소 크기다(더 줄이지 않는다).
    //   예전엔 7인 이상·좁은 테이블에서 'Villain A' / 'UTG1' 두 줄로 나뉘며 가운데 '·' 가 빠졌다(독립 검토 10-02 §1).
    <span className={['inline-flex items-center whitespace-nowrap rounded-badge bg-surface-base/85 px-1.5 py-0.5 font-bold leading-none text-ink-primary ring-1 ring-border-default',
      v.tableSize > 6 ? 'text-[10px]' : 'text-2xs @max-[290px]:text-[10px]'].join(' ')} data-seat-label>
      {text}&nbsp;·&nbsp;{pos}
    </span>
  );
  // 좌석 아래 마지막 액션 — 상세만, 좁은 테이블(<290px)에서는 뺀다(같은 정보가 아래 스트리트 타임라인에 있다).
  //   지면색 받침: 받침 없이 테두리 선 위에 놓이면 라이트 390 에서 4.42(실측) — 빈 좌석 글자와 같은 이유.
  const actLine = (pos: SpotPosition) => {
    const act = big ? lastActionOf(v, pos) : null;
    return act ? <span className="hidden whitespace-nowrap rounded-badge bg-surface-base px-1 text-2xs font-semibold text-ink-secondary @min-[290px]:inline">{act}</span> : null;
  };

  return (
    <div ref={ref} className="@container relative w-full" style={{ height: lay?.H ?? (big ? undefined : 165), aspectRatio: lay || !big ? undefined : '1' }} data-felt>
      {/* 테이블 면 — 테마 토큰으로 칠한다(라이트·다크 모두 지면과 구분되게). 위쪽 좌석 가운데·내 카드 가운데를 지나게 놓는다. */}
      {lay && (
        <div aria-hidden data-felt-oval className="absolute inset-x-[8%] rounded-[999px] border border-accent-300/25 bg-[radial-gradient(ellipse_at_center,rgb(var(--accent-300)/0.20),rgb(var(--surface-high))_70%)]"
          style={{ top: lay.ovalTop, height: lay.ovalBottom - lay.ovalTop }} />
      )}
      {/* 보드 — 가운데에서 가까운, 좌석이 비운 자리. 없으면 스트리트 이름만 */}
      <div className="absolute inline-flex w-max" style={at(lay?.board)} data-board>
        {v.board.length > 0
          ? <Cards codes={v.board} size={big ? 'sm' : 'xs'} gap={3} />
          : <span className="whitespace-nowrap rounded-badge bg-surface-base/70 px-2 py-0.5 text-2xs font-semibold text-ink-secondary">{v.streetName}</span>}
      </div>
      {others.map(({ pos, angle }) => {
        const vilIdx = v.villains.findIndex((x) => x.pos === pos);
        const vil = vilIdx >= 0 ? v.villains[vilIdx] : null;
        if (!vil) {
          // 빈 좌석 — 피드에서는 뺀다(상황 설명에 필요 없다). 상세에서만 자리 이름을 보인다.
          if (!big) return null;
          // 대비: 받침 없이 펠트 위에 두면 라이트에서 테이블 테두리 선과 겹칠 때 4.34~4.46(AA 미달, 독립 검토 실측) → 지면색 받침.
          //   7인 이상 + 좁은 테이블(<290px)은 빈 자리 이름을 뺀다 — 둘레가 붐벼 상대 블록이 밀려났다(실측 320 상세 9인 상대 3명).
          return (
            <span key={pos} data-slot={pos} data-angle={angle} style={at(lay?.seats[pos])} data-seat-empty
              className={['absolute w-max whitespace-nowrap rounded-badge bg-surface-base px-1 py-0.5 text-2xs font-semibold leading-none text-ink-secondary',
                v.tableSize > 6 ? 'hidden @min-[290px]:inline' : ''].join(' ')}>{pos}</span>
          );
        }
        return (
          <div key={pos} data-slot={pos} data-angle={angle} style={at(lay?.seats[pos])} data-seat={vil.letter}
            className="absolute flex w-max flex-col items-center gap-0.5">
            {/* e2e 계약: 가린 상대는 'spot-villain-hidden', 공개된 상대 카드는 'spot-villain-cards'(Villain A 자리 하나에만 단다). */}
            <Cards codes={vil.cards} size={big ? 'sm' : 'xs'} gap={2} hidden={v.hidden}
              testId={vilIdx === 0 && big ? (v.hidden ? 'spot-villain-hidden' : 'spot-villain-cards') : undefined} />
            {label(vil.label, pos)}
            {actLine(pos)}
          </div>
        );
      })}
      <div className="absolute flex w-max flex-col items-center gap-0.5" style={at(lay?.hero)} data-seat="hero">
        <Cards codes={v.hero} size={(big ? 'md' : 'sm') as CardSize} gap={3} />
        <span className="whitespace-nowrap rounded-badge bg-accent-300 px-1.5 py-0.5 text-2xs font-bold leading-none text-white">나 {v.heroPos}</span>
        {actLine(v.heroPos)}
      </div>
    </div>
  );
}

/** 피드 카드 안 미리보기 — 테이블 + 결정 지점·맥락 한 줄 + 고를 보기. 투표 수·분포는 싣지 않는다(목록 N+1 금지). */
export function SpotTableFeed({ v }: { v: ShareView }) {
  return (
    <div className="mt-1.5 flex flex-col gap-1" data-spot-feed>
      {/* 테이블은 카드 가운데에 — 본문 칸은 아바타(24px)+간격(0.5rem)만큼 오른쪽으로 들어가 있어 그만큼 왼쪽으로 뺀다
          (PostRowCard 의 'flex items-start gap-2' + Avatar size 24 와 짝). 안 빼면 타원이 오른쪽으로 치우친다(오너 10-01). */}
      <div style={{ marginLeft: 'calc(-24rem / 17 - 0.5rem)', width: 'calc(100% + 24rem / 17 + 0.5rem)' }}>
        <Felt v={v} big={false} />
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <b className="font-bold text-ink-primary">{decisionLine(v)}</b>
        <ContextChips v={v} />
      </p>
      <p className="text-xs font-semibold text-accent-200" data-spot-choices>
        {v.choices.join(' · ')} — 당신이라면?{v.hidden ? '' : ' · 공개됨'}
      </p>
    </div>
  );
}

/**
 * 상세 — 머리(매치업·맥락) → 테이블 → 스트리트 타임라인 → 메모 → 투표 → 공개 블록 → 하단 동작.
 * 투표·공개 블록·하단 동작은 호출부(SpotPostCard)가 실제 배선을 넣는다.
 *
 * 넓은 칸(≥ 520px — PC 2-pane·태블릿)은 두 단(3:2): 왼쪽 테이블·타임라인, 오른쪽 메모·투표·공개. 모바일은 한 단(같은 순서).
 *   🔴 독립 검토 10-02 §6: PC 2-pane 상세에서 테이블이 608px 정사각으로 커져 투표가 첫 화면 밖으로 밀렸다.
 *   테이블 폭만 420 으로 줄여서는 모자랐다(1440×900 실측: 칸 높이 748 에 투표 아래끝 1087 — 머리 190·테이블 420·리버 타임라인 249 가 위에 쌓인다).
 *   두 단이면 투표가 테이블 옆(칸 위끝에서 ≈ 430px)에 선다. 한 단 묶음은 display:contents 라 모바일 DOM 순서·간격이 그대로다.
 */
export function SpotTableDetail({ v, poll, reveal, footer }: { v: ShareView; poll?: ReactNode; reveal: ReactNode; footer?: ReactNode }) {
  return (
    <div className="@container" data-spot-share="table">
      <div className="flex flex-col gap-3 @min-[520px]:grid @min-[520px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @min-[520px]:items-start @min-[520px]:gap-x-4">
        <div className="@min-[520px]:col-span-2">
          <p className="text-base font-bold text-ink-primary">{matchupLine(v)}</p>
          <ContextChips v={v} className="mt-0.5" />
        </div>
        <div className="contents @min-[520px]:flex @min-[520px]:min-w-0 @min-[520px]:flex-col @min-[520px]:gap-3">
          <div className="mx-auto w-full max-w-[420px]" data-felt-wrap><Felt v={v} big /></div>
          {v.streets.some((s) => s.actions.length) && <StreetTimeline streets={v.streets} decision={v.streetName} />}
        </div>
        <div className="contents @min-[520px]:flex @min-[520px]:min-w-0 @min-[520px]:flex-col @min-[520px]:gap-3">
          {v.note && <p className="border-l-2 border-accent-300/50 pl-2.5 text-sm text-ink-secondary wrap-break-word">{v.note}</p>}
          {poll}
          {reveal}
        </div>
        {footer && <div className="@min-[520px]:col-span-2">{footer}</div>}
      </div>
    </div>
  );
}
