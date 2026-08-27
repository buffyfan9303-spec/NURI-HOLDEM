import { memo } from 'react';
import { thumbUrl, thumbSrcSet } from '../../lib/imageUrl';
import { scheduleStatus } from '../../lib/scheduleStatus';
import type { RegInfo } from '../../lib/regStatus';
import { fmtKm } from '../../lib/geo';
import type { Schedule } from '../../api/schedules';
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
  // 상금은 골드 하나(스파인 컬러 예산: 상금·트로피=골드), 나머지는 무채 텍스트 — 배지 제거
  return (
    <div className={[
      'inline-flex items-baseline gap-1.5 rounded-input',
      large ? 'text-lg' : 'text-base',
    ].join(' ')}>
      <span className={`font-extrabold text-gold-300 tabular-nums leading-none ${large ? 'text-xl' : 'text-base'}`}>
        {prizeMainText(schedule)}
      </span>
      <span className="text-2xs font-bold tracking-wider text-ink-muted">
        {schedule.guaranteed ? 'GTD' : '예상'}
      </span>
      {schedule.buyIn?.gameType && (
        <span className="text-2xs font-bold tracking-wider text-ink-muted">{schedule.buyIn.gameType}</span>
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
  const status = scheduleStatus(schedule.date, schedule.startTime);

  // [DS] 리스트 행 재문법(리디자인 로드맵 §20.1 — Dice.fm 고정 4줄 + Luma 시간 우선):
  //  1행 시간(muted 우선) · 2행 제목(bold) · 3행 매장 · 4행 가격 정보(§28 표시 유지).
  //  '조잡함'의 원인이던 색 배지 무지개(포맷/GTD/게임타입/등급)를 전부 무채색 텍스트로
  //  강등하고, **배지 예산 = 행당 상태 1개**만 남긴다(우선순위: 종료 > 실측 레지 > 마감임박).
  //  빈 값은 '—'로 자리를 지켜 줄 수·순서가 절대 바뀌지 않는다.
  const badge = (() => {
    if (status === 'ended') return { text: '종료', cls: 'bg-surface-high text-ink-muted' };
    if (status !== 'upcoming') {
      const b = liveBadge(regInfo);
      if (b.closed) return { text: '레지마감', cls: 'bg-surface-high text-ink-muted' };
      return { text: b.text, cls: b.text === '등록가능' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-danger/15 text-danger-light' };
    }
    if ((reserveCount ?? 0) >= 10) return { text: '마감 임박', cls: 'bg-danger/15 text-danger-light' };
    return null;
  })();
  // 오늘 예정 대회의 '시작까지' — 배지가 아니라 시간줄의 텍스트(§20.2 시각 노이즈 감소)
  const soon = (() => {
    if (status !== 'upcoming') return null;
    const ms = new Date(`${schedule.date}T${schedule.startTime || '19:00'}:00+09:00`).getTime() - Date.now();
    if (ms <= 0 || ms > 24 * 3600_000) return null;
    const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000);
    return `${h > 0 ? `${h}시간 ` : ''}${m}분 후`;
  })();
  const grade = schedule.grade === 'daily' ? '데일리' : schedule.grade === 'satellite' ? '새틀' : schedule.grade === 'series' ? '시리즈' : null;

  return (
    <article
      onClick={() => onSelect(schedule)}
      className={[
        'flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-high/50 active:bg-surface-high',
        // 프리미엄(TOP)은 행 틴트 + 제목 앞 마커로 차별(박스 글로우 제거 — 목록 결 유지)
        schedule.isPremium ? 'bg-accent-300/[0.05]' : '',
      ].join(' ')}
    >
      <PosterArea
        posterUrl={schedule.posterUrl}
        posterColor={schedule.posterColor}
        title={schedule.title}
        className="h-16 w-16 shrink-0 rounded-input"
        thumbWidth={160}
        priority={priority}
        vtName={vtActive ? 'vt-poster' : undefined}
      />
      <div className="min-w-0 flex-1">
        {/* 1행 — 시간 우선(Luma: 유저는 일정을 시간으로 스캔한다) + 상태 배지 1개 */}
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs tabular-nums text-ink-muted">
            <span className="font-semibold text-ink-secondary">{d.time || '—'}</span>
            {' '}· {d.monthDay}({d.dow})
            {soon && <span className="font-semibold text-accent-300"> · {soon}</span>}
          </p>
          {badge && (
            <span className={`shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold leading-none ${badge.cls}`}>{badge.text}</span>
          )}
        </div>
        {/* 2행 — 제목 */}
        <h3 className="truncate text-[15px] font-bold leading-snug tracking-tight text-ink-primary">
          {schedule.isPremium && <span className="mr-1 align-middle text-2xs font-extrabold text-accent-300">TOP</span>}
          {schedule.title}
        </h3>
        {/* 3행 — 매장 · 별점 · 거리 */}
        <p className="flex min-w-0 items-center gap-1 text-xs text-ink-muted">
          <VenueLink pubName={schedule.pubName} region={schedule.region} onClick={() => onVenueClick(schedule.venueId)} />
          {rating && rating.count > 0 && (
            <span className="shrink-0 tabular-nums text-gold-300" title={`방문 후기 ${rating.count}건 평균`}>★{rating.avg.toFixed(1)}</span>
          )}
          {distanceKm != null && <span className="shrink-0 tabular-nums">{fmtKm(distanceKm)}</span>}
        </p>
        {/* 4행 — 가격 정보(§28: 참가비·GTD 는 상품 가격이므로 유지) + 무채색 메타 */}
        <p className="flex items-baseline gap-1.5 text-xs">
          <span className="shrink-0 tabular-nums text-ink-secondary">바이인 {schedule.buyIn.amount > 0 ? schedule.buyIn.amount.toLocaleString() : '—'}</span>
          <span className="shrink-0 font-bold tabular-nums text-gold-300">
            {prizeMainText(schedule)}{schedule.guaranteed ? ' GTD' : ''}
          </span>
          <span className="min-w-0 truncate text-2xs text-ink-muted">
            {[schedule.format, grade, schedule.buyIn?.gameType].filter(Boolean).join(' · ') || '—'}
          </span>
          {(reserveCount ?? 0) > 0 && (
            <span className="ml-auto shrink-0 text-2xs tabular-nums text-ink-muted">예약 {reserveCount}</span>
          )}
        </p>
      </div>
    </article>
  );
}

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
          ? 'border-accent-400 shadow-[0_0_12px_rgb(var(--accent-300)/0.22)] bg-surface-low'
          // card-elev: 단색 채움 위 수직 광원+헤어라인(DatawizzAI 문법). 프리미엄(TOP)은 자체 글로우
          // 섀도가 있어 제외 — card-elev 의 box-shadow 가 캐스케이드로 글로우를 덮어쓴다.
          : 'card-elev border-border-default shadow-card bg-surface-low hover:border-border-strong',
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
          {/* 배지 예산: TOP(유료 노출) + 상태 1개만 — 포맷 무지개 배지는 본문 메타 텍스트로 강등 */}
          <div className="flex flex-col gap-1 items-start">
            {schedule.isPremium && (
              <span className="rounded-badge bg-accent-300 px-1.5 py-0.5 text-2xs font-bold text-white leading-none">
                TOP
              </span>
            )}
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
          <span className="inline-flex items-center gap-1">{schedule.format}</span>
          <span className="text-border-strong">·</span>
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
