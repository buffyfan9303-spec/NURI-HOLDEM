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
import { posterFallbackBg } from '../../lib/posterFallbackBg';

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

/** 목록 카드 '레지마감' 칸의 값 — **저장된 값을 그대로** 돌려준다(오너 2026-09-20: "계산하지 마라").
 *
 *  왜 위 `regCloseText` 를 안 쓰나: 그쪽은 '16LV 00:12' 를 '등록 마감 16레벨' 로 **다시 쓴다**.
 *  업주가 '레벨 8' 이라 적었든 '22:30' 이라 적었든 유저에게는 업주가 적은 문장이 그대로 보여야 한다.
 *  라벨('레지마감')이 이미 무슨 값인지 말하므로 접두사도 붙이지 않는다.
 *
 *  ⚠ `regCloseText` 는 지우지 않는다 — PC 표(ScheduleTable)와 아래 GridCard 가 그 어휘를 쓴다.
 *    두 함수가 같은 필드를 다르게 읽는 것이 아니라, **같은 값을 자리에 맞게 다르게 적는 것**이다.
 *  ⚠ `structure.lateRegLevels` 폴백은 유지한다. 실데이터에는 거의 없지만(lib/regClose 주석 참조)
 *    regCloseTime 이 빈 옛 포스터가 이 값을 쓰고 있어, 빼면 그 포스터에서 정보가 통째로 사라진다.
 *    숫자만 찍으면 무슨 숫자인지 알 수 없으므로 그때만 '레벨' 을 붙인다. */
function regCloseRaw(s: Pick<Schedule, 'regCloseTime' | 'structure'>): string | null {
  const rc = String(s.regCloseTime ?? '').trim();
  if (rc) return rc;
  const n = s.structure?.lateRegLevels;
  return n != null && n > 0 ? `${n}레벨` : null;
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
  posterUrl, posterColor, title, className = '', thumbWidth = 400, priority = false, vtName, compact = false,
  fallbackText,
}: { posterUrl?: string; posterColor?: string | null; title: string; className?: string; thumbWidth?: number; priority?: boolean;
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
      style={{ background: posterFallbackBg(posterColor), ...(vtName ? { viewTransitionName: vtName } : {}) }}
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
  // 🔴 2026-09-20: wrap 모드를 **flex 에서 글 흐름(block)으로** 바꿨다.
  //   flex 로 두면 매장명 span 이 **flex 줄을 통째로** 차지한다 — 이름이 한 줄을 넘는 순간
  //   `·`·지역이 **항상 다음 줄**로 밀린다. 남는 자리가 있어도 그렇다(flex 줄바꿈 규칙).
  //   실측(3열 재구성 후, 매장 줄 높이): 320px 59.5px(3줄) · 360px 37.2px(2줄).
  //   인라인으로 흘리면 지역이 이름 **마지막 줄 끝에** 붙는다 → 320px 39.7px(2줄) · 360px 18.6px(1줄).
  //   목록에서 이 한 줄이 카드 높이의 20~37% 였다.
  // ⚠ 비-wrap(그리드 카드)는 손대지 않는다 — 거기선 별점이 같은 줄에 있어 flex 정렬이 필요하다.
  const rootCls = wrap
    ? `block min-w-0 max-w-full ${sizeCls} text-ink-muted text-left`
    : `inline-flex min-w-0 items-baseline gap-0.5 ${sizeCls} text-ink-muted max-w-full text-left`;
  const nameCls = wrap
    ? 'break-keep [overflow-wrap:anywhere] font-semibold text-ink-secondary'
    : 'min-w-0 truncate font-semibold text-ink-secondary';
  // flex 가 아니면 gap 이 안 먹는다 — 구분점 좌우 여백을 padding 으로 준다(flex 쪽은 종전 gap 그대로).
  const dotCls = wrap ? 'px-0.5 text-border-strong' : 'shrink-0 text-border-strong';
  const regionCls = wrap ? 'break-keep' : (regionShrinks ? 'min-w-0 flex-1 truncate' : 'shrink-0');
  if (!onClick) {
    return (
      <span className={rootCls}>
        <span className={nameCls}>{pubName}</span>
        <span className={dotCls}>·</span>
        <span className={regionCls}>{region}</span>
      </span>
    );
  }
  return (
    // ⚠ 2026-09-21 — 이 링크의 실제 박스는 18px(글줄 하나)이다. 더미 일정이 홈에 다시 뜨자 design-tokens 의
    //   '28px 미만 히트영역' 게이트가 이 자리를 잡았고, `tap-y-44`(::before 오버행)로 키웠더니 이번엔 home-flow-fit 의
    //   잘림 게이트(scrollHeight > clientHeight)가 그 의사요소를 '잘림' 으로 세어 CI 가 빨개졌다(f966f44 → 2d8ac48 되돌림).
    // 🔴 HIT-1(2026-09-22) — 되돌린 채 두지 않고 **위로만** 넓힌다.
    //   · 기준 정정: 44px 은 WCAG 2.2 SC 2.5.5 **AAA** 이고, AA(SC 2.5.8)는 **24px** 이다. AA 만 충족한다.
    //   · 아래로 넓히면 간격 0 으로 붙은 제목을 덮어 카드 탭을 가로챈다(목적지가 다르다) — 그래서 아래는 0 이다.
    //   · 카드 높이·`--card-h-list`·HomeTab 스켈레톤은 **한 픽셀도 안 바꾼다**(의사요소라 flow 밖).
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={`group tap-up-24 ${rootCls} hover:text-accent-300 transition-colors`}
    >
      <span className={`${nameCls} underline decoration-dotted underline-offset-2 group-hover:text-accent-300`}>
        {pubName}
      </span>
      <span className={dotCls}>·</span>
      <span className={regionCls}>{region}</span>
    </button>
  );
}

// ── 서브: 상태 배지(행당 1개) ───────────────────────────────────────────────


/** 실측 레지 상태 → 배지 텍스트·톤.
 *  §9 쉬운 한국어: 'LIVE' → '진행 중', '레지마감' → '등록 마감'. */
