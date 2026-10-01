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

/** 좌석 블록이 테이블 폭 안에 머물게 하는 반폭 — 좁으면 이름표가 두 줄(≈68px), 넓으면 한 줄('Villain A · UTG1' ≈ 108px).
 *  ⚠ 컨테이너 쿼리 기준 290px 은(390 화면 피드 테이블 296px 이 한 줄이 되게) 아래 이름표의 줄 바꿈 기준과 같은 값이어야 한다. */
//  ⚠ Tailwind 는 소스의 **글자 그대로**만 클래스로 만든다 — 변수로 조립한 변형(`${X}:flex-row`)은 CSS 가 안 생긴다
//    (2026-10-01 실측: 조립했더니 빌드 CSS 에 해당 규칙 0건). 그래서 아래 '@min-[290px]:' 를 매번 그대로 적는다.

function Felt({ v, big }: { v: ShareView; big: boolean }) {
  const seats = positionsFor(v.tableSize);
  const heroIdx = Math.max(0, seats.indexOf(v.heroPos));
  const n = seats.length;
  const cardSize: CardSize = big ? 'md' : 'sm';
  const vilSize: CardSize = big ? 'sm' : 'xs';
  return (
    // 비율: 시안 피드는 1.7 이었으나 좁은 폭·상대 여럿(BTN·SB 나란히)에서 좌석 블록이 위아래·옆으로 겹쳤다
    //   (2026-10-01 구현 실측 320px: A×B·나×A). 1 로 세로 간격을 확보한다(1.05 는 320px 상세에서 Villain A·B 가 3px 겹쳤다) — 피드 카드는 390px 에서도 한 화면(≤700px) 안이다.
    //   @container: 테이블 폭이 290px 미만이면 이름표를 두 줄로 접어 좌석 폭을 줄인다(아래 '@min-[290px]:').
    <div className="@container relative w-full" style={{ aspectRatio: '1' }} data-felt>
      {/* 테이블 면 — 테마 토큰으로 칠한다(라이트·다크 모두 지면과 구분되게) */}
      <div aria-hidden className="absolute rounded-[999px] border border-accent-300/25 bg-[radial-gradient(ellipse_at_center,rgb(var(--accent-300)/0.20),rgb(var(--surface-high))_70%)]"
        style={{ inset: '14% 8% 22% 8%' }} />
      {/* 보드 — 가운데. 없으면 스트리트 이름만 */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1" style={{ marginTop: '-4%' }}>
        {v.board.length > 0
          ? <Cards codes={v.board} size={big ? 'sm' : 'xs'} gap={3} />
          : <span className="rounded-badge bg-surface-base/70 px-2 py-0.5 text-2xs font-semibold text-ink-secondary">{v.streetName}</span>}
      </div>
      {seats.map((pos, i) => {
        const ang = Math.PI / 2 + ((i - heroIdx) * 2 * Math.PI) / n;
        const x = 50 + 40 * Math.cos(ang);
        const y = 46 + 34 * Math.sin(ang);
        const isHero = pos === v.heroPos;
        const vilIdx = v.villains.findIndex((x2) => x2.pos === pos);
        const vil = vilIdx >= 0 ? v.villains[vilIdx] : null;
        const act = big ? lastActionOf(v, pos) : null;
        if (!isHero && !vil) {
          // 빈 좌석 — 시안 첫 측정에서 ink-muted/70 이 AA 미달(다크 3.52·라이트 2.93)이라 ink-muted 로 올린 값.
          return (
            //   2026-10-01 구현 실측: 형제로 깔린 펠트 면 위에서 ink-muted 는 라이트 3.56·다크 4.25(AA 미달) → ink-secondary.
            <span key={pos} className="absolute -translate-x-1/2 -translate-y-1/2 text-2xs font-semibold text-ink-secondary"
              style={{ left: `${x}%`, top: `${y}%` }} data-seat-empty>{pos}</span>
          );
        }
        return (
          // 좌석 가운데를 상자 안쪽 SEAT_HALF px 로 묶는다 — 가장자리 좌석('Villain A · BTN' ≈ 100px)이 카드 밖으로 나가지 않게.
          //   실측: 묶지 않으면 320px 상세에서 21px 밖으로 나갔다. 자기 폭의 x% 로 미는 방식은 안쪽 좌석과 겹쳐서 버렸다.
          <div key={pos} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 [--seat-half:36px] @min-[290px]:[--seat-half:56px]"
            style={{ left: `clamp(var(--seat-half), ${x}%, calc(100% - var(--seat-half)))`, top: `${y}%` }}
            data-seat={isHero ? 'hero' : vil!.letter}>
            {isHero
              ? <Cards codes={v.hero} size={cardSize} gap={3} />
              // e2e 계약: 가린 상대는 'spot-villain-hidden', 공개된 상대 카드는 'spot-villain-cards'(Villain A 자리 하나에만 단다).
              : <Cards codes={vil!.cards} size={vilSize} gap={2} hidden={v.hidden}
                  testId={vilIdx === 0 && big ? (v.hidden ? 'spot-villain-hidden' : 'spot-villain-cards') : undefined} />}
            <span className={['whitespace-nowrap rounded-badge px-1.5 py-0.5 text-2xs font-bold leading-none',
              isHero ? 'bg-accent-300 text-white' : 'inline-flex flex-col items-center gap-px bg-surface-base/85 text-ink-primary ring-1 ring-border-default @min-[290px]:flex-row @min-[290px]:gap-0'].join(' ')}>
              {isHero ? `나 ${pos}` : (
                <><span>{vil!.label}</span><span aria-hidden className="hidden @min-[290px]:inline">&nbsp;·&nbsp;</span><span>{pos}</span></>
              )}
            </span>
            {/* 좌석 아래 마지막 액션 — 좁은 테이블(<320px)에서는 뺀다: 이웃 좌석과 닿았다(실측 320px 상세 Villain B '체크' ↔ A 카드).
                같은 정보가 아래 스트리트 타임라인에 그대로 있다. */}
            {act && <span className="hidden whitespace-nowrap text-2xs font-semibold text-ink-secondary @min-[290px]:inline">{act}</span>}
          </div>
        );
      })}
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
