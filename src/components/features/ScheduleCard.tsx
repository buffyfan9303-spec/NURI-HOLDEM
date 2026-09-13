import { memo } from 'react';
import Icon from '../atoms/Icon';
import { thumbUrl, thumbSrcSet } from '../../lib/imageUrl';
import { scheduleStatus } from '../../lib/scheduleStatus';
import type { RegInfo } from '../../lib/regStatus';
import { regCloseLevelFromText } from '../../lib/regClose';
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

/** 프라이즈 금액 표시 — **반올림하지 않는다**(2026-09-12 §6-1).
 *  종전엔 `(n/10_000).toFixed(0)만` 이라 55,000원이 "6만"으로, 105,000,000원이 "1.1억"으로
 *  **없는 금액**이 됐다. 지금은 단위로 정확히 떨어질 때만 억·만을 쓰고, 아니면 원 단위 전액을 적는다.
 *    10,000,000 → "1,000만" · 100,000,000 → "1억" · 150,000,000 → "1억 5,000만" · 55,000 → "55,000" */
// eslint-disable-next-line react-refresh/only-export-components -- 표시 유틸을 외부와 공유(기존 구조 유지)
export function formatPrize(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '-';
  const eok = Math.floor(n / 100_000_000);
  const rest = n - eok * 100_000_000;
  const man = Math.floor(rest / 10_000);
  const won = rest - man * 10_000;
  // 만 단위로 떨어지지 않으면 축약 자체를 포기한다 — 축약하는 순간 반올림이 생기기 때문
  if (won > 0) return n.toLocaleString();
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString()}억`);
  if (man > 0) parts.push(`${man.toLocaleString()}만`);
  return parts.join(' ');
}

/** 카드/상세에 표시할 메인 상금 텍스트 — GTD: 금액, 엔트리: 프라이즈 % */
// eslint-disable-next-line react-refresh/only-export-components -- 표시 유틸을 외부와 공유(기존 구조 유지)
export function prizeMainText(s: { guaranteed: boolean; prizePool?: number; prizePercent?: number }): string {
  if (!s.guaranteed && s.prizePercent && s.prizePercent > 0) return `${s.prizePercent}%`;
  return s.prizePool ? formatPrize(s.prizePool) : '-';
}

/** 참가비(바이인) 표시 정본 — 목록·그리드·표·상세가 같은 문자열을 쓴다.
 *  미입력(0)은 가격 정보가 아니라 '정보 없음'이라 '—'. 금액은 원 단위 전액(반올림 없음). */
// eslint-disable-next-line react-refresh/only-export-components -- 표시 유틸을 외부와 공유(기존 구조 유지)
export function buyInText(amount: number | undefined): string {
  return amount && amount > 0 ? `${amount.toLocaleString()}원` : '—';
}

/** 등록 마감(구 'REG') 표시 정본 — 쉬운 한국어(§9). 데이터가 있을 때만 문자열을 돌려준다.
 *  소스 우선순위: regCloseTime('16LV 00:12' 형식, PosterFormModal 이 레벨+시간을 합쳐 저장)
 *  → 시각만 있으면 '등록 마감 00:12' → 없으면 structure.lateRegLevels(클락/프리셋 경로).
 *  ⚠ 이 순서가 곧 regClose.regCloseLevelOf 의 우선순위다(regCloseTime > lateRegLevels).
 *    여기서만 '시각' 분기가 중간에 낀다 — 업주가 레벨 없이 시각만 쳤으면 그 시각을 그대로 보여 준다
 *    (레벨 축으로 환산할 수 없다). 레벨 숫자가 필요한 소비처는 regCloseLevelOf 를 부른다. */
// eslint-disable-next-line react-refresh/only-export-components -- 표시 유틸을 외부와 공유(기존 구조 유지)
export function regCloseText(s: Pick<Schedule, 'regCloseTime' | 'structure'>): string | null {
  const rc = String(s.regCloseTime ?? '').trim();
  // 레벨 파싱은 lib/regClose 한 곳뿐이다 — 포스터→클락 상속(gameInherit)·블라인드 표와 같은 규칙을 쓴다.
  const lv = regCloseLevelFromText(rc);
  if (lv) return `등록 마감 ${lv}레벨`;
  const tm = rc.match(/(\d{1,2}:\d{2})/);
  if (tm) return `등록 마감 ${tm[1]}`;
  const n = s.structure?.lateRegLevels;
  if (n != null && n > 0) return `등록 마감 ${n}레벨`;
  return null;
}

/** 상금 표시 정본 — '상금 보장'(GTD)과 '예상 상금'(엔트리 비례)의 **의미를 섞지 않는다**.
 *  데이터가 없으면 null 이다(0 이나 확정값처럼 적지 않는다). */
// eslint-disable-next-line react-refresh/only-export-components -- 표시 유틸을 외부와 공유(기존 구조 유지)
export function prizeText(s: Schedule): string | null {
  if (!s.prizePool && !s.prizePercent) return null;
  return `${s.guaranteed ? '상금 보장' : '예상 상금'} ${prizeMainText(s)}`;
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
  pubName, region, onClick, regionShrinks = true, sizeCls = 'text-xs', wrap = false,
}: { pubName: string; region: string; onClick?: (e: React.MouseEvent) => void;
  /** 폭 부족 시 지역이 먼저 줄어드는가. 목록 카드=true(매장명 우선), 그리드=false(기존 동작 유지) */
  regionShrinks?: boolean;
  /** 글자 크기 — 목록 카드는 모바일에서 13.8px(0.8125rem)로 올린다(§6-1 매장·지역 13~14px). */
  sizeCls?: string;
  /** 폭이 모자랄 때 **줄바꿈**할 것인가(목록 카드=true). false 면 종전처럼 말줄임(그리드). */
  wrap?: boolean }) {
  // 매장 미연결(직접입력 포스터, venueId 없음)이면 링크 문법(밑줄·hover)을 빼고 순수 텍스트로.
  // 무반응 클릭 금지 원칙 — ScheduleDetailModal의 venueId 게이트와 같은 문법(2026-08-28).
  // min-w-0(양쪽 변형): flex 아이템의 min-width:auto 가 truncate 를 무력화해 그리드 카드에서
  // 별점이 카드 밖으로 밀려 잘렸다(PC 점검 2026-08-28) — 매장명이 대신 말줄임된다.
  // ⚠ 목록 카드는 폭이 모자랄 때 **지역이 먼저 줄어든다**(shrink-[20]) — 예전엔 지역이 shrink-0 이라
  //    '로티아레나 · 경기북부' 가 '로 · 경기북부' 로 잘려 정작 매장을 식별할 수 없었다(3열 재구성 실측).
  //    매장명은 1차 식별자이므로 마지막까지 지킨다. 그리드는 포스터가 식별을 대신하므로 기존 동작 유지.
  // flex-1(basis:0) — 지역의 '가상 크기'가 0 이라 남는 폭만 차지한다. shrink 비율(20 등)로 하면
  // 소수점 배분 때문에 매장명이 0.4px 모자라 말줄임표가 붙었다(실측) — basis 0 이면 결정적이다.
  // ⚠ 2026-09-12: 목록 카드는 **말줄임 대신 줄바꿈**이다(wrap=true).
  //    3열을 유지하면 390px 에서도 내용 열은 ~153px 다 — '누리홀덤 부산 해운대 센텀시티점'(192px)은
  //    어떤 배치로도 한 줄에 안 들어간다. 실측: client 153 / scroll 192, 지역은 4/68 로 **사실상 소멸**.
  //    잘라 숨기는 대신 어절 단위로 접는다(긴 매장명은 비상 줄바꿈 허용). 카드가 그만큼 길어질 뿐이다.
  //    그리드 카드는 포스터가 식별을 대신하고 별점이 같은 줄에 있어 기존 말줄임 동작을 유지한다.
  const wrapCls = wrap ? 'flex-wrap' : '';
  const nameCls = wrap
    ? 'min-w-0 break-keep [overflow-wrap:anywhere] font-semibold text-ink-secondary'
    : 'min-w-0 truncate font-semibold text-ink-secondary';
  const regionCls = wrap ? 'min-w-0 break-keep' : (regionShrinks ? 'min-w-0 flex-1 truncate' : 'shrink-0');
  if (!onClick) {
    return (
      <span className={`inline-flex min-w-0 items-baseline gap-0.5 ${wrapCls} ${sizeCls} text-ink-muted max-w-full`}>
        <span className={nameCls}>{pubName}</span>
        <span className="shrink-0 text-border-strong">·</span>
        <span className={regionCls}>{region}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={`group inline-flex min-w-0 items-baseline gap-0.5 ${wrapCls} ${sizeCls} text-ink-muted hover:text-accent-300 transition-colors max-w-full text-left`}
    >
      <span className={`${nameCls} underline decoration-dotted underline-offset-2 group-hover:text-accent-300`}>
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

/** 실측 레지 상태 → 배지 텍스트·톤. regInfo 없으면 기존 추정('진행 중') 유지.
 *  §9 쉬운 한국어: 'LIVE' → '진행 중', '레지마감' → '등록 마감'. */
function liveBadge(regInfo: RegInfo | undefined): { text: string; closed: boolean } {
  if (regInfo && regInfo.msLeft === 0) return { text: '등록 마감', closed: true };
  if (regInfo && regInfo.msLeft !== null) return { text: '등록 가능', closed: false };
  return { text: '진행 중', closed: false };
}

/** 배지 예산 = 행당 1개. 우선순위: 종료 > 실측 레지 > 예정.
 *  2단 톤 체계 — '지금 행동할 수 있는' 상태만 솔리드 채움(대비 실측 ≥4.99:1 양 테마),
 *  나머지(예정·종료·등록 마감)는 무채 surface-high(§20.1 색 배지 무지개 금지).
 *
 *  🔴 2026-09-12: **'마감 임박'을 지웠다.** 종전 조건은 `reserveCount >= 10` 하나뿐이었는데
 *     Schedule 에는 정원(capacity)도 예약 마감 시각도 **없다** — 10명은 그냥 10명이지 '임박'의
 *     근거가 아니다. 100석 대회의 예약 10명에도 붉은 '마감 임박'이 붙어 거짓 긴박감을 만들었다.
 *     근거가 생기기 전까지는 사실만 쓴다: 메타 행의 '예약 10명'. */
function statusBadge(status: ReturnType<typeof scheduleStatus>, regInfo: RegInfo | undefined): StatusBadge {
  if (status === 'ended') return { text: '종료', cls: 'bg-surface-high text-ink-muted', dot: false };
  if (status !== 'upcoming') {
    const b = liveBadge(regInfo);
    if (b.closed) return { text: '등록 마감', cls: 'bg-surface-high text-ink-muted', dot: false };
    // emerald-700/danger-dark: 흰 글자 실측 5.47 / 4.99 — emerald-600·danger 는 3.30 / 3.7 로 AA 미달이었다
    return b.text === '등록 가능'
      ? { text: '등록 가능', cls: 'bg-emerald-700 text-white', dot: true }
      : { text: '진행 중', cls: 'bg-danger-dark text-white', dot: true };
  }
  return { text: '예정', cls: 'bg-surface-high text-ink-secondary', dot: true };
}

function StatusPill({ b }: { b: StatusBadge }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-badge px-1.5 py-0.5 text-2xs font-bold leading-none ${b.cls}`}>
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
  /** 예약자 수 — **사실 그대로** '예약 N명'으로만 쓴다.
   *  정원·예약 마감 시각 데이터가 없으므로 이 숫자로 '마감 임박' 같은 판단을 만들지 않는다(2026-09-12). */
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

  // [DS] 2026-09-12 §6-1 — **좁은 화면에 3열을 강요하지 않는다.**
  //   sm(640px) 이상: 종전 3열 골격 그대로(오너 지시 2026-08-28) —
  //     좌(w-20) 상태·날짜·시각 / 중앙 제목·매장·메타 / 우 참가비·상금. 행 간 가격 비교가 세로 훑기 한 번.
  //   sm 미만: flex-wrap + order 로 **같은 DOM 을 내용 중심 여러 행**으로 접는다.
  //     1행(전체 폭 보조행) [예정] 9/12(토) 18:00 2시간 후 ……… 참가비 60,000원
  //     2행 대회 제목(최대 2줄) / 3행 매장 · 지역 ♥ / 4행 등록 마감 · 상금 보장 / 5행 유형 · 별점 · 거리 · 예약
  //     320px 에서 1행이 안 들어가면 wrap 이 참가비를 **자동으로 다음 줄**로 내린다(숨은 가로 스크롤 없음).
  //   왜 DOM 을 안 나누나: 열리는 카드의 view-transition(vt-poster)·키보드 포커스 순서가 한 벌이어야 한다.
  // 실측 근거(진단 P1-C): home 320 에서 매장명이 client 52 / scroll 205 — 25% 만 보였다.
  //   중앙 열이 85px 짜리 시각 열과 안 줄어드는 가격 열 사이에 끼어 ~170px 밖에 못 받았기 때문이다.
  // 유지: §28(참가비·GTD 는 상품 가격 → 표시 유지) · 배지 예산 1개 · 빈 값은 '—'로 자리 보존.
  const badge = statusBadge(status, regInfo);
  const soon = soonText(schedule, status);
  const reg = regCloseText(schedule);
  const sub = prizeText(schedule);
  const meta = [schedule.format, gradeLabel(schedule.grade), schedule.buyIn?.gameType].filter(Boolean).join(' · ');

  return (
    <article
      onClick={() => onSelect(schedule)}
      // 키보드·보조기기 접근 (2026-09-11) — 종전엔 role·tabIndex·onKeyDown 이 없어 **클릭으로만** 열렸다.
      //   부스트·프리미엄으로 상단에 고정된 유료 노출(TOP) 카드도 같은 컴포넌트라, 돈을 받고 최상단에
      //   올린 항목이 키보드 사용자에게는 열 수 없는 요소였다. 커뮤니티 PostRow 와 같은 패턴으로 맞춘다.
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(schedule); }
      }}
      className={[
        // cv-card-list: 화면 밖 행은 렌더를 건너뛴다(커뮤니티 행과 같은 조리법 — index.css 참조)
        'cv-card-list',
        // ⚠ 행 호버에 transition 을 걸지 않는다 — ScheduleTable 행과 같은 이유이고, 이쪽이 더 중요하다.
        //   목록(list)이 **기본 뷰 모드**라 PC 유저가 실제로 가장 많이 스크롤하는 화면이다.
        //   PC 는 커서가 제자리에 있고 행이 그 밑을 지나가므로 행마다 hover in/out 이 연달아 터지는데,
        //   그때마다 배경색 트랜지션이 겹겹이 돈다. 여기에 cv-card-list 의 containment 가 겹치면
        //   행이 뷰포트에 들어오는 렌더와 호버 리페인트가 같은 프레임에서 부딪힌다.
        //   실측(2026-08-28, 프로덕션 빌드·120건·CPU 4x·실제 휠 스크롤 40회, 5회 중앙값 잰크 합):
        //     PC1440  cv+transition 401ms / cv+transition 제거 252ms / cv 이전 238ms  → 제거해야 본전
        //     M375    cv+transition 284ms / cv+transition 제거 234ms                  → 모바일도 -18%
        //   호버 하이라이트 자체는 그대로 둔다(즉시 반응). §20.4 #3 의 '색 트랜지션 ≤0.15s' 도
        //   '허용'이지 '권장'이 아니다 — 목록 행처럼 수십 개가 동시에 발화하는 자리엔 걸지 않는다.
        'flex flex-wrap items-start gap-x-2 gap-y-1 cursor-pointer px-3 py-2.5 hover:bg-surface-high/50 active:bg-surface-high',
        'min-[360px]:gap-x-1.5',
        // 프리미엄(TOP)은 행 틴트 + 제목 앞 마커로 차별(박스 글로우 제거 — 목록 결 유지)
        schedule.isPremium ? 'bg-accent-300/[0.05]' : '',
      ].join(' ')}
    >
      {/* ── 시각 블록 — 360px 이상은 좌측 고정 열(w-20), 359px 이하는 1행 왼쪽의 가로 묶음.
             '언제·지금 어떤 상태인가'를 한 덩어리로 묶으면 목록 세로 스캔이 한 번에 끝난다.
             캡션은 24시간 이내면 '시작' 대신 남은 시간(§20.2 — 배지가 아니라 텍스트).
             ⚠ 좁은 화면 가로 묶음에서 min-w-0 을 빼면 안 된다 — '2시간 30분 후'가 참가비를 밀어낸다. */}
      <div className="order-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 min-[360px]:order-none min-[360px]:block min-[360px]:w-20 min-[360px]:shrink-0">
        <StatusPill b={badge} />
        <p className="shrink-0 text-2xs tabular-nums leading-tight text-ink-muted min-[360px]:mt-0.5 min-[360px]:truncate">
          {d.monthDay}({d.dow})
        </p>
        <p className="shrink-0 text-base font-extrabold tabular-nums leading-tight tracking-tight text-ink-primary min-[360px]:mt-1 min-[360px]:truncate min-[360px]:text-xl">
          {d.time || '—'}
        </p>
        <p className={`min-w-0 truncate text-2xs leading-tight min-[360px]:mt-1 ${soon ? 'font-bold text-accent-200' : 'text-ink-muted'}`}>
          {soon ?? '시작'}
        </p>
      </div>

      {/* ── 참가비 블록 — §28 참가비는 상품 가격 정보라 표시 유지.
             359px 이하: 1행 오른쪽('참가비 60,000원' 한 줄, 자리가 없으면 wrap 으로 다음 줄).
             360px 이상: 우측 고정 열(라벨/금액/상금 3단). 'BUY-IN' → '참가비'(§9 쉬운 한국어). */}
      <div className="order-2 ml-auto flex min-w-0 flex-wrap items-baseline justify-end gap-x-1 text-right min-[360px]:order-3 min-[360px]:ml-0 min-[360px]:block min-[360px]:shrink-0 min-[360px]:pt-0.5">
        <p className="text-2xs font-bold leading-tight text-ink-muted min-[360px]:tracking-wider">참가비</p>
        <p className="text-sm font-extrabold tabular-nums leading-tight text-ink-primary min-[360px]:mt-1">
          {buyInText(schedule.buyIn?.amount)}
        </p>
        {/* tabular-nums: 같은 열의 '상금 보장 1,000만'·'상금 보장 500만' 자릿수를 세로로 맞춘다.
            359px 이하에서는 이 값이 아래 행 오른쪽으로 내려간다(min-[360px]:hidden 짝) — 1행은 참가비만. */}
        <p className={`mt-1.5 hidden break-keep text-2xs font-bold tabular-nums leading-tight min-[360px]:block ${sub ? 'text-gold-300' : 'text-ink-muted'}`}>
          {sub ?? '—'}
        </p>
      </div>

      {/* ── 내용 블록: 제목 / 매장 / 등록 마감·상금 / 메타 ─────────────────── */}
      {/* flex-[1_1_9rem] — **rem 기준 basis** 라 루트 글자 확대(200% = 17→34px)를 그대로 탄다.
          360px 이상 평상시엔 153px 로 3열 안에 들어가고, 글자가 커지면 306px 이 필요해져 이 블록이
          **스스로 다음 줄로 내려간다**(px 미디어쿼리는 글자 확대를 감지하지 못하므로 이 축이 필요하다). */}
      <div className="order-3 w-full min-w-0 min-[360px]:order-2 min-[360px]:w-auto min-[360px]:flex-[1_1_9rem]">
        {/* 제목 — 목록은 최대 2줄 요약, 전문은 상세에서 보인다.
            break-keep: 브라우저 기본(word-break:normal)은 한글을 **음절 단위**로 아무 데서나 꺾는다.
            360px 에서 중앙 열이 ~170px 밖에 안 돼 '나이트 토너먼트' 가 '나이트 토너'/'먼트' 로 갈렸다 —
            대회명은 1차 식별자라 어절 단위(keep-all)로 접는다. [overflow-wrap:anywhere] 는
            띄어쓰기 없는 초장문 토큰만 예외로 절단(Toast·VoucherWallet 과 같은 짝).
            크기: 359px 이하 0.9375rem(루트17px=15.9px, '15~16px') / 360px 이상은 종전 text-sm 유지. */}
        <h3 className="line-clamp-2 break-keep [overflow-wrap:anywhere] text-[0.9375rem] font-bold leading-snug tracking-tight text-ink-primary min-[360px]:text-sm">
          {schedule.isPremium && <span className="mr-1 align-middle text-2xs font-extrabold text-accent-200">TOP</span>}
          {schedule.title}
        </h3>

        {/* 매장 로고(포스터 썸네일) + 매장명 · 지역 + ♥ — 이제 **행 전체 폭**을 쓴다.
            썸네일은 그대로 둔다: vt-poster(카드→모달 모핑)의 대상이라 숨기면 전환이 사라진다. */}
        <div className="mt-1 flex items-center gap-1">
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
            sizeCls="text-[0.8125rem] min-[360px]:text-xs"
            wrap
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

        {/* 등록 마감 + 상금 — 참가 판단의 두 값이라 **숨은 가로 스크롤에 넣지 않는다**(§6-1).
            상금은 360px 이상에서 우측 참가비 열로 올라가므로 여기서는 좁은 폭 전용(min-[360px]:hidden). */}
        {(reg || sub) && (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs leading-tight min-[360px]:hidden">
            <span className="font-semibold text-ink-secondary">{reg ?? ''}</span>
            {sub && <span className="font-bold tabular-nums text-gold-300">{sub}</span>}
          </div>
        )}

        {/* 메타 — 유형·등급·게임종류 · 별점 · 거리 · 예약.
            ⚠ 종전엔 `overflow-x-auto` 한 줄이라 등록 마감·유형이 **숨은 가로 스크롤** 안으로 사라졌다
              (스크롤바도 없어 유저는 그 정보가 없는 대회로 오해한다). 지금은 줄바꿈으로 전부 보인다.
            ⚠ '예약 N명'은 **사실**이다 — 정원·마감 시각 데이터가 없으므로 이걸로 '마감 임박'을 만들지 않는다. */}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-tight text-ink-muted">
          {reg && (
            <span className="hidden rounded-badge bg-surface-high px-1.5 py-0.5 font-bold leading-tight text-ink-muted min-[360px]:inline">
              {reg}
            </span>
          )}
          <span className="break-keep">{meta || '—'}</span>
          {rating && rating.count > 0 && (
            <span className="shrink-0 tabular-nums text-gold-300" title={`방문 후기 ${rating.count}건 평균`}>
              ★{rating.avg.toFixed(1)}
            </span>
          )}
          {distanceKm != null && <span className="shrink-0 tabular-nums">{fmtKm(distanceKm)}</span>}
          {(reserveCount ?? 0) > 0 && <span className="shrink-0 tabular-nums">예약 {reserveCount}명</span>}
        </div>
      </div>
    </article>
  );
}