// eslint-disable-next-line react-refresh/only-export-components -- 순수 판정 함수를 단위 테스트에 노출(titleWithoutGtd 와 같은 이유)
export function liveBadge(regInfo: RegInfo | undefined): { text: string; closed: boolean } {
  if (regInfo && regInfo.msLeft === 0) return { text: '등록 마감', closed: true };
  if (regInfo && regInfo.msLeft !== null) return { text: '등록 가능', closed: false };
  // 🔴 15-ⓐ(2026-09-21 오너 결정): **실측 근거가 있을 때만 '진행 중'이라 부른다.**
  //   여기까지 온 regInfo 는 `msLeft === null`(= 등록 마감 레벨 미설정) 뿐이다.
  //   클락이 이 포스터에 실제로 매칭돼 돌고 있다는 것은 **잰 사실**이고, 모르는 것은 등록 가능 여부뿐이다.
  if (regInfo) return { text: '진행 중', closed: false };
  // regInfo 가 아예 없다 = 매칭되는 클락이 없다. 이때 아는 것은 `scheduleStatus` 가 준
  //   '예정 시작 시각이 지났고 +10시간 안이다' 뿐이다 — 대회가 실제로 돌고 있는지는 **모른다**.
  //   ⚠ '종료' 같은 단정으로 바꾸지 마라. 모르는 것을 반대 방향으로 단정하면 지금보다 나빠진다
  //     (클락을 안 쓰는 매장에서는 이 배지가 '지금 열려 있다'는 유일한 신호다 — HANDOFF R3-1).
  return { text: '시작 시각 지남', closed: false };
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
  // 🔴 2026-09-22 요구 C — `favorited`·`onToggleFavorite` 를 **이 카드에서 걷어냈다**.
  //   하트가 있던 우측 자리에는 등급 배지(`schedule-grade-badge`)가 들어간다.
  //   ⚠ 즐겨찾기 **시스템은 살아 있다**: `src/lib/useFavoriteVenues.ts`·`venue_follows`·캘린더 찜 필터와
  //     `LiveGamesTab` 진행 게임 줄의 단골 표시(같은 파일 285·296행)가 그대로 쓴다.
  //     여기서 없앤 것은 '일정 목록 카드에 하트를 그리는 것' 하나뿐이다.
  /** 매장 대표 이미지·테마색 — 목록 줄 **왼쪽 로고 자리**가 쓴다(2026-09-18 오너 레퍼런스).
   *  DB 에 '로고' 전용 칸은 없어 `venues.image_url`·`theme_color` 를 그대로 쓴다(서버 변경 0).
   *  App 이 이미 `venueById` 를 들고 있으므로 호출부에서 꺼내 내려 준다 — 조회를 카드가 하지 않는다. */
  venue?: { imageUrl?: string; themeColor?: string };
}

/* 🔴 2026-09-20 오너: 목록 카드에서 **날짜와 카운트다운을 뺀다.**
 *   여기 있던 `soonText()`('12시간 49분 후')를 지웠다 — 유일한 소비처가 이 카드였다.
 * ⚠ 잃은 것 두 가지를 숨기지 않고 적는다:
 *   ① **날짜** — 일정 탐색 목록은 날짜 그룹 머리말이 없는 **평면 목록**이라(App.tsx `visibleSchedules.map`)
 *      카드에서 `9/20(일)` 이 빠지면 여러 날짜가 섞인 줄에서 날짜 단서가 상단 날짜 스트립뿐이다.
 *      홈 탭('오늘·내일' 두 날짜를 한 목록에 섞어 보여 준다)에서는 두 날이 구분되지 않는다.
 *   ② **시작까지 남은 시간** — '곧 시작'을 알아볼 단서가 없어진다.
 *   되살리려면 git 이력의 `soonText` 를 가져와 시각 아래에 붙이면 된다(열 폭은 그대로 쓴다).
 * ⚠ `scheduleStatus` import 는 그대로 둔다 — 아래 GridCard 가 쓴다. */

/** 대회 등급 배지 — 오너 목업의 제목 오른쪽 `[SPECIAL]` 칸.
 *  어휘는 상단 필터 칩(App.tsx)·포스터 입력(PosterFormModal)과 **같은 말**을 쓴다.
 *  같은 대회를 화면마다 다른 이름으로 부르면 필터로 고른 것과 카드에 적힌 것이 달라 보인다.
 *  ⚠ `grade` 가 없으면(일반 대회) 배지를 렌더하지 않는다 — 빈 배지는 제목 폭만 먹는다.
 *  ⚠ TOP(유료 노출)을 여기 두지 않는다. 2026-09-18(5차) 오너가 "top 를 누리 테스트 홀덤펍 뒤로"
 *    라고 지정해 매장 줄로 옮긴 자리이고, 제목 안에 두면 320px 에서 43px 를 먹는다(그때 실측). */
const GRADE_BADGE: Record<string, string> = { daily: '데일리', satellite: '새틀', series: '시리즈' };

/** 지표 한 칸 — 위에 작은 라벨 / 아래에 값. 3칸이 **한 줄에 서야 하므로** 이 칸은 자기 내용만큼만
 *  차지하고(basis auto), 폭이 모자라면 `min-w-0` 으로 줄어든다. 줄어들면 글자가 접힐 뿐 잘리지 않는다
 *  — `[overflow-wrap:anywhere]` 가 그 탈출구다(§28: 막으려는 것은 '금액이 안 보이는 것'이다).
 *  ⚠ `flex-1`(균등 3등분)로 하지 마라. 320px 에서 칸이 44px 인데 `1,000만` 이 47px 라 반드시 접힌다. */
function Metric({ label, value, tone, title }: { label: string; value: string; tone?: string;
  /** 값의 원문(마우스 오버·보조기기용). 참가비 `10T` 는 이 저장소의 단위라 **첫 방문자가 확인할 길**이 필요하다. */
  title?: string }) {
  return (
    <div className="min-w-0 sm:min-w-[4.5rem]" title={title}>
      <div className="text-[8.5px] font-bold uppercase leading-tight text-ink-muted [overflow-wrap:anywhere] min-[360px]:text-[9px]">{label}</div>
      <div className={`text-[11px] font-extrabold leading-tight tracking-tight tabular-nums [overflow-wrap:anywhere] min-[360px]:text-xs ${tone ?? 'text-ink-primary'}`}>{value}</div>
    </div>
  );
}

