// 게시판 SPOT 공유 — 시안 A(테이블 그림, 오너 2026-10-01 선택). 좌석 배치가 곧 상황 설명이다:
// 내 자리(아래 가운데)·Villain 자리·보드가 한눈에. 정본 캡처: spot-share-design/proto/a-*.png
// 원본: 시안 브랜치 NURI/spot-share-design-1001(b8982254) VariantTable.tsx.
import type { ReactNode } from 'react';
import { positionsFor, type SpotPosition } from '../../../../lib/spot';
import type { ShareView } from './shareView';
import { decisionLine, matchupLine } from './shareView';
import { Cards, ContextChips, StreetTimeline, type CardSize } from './ShareParts';

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

type Slot = { pos: SpotPosition; cos: number };
type Side = { left: Slot[]; mid: Slot[]; right: Slot[] };

/**
 * 좌석을 **줄**로 나눈다 — 위 줄(테이블 건너편)·아래 줄(내 양옆). 보드는 가운데 줄을 혼자 쓴다.
 * 🔴 2026-10-01 독립 검토 FAIL: 좌석을 타원 위 각도(%)로만 놓았더니 보드가 4~5장(턴·리버)이면 위쪽 좌석 이름표가
 *   보드 카드를 덮었다(320 피드 22.9×12.9px — '9' 글자가 가려짐). 좌석 상자는 px, 자리는 % 라 폭마다 어긋난다.
 *   줄로 쌓으면 좌석과 보드는 **구조상** 겹칠 수 없다(e2e/spot-felt-geometry.spec.ts 가 폭·보드 장수·상대 수 전부를 잰다).
 * 줄 안의 좌우 순서는 예전 타원 각도(내 자리 = 아래 가운데, 시계 방향) 그대로라 자리 관계는 같다.
 */
function seatRows(v: ShareView): { top: Side; low: Side } {
  const seats = positionsFor(v.tableSize);
  const heroIdx = Math.max(0, seats.indexOf(v.heroPos));
  const n = seats.length;
  const top: Slot[] = [];
  const low: Slot[] = [];
  for (let k = 1; k < n; k++) {
    const ang = Math.PI / 2 + (k * 2 * Math.PI) / n;
    // 내 양옆(타원 아래쪽, 6인의 SB·CO)만 아래 줄 — 9인의 양 끝(sin≈0.17)은 위 줄로 올린다(아래 줄이 넘치지 않게).
    (Math.sin(ang) > 0.4 ? low : top).push({ pos: seats[(heroIdx + k) % n], cos: Math.cos(ang) });
  }
  const side = (list: Slot[]): Side => ({
    left: list.filter((s) => s.cos < -0.15).sort((a, b) => a.cos - b.cos),
    mid: list.filter((s) => Math.abs(s.cos) <= 0.15),
    // 오른쪽 칸은 flex-row-reverse 라 바깥(오른쪽 끝) 좌석이 먼저 온다
    right: list.filter((s) => s.cos > 0.15).sort((a, b) => b.cos - a.cos),
  });
  return { top: side(top), low: side(low) };
}