function GridCard({ schedule, onVenueClick, onSelect, rating, priority, distanceKm, reserveCount, regInfo, vtActive }: CardProps) {
  const d = formatDate(schedule.date, schedule.startTime);
  const status = scheduleStatus(schedule.date, schedule.startTime);
  // 그리드는 포스터가 주인공이라 골격(포스터·TOP·상태·하단 날짜 오버레이)을 그대로 둔다.
  // 하단 메타만 목록 카드와 같은 어휘로 정리 — '참가비' 라벨 + 금액, 골드 부가(상금 보장), 등록 마감 배지.
  const reg = regCloseText(schedule);
  const sub = prizeText(schedule);
  const meta = [schedule.format, schedule.duration, schedule.buyIn?.gameType].filter(Boolean).join(' · ');

  return (
    <article
      onClick={() => onSelect(schedule)}
      // 키보드·보조기기 접근 (2026-09-11) — 종전엔 role·tabIndex·onKeyDown 이 없어 **클릭으로만** 열렸다.
      //   부스트·프리미엄으로 상단에 고정된 유료 노출(TOP) 카드도 같은 컴포넌트라, 돈을 받고 최상단에
      //   올린 항목이 키보드 사용자에게는 열 수 없는 요소였다. 커뮤니티 PostRow 와 같은 패턴으로 맞춘다.
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(schedule); }
      }}
      className={[
        // cv-card-grid: 화면 밖 카드의 스타일·레이아웃·페인트를 건너뛴다(index.css, 실측 근거 주석).
        'cv-card-grid',
        // ⚠ transition 대상에서 border-color 를 뺀 이유(2026-08-28 PC 잰크 실측):
        //   PC 는 스크롤할 때 커서가 제자리에 있고 카드가 그 밑을 지나간다 — 카드마다
        //   hover in/out 이 연달아 발화해 300ms 짜리 **테두리 색 트랜지션(페인트)** 이 겹겹이 돈다.
        //   그리드 스크롤 40회 잰크 합 2353ms → transform 만 남기면 1373ms(-42%). 모바일은 hover 가
        //   없어 영향 0. §20.4 #3 도 색 계열 트랜지션은 ≤0.15s 로 제한하므로 300ms 는 원래 위반이었다.
        //   들어올림(transform)은 그대로 — 마우스 유저의 손맛은 잃지 않는다.
        'flex flex-col overflow-hidden rounded-aura border transition-transform duration-[var(--dur-panel)] ease-out active:duration-[var(--dur-fast)]',
        'hover:-translate-y-1 cursor-pointer active:scale-[0.98]',
        schedule.isPremium
          ? 'border-accent-400 shadow-[0_0_12px_rgb(var(--accent-300)/0.22)] bg-surface-low'
          // card-elev: 단색 채움 위 수직 광원+헤어라인(DatawizzAI 문법). 프리미엄(TOP)은 자체 글로우
          // 섀도가 있어 제외 — card-elev 의 box-shadow 가 캐스케이드로 글로우를 덮어쓴다.
          // v2 아우라 카드(2026-09-02): 반투명 면 + 6% 헤어라인 + 상단 하이라이트 (index.css .card-aura)
          : 'card-aura hover:border-border-strong',
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
                : liveBadge(regInfo).text === '등록 가능' ? 'bg-emerald-700 text-white'
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
          // break-keep — 목록 카드와 같은 이유. 그리드는 360px 2열이라 카드 폭이 ~150px 로
          // 더 좁아 음절 절단이 더 자주 났다(예: '홀덤 스페'/'셜').
          'text-sm font-bold tracking-tight leading-tight line-clamp-2 break-keep [overflow-wrap:anywhere]',
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
            <span className="inline-flex shrink-0 items-center gap-0.5 text-2xs font-bold tabular-nums text-sky-300"><Icon name="map-pin" size={11} className="shrink-0" />{fmtKm(distanceKm)}</span>
          ) : rating && rating.count > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-2xs font-bold tabular-nums text-accent-200" title={`방문 후기 ${rating.count}건 평균`}>
              <Icon name="star-fill" size={11} className="shrink-0 text-gold-300" />{rating.avg.toFixed(1)}<span className="font-normal text-ink-muted">({rating.count})</span>
            </span>
          ) : null}
        </div>

        <div className="border-t border-border-subtle my-0.5" />

        {/* 참가비 어휘 정합 — 라벨 + 금액(§28 표시 유지), 우측에 골드 부가(상금 보장·예상 상금) */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xs font-bold leading-none tracking-wider text-ink-muted">참가비</p>
            <p className="mt-1 truncate text-sm font-extrabold tabular-nums leading-none text-ink-primary">
              {/* 참가비 미입력(0)은 '무료'가 아니라 정보 없음 — 목록 카드(ListCard)와 같은 '—' 문법 */}
              {buyInText(schedule.buyIn?.amount)}
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
            <span className="shrink-0 font-bold tabular-nums text-accent-200">예약 {reserveCount}명</span>
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
