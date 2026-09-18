// src/components/features/ScheduleTable.tsx — 일정탐색 PC '토너 로비' 표 모드.
// 바이낸스 표 문법: 행 40px대·셀 py-2·헤더 12px 회색·숫자 우측정렬 tabular·호버 행 배경·플랫.
// 어휘·포맷터는 ScheduleCard 와 **한 벌**이다 — '참가비'·'등록 마감'·상금=골드, 금액은 반올림 없음.
//   (regCloseText·buyInText·prizeMainText 를 ScheduleCard 에서 가져다 쓴다. 종전엔 이 파일이 regLabel 과
//    `Math.round(prizePool/10000)만` 을 **따로** 갖고 있어, 같은 대회가 카드에선 '1,000만' 표에선 '1000만',
//    55,000원짜리 상금이 표에서만 '6만'으로 **반올림**돼 보였다.)
import type { Schedule } from '../../api/schedules';
import { regCloseText, buyInText, prizeMainText } from './ScheduleCard';

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
}

export default function ScheduleTable({ schedules, onSelect, onVenueClick }: {
  schedules: Schedule[];
  onSelect: (s: Schedule) => void;
  onVenueClick: (venueId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-aura border card-aura">
      {/* 열 폭 — **자동 레이아웃**이다(table-fixed 를 쓰지 않는다).
          한 번 table-fixed + colgroup 으로 폭을 못 박아 봤는데, 1280px 에서 게임 열이 90px 로 눌려
          '등록 마감 14레벨' 배지(105px)가 칸 밖으로 밀렸다(실측 client 90 / scroll 105).
          대신 **의미상 한 덩어리인 값**(일시·참가비·상금)만 nowrap 으로 제 최소 폭을 주장하게 하고,
          매장·게임은 줄바꿈을 허용한다 — 브라우저가 내용이 긴 두 열에 남는 폭을 몰아준다. */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-default text-xs text-ink-muted">
            <th className="px-3 py-2 text-left font-medium">일시</th>
            <th className="px-3 py-2 text-left font-medium">매장</th>
            <th className="px-3 py-2 text-left font-medium">게임</th>
            <th className="px-3 py-2 text-right font-medium">참가비</th>
            <th className="px-3 py-2 text-right font-medium">상금</th>
            <th className="hidden px-3 py-2 text-left font-medium xl:table-cell">지역</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => {
            const reg = regCloseText(s);
            return (
              <tr
                key={s.id}
                onClick={() => onSelect(s)}
                className={[
                  // ⚠ 행 호버에 transition 을 걸지 않는다(2026-08-28 PC 잰크 실측).
                  //   표 모드는 PC 전용인데, PC 는 스크롤할 때 커서가 제자리에 있고 행이 그 밑을 지나간다.
                  //   행마다 hover in/out 이 연달아 터지면 그때마다 배경색 트랜지션이 겹겹이 돌아
                  //   행 전체가 매 프레임 다시 칠해진다. 120행 스크롤 40회 잰크 합(중앙값 3회):
                  //     transition 유지 579ms / 제거 175ms(-70%) · 드롭 프레임 80 → 21.
                  //   호버 하이라이트 자체는 그대로 둔다(즉시 반응 — 고밀도 표에선 오히려 또렷하다).
                  //   참고로 호버를 아예 없애면 145ms 라, 남은 비용 30ms 가 이 기능의 실제 값이다.
                  'cursor-pointer border-b border-border-subtle last:border-b-0',
                  s.isPremium ? 'bg-accent-300/[0.05] hover:bg-accent-300/10' : 'hover:bg-surface-high/70',
                ].join(' ')}
              >
                {/* 일시·참가비·상금은 '의미상 한 덩어리인 값'이라 한 줄 유지(whitespace-nowrap),
                    매장·게임처럼 여러 줄이 될 수 있는 글은 **잘라 숨기지 않고 줄바꿈**한다(§5-2). */}
                <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums text-ink-secondary">
                  {s.date.slice(5).replace('-', '/')}({dayLabel(s.date)}) <b className="text-ink-primary">{s.startTime}</b>
                </td>
                <td className="px-3 py-2 align-top">
                  {/* 매장 미연결(venueId 없음)이면 버튼이 stopPropagation으로 행 클릭까지 삼켜
                      '무반응 클릭'이 됐다 — 링크 문법을 빼고 텍스트로(행 클릭은 그대로 포스터 열림). */}
                  {s.venueId ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onVenueClick(s.venueId); }}
                      className="block max-w-full break-keep [overflow-wrap:anywhere] text-left font-semibold text-ink-primary hover:text-accent-300"
                    >
                      {s.pubName}
                    </button>
                  ) : (
                    <span className="block max-w-full break-keep [overflow-wrap:anywhere] font-semibold text-ink-primary">{s.pubName}</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    {s.isPremium && <span className="shrink-0 rounded-badge bg-accent-300 px-1 text-2xs font-bold leading-tight text-white">TOP</span>}
                    {s.isCompetition && <span className="shrink-0 rounded-badge bg-accent-300/15 px-1 text-2xs font-bold leading-tight text-accent-200">대회</span>}
                    <span className="min-w-0 break-keep [overflow-wrap:anywhere] font-bold text-ink-primary">{s.title}</span>
                    {/* 등록 마감 배지 — 카드와 같은 어휘·같은 포맷터. 데이터 있을 때만 */}
                    {reg && (
                      <span className="shrink-0 whitespace-nowrap rounded-badge bg-surface-high px-1.5 text-2xs font-bold leading-tight text-ink-muted">{reg}</span>
                    )}
                  </span>
                </td>
                {/* 참가비 미입력(0)은 '0원'·'무료'가 아니라 정보 없음 — 카드와 같은 '—' 문법.
                    ⚠ title 에 원 단위 전액을 남긴다 — 2026-09-18 부터 이 값은 T 표기(예: 5.5T)라
                      'T 가 얼마인지' 를 모르는 첫 방문자가 확인할 길이 필요하다. 카드 줄도 같은 처방이다. */}
                <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums font-semibold text-ink-primary"
                  title={s.buyIn?.amount ? `${s.buyIn.amount.toLocaleString()}원` : undefined}>
                  {buyInText(s.buyIn?.amount)}
                </td>
                {/* 상금은 골드 하나(스파인 컬러 예산: 상금·트로피=골드) — 카드·상세와 같은 색 역할.
                    '보장(GTD)'과 '예상'은 **다른 의미**라 같은 칸에서도 꼬리표로 구분한다. */}
                <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums text-gold-300 font-semibold">
                  {(s.prizePool || s.prizePercent) ? (
                    <>
                      {prizeMainText(s)}
                      <span className="ml-1 text-2xs font-bold text-ink-muted">{s.guaranteed ? '보장' : '예상'}</span>
                    </>
                  ) : '—'}
                </td>
                <td className="hidden px-3 py-2 align-top text-xs text-ink-muted xl:table-cell">{s.region}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
