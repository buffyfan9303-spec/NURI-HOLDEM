// src/components/features/HomeTab.tsx
// 홈 — §6(2026-09-13) 재구성: "작은 배너 다음에 **실제 콘텐츠**가 바로 이어지는 흐름".
//
// 순서(§6-1):
//   헤더(App) → 짧은 오늘 안내(날짜·실제 수치) → 작은 실제 배너 → 추천 대회(가로 레일)
//   → 지금 등록 가능 → 진행 중인 이벤트 → 오늘·내일 일정
//
// 바뀐 것과 이유
//  · **거대한 GTO 히어로를 지웠다.** 24px 헤드라인 + 그라데이션 + 서브카피가 첫 화면의 절반을 먹어
//    추천 콘텐츠를 아래로 밀었다(§6-2: "큰 인사말 때문에 추천 콘텐츠가 화면 아래로 밀리지 않게").
//    그 자리를 **사실**(오늘 날짜 · 오늘 대회 수 · 지금 등록 가능 수)이 대신한다.
//    GTO 진입은 **홈에서 완전히 뺐다**(2026-09-19 오너: "홈 화면에 GTO 도구 있는 부분 삭제").
//    하단 탭바의 GTO 탭이 같은 곳(onTools)으로 가므로 사라진 길은 없다 — 문이 둘이었을 뿐이다.
//    같은 이유로 PosterCarousel 의 'GTO 도구' 브랜드 슬라이드도 예전에 뺐다.
//  · **추천 대회 레일이 새로 생겼다.** 포스터 썸네일 + 정보 영역을 **구분**한 가로 카드다.
//    예전에 배너 캐러셀이 돌리던 일정 포스터가 여기로 왔다 — 배너 비율(2.14:1)에 세로 포스터를
//    우겨 넣던 크롭이 사라지고, 매장·참가비·상태를 이미지 **위가 아니라 아래**에서 읽는다.
//  · 제목은 **'추천 대회'** 다. '인기'·'급상승'·'주목'은 운영 선정이나 검증된 지표가 있을 때만 쓴다(§6-1).
//    부스트(`isPremium`)는 업주가 산 노출이라 정렬 근거로는 쓰되 '인기'라고 부르지 않는다.
//  · **수치는 전부 실제 조회 결과와 일치한다.** '지금 등록 가능 N' 은 목록에 보이는 5개가 아니라
//    실제로 열려 있는 **전체 수**이고, 클락 응답 전에는 아예 적지 않는다(없는 숫자를 만들지 않는다).
//  · 이벤트 상태 판정은 `lib/eventState.evaluateEvent()` **하나**로 통일했다(자체 기간 판정 삭제).
//  · 금액·상금·등록 마감 문자열은 `ScheduleCard` 가 export 한 포맷터를 그대로 쓴다(정본 하나).
//
// 유지: 탭 keep-alive(App 의 visitedTabs + display 토글) 전제 — 이벤트 보드는 마운트 1회로 끝내지
//       않고 visibilitychange·체크인 신호로 다시 받는다. 스켈레톤 자리 예약(localStorage)도 그대로.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment } from 'react';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import PosterCarousel, { type EventSlide } from './PosterCarousel';
import type { HomeBanner } from '../../api/homeBanners';
import ScheduleCard from './ScheduleCard';
import { dateHeaderAt } from '../../lib/scheduleDateGroups';
import type { Schedule } from '../../api/schedules';
import type { RegInfo } from '../../lib/regStatus';
import { compareByStartThenBoost } from '../../lib/scheduleSort';
import { scheduleStatus } from '../../lib/scheduleStatus';
import type { EventState } from '../../lib/eventState';
// ⚠ **타입만** 정적으로 받는다(런타임 0). 실제 조회(`getEventBoard`)는 아래에서 **동적 import** 다 —
//   `api/events` 에는 이벤트 화면 전용 `TIER_META`(등급 4 × tailwind 클래스 6)와 `oddsRows` 가 들어 있어서,
//   정적으로 물면 홈만 보고 나가는 손님도 그 바이트를 받는다. 홈이 이 모듈을 필요로 하는 시점은
//   첫 페인트 **뒤**의 이벤트 보드 조회 하나뿐이라 늦춰도 되는 것을 늦췄다(lib/eventState 와 같은 조리법).
import type { EventBoard } from '../../api/events';
// slug 판정만 담은 순수 모듈(런타임 의존 0) — 중복 제거가 **어느 캠페인인지** 보게 하려고 여기서만 정적으로 받는다.
import { bannerCoversEvent } from '../../lib/eventSlug';
import { readSnap, writeSnap } from '../../lib/snapshot';
// 상단 '오늘 안내' 한 줄(순수 함수). 왜 이 문장인지는 lib/homeRail.ts 머리말.
import { todayLine } from '../../lib/homeRail';
import { GTO_TOOL_COUNT } from '../../lib/gtoToolCount';
import type { ClockState } from '../../api/clock';
import type { VisitedVenue } from '../../api/vouchers';
import type { MyReservationRow } from '../../api/reservations';
import { readSeenCount, writeSeenCount } from '../../lib/seenCount';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 목록에 실제로 그리는 '지금 등록 가능' 줄 수(§6-1: 3~5개). 스켈레톤 예약도 같은 값을 쓴다. */
const OPEN_NOW_ROWS = 5;
/** 날짜 스트립 — 오늘 앞 3일 + 오늘부터 약 9주(= 64칸). 한 화면에 **7칸**(선택일 ±3일)이 보이고 선택일이 가운데다.
 *  STRIP_PAST=3 이라 첫 화면에서도 오늘이 정확히 가운데(4번째)에 선다. */
const STRIP_PAST = 3;
const STRIP_DAYS = 64;

const UPCOMING_SEEN = 'nuri:upcoming-seen';
/** 지난 방문에 '오늘·내일 일정'이 **몇 줄**이었나(1~8). 스켈레톤을 4행 고정으로 그리면 실제가 8행일 때
 *  데이터 도착 순간 4행 × --card-h-list 만큼 아래가 통째로 밀린다(2026-09-10 용량·모션 점검에서
 *  '툭'의 최대 단일 원인으로 지목). 첫 방문 기본값은 종전과 같은 4. openNow 와 같은 조리법이다. */
// 조리법은 `src/lib/seenCount.ts` 한 곳에 있다 — 일정 탐색도 같은 함수를 쓴다(2026-09-17 통합).
const upcomingSeenCount = () => readSeenCount(UPCOMING_SEEN, { fallback: 4, min: 1, max: 8 });
const OPENNOW_SEEN = 'nuri:opennow-seen';
/** 지난 방문에 '지금 등록 가능'이 **몇 줄**이었나(0~5). 예전엔 '1'/'0' 만 저장해 한 줄만 예약했고,
 *  실제로 서너 줄이 오면 그 차이만큼 아래가 통째로 밀렸다. 옛 값('1')도 한 줄로 읽어 하위호환. */
const openNowSeenCount = () => {
  // ⚠ 이쪽만 조리법이 조금 다르다: 저장값 '0' 은 **'지난번엔 한 줄도 없었다'** 라는 뜻이라 0 을 그대로 쓴다.
  //   그래서 공용 헬퍼(값 없음 → fallback)로 완전히 대체하지 않고, 0 판정을 앞에서 처리한 뒤 넘긴다.
  try { if (localStorage.getItem(OPENNOW_SEEN) === '0') return 0; } catch { return 0; }
  return readSeenCount(OPENNOW_SEEN, { fallback: 0, min: 1, max: OPEN_NOW_ROWS });
};

// 이벤트 진입 칸은 상태와 무관하게 **늘 그 자리에 있다**(2026-09-12 §4) — 그래서 '지난 방문에 배너가
// 있었나'로 자리를 예약할 이유가 없다(항상 예약돼 있으니 드리프트 0). 키는 남긴다: perf.spec 이
// 이 값으로 콜드 진입 케이스를 만들고, 배너 게이트가 바뀌면 다시 볼 신호다.
const EVENT_SEEN = 'nuri:event-banner-seen';

/** 이벤트 상태 판정 모듈 — **동적 import** 다.
 *
 *  왜: `lib/eventState` 는 첫 화면 임계 경로에서 **0.72KB gz**(실측)를 차지하는데, 홈이 그 판정을
 *  필요로 하는 시점은 `getEventBoard()` 응답이 온 **뒤**다(이벤트는 부가 기능이고 첫 페인트를
 *  막지 않는다). 예산 여유가 0.8KB 뿐이라(255.2/256) 정적 import 는 그대로 초과였다 —
 *  **상한을 올리지 않고** 실제로 늦춰도 되는 것을 늦췄다. 같은 파일이 EventPage(lazy)에서도
 *  쓰이므로 별도 청크가 새로 생기는 것이 아니라 그쪽과 공유된다.
 *
 *  ⚠ 자체 기간 판정을 만들지 않는다 — 판정은 여전히 `evaluateEvent()` **하나**뿐이다.
 *  ⚠ 모듈을 못 받아도 **진입은 막히지 않는다**(아래 eventShown 이 'menu' 로 떨어진다). */
type EventStateMod = typeof import('../../lib/eventState');

/** 아직 안 열린 카드 수.
 *  ⚠ `b.cards` 가 배열이 아닐 수 있다 — `getEventBoard` 는 RPC 응답을 **검증 없이** `EventBoard` 로
 *    단언한다(`data as EventBoard | null`). RPC 가 `[]` 를 돌려주면 truthy 라 null 폴백도 안 걸리고,
 *    `b.cards.length` 가 그대로 터져 **홈 전체가 오류 화면**이 된다(실측 2026-09-13, 목 응답으로 재현).
 *    부가 기능 하나의 응답 모양 때문에 첫 화면이 죽으면 안 된다. */
const remainCardsOf = (b: EventBoard): number | null =>
  (Array.isArray(b.cards) ? b.cards.filter((c) => !c.opened).length : null);
const totalCardsOf = (b: EventBoard): number | null => (Array.isArray(b.cards) ? b.cards.length : null);

/** 이벤트 보드 → 단일 판정 함수 입력. `hiddenAt` 은 EventBoard 에 없다(= 서버가 모름 = 공개로 본다). */
const eventStateOf = (m: EventStateMod, b: EventBoard): EventState => m.evaluateEvent({
  status: b.status,
  startsAt: b.startsAt,
  endsAt: b.endsAt,
  totalCards: totalCardsOf(b),
  remainCards: remainCardsOf(b),
}, m.eventNow()).state;

const EVENT_SNAP_KEY = 'event-board';
const EVENT_SNAP_MAX_AGE_MS = 30 * 60 * 1000;
type EventSnap = { at: number; board: EventBoard | null };
/** 30분 안의 마지막 보드 — 그보다 낡으면 없는 것으로(예약 슬라이드 '불러오는 중…' 경로). */
function readEventSnap(): EventSnap | null {
  const s = readSnap<EventSnap>(EVENT_SNAP_KEY);
  return s && typeof s.at === 'number' && Date.now() - s.at <= EVENT_SNAP_MAX_AGE_MS ? s : null;
}

