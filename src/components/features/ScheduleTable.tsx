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
                  'cursor-pointer border-b border-border-subtle last:border-b-0 transition-colors',
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
