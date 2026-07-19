import { memo } from 'react';
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
// eslint-disable-next-line react-refresh/only-export-components -- 표시 유틸을 외부와 공유(기존 구조 유지)
export function formatPrize(n: number): string {
  if (n >= 100_000_000) {
    const eok = n / 100_000_000;
    return eok % 1 === 0 ? `${eok}억` : `${eok.toFixed(1)}억`;
  }
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
  return n.toLocaleString();
}

/** 카드/상세에 표시할 메인 상금 텍스트 — GTD: 금액, 엔트리: 프라이즈 % */
// eslint-disable-next-line react-refresh/only-export-components -- 표시 유틸을 외부와 공유(기존 구조 유지)
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
      <span className={`font-extrabold text-accent-300 tabular-nums leading-none ${large ? 'text-xl' : 'text-base'}`}>
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
      {schedule.buyIn?.gameType && (
        <span className={`font-bold tracking-wider rounded-badge px-1.5 py-0.5 border bg-violet-500/15 text-violet-300 border-violet-500/30 ${large ? 'text-2xs' : 'text-[10px]'}`}>
          {schedule.buyIn.gameType}
        </span>
      )}
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
      className="group inline-flex items-baseline gap-1 text-xs text-ink-muted hover:text-accent-300 transition-colors max-w-full"
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
  /** 예약자 수(있으면 FOMO 뱃지 — 10명 이상이면 '마감 임박') */
  reserveCount?: number;
  /** 매장 후기 별점(체크인 인증 후기 평균) — 있으면 매장명 옆 ⭐4.8(12) */
  rating?: { avg: number; count: number };
}

function ListCard({ schedule, onVenueClick, onSelect, reserveCount, rating }: CardProps) {
  const d = formatDate(schedule.date, schedule.startTime);

  return (
    <article
      onClick={() => onSelect(schedule)}
      className={[
        'flex items-center gap-2.5 overflow-hidden rounded-card border transition-all duration-300 ease-out',
        'hover:-translate-y-1 cursor-pointer active:scale-[0.98] p-2',
        schedule.isPremium
          ? 'border-accent-400 shadow-gold bg-surface-low'
          : 'border-border-default shadow-card bg-surface-low hover:border-border-strong',
      ].join(' ')}
      // 포스터 색 글로우 — 카드 뒤로 은은하게 번지는 포스터 고유색(글라스 감성)
      style={!schedule.isPremium && schedule.posterColor ? { boxShadow: `0 4px 26px -10px ${schedule.posterColor}59` } : undefined}
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
            <span className="shrink-0 rounded-badge bg-accent-300 px-1 py-0.5 text-2xs font-bold text-white leading-none">
              TOP
            </span>
          )}
          <FormatBadge format={schedule.format} />
          <h3 className={[
            'text-sm font-bold tracking-tight leading-tight truncate flex-1 min-w-0',
            schedule.isPremium ? 'text-accent-300' : 'text-ink-primary',
          ].join(' ')}>
            {schedule.title}
          </h3>
        </div>

        {/* 2행: 매장(+별점) + 프라이즈 */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="flex min-w-0 items-center gap-1">
            <VenueLink
              pubName={schedule.pubName}
              region={schedule.region}
              onClick={() => onVenueClick(schedule.venueId)}
            />
            {rating && rating.count > 0 && (
              <span className="shrink-0 text-2xs font-bold tabular-nums text-accent-300" title={`방문 후기 ${rating.count}건 평균`}>
                ⭐{rating.avg.toFixed(1)}<span className="font-normal text-ink-muted">({rating.count})</span>
              </span>
            )}
          </span>
          <span className="shrink-0 inline-flex items-baseline gap-1">
            <span className="font-extrabold text-accent-300 tabular-nums text-sm leading-none">
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
            {schedule.buyIn?.gameType && (
              <span className="text-[10px] font-bold tracking-wider rounded-badge px-1 py-0.5 border leading-none bg-violet-500/15 text-violet-300 border-violet-500/30">
                {schedule.buyIn.gameType}
              </span>
            )}
          </span>
        </div>

        {/* 3행: 날짜 · 시간 · 바이인 (+예약 FOMO 뱃지) */}
        <div className="flex items-center gap-1.5 text-2xs text-ink-muted">
          <span className="text-ink-secondary tabular-nums font-medium">
            {d.monthDay}({d.dow}) {d.time}
          </span>
          <span className="text-border-strong">·</span>
          <span className="tabular-nums">바이인 {schedule.buyIn.amount.toLocaleString()}</span>
          {(reserveCount ?? 0) > 0 && (
            <span className={['ml-auto shrink-0 rounded-badge px-1.5 py-0.5 font-bold tabular-nums',
              (reserveCount ?? 0) >= 10 ? 'bg-danger/15 text-danger-light' : 'bg-emerald-400/10 text-emerald-400'].join(' ')}>
              {(reserveCount ?? 0) >= 10 ? `🔥 예약 ${reserveCount}명 · 마감 임박` : `예약 ${reserveCount}명`}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

// ── 메인: 그리드 뷰 카드 ────────────────────────────────────────────────────

function GridCard({ schedule, onVenueClick, onSelect, rating }: CardProps) {
  const d = formatDate(schedule.date, schedule.startTime);

  return (
    <article
      onClick={() => onSelect(schedule)}
      className={[
        'flex flex-col overflow-hidden rounded-card border transition-all duration-300 ease-out',
        'hover:-translate-y-1 cursor-pointer active:scale-[0.98]',
        schedule.isPremium
          ? 'border-accent-400 shadow-gold bg-surface-low'
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
              <span className="rounded-badge bg-accent-300 px-1.5 py-0.5 text-2xs font-bold text-white leading-none">
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
          {/* 고정 다크 스크림 위 텍스트 — 테마 토큰을 쓰면 라이트 모드에서 근검정 글자가 되어 안 보임 → 고정 흰색 */}
          <p className="text-sm font-bold text-white tabular-nums leading-tight">
            {d.monthDay}<span className="text-xs font-medium text-white/70">({d.dow})</span> {d.time}
          </p>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex flex-col gap-1.5 p-2.5">
        <h3 className={[
          'text-sm font-bold tracking-tight leading-tight line-clamp-2',
          schedule.isPremium ? 'text-accent-300' : 'text-ink-primary',
        ].join(' ')}>
          {schedule.title}
        </h3>
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <VenueLink
            pubName={schedule.pubName}
            region={schedule.region}
            onClick={() => onVenueClick(schedule.venueId)}
          />
          {rating && rating.count > 0 && (
            <span className="shrink-0 text-2xs font-bold tabular-nums text-accent-300" title={`방문 후기 ${rating.count}건 평균`}>
              ⭐{rating.avg.toFixed(1)}<span className="font-normal text-ink-muted">({rating.count})</span>
            </span>
          )}
        </div>

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

function ScheduleCard({ mode, ...rest }: ScheduleCardProps) {
  return mode === 'grid' ? <GridCard {...rest} /> : <ListCard {...rest} />;
}

// 메모이즈 — 일정 목록(첫 화면) 대량 렌더 시 App 리렌더로 인한 불필요한 재렌더 방지
export default memo(ScheduleCard);
