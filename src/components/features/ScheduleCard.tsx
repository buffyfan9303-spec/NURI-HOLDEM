import { memo } from 'react';
import Icon from '../atoms/Icon';
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

/** 상금 데이터가 실제로 있는가 — 없으면 골드(강조)가 아니라 무채 '정보 없음'으로 내려간다. */
function hasPrize(s: Schedule): boolean {
  return !!s.prizePool || !!s.prizePercent;
}

/** 우측 열 부가(골드) 텍스트 — "1000만 GTD" / "50% 예상". 데이터 없으면 null. */
function prizeSubText(s: Schedule): string | null {
  if (!hasPrize(s)) return null;
  return `${prizeMainText(s)} ${s.guaranteed ? 'GTD' : '예상'}`;
}

/** APIS 예정 카드의 REG 배지 — "REG ~ Lv14". 데이터가 있을 때만 렌더한다.
 *  소스 우선순위: regCloseTime('16LV 00:12' 형식, PosterFormModal 이 레벨+시간을 합쳐 저장)
 *  → 시각만 있으면 'REG ~ 00:12' → 없으면 structure.lateRegLevels(클락/프리셋 경로). */
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

// ── 서브: 포스터 영역 ───────────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣'];

function PosterArea({
  posterUrl, posterColor = '#1a1d24', title, className = '', thumbWidth = 400, priority = false, vtName, compact = false,
}: { posterUrl?: string; posterColor?: string; title: string; className?: string; thumbWidth?: number; priority?: boolean;
  /** [DS] MO-8B: 열리는 카드 1장에만 부여되는 view-transition-name — 카드가 그 자리에서 커져 모달이 된다.
   *  문서 내 유일해야 하므로(중복이면 전환 자체가 취소) App 이 열림 대상에만 조건부로 내려준다. */
  vtName?: string;
  /** 목록 카드의 28px 아바타처럼 아주 작은 자리 — 12장 수트 격자 폴백은 뭉개지므로 단일 글리프로 */
  compact?: boolean }) {
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
      {!compact && (
        <div className="absolute inset-0 grid grid-cols-3 gap-2 p-3 opacity-[0.08] select-none pointer-events-none" aria-hidden>
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="text-2xl text-white text-center">{SUITS[i % 4]}</span>
          ))}
        </div>
      )}
      <span className={`relative select-none opacity-25 ${compact ? 'text-sm' : 'text-4xl'}`} aria-hidden>♠</span>
    </div>
  );
}

// ── 서브: 매장 링크 ─────────────────────────────────────────────────────────

