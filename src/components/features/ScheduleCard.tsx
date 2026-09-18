import { memo } from 'react';
import Icon from '../atoms/Icon';
import { thumbUrl, thumbSrcSet } from '../../lib/imageUrl';
import { scheduleStatus } from '../../lib/scheduleStatus';
import type { RegInfo } from '../../lib/regStatus';
import { regCloseLevelFromText } from '../../lib/regClose';
import { fmtKm } from '../../lib/geo';
import type { Schedule } from '../../api/schedules';
import type { ViewMode } from '../atoms/ViewModeToggle';
import { TICKET_WON } from '../../lib/units';

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
  if (!amount || amount <= 0) return '—';
  // 🔴 2026-09-18 오너: "참가비 100,000 이거 빼 10T 이런식으로 변경".
  //   T 는 이 앱의 단위다(1T = 1만원 — 이용권·장부가 이미 이 단위를 쓴다).
  //
  //   ⚠ 다만 **가격을 반올림하지 않는다**. §28 은 참가비를 상품 가격 정보로 보고 표시를 유지하라고 하고,
  //     e2e 두 곳(home-flow-fit · schedule-card-fit)이 `1,234,567원` 이 축약되지 않는지 지킨다.
  //     123.5T 로 적으면 그건 **가격을 바꿔 적는 것**이다.
  //   → T 로 **정확히 표현되는 금액만** T 로 적고(0.1T = 1,000원 단위까지), 나머지는 원 그대로.
  //        100,000 → 10T     55,000 → 5.5T     5,000 → 0.5T
  //        1,234,567 → 1,234,567원 (T 로 깎이지 않는다)
  //   ⚠ 1만원을 직접 박지 않는다 — T 의 정본은 lib/units 의 TICKET_WON 하나다
  //     (rankverify.test 가 'T 표시는 TICKET_WON 으로만' 을 잠그고 있다).
  if (amount % (TICKET_WON / 10) === 0) {
    const t = amount / TICKET_WON;
    return `${Number.isInteger(t) ? t : t.toFixed(1)}T`;
  }
  return `${amount.toLocaleString()}원`;
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
  // 2026-09-18 오너: "'상금 보장' 이라는 문구도 GTD로 변경".
  //   ⚠ '예상 상금'(엔트리 비례)은 그대로 둔다 — GTD 는 **보장**이라는 뜻이라 둘을 같은 말로 적으면
  //     보장되지 않은 금액을 보장처럼 말하게 된다(이 함수 머리말의 '의미를 섞지 않는다'가 그 뜻이다).
  return `${s.guaranteed ? 'GTD' : '예상 상금'} ${prizeMainText(s)}`;
}

// ── 서브: 포스터 영역 ───────────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣'];

function PosterArea({
  posterUrl, posterColor = '#1a1d24', title, className = '', thumbWidth = 400, priority = false, vtName, compact = false,
  fallbackText,
}: { posterUrl?: string; posterColor?: string; title: string; className?: string; thumbWidth?: number; priority?: boolean;
  /** 이미지가 없을 때 ♠ 대신 보여줄 글자(매장 이니셜). 목록 줄의 매장 로고 자리가 쓴다 —
   *  같은 매장의 대회 3개가 **같은 글자·같은 색**으로 묶여 보이는 것이 ♠ 세 개보다 식별에 낫다. */
  fallbackText?: string;
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
      {!compact && !fallbackText && (
        <div className="absolute inset-0 grid grid-cols-3 gap-2 p-3 opacity-[0.08] select-none pointer-events-none" aria-hidden>
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="text-2xl text-white text-center">{SUITS[i % 4]}</span>
          ))}
        </div>
      )}
      {fallbackText
        // ⚠ `leading-none`(line-height = font-size) 은 **한글 글리프를 담지 못한다** — 200% 확대에서
        //   span 이 34px 인데 글자가 37px 를 요구해 잘림 검사에 걸렸다(CI 실측 320px/200%: 34/37).
        //   글자 크기는 그대로 두고 줄 상자만 넉넉히 준다(부모가 flex 중앙정렬이라 위치는 그대로).
        // ⚠ 글자 크기를 타일 크기에 맞춘다 — compact(18px 인라인 로고)에서 text-base 를 쓰면
        //   한글 글리프가 20px 를 요구해 18px 타일 안에서 잘린다(실측 2026-09-18: 18/20).
        ? <span className={`relative select-none font-extrabold leading-tight text-white/85 ${compact ? 'text-[10px]' : 'text-base'}`} aria-hidden>{fallbackText}</span>
        : <span className={`relative select-none opacity-25 ${compact ? 'text-sm' : 'text-4xl'}`} aria-hidden>♠</span>}
    </div>
  );
}