function ListCard({
  // 🔴 2026-09-22 — `regInfo` 를 목록 카드도 받는다. 시각 아래 `생존/엔트리` 의 출처다.
  //   App 이 이미 `regInfoBySchedule` 로 넘기고 있어 **새 조회는 0건**이다(이 카드가 직접 클락을 읽지 않는다).
  schedule, onVenueClick, onSelect, reserveCount, rating, priority, distanceKm, vtActive, venue, regInfo,
}: CardProps) {
  // 목록 카드만 라벨·금액을 따로 그린다(라벨 작게·금액 크게) — 계산은 정본 하나(prizeParts).
  const prize = prizeParts(schedule);
  // 레지마감은 **저장된 값 그대로**다(오너 2026-09-20: "계산하지 마라") — regCloseText 의 가공('등록 마감 N레벨')을
  // 거치지 않는다. 그 함수는 그대로 남는다(PC 표 ScheduleTable·아래 GridCard 가 쓴다).
  const reg = regCloseRaw(schedule);
  const grade = schedule.grade ? GRADE_BADGE[schedule.grade] : undefined;

  return (
    <article
      onClick={() => onSelect(schedule)}
      // 키보드·보조기기 접근 (2026-09-11) — 종전엔 role·tabIndex·onKeyDown 이 없어 **클릭으로만** 열렸다.
      //   부스트·프리미엄으로 상단에 고정된 유료 노출(TOP) 카드도 같은 컴포넌트라, 돈을 받고 최상단에
      //   올린 항목이 키보드 사용자에게는 열 수 없는 요소였다. 커뮤니티 PostRow 와 같은 패턴으로 맞춘다.
      // 🔴 2026-09-20: 오너 지시로 화면에서 날짜를 뺐다. 대신 `data-date` 로 남긴다 —
      //   e2e(theme-tokens-v7 ⑦)가 '오늘·내일 행이 둘 다 렌더되는가'를 카드 **글자**로 확인하고 있어
      //   글자만 빼면 그 게이트가 빈손이 된다(전에 한 번 걸렸던 자리다). 게이트가 볼 값을 남겨 둔다.
      data-date={schedule.date}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // 🔴 2026-09-24 연결성 감사① — 카드 **안의** 버튼(매장명 등)에서 올라온 키는 그 버튼의 것이다.
        //   이 가드가 없으면 매장명에 포커스하고 Enter 를 누르면 카드가 preventDefault 로 가로채 **포스터 상세**가 열렸다(클릭은 매장).
        if (e.target !== e.currentTarget) return;
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
        //   호버 하이라이트 자체는 그대로 둔다(즉시 반응).
        // 🔴 2026-09-20 오너 목업 — **3덩어리 한 줄**이다.
        //     [정사각 로고] [매장·지역 / 대회명+등급 / 3칸 지표] [시작 라벨·큰 시각 + 꺾쇠]
        // ⚠ grid 3열(auto · 1fr · auto)로 먼저 짰다가 **글자 200% 확대에서 무너져** 되돌렸다.
        //   ⚠ 그 클래스명을 여기 **그대로 적지 마라** — Tailwind content 는 주석도 평문 스캔이라
        //     쓰지도 않는 규칙이 라이브 CSS 에 실린다(2026-09-20 실측: 이 주석 한 줄이
        //     `.grid-cols-\[auto_1fr_auto\]{grid-template-columns:auto 1fr auto}` 를 만들고 있었다).
        //   격자 열은 wrap 하지 않아서, 양끝 `auto` 열이 max-content(로고 44 + 시각 113)를 먼저 가져가고
        //   `minmax(0,1fr)` 인 가운데가 **25px** 까지 쭈그러들었다 — 제목이 한 글자씩 17~25줄로 흘러
        //   카드가 953~1008px 이 됐다(실측 320/200%. 같은 조건 수정 전 빌드는 413~488px).
        // → **flex-wrap + rem basis** 로 짠다. 폭이 모자라면 시각 덩어리가 **스스로 다음 줄**로 내려가
        //   가운데가 폭을 되찾는다(실측 320/200%: 가운데 25 → 224.5px). 이 저장소가 여러 번 쓴 탈출구다.
        //   basis 를 rem 으로 두는 것이 핵심이다 — px 미디어쿼리는 **글자 확대를 못 본다**.
        // ⚠ 12차에 "flex 로는 줄이 안 맞아 grid 로 갔다" 는 기록이 있는데, 그건 [제목|GTD]처럼
        //   **좌우 열의 행끼리 밑선을 맞춰야 했을 때** 이야기다. 이 목업은 가운데가 자기 안에서만
        //   쌓이고 시각은 통째로 한 덩어리라 맞출 행 자체가 없다.
        // ⚠ 폭 예산(100%). 가용 = 카드 폭 − 패딩 25.5. 한 줄에 서려면 로고+basis+시각+gap ≤ 가용:
        //     320 → 258.5 ≥ 44 + 4.25 + 102 + 4.25 + 63.5 = 218      (여유 40.5 → 가운데 142.5)
        //     360 → 298.5 ≥ 56 + 8.5 + 102 + 8.5 + 72.5 = 247.5      (여유 51   → 가운데 153)
        //     390 → 328.5 ≥ (같음)                                    (여유 81   → 가운데 183)
        //   가운데가 3칸 지표의 자연 폭(320:110 / 360:127)보다 넓어야 지표가 한 줄로 선다.
        //   **로고·시각 글자·gap 중 무엇이든 키우면 지표 줄이 먼저 접힌다** — 바꾸기 전에 다시 재라.
        // 🔴 2026-09-22 오너: "파란 점선(카드) 박스 위아래 폭을 줄여줘" — py-2.5(10.6px) → py-1.5(6.4px). 카드 −8.5px.
        //   같이 바꾼 것: `--card-h-list`(index.css) 91→82 · 110→102, `.cv-card-list` cis 의 패딩 보정 1.25rem→0.75rem,
        //   HomeTab·App 스켈레톤 행의 py-2.5→py-1.5(스켈레톤 로고 h-16 + 패딩이 카드 높이와 같아야 데이터 도착 때 안 밀린다).
        //   매장명 링크(빨간 상자)는 그대로다. e2e/theme-tokens-v7 ⑦ 이 실제 높이 vs 토큰을 잰다.
        'flex flex-wrap items-center gap-x-1 gap-y-1 cursor-pointer px-3 py-1.5 hover:bg-surface-high/50 active:bg-surface-high',
        'min-[360px]:gap-x-2',
        // 프리미엄(TOP)은 행 틴트 + 매장 줄 마커로 차별(박스 글로우 제거 — 목록 결 유지)
        schedule.isPremium ? 'bg-accent-300/[0.05]' : '',
      ].join(' ')}
    >
      {/* ① 매장 로고 — 정사각 타일. 줄마다 같은 자리·같은 크기라 눈이 세로로 훑기 좋다.
          ⚠ vt-poster(카드→상세 모핑)의 출발점이 이 로고다 — 크기를 바꿔도 `vtName` 은 그대로 둔다.
            이름을 빼면 모핑이 조용히 사라진다(index.css 는 그대로 초록이라 아무도 모른다).
          ⚠ 48/56 을 키우지 마라. 이 3열에서는 **폭이 곧 높이다** — 왼쪽이 넓어지면 가운데가 줄어
            제목이 한 줄 더 접히고 그 줄이 카드 높이가 된다(2026-09-18 4차에 11px 로 겪었다). */}
      <div className="shrink-0">
        <PosterArea
          posterUrl={venue?.imageUrl}
          posterColor={venue?.themeColor ?? schedule.posterColor}
          fallbackText={venueInitial(schedule.pubName)}
          title={schedule.pubName}
          className="h-[42px] w-[42px] rounded-[9px] min-[360px]:h-[48px] min-[360px]:w-[48px] min-[360px]:rounded-[10px]"
          thumbWidth={128}
          priority={priority}
          vtName={vtActive ? 'vt-poster' : undefined}
        />
      </div>

      {/* ② 가운데 덩어리 — 매장 / 대회명 / 3칸 지표. 세 줄은 여기 **안에서만** 쌓인다.
          ⚠ `basis-[6rem]`(=102px @100%, 204px @200%)가 줄바꿈 문턱이다. flex 는 **줄이기 전의
            가상 크기**로 줄을 가르므로, 확대되면 이 덩어리가 커져 시각 덩어리를 아랫줄로 민다.
          ⚠ `min-w-0` 이 없으면 안쪽 긴 글자가 이 덩어리를 밀어 카드가 가로로 넘친다. */}
      <div className="min-w-0 grow basis-[6rem]">
      {/* ② 1행 — 매장 · 지역 (+ TOP · 별점 · 거리 · 예약 · ♥)
          🔴 목업에는 매장명만 그려져 있지만 **지우지 않는다.** TOP(유료 노출)·별점·거리·예약·♥ 는
            지금 카드가 가진 기능이고, 3칸 지표 줄이 옛 메타 줄의 자리를 가져갔으므로 이 줄로 옮긴다.
            (같은 파일 옛 주석의 제안대로다: "다시 필요해지면 매장 줄 끝에 작게 붙이는 편이 낫다".)
          ⚠ `flex-wrap` — 다섯이 다 붙는 최악 조합에서 320px 을 넘기면 통째로 잘리는 대신 접힌다.
          ⚠ 부가 항목에 `shrink-0` 을 주지 마라. 200% 확대에서 `예약 3명`(81px)이 칸(74px)을 넘겨
            줄이 통째로 잘린 적이 있다(실측 74/81) — 줄어들 수 있어야 wrap 이 일한다. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0">
        {/* ⚠ `wrap` 을 반드시 넘긴다. VenueLink 의 기본값은 말줄임이라 320·360px/200% 에서
            지역('서울')이 clientWidth 0 으로 **말줄임표조차 없이 사라진다**(2026-09-18 실측). */}
        <VenueLink
          pubName={schedule.pubName}
          region={schedule.region}
          wrap
          sizeCls="text-[0.75rem] min-[360px]:text-[0.6875rem]"
          onClick={schedule.venueId ? () => onVenueClick(schedule.venueId) : undefined}
        />
        {schedule.isPremium && <span className="shrink-0 rounded-badge bg-accent-300/15 px-1 text-[10px] font-extrabold leading-none text-accent-200">TOP</span>}
        {rating && rating.count > 0 && (
          <span className="text-[10px] tabular-nums leading-tight text-gold-300" title={`방문 후기 ${rating.count}건 평균`}>
            ★{rating.avg.toFixed(1)}
          </span>
        )}
        {distanceKm != null && <span className="text-[10px] tabular-nums leading-tight text-ink-muted">{fmtKm(distanceKm)}</span>}
        {(reserveCount ?? 0) > 0 && <span className="text-[10px] tabular-nums leading-tight text-ink-muted">예약 {reserveCount}명</span>}
      </div>

      {/* ② 2행 — 대회명(굵고 밝게). 등급 배지는 여기 없다 — 오른쪽 칸으로 옮겼다(아래 ④).
          ⚠ 제목 끝의 GTD 표기는 화면에서만 뗀다 — 아래 지표 줄의 GTD 칸이 같은 값을 숫자에서 계산해
            보여 주기 때문이다(정본 하나). `title` 속성에는 원문을 남긴다.

          🔴 2026-09-22 요구 C — **모든 폭에서 1줄(`line-clamp-1`)** 이다. 아래 옛 기록과 반대다.
            바뀐 전제: 제목이 `SCHEDULE_TITLE_MAX = 12`(공백 포함)로 서버·폼 양쪽에서 제한된다
            (`src/api/schedules.ts`). 12자면 320px 에서도 한 줄에 서므로 여러 줄을 허용할 이유가 없어졌다.
            줄 수는 `e2e/schedule-card-fit.spec.ts` 가 320/360/390/412 에서 `height / lineHeight` 로 잰다
            (`getClientRects()` 는 `-webkit-line-clamp` 아래에서도 줄 상자를 다 세므로 쓰지 마라).

          ── 아래는 **옛 기록**이다(지금 코드와 반대 — 되살리지 마라, 왜 그랬는지만 남긴다) ──
          · 한때 2줄까지 허용했다: 한글 제목이 길어 1줄로 자르면 '누리 테스트 위클리 메인 1000만…' 처럼
            정작 무슨 대회인지가 사라졌다. 제목 길이에 상한이 없던 시절의 이야기다.
          · 390 미만에서는 가운데가 30~50px 좁아 같은 제목이 3줄을 요구했다(실측 320: 제목 칸 142.5px).
            거기서 2줄로 자르면 꼬리가 통째로 사라져 3줄을 줬고, 카드가 +21px 길어졌다.
          · 등급 배지는 h3 안의 **인라인**이었다. 형제로 빼면 제목이 2줄일 때 배지가 아랫줄로 밀려
            '제목 오른쪽'이 아니라 별도 줄이 됐기 때문이다(실측 320·360: 카드 +18px).
            제목이 1줄로 고정된 지금은 그 문제가 없어 오른쪽 칸(하트가 있던 자리)으로 옮겼다. */}
      {/* 🔴 2026-09-20 3차 — 오너 목업 대조 후 **글자를 줄였다**("글자 크기 줄여서 잘 맞춰").
          목업에서는 대회명이 **한 줄**에 서고 카드가 훨씬 납작하다(목업 ≈74px vs 종전 구현 109px).
          종전: `text-base`(17px) + 390 미만 3줄 허용 → 더미 제목이 2줄을 먹어 카드가 길어졌다.
          지금: 한 단계 낮춰 `text-[0.875rem]`(14.875px), 390+ 에서도 **2줄 상한은 유지**한다.
          ⚠ 1줄로 **강제하지 않는다.** 오너가 2026-09-12 에 "1줄로 강제해 말줄임하면 정작 무슨
            대회인지가 사라진다" 고 했다 — 글자를 줄여 대개 한 줄에 들어가게 하되, 긴 제목은 접힌다.
          ⚠ 320px 미만에서만 3줄을 허용한다(가운데가 142.5px 라 2줄로 자르면 꼬리가 사라진다). */}
      {/* 🔴 2026-09-22 요구 C — 제목은 **모든 폭에서 한 줄**이다(line-clamp-1).
          새 입력 상한이 공백 포함 12자(`SCHEDULE_TITLE_MAX`)라 한국어 제목은 320px 에서도 한 줄에 들어간다
          (320 제목칸 148px vs 한글 12자 139.4px 실측). 그래도 1줄로 **고정**하는 이유는 두 가지다:
            ① 운영에 이미 있는 13자 이상 legacy 제목을 자동 절단·DB 덮어쓰기 하지 않기로 했다 —
               그것들이 2~3줄로 펴지면 카드 높이가 제각각이 되고 `--card-h-list` 예약과 어긋난다(CLS).
            ② 글자 수는 폭을 보장하지 못한다(`W` 12자 ≈ 161.8px > 148px). 렌더 안전망이 따로 필요하다.
          ⚠ 종전 주석의 "1줄로 강제하지 마라"(2026-09-12)는 **입력 상한이 없던 시절**의 판단이다.
            지금은 12자 상한이 생겨 '한 줄에 다 보인다' 가 기본이고, ellipsis 는 legacy 전용 안전망이다.
          ⚠ grade 배지는 여기서 뺐다 — 아래 우측 덩어리(하트가 있던 자리)로 옮겼다. */}
      <h3 className="min-w-0 line-clamp-1 break-keep text-[0.8125rem] font-bold leading-tight tracking-tight text-ink-primary [overflow-wrap:anywhere] min-[360px]:text-xs"
        title={schedule.title}>
        {titleWithoutGtd(schedule.title, !!prize)}
      </h3>

      {/* ② 3행 — 3칸 지표(GTD · 참가비 · 레지마감). 칸 사이는 가는 세로 구분선.
          🔴 `flex` 다(`grid grid-cols-3` 아님). 균등 3등분이면 320px 에서 칸이 44px 인데
            `1,000만` 이 47px 라 **항상** 접힌다. 내용 폭으로 두면 320px 에서도 129px 로 한 줄에 선다.
          ⚠ 3칸은 **wrap 하지 않는다**(flex 기본 nowrap). 폭이 모자라면 칸이 줄고 그 안의 글자가 접힌다.
          ⚠ `divide-x` 는 `> * + *` 에 border-left 를 준다 — 칸을 지우면 구분선도 같이 사라진다.
          ⚠ `data-metrics` 는 계측용 손잡이다(3칸이 한 줄인지 실측할 때 집는다). 지우지 마라. */}
      <div
        data-metrics
        className={[
          // 🔴 2026-09-20 2차 — `flex-wrap` 을 **넣었다**. 넣기 전에는 nowrap 이라 폭이 모자라면
          //   칸이 쭈그러들고 그 안의 **값이 잘렸다**. e2e 실측(320px·글자 200%):
          //     레지마감 칸 clientWidth 30 / scrollWidth 33 · 값('—') 21/24 — 3px 씩 잘려 나갔다.
          //   이 저장소의 계약은 "이름은 줄여도 **값은 못 줄인다**" 다(§7·schedule-card-fit).
          //   wrap 이 있으면 자리가 없을 때 칸이 아랫줄로 내려가 값이 온전히 남는다 — 시각 덩어리가
          //   쓰는 것과 **같은 탈출구**다. 100% 에서는 폭이 남아 wrap 이 일어나지 않아 3칸 한 줄 그대로다
          //   (그 '한 줄' 은 `e2e/schedule-card-fit.spec.ts` 가 확대 100% 에서만 단언한다).
          // ⚠ `gap-y-0.5` 로 접힌 줄 사이만 띄운다 — 한 줄일 때는 아무 영향이 없다.
          'flex min-w-0 flex-wrap items-start gap-y-0.5 divide-x divide-border-subtle',
          '[&>*]:px-1 [&>*:first-child]:pl-0 [&>*:last-child]:pr-0 min-[360px]:[&>*]:px-1.5',
        ].join(' ')}
      >
        {/* 상금 — 값에만 색을 준다(지금 GTD 가 쓰던 gold-300 그대로).
            ⚠ 라벨·금액 둘 다 정본 하나(prizeParts)에서 온다. 'GTD'(보장)와 '예상 상금'(엔트리 비례)은
              뜻이 달라 같은 말로 적으면 보장되지 않은 금액을 보장처럼 말하게 된다.
            ⚠ 상금이 없으면 라벨 '상금' + 값 '—'(오너 지시). 0 이나 확정값처럼 적지 않는다. */}
        <Metric label={prize?.label ?? '상금'} value={prize?.amount ?? '—'} tone={prize ? 'text-gold-300' : 'text-ink-muted'} />
        {/* 참가비 — §28 상품 가격 정보라 표시를 유지한다. T 로 정확히 떨어지는 금액만 T, 나머지는 원 그대로. */}
        <Metric label="참가비" value={buyInText(schedule.buyIn?.amount)}
          title={schedule.buyIn?.amount ? `${schedule.buyIn.amount.toLocaleString()}원` : undefined} />
        {/* 레지마감 — 저장된 값 그대로('16LV 00:12'·'레벨 8'·'22:00' 무엇이든).
            🔴 값이 없을 때 **빈칸이 아니라 '—'** 로 둔다. 근거: 이 줄은 구분선으로 칸을 가르는 3칸 격자라
              가운데·끝 칸이 비면 눈이 옆 칸 값을 이 칸 것으로 읽는다(금액 오독은 §28 이 막으려는 사고다).
              그리고 '—' 는 이 카드가 이미 쓰는 어휘다 — 참가비 미입력·상금 미입력이 같은 '—' 다. */}
        <Metric label="레지마감" value={reg ?? '—'} />
      </div>
      </div>

      {/* ③ 시작 시각 + 꺾쇠 — 레퍼런스의 오른쪽 기준점.
          ⚠ 꺾쇠를 이 덩어리 **안에** 둔다(형제 flex 항목으로 빼지 않는다). 항목을 하나 더 만들면
            바깥 gap 이 하나 더 생겨 320px 예산에서 4.25px 를 그냥 잃는다 — 그게 지표 3칸의 여유다.
          ⚠ 시각 글자를 더 키우지 마라. 이 덩어리 폭이 곧 가운데의 손해다(위 폭 예산).
          ⚠ `shrink-0` 이라 줄지 않는다 — 대신 폭이 모자라면 flex-wrap 이 이 덩어리를 통째로 아랫줄로
            내린다(그게 200% 확대의 탈출구다). */}
      {/* 🔴 2026-09-20 2차 — ♥ 를 **여기**(오른쪽 덩어리 위)에 둔다. 매장 줄에 먼저 넣어 봤다가 옮겼다.
          왜 매장 줄이 아닌가 — 실측으로 확인한 두 가지다:
            ① **폭 경쟁.** 매장 줄에 넣으면 ♥(29.75) + gap(4.25) = 34px 를 매장명에서 빼앗는다.
               390px 에서 '누리 테스트 홀덤펍 강남 센텀점 · 서울' 은 172px 이 필요한데 래퍼가 149px 로
               줄어 **`· 서울` 이 아랫줄로 밀렸다** — 2026-09-20 에 `block` 흐름으로 고친 바로 그 증상이
               되돌아온다. 카드 높이 108.4 → **125.9px**(실측).
            ② **오탭.** ♥ 의 `.hit` 오버행 7.1px 이 바로 옆 매장명 링크 위에 얹힌다(같은 줄이라).
          여기로 옮기면 둘 다 사라진다 — 이 덩어리는 `shrink-0` 이고 **가로 폭이 안 늘어난다**
          (♥ 29.75 < 시각 덩어리 폭). 세로로만 쌓이는데 가운데 열이 이미 3줄이라 카드 높이도 그대로다.
          ⚠ 바깥 flex 의 **항목 수는 그대로 2개**다(로고·가운데·이 덩어리) — 위 주석이 경고한
            '항목을 하나 더 만들면 gap 이 하나 더 생긴다' 에 걸리지 않는다. 이 안에서만 세로로 나눈다.
          ⚠ ♥ 가 없을 때(비배선 화면)는 렌더되지 않아 종전 레이아웃과 **완전히 동일**하다. */}
      {/* 🔴 2026-09-22(2차 오너) — 우측 열은 **chevron 을 기준으로 오른쪽에 붙여 우측정렬**한다.
          1차에서는 셋의 centerX 를 맞췄는데(사선 제거), 오너가 실제 화면을 보고 '화살표 기준 우측정렬'로
          다시 정했다. 구조는 그대로 **2열 grid** = [시간열 auto | chevron auto] 이고 정렬만 바꾼다:
            · 시간열 안의 모든 줄이 같은 오른쪽 모서리를 쓴다(`justify-items-end` + 문단 `items-end`).
            · chevron 은 2열이라 그 모서리 **밖**이다 — 텍스트가 화살표 바로 왼쪽에 붙는다.
          ⚠ 배지를 두 열에 span 시키지 않는다. span 하면 배지만 chevron 너머까지 밀려 나가
            시각과 오른쪽 끝이 어긋난다(종전 `items-end` 구조의 사선이 정확히 그 모양이었다).
          ⚠ row-gap 을 쓰지 않는다. 배지가 없는 카드에 빈 간격이 생겨 카드가 커진다 —
            간격은 배지 자신의 `mb-0.5` 로만 준다(있을 때만 생긴다). */}
      <div className="grid shrink-0 grid-cols-[auto_auto] content-center justify-items-end gap-x-1">
        {/* 🔴 2026-09-22 요구 C — 하트 버튼을 **목록 카드에서만** 빼고 그 자리에 등급 배지를 둔다.
            ⚠ 지운 컴포넌트 이름을 이 주석에 그대로 적지 마라 — 계약 테스트가 소스 문자열로 세므로
              주석 한 줄이 '되살아났다' 로 잡힌다(이 저장소가 여러 번 밟은 함정이다).
            · 즐겨찾기 시스템 자체는 살아 있다(`useFavoriteVenues`·`venue_follows`·캘린더 찜 필터·라이브 단골).
              여기서 없앤 것은 **이 카드의 표시**뿐이다.
            · 등급은 제목 옆(인라인)에 있으면 12자 제목의 폭을 먹고 줄바꿈을 유발했다. 여기는 `shrink-0`
              세로 덩어리라 가로 폭을 안 밀고, 시각 덩어리보다 좁아 카드 높이도 그대로다(하트가 있던 자리 그대로).
            · `grade` 가 없으면 빈 자리도 만들지 않는다(gap 이 남지 않게 조건부 렌더). */}
        {grade && (
          <span data-testid="schedule-grade-badge"
            className="col-start-1 row-start-1 mb-0.5 justify-self-end rounded-badge bg-surface-high px-1 text-[10px] font-extrabold leading-none text-ink-secondary">
            {grade}
          </span>
        )}
        {/* 🔴 2026-09-22(2차 오너) — `시작` 라벨을 뺐다. 큰 숫자 하나로 충분히 '시작 시각' 으로 읽히고,
            그 자리를 아래 필드 현황(생존/엔트리)이 쓴다 — 줄 수가 늘지 않아 카드 높이가 그대로다. */}
        <p data-testid="schedule-start-group"
          className="col-start-1 row-start-2 flex min-w-0 flex-col items-end leading-tight">
          <span data-testid="schedule-start-time"
            className="text-[0.875rem] font-extrabold leading-tight tracking-tight tabular-nums text-ink-primary [overflow-wrap:anywhere] min-[360px]:text-base">
            {schedule.startTime || '—'}
          </span>
          {/* 🔴 2026-09-22(2차 오너) — 게임이 시작돼 필드 숫자가 있으면 시각 아래에 `생존/엔트리`.
              · 값은 `fieldCounts()` 단일 정본이 만든다(`src/api/clock.ts`) — 라이브 탭과 같은 수다.
              · `hasField` 가 거짓이면(시작 전·엔트리 0) **아예 안 그린다** — `0/0` 은 '아무도 없다' 로
                읽혀 오히려 틀린 정보가 된다. 안 그리면 줄도 안 생겨 카드 높이도 그대로다.
              · 접근성: 숫자만 보면 무슨 비율인지 모른다 — 보조기술에는 말로 읽어 준다. */}
          {regInfo?.hasField && (
            <span data-testid="schedule-field-count"
              className="text-[9px] font-bold leading-tight tabular-nums text-ink-muted min-[360px]:text-[10px]">
              <span className="sr-only">생존 </span>{regInfo.alive}
              <span aria-hidden>/</span><span className="sr-only">명, 엔트리 </span>{regInfo.entries}
              <span className="sr-only">명</span>
            </span>
          )}
        </p>
        {/* chevron 은 **별도 열**이다 — 위 세 텍스트의 중심 계산에 들어가지 않는다. */}
        <Icon name="chevron-right" size={14} className="col-start-2 row-start-2 shrink-0 self-center text-ink-muted" />
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
  // 배지는 한 번만 판정한다(종전엔 같은 JSX 에서 liveBadge 를 3번 불렀다).
  const badge = liveBadge(regInfo);
  /** 클락 실측이 없어 '시작 시각 지남' 으로 떨어진 경우 — 추론이므로 경고색(빨강)을 쓰지 않는다. */
  const inferred = !regInfo;
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
        // 🔴 2026-09-24 연결성 감사① — 카드 **안의** 버튼(매장명 등)에서 올라온 키는 그 버튼의 것이다.
        //   이 가드가 없으면 매장명에 포커스하고 Enter 를 누르면 카드가 preventDefault 로 가로채 **포스터 상세**가 열렸다(클릭은 매장).
        if (e.target !== e.currentTarget) return;
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
              status === 'ended' || badge.closed ? 'bg-black/70 text-white/80'
                : badge.text === '등록 가능' ? 'bg-emerald-700 text-white'
                // 추론 배지는 흰 바탕·검은 글자(중립). 빨강은 '지금 뛰고 있다'는 실측에만 남긴다.
                : inferred ? 'bg-white/85 text-black'
                : 'bg-danger-dark text-white',
            ].join(' ')}>
              {status === 'ended' ? '종료' : badge.text}
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