/** 진입 줄에 적을 한 마디 — 상태마다 다른 사실을 말한다.
 *  '없음'과 '못 불러옴'이 같은 문구면 사용자는 새로고침할지 포기할지 판단할 수 없다.
 *  기간·소진 판정은 evaluateEvent 가 한다(여기서 다시 날짜를 비교하지 않는다). */
function eventMenuSubtitle(loaded: boolean, failed: boolean, b: EventBoard | null, state: EventState | null): string {
  if (!loaded) return '불러오는 중…';
  if (failed) return '이벤트 정보를 불러오지 못했어요 · 눌러서 다시';
  if (!b) return '지금 진행 중인 이벤트가 없어요';
  if (state === 'scheduled') return '곧 시작해요 · 눌러서 미리 보기';
  if (state === 'soldout') return '카드가 모두 열렸어요 · 결과 보기';
  if (state === 'ended' || state === 'expired') return '이번 이벤트는 끝났어요 · 지난 결과 보기';
  return b.title;
}


/** 섹션 제목·'더 보기' 버튼·진입 줄은 홈에서 3~4번 반복된다 — 문자열을 한 벌로 둔다
 *  (읽기에도 좋고, 번들에서 같은 리터럴이 여러 벌 실리지 않는다).
 *  🔴 2026-09-24 HOME-DENSITY(오너: "'9월 24일 (목) 일정' 글씨 크기 줄여주고") — 18/26 → **15/22**(PC 20/28 → 18/26).
 *    두 섹션 제목('지금 등록 가능'·'N월 N일 일정')이 같은 급이라 한 벌을 같이 내렸다. 본문(13px)보다는 여전히 크다. */
const H3_CLS = 'font-display text-[15px] font-bold leading-[22px] tracking-tight text-ink-primary md:text-[18px] md:leading-[26px]';
/** 🔴 2026-09-24 HOME-LAYOUT-STRETCH — PC(lg~) 일정 목록·'지금 등록 가능' 은 **2열**이다. 한 열이면 PC 카드가 1150px 인데
 *  글자는 왼쪽 ~480px 에만 있어 줄마다 오른쪽 ~670px 가 비었다(실측 1440). 카드 폭을 절반으로 묶어 늘어짐을 없앤다(블록 순서·섹션 구성은 그대로).
 *  ⚠ md(768~1023)로 내리지 않는 근거(리드 요청으로 실측, hl/fit-md.json): 두 칸이면 한 칸 359~475px 인데 지표 칸의 `sm:min-w-[4.5rem]`
 *    (행끼리 세로 열을 맞추는 최소 폭 76.5px × 3)이 본문 칸(≈213px)을 넘어 **지표 3칸이 두 줄로 접힌다** — 여유 −16.5~−28.6px,
 *    카드 74.5 → 104.8px. 끊김 0 계약이 깨지므로 lg 에서 시작한다(1024: 여유 +47.4~59.5).
 *  구분선: 기본 divide-y 를 끄고 칸마다 **0.5px 바깥 그림자**를 준다 — 이웃 칸의 그림자가 겹쳐 1px 선이 되고,
 *  칸 수가 홀수여도·사이에 두 칸짜리 줄이 끼어도 짝(nth-child)이 어긋나지 않는다.
 *  ⚠ 폴백 갈래(여러 날짜 + 날짜 머리말)는 한 열 그대로다 — 머리말이 두 칸에 흩어지면 어느 날 대회인지 읽을 수 없다.
 *  ⚠ 스켈레톤도 같은 격자다 — 한 열로 예약하면 데이터가 오는 순간 목록 높이가 절반으로 줄어 아래가 끌려 올라간다(CLS). */
const HOME_LIST_GRID = 'lg:grid lg:grid-cols-2 lg:divide-y-0 lg:[&>*]:shadow-[0_0_0_0.5px_rgb(var(--border-subtle))] lg:[&>article:nth-of-type(odd):last-of-type]:col-span-2';
const MORE_CLS = 'flex items-center gap-0.5 py-2 -my-2 t-desc font-semibold text-ink-muted hover:text-ink-secondary';

/** 문장 속 숫자만 강조색 — 종전 '오늘 대회 <N>개' 의 색 계약을 문자열 한 줄에도 그대로 적용한다. */
const Nums = ({ text }: { text: string }) => (
  <>{text.split(/(\d+)/).map((t, i) => (i % 2 ? <span key={i} className="tabular-nums text-accent-300">{t}</span> : t))}</>
);