/** 매장 이니셜 — 이미지 없는 매장의 로고 자리. 이모지·서로게이트 쌍이 반 글자로 잘리지 않게 코드포인트로 자른다. */
function venueInitial(name: string): string {
  const ch = [...(name ?? '').trim()][0];
  return ch ?? '?';
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
  /** 매장 대표 이미지·테마색 — 목록 줄 **왼쪽 로고 자리**가 쓴다(2026-09-18 오너 레퍼런스).
   *  DB 에 '로고' 전용 칸은 없어 `venues.image_url`·`theme_color` 를 그대로 쓴다(서버 변경 0).
   *  App 이 이미 `venueById` 를 들고 있으므로 호출부에서 꺼내 내려 준다 — 조회를 카드가 하지 않는다. */
  venue?: { imageUrl?: string; themeColor?: string };
}

/** 시작까지 남은 시간(24시간 이내) — 배지가 아니라 텍스트(§20.2 시각 노이즈 감소) */
function soonText(schedule: Schedule, status: ReturnType<typeof scheduleStatus>): string | null {
  if (status !== 'upcoming') return null;
  const ms = new Date(`${schedule.date}T${schedule.startTime || '19:00'}:00+09:00`).getTime() - Date.now();
  if (ms <= 0 || ms > 24 * 3600_000) return null;
  const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000);
  return `${h > 0 ? `${h}시간 ` : ''}${m}분 후`;
}