function VenueLink({
  pubName, region, onClick, regionShrinks = true,
}: { pubName: string; region: string; onClick?: (e: React.MouseEvent) => void;
  /** 폭 부족 시 지역이 먼저 줄어드는가. 목록 카드=true(매장명 우선), 그리드=false(기존 동작 유지) */
  regionShrinks?: boolean }) {
  // 매장 미연결(직접입력 포스터, venueId 없음)이면 링크 문법(밑줄·hover)을 빼고 순수 텍스트로.
  // 무반응 클릭 금지 원칙 — ScheduleDetailModal의 venueId 게이트와 같은 문법(2026-08-28).
  // min-w-0(양쪽 변형): flex 아이템의 min-width:auto 가 truncate 를 무력화해 그리드 카드에서
  // 별점이 카드 밖으로 밀려 잘렸다(PC 점검 2026-08-28) — 매장명이 대신 말줄임된다.
  // ⚠ 목록 카드는 폭이 모자랄 때 **지역이 먼저 줄어든다**(shrink-[20]) — 예전엔 지역이 shrink-0 이라
  //    '로티아레나 · 경기북부' 가 '로 · 경기북부' 로 잘려 정작 매장을 식별할 수 없었다(3열 재구성 실측).
  //    매장명은 1차 식별자이므로 마지막까지 지킨다. 그리드는 포스터가 식별을 대신하므로 기존 동작 유지.
  // flex-1(basis:0) — 지역의 '가상 크기'가 0 이라 남는 폭만 차지한다. shrink 비율(20 등)로 하면
  // 소수점 배분 때문에 매장명이 0.4px 모자라 말줄임표가 붙었다(실측) — basis 0 이면 결정적이다.
  const regionCls = regionShrinks ? 'min-w-0 flex-1 truncate' : 'shrink-0';
  if (!onClick) {
    return (
      <span className="inline-flex min-w-0 items-baseline gap-0.5 text-xs text-ink-muted max-w-full">
        <span className="min-w-0 truncate font-semibold text-ink-secondary">{pubName}</span>
        <span className="shrink-0 text-border-strong">·</span>
        <span className={regionCls}>{region}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className="group inline-flex min-w-0 items-baseline gap-0.5 text-xs text-ink-muted hover:text-accent-300 transition-colors max-w-full"
    >
      <span className="min-w-0 truncate font-semibold text-ink-secondary underline decoration-dotted underline-offset-2 group-hover:text-accent-300">
        {pubName}
      </span>
      <span className="shrink-0 text-border-strong">·</span>
      <span className={regionCls}>{region}</span>
    </button>
  );
}

// ── 서브: 즐겨찾기(♥) — 콜백이 내려올 때만 렌더 ────────────────────────────
// APIS 예정 카드 1행 우측의 ♥ 자리. App 이 팔로우 상태·토글을 내려주기 전까지는
// 렌더하지 않는다(무반응 하트 금지 — VenueLink 의 venueId 게이트와 같은 원칙).
function FavoriteButton({
  pubName, on, onToggle,
}: { pubName: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`${pubName} 단골 ${on ? '해제' : '등록'}`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={[
        'hit -my-1 grid h-7 w-7 shrink-0 place-items-center rounded-full',
        'transition-[color,transform] active:scale-90',
        on ? 'text-danger-light' : 'text-ink-muted hover:text-ink-secondary',
      ].join(' ')}
    >
      <Icon name={on ? 'heart-fill' : 'heart'} size={14} strokeWidth={2.2} />
    </button>
  );
}

// ── 서브: 상태 배지(행당 1개) ───────────────────────────────────────────────

interface StatusBadge { text: string; cls: string; dot: boolean }

/** 실측 레지 상태 → 배지 텍스트·톤. regInfo 없으면 기존 추정('LIVE') 유지. */
function liveBadge(regInfo: RegInfo | undefined): { text: string; closed: boolean } {
  if (regInfo && regInfo.msLeft === 0) return { text: '레지마감', closed: true };
  if (regInfo && regInfo.msLeft !== null) return { text: '등록가능', closed: false };
  return { text: 'LIVE', closed: false };
}

/** 배지 예산 = 행당 1개. 우선순위: 종료 > 실측 레지 > 마감 임박 > 예정.
 *  2단 톤 체계 — '지금 행동할 수 있는' 상태만 솔리드 채움(대비 실측 ≥4.99:1 양 테마),
 *  나머지(예정·종료·레지마감)는 무채 surface-high(§20.1 색 배지 무지개 금지). */
function statusBadge(status: ReturnType<typeof scheduleStatus>, regInfo: RegInfo | undefined, reserveCount?: number): StatusBadge {
  if (status === 'ended') return { text: '종료', cls: 'bg-surface-high text-ink-muted', dot: false };
  if (status !== 'upcoming') {
    const b = liveBadge(regInfo);
    if (b.closed) return { text: '레지마감', cls: 'bg-surface-high text-ink-muted', dot: false };
    // emerald-700/danger-dark: 흰 글자 실측 5.47 / 4.99 — emerald-600·danger 는 3.30 / 3.7 로 AA 미달이었다
    return b.text === '등록가능'
      ? { text: '등록가능', cls: 'bg-emerald-700 text-white', dot: true }
      : { text: 'LIVE', cls: 'bg-danger-dark text-white', dot: true };
  }
  if ((reserveCount ?? 0) >= 10) return { text: '마감 임박', cls: 'bg-danger-dark text-white', dot: true };
  return { text: '예정', cls: 'bg-surface-high text-ink-secondary', dot: true };
}

function StatusPill({ b }: { b: StatusBadge }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-badge px-1.5 py-0.5 text-2xs font-bold leading-none ${b.cls}`}>
      {b.dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {b.text}
    </span>
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
  /** APIS 1행 ♥ — 이 포스터 매장을 팔로우(단골) 중인가. onToggleFavorite 과 함께 내려올 때만 렌더 */
  favorited?: boolean;
  /** ♥ 토글. 미제공이면 하트 자체를 렌더하지 않는다(무반응 클릭 금지) */
  onToggleFavorite?: (venueId: string) => void;
}

/** 시작까지 남은 시간(24시간 이내) — 배지가 아니라 텍스트(§20.2 시각 노이즈 감소) */
function soonText(schedule: Schedule, status: ReturnType<typeof scheduleStatus>): string | null {
  if (status !== 'upcoming') return null;
  const ms = new Date(`${schedule.date}T${schedule.startTime || '19:00'}:00+09:00`).getTime() - Date.now();
  if (ms <= 0 || ms > 24 * 3600_000) return null;
  const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000);
  return `${h > 0 ? `${h}시간 ` : ''}${m}분 후`;
}

const gradeLabel = (g: Schedule['grade']) =>
  g === 'daily' ? '데일리' : g === 'satellite' ? '새틀' : g === 'series' ? '시리즈' : null;

function ListCard({
  schedule, onVenueClick, onSelect, reserveCount, rating, priority, distanceKm, regInfo, vtActive,
  favorited = false, onToggleFavorite,
}: CardProps) {
  const d = formatDate(schedule.date, schedule.startTime);
  const status = scheduleStatus(schedule.date, schedule.startTime);

  // [DS] APIS '예정' 카드 문법(오너 지시 2026-08-28) — 3열 고정 골격:
  //   좌(w-20): [● 예정] / 날짜 / 큰 시각 / 캡션('시작' 또는 남은 시간)
  //   중앙:     [매장로고] 매장명 · 지역 [♥] / 게임명(2줄) / [REG ~ Lv14] 메타·별점·거리·예약
  //   우:       BUY-IN 라벨 / 금액 / 부가(GTD·예상, 골드)
  // 이전 4행 스택(시간→제목→매장→가격)은 '얼마인지'가 마지막 줄 끝에 있어 가격 비교가 세로 스캔이었다.
  // 3열로 나누면 시각·가격이 각각 고정 열에 고정폭으로 정렬돼 행 간 비교가 한 번의 세로 훑기로 끝난다.
  // 유지: §28(참가비·GTD 는 상품 가격 → 표시 유지) · 배지 예산 1개 · 빈 값은 '—'로 자리 보존.
  const badge = statusBadge(status, regInfo, reserveCount);
  const soon = soonText(schedule, status);
  const reg = regLabel(schedule);
  const sub = prizeSubText(schedule);
  const meta = [schedule.format, gradeLabel(schedule.grade), schedule.buyIn?.gameType].filter(Boolean).join(' · ');

  return (
    <article
      onClick={() => onSelect(schedule)}
      className={[
        'flex cursor-pointer items-start gap-1.5 px-3 py-2.5 transition-colors hover:bg-surface-high/50 active:bg-surface-high',
        // 프리미엄(TOP)은 행 틴트 + 제목 앞 마커로 차별(박스 글로우 제거 — 목록 결 유지)
        schedule.isPremium ? 'bg-accent-300/[0.05]' : '',
      ].join(' ')}
    >
      {/* ── 좌: 상태 + 시각 열 — 오너 스케치에서 [● 예정] 은 18:00 위(같은 열)에 있다.
             '언제·지금 어떤 상태인가'를 한 덩어리로 묶으면 목록 세로 스캔이 한 번에 끝난다.
             캡션은 24시간 이내면 '시작' 대신 남은 시간(§20.2 — 배지가 아니라 텍스트). ── */}
      <div className="w-20 shrink-0">
        <StatusPill b={badge} />
        <p className="mt-0.5 truncate text-2xs tabular-nums leading-none text-ink-muted">
          {d.monthDay}({d.dow})
        </p>
        <p className="mt-1 truncate text-xl font-extrabold tabular-nums leading-none tracking-tight text-ink-primary">
          {d.time || '—'}
        </p>
        <p className={`mt-1 truncate text-2xs leading-none ${soon ? 'font-bold text-accent-200' : 'text-ink-muted'}`}>
          {soon ?? '시작'}
        </p>
      </div>

      {/* ── 중앙: 매장 / 게임명 / REG·메타 ──────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        {/* 1행 — 매장 로고(포스터 썸네일) + 매장명 · 지역 + ♥ */}
        <div className="flex items-center gap-1">
          <PosterArea
            posterUrl={schedule.posterUrl}
            posterColor={schedule.posterColor}
            title={schedule.title}
            className="h-7 w-7 shrink-0 rounded-input"
            thumbWidth={64}
            priority={priority}
            compact
            vtName={vtActive ? 'vt-poster' : undefined}
          />
          <VenueLink
            pubName={schedule.pubName}
            region={schedule.region}
            onClick={schedule.venueId ? () => onVenueClick(schedule.venueId) : undefined}
          />
          {onToggleFavorite && schedule.venueId && (
            <FavoriteButton
              pubName={schedule.pubName}
              on={favorited}
              onToggle={() => onToggleFavorite(schedule.venueId)}
            />
          )}
        </div>

        {/* 2행 — 게임명(최대 2줄) */}
        <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug tracking-tight text-ink-primary">
          {schedule.isPremium && <span className="mr-1 align-middle text-2xs font-extrabold text-accent-200">TOP</span>}
          {schedule.title}
        </h3>

        {/* 3행 — REG 배지(데이터 있을 때만) + 메타 + 별점·거리·예약.
            메타(flex-1 truncate)가 먼저 줄어들고 숫자 사실은 끝까지 남는다. */}
        <div className="mt-1 flex items-center gap-1.5 overflow-hidden text-2xs leading-none text-ink-muted">
          {reg && (
            <span className="shrink-0 rounded-badge bg-surface-high px-1.5 py-0.5 font-bold leading-none text-ink-muted">
              {reg}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate">{meta || '—'}</span>
          {rating && rating.count > 0 && (
            <span className="shrink-0 tabular-nums text-gold-300" title={`방문 후기 ${rating.count}건 평균`}>
              ★{rating.avg.toFixed(1)}
            </span>
          )}
          {distanceKm != null && <span className="shrink-0 tabular-nums">{fmtKm(distanceKm)}</span>}
          {(reserveCount ?? 0) > 0 && <span className="shrink-0 tabular-nums">예약 {reserveCount}</span>}
        </div>
      </div>

      {/* ── 우: BUY-IN 열 — §28 참가비는 상품 가격 정보라 표시 유지 ────────── */}
      <div className="shrink-0 pt-0.5 text-right">
        <p className="text-2xs font-bold leading-none tracking-wider text-ink-muted">BUY-IN</p>
        <p className="mt-1 text-[15px] font-extrabold tabular-nums leading-none text-ink-primary">
          {schedule.buyIn.amount > 0 ? schedule.buyIn.amount.toLocaleString() : '—'}
        </p>
        <p className={`mt-1.5 whitespace-nowrap text-2xs font-bold leading-none ${sub ? 'text-gold-300' : 'text-ink-muted'}`}>
          {sub ?? '—'}
        </p>
      </div>
    </article>
  );
}

function GridCard({ schedule, onVenueClick, onSelect, rating, priority, distanceKm, reserveCount, regInfo, vtActive }: CardProps) {
  const d = formatDate(schedule.date, schedule.startTime);
  const status = scheduleStatus(schedule.date, schedule.startTime);
  // 그리드는 포스터가 주인공이라 골격(포스터·TOP·상태·하단 날짜 오버레이)을 그대로 둔다.
  // 하단 메타만 목록 카드와 같은 어휘로 정리 — BUY-IN 라벨 + 금액, 골드 부가(GTD), REG 배지.
  const reg = regLabel(schedule);
  const sub = prizeSubText(schedule);
  const meta = [schedule.format, schedule.duration, schedule.buyIn?.gameType].filter(Boolean).join(' · ');

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
          {/* 포스터 위 스크림이 깔린 자리라 테마 토큰 대신 고정 색을 쓴다(라이트 모드에서 안 보이는 문제 방지).
              emerald-600(3.30)·danger(3.7)는 흰 글자 AA 미달이라 emerald-700(5.47)·danger-dark(4.99)로 교정. */}
          {status !== 'upcoming' && (
            <span className={[
              'shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold leading-none',
              status === 'ended' || liveBadge(regInfo).closed ? 'bg-black/70 text-white/80'
                : liveBadge(regInfo).text === '등록가능' ? 'bg-emerald-700 text-white'
                : 'bg-danger-dark text-white',
            ].join(' ')}>
              {status === 'ended' ? '종료' : liveBadge(regInfo).text}
            </span>
          )}
        </div>
        {/* 하단 오버레이: 날짜 + 시각 */}
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
          // accent-300 은 다크 카드 위 3.71:1(AA 미달) — 액센트 '텍스트' 토큰인 200 으로(8.18 / 6.34)
          schedule.isPremium ? 'text-accent-200' : 'text-ink-primary',
        ].join(' ')}>
          {schedule.title}
        </h3>
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <VenueLink
            pubName={schedule.pubName}
            region={schedule.region}
            regionShrinks={false}
            onClick={schedule.venueId ? () => onVenueClick(schedule.venueId) : undefined}
          />
          {distanceKm != null ? (
            <span className="shrink-0 text-2xs font-bold tabular-nums text-sky-300">📍{fmtKm(distanceKm)}</span>
          ) : rating && rating.count > 0 ? (
            <span className="shrink-0 text-2xs font-bold tabular-nums text-accent-200" title={`방문 후기 ${rating.count}건 평균`}>
              ⭐{rating.avg.toFixed(1)}<span className="font-normal text-ink-muted">({rating.count})</span>
            </span>
          ) : null}
        </div>

        <div className="border-t border-border-subtle my-0.5" />

        {/* BUY-IN 어휘 정합 — 라벨 + 금액(§28 표시 유지), 우측에 골드 부가(GTD·예상) */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xs font-bold leading-none tracking-wider text-ink-muted">BUY-IN</p>
            <p className="mt-1 truncate text-sm font-extrabold tabular-nums leading-none text-ink-primary">
              {/* 바이인 미입력(0)은 가격 정보가 아니다 — 목록 카드(ListCard)와 같은 '—' 문법 */}
              {schedule.buyIn.amount > 0 ? schedule.buyIn.amount.toLocaleString() : '—'}
            </p>
          </div>
          <p className={`shrink-0 text-right text-2xs font-bold tabular-nums leading-none ${sub ? 'text-gold-300' : 'text-ink-muted'}`}>
            {sub ?? '상금 정보 없음'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 overflow-hidden text-2xs leading-none text-ink-secondary">
          {reg && (
            <span className="shrink-0 rounded-badge bg-surface-high px-1.5 py-0.5 font-bold leading-none text-ink-muted">
              {reg}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate">{meta || '—'}</span>
          {(reserveCount ?? 0) > 0 && (
            <span className="shrink-0 font-bold tabular-nums text-accent-200">예약 {reserveCount}</span>
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