export default function HomeTab({
  schedules, loaded, schedulesError, onRetrySchedules, clocksLoaded, regInfoBySchedule,
  onTools, onSelect, onVenue, onExplore, onLive, onEvent, banners = [], showEventSlide = true, showBrandSlides = true, eventMenuVisible = true, onInternalLink,
  visitedVenues = [], myTodayRes = [], venueById, onOpenVoucher,
}: {
  /** 매장 대표 이미지·테마색 조회용 — 목록 줄 왼쪽 **매장 로고** 자리가 쓴다(2026-09-18).
   *  App 이 이미 들고 있는 `venueById` 를 그대로 받는다(새 조회 0). 없으면 이니셜만 보인다. */
  venueById?: ReadonlyMap<string, { imageUrl?: string; themeColor?: string }>;
  /** 출석 체크 퀵액션 — 헤더 [이용권·출석] 과 **같은 시트**를 연다(App 이 로그인 여부까지 판단한다).
   *  같은 목적지에 서로 다른 경로를 새로 만들지 않는다 — 헤더 진입점은 그대로 둔다(오너: 헤더는 유지). */
  onOpenVoucher?: () => void;
  // 🔴 2026-09-22 요구 C — 목록 카드의 하트를 걷어내면서 `favVenueIds`·`onToggleFavorite` prop 도 뺐다.
  //   홈은 이제 즐겨찾기 상태를 알 필요가 없다. 즐겨찾기 **시스템 자체**(`useFavoriteVenues`·`venue_follows`·
  //   캘린더 찜 필터·라이브 진행 게임 줄의 단골 표시)는 그대로다.

  /** 추천 근거(2026-09-17) — 셋 다 App 이 **이미 받아 둔** 응답이다(새 조회 0). 안 넘기면 종전 정렬 그대로다. */
  liveClocks?: ClockState[];
  visitedVenues?: VisitedVenue[];
  myTodayRes?: MyReservationRow[];
  schedules: Schedule[];
  loaded: boolean;
  /** 일정 조회가 **실패**했는가(§11). 스켈레톤(로딩) · 0건(진짜 빈 상태) · 실패는 서로 다른 사건이다 —
   *  하나로 뭉개면 사용자는 다시 시도할지 포기할지 판단할 근거를 못 받는다. */
  schedulesError?: unknown;
  onRetrySchedules?: () => void;
  /** 클락 응답 도착 여부 — 도착 전에는 '지금 등록 가능' 수치를 **적지 않는다**(0 은 사실이 아니다) */
  clocksLoaded: boolean;
  onTools: () => void;
  /** 관리자 등록 홈 배너(home_banners) 중 지금 게재 중인 것 — 비면 고정 포스터 자리가 없다(하드코딩 폴백 제거, 2026-09-10) */
  banners?: HomeBanner[];
  /** 노출관리 스위치 — 캐러셀의 이벤트 슬라이드/브랜드 슬라이드. 기본은 둘 다 켜기. */
  showEventSlide?: boolean;
  showBrandSlides?: boolean;
  /** 관리자 '사이트 이벤트 메뉴 표시'(app_settings.event_menu_visible). false 면 이벤트 **진입점**을 숨긴다.
   *  ⚠ 진행 중인 캠페인과 `?event=` 딥링크는 그대로 산다 — 메뉴만 숨기는 스위치다(settings.ts §8-2). */
  eventMenuVisible?: boolean;
  regInfoBySchedule: ReadonlyMap<string, RegInfo>;
  onSelect: (s: Schedule) => void;
  onVenue: (venueId: string) => void;
  onExplore: () => void;
  onLive: () => void;
  /** 이벤트 **별도 페이지**로 (오너 2026-09-06: 게시판 안에 넣지 말 것) */
  /** slug 를 주면 **그 판**으로, 안 주면 이벤트 목록으로(2026-09-18 오너 지시).
   *  배너는 특정 캠페인을 광고하므로 slug 를 준다 — 광고한 것을 눌렀는데 목록이 뜨면 약속을 어긴 것이다. */
  onEvent: (slug?: string) => void;
  /** 같은 문서 안에서 열 수 있는 내부 링크면 앱 안에서 열고 true — 못 열면 false(그때만 주소창 이동). */
  onInternalLink?: (u: URL) => boolean;
}) {
  const now = new Date();
  /** 조회가 실패했고 **보여 줄 것이 하나도 없을 때**만 '못 불러옴' 이다.
   *  스냅샷/직전 성공값이 남아 있으면 그것은 낡았을 뿐 사실이라, 실패 카드로 덮지 않는다
   *  (일정 탐색의 `schedulesError && schedules.length === 0` 과 **같은 판정**을 쓴다). */
  const failed = !!schedulesError && schedules.length === 0;
  const today = now.toLocaleDateString('en-CA');
  const tomorrow = new Date(now.getTime() + 86400_000).toLocaleDateString('en-CA');

  // 지금 등록 가능 — 클락 실측(regInfo)이 열려 있는 대회만(추정 아님).
  // ⚠ 헤더 수치는 **자르기 전 전체 수**를 쓴다. 예전엔 slice(0,4) 한 배열의 length 를 적어
  //   실제로 7개가 열려 있어도 화면이 '4' 라고 말했다(§6-1: 개수는 실제 조회 결과와 일치).
  const openAll = useMemo(
    () => schedules
      .filter((s) => s.approved && (regInfoBySchedule.get(s.id)?.msLeft ?? 0) > 0)
      .sort(compareByStartThenBoost),
    [schedules, regInfoBySchedule],
  );
  const openNow = useMemo(() => openAll.slice(0, OPEN_NOW_ROWS), [openAll]);

  // 오늘·내일 일정 — 종료 판정(시작+10h) 제외: 날짜만 보면 심야에 '오늘'의 끝난 대회가 종료 배지로 남는다
  // (first-screen 게이트가 CI(UTC 시간대)에서 잡아낸 실버그 — browse hideEnded 와 동일 규칙).
  const upcoming = useMemo(
    () => schedules
      .filter((s) => s.approved && (s.date === today || s.date === tomorrow)
        && scheduleStatus(s.date, s.startTime) !== 'ended')
      .sort(compareByStartThenBoost)
      .slice(0, 8),
    [schedules, today, tomorrow],
  );

  /**
   * 🔴 오늘·내일이 비었을 때 보여줄 **다음 일정** (2026-09-19 오너: "홈 화면에 일정이 안떠있어").
   *
   * 화면 고장이 아니었다 — 운영 DB 실측(2026-09-19 KST): 오늘 0건 · 내일 0건 ·
   * 앞으로 통틀어 1건인데 그게 **9/21**이었다. 이 칸은 이름 그대로 2일짜리 창이라
   * 이틀 뒤 대회는 창 밖으로 빠지고, 홈의 주된 칸이 통째로 비었다.
   *
   * ⚠ 제목('오늘·내일 일정')은 **바꾸지 않는다.** 그 문구에 e2e 6개가 묶여 있어
   *   (smoke·click-paths·cache-first·perf ×3) 조건부로 바꾸면 오늘처럼 데이터가 빈 날
   *   그 검사들이 통째로 빨개진다. 대신 목록 **안에서** 사실을 말한다 —
   *   '오늘·내일은 없다' + 가장 가까운 일정. 사용자가 알아야 할 것은 그 둘 다다.
   */
  const nextUp = useMemo(
    () => (schedules
      .filter((s) => s.approved && s.date > tomorrow && scheduleStatus(s.date, s.startTime) !== 'ended')
      .sort(compareByStartThenBoost)
      .slice(0, 8)),
    [schedules, tomorrow],
  );

  // ── 🔴 날짜 레일(2026-09-20 레퍼런스 UI-1·UI-2) ───────────────────────────
  //   오너 레퍼런스: 5칸 날짜 레일 + 좌우 이동 + "9월 20일 (일) 일정 / 총 N개의 토너먼트".
  //   종전에는 '오늘·내일' 2일 창을 고정 제목으로 보여 줬다 — 날짜를 고를 수 없었다.
  // ⚠ 날짜 경계는 **KST 기준**이다. 이 파일이 이미 쓰는 `toLocaleDateString('en-CA')` 를 그대로 쓴다
  //   (playwright.config 가 Asia/Seoul 을 고정하고, 유저는 사실상 전원 한국이다).
  //   `new Date(iso)` 는 UTC 자정으로 파싱돼 하루가 밀리므로 **쓰지 않는다** — 문자열/ms 로만 다룬다.
  const isoAdd = useCallback(
    (iso: string, days: number) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d + days).toLocaleDateString('en-CA');
    },
    [],
  );
  /** 날짜 스트립의 **첫 날**(2026-09-24 오너: "5개만 보인다 — 더 나은 방법이 있으면 넣어라" →
   *  2차 오너: "달력 버튼 제거 · 7개 날짜 · 클릭한 날짜가 가운데(선택일 ±3일 창) · 스와이프·화살표로 이동").
   *  9주(STRIP_DAYS) 가로 스와이프 스트립이고 한 화면 폭 = 7칸이다. */
  const [railStart, setRailStart] = useState(() => '');
  const [selectedDate, setSelectedDate] = useState(() => '');
  // 최초 1회만 오늘 기준으로 맞춘다(이후 사용자의 선택을 덮지 않는다 — 상세를 보고 돌아와도 유지).
  useEffect(() => {
    if (selectedDate) return;
    setSelectedDate(today);
    setRailStart(isoAdd(today, -STRIP_PAST));
  }, [today, selectedDate, isoAdd]);

  const railDays = useMemo(
    () => (railStart ? Array.from({ length: STRIP_DAYS }, (_, i) => isoAdd(railStart, i)) : []),
    [railStart, isoAdd],
  );
  /** 대회가 있는 날(점 표시) — **이미 받은** schedules 로만 센다(새 조회 0). 목록과 같은 규칙: 승인 + 끝나지 않음. */
  const gameDays = useMemo(
    () => new Set(schedules.filter((s) => s.approved && scheduleStatus(s.date, s.startTime) !== 'ended').map((s) => s.date)),
    [schedules],
  );
  const stripRef = useRef<HTMLDivElement>(null);
  /** 누른 날을 스트립 **가운데로**(부드럽게).
   *  · 첫 배치는 **아무것도 재지 않는다** — STRIP_PAST=3 · 한 화면 7칸이라 오늘은 scrollLeft 0 에서 이미 가운데다.
   *    🔴 처음엔 layout effect 에서 사각형을 재고 scrollTo 했는데, 홈이 다시 마운트되는 순간(내 정보 열고 닫기) 그 강제 레이아웃이
   *    문서가 짧은 과도기에 걸려 **창 scrollY 가 56~112px 튀었다**(e2e mobile-tab-transition 'me open/close', 원본은 통과 — 효과 본문만
   *    끄면 통과하는 것으로 원인 확정). 그래서 첫 배치는 건너뛰고, 사용자가 날짜를 바꿀 때만(화면이 안정된 뒤) 잰다.
   *  ⚠ offsetLeft 를 쓰지 않는다 — 누르는 순간 버튼의 `:active` scale 이 조상 좌표를 끊는다(CLAUDE.md 참고 메모). 사각형 차이로 잰다. */
  const stripPlaced = useRef(false);
  useEffect(() => {
    const sc = stripRef.current;
    if (!sc || !selectedDate) return;
    if (!stripPlaced.current) {
      stripPlaced.current = true;
      // 폭이 넉넉하면(7칸 × 1/7) 오늘은 scrollLeft 0 에서 이미 가운데다 — 아무것도 안 한다.
      // 좁은 폭(≈320~359)은 칩 최소 44px 때문에 7칸이 안 들어가 가운데가 어긋난다 → **다음 프레임에 스트립의 scrollLeft 만** 지정한다.
      //   창 스크롤은 건드리지 않는다(요소를 화면으로 끌어오는 API·창 이동 금지 — 재마운트 때 창 scrollY 가 튀던 결함, 위 주석).
      //   offsetLeft 기준은 스트립(relative)이다. 첫 배치라 누르는 중의 :active scale 함정도 없다.
      const id = requestAnimationFrame(() => {
        const pill = sc.querySelector<HTMLElement>(`[data-date-pill="${selectedDate}"]`);
        if (!pill || sc.clientWidth === 0 || sc.scrollLeft !== 0) return;
        const target = pill.offsetLeft + pill.offsetWidth / 2 - sc.clientWidth / 2;
        if (target > 1) sc.scrollLeft = target;
      });
      return () => cancelAnimationFrame(id);
    }
    const pill = sc.querySelector<HTMLElement>(`[data-date-pill="${selectedDate}"]`);
    if (!pill || sc.clientWidth === 0) return;   // 숨은 탭(display:none)에서는 재지 않는다
    const a = sc.getBoundingClientRect(); const b = pill.getBoundingClientRect();
    const left = sc.scrollLeft + (b.left - a.left) - (sc.clientWidth - b.width) / 2;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sc.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  }, [selectedDate]);
  /** 🔴 2026-09-24 오너(2차): "좌측 9월 21일 쪽은 블러가 안 돼 있어 입체감이 없다. 오늘 날짜 빼고 서서히 블러를 진하게 하면서 입체감 있게."
   *  → 앞서의 '창 밖 조각만 페이드'(mask)를 **철회**하고 **휠 피커**처럼 만든다: 스트립 가운데에서 멀어질수록 양쪽 모두
   *    점진적으로 흐려진다(투명도·블러·약간 작아짐). 선택일은 늘 선명, 오늘은 블러 없이 투명도만 절반 — '오늘' 글자가 읽히게.
   *  · 스크롤·스와이프마다 rAF 한 번 — React 상태를 쓰지 않고 칩 안쪽 얼굴(`[data-pill-face]`)의 style 을 직접 쓴다(리렌더 0).
   *  · 레이아웃 읽기는 스트립 clientWidth·scrollLeft 와 칩 offsetLeft/offsetWidth 뿐이고(스크롤 중 레이아웃은 깨끗하다 — 강제 재계산 없음),
   *    화면에 걸친 칩(±2)만 갱신한다 — 64칸 전부를 매 프레임 건드리지 않는다.
   *  · 변형은 버튼이 아니라 **안쪽 얼굴**에 건다 — 버튼에 transform 을 쓰면 전역 누름(`:active` scale) 피드백을 덮는다.
   *  · 끊김 실측: hl/wheel-perf(스와이프 중 프레임 간격) — 보고서. */
  useLayoutEffect(() => {
    const sc = stripRef.current;
    if (!sc) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const cw = sc.clientWidth;
      if (!cw) return;                         // 숨은 탭(display:none)에서는 재지 않는다
      const pills = sc.querySelectorAll<HTMLElement>('[data-date-pill]');
      if (!pills.length) return;
      const w = pills[0].offsetWidth || 1;
      const mid = sc.scrollLeft + cw / 2;
      const half = cw / 2;
      const i0 = Math.max(0, Math.floor(sc.scrollLeft / w) - 2);
      const i1 = Math.min(pills.length - 1, Math.ceil((sc.scrollLeft + cw) / w) + 2);
      for (let i = i0; i <= i1; i++) {
        const p = pills[i];
        const face = p.firstElementChild as HTMLElement | null;
        if (!face) continue;
        let t = Math.min(1, Math.abs(p.offsetLeft + p.offsetWidth / 2 - mid) / half);
        if (p.getAttribute('aria-pressed') === 'true') t = 0;           // 선택일은 늘 선명
        const today = p.dataset.today === '1';
        // 2026-09-24 오너(3차): "흐림이 너무 짙어, 조금만 덜 흐리게" — 곡선(거리 비례)은 그대로, 강도만 낮췄다.
        //   투명도 최소 0.4 → 0.6 · 블러 최대 1.8 → 0.8px · 크기 최소 0.9 → 0.94. 오늘은 투명도만 절반(최소 0.8)·블러 없음.
        const op = 1 - (today ? 0.2 : 0.4) * t;
        const blur = today ? 0 : Math.round(8 * t) / 10;                 // 최대 0.8px
        face.style.opacity = op.toFixed(3);
        face.style.filter = blur ? `blur(${blur}px)` : '';
        face.style.transform = t ? `scale(${(1 - 0.06 * t).toFixed(3)})` : '';
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    sc.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => { sc.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [railDays.length, selectedDate]);
  /** PC 화살표 — 한 창(7칸)씩 민다. 모바일은 손가락 스와이프가 같은 일을 한다(화살표 숨김 — 320 에서 화살표 두 개를
   *  넣으면 7칸이 칸당 27px 로 짓눌려 터치 44px 를 못 지킨다). */
  const stepStrip = (dir: 1 | -1) => {
    const sc = stripRef.current;
    const pill = sc?.querySelector<HTMLElement>('[data-date-pill]');
    if (!sc || !pill) return;
    sc.scrollBy({ left: dir * 7 * pill.getBoundingClientRect().width, behavior: 'smooth' });
  };

  /** 선택한 날짜의 대회 — 종료된 것은 뺀다(위 `upcoming` 과 **같은 규칙**: 날짜만 보면 심야에 끝난 대회가 남는다). */
  const daySchedules = useMemo(
    () => (selectedDate
      ? schedules
        .filter((s) => s.approved && s.date === selectedDate && scheduleStatus(s.date, s.startTime) !== 'ended')
        .sort(compareByStartThenBoost)
      : []),
    [schedules, selectedDate],
  );
  /** 화면에는 상한만큼만 그린다. 🔴 건수는 **자르기 전 전체 수**다(§6-1 — 화면이 거짓말하지 않게). */
  const dayVisible = useMemo(() => daySchedules.slice(0, 8), [daySchedules]);

  /** `2026-09-20` → `9월 20일 (일)`. 레퍼런스 표기 그대로. 시간대 영향 없이 문자열로 만든다. */
  const dayTitle = useCallback((iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
    return `${m}월 ${d}일 (${dow})`;
  }, []);

  /** 🔴 폴백은 **오늘을 고른 기본 상태에서만** 쓴다(실행문 UI-2).
   *  다른 날짜를 직접 골랐는데 그 날 0건이면 그 날의 빈 상태를 보여야 한다 —
   *  거기에 다른 날짜 카드를 섞으면 사용자가 그것을 고른 날 대회로 읽는다. */
  const useFallback = selectedDate === today && upcoming.length === 0 && nextUp.length > 0;

  // 2026-09-18: 홈 첫 줄이 '오늘 대회 N개' 를 안 말하게 되면서 이 수치의 유일한 소비자가 없어졌다.
  //   다시 필요해지면 같은 조리법으로 되살리면 된다(승인된 것 · 오늘 · 끝나지 않은 것).

  /** 가 본 매장 → 방문 횟수. 상단 '오늘 안내' 문장(todayLine)이 '내가 가 본 매장에 오늘 대회가 있나'를
   *  판정하는 데 쓴다. (2026-09-18 추천 대회 레일을 지우면서 레일 전용 필드는 같이 없앴다 —
   *  reservedIds·live·isEnded 는 rankRail·railFact 말고 소비처가 없었다.) */
  const visitsByVenue = useMemo(
    () => new Map(visitedVenues.map((v) => [v.venueId, v.visits])), [visitedVenues]);

  // 오늘 안내 — 이력이 있으면 **그 사람** 문장(lib/homeRail.todayLine), 없으면 '' 라 아래 JSX 가 종전 문구로 떨어진다.
  // 조회 전·실패는 문장을 만들지 않는다(§11 — 없는 숫자로 문장을 쓰지 않는다).
  const personal = loaded && !failed
    ? todayLine({
      visitedCount: visitedVenues.length,
      todayAtVisited: schedules.filter((s) => s.approved && s.date === today && visitsByVenue.has(s.venueId)
        && scheduleStatus(s.date, s.startTime) !== 'ended').length,
      reservedToday: myTodayRes.length,
      openNow: clocksLoaded ? openAll.length : null,
    })
    : '';

  // 캐시 퍼스트(Phase 6 · e2e cache-first 회귀 2026-09-13): 이벤트 슬라이드만 스냅샷이 없어 재방문에도 '불러오는 중…'(aria-busy)으로
  //   시작했다. 다른 6개 키(schedules·venues·…)와 같이 마지막 보드를 스냅샷으로 두고 재검증한다.
  //   ⚠ 다만 24h 가 아니라 30분까지만 믿는다 — 보드에는 관리자가 뒤집는 status 플래그가 있어(끝냄·숨김) 낡은 'live' 를
  //     오래 보이면 §7.1-(4) '진행 중' 허위 표시가 된다(기간 판정은 evaluateEvent 가 지금 시각으로 다시 하므로 시간 만료는 스냅샷도 못 속인다).
  const [event, setEvent] = useState<EventBoard | null>(() => readEventSnap()?.board ?? null);
  // ⚠ 마운트 1회만 받으면 배너가 세션 내내 낡는다(2026-09-07 감사). 홈 탭은 언마운트되지 않으므로
  //   앱을 완전히 껐다 켜기 전까지 그 숫자가 영원히 안 바뀐다. 그래서 ① 체크인 성공 신호
  //   ② 화면으로 돌아올 때 다시 받는다. 실패는 조용히 무시(이벤트는 부가 기능이고 첫 페인트를 막지 않는다).
  const [eventLoaded, setEventLoaded] = useState(() => readEventSnap() != null); // null 이 '미도착'과 '이벤트 없음' 둘 다라 따로 구분한다(스냅샷이 있으면 도착한 셈)
  const [eventFailed, setEventFailed] = useState(false); // '이벤트 없음'과 '못 불러옴'도 다른 사건이다
  const loadEventBoard = useCallback(() => {
    import('../../api/events').then((m) => m.getEventBoard()).then((b) => {
      setEvent(b);
      writeSnap(EVENT_SNAP_KEY, { at: Date.now(), board: b } satisfies EventSnap); // 실패 시에는 손대지 않는다(마지막 성공값 유지)
      setEventFailed(false);
      setEventLoaded(true);
    }).catch(() => { setEventFailed(true); setEventLoaded(true); }); // 실패도 '도착'이다 — 아니면 예약 칸이 영원히 남는다
  }, []);
  useEffect(() => {
    loadEventBoard();
    const onVis = () => { if (document.visibilityState === 'visible') loadEventBoard(); };
    window.addEventListener('nuri:event-board-refresh', loadEventBoard);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('nuri:event-board-refresh', loadEventBoard);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loadEventBoard]);

  // 판정 모듈은 **비차단**으로 받아 온다 — 이벤트 보드 응답과 나란히 도착하므로 체감 지연이 없다.
  const [esm, setEsm] = useState<EventStateMod | null>(null);
  const [esmFailed, setEsmFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    import('../../lib/eventState')
      .then((m) => { if (alive) setEsm(m); })
      .catch(() => { if (alive) setEsmFailed(true); });
    return () => { alive = false; };
  }, []);

  /** 배너(광고)를 그릴 조건 — 지금 **참여할 수 있을 때만**. 판정은 evaluateEvent 하나가 한다.
   *  ⚠ 진입(메뉴)은 여기 묶지 않는다 — 이벤트가 0개·조회 실패·소진 중 하나만 걸려도 홈에서
   *    이벤트로 가는 길이 통째로 사라졌던 사고(2026-09-12)의 원인이 그 결합이었다. */
  const eventState = esm && event ? eventStateOf(esm, event) : null;
  /** 지금 그릴 갈래 하나. 'pending' 은 응답 전(스켈레톤이지만 **누를 수 있다**).
   *  판정 모듈이 아직이면 pending 이지만, **실패했으면 pending 에 머무르지 않는다** — 'menu' 로
   *  떨어져 이벤트로 가는 길이 열린 채로 남는다(광고를 내리는 것과 문을 잠그는 것은 다른 결정이다). */
  const eventShown: 'pending' | 'banner' | 'menu' =
    !eventLoaded || (!esm && !esmFailed) ? 'pending'
      : eventState === 'live' ? 'banner' : 'menu';
  const eventRemain = (event && remainCardsOf(event)) ?? 0;
  /** N06(§7.1): 이벤트 진입은 메인 배너(PosterCarousel) 안의 슬라이드 하나다 — 독립 카드는 없앴다.
   *  · 세 갈래 그대로: 응답 전(누를 수 있음) · 참여 가능(evaluateEvent 'live' 만 강조) · 그 밖(0개·실패·소진·시작 전·종료 — 문구는
   *    eventMenuSubtitle 이 사실대로 말한다. "진행 중" 허위 문구 없음).
   *  · 관리자 배너가 **우리가 열 그 캠페인**으로 가면 슬라이드를 넣지 않는다(§7.1-3 중복 제거 — 진입은 그 배너가 맡는다).
   *    다른 캠페인 배너는 중복이 아니다 — 그렇게 보던 예전 판정이 진행 중인 이벤트의 진입을 지웠다(2026-09-15).
   *  · 참여권·남은 카드 수는 조회 성공(live)일 때만 쓴다(§7.1-7). */
  // ⚠ 슬라이드의 onClick 은 **인자 없이** 부른다 — `onClick: onEvent` 로 두면
  //   마우스 이벤트 객체가 slug 자리로 넘어가 목록이 안 열린다.
  //   EventSlide.onClick 의 타입이 `() => void` 라 **tsc 가 조용히 통과시켰다**(퀴액션 버튼은 잡혔다).
  //   e2e 8건이 이것 하나로 빨개졌다(2026-09-18).
  const eventSlide = useMemo<EventSlide | null>(() => {
    // 관리자 스위치(app_settings.home_slide_event)로 끈 경우 — 캐러셀에서만 빼고 이벤트 기능 자체는 그대로다.
    // ⚠ 퀵액션 '제휴 혜택' 칸은 이 스위치와 무관하다(진입 경로를 통째로 잠그는 것은 event_menu_visible 쪽이다).
    if (!showEventSlide) return null;
    // ⚠ '이벤트 링크가 있으면' 이 아니라 '**같은 캠페인**으로 가면' 이다 — 판정 근거는 bannerCoversEvent 주석.
    if (bannerCoversEvent(banners.map((b) => b.linkUrl), event?.slug, eventShown === 'pending')) return null;
    if (eventShown === 'pending') return { title: '이벤트', sub: '불러오는 중…', alt: '이벤트 — 불러오는 중', testId: 'home-event-menu', live: false, pending: true, onClick: () => onEvent() };
    if (eventShown === 'banner' && event) {
      const sub = event.myTickets > 0 ? `참여권 ${event.myTickets}장 · 남은 카드 ${eventRemain}장` : `매장 출석하면 참여권 1장 · 남은 카드 ${eventRemain}장`;
      // ⚠ 이 슬라이드는 **이 캠페인**을 이름까지 걸고 광고한다 → 목록이 아니라 그 판으로 간다.
      //   (2026-09-18 이벤트 탭이 목록으로 바뀌면서 여기까지 목록으로 새고 있었다 —
      //    홈이 미리 받아 둔 보드 씨앗도 함께 끊겨 진입에 스켈레톤이 돌아왔다. e2e/event-enter 가 잡았다.)
      const slug = event.slug;
      return { title: event.title, sub, alt: `이벤트 · ${event.title} · ${sub}`, testId: 'home-event-banner', live: true, onClick: () => onEvent(slug) };
    }
    const sub = eventMenuSubtitle(eventLoaded, eventFailed, event, eventState);
    return { title: '매장 이벤트', sub, alt: `매장 이벤트 · ${sub}`, testId: 'home-event-menu', live: false, onClick: () => onEvent() };
  }, [showEventSlide, banners, eventShown, event, eventRemain, eventLoaded, eventFailed, eventState, onEvent]);

  /** 🔴 2026-09-24 오너: "빠른 카드 두 개의 세부 설명 줄은 삭제하고 세로 폭을 살짝 줄여라" — 설명 줄(종전 quickEventDesc)이 빠졌다.
   *  그 줄이 말하던 사실 중 **사라지면 안 되는 것**의 새 자리:
   *   · 조회 실패 → 이 칸의 행동 줄이 '불러오기 실패 · 다시' 로 바뀐다(아래). 전체 문구('이벤트 정보를 불러오지 못했어요 · 눌러서 다시')는
   *     배너의 이벤트 슬라이드(eventMenuSubtitle)에 그대로 있다.
   *   · 참여권 보유 장수 → 옆 '이용권 · 출석' 칸 제목 줄의 '참여권 N' 배지와 배너 이벤트 슬라이드('참여권 N장 · 남은 카드 M장')가 말한다.
   *   · 시작 전·소진·종료·없음 → 배너 이벤트 슬라이드(eventMenuSubtitle)가 그대로 말한다. */
  const quickEventFailed = eventLoaded && eventFailed && eventShown !== 'banner';

  useEffect(() => {
    if (!eventLoaded || !esm) return;
    try { localStorage.setItem(EVENT_SEEN, eventState === 'live' ? '1' : '0'); } catch { /* noop */ }
  }, [eventLoaded, esm, eventState]);

  const fmtLeft = (ms: number) => {
    const m = Math.floor(ms / 60_000);
    return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
  };
  if (clocksLoaded) {
    writeSeenCount(OPENNOW_SEEN, openAll.length, { min: 0, max: OPEN_NOW_ROWS });
  }
  // 다음 방문의 스켈레톤 행 수 — 같은 기기는 대개 비슷한 줄 수를 본다.
  // 🔴 2026-09-24 정정: 종전엔 `upcoming`(오늘+내일) 수를 적었는데 목록은 날짜 레일이 생긴 뒤(09-20)
  //   **고른 날 하나**(dayVisible)나 폴백(nextUp)을 그린다 — 실측(390, 오늘 5·내일 1): 스켈레톤 6행 vs 실제 5행.
  //   화면에 실제로 그리는 줄 수를 적는다.
  if (loaded) {
    writeSeenCount(UPCOMING_SEEN, (useFallback ? nextUp : dayVisible).length, { min: 1, max: 8 });
  }

  return (
    // (역사) `data-main-enter-ready` — M1 cohort 준비 신호였다. 🔴 2026-09-22 폐기 — 이 표식을 읽던 본문 진입 모션(`src/lib/tabEnter.ts`)은 삭제됐다. 삼성 인터넷에서 transform 합성층이 붙었다 사라지며 화면 전체가 밝아졌다 돌아왔기 때문이다(App.tsx 탭 커밋 effect 주석 참고). 속성은 지금 **아무 동작도 하지 않는다** — 남겨 둔 것은 되살릴 때 대상 경계를 다시 찾지 않기 위해서다.
    // 이 루트가 붙으면 아래 진입 대상(상단 안내·빠른 메뉴·섹션들)이 같은 커밋에 모두 들어 있다.
    <div data-main-enter-ready className="pb-section">
      {/* §6-4: 일반 컨테이너 최대 1200px, 좌우 최소 24px. 안쪽 섹션은 공용 px-page-x(17px)를 쓰므로
          md 이상에서 7px 를 더해 24px 를 만든다(index.css·tailwind.config 는 다른 팀 편집 중이라
          토큰을 새로 만들지 않았다 — 필요해지면 page-x-md 토큰을 쓰도록 보고). */}
      <div className="mx-auto w-full max-w-[1200px] md:px-[7px]">
        {/* ── 상단: 오늘 안내 + 배너 ──────────────────────────────────────────
            PC(lg~)는 5:7 두 칸(§6-4). 768~1023 은 **한 열 그대로** 쌓는다 — 중간 폭에서 성급히
            두 칸으로 쪼개면 가운데 열이 눌린다. 좁아지면 DOM 읽기 순서대로 쌓인다. */}
        {/* 🔴 2026-09-24 HOME-LAYOUT-STRETCH(오너: "메인 배너 가로폭을 늘리고 싶다") — 두 칸 구조는 그대로, 비율만 5:7 → **4:8**.
            배너 칸 681 → 783px(1280~). 오늘 안내 칸은 479 → 378px 인데 그 안의 글자는 날짜 줄 249px · 문장 191px 이라 남는다.
            ⚠ 개인화 문장(todayLine 3조각)은 22px 에서 최장 ~470px 라 lg 에서는 두 줄을 허용한다(아래 p) — 옆 배너가
              더 높아서(200px) 이 칸의 높이 변화가 아래 섹션을 밀지 않는다. */}
        {/* 🔴 2026-09-25 HOME-BANNER-REDESIGN(오너: "PC 쪽 레이아웃 이상하니까 수정해", 결정 P) — 4:8 은 그대로, **왼쪽 4칸을 채운다**.
            실측(1440, 종전): 왼쪽 칸은 글자 두 줄(70px)뿐이라 200px 배너 옆에서 위아래 65px 씩 비었고(items-center),
            그 아래 퀵 카드 줄은 20rem×2 로 x=831 에서 끝나 오른쪽 462px 가 비었다. 날짜 레일(w-fit 499)·목록(전체 폭)과
            오른끝이 세 단으로 어긋났다. → lg 에서 왼쪽 = 위 오늘 안내 + 아래 퀵 카드(두 행), 오른쪽 = 배너(두 행에 걸침).
            결과(1440): 퀵 아래끝 323 ≈ 배너 아래끝 322 · 일정 목록 top 492 → 407.
            ⚠ 퀵 섹션을 이 그리드 **안**으로 옮겼지만 DOM 순서(오늘 → 배너 → 퀵)는 그대로라 모바일·md 는 한 열 흐름 그대로다. */}
        <div data-main-enter className="lg:grid lg:grid-cols-12 lg:gap-x-6 lg:gap-y-3 lg:pt-4">
          {/* 오늘 안내 — 기본 48~60px(§6-2). 큰 인사말이 아니라 **사실**이다. */}
          {/* 2026-09-24 오너: "'무료 GTO 도구' 줄 아래 공백이 너무 크다 — 위아래 공백을 살짝 줄이고 비율을 맞춰라"(모바일).
              헤더→날짜 10.4 → 8.3 · 날짜→GTO 11.4 → 6.4 · GTO→배너 19.6 → 9.0px(390 실측). GTO 버튼 히트 44px 는 그대로 —
              44px 칸 안의 위 여백 5px 를 음수 마진으로 날짜 줄 쪽에 겹치고(위로 넘친 것은 스크롤 넘침이 아니다),
              아래는 배너 위 여백(pt-2.5)을 모바일에서 뺀다. md~ 는 종전 그대로. */}
          <section data-testid="home-today" className="px-page-x pt-1 md:pt-1.5 lg:col-span-4 lg:col-start-1 lg:row-start-1 lg:self-center lg:pt-0">
            <a
              href="https://www.nurimind.co.kr" target="_blank" rel="noopener"
              className="inline-flex items-center gap-1 py-1 -my-1 t-desc text-ink-muted transition-colors hover:text-accent-200"
            >
              {/* 오너 지시(2026-08-29): 인사말은 아무 데도 안 데려간다 — 링크인데 갈 이유를 안 준다.
                  날짜는 맥락으로 남기고, 그 자리를 NURI MIND 로 가고 싶게 만드는 문구로. */}
              {now.getMonth() + 1}/{now.getDate()}({DAYS_KO[now.getDay()]}) · 오늘의 운을 점쳐보세요{' '}
              <span className="inline-flex items-center gap-0.5 font-semibold text-accent-300">· NURI MIND<Icon name="chevron-right" size={12} className="shrink-0" /></span>
            </a>
            {/* §5 역할표: 홈 짧은 제목 18/26(PC 22/30). 수치는 **도착한 것만** 적는다 —
                일정이 안 왔으면 대회 수를, 클락이 안 왔으면 등록 가능 수를 쓰지 않는다. */}
            {/* 한 줄 고정(h-[26px] + nowrap): 방문·예약 응답은 일정보다 늦게 오는데, 그때 문장이 바뀌며 두 줄이 되거나
                높이가 흔들리면 아래 전부가 밀린다(home-cls.spec 이 재는 바로 그 자리). 문장은 todayLine 이 3조각으로
                제한해 375px 에서 한 줄임을 실측했다 — 길어지면 자르는 게 아니라 **말을 줄인다**. */}
            {/* 🔴 2026-09-24 오너 H2: "'무료 GTO 도구 22개' 줄 전체를 누르면 GTO 탭으로" — 그 문구일 때 줄 전체가 버튼(onTools = 탭바와 같은 경로,
                전체 리로드 없음). 터치 44px 를 위해 줄 높이를 26 → **44px 고정**으로 올렸다(문구가 바뀌어도 높이는 같다 — CLS 0).
                개인화 문장·로딩·실패 문구는 종전처럼 글자만이다(목적지가 없다). */}
            <p data-testid="home-today-line" className="flex h-[44px] items-center max-md:-mt-[5px] whitespace-nowrap text-[18px] font-bold leading-[26px] text-ink-primary md:text-[22px] md:leading-[30px] lg:h-auto lg:min-h-[44px] lg:whitespace-normal lg:break-keep">
              {/* ⚠ 여기서 '오늘 대회 0개' 라고 적으면 그것은 **조회 실패를 사실로 위장**하는 것이다(§11).
                  수치는 '도착한 것만' 적는다는 이 줄의 원래 규칙에, 실패도 '미도착' 이라는 사실을 더한다. */}
              {/* 🔴 2026-09-18 오너: "초반에는 매장이 많이 없을 예정이라 '지금 등록 가능 0개' 는 빼도 좋겠다.
                  '오늘 대회 1개' 도 빼고 GTO 쪽을 강조해볼까? 무료 GTO 도구 20개 이런 식으로"

                  숫자 나열을 GTO 가치 제안으로 바꾼다. 다만 **개인화 문장(personal)은 그대로 살린다** —
                  그건 '내가 가 본 매장에 오늘 대회가 있다' 같은 그 사람만의 사실이라 광고 문구보다 세다.
                  매장이 적은 초반에는 personal 이 대개 비어 GTO 줄이 뜨고, 이력이 쌓이면 그 사람 문장이 뜬다.
                  ⚠ 숫자는 하드코딩이 아니다 — lib/gtoToolCount.ts + 계약 테스트가 ToolsPanel 원문을 세어
                    이 값이 거짓이 되는 순간 빨개진다(화면 수치는 사실이어야 한다, §6-1).
                  🔴 2026-09-24 오너 H2 로 **뒤집혔다**: 이 줄이 GTO 진입이다(home-gto-entry 1곳). home-flow-fit 계약을 '홈에 정확히 1곳'으로 갱신했다. */}
              {!loaded
                ? <>오늘의 대회를 불러오는 중</>
                : failed
                  ? <>오늘 대회 정보를 불러오지 못했어요</>
                  : personal
                    ? <Nums text={personal} />
                    : (
                      <button type="button" onClick={onTools} data-testid="home-gto-entry"
                        aria-label={`무료 GTO 도구 ${GTO_TOOL_COUNT}개 — GTO 탭으로 이동`}
                        className="-mx-1 inline-flex h-[44px] items-center gap-1 rounded-[8px] px-1 text-left transition-colors hover:text-accent-200">
                        {/* 2026-09-24 오너 H2: 글로우 **박스**(테두리·배경 = stat-pill)를 빼고 **글씨만 네온**. 라이트는 번짐을 약하게(대비 AA 는 글자색이 진다).
                            ⚠ '무료 GTO 도구 <span…>{GTO_TOOL_COUNT}개' 는 한 줄로 붙여 둔다 — homeLiveFreshness 계약이 그 모양을 본다. */}
                        무료 GTO 도구 <span className="font-extrabold tabular-nums text-accent-200 [text-shadow:0_0_4px_rgb(var(--accent-300)/0.3)] dark:[text-shadow:0_0_6px_rgb(var(--accent-300)/0.6)]">{GTO_TOOL_COUNT}개</span>
                        <Icon name="chevron-right" size={16} className="shrink-0 text-ink-muted" />
                      </button>
                    )}
            </p>
          </section>

          {/* 작은 실제 배너 — 하나의 메시지, 하나의 연결(§6-2) */}
          <div className="lg:col-span-8 lg:col-start-5 lg:row-span-2 lg:row-start-1">
            <PosterCarousel
              banners={banners}
              eventSlide={eventSlide}
              showBrand={showBrandSlides}
              onBannerUrl={(url) => {
                // 관리자가 넣은 링크. 외부는 새 탭(noopener — opener 를 통한 탭내빙 차단),
                // 내부 경로는 같은 탭. javascript: 같은 스킴은 애초에 열지 않는다.
                //
                // ⚠ '/' 로 시작한다고 내부가 아니다(2026-09-04 리뷰): `//evil.com` 은 프로토콜 상대 URL 이고
                //   `/\evil.com` 도 브라우저가 외부로 해석한다 — 둘 다 예전 검사를 통과해 **같은 탭**으로
                //   외부 사이트에 착지했다(오픈 리다이렉트). 문자열 앞머리를 보지 말고 URL 로 파싱해
                //   **origin 이 우리와 같은지**로 판정한다.
                const u = url.trim();
                if (!u) return;
                let parsed: URL;
                try { parsed = new URL(u, window.location.origin); } catch { return; }
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;  // javascript:·data: 차단
                if (parsed.origin === window.location.origin) {
                  // ⚠ 앱 안에서 열 수 있는 곳이면 **문서를 새로 받지 않는다**(2026-09-15 오너 리포트 "한번 번쩍이면서 들어가줘").
                  //   location.assign 은 같은 오리진이어도 전체 리로드라 앱이 재부팅된다 — 홈이 스켈레톤으로
                  //   되돌아갔다가 다시 차오르고(번쩍 ①) 그 뒤 빈 판이 떴다가 내용이 찬다(번쩍 ②).
                  //   실측(CDP 실프레임 휘도, 375 라이트): 211 → 246 → 211 → 247 → 243 / 열림 267ms.
                  //   앱 안 전환으로 열면 중간 프레임이 없고 55ms 다. 판정은 App 의 openInternalLink 가 한다 —
                  //   모르는 링크는 false 를 돌려주므로 아래 이동 경로가 그대로 남는다(정적 페이지·다른 경로 보존).
                  if (onInternalLink?.(parsed)) return;
                  window.location.assign(parsed.pathname + parsed.search + parsed.hash);
                  return;
                }
                window.open(parsed.href, '_blank', 'noopener,noreferrer');
              }}
              onBanner={(a) => {
                if (a === 'nurimind') { window.open('https://www.nurimind.co.kr', '_blank', 'noopener'); return; }
                if (a === 'tools') onTools(); else if (a === 'explore') onExplore();
              }}
            />
          </div>

        {/* ── 퀵액션 2열 — 출석 체크 · 제휴 혜택 (2026-09-18 오너 시안) ────────
            시안(첨부 HTML 152행)의 2열 압축 액션 그리드. **없던 것을 더하는 것이지 무엇도 지우지 않는다** —
            헤더 [이용권·출석]·캐러셀 이벤트 슬라이드는 그대로 두고 홈에 지름길을 하나 더 낸다.
            · 출석 체크 → 헤더와 **같은 시트**(onOpenVoucher). 같은 목적지에 두 벌 경로를 만들지 않는다.
            · 제휴 혜택 → 이벤트(onEvent). 라벨은 오너 지시 문구이고, **밑에 적는 상태는 실제 값**이다
              (진행 중이면 남은 카드·참여권, 아니면 eventMenuSubtitle 이 사실대로 말한다 — §6-1).
            ⚠ 제목 행에 `min-h-[1.5rem]` — 배지(참여권·카드 수)는 **응답이 와야** 생긴다. 자리를 안 잡으면
              도착하는 순간 행이 3~6px 커지고 그 아래 '오늘·내일 일정'이 통째로 밀린다
              (perf④ 가 잡았다: "첫 페인트 뒤 3px 밀렸다"). 배지 유무와 무관하게 같은 높이를 예약한다.
            ⚠ 제목 행은 `flex-wrap` 이고 배지도 `shrink-0` 가 아니다 — 루트 글자 200% 확대에서
              제목+배지가 한 줄에 못 들어가 **97/141 로 잘렸다**(실측 2026-09-18, 390px·200%).
              배지가 아랫줄로 흐르게 두는 것이 글자를 줄이는 것보다 낫다(§7).
            ⚠ 글로우는 여기 둘에만 준다(micro). 화면에서 '지금 여기를 눌러라' 가 이 둘뿐이기 때문이다 —
              목록 줄처럼 반복되는 자리에 같은 빛을 주면 강조가 아니라 소음이 된다. */}
        {/* 2026-09-24 HOME-DENSITY — 카드 세로 여백 py-2.5→2 · 제목 행 1.5rem→23px · 줄 사이 mt 한 단계씩.
            배지 자리 예약(min-h)의 **이유**는 그대로다 — 23px 는 배지 실상자 22.2px 보다 크다. */}
        {/* 2026-09-25 P — lg 에서 왼쪽 4칸 아래 행(배너 아래끝에 맞춘다). 카드 두 칸은 제목/행동 두 줄(모바일과 같은 모양) —
            4칸(378px) 안의 한 칸 ~184px 에 제목+행동 한 줄은 들어가지 않는다. */}
        <section data-main-enter className="px-page-x pt-3 lg:col-span-4 lg:col-start-1 lg:row-start-2 lg:self-end lg:pt-0" data-testid="home-quick">
          {/* 이벤트 메뉴 스위치가 꺼져 있으면 칸이 하나다 — 2열 격자에 빈 칸을 남기지 않는다. */}
          {/* 2026-09-24 리드 지적(PC 1440 빠른 카드 ~570px 에 제목+행동 줄만) — md~ 는 칸을 20rem 으로 묶고(왼쪽 정렬)
              행동 줄을 제목 **옆 같은 줄**로 올린다. 모바일은 종전 두 줄 그대로. */}
          <div className={eventMenuVisible ? 'grid grid-cols-2 gap-2.5 md:grid-cols-[repeat(2,minmax(0,20rem))] lg:grid-cols-2' : 'grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,20rem)] lg:grid-cols-1'}>
            <button type="button" onClick={onOpenVoucher} data-testid="home-quick-checkin"
              data-aura data-aura-level="micro" data-aura-variant="violet"
              className="group relative flex min-h-[44px] flex-col overflow-hidden rounded-aura border card-aura px-3 py-2 text-left transition-colors hover:border-accent-400/40 md:flex-row md:items-center md:gap-3 lg:flex-col lg:items-stretch lg:gap-0">
              {/* 배경 — 시안의 우상단 블러 원 + 직접 제작한 QR 모티프(public/art/). 조리법은 index.css. */}
              <span aria-hidden className="quick-blob quick-blob-violet" />
              <span aria-hidden className="quick-art quick-art-checkin" />
              {/* 🔴 2026-09-24 HOME-LAYOUT-STRETCH — 제목·배지와 아래 '매장 QR 스캔 ›' 을 **양끝 정렬에서 앞 정렬**로.
                  PC 에서 카드가 571px 인데 글자는 62~132px 라 글자와 꺾쇠 사이가 ~480px 비었다(실측). 꺾쇠는 글자 바로 뒤에 붙는다. */}
              <span className="relative z-10 flex min-h-[23px] flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="min-w-0 t-desc font-extrabold text-ink-primary">
                  {/* 🔴 2026-09-18 오너: "홈 화면에 출석체크를 매장이용권도 추가해줘 어차피 매장이용권을
                      보낼 때 QR로 보낼텐데 그럼 출석체크하고 같으니까".
                      이 버튼이 여는 시트는 **처음부터** 이용권 지갑 + 출석 QR 둘 다였는데(헤더 [이용권·출석]과
                      같은 시트), 홈에서는 '출석 체크' 라고만 불러서 이용권이 거기 있다는 걸 알 길이 없었다.
                      기능을 더한 게 아니라 **이름이 기능을 다 말하게** 고친 것이다. */}
                  <Icon name="ticket" size={13} className="mr-1 inline-block align-[-1px] text-accent-300" />이용권 · 출석
                </span>
                {eventShown === 'banner' && event && event.myTickets > 0 && (
                  <span className="min-w-0 rounded-badge border border-accent-400/40 bg-surface-high px-1.5 py-0.5 text-2xs font-bold tabular-nums text-accent-200">
                    참여권 {event.myTickets}
                  </span>
                )}
              </span>
              {/* 2026-09-24 오너 — 설명 줄('내 이용권 · QR 출석 매일 1회')을 뺐다. 제목·아이콘·행동 줄은 그대로. */}
              <span className="relative z-10 mt-1 flex flex-wrap items-center gap-x-1 border-t border-border-subtle pt-1 md:mt-0 md:border-l md:border-t-0 md:pl-3 md:pt-0 lg:mt-1 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-1">
                <span className="inline-flex min-w-0 items-center gap-1 text-2xs font-bold text-emerald-300">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />매장 QR 스캔
                </span>
                <Icon name="chevron-right" size={12} className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>

            {eventMenuVisible && (
            <button type="button" onClick={() => onEvent()} data-testid="home-quick-event"
              data-aura data-aura-level="micro" data-aura-variant="amber"
              className="group relative flex min-h-[44px] flex-col overflow-hidden rounded-aura border card-aura px-3 py-2 text-left transition-colors hover:border-gold-300/40 md:flex-row md:items-center md:gap-3 lg:flex-col lg:items-stretch lg:gap-0">
              <span aria-hidden className="quick-blob quick-blob-gold" />
              <span aria-hidden className="quick-art quick-art-event" />
              <span className="relative z-10 flex min-h-[23px] flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="min-w-0 t-desc font-extrabold text-ink-primary">
                  {/* 2026-09-19 오너: "제휴 혜택 - 이벤트로 이름 변경". 목적지(onEvent)는 그대로다 —
                      이 칸은 처음부터 이벤트로 갔고, '제휴 혜택' 이라는 이름만 그 사실을 가리고 있었다. */}
                  <Icon name="gift" size={13} className="mr-1 inline-block align-[-1px] text-gold-300" />이벤트
                </span>
                {/* 2026-09-18 오너: "옆에 카드 30은 제거" — 남은 카드 수 배지를 뺐다.
                    같은 정보를 쓰는 다른 자리(캐러셀 이벤트 슬라이드)는 그대로다 — 오너가 지목한 것은 이 칸이다. */}
              </span>
              {/* 2026-09-24 오너 — 설명 줄을 뺐다(위 quickEventFailed 주석: 그 줄의 사실이 어디로 갔나). */}
              <span className="relative z-10 mt-1 flex flex-wrap items-center gap-x-1 border-t border-border-subtle pt-1 md:mt-0 md:border-l md:border-t-0 md:pl-3 md:pt-0 lg:mt-1 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-1">
                {/* 🔴 2026-09-25 오너 결정 — 진행 이벤트가 없는데 '이벤트 보기' 가 강조색으로 남아 있었다. 그 갈래(menu)에선
                    흐린 '진행 중 이벤트 없음' 으로 **사실을 말한다**. 진입은 그대로다(누르면 이벤트 판 — 지난 이벤트·시작 전 안내가 거기 있다).
                    응답 전(pending)·참여 가능(banner)은 종전 '이벤트 보기'. 실패는 '불러오기 실패 · 다시' 가 먼저다. */}
                <span data-testid="home-quick-event-action" className={['min-w-0 text-2xs font-bold', eventShown === 'menu' && !quickEventFailed ? 'text-ink-muted' : 'text-gold-300'].join(' ')}>{quickEventFailed ? '불러오기 실패 · 다시' : eventShown === 'menu' ? '진행 중 이벤트 없음' : '이벤트 보기'}</span>
                <Icon name="chevron-right" size={12} className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
            )}
          </div>
        </section>

        </div>

        {/* ── 지금 등록 가능 ──────────────────────────────────────────────────
            라이브 실측이 열려 있을 때만. 지난 방문에 열린 대회가 있던 기기는 클락 도착 '전'까지
            자리를 예약해 삽입 밀림을 없앤다(도착하면 즉시 확정). */}
        {!clocksLoaded && openNowSeenCount() > 0 && openNow.length === 0 && (
          <section className="px-page-x pt-5" aria-hidden>
            <div className="skeleton mb-2 h-[26px] w-36" />
            {/* 실제 목록과 **같은 박스 모델**로 그 줄 수만큼 예약한다 — 높이를 숫자로 베끼지 않는다. */}
            <div className={`divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura ${HOME_LIST_GRID}`}>
              {Array.from({ length: openNowSeenCount() }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="skeleton h-9 w-0.5 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="skeleton block h-[20px] w-2/3 rounded" />
                    <span className="skeleton mt-0.5 block h-[16px] w-1/2 rounded" />
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
        {openNow.length > 0 && (
          <section data-main-enter className="px-page-x pt-5">
            <header className="flex items-baseline justify-between pb-2.5">
              <h3 className={H3_CLS}>
                지금 등록 가능 <span className="t-desc font-semibold tabular-nums stat-emerald">{openAll.length}</span>
              </h3>
              <button type="button" onClick={onLive} className={MORE_CLS}>
                라이브 <Icon name="chevron-right" size={13} />
              </button>
            </header>
            {/* 2026-09-24 design-reviewer — PC 에서 행 1150px 에 내용 428px(빈 722px) → 일정 목록과 같은 lg~ 2열. */}
            <div className={`divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura ${HOME_LIST_GRID}`}>
              {openNow.map((s) => {
                const reg = regInfoBySchedule.get(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => onSelect(s)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-high/50 active:bg-surface-high">
                    {/* 좌측 상태 바 — 색만으로 상태를 말하지 않는다(아래 '등록 가능' 글자가 정본) */}
                    <span aria-hidden className="h-9 w-0.5 shrink-0 rounded-full bg-emerald-400" />
                    {/* 2026-09-24 HOME-LAYOUT-STRETCH — PC 에서 '참가' 가 줄 오른쪽 끝(1000px 밖)으로 떨어지지 않게 글자 칸에 상한. */}
                    <span className="min-w-0 flex-1 md:max-w-[20rem]">
                      <span className="block truncate t-title text-ink-primary">{s.title}</span>
                      {/* ⚠ truncate 였다 — '마감까지 1시간 34분'이 실제로 잘려 나갔다(실측 250/390).
                          §5: 이름은 줄여도 **등록 마감·금액은 잘라내지 않는다**. 줄바꿈으로 푼다. */}
                      <span className="block break-keep t-desc text-ink-muted">
                        {s.pubName} · <span className="stat-emerald">등록 가능</span>
                        {reg?.msLeft != null && reg.msLeft > 0 && reg.msLeft < 86400_000 && (
                          <span className="tabular-nums"> · 마감까지 {fmtLeft(reg.msLeft)}</span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-badge bg-accent-300/15 px-3 py-1.5 t-desc font-bold text-accent-300">참가</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* N06(2026-09-13, 실행문 §7.1): 여기 있던 독립 이벤트 카드(home-event-banner/menu)는 위 PosterCarousel 안의 이벤트 슬라이드로 옮겼다(eventSlide).
            세 갈래(응답 전 · 참여 가능 · 그 밖)는 그대로고 진입은 언제나 남는다 — 별도 카드를 다시 만들지 않는다. */}

        {/* ── 일정(오너 레퍼런스 2026-09-20) ────────────────────────────────
            🔴 `id="home-schedule"` 는 **계측 손잡이**다. `e2e/perf.spec.ts` 의 `scheduleDrift` 가
              LayoutShift `sources[].node` 를 문자열로 직렬화해 매칭하는데, 종전에는 그 문자열에
              들어 있던 제목 '오늘·내일 일정' 으로 찾고 있었다. 제목을 바꾸면 매칭이 영영 실패해
              **드리프트가 0 으로 거짓 통과**한다. `describe()` 가 `#id` 를 직렬화하므로 여기로 옮긴다.
              (같은 이유로 이 id 를 지우거나 이름을 바꾸지 마라 — 지우면 그 게이트가 빈손이 된다.) */}
        {/* 🔴 2026-09-25 P — lg 에서 제목(왼쪽)·날짜 레일(오른쪽)을 **한 줄**로. 레일(w-fit 499px)이 반쪽에서 끝나 오른쪽이 비던 자리를
            제목이 채우고, 레일 오른끝이 목록 오른끝과 맞는다(1440: 1293 = 1293). 레일·머리 뒤의 자식(목록·빈 상태·실패)은 두 칸을 다 쓴다.
            ⚠ 자식 순서(레일 → 머리 → 목록)에 기대는 규칙이다 — 앞에 자식을 끼우면 nth-child(n+3) 을 같이 고쳐라. */}
        <section data-main-enter id="home-schedule" data-testid="home-schedule" className="px-page-x pt-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-4 lg:pt-5 lg:[&>*:nth-child(n+3)]:col-span-2">
          {/* ① 날짜 레일 — 5칸 + 좌우 이동. 레퍼런스의 상단 레일.
              ⚠ 화살표에 `.hit` 을 쓰지 않는다 — `::after` 가 44px 를 중앙에서 펼치는데 이 둘은
                레일의 **양 끝**이라 그 오버행이 컨테이너 밖으로 나가 `scrollWidth` 를 1px 늘렸다
                (실측 client 354 / scroll 355 — 모든 폭에서). 이 저장소가 경계하는 '숨은 가로 스크롤' 이다.
                `src/index.css` 의 `.hit` 함정 주석이 적어 둔 대로 **실제 박스를 44px 로** 키운다. */}
          {/* 🔴 2026-09-24 HOME-LAYOUT-STRETCH — 5칸 레일 → **가로 스와이프 날짜 스트립**(오너: "5개만 보인다. 더 나은 방법이 있으면 넣어라").
              2차 오너: 달력 버튼 **제거** · 한 화면 **7칸** · 누른 날짜가 **가운데**(선택일 ±3일).
              · 칩 폭 = 스트립 폭의 1/7(모바일, 최소 44px) · md~ 고정 3.25rem × 7 = 22.75rem 스트립(레일은 내용 폭) —
                종전엔 5칸이 레일 폭을 나눠 1280~ 에서 칩 208px 에 글자 25px(8.4배)였다(실측).
              · 9주(64칸) · 스냅(가운데) · 오늘 표시 · 대회 있는 날 점(이미 받은 일정으로만 계산).
              · 화살표는 PC(md~)에서만(한 창씩). 모바일은 스와이프.
              ⚠ 320~359 는 7×44 = 308px 가 스트립 폭(278px)보다 커서 **6칸 남짓**만 보인다 — 44px 터치를 지키는 쪽을 택했다.
              · 스트립은 **의도한 가로 스크롤러**다(배너와 같은 부류) — e2e home-flow-fit 의 허용 목록에 올렸다.
              ⚠ 레일 높이는 칩의 min-h 44px(+ p-1)가 정한다. 칩이 오기 전 첫 렌더에도 같은 높이를 지키도록 스트립에 min-h 를 준다(CLS 0). */}
          <div data-testid="home-date-rail" className="mb-2 flex items-stretch gap-1 rounded-aura border card-aura p-1 md:w-fit lg:col-start-2 lg:row-start-1">
            <button type="button" aria-label="이전 날짜" data-testid="home-date-prev"
              onClick={() => stepStrip(-1)}
              className="hidden min-h-[44px] w-11 shrink-0 place-items-center rounded-[8px] text-ink-muted transition-colors hover:bg-surface-high hover:text-ink-secondary md:grid">
              <Icon name="chevron-left" size={15} />
            </button>
            <div ref={stripRef} data-testid="home-date-strip"
              className="scrollbar-none relative flex min-h-[44px] min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain md:w-[22.75rem] md:flex-none">
              {railDays.map((iso) => {
                const [, mm, dd] = iso.split('-').map(Number);
                const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(Number(iso.slice(0, 4)), mm - 1, dd).getDay()];
                const on = iso === selectedDate;
                const isToday = iso === today;
                const has = gameDays.has(iso);
                return (
                  <button key={iso} type="button" data-date-pill={iso} aria-pressed={on} data-today={isToday ? '1' : undefined}
                    aria-label={`${mm}월 ${dd}일 ${dow}요일${isToday ? ' 오늘' : ''} 일정 보기${has ? ' · 대회 있음' : ''}`}
                    onClick={() => setSelectedDate(iso)}
                    className={[
                      // 폭: 모바일 = 스트립의 1/7(최소 44px) · md~ 고정 3.25rem(55px · 13px 글자 29px 의 1.9배).
                      'flex min-h-[44px] w-[calc(100%/7)] min-w-[44px] shrink-0 snap-center flex-col items-center justify-center rounded-[8px] leading-tight transition-colors md:w-[3.25rem]',
                      on
                        // 선택일 강조 — 레퍼런스의 금색 테두리. 색만으로 구분하지 않게 테두리도 같이 준다(§접근성).
                        // 🔴 2026-09-20 — 종전 `text-gold-300` 이었는데 **라이트 테마에서 대비 1.43:1** 이었다
                        //   (e2e home-flow-fit 이 잡았다: `(일) 1.43:1 9px rgba(252,213,53,.8) on rgb(255,255,255)`).
                        //   금색은 어두운 지면에서만 산다. 테두리·배경은 그대로 두고 **글자만** 본문색으로 돌린다
                        //   — 선택 표시는 색 하나에 의존하지 않는다(색맹 고려 · `aria-pressed` 도 같이 준다).
                        ? 'border border-gold-300/70 bg-gold-300/10 text-ink-primary'
                        : 'border border-transparent text-ink-secondary hover:bg-surface-high',
                    ].join(' ')}>
                    {/* 안쪽 얼굴 — 휠 피커 효과(투명도·블러·크기)는 여기에만 건다(위 효과 주석). 첫 자식이어야 한다. */}
                    <span data-pill-face className="flex flex-col items-center">
                      <span className="text-[11px] font-bold tabular-nums md:text-[13px]">{mm}.{dd}</span>
                      <span className={`text-[9px] md:text-[11px] ${isToday ? 'font-bold text-accent-200' : on ? 'text-ink-secondary' : 'text-ink-muted'}`}>{isToday ? '오늘' : `(${dow})`}</span>
                      {/* 대회 있는 날 점 — 없는 날도 **같은 자리**를 비워 둔다(칩 높이가 날마다 달라지지 않게). */}
                      <span aria-hidden className={`mt-0.5 h-1 w-1 rounded-full ${has ? 'bg-accent-300' : 'bg-transparent'}`} />
                    </span>
                  </button>
                );
              })}
            </div>
            <button type="button" aria-label="다음 날짜" data-testid="home-date-next"
              onClick={() => stepStrip(1)}
              className="hidden min-h-[44px] w-11 shrink-0 place-items-center rounded-[8px] text-ink-muted transition-colors hover:bg-surface-high hover:text-ink-secondary md:grid">
              <Icon name="chevron-right" size={15} />
            </button>
          </div>

          {/* ② 선택일 제목 + 실제 건수 — 레퍼런스의 "9월 20일 (일) 일정 / 총 6개의 토너먼트".
              ⚠ 건수는 **자르기 전 전체 수**(daySchedules)다. 화면에 8개만 그려도 숫자는 사실이어야 한다. */}
          {/* 2026-09-24 HOME-DENSITY — 섹션 pt-5→3.5 · 레일 아래 mb-2.5→2 · 제목 아래 pb-2.5→2. 날짜 칩(44px)은 그대로. */}
          {/* 2026-09-24 HOME-LAYOUT-STRETCH — 건수를 제목 **바로 뒤**에(종전 양끝 정렬: PC 에서 둘 사이 956px, 390 에서도 182px > 글자 174px). */}
          <header className="flex flex-wrap items-baseline gap-x-2 pb-2 lg:col-start-1 lg:row-start-1 lg:mb-2 lg:pb-0">
            <h3 data-testid="home-schedule-title" className={H3_CLS}>
              {selectedDate ? `${dayTitle(selectedDate)} 일정` : '일정'}
            </h3>
            <span data-testid="home-schedule-count" className="shrink-0 text-2xs text-ink-muted">
              {useFallback ? '오늘·내일 예정 없음' : `총 ${daySchedules.length}개의 대회`}
            </span>
          </header>
          {!loaded ? (
            <div className={`divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura ${HOME_LIST_GRID}`} aria-busy="true">
              {/* 🔴 날짜 머리말 자리 예약(2026-09-20) — 목록에 날짜 그룹 머리말을 넣으면서
                  스켈레톤이 그만큼 적게 예약해 데이터 도착 시 아래가 밀렸다(CLS).
                  ⚠ **몇 개**가 붙을지는 데이터 전에 모른다(그룹 수는 배열을 봐야 나온다).
                    다만 **첫 항목에는 항상 하나 붙는다**(lib/scheduleDateGroups 의 i===0 분기) —
                    확실한 그 하나만 예약한다. 추측으로 더 넣으면 반대로 과다예약이 된다.
                  실측: 진짜 머리말 27.4px · 이 예약 27.6px(py-1.5 12.75 + h-3.5 14.875). */}
              {/* 🔴 2026-09-24 정정: 위 머리말 예약은 날짜 레일 도입(09-20) 뒤 **일반 갈래에 머리말이 없어져** 과다예약이었다.
                  대신 목록 끝에 **늘 붙는** '전체 일정 보기'(min-h 44px) 자리를 맨 아래에 예약한다(아래 map 뒤). */}
              {Array.from({ length: upcomingSeenCount() }).map((_, i) => (
                /* 실제 카드 행과 같은 높이를 예약한다(--card-h-list — 카드가 바뀌면 그 토큰만 고친다).
                   🔴 2026-09-24 정정: min-h 였는데 안쪽 막대 4줄+gap(76.4)+py-1.5 가 **89.1~90.1px** 로 토큰(82)을 넘어
                   행마다 +8px 과다예약이었다(390 실측, 실제 카드 76.5). 높이를 토큰으로 **고정**하고 넘침은 자른다. */
                <div key={i} className="flex h-[var(--card-h-list)] items-center gap-3 overflow-hidden px-3 py-1.5">
                  {/* 2026-09-25 SCHEDULE-ROW-E — 실제 카드(로고 56 · 세 줄 · 오른쪽 금액 칸)와 같은 모양 */}
                  <div className="skeleton h-[56px] w-[56px] shrink-0 rounded-[12px]" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {['w-3/4', 'w-1/2', 'w-2/3'].map((w) => <div key={w} className={`skeleton h-3 ${w}`} />)}
                  </div>
                  <div className="skeleton h-8 w-[4.5rem] shrink-0" />

                </div>

              ))}
              <div aria-hidden className="min-h-[44px] bg-surface-high/40 lg:col-span-2" />
            </div>
          ) : failed ? (
            /* 세 번째 갈래(§11) — '없음'이 아니라 '못 불러옴'. 카드·문구·재시도 버튼은 일정 탐색과
               같은 정본(LoadErrorCard)을 쓴다. compact: 홈에서는 이 섹션 하나가 화면을 다 먹으면 안 된다. */
            <LoadErrorCard compact error={schedulesError} what="대회 목록" onRetry={onRetrySchedules} />
          ) : daySchedules.length === 0 && !useFallback ? (
            <div className="rounded-aura border card-aura px-3 py-4">
              {/* 빈 상태는 **무엇이 없고 지금 무엇을 할 수 있는지**를 말한다 — 이제 여기까지 오는 것은
                  '오늘·내일도 없고 앞으로도 없다' 는 뜻이다(다음 일정이 하나라도 있으면 아래 갈래로 간다). */}
              {/* 🔴 어느 날짜가 비었는지 **말한다.** 종전 문구는 '예정된 대회가 없어요' 라
                  날짜를 골라 둘러보는 화면에서는 '전체가 없다' 로 읽힌다. */}
              <p data-testid="home-schedule-empty" className="t-body text-ink-muted">
                {selectedDate ? `${dayTitle(selectedDate)}에는 예정된 대회가 없어요` : '예정된 대회가 없어요'}
              </p>
              <button type="button" onClick={onExplore}
                className="mt-2 inline-flex items-center gap-1 rounded-badge bg-surface-high px-3 py-2 t-desc font-bold text-ink-secondary transition-colors hover:bg-surface-float/70">
                전체 일정에서 찾아보기 <Icon name="chevron-right" size={13} />
              </button>
            </div>
          ) : (
            <div className={`divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura ${useFallback ? '' : HOME_LIST_GRID}`}>
              {/* 🔴 다음 일정 갈래 — 제목은 '오늘·내일' 인데 목록은 그 뒤 것이다. 그 사실을 **먼저** 말한다.
                  말 없이 9/21 대회만 놓으면 사용자는 그것을 오늘 대회로 읽는다(2026-09-19 오너 지시 반영). */}
              {useFallback && (
                <p data-testid="home-upcoming-fallback" className="bg-surface-high/40 px-3 py-2 text-2xs leading-tight text-ink-muted">
                  오늘·내일은 예정 대회가 없어요 · <b className="font-bold text-accent-200">가장 가까운 일정</b>
                </p>
              )}
              {(useFallback ? nextUp : dayVisible).map((s, i) => (
                <Fragment key={s.id}>
                {(() => {
                  // 🔴 날짜 머리말은 **폴백 갈래에서만** 그린다(2026-09-20 레퍼런스 UI-2).
                  //   일반 갈래는 **고른 날짜 하나**만 보여 주고 위 제목이 이미 그 날짜를 말하므로,
                  //   머리말까지 둘면 화면에 날짜가 **두 번** 나온다(실행문이 명시한 금지).
                  //   반대로 폴백은 여러 날짜가 섮여 있어 머리말이 **없으면** 다른 날 대회를 오늘 것으로 읽는다.
                  // ⚠ 정본은 `lib/scheduleDateGroups` 하나다 — 일정탐색과 같은 함수를 쓴다.
                  const h = dateHeaderAt(nextUp, i, useFallback);
                  return h ? (
                    <p data-date-header={s.date}
                      className="bg-surface-high/40 px-3 py-1.5 text-2xs font-bold leading-tight text-ink-secondary">{h}</p>
                  ) : null;
                })()}
                <ScheduleCard mode="list" layout="timetable" schedule={s}
                  venue={venueById?.get(s.venueId)}
                  regInfo={regInfoBySchedule.get(s.id)}
                  onVenueClick={onVenue}
                  onSelect={onSelect}
                  priority={i < 4} />
                </Fragment>
              ))}
              {/* 목록 끝의 '전체 일정' — 시안(첨부 HTML 271행 'See All Tournaments')의 자리.
                  헤더에도 같은 링크가 있지만, 목록을 다 훑고 난 **그 자리**에서 이어 가게 하는 것이 요점이다
                  (위로 되돌아가지 않아도 된다). 목적지는 같은 onExplore 하나다 — 경로를 두 벌로 만들지 않는다. */}
              <button type="button" onClick={onExplore} data-testid="home-upcoming-all"
                className="flex min-h-[44px] w-full lg:col-span-2 items-center justify-center gap-1 bg-surface-high/40 px-3 py-2.5 text-2xs font-bold text-accent-200 transition-colors hover:bg-surface-high">
                전체 일정 보기 <Icon name="chevron-right" size={12} />
              </button>
            </div>
          )}
        </section>

        {/* 🔴 2026-09-19 오너: "홈 화면에 GTO 도구 있는 부분 삭제".
            여기 있던 'GTO 도구' 한 줄을 지웠다. **진입은 잃지 않는다** — 하단 탭바에 GTO 탭이
            그대로 있고(App.tsx 탭 목록), 목적지도 같은 onTools 였다. 즉 같은 곳으로 가는 문이
            한 화면에 둘이었고 오너가 그중 중복을 지운 것이다.
            ⚠ onTools prop 자체는 남는다 — '전략 탐색' 등 다른 진입이 계속 쓴다. */}
      </div>
    </div>
  );
}