function ListCard({
  schedule, onVenueClick, onSelect, reserveCount, rating, priority, distanceKm, regInfo, vtActive,
  favorited = false, onToggleFavorite, venue,
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
  // (2026-09-18 3차) 목록 줄에서 형식·등급·게임종류 표기를 뺐다(오너 지시) — 이 값은 상세 화면이 보여 준다.
  //   계산 자체를 지우지 않고 남겨 둔다면 죽은 코드가 되므로 제거한다. 되살릴 때는 아래 GridCard 의
  //   같은 줄을 복사해 오면 된다(포맷이 갈리지 않게 **그쪽이 정본**이다).

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
      {/* ── 오너 레퍼런스(2026-09-18, 스크린샷 2장)대로 **3열 고정 행**으로 다시 짰다 ──────
             참조한 구조(두 이미지가 같은 골격이다):
               [상태·시각 고정]  [매장 / 대회명 / 등록정보]  [참가비 라벨 / 금액 / GTD]
             오너가 지적한 네 가지를 이 골격이 한 번에 푼다:
               ① 타이틀 잘림 — 제목이 로고와 금액 사이에 끼지 않고 **가운데 열을 통째로** 쓴다.
               ② 메트릭 분산 — 시각은 왼쪽 끝, 금액은 오른쪽 끝에 **고정 열**이라 시선이 위아래로만 움직인다.
                 (예전엔 시각이 가운데 중단, 금액이 우측 상단이라 지그재그였다.)
               ③ 태그 그룹핑 — 운영 상태(예정·TOP)는 시각 열 위, 매장·지역은 한 줄, 룰·별점·거리는 마지막 줄.
               ④ 클릭 영역 — 행 전체가 role="button" 하나다(종전과 같다).
             ⚠ 매장 로고는 48px 타일 → **18px 인라인 아이콘**으로 줄여 매장명 앞에 붙인다.
               레퍼런스가 그렇고, 그래야 가운데 열 폭이 대회명에게 돌아간다.
               대신 매장 식별은 **로고 + 이름 + 지역**이 한 줄에 같이 있어 오히려 또렷하다.
             ⚠ vt-poster(카드→상세 모핑)의 출발점이 이 로고다 — 크기가 줄어도 이름은 그대로 둔다.
               이름을 빼면 모핑이 통째로 사라진다.
             ⚠ 폭 계산(320px·글자 100%): 좌우 패딩 25.5 → 가용 294.5.
               좌 46 + 우 74 + gap 12 = 132 → 가운데 162.5px 가 대회명 몫이다(종전 약 100px).
             ⚠ 200% 확대: 가운데 열의 basis 를 rem 으로 둔다 — px 미디어쿼리는 글자 확대를 못 잡는다.
               폭이 모자라면 가운데 열이 **스스로 아래로 내려가** 좌/우 열은 첫 줄에 남는다. */}

      {/* ① 상태 · 시각 — 레퍼런스의 왼쪽 기준점 */}
      {/* ⚠ 폭을 고정(w-42px)하면 상태 알약이 2px 넘치고(실측 320px: 42/44),
           글자 200% 확대에서는 42 안에 87px 가 들어가 통째로 잘린다(실측 42/87).
           → **최소 폭만** 주고 내용이 필요한 만큼 넓어지게 둔다. 확대되면 이 열이 넓어지고
             가운데 열의 rem basis 가 스스로 줄을 내려 해결한다(그게 접근성 축이다). */}
      {/* 🔴 2026-09-18(3차) 오너: "예정 18:00 있는 쪽에는 매장 로고 넣으라고 했잖아".
          매장 로고를 매장명 옆(가운데 열)에서 **이 왼쪽 열 맨 위**로 옮겼다.
          왜 이게 더 나은가 — 왼쪽 열은 폭이 고정이라 로고를 **줄마다 같은 자리·같은 크기**로
          세울 수 있다. 매장명 옆에 있을 때는 이름 길이에 따라 로고의 x 가 줄마다 달라 눈이 훑기 어려웠다.
        ⚠ 18px → 28px 로 키웠다. 18px 에서는 한글 대체 글자가 타일을 넘쳐 잘렸고(실측 18/20),
          로고라고 알아볼 수도 없었다. 왼쪽 열 최소폭(42/52)이 28px 를 이미 감당한다.
        ⚠ vt-poster(카드→상세 모핑)의 출발점이 이 로고다 — 자리를 옮겨도 이름은 그대로 둔다.
          이름을 빼면 모핑이 조용히 사라진다(index.css 는 그대로 초록이라 아무도 모른다). */}
      <div className="order-1 min-w-[42px] shrink-0 min-[360px]:min-w-[52px]">
        <PosterArea
          posterUrl={venue?.imageUrl}
          posterColor={venue?.themeColor ?? schedule.posterColor}
          fallbackText={venueInitial(schedule.pubName)}
          title={schedule.pubName}
          className="mb-0.5 h-[28px] w-[28px] rounded-[7px]"
          thumbWidth={64}
          priority={priority}
          compact
          vtName={vtActive ? 'vt-poster' : undefined}
        />
        {/* ⚠ StatusPill 은 inline-flex 라 **줄상자(line box)** 를 만든다 — 그 자체로 6.9px 의
            여백이 위에 붙었다(실측 390: 로고 하단 32.3 vs 알약 상단 39.1). 블록 flex 로 감싸면
            줄상자가 사라진다. 로고가 들어오면서 이 열이 가장 높은 열이 됐으므로(104.2 vs 가운데 78.4)
            여기서 아끼는 px 가 곧 **모든 줄의 높이**다. */}
        <div className="flex"><StatusPill b={badge} /></div>
        <p className="mt-0.5 text-base font-extrabold tabular-nums leading-tight tracking-tight text-ink-primary min-[360px]:text-lg">
          {d.time || '—'}
        </p>
        {/* 🔴 날짜를 되돌린다(2026-09-18). 3열로 다시 짤 때 `{d.monthDay}({d.dow})` 가 통째로 빠졌고
            e2e(theme-tokens-v7 ⑦)가 "9/18 일정 행이 한 장도 안 보인다" 로 잡았다.
            이 목록은 **여러 날짜가 한 줄로 섞여 있는 평면 목록**이라(일정 탐색) 날짜가 없으면
            유저가 어느 날 대회인지 알 방법이 없다 — 레퍼런스 스크린샷은 날짜별로 묶인 화면이라
            행에 날짜가 없어도 됐던 것이고, 우리 화면은 그 전제가 다르다.
          ⚠ 자리를 만들려고 '시작' 을 뺐다. '시작' 은 모든 줄에 똑같이 적히는 **고정 낱말**이라
            정보가 0이고, 날짜는 줄마다 다른 **데이터**다. 굵은 시각 + 상태 알약이 이미 '시작 시각'
            이라는 뜻을 전한다. 기능이 아니라 장식을 뺀 것이다. */}
        <p className="text-2xs leading-tight text-ink-muted tabular-nums">{d.monthDay}({d.dow})</p>
      </div>

      {/* ② 가운데 — 매장 / 대회명 / 등록·유형 */}
      <div className="order-2 min-w-0 flex-[1_1_7rem]">
        {/* 로고는 왼쪽 열로 갔다(위 주석). 여기는 TOP 배지 + 매장명 + 지역 + 즐겨찾기만 남는다 —
            그만큼 매장명이 쓸 폭이 늘었다(실측 18px 로고 + gap 4px = 22px 회수). */}
        <div className="flex min-w-0 items-center gap-1">
          {schedule.isPremium && <span className="shrink-0 rounded-badge bg-accent-300/15 px-1 text-[10px] font-extrabold leading-none text-accent-200">TOP</span>}
          <VenueLink
            pubName={schedule.pubName}
            region={schedule.region}
            sizeCls="text-[0.8125rem] min-[360px]:text-xs"
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

        {/* 대회명 — 이제 가운데 열을 온전히 쓴다. 2줄까지 허용(레퍼런스는 1줄이지만 한글 제목이 더 길다). */}
        {/* ⚠ TOP 배지를 제목 안에 두지 않는다 — 실측(320·100%) 그 배지가 **43px** 를 먹어
            제목 칸이 그만큼 줄었다. 매장 줄은 여유가 있어 거기로 옮긴다. */}
        <h3 className="mt-0.5 line-clamp-2 break-keep text-[0.9375rem] font-bold leading-snug tracking-tight text-ink-primary [overflow-wrap:anywhere] min-[360px]:text-sm">
          {schedule.title}
        </h3>

        {/* 등록 마감 · 유형 · 별점 · 거리 · 예약 — 레퍼런스의 'REG ~ Lv16' 줄에 해당한다.
            ⚠ 가로 스크롤에 넣지 않는다 — 예전에 등록 마감이 숨은 스크롤 안으로 사라져
              유저가 그 정보가 없는 대회로 오해했다(§6-1). */}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs leading-tight text-ink-muted">
          {reg && <span className="font-semibold tabular-nums text-ink-secondary">{reg}</span>}
          {soon && <span className="font-bold text-accent-200">{soon}</span>}
          {/* 🔴 2026-09-18(3차) 오너: "14분 후 오른쪽 mtt gtd 삭제".
              여기 있던 `{meta}`(형식 · 등급 · 게임종류, 예: "MTT · gtd")를 뺐다.
            ⚠ 사라진 정보를 숨기지 않고 적는다 — **형식(MTT/SNG/PKO)과 게임 종류(NLH/PLO)가
              목록 줄에서 안 보이게 된다.** 등급(gtd)은 오른쪽 GTD 칸과 중복이라 잃는 것이 없지만,
              앞의 둘은 중복이 아니다. 지금은 상단 필터 칩(MTT·GTD)과 **상세 화면**이 그 역할을 한다.
              다시 필요해지면 이 줄이 아니라 매장 줄 끝에 작게 붙이는 편이 낫다(여기는 이미 5개가 경쟁한다). */}
          {rating && rating.count > 0 && (
            <span className="shrink-0 tabular-nums text-gold-300" title={`방문 후기 ${rating.count}건 평균`}>
              ★{rating.avg.toFixed(1)}
            </span>
          )}
          {distanceKm != null && <span className="shrink-0 tabular-nums">{fmtKm(distanceKm)}</span>}
          {(reserveCount ?? 0) > 0 && <span className="shrink-0 tabular-nums">예약 {reserveCount}명</span>}
        </div>
      </div>

      {/* ③ GTD · 참가비 — §28 상품 가격 정보라 표시를 유지한다.
          🔴 2026-09-18(3차) 오너: "10T 아래에 GTD 1000만 있는데 GTD를 위로 올리고 10T를 밑으로".
             순서를 뒤집었다. 상금(GTD)이 위, 참가비가 아래다 — 유저가 목록에서 먼저 보는 것은
             '얼마를 걸고 얼마를 받나' 중 **받는 쪽**이라는 판단이다.
           ⚠ '참가비' 라벨은 금액 **바로 위**에 붙여 둔다. 라벨을 맨 위로 올리면 그게 GTD 를 가리키는
             것처럼 읽혀 '참가비 1,000만' 으로 오독된다 — 금액 오독은 §28 이 막으려는 바로 그 사고다.
           ⚠ title 에 원 단위 금액을 남긴다 — T 가 무엇인지 모르는 첫 방문자가 확인할 수 있어야 한다. */}
      <div className="order-3 w-[68px] shrink-0 text-right min-[360px]:w-[80px]">
        <p className={`break-keep text-2xs font-bold tabular-nums leading-tight ${sub ? 'text-gold-300' : 'text-ink-muted'}`}>
          {sub ?? '—'}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-ink-muted">참가비</p>
        <p className="text-base font-extrabold tabular-nums leading-tight text-ink-primary min-[360px]:text-lg"
          title={schedule.buyIn?.amount ? `${schedule.buyIn.amount.toLocaleString()}원` : undefined}>
          {buyInText(schedule.buyIn?.amount)}
        </p>
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
          // min-h-[2.5em] — 그리드 2열에서 한 카드 제목이 2줄이고 옆 카드가 1줄이면, 본문이 flex-col 로
          // 위에서부터 쌓이는 탓에 아래 매장·참가비·메타 행이 카드끼리 한 줄(18.59px)만큼 어긋났다.
          // 2줄 자리를 항상 예약해 아래 행들이 카드 사이에서 같은 y 에 오게 한다(2.5em = 2 × leading-tight 1.25).
          'min-h-[2.5em] text-sm font-bold tracking-tight leading-tight line-clamp-2 break-keep [overflow-wrap:anywhere]',
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
