import type { Schedule, TournamentFormat } from '../../api/schedules';
import type { ViewMode } from '../atoms/ViewModeToggle';

// ── 유틸 ─────────────────────────────────────────────────────────────────────

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatDate(dateStr: string, timeStr: string) {
  const d = new Date(dateStr);
  return {
    monthDay: `${d.getMonth() + 1}/${d.getDate()}`,
    dow:      DAYS_KO[d.getDay()],
    time:     timeStr,
  };
}

/** 프라이즈 금액 표시: 10,000,000 → "1000만", 100,000,000 → "1억" */
export function formatPrize(n: number): string {
  if (n >= 100_000_000) {
    const eok = n / 100_000_000;
    return eok % 1 === 0 ? `${eok}억` : `${eok.toFixed(1)}억`;
  }
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
  return n.toLocaleString();
}

/** 카드/상세에 표시할 메인 상금 텍스트 — GTD: 금액, 엔트리: 프라이즈 % */
export function prizeMainText(s: { guaranteed: boolean; prizePool?: number; prizePercent?: number }): string {
  if (!s.guaranteed && s.prizePercent && s.prizePercent > 0) return `${s.prizePercent}%`;
  return s.prizePool ? formatPrize(s.prizePool) : '-';
}

const FORMAT_COLOR: Record<TournamentFormat, string> = {
  MTT:     'bg-blue-500/15   text-blue-400   border-blue-500/30',
  SNG:     'bg-purple-500/15 text-purple-400 border-purple-500/30',
  PKO:     'bg-teal-500/15   text-teal-400   border-teal-500/30',
  Bounty:  'bg-amber-500/15  text-amber-400  border-amber-500/30',
  Mix:     'bg-pink-500/15   text-pink-400   border-pink-500/30',
};

// ── 서브: 포맷·GTD 배지 ─────────────────────────────────────────────────────

function FormatBadge({ format }: { format: TournamentFormat }) {
  return (
    <span className={`inline-flex items-center rounded-badge border px-1.5 py-0.5 text-2xs font-bold tracking-wider ${FORMAT_COLOR[format]}`}>
      {format}
    </span>
  );
}

// ── 서브: 포스터 영역 ───────────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣'];

function PosterArea({
  posterUrl, posterColor = '#1a1d24', title, className = '',
}: { posterUrl?: string; posterColor?: string; title: string; className?: string }) {
  if (posterUrl) {
    return (
      <div className={`overflow-hidden bg-surface-mid ${className}`}>
        <img src={posterUrl} alt={`${title} 포스터`} className="w-full h-full object-cover" loading="lazy" />
      </div>
    );
  }
  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${className}`}
      style={{ background: `linear-gradient(135deg, ${posterColor}ee 0%, #0a0c0f 100%)` }}
    >
      <div className="absolute inset-0 grid grid-cols-3 gap-2 p-3 opacity-[0.08] select-none pointer-events-none" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="text-2xl text-white text-center">{SUITS[i % 4]}</span>
        ))}
      </div>
      <span className="relative text-4xl opacity-25 select-none" aria-hidden>♠</span>
    </div>
  );
}

// ── 서브: 프라이즈 배너 (강조 표시) ─────────────────────────────────────────

function PrizeBanner({ schedule, large = false }: { schedule: Schedule; large?: boolean }) {
  if (!schedule.prizePool && !schedule.prizePercent) {
    return (
      <span className="text-2xs text-ink-muted">상금 정보 없음</span>
    );
  }
  return (
    <div className={[
      'inline-flex items-baseline gap-1 rounded-input',
      large ? 'text-lg' : 'text-base',
    ].join(' ')}>
      <span className={`font-extrabold text-gold-300 tabular-nums leading-none ${large ? 'text-xl' : 'text-base'}`}>
        {prizeMainText(schedule)}
      </span>
      <span className={[
        'font-bold tracking-wider rounded-badge px-1.5 py-0.5 border text-2xs',
        schedule.guaranteed
          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
          : 'bg-surface-high text-ink-muted border-border-default',
      ].join(' ')}>
        {schedule.guaranteed ? 'GTD' : '예상'}
      </span>
    </div>
  );
}

// ── 서브: 매장 링크 ─────────────────────────────────────────────────────────

function VenueLink({
  pubName, region, onClick,
}: { pubName: string; region: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className="group inline-flex items-baseline gap-1 text-xs text-ink-muted hover:text-gold-300 transition-colors max-w-full"
    >
      <span className="font-medium underline decoration-dotted underline-offset-2 truncate">
        {pubName}
      </span>
      <span className="text-border-strong">·</span>
      <span className="shrink-0">{region}</span>
    </button>
  );
}

// ── 메인: 목록 뷰 카드 ────────────────────────────────────────────────────────

interface CardProps {
  schedule: Schedule;
  onVenueClick: (venueId: string) => void;
  onSelect: (schedule: Schedule) => void;
}

