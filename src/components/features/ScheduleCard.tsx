import { memo } from 'react';
import { thumbUrl, thumbSrcSet } from '../../lib/imageUrl';
import { scheduleStatus } from '../../lib/scheduleStatus';
import type { RegInfo } from '../../lib/regStatus';
import { fmtKm } from '../../lib/geo';
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
  posterUrl, posterColor = '#1a1d24', title, className = '', thumbWidth = 400, priority = false, vtName,
}: { posterUrl?: string; posterColor?: string; title: string; className?: string; thumbWidth?: number; priority?: boolean;
  /** [DS] MO-8B: 열리는 카드 1장에만 부여되는 view-transition-name — 카드가 그 자리에서 커져 모달이 된다.
   *  문서 내 유일해야 하므로(중복이면 전환 자체가 취소) App 이 열림 대상에만 조건부로 내려준다. */
  vtName?: string }) {
  if (posterUrl) {
    return (
      <div className={`overflow-hidden bg-surface-mid ${className}`} style={vtName ? { viewTransitionName: vtName } : undefined}>
        {/* 💰 목록 카드는 원본(평균 165KB) 대신 폭 맞춤 webp 썸네일(400px≈60KB) — Egress 62% 절감 */}
        {/* ⚡ 첫 화면 상단 카드(priority)는 lazy 를 쓰지 않는다 — lazy 이미지는 프리로드 스캐너가 미리
            받지 못해 LCP(가장 큰 콘텐츠 표시)가 1왕복 늦어진다. 상위 몇 장만 eager+high 로 당긴다. */}
        <img
          src={thumbUrl(posterUrl, thumbWidth)}
          srcSet={thumbSrcSet(posterUrl, thumbWidth)}
          alt={`${title} 포스터`}
          className="w-full h-full object-cover"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          // 변환(썸네일) 실패 시 원본으로 자동 복구 — 포스터가 상품인 서비스라 깨진 이미지는 치명적
          onError={(e) => {
            const el = e.currentTarget;
            if (el.dataset.fb) return;
            el.dataset.fb = '1';
            el.removeAttribute('srcset');
            el.src = posterUrl;
          }}
        />
      </div>
    );
  }
  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${className}`}
      style={{ background: `linear-gradient(135deg, ${posterColor}ee 0%, #0a0c0f 100%)`, ...(vtName ? { viewTransitionName: vtName } : {}) }}
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
        <span className={`font-bold tracking-wider rounded-badge px-1.5 py-0.5 border bg-violet-500/15 text-violet-300 border-violet-500/30 ${large ? 'text-2xs' : 'text-2xs'}`}>
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
  /** 첫 화면 상단 카드면 true — 포스터를 lazy 대신 즉시 로드해 LCP를 앞당긴다(상위 몇 장만) */
  priority?: boolean;
  /** 📍 가까운 순이 켜져 있을 때 내 위치→매장 거리(km) — '갈까?' 판단의 핵심 변수 */
  distanceKm?: number;
  /** UX-1: 라이브 클락 실측 레지 상태 — 있으면 LIVE 배지가 추정이 아니라 실측이 된다.
   *  (없으면 기존 scheduleStatus 추정 폴백 — '시작+10시간 윈도'라 레지 마감 후에도 LIVE 로 뜨던 거짓 배지 문제) */
  regInfo?: RegInfo;
  /** [DS] MO-8B: 이 카드가 '지금 열리는 대상'일 때만 true — 포스터에 vt-poster 이름을 부여해 모달로 모핑 */
  vtActive?: boolean;
}

/** 실측 레지 상태 → 배지 텍스트·톤. regInfo 없으면 기존 추정('LIVE') 유지. */
function liveBadge(regInfo: RegInfo | undefined): { text: string; closed: boolean } {
  if (regInfo && regInfo.msLeft === 0) return { text: '레지마감', closed: true };
  if (regInfo && regInfo.msLeft !== null) return { text: '등록가능', closed: false };
  return { text: 'LIVE', closed: false };
}

function ListCard({ schedule, onVenueClick, onSelect, reserveCount, rating, priority, distanceKm, regInfo, vtActive }: CardProps) {
  const d = formatDate(schedule.date, schedule.startTime);
  // 끝난 대회를 '예약 가능'처럼 보여주지 않기 위한 상태 표시(실제 차단은 상세·서버에서)
  const status = scheduleStatus(schedule.date, schedule.startTime);

  return (
    <article
      onClick={() => onSelect(schedule)}
      className={[
        // ⚠ transition-all 은 hover 의 box-shadow 변화까지 애니메이션해 카드마다 페인트 루프를 만든다
        //   — 합성되는 transform + 저비용 border-color 만 명시 전환(시각 차이 없음, 페인트만 소멸)
        'flex items-center gap-2.5 overflow-hidden rounded-card border transition-[transform,border-color] duration-300 ease-out active:duration-75',
        'hover:-translate-y-1 cursor-pointer active:scale-[0.98] p-2',
        schedule.isPremium
          ? 'border-accent-400 shadow-[0_0_12px_rgba(94,106,210,0.22)] bg-surface-low'
          : 'border-border-default shadow-card bg-surface-low hover:border-border-strong',
      ].join(' ')}
      // 포스터 색 글로우 — 카드 뒤로 은은하게 번지는 포스터 고유색(글라스 감성).
      // blur 26px 는 카드 면적보다 큰 페인트 영역을 만든다 — 12px 로 줄여 비용 절반 이하(체감 동일)
      style={!schedule.isPremium && schedule.posterColor ? { boxShadow: `0 3px 12px -8px ${schedule.posterColor}59` } : undefined}
    >
      {/* 정사각 썸네일 (64x64) — 화면 64px이라 160px 썸네일이면 레티나까지 충분(원본 대비 90%↓) */}
      <PosterArea
        posterUrl={schedule.posterUrl}
        posterColor={schedule.posterColor}
        title={schedule.title}
        className="w-16 h-16 shrink-0 rounded-input"
        thumbWidth={160}
        priority={priority}
        vtName={vtActive ? 'vt-poster' : undefined}
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
            {distanceKm != null && (
              <span className="shrink-0 text-2xs font-bold tabular-nums text-sky-300">📍{fmtKm(distanceKm)}</span>
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
              <span className="text-2xs font-bold tracking-wider rounded-badge px-1 py-0.5 border leading-none bg-violet-500/15 text-violet-300 border-violet-500/30">
                {schedule.buyIn.gameType}
              </span>
            )}
          </span>
        </div>

        {/* 3행: 날짜 · 시간 · 바이인 (+예약 FOMO 뱃지) */}
        <div className="flex items-center gap-1.5 text-2xs text-ink-muted">
          {status !== 'upcoming' && (
            <span className={[
              'shrink-0 rounded-badge px-1.5 py-0.5 font-bold leading-none',
              status === 'ended' || liveBadge(regInfo).closed
                ? 'border border-border-default bg-surface-high text-ink-muted'
                : liveBadge(regInfo).text === '등록가능' ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-danger/15 text-danger-light',
            ].join(' ')}>
              {status === 'ended' ? '종료' : liveBadge(regInfo).text}
            </span>
          )}
          {schedule.grade && (
            <span className="shrink-0 rounded-badge bg-surface-high px-1.5 py-0.5 font-bold text-ink-secondary">
              {schedule.grade === 'daily' ? '데일리' : schedule.grade === 'satellite' ? '새틀' : '시리즈'}
            </span>
          )}
          <span className="text-ink-secondary tabular-nums font-medium">
            {d.monthDay}({d.dow}) {d.time}
          </span>
          {schedule.duration && (
            <span className="shrink-0 text-ink-muted">· {schedule.duration}</span>
          )}
          {/* 시작까지 남은 시간(Phase 14, apis '~까지 N분' 패턴) — 오늘 예정 대회만.
              렌더 시점 계산(창 복귀 재조회 주기로 충분) — 초당 갱신은 과하다. */}
          {status === 'upcoming' && (() => {
            const ms = new Date(`${schedule.date}T${schedule.startTime || '19:00'}:00+09:00`).getTime() - Date.now();
            if (ms <= 0 || ms > 24 * 3600_000) return null;
            const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000);
            return (
              <span className="shrink-0 rounded-badge bg-accent-300/12 px-1.5 py-0.5 font-bold tabular-nums text-accent-300">
                ⏰ {h > 0 ? `${h}시간 ` : ''}{m}분 후
              </span>
            );
          })()}
          <span className="text-border-strong">·</span>
          <span className="tabular-nums">바이인 {schedule.buyIn.amount.toLocaleString()}</span>
          {/* '마감 임박'은 아직 시작 안 한 대회에서만 — 끝난 대회에 붙으면 거짓 긴박감이고,
              라이브에서 실제로 두 달 전 대회가 이 배지를 달고 상단에 떠 있었다.
              종료 후에는 숫자만 사실로 남긴다(참가 규모 정보로는 여전히 쓸모 있다). */}
          {(reserveCount ?? 0) > 0 && (
            <span className={['ml-auto shrink-0 rounded-badge px-1.5 py-0.5 font-bold tabular-nums',
              (reserveCount ?? 0) >= 10 && status === 'upcoming' ? 'bg-danger/15 text-danger-light' : 'bg-emerald-400/10 text-emerald-400'].join(' ')}>
              {(reserveCount ?? 0) >= 10 && status === 'upcoming' ? `🔥 예약 ${reserveCount}명 · 마감 임박` : `예약 ${reserveCount}명`}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

// ── 메인: 그리드 뷰 카드 ────────────────────────────────────────────────────

function GridCard({ schedule, onVenueClick, onSelect, rating, priority, distanceKm, reserveCount, regInfo, vtActive }: CardProps) {
  const d = formatDate(schedule.date, schedule.startTime);
  const status = scheduleStatus(schedule.date, schedule.startTime);

  return (
    <article
      onClick={() => onSelect(schedule)}
      className={[
        'flex flex-col overflow-hidden rounded-card border transition-[transform,border-color] duration-300 ease-out active:duration-75',
        'hover:-translate-y-1 cursor-pointer active:scale-[0.98]',
        schedule.isPremium
          ? 'border-accent-400 shadow-[0_0_12px_rgba(94,106,210,0.22)] bg-surface-low'
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
          priority={priority}
          vtName={vtActive ? 'vt-poster' : undefined}
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
          {/* 포스터 위 스크림이 깔린 자리라 테마 토큰 대신 고정 색을 쓴다(라이트 모드에서 안 보이는 문제 방지) */}
          {status !== 'upcoming' && (
            <span className={[
              'shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold leading-none',
              status === 'ended' || liveBadge(regInfo).closed ? 'bg-black/70 text-white/80'
                : liveBadge(regInfo).text === '등록가능' ? 'bg-emerald-600 text-white'
                : 'bg-danger text-white',
            ].join(' ')}>
              {status === 'ended' ? '종료' : liveBadge(regInfo).text}
            </span>
          )}
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
          {distanceKm != null ? (
            <span className="shrink-0 text-2xs font-bold tabular-nums text-sky-300">📍{fmtKm(distanceKm)}</span>
          ) : rating && rating.count > 0 ? (
            <span className="shrink-0 text-2xs font-bold tabular-nums text-accent-300" title={`방문 후기 ${rating.count}건 평균`}>
              ⭐{rating.avg.toFixed(1)}<span className="font-normal text-ink-muted">({rating.count})</span>
            </span>
          ) : null}
        </div>

        <div className="border-t border-border-subtle my-0.5" />

        <PrizeBanner schedule={schedule} />

        <div className="flex items-center gap-2 text-2xs text-ink-secondary">
          <span className="inline-flex items-center gap-1">{schedule.duration}</span>
          <span className="text-border-strong">·</span>
          <span className="inline-flex items-center gap-1">
            {schedule.buyIn.amount.toLocaleString()}
          </span>
          {(reserveCount ?? 0) > 0 && (
            <span className="ml-auto shrink-0 font-bold tabular-nums text-accent-300">예약 {reserveCount}</span>
          )}
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