function Felt({ v, big }: { v: ShareView; big: boolean }) {
  const rows = seatRows(v);
  const cardSize: CardSize = big ? 'md' : 'sm';
  const vilSize: CardSize = big ? 'sm' : 'xs';

  const seat = ({ pos }: Slot): ReactNode => {
    const vilIdx = v.villains.findIndex((x) => x.pos === pos);
    const vil = vilIdx >= 0 ? v.villains[vilIdx] : null;
    if (!vil) {
      // 빈 좌석 — 피드에서는 뺀다(카드가 길어진다 · 상황 설명에 필요 없다). 상세에서만 자리 이름을 보인다.
      if (!big) return null;
      // 대비: 받침 없이 펠트 위에 두면 라이트에서 테이블 테두리 선과 겹칠 때 4.34~4.46(AA 미달, 독립 검토 실측) →
      //   지면색 받침을 깔아 선·그라데이션과 무관하게 지면 위 글자가 되게 한다.
      //   7인 이상 + 좁은 테이블(<290px)은 빈 자리 이름을 뺀다 — 위 줄에 6자리가 서면 상대 블록이 테이블 밖으로 밀렸다
      //   (실측 320 상세 9인 상대 3명: 'Villain C · BTN' 이 오른쪽으로 잘림). 상대·내 자리는 그대로 보인다.
      return <span key={pos} className={['rounded-badge bg-surface-base px-1 py-0.5 text-2xs font-semibold leading-none text-ink-secondary',
        v.tableSize > 6 ? 'hidden @min-[290px]:inline' : ''].join(' ')} data-seat-empty>{pos}</span>;
    }
    const act = big ? lastActionOf(v, pos) : null;
    return (
      <div key={pos} className="flex flex-col items-center gap-0.5" data-seat={vil.letter}>
        {/* e2e 계약: 가린 상대는 'spot-villain-hidden', 공개된 상대 카드는 'spot-villain-cards'(Villain A 자리 하나에만 단다). */}
        <Cards codes={vil.cards} size={vilSize} gap={2} hidden={v.hidden}
          testId={vilIdx === 0 && big ? (v.hidden ? 'spot-villain-hidden' : 'spot-villain-cards') : undefined} />
        {big ? (
          // 상세 — 'Villain A · BTN'. 테이블 폭이 290px 미만이면 두 줄로 접어 좌석 폭을 줄인다.
          //   7인 이상은 위 줄에 자리가 많아 늘 두 줄이다(한 줄이면 390 상세 9인 상대 3명에서 오른쪽 상대가 65px 밖으로 밀렸다 — 실측).
          v.tableSize > 6 ? (
            <span className="inline-flex flex-col items-center gap-px whitespace-nowrap rounded-badge bg-surface-base/85 px-1.5 py-0.5 text-2xs font-bold leading-none text-ink-primary ring-1 ring-border-default">
              <span>{vil.label}</span><span>{pos}</span>
            </span>
          ) : (
            <span className="inline-flex flex-col items-center gap-px whitespace-nowrap rounded-badge bg-surface-base/85 px-1.5 py-0.5 text-2xs font-bold leading-none text-ink-primary ring-1 ring-border-default @min-[290px]:flex-row @min-[290px]:gap-0">
              <span>{vil.label}</span><span aria-hidden className="hidden @min-[290px]:inline">&nbsp;·&nbsp;</span><span>{pos}</span>
            </span>
          )
        ) : (
          // 피드 — 'A · BB' 한 줄. 결정 지점 줄('Villain A 체크 뒤')의 글자와 짝이 맞는다.
          <span className="whitespace-nowrap rounded-badge bg-surface-base/85 px-1.5 py-0.5 text-2xs font-bold leading-none text-ink-primary ring-1 ring-border-default">
            {vil.letter} · {pos}
          </span>
        )}
        {/* 좌석 아래 마지막 액션 — 좁은 테이블(<290px)에서는 뺀다(같은 정보가 아래 스트리트 타임라인에 있다).
            지면색 받침: 받침 없이 테두리 선 위에 놓이면 라이트 390 에서 4.42(실측) — 빈 좌석 글자와 같은 이유. */}
        {act && <span className="hidden whitespace-nowrap rounded-badge bg-surface-base px-1 text-2xs font-semibold text-ink-secondary @min-[290px]:inline">{act}</span>}
      </div>
    );
  };

  // 한 줄 = [왼쪽 칸 | 가운데 | 오른쪽 칸]. 칸끼리는 흐름 배치라 넘쳐도 서로 겹치지 않는다.
  //   sideDrop: 상세의 위 줄은 양옆 칸을 조금 내려 타원 둘레를 따르게 한다(가운데 = 건너편 좌석이 가장 위).
  const row = (g: Side, center: ReactNode, sideDrop = false) => {
    const drop = sideDrop ? ' pt-[6cqw]' : '';
    return (
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-start gap-x-1">
        <div className={'flex items-start justify-between gap-1' + drop}>{g.left.map(seat)}</div>
        <div className="flex items-start justify-center gap-1">{center}</div>
        <div className={'flex flex-row-reverse items-start justify-between gap-1' + drop}>{g.right.map(seat)}</div>
      </div>
    );
  };
  const topSeats = [...rows.top.left, ...rows.top.mid, ...rows.top.right];
  // 피드에서는 빈 좌석을 그리지 않으므로, 위 줄에 상대가 없으면 줄 자체를 뺀다(그만큼 카드가 짧아진다).
  const hasTop = big || topSeats.some((s) => v.villains.some((x) => x.pos === s.pos));

  return (
    // 상세: 정사각(내용이 더 크면 늘어난다)에서 위 줄은 위, 내 줄은 아래, 보드는 그 사이 가운데.
    // 피드: 비율 없이 내용 높이만큼 — 시안 피드 카드(≈316px)에 가깝게. (구현 1차는 정사각이라 390 에서 카드 457px 였다.)
    <div className={['@container relative w-full flex flex-col', big ? 'justify-between py-[4%]' : 'gap-1 py-0.5'].join(' ')}
      style={big ? { aspectRatio: '1' } : undefined} data-felt>
      {/* 테이블 면 — 테마 토큰으로 칠한다(라이트·다크 모두 지면과 구분되게). 위 줄 좌석 가운데·내 카드 가운데를 지나게 놓는다. */}
      <div aria-hidden className="absolute rounded-[999px] border border-accent-300/25 bg-[radial-gradient(ellipse_at_center,rgb(var(--accent-300)/0.20),rgb(var(--surface-high))_70%)]"
        style={{ inset: big ? '15% 8% 23% 8%' : `${hasTop ? 31 : 0}px 8% 40px 8%` }} />
      {hasTop && row(rows.top, rows.top.mid.map(seat), big)}
      {/* 보드 — 가운데 줄을 혼자 쓴다. 없으면 스트리트 이름만 */}
      <div className="relative flex justify-center" data-board>
        {v.board.length > 0
          ? <Cards codes={v.board} size={big ? 'sm' : 'xs'} gap={3} />
          : <span className="rounded-badge bg-surface-base/70 px-2 py-0.5 text-2xs font-semibold text-ink-secondary">{v.streetName}</span>}
      </div>
      {row(rows.low, (
        <div className="flex flex-col items-center gap-0.5" data-seat="hero">
          <Cards codes={v.hero} size={cardSize} gap={3} />
          <span className="whitespace-nowrap rounded-badge bg-accent-300 px-1.5 py-0.5 text-2xs font-bold leading-none text-white">나 {v.heroPos}</span>
          {big && (() => { const act = lastActionOf(v, v.heroPos); return act ? <span className="hidden whitespace-nowrap rounded-badge bg-surface-base px-1 text-2xs font-semibold text-ink-secondary @min-[290px]:inline">{act}</span> : null; })()}
        </div>
      ))}
    </div>
  );
}

/** 피드 카드 안 미리보기 — 테이블 + 결정 지점·맥락 한 줄 + 고를 보기. 투표 수·분포는 싣지 않는다(목록 N+1 금지). */
export function SpotTableFeed({ v }: { v: ShareView }) {
  return (
    <div className="mt-1.5 flex flex-col gap-1" data-spot-feed>
      <Felt v={v} big={false} />
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
 */
export function SpotTableDetail({ v, poll, reveal, footer }: { v: ShareView; poll?: ReactNode; reveal: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3" data-spot-share="table">
      <div>
        <p className="text-base font-bold text-ink-primary">{matchupLine(v)}</p>
        <ContextChips v={v} className="mt-0.5" />
      </div>
      <Felt v={v} big />
      {v.streets.some((s) => s.actions.length) && <StreetTimeline streets={v.streets} decision={v.streetName} />}
      {v.note && <p className="border-l-2 border-accent-300/50 pl-2.5 text-sm text-ink-secondary wrap-break-word">{v.note}</p>}
      {poll}
      {reveal}
      {footer}
    </div>
  );
}