function ListCard({ schedule, onVenueClick, onSelect }: CardProps) {
  const d = formatDate(schedule.date, schedule.startTime);

  return (
    <article
      onClick={() => onSelect(schedule)}
      className={[
        'flex items-center gap-2.5 overflow-hidden rounded-card border transition-all duration-300 ease-out',
        'hover:-translate-y-1 cursor-pointer active:scale-[0.98] p-2',
        schedule.isPremium
          ? 'border-gold-400 shadow-gold bg-surface-low'
          : 'border-border-default shadow-card bg-surface-low hover:border-border-strong',
      ].join(' ')}
    >
      {/* 정사각 썸네일 (64x64) */}
      <PosterArea
        posterUrl={schedule.posterUrl}
        posterColor={schedule.posterColor}
        title={schedule.title}
        className="w-16 h-16 shrink-0 rounded-input"
      />

      {/* 본문 — 압축 3행 */}
      <div className="flex flex-col flex-1 min-w-0 gap-0.5">

        {/* 1행: 배지 + 제목 */}
        <div className="flex items-center gap-1 min-w-0">
          {schedule.isPremium && (
            <span className="shrink-0 rounded-badge bg-gold-300 px-1 py-0.5 text-2xs font-bold text-ink-inverse leading-none">
              TOP
            </span>
          )}
          <FormatBadge format={schedule.format} />
          <h3 className={[
            'text-sm font-semibold leading-tight truncate flex-1 min-w-0',
            schedule.isPremium ? 'text-gold-300' : 'text-ink-primary',
          ].join(' ')}>
            {schedule.title}
          </h3>
        </div>

        {/* 2행: 매장 + 프라이즈 */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <VenueLink
            pubName={schedule.pubName}
            region={schedule.region}
            onClick={() => onVenueClick(schedule.venueId)}
          />
          <span className="shrink-0 inline-flex items-baseline gap-1">
            <span className="font-extrabold text-gold-300 tabular-nums text-sm leading-none">
              {prizeMainText(schedule)}
            </span>
            <span className={[
              'text-2xs font-bold tracking-wider rounded-badge px-1 py-0.5 border leading-none',
              schedule.guaranteed
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-surface-high text-ink-muted border-border-default',
            ].join(' ')}>
              {schedule.guaranteed ? 'GTD' : '엔트리'}
            </span>
          </span>
        </div>

        {/* 3행: 날짜 · 시간 · 바이인 */}
        <div className="flex items-center gap-1.5 text-2xs text-ink-muted">
          <span className="text-ink-secondary tabular-nums font-medium">
            {d.monthDay}({d.dow}) {d.time}
          </span>
          <span className="text-border-strong">·</span>
          <span className="tabular-nums">바이인 {schedule.buyIn.amount.toLocaleString()}</span>
        </div>
      </div>
    </article>
  );
}

// ── 메인: 그리드 뷰 카드 ────────────────────────────────────────────────────

function GridCard({ schedule, onVenueClick, onSelect }: CardProps) {
  const d = formatDate(schedule.date, schedule.startTime);

  return (
    <article
      onClick={() => onSelect(schedule)}
      className={[
        'flex flex-col overflow-hidden rounded-card border transition-all duration-300 ease-out',
        'hover:-translate-y-1 cursor-pointer active:scale-[0.98]',
        schedule.isPremium
          ? 'border-gold-400 shadow-gold bg-surface-low'
          : 'border-border-default shadow-card bg-surface-low hover:border-border-strong',
      ].join(' ')}
    >
      {/* 포스터 */}
      <div className="relative">
        <PosterArea
          posterUrl={schedule.posterUrl}
          posterColor={schedule.posterColor}
          title={schedule.title}
          className="aspect-[3/4] w-full"
        />
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1 items-start">
            {schedule.isPremium && (
              <span className="rounded-badge bg-gold-300 px-1.5 py-0.5 text-2xs font-bold text-ink-inverse leading-none">
                TOP
              </span>
            )}
            <FormatBadge format={schedule.format} />
          </div>
        </div>
        {/* 하단 오버레이: 날짜 + 프라이즈 */}
        <div
          className="absolute bottom-0 left-0 right-0 px-2.5 pb-2 pt-8"
          style={{ background: 'linear-gradient(to top, rgba(10,12,15,0.95) 30%, transparent)' }}
        >
          <p className="text-sm font-bold text-ink-primary tabular-nums leading-tight">
            {d.monthDay}<span className="text-xs font-medium text-ink-secondary">({d.dow})</span> {d.time}
          </p>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex flex-col gap-1.5 p-2.5">
        <h3 className={[
          'text-sm font-semibold leading-tight line-clamp-2',
          schedule.isPremium ? 'text-gold-300' : 'text-ink-primary',
        ].join(' ')}>
          {schedule.title}
        </h3>
        <VenueLink
          pubName={schedule.pubName}
          region={schedule.region}
          onClick={() => onVenueClick(schedule.venueId)}
        />

        <div className="border-t border-border-subtle my-0.5" />

        <PrizeBanner schedule={schedule} />

        <div className="flex items-center gap-2 text-2xs text-ink-secondary">
          <span className="inline-flex items-center gap-1">{schedule.duration}</span>
          <span className="text-border-strong">·</span>
          <span className="inline-flex items-center gap-1">
            {schedule.buyIn.amount.toLocaleString()}
          </span>
        </div>
      </div>
    </article>
  );
}

// ── 익스포트 ────────────────────────────────────────────────────────────────

export interface ScheduleCardProps extends CardProps {
  mode: ViewMode;
}

export default function ScheduleCard({ mode, ...rest }: ScheduleCardProps) {
  return mode === 'grid' ? <GridCard {...rest} /> : <ListCard {...rest} />;
}