/** 🔴 2026-09-25 SCHEDULE-ROW-E(오너 확정 E안) — **홈 일정 · 일정 탐색(browse) 목록** 배치(`layout="timetable"`). 라이브 탭만 종전 `ListCard` 그대로다.
 *
 *  [로고 56] [① 대회명(굵게) / ② 매장 · 지역 / ③ `18:00 시작 · 레지 {저장값}` (+ 라이브 상태)] ┃ [보장 금액 / 참가비]
 *  · 오른쪽 칸은 **고정 폭**이다 — 줄마다 세로선이 같은 x 에 선다(e2e schedule-card-fit 'SCHEDULE-ROW-E' 가 잰다).
 *    폭 기준은 금액 포맷(`formatPrize`)이 폼 입력(만원 단위)에서 낼 수 있는 가장 긴 모양 `9억 9,999만`(9자, tabular)이다.
 *    ⚠ 10억 이상(10자+)은 공백에서 두 줄로 접힌다 — 잘리지는 않는다. 운영 최댓값은 1,000만(2026-09-25 실측).
 *  · 'GTD'·'참가비' 라벨 글자는 없다(오너). 금색 = 보장 금액, 초록 '데일리' = 보장이 없는 게임(guaranteed && prizePool 이 아님).
 *    ⚠ 엔트리 비례(예상 상금 %)·등급(새틀·시리즈)은 이 줄에서 안 보인다 — 상세·필터 칩이 그대로 말한다(오너 E안).
 *  · 게임 형식(MTT 등)·등급 배지는 뺐다(오너 E안). 꺾쇠(›)도 없다 — 카드 전체가 버튼이다.
 *  · 글자는 숨기지 않는다(line-clamp·truncate 없음). 12자(`SCHEDULE_TITLE_MAX`) 제목은 360~ 한 줄이고, 옛 긴 제목은 어절로 접힌다.
 *  · 라이브 상태(생존/엔트리 · 현재 레벨 L8·휴식·진행 중 · 클락 없이 시작 시각 지남 'L —')는 ③ 줄 끝으로 옮겼다(기능 유지).
 *    시작 전 '시작 전' 표기만 뺐다 — 같은 줄의 `18:00 시작` 이 이미 말한다.
 *  ⚠ 폭을 바꾸면 scratchpad schedrow/measure.cjs 로 360·390·412·1024·1280·1440 을 다시 재라(12자 제목 + 최장 금액). */
