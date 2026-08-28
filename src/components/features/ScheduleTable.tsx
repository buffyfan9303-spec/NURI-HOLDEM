// src/components/features/ScheduleTable.tsx — 일정탐색 PC '토너 로비' 표 모드.
// 바이낸스 표 문법: 행 40px대·셀 py-2·헤더 12px 회색·숫자 우측정렬 tabular·호버 행 배경·플랫.
// 어휘는 ScheduleCard(APIS 예정 카드 문법)와 한 벌 — 'BUY-IN' 라벨 · REG 배지 · 상금=골드.
import type { Schedule } from '../../api/schedules';

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
}

/** REG 배지 텍스트 — ScheduleCard.regLabel 과 같은 규칙(레벨 우선 → 시각 → structure). */
function regLabel(s: Schedule): string | null {
  const rc = String(s.regCloseTime ?? '').trim();
  const lv = rc.match(/(\d+)\s*LV/i);
  if (lv) return `REG ~ Lv${lv[1]}`;
  const tm = rc.match(/(\d{1,2}:\d{2})/);
  if (tm) return `REG ~ ${tm[1]}`;
  const n = s.structure?.lateRegLevels;
  if (n != null && n > 0) return `REG ~ Lv${n}`;
  return null;
}

export default function ScheduleTable({ schedules, onSelect, onVenueClick }: {
  schedules: Schedule[];
  onSelect: (s: Schedule) => void;
  onVenueClick: (venueId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-border-default bg-surface-low">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-default text-xs text-ink-muted">
            <th className="px-3 py-2 text-left font-medium">일시</th>
            <th className="px-3 py-2 text-left font-medium">매장</th>
            <th className="px-3 py-2 text-left font-medium">게임</th>
            <th className="px-3 py-2 text-right font-medium tracking-wider">BUY-IN</th>
            <th className="px-3 py-2 text-right font-medium">상금</th>
            <th className="hidden px-3 py-2 text-left font-medium xl:table-cell">지역</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => {
            const reg = regLabel(s);
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
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-secondary">
                  {s.date.slice(5).replace('-', '/')}({dayLabel(s.date)}) <b className="text-ink-primary">{s.startTime}</b>
                </td>
                <td className="max-w-[10rem] px-3 py-2">
                  {/* 매장 미연결(venueId 없음)이면 버튼이 stopPropagation으로 행 클릭까지 삼켜
                      '무반응 클릭'이 됐다 — 링크 문법을 빼고 텍스트로(행 클릭은 그대로 포스터 열림). */}
                  {s.venueId ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onVenueClick(s.venueId); }}
                      className="block max-w-full truncate font-semibold text-ink-primary hover:text-accent-300"
                    >
                      {s.pubName}
                    </button>
                  ) : (
                    <span className="block max-w-full truncate font-semibold text-ink-primary">{s.pubName}</span>
                  )}
                </td>
                <td className="max-w-[16rem] px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    {s.isPremium && <span className="shrink-0 rounded-badge bg-accent-300 px-1 text-2xs font-bold leading-tight text-white">TOP</span>}
                    {s.isCompetition && <span className="shrink-0 rounded-badge bg-accent-300/15 px-1 text-2xs font-bold leading-tight text-accent-200">대회</span>}
                    <span className="truncate font-bold text-ink-primary">{s.title}</span>
                    {/* REG 배지 — 카드와 같은 어휘. 데이터 있을 때만(레지 마감 레벨/시각) */}
                    {reg && (
                      <span className="shrink-0 rounded-badge bg-surface-high px-1.5 text-2xs font-bold leading-tight text-ink-muted">{reg}</span>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-semibold text-ink-primary">
                  {/* 바이인 미입력(0)은 '0원'이 아니라 정보 없음 — ScheduleCard 목록 문법과 동일하게 '—' */}
                  {s.buyIn?.amount ? s.buyIn.amount.toLocaleString() : '—'}
                </td>
                {/* 상금은 골드 하나(스파인 컬러 예산: 상금·트로피=골드) — 카드·상세와 같은 색 역할 */}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gold-300 font-semibold">
                  {s.guaranteed && s.prizePool
                    ? `${Math.round(s.prizePool / 10000).toLocaleString()}만 GTD`
                    : s.prizePercent
                      ? `${s.prizePercent}% 예상`
                      : '—'}
                </td>
                <td className="hidden max-w-[7rem] truncate px-3 py-2 text-xs text-ink-muted xl:table-cell">{s.region}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
