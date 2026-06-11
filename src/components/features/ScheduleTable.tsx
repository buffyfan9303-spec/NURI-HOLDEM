// src/components/features/ScheduleTable.tsx — 일정탐색 PC '토너 로비' 표 모드.
// 바이낸스 표 문법: 행 40px대·셀 py-2·헤더 12px 회색·숫자 우측정렬 tabular·호버 행 배경·플랫.
import type { Schedule } from '../../api/schedules';

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
    <div className="overflow-hidden rounded-card border border-border-default bg-surface-low">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-default text-xs text-ink-muted">
            <th className="px-3 py-2 text-left font-medium">일시</th>
            <th className="px-3 py-2 text-left font-medium">매장</th>
            <th className="px-3 py-2 text-left font-medium">게임</th>
            <th className="px-3 py-2 text-right font-medium">바이인</th>
            <th className="px-3 py-2 text-right font-medium">상금</th>
            <th className="hidden px-3 py-2 text-left font-medium xl:table-cell">지역</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => (
            <tr
              key={s.id}
              onClick={() => onSelect(s)}
              className={[
                'cursor-pointer border-b border-border-subtle last:border-b-0 transition-colors',
                s.isPremium ? 'bg-gold-300/[0.05] hover:bg-gold-300/10' : 'hover:bg-surface-high/70',
              ].join(' ')}
            >
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-secondary">
                {s.date.slice(5).replace('-', '/')}({dayLabel(s.date)}) <b className="text-ink-primary">{s.startTime}</b>
              </td>
              <td className="max-w-[10rem] px-3 py-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (s.venueId) onVenueClick(s.venueId); }}
                  className="block max-w-full truncate font-semibold text-ink-primary hover:text-gold-300"
                >
                  {s.pubName}
                </button>
              </td>
              <td className="max-w-[16rem] px-3 py-2">
                <span className="flex items-center gap-1.5">
                  {s.isPremium && <span className="shrink-0 rounded-badge bg-gold-300 px-1 text-2xs font-bold leading-tight text-ink-inverse">TOP</span>}
                  {s.isCompetition && <span className="shrink-0 rounded-badge bg-gold-300/15 px-1 text-2xs font-bold leading-tight text-gold-300">대회</span>}
                  <span className="truncate font-bold text-ink-primary">{s.title}</span>
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-semibold text-ink-primary">
                {(s.buyIn?.amount ?? 0).toLocaleString()}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gold-300 font-semibold">
                {s.guaranteed && s.prizePool
                  ? `GTD ${Math.round(s.prizePool / 10000).toLocaleString()}만`
                  : s.prizePercent
                    ? `프라이즈 ${s.prizePercent}%`
                    : '-'}
              </td>
              <td className="hidden max-w-[7rem] truncate px-3 py-2 text-xs text-ink-muted xl:table-cell">{s.region}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