/** 보장 금액이 없을 때 금액 자리에 쓰는 말(오너 2026-09-25): 새틀이면 '새틀', 시리즈·대회면 '대회', 나머지(엔트리 등)는 '데일리'. */
export function noGtdLabel(s: { grade?: string | null; isCompetition?: boolean }): { text: string; cls: string } {
  if (s.grade === 'satellite') return { text: '새틀', cls: 'text-sky-300' };
  if (s.grade === 'series' || s.isCompetition) return { text: '대회', cls: 'text-accent-200' };
  return { text: '데일리', cls: 'text-emerald-300' };
}

function TimetableCard({
  schedule, onVenueClick, onSelect, reserveCount, rating, priority, distanceKm, vtActive, venue, regInfo,
}: CardProps) {
  const gtd = schedule.guaranteed && schedule.prizePool ? formatPrize(schedule.prizePool) : null;
  const kind = noGtdLabel(schedule);
  const reg = regCloseRaw(schedule);
  const status = regInfo?.hasField ? null
    : regInfo ? (regInfo.onBreak ? '휴식' : regInfo.levelNo ? `L${regInfo.levelNo}` : '진행 중')
    : scheduleStatus(schedule.date, schedule.startTime) === 'upcoming' ? null : 'L —';
  const dot = <span aria-hidden className="px-1 text-border-strong">·</span>;
  return (
    <article
      onClick={() => onSelect(schedule)}
      data-date={schedule.date}
      data-layout="timetable"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // 🔴 2026-09-24 연결성 감사① — 카드 **안의** 버튼(매장명 등)에서 올라온 키는 그 버튼의 것이다.
        //   이 가드가 없으면 매장명에 포커스하고 Enter 를 누르면 카드가 preventDefault 로 가로채 **포스터 상세**가 열렸다(클릭은 매장).
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(schedule); }
      }}
      className={[
        'cv-card-list grid cursor-pointer items-center gap-x-1.5 px-3 py-1.5 hover:bg-surface-high/50 active:bg-surface-high',
        // 오른쪽 칸(auto)은 안쪽 w-[…] 로 고정 — 가운데(1fr)가 남는 폭을 전부 갖고 세로선 x 는 카드마다 같다.
        // md~: 가운데 상한 17rem + justify-start — 넓은 카드에서 금액 칸이 카드 끝으로 떨어지지 않는다(HOME-LAYOUT-STRETCH).
        'grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,17rem)_auto] md:justify-start',
        schedule.isPremium ? 'bg-accent-300/[0.05]' : '',
      ].join(' ')}
    >
      <PosterArea
        posterUrl={venue?.imageUrl}
        posterColor={venue?.themeColor ?? schedule.posterColor}
        fallbackText={venueInitial(schedule.pubName)}
        title={schedule.pubName}
        className="h-[56px] w-[56px] shrink-0 rounded-[12px]"
        thumbWidth={128}
        priority={priority}
        vtName={vtActive ? 'vt-poster' : undefined}
      />

      <div className="flex min-w-0 flex-col justify-center gap-y-[3px]">
        <h3 className="min-w-0 break-keep text-[0.8125rem] font-bold leading-tight tracking-tight text-ink-primary [overflow-wrap:anywhere]"
          title={schedule.title}>
          {titleWithoutGtd(schedule.title, !!gtd)}
        </h3>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0">
          <VenueLink
            pubName={schedule.pubName}
            region={schedule.region}
            wrap
            sizeCls="text-[0.6875rem]"
            onClick={schedule.venueId ? () => onVenueClick(schedule.venueId) : undefined}
          />
          {schedule.isPremium && <span className="shrink-0 rounded-badge bg-accent-300/15 px-1 text-[10px] font-extrabold leading-none text-accent-200">TOP</span>}
          {rating && rating.count > 0 && (
            <span className="text-[10px] tabular-nums leading-tight text-gold-300" title={`방문 후기 ${rating.count}건 평균`}>★{rating.avg.toFixed(1)}</span>
          )}
          {distanceKm != null && <span className="text-[10px] tabular-nums leading-tight text-ink-muted">{fmtKm(distanceKm)}</span>}
          {(reserveCount ?? 0) > 0 && <span className="text-[10px] tabular-nums leading-tight text-ink-muted">예약 {reserveCount}명</span>}
        </div>
        {/* ③ 시작 · 레지마감(저장값 그대로 — regCloseRaw, 오너 2026-09-20 "계산하지 마라") · 라이브 상태 */}
        <p data-testid="schedule-start-group"
          className="min-w-0 break-keep text-[0.6875rem] leading-tight text-ink-secondary [overflow-wrap:anywhere]">
          <span data-testid="schedule-start-time" className="font-extrabold tabular-nums text-ink-primary">{schedule.startTime || '—'}</span>
          {' 시작'}
          {reg && <>{dot}<span data-testid="schedule-reg-close">레지 {reg}</span></>}
          {regInfo?.hasField ? (
            <>{dot}<span data-testid="schedule-field-count" className="font-bold tabular-nums">
              <span className="sr-only">생존 </span>{regInfo.alive}
              <span aria-hidden>/</span><span className="sr-only">명, 엔트리 </span>{regInfo.entries}
              <span className="sr-only">명</span>
            </span></>
          ) : status ? (
            <>{dot}<span data-testid="schedule-current-level" className="font-bold tabular-nums">{status}</span></>
          ) : null}
        </p>
      </div>

      {/* 오른쪽 고정 칸 — 가는 세로선 + [보장 금액 | 데일리] / 참가비. 라벨 글자 없음(오너 E안).
          ⚠ `data-metrics` 는 계측 손잡이다(schedule-card-fit 이 이 안을 전부 '값' 으로 보고 잘림 0 을 단언한다). 지우지 마라.
          ⚠ w-[5.125rem] 가 세로선 위치의 정본이다 — 줄마다 같아야 한다. 실측(schedrow/measure.cjs): `9억 9,999만` 74.3px / 칸 안쪽 77.6px.
            글자·폭·gap 을 바꾸면 360 에서 12자 제목(139.1px)과 이 금액이 둘 다 한 줄인지 다시 재라. */}
      {/* 라벨 글자가 없으므로 보조기술에는 그룹 이름으로 무슨 값인지 말해 준다(sr-only 1×1 스팬은 home-flow-fit 잘림 게이트에 걸린다). */}
      <div data-metrics data-testid="schedule-money" role="group"
        aria-label={`${gtd ? `보장 상금 ${gtd}` : `${kind.text}(보장 없음)`}, 참가비 ${buyInText(schedule.buyIn?.amount)}`}
        className="flex w-[5.125rem] min-w-0 flex-col items-end justify-center gap-y-[3px] self-stretch border-l border-border-subtle pl-2 text-right">
        {gtd ? (
          <span data-testid="schedule-prize" className="break-keep text-[0.8125rem] font-extrabold
 leading-tight tracking-tight tabular-nums text-gold-300">{gtd}</span>
        ) : (
          <span data-testid="schedule-daily" data-kind={kind.text} className={`text-[0.8125rem] font-extrabold leading-tight ${kind.cls}`}>{kind.text}</span>
        )}
        {/* 참가비 — §28 상품 가격 정보. T 로 정확히 떨어지는 금액만 T, 나머지는 원 그대로(buyInText 정본). */}
        <span data-testid="schedule-buyin"
          title={schedule.buyIn?.amount ? `참가비 ${schedule.buyIn.amount.toLocaleString()}원` : undefined}
          className="text-[0.75rem] font-bold leading-tight tabular-nums text-ink-secondary [overflow-wrap:anywhere]">
          {buyInText(schedule.buyIn?.amount)}
        </span>
      </div>
    </article>
  );
}

// ── 익스포트 ────────────────────────────────────────────────────────────────

export interface ScheduleCardProps extends CardProps {
  mode: ViewMode;
  /** 목록 카드 배치 — 기본 'row'(일정 탐색·라이브, 종전 그대로). 'timetable' 은 홈 일정(위 TimetableCard). */
  layout?: 'row' | 'timetable';
}

function ScheduleCard({ mode, layout = 'row', ...rest }: ScheduleCardProps) {
  if (mode === 'grid') return <GridCard {...rest} />;
  return layout === 'timetable' ? <TimetableCard {...rest} /> : <ListCard {...rest} />;
}

// 메모이즈 — 일정 목록(첫 화면) 대량 렌더 시 App 리렌더로 인한 불필요한 재렌더 방지
export default memo(ScheduleCard);
