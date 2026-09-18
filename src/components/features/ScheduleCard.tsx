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
export function prizeParts(s: Schedule): { label: string; amount: string } | null {
  if (!s.prizePool && !s.prizePercent) return null;
  // 2026-09-18 오너: "'상금 보장' 이라는 문구도 GTD로 변경".
  //   ⚠ '예상 상금'(엔트리 비례)은 그대로 둔다 — GTD 는 **보장**이라는 뜻이라 둘을 같은 말로 적으면
  //     보장되지 않은 금액을 보장처럼 말하게 된다.
  return { label: s.guaranteed ? 'GTD' : '예상 상금', amount: prizeMainText(s) };
}

/** 위 `prizeParts` 를 한 줄 문자열로 — 표·상세처럼 라벨과 금액을 따로 그릴 필요가 없는 곳이 쓴다.
 *  ⚠ 목록 카드는 `prizeParts` 를 쓴다(라벨은 작게, 금액은 크게). 두 곳이 **같은 계산**을 보게
 *    이 함수가 prizeParts 를 부른다 — 문자열을 다시 쪼개 쓰면 정본이 둘이 된다. */
// eslint-disable-next-line react-refresh/only-export-components -- 표시 유틸을 외부와 공유(기존 구조 유지)
export function prizeText(s: Schedule): string | null {
  const p = prizeParts(s);
  return p ? `${p.label} ${p.amount}` : null;
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


/** 실측 레지 상태 → 배지 텍스트·톤. regInfo 없으면 기존 추정('진행 중') 유지.
 *  §9 쉬운 한국어: 'LIVE' → '진행 중', '레지마감' → '등록 마감'. */
function liveBadge(regInfo: RegInfo | undefined): { text: string; closed: boolean } {
  if (regInfo && regInfo.msLeft === 0) return { text: '등록 마감', closed: true };
  if (regInfo && regInfo.msLeft !== null) return { text: '등록 가능', closed: false };
  return { text: '진행 중', closed: false };
}

/** 제목 끝의 GTD 표기를 **화면에서만** 뗀다 — 오른쪽 열이 같은 값을 이미 보여준다.
 *
 *  🔴 2026-09-18(5차) 오너: "1000만Gtd는 우측에 gtd 1000만이 있으니 삭제".
 *    같은 값이 한 카드 안에 두 번 나오면 둘 중 하나가 낡았을 때 아무도 모른다(정본 하나 원칙).
 *    오른쪽 열의 GTD 는 `prizePool`(숫자)에서 계산되고 제목의 GTD 는 업주가 손으로 적은 글자다 —
 *    **숫자 쪽이 정본**이므로 글자 쪽을 화면에서 뗀다.
 *
 *  ⚠ DB 는 건드리지 않는다. 업주가 적은 제목은 그대로 두고 **표시할 때만** 뗀다 —
 *    상세·검색·공유는 원문을 쓰고, 규칙을 되돌려도 데이터가 안 상한다. `title` 속성에도 원문을 남긴다.
 *  ⚠ **끝에 붙은 것만** 뗀다. 'GTD 1000만 위클리' 처럼 가운데 있는 것은 제목의 일부일 수 있다.
 *  ⚠ 오른쪽 열에 GTD 가 **없으면**(prizePool 미입력) 떼지 않는다 — 그러면 정보가 통째로 사라진다.
 *  ⚠ 다 떼서 빈 제목이 되면 원문을 쓴다(제목이 'GTD 1000만' 뿐인 대회가 실제로 있을 수 있다). */
// eslint-disable-next-line react-refresh/only-export-components -- 표시 유틸을 외부와 공유(기존 구조 유지)
export function titleWithoutGtd(title: string, hasGtdColumn: boolean): string {
  if (!hasGtdColumn) return title;
  const cut = title
    // "… 1000만 GTD" · "… 1,000만 보장" · "… 10000000 GTD"
    .replace(/[\s·,|/-]*\d[\d,]*\s*(?:억|만)?\s*(?:GTD|gtd|Gtd|보장)\s*$/u, '')
    // "… GTD 1000만"
    .replace(/[\s·,|/-]*(?:GTD|gtd|Gtd)\s*\d[\d,]*\s*(?:억|만)?\s*$/u, '')
    .trim();
  return cut || title;
}

/* 🔴 2026-09-18(5차) 오너: "진행중은 없애도 되고". 여기 있던 상태 표시 3종을 지웠다 —
 *   `interface StatusBadge` · `statusBadge()`(5상태 → 색·모양) · `StatusDot`(로고 모서리 점).
 *   4차에서 알약 → 점으로 줄였다가, 5차에서 오너가 표시 자체를 빼도 된다고 했다.
 * ⚠ 잃은 것: 목록 줄에서 **종료·등록 마감**을 한눈에 구분하는 표식.
 *   남아 있는 단서는 메타 줄의 `등록 마감 N레벨`(regCloseText)과 `N분 후`(soonText) 둘이다.
 * ⚠ `liveBadge()` 는 지우지 않았다 — 아래 GridCard(포스터 카드)가 아직 배지로 쓴다.
 * ⚠ 되살릴 때: git 이력에 `StatusDot`(absolute 로 로고 모서리에 겹쳐 폭·높이 0) 형태가 있다.
 *   그 방식만이 3열 폭 예산을 안 건드린다 — 인라인·다른 열로 옮기면 카드가 오히려 커진다(실측). */


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

// ⚠ `regInfo`(실측 레지 상태)를 더 이상 받지 않는다 — 5차에서 상태 표시를 없애며 유일한 소비처가
//   사라졌다. **prop 자체는 CardProps 에 남는다**(GridCard 가 아직 배지로 쓴다).
//   목록 줄에서 잃은 것: 서버가 실측한 '등록 마감/등록 가능'. 남은 단서는 메타 줄의
//   `등록 마감 N레벨`(포스터에 적힌 정적 값)과 `N분 후`뿐이다. 되살리려면 여기서 다시 받으면 된다.
function ListCard({
  schedule, onVenueClick, onSelect, reserveCount, rating, priority, distanceKm, vtActive,
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
  const soon = soonText(schedule, status);
  const reg = regCloseText(schedule);
  // 목록 카드만 라벨·금액을 따로 그린다(라벨 작게·금액 크게) — 계산은 정본 하나(prizeParts).
  const prize = prizeParts(schedule);
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
      {/* 🔴 2026-09-18(4차) 오너: "진행중하고 18:00을 다른데로 이동시키던지 해서 **칸 줄여**".
          상태 알약이 이 열에서 **한 줄을 통째로** 쓰고 있었고, 이 열이 4단(로고·알약·시각·날짜)이라
          카드 높이를 혼자 정하고 있었다. 실측(390·다크·100%, 세 열 높이):
            o1 **92.5** / o2 114.5·57.1·82.9 / o3 61.1·90.9·61.1
          → 알약을 로고 모서리로 겹쳐 **줄 하나를 없앴다**(아래 StatusDot).

        🔴 **옮길 곳 세 군데를 전부 실측해서 골랐다.** 나머지 둘은 옮긴 자리가 새 병목이 되어
           카드가 **오히려 커졌다** (390 카드3장 높이 / 괄호는 320px):
             옮기기 전            136 · 115 · 115   (206 · 111 · 135)
             가운데 매장 줄로      137 · 113 · 123   (183 · 125 · 153)  ← 긴 매장명이 접혀 +8
             오른쪽 열 맨 위로     136 · 131 · 105   (165 · 129 · 135)  ← 긴 금액과 겹쳐 +16
             시각 옆 인라인 점     136 · 113 · 105   (206 · **123** · 135) ← 열 폭 +11px 이 가운데를 뺏어 +12
             로고 모서리(채택)     아래 실측
           ⚠ 배운 것: 이 3열에서는 **폭이 곧 높이다.** 왼쪽 열을 11px 넓히면 가운데 basis 가 그만큼
             줄어 제목이 한 줄 더 접히고, 그 줄이 카드 높이가 된다. 그래서 겹치는(absolute) 배치만이
             폭·높이 어느 쪽도 안 건드린다.
        ⚠ vt-poster(카드→상세 모핑)의 출발점이 이 로고다 — 점을 얹어도 PosterArea 와 vtName 은 그대로다. */}
      {/* 🔴 2026-09-18(6차) 오너: "좌측 '누' 아이콘 크기를 키워서 **공란을 좀 줄여**".
          로고가 28px 이라 그 아래 60px 가 빈 채로 남아 있었다(카드 95.6px). 44/56px 로 키워 메운다.
        ⚠ 무한정 키울 수 없다 — 이 열이 넓어지면 가운데 basis 가 그만큼 줄어 제목이 접히고,
          그 줄이 카드 높이가 된다(4차에서 11px 때문에 카드가 커진 그 함정).
          폭 예산: 320 = 44 + 8.5 + 102 + 8.5 + 80 = 243 ≤ 258.5 · 360 = 56 + 6.4 + 119 + 6.4 + 96 = 283.8 ≤ 298.6
        ⚠ vt-poster(카드→상세 모핑)의 출발점이라 크기를 바꿔도 이름은 그대로 둔다. */}
      <div className="order-1 min-w-[48px] shrink-0 min-[360px]:min-w-[56px]">
        {/* 🔴 2026-09-18(8차) 오너: "10T 폰트를 줄여서 **정사각 아이콘 크기에 맞춰**".
            7차에서 세로 포스터(40×60 / 48×74)로 늘렸던 것을 **정사각형으로 되돌리되**,
            오른쪽 열이 짧아진 만큼(74.1 → 57.4 / 61.4 → 48.9) 그 높이에 맞춘다.
              320px: 48×48  vs 오른쪽 48.9   ·   360px+: 56×56  vs 오른쪽 57.4
          ⚠ 폭 예산이 빠듯하다 — 320px: 48 + 8.5 + basis 102 + 8.5 + 88 = 255 ≤ 258.5 (**여유 3.5px**).
            여기서 왼쪽이나 오른쪽을 조금만 더 키우면 3열이 무너진다. 바꾸기 전에 반드시 다시 재라
            (e2e schedule-card-fit 의 '3열이 접혔다' 단언이 잡는다).
          ⚠ vt-poster(카드→상세 모핑)의 출발점 — 비율을 바꿔도 이름은 그대로 둔다. */}
        <PosterArea
          posterUrl={venue?.imageUrl}
          posterColor={venue?.themeColor ?? schedule.posterColor}
          fallbackText={venueInitial(schedule.pubName)}
          title={schedule.pubName}
          className="h-[48px] w-[48px] rounded-[11px] min-[360px]:h-[56px] min-[360px]:w-[56px]"
          thumbWidth={128}
          priority={priority}
          vtName={vtActive ? 'vt-poster' : undefined}
        />
      </div>

      {/* ② 가운데 — 매장 / 대회명 / 등록·유형 */}
      {/* 🔴 2026-09-18(재검증): **320px 에서 3열이 무너져 있었다.** 참가비·GTD 열이 통째로
          둘째 줄 좌측에 떨어지고 행 높이가 113.8 → 176.8px(+55%) 였다(다크·라이트 동일).
          원인은 오늘 3차 개정에서 **28px 로고를 왼쪽 열에 넣으며** 그 열의 실렌더 폭이
          46 → 56.4px 로 커진 것이다. 같은 파일 위쪽 폭 계산 주석은 옮기기 **전** 값(46)을
          그대로 두고 있었다 — 수치를 안 맞춘 게 아니라 **옮긴 사람이 예산을 다시 안 잰 것**이다.
          실측(320px): 가용 258.5 = 284 − 패딩 25.5
            좌 56.4 + gap 8.5 + 가운데 basis 7rem(119) + gap 8.5 + 우 68 = 260.4 → **1.9px 초과**.
        ⚠ flex-wrap 은 **줄어들기 전 가상 크기**로 줄을 가른다 — 1.9px 모자라도 가운데 열이
          그만큼 줄어드는 게 아니라 **마지막 항목이 통째로** 다음 줄로 밀린다. 그래서 2px 가 55% 가 된다.
        ⚠ 360px 부터는 좌 52·우 80·gap 6 으로 예산이 달라 멀쩡했다 — 320 만의 문제라 이 구간만 낮춘다.
          6rem(102px)이면 260.4 → 243.4 로 15px 여유가 생긴다.
        ⚠ 원래 의도했던 접힘은 '가운데 열이 스스로 내려가고 좌·우는 첫 줄에 남는' 것이었다(위 주석).
          실제 CSS 는 반대로 동작했다 — 주석의 기대와 브라우저 동작이 다르면 **브라우저가 맞다.** */}
      {/* 🔴 2026-09-18(5차) 오너: "누리 테스트 홀덤펍과 누리 테스트 위클리의 **간격을 맞춰**".
          종전엔 줄마다 `mt-0.5` 를 따로 붙여 놨는데, 각 줄의 글자 크기가 달라(매장 13px · 제목 15px ·
          시각 17px) **내장 line-height 가 줄마다 다른 여백**을 만들었다. 눈에는 그게 '간격이 안 맞는' 것이다.
          → 줄마다 붙이던 `mt-0.5` 를 걷고 **부모에 `space-y-0.5` 하나**로 통일한다. 리듬이 한 곳에서 정해진다.
        ⚠ 이 열의 자식은 전부 `leading-tight` 로 맞춘다 — 그래야 `space-y` 가 실제 간격이 된다.
          (fontSize 유틸이 line-height 를 같이 싣는다는 것은 이 저장소가 여러 번 데인 자리다.) */}
      <div className="order-2 min-w-0 flex-[1_1_6rem] space-y-0.5 min-[360px]:flex-[1_1_7rem]">
        {/* 🔴 2026-09-18(5차) 오너: "top 를 누리 테스트 홀덤펍 **뒤로**".
            TOP 은 유료 노출 표식이라 매장 **이름보다 앞에 서면 광고가 이름을 가린다.**
            이름 → 지역 → TOP 순서면 눈이 '어느 매장인가' 를 먼저 읽는다. */}
        <div className="flex min-w-0 items-center gap-1">
          {/* 🔴 2026-09-18(재검증): `wrap` 을 **안 넘기고 있었다.** VenueLink 의 기본값은 false(말줄임)라
              지역('서울')이 320·360px/200% 에서 **clientWidth 0** — 말줄임표조차 없이 통째로 사라졌다.
              같은 파일 VenueLink 머리말(2026-09-12)이 "목록 카드는 말줄임 대신 줄바꿈이다(wrap=true)" 라고
              적어 두고 있었는데, 3열로 다시 짜면서 호출부에서 이 prop 을 흘렸다.
            ⚠ 주석이 의도를 적어 둬도 **호출부가 안 넘기면 기본값이 이긴다.** 기본값이 '안전하지 않은 쪽'
              (말줄임)인 prop 은 이렇게 조용히 사라진다.
            ⚠ 그리드 카드(GridCard)의 호출부는 그대로 둔다 — 거기선 포스터가 식별을 대신하고
              별점이 같은 줄에 있어 말줄임이 의도된 동작이다. */}
          <VenueLink
            pubName={schedule.pubName}
            region={schedule.region}
            wrap
            sizeCls="text-[0.75rem] min-[360px]:text-[0.6875rem]"
            onClick={schedule.venueId ? () => onVenueClick(schedule.venueId) : undefined}
          />
          {schedule.isPremium && <span className="shrink-0 rounded-badge bg-accent-300/15 px-1 text-[10px] font-extrabold leading-none text-accent-200">TOP</span>}
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
        <h3 className="line-clamp-2 break-keep text-[0.9375rem] font-bold leading-tight tracking-tight text-ink-primary [overflow-wrap:anywhere] min-[360px]:text-sm"
          title={schedule.title}>
          {titleWithoutGtd(schedule.title, !!prize)}
        </h3>

        {/* 🔴 2026-09-18(6차) 오너: "참가비를 누리 테스트 위클리 **하단으로** 변경".
            참가비(라벨+금액)가 제목 바로 아래로 왔다. 5차에서 시각이 있던 자리다.
          ⚠ 라벨과 금액은 **한 덩어리**로 붙여 둔다. 떼어 놓으면 라벨이 옆 금액(GTD)을 가리키는 것처럼
            읽혀 '참가비 1,000만' 으로 오독된다 — 금액 오독은 §28 이 막으려는 바로 그 사고다.
          ⚠ title 에 원 단위 금액을 남긴다 — T 가 무엇인지 모르는 첫 방문자가 확인할 수 있어야 한다. */}
        {/* 참가비 + 등록 마감 · 별점 · 거리 · 예약 — **한 줄**이다.
            🔴 2026-09-18(7차) 오너 선택: 참가비를 등록 마감 줄과 합쳐 가운데 열을 한 단 줄인다.
               합치기 전 이 열은 4단(매장 / 제목 / 참가비 / 메타)이라 일정 탐색의 정보 많은 줄이
               390px 에서 136 → 168px 로 커져 있었다. 합치면 참가비 줄(24px)이 메타 줄에 흡수된다.
             ⚠ `items-baseline` 이다(`items-center` 아님). 참가비 금액은 17~19px, 나머지는 10.6px 라
               가운데 정렬하면 작은 글자들이 붕 뜬다 — 글자 밑선을 맞춰야 한 줄로 읽힌다.
             ⚠ `flex-wrap` 은 그대로 둔다. 320px 에서 `참가비 1,234,567원`(133px) 하나가 이미
               열 폭(113.5px)을 넘는다 — 접혀야 금액이 온전히 남는다(§28 반올림 금지).
               즉 좁은 폭에서는 두 줄로 돌아가지만 **잘리지는 않는다.** 넓은 폭에서 버는 구조다.
             ⚠ 가로 스크롤에 넣지 않는다 — 예전에 등록 마감이 숨은 스크롤 안으로 사라져
               유저가 그 정보가 없는 대회로 오해했다(§6-1). */}
        {/* 🔴 2026-09-18(9차) 오너: "참가비 10T 에서 **위로 줄간격을 붙여**" → 10차 "**조금 더 올려줘**".
            부모의 `space-y-0.5`(+2.125px)를 0 으로 되돌린 뒤, 한 번 더 요청이 와서 **−4.25px** 로 당겼다.
          ⚠ `!` 가 필수다. `space-y-*` 는 `.space-y-0\.5 > :not([hidden]) ~ :not([hidden])` 라
            명시도가 (0,3,0) 이고 평범한 `-mt-1`(0,1,0)은 진다 — important 없이는 조용히 무시된다.
          ⚠ 음수 마진은 **줄상자를 겹치게** 만든다. 제목이 2줄일 때 아랫줄 글자와 참가비 글자가
            부딪히지 않는지 반드시 실측해라(잘림 게이트는 겹침을 못 본다 — 넘침이 아니라서). */}
        <div className="!-mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-2xs leading-tight text-ink-muted">
          {/* ⚠ `shrink-0` 을 주지 마라. `참가비 1,234,567원` 은 131px 인데 320px 의 이 열은 114px 다 —
              줄지도 접히지도 못해 **값이 잘린다**(실측 `114/131`, 잘림 게이트가 잡았다).
              안쪽도 `flex-wrap` 이라야 라벨이 윗줄로 가고 금액이 온전히 남는다. */}
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">참가비</span>
            {/* 🔴 2026-09-18(8차) 오너: "10T 의 폰트 크기를 줄여서". text-base/lg → text-sm/base.
                이 한 단계가 곧 이 줄의 높이라, 가운데 열이 그만큼 낮아지고 왼쪽 정사각 타일과 키가 맞는다. */}
            <span className="text-[0.8125rem] font-extrabold tabular-nums tracking-tight text-ink-primary min-[360px]:text-sm"
              title={schedule.buyIn?.amount ? `${schedule.buyIn.amount.toLocaleString()}원` : undefined}>
              {buyInText(schedule.buyIn?.amount)}
            </span>
          </span>
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

      {/* ③ GTD · 시각 — §28 상품 가격 정보라 표시를 유지한다.
          🔴 2026-09-18(6차) 오너: "GTD 1000만 **크기를 키우고** 참가비 있는 쪽으로 변경 /
             시간과 날짜를 GTD 1000만 쪽으로". 참가비가 가운데 열로 갔고(위) 이 열은 GTD·시각이 됐다.
             GTD 는 text-2xs(10.6px) → text-sm/base 로 키웠다.
           ⚠ 열 폭을 80 → 92px 로 같이 넓혔다. 안 넓히면 커진 GTD 가 두 줄로 접혀 이 열이 새 병목이 된다
             (4차에 오른쪽 열로 옮겼다가 카드가 +16px 커진 그 자리다).
             폭 예산 320 = 44 + 8.5 + 102 + 8.5 + 84 = 247 ≤ 258.5 · 360 = 56 + 6.4 + 119 + 6.4 + 92 = 279.8 ≤ 298.6
           ⚠ 날짜를 빼지 마라 — 여러 날짜가 섞인 평면 목록이라 날짜가 유일한 날짜 단서다.
             한 번 빠졌다가 e2e(theme-tokens-v7 ⑦)가 "9/18 일정 행이 한 장도 안 보인다" 로 잡았다. */}
      <div className="order-3 w-[88px] shrink-0 text-right min-[360px]:w-[96px]">
        {/* 🔴 라벨은 작게, 금액은 크게 — 'GTD 1,000만' 을 **한 덩어리 큰 글자**로 두면 88px 안에서
            두 줄로 접히고(실측) 이 열이 4단이 되어 카드가 95.6 → 118.7px 로 커졌다.
            라벨/금액을 나누면 같은 2줄이라도 라벨 줄이 13px 라 높이가 절반이다.
          ⚠ 라벨과 금액은 **정본 하나**(prizeParts)에서 온다 — 문자열을 다시 쪼개 쓰지 마라. */}
        {/* 🔴 2026-09-18(8차) 오너: "GTD 와 아래 1000만을 **한 줄로 합치고**".
            라벨과 금액을 한 줄에 둔다 — 이 열이 3단 → 2단이 되어 카드가 그만큼 낮아진다.
          ⚠ 11차에서 금액을 한 단계 키우며(text-sm/base → text-base/lg) **라벨을 10 → 9px 로 줄이고
            `tracking-wide` 를 뺐다.** 열 폭을 안 건드리고 금액에 줄 자리를 라벨에서 번 것이다 —
            폭 예산이 320px 에서 여유 3.5px 뿐이라 열을 넓히는 선택지가 없었다.
            실측 폭: 라벨 21 → 17 · 금액 54~62 → 63~71 · 합계 84(320) / 92(360+) ≤ 88 / 96.
          ⚠ `items-baseline` — 10px 과 15~17px 를 가운데 정렬하면 작은 라벨이 붕 뜬다. */}
        <p className={`flex flex-wrap items-baseline justify-end gap-x-1 leading-tight ${prize ? 'text-gold-300' : 'text-ink-muted'}`}>
          <span className="text-[9px] font-bold uppercase opacity-80">{prize?.label ?? '상금'}</span>
          <span className="break-keep text-base font-extrabold tabular-nums min-[360px]:text-lg">{prize?.amount ?? '—'}</span>
        </p>
        {/* 🔴 2026-09-18(9차) 오너: "날짜를 좌측으로 시간을 우측에 붙여줘". 순서를 뒤집었다.
            오른쪽 정렬 열이라 **시각이 열 끝에 딱 붙고** 날짜가 그 왼쪽에 선다 —
            줄마다 시각의 오른쪽 모서리가 같은 x 에 서므로 세로로 훑기 좋다. */}
        {/* 🔴 2026-09-18(11차) 오너: "GTD 1000만을 조금 더 키우고 **아래 시간 날짜를 줄여**".
            시각 text-base/lg → text-sm/base, 날짜는 9px. GTD 가 이 열의 주인공이 되도록 대비를 벌린다.
          ⚠ `flex-wrap` 을 넣어 둔다. 320px 에서 `9/18(금) 18:00` 은 87px 로 열(88px)에 **1px 남기고**
            들어간다 — 요일이 한 글자 더 길거나 글꼴이 바뀌면 바로 넘친다. 접히는 편이 잘리는 것보다 낫다. */}
        <p className="mt-0.5 flex flex-wrap items-baseline justify-end gap-x-1 leading-tight">
          <span className="text-[9px] tabular-nums text-ink-muted">{d.monthDay}({d.dow})</span>
          <span className="text-sm font-extrabold tabular-nums tracking-tight text-ink-primary min-[360px]:text-base">{d.time || '—'}</span>
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
