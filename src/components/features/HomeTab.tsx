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
import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
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
  /** 레일에 보이는 5칸의 **첫 날**. 오너 레퍼런스처럼 오늘이 가운데(3번째)에 오게 시작한다. */
  const [railStart, setRailStart] = useState(() => '');
  const [selectedDate, setSelectedDate] = useState(() => '');
  // 최초 1회만 오늘 기준으로 맞춘다(이후 사용자의 선택을 덮지 않는다 — 상세를 보고 돌아와도 유지).
  useEffect(() => {
    if (selectedDate) return;
    setSelectedDate(today);
    setRailStart(isoAdd(today, -2));
  }, [today, selectedDate, isoAdd]);

  const railDays = useMemo(
    () => (railStart ? Array.from({ length: 5 }, (_, i) => isoAdd(railStart, i)) : []),
    [railStart, isoAdd],
  );

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

  /** 퀵액션 '이벤트' 칸의 설명 한 줄 — 배지를 뺀 자리에 **사실**을 놓는다.
   *  진행 중이면 참여권 상태, 그 밖이면 eventMenuSubtitle(응답 전·실패·소진·시작 전·종료를 구분해 말한다).
   *  ⚠ 남은 카드 수는 넣지 않는다 — 오너가 그 숫자를 이 칸에서 빼라고 했다(2026-09-18).
   *  2026-09-19 오너: 참여권이 없을 때 문구를 '매장 출석하면 참여권 1장' → '진행 중인 이벤트 보기'.
   *    ⚠ 참여권을 **가진** 사람에게는 보유 장수를 계속 말한다 — 그건 이 칸에서만 보이는 정보라
   *      같이 지우면 기능이 소실된다(오너가 지목한 것은 0장일 때의 안내 문구다). */
  const quickEventDesc = useMemo(() => {
    if (eventShown === 'banner' && event) {
      return event.myTickets > 0 ? `참여권 ${event.myTickets}장 보유` : '진행 중인 이벤트 보기';
    }
    return eventMenuSubtitle(eventLoaded, eventFailed, event, eventState);
  }, [eventShown, event, eventLoaded, eventFailed, eventState]);

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
        <div data-main-enter className="lg:grid lg:grid-cols-12 lg:items-center lg:gap-6 lg:pt-4">
          {/* 오늘 안내 — 기본 48~60px(§6-2). 큰 인사말이 아니라 **사실**이다. */}
          <section data-testid="home-today" className="px-page-x pt-1.5 lg:col-span-5 lg:pt-0">
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
            <p data-testid="home-today-line" className="mt-0.5 h-[26px] whitespace-nowrap text-[18px] font-bold leading-[26px] text-ink-primary md:h-[30px] md:text-[22px] md:leading-[30px]">
              {/* ⚠ 여기서 '오늘 대회 0개' 라고 적으면 그것은 **조회 실패를 사실로 위장**하는 것이다(§11).
                  수치는 '도착한 것만' 적는다는 이 줄의 원래 규칙에, 실패도 '미도착' 이라는 사실을 더한다. */}
              {/* 🔴 2026-09-18 오너: "초반에는 매장이 많이 없을 예정이라 '지금 등록 가능 0개' 는 빼도 좋겠다.
                  '오늘 대회 1개' 도 빼고 GTO 쪽을 강조해볼까? 무료 GTO 도구 20개 이런 식으로"

                  숫자 나열을 GTO 가치 제안으로 바꾼다. 다만 **개인화 문장(personal)은 그대로 살린다** —
                  그건 '내가 가 본 매장에 오늘 대회가 있다' 같은 그 사람만의 사실이라 광고 문구보다 세다.
                  매장이 적은 초반에는 personal 이 대개 비어 GTO 줄이 뜨고, 이력이 쌓이면 그 사람 문장이 뜬다.
                  ⚠ 숫자는 하드코딩이 아니다 — lib/gtoToolCount.ts + 계약 테스트가 ToolsPanel 원문을 세어
                    이 값이 거짓이 되는 순간 빨개진다(화면 수치는 사실이어야 한다, §6-1).
                  ⚠ 여기에 GTO 로 가는 링크를 달지 마라 — home-flow-fit 의 'GTO 진입은 홈에 한 곳뿐이다'
                    계약이 있다. 진입은 아래 도구 줄 하나가 맡는다. */}
              {!loaded
                ? <>오늘의 대회를 불러오는 중</>
                : failed
                  ? <>오늘 대회 정보를 불러오지 못했어요</>
                  : personal
                    ? <Nums text={personal} />
                    : <>무료 GTO 도구 <span className="stat-pill font-extrabold tabular-nums text-accent-200" style={{ '--aura-led-rgb': '139 92 246' } as React.CSSProperties}>{GTO_TOOL_COUNT}개</span></>}
            </p>
          </section>

          {/* 작은 실제 배너 — 하나의 메시지, 하나의 연결(§6-2) */}
          <div className="lg:col-span-7">
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
        <section data-main-enter className="px-page-x pt-3" data-testid="home-quick">
          {/* 이벤트 메뉴 스위치가 꺼져 있으면 칸이 하나다 — 2열 격자에 빈 칸을 남기지 않는다. */}
          <div className={eventMenuVisible ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-1 gap-2.5'}>
            <button type="button" onClick={onOpenVoucher} data-testid="home-quick-checkin"
              data-aura data-aura-level="micro" data-aura-variant="violet"
              className="group relative flex min-h-[44px] flex-col overflow-hidden rounded-aura border card-aura px-3 py-2 text-left transition-colors hover:border-accent-400/40">
              {/* 배경 — 시안의 우상단 블러 원 + 직접 제작한 QR 모티프(public/art/). 조리법은 index.css. */}
              <span aria-hidden className="quick-blob quick-blob-violet" />
              <span aria-hidden className="quick-art quick-art-checkin" />
              <span className="relative z-10 flex min-h-[23px] flex-wrap items-center justify-between gap-x-1 gap-y-0.5">
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
              {/* 설명줄 — 시안 'QR 출석 = 매일 1회'. 기능을 사실대로 말하는 한 줄이라 남긴다.
                  ⚠ min-h 로 자리를 고정한다: 두 칸의 설명 길이가 달라도 아래 섹션이 안 밀린다. */}
              <p className="relative z-10 mt-0.5 min-h-[1.15rem] text-2xs font-medium leading-tight text-ink-secondary">
                {/* 2026-09-24 HOME-DENSITY — 이 줄이 360 이하에서 두 줄로 접혔다(글자 132.1 / 칸 130.5·110.5 실측).
                    '이용권'은 바로 위 제목이 이미 말하므로 좁은 폭(≤365)에서만 앞머리를 숨긴다 — 390 이상은 문구 그대로. */}
                <span className="max-[365px]:hidden">내 이용권 · </span>QR 출석 매일 1회
              </p>
              <span className="relative z-10 mt-1.5 flex flex-wrap items-center justify-between gap-x-1 border-t border-border-subtle pt-1">
                <span className="inline-flex min-w-0 items-center gap-1 text-2xs font-bold text-emerald-300">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />매장 QR 스캔
                </span>
                <Icon name="chevron-right" size={12} className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>

            {eventMenuVisible && (
            <button type="button" onClick={() => onEvent()} data-testid="home-quick-event"
              data-aura data-aura-level="micro" data-aura-variant="amber"
              className="group relative flex min-h-[44px] flex-col overflow-hidden rounded-aura border card-aura px-3 py-2 text-left transition-colors hover:border-gold-300/40">
              <span aria-hidden className="quick-blob quick-blob-gold" />
              <span aria-hidden className="quick-art quick-art-event" />
              <span className="relative z-10 flex min-h-[23px] flex-wrap items-center justify-between gap-x-1 gap-y-0.5">
                <span className="min-w-0 t-desc font-extrabold text-ink-primary">
                  {/* 2026-09-19 오너: "제휴 혜택 - 이벤트로 이름 변경". 목적지(onEvent)는 그대로다 —
                      이 칸은 처음부터 이벤트로 갔고, '제휴 혜택' 이라는 이름만 그 사실을 가리고 있었다. */}
                  <Icon name="gift" size={13} className="mr-1 inline-block align-[-1px] text-gold-300" />이벤트
                </span>
                {/* 2026-09-18 오너: "옆에 카드 30은 제거" — 남은 카드 수 배지를 뺐다.
                    같은 정보를 쓰는 다른 자리(캐러셀 이벤트 슬라이드)는 그대로다 — 오너가 지목한 것은 이 칸이다. */}
              </span>
              {/* 설명줄 — **실제 값**이다(시안의 '강남 라운지 무료 바이인'은 예시 문구라 그대로 쓰지 않는다).
                  진행 중이면 참여권 상태, 아니면 eventMenuSubtitle 이 사실대로 말한다(§6-1 허위 문구 금지). */}
              <p className="relative z-10 mt-0.5 min-h-[1.15rem] truncate text-2xs font-medium leading-tight text-ink-secondary">
                {quickEventDesc}
              </p>
              <span className="relative z-10 mt-1.5 flex flex-wrap items-center justify-between gap-x-1 border-t border-border-subtle pt-1">
                <span className="min-w-0 text-2xs font-bold text-gold-300">이벤트 보기</span>
                <Icon name="chevron-right" size={12} className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
            )}
          </div>
        </section>

        {/* ── 지금 등록 가능 ──────────────────────────────────────────────────
            라이브 실측이 열려 있을 때만. 지난 방문에 열린 대회가 있던 기기는 클락 도착 '전'까지
            자리를 예약해 삽입 밀림을 없앤다(도착하면 즉시 확정). */}
        {!clocksLoaded && openNowSeenCount() > 0 && openNow.length === 0 && (
          <section className="px-page-x pt-5" aria-hidden>
            <div className="skeleton mb-2 h-[26px] w-36" />
            {/* 실제 목록과 **같은 박스 모델**로 그 줄 수만큼 예약한다 — 높이를 숫자로 베끼지 않는다. */}
            <div className="divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura">
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
            <div className="divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura">
              {openNow.map((s) => {
                const reg = regInfoBySchedule.get(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => onSelect(s)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-high/50 active:bg-surface-high">
                    {/* 좌측 상태 바 — 색만으로 상태를 말하지 않는다(아래 '등록 가능' 글자가 정본) */}
                    <span aria-hidden className="h-9 w-0.5 shrink-0 rounded-full bg-emerald-400" />
                    <span className="min-w-0 flex-1">
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
        <section data-main-enter id="home-schedule" data-testid="home-schedule" className="px-page-x pt-3.5">
          {/* ① 날짜 레일 — 5칸 + 좌우 이동. 레퍼런스의 상단 레일.
              ⚠ 화살표에 `.hit` 을 쓰지 않는다 — `::after` 가 44px 를 중앙에서 펼치는데 이 둘은
                레일의 **양 끝**이라 그 오버행이 컨테이너 밖으로 나가 `scrollWidth` 를 1px 늘렸다
                (실측 client 354 / scroll 355 — 모든 폭에서). 이 저장소가 경계하는 '숨은 가로 스크롤' 이다.
                `src/index.css` 의 `.hit` 함정 주석이 적어 둔 대로 **실제 박스를 44px 로** 키운다. */}
          <div data-testid="home-date-rail" className="mb-2 flex items-stretch gap-1 rounded-aura border card-aura p-1">
            <button type="button" aria-label="이전 날짜" data-testid="home-date-prev"
              onClick={() => setRailStart((v) => isoAdd(v, -5))}
              className="grid min-h-[44px] w-11 shrink-0 place-items-center rounded-[8px] text-ink-muted transition-colors hover:bg-surface-high hover:text-ink-secondary">
              <Icon name="chevron-left" size={15} />
            </button>
            {/* ⚠ 글자 200% 확대에서 화살표(`w-11`=rem)가 93.5px × 2 로 커져 칸을 19.8px 로 짓눌렀다
                — 날짜 글자가 18/21 로 **잘렸다**(e2e home-flow-fit 이 잡았다).
                이 저장소 기준은 "확대에서 2줄 되는 것은 실패가 아니고 **잘림**이 실패" 다.
                → `flex-wrap` 으로 접히게 하고, 칸에서 `min-w-0` 을 **뺀다** — 그게 있으면
                  flex 항목이 글자보다 작게 짓눌려 잘린다. 빼면 min-content 가 바닥이 돼 접힌다.
                ⚠ 100% 에서는 폭이 남아 wrap 이 안 일어난다 — 5칸 한 줄 그대로다(실측으로 확인).
                🔴 2026-09-24 정정: 320 에서는 **100% 에서도 접혔다**(레일 54.5→98.5px, 9.26 한 칸이 173px 로 둘째 줄).
                  basis 2.5rem ×5 = 212.5 > 칸 폭 ~184 였기 때문이다. basis-0 이면 바닥이 글자 min-content 라
                  글자가 실제로 안 들어갈 때(200% 확대)만 접힌다. */}
            <div className="flex min-w-0 flex-1 flex-wrap">
              {railDays.map((iso) => {
                const [, mm, dd] = iso.split('-').map(Number);
                const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(Number(iso.slice(0, 4)), mm - 1, dd).getDay()];
                const on = iso === selectedDate;
                return (
                  <button key={iso} type="button" data-date-pill={iso} aria-pressed={on}
                    aria-label={`${mm}월 ${dd}일 ${dow}요일 일정 보기`}
                    onClick={() => setSelectedDate(iso)}
                    className={[
                      'flex min-h-[44px] flex-1 basis-0 flex-col items-center justify-center rounded-[8px] px-0.5 leading-tight transition-colors',
                      on
                        // 선택일 강조 — 레퍼런스의 금색 테두리. 색만으로 구분하지 않게 테두리도 같이 준다(§접근성).
                        // 🔴 2026-09-20 — 종전 `text-gold-300` 이었는데 **라이트 테마에서 대비 1.43:1** 이었다
                        //   (e2e home-flow-fit 이 잡았다: `(일) 1.43:1 9px rgba(252,213,53,.8) on rgb(255,255,255)`).
                        //   금색은 어두운 지면에서만 산다. 테두리·배경은 그대로 두고 **글자만** 본문색으로 돌린다
                        //   — 선택 표시는 색 하나에 의존하지 않는다(색맹 고려 · `aria-pressed` 도 같이 준다).
                        ? 'border border-gold-300/70 bg-gold-300/10 text-ink-primary'
                        : 'border border-transparent text-ink-secondary hover:bg-surface-high',
                    ].join(' ')}>
                    <span className="text-[11px] font-bold tabular-nums">{mm}.{dd}</span>
                    <span className={`text-[9px] ${on ? 'text-ink-secondary' : 'text-ink-muted'}`}>({dow})</span>
                  </button>
                );
              })}
            </div>
            <button type="button" aria-label="다음 날짜" data-testid="home-date-next"
              onClick={() => setRailStart((v) => isoAdd(v, 5))}
              className="grid min-h-[44px] w-11 shrink-0 place-items-center rounded-[8px] text-ink-muted transition-colors hover:bg-surface-high hover:text-ink-secondary">
              <Icon name="chevron-right" size={15} />
            </button>
          </div>

          {/* ② 선택일 제목 + 실제 건수 — 레퍼런스의 "9월 20일 (일) 일정 / 총 6개의 토너먼트".
              ⚠ 건수는 **자르기 전 전체 수**(daySchedules)다. 화면에 8개만 그려도 숫자는 사실이어야 한다. */}
          {/* 2026-09-24 HOME-DENSITY — 섹션 pt-5→3.5 · 레일 아래 mb-2.5→2 · 제목 아래 pb-2.5→2. 날짜 칩(44px)은 그대로. */}
          <header className="flex items-baseline justify-between gap-2 pb-2">
            <h3 data-testid="home-schedule-title" className={H3_CLS}>
              {selectedDate ? `${dayTitle(selectedDate)} 일정` : '일정'}
            </h3>
            <span data-testid="home-schedule-count" className="shrink-0 text-2xs text-ink-muted">
              {useFallback ? '오늘·내일 예정 없음' : `총 ${daySchedules.length}개의 대회`}
            </span>
          </header>
          {!loaded ? (
            <div className="divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura" aria-busy="true">
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
                  <div className="skeleton h-16 w-16 shrink-0 rounded-input" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="skeleton h-3.5 w-1/3" />
                    <div className="skeleton h-[19px] w-3/4" />
                    <div className="skeleton h-3.5 w-1/2" />
                    <div className="skeleton h-3.5 w-2/3" />
                  </div>
                </div>
              ))}
              <div aria-hidden className="min-h-[44px] bg-surface-high/40" />
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
            <div className="divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura">
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
                <ScheduleCard mode="list" schedule={s}
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
                className="flex min-h-[44px] w-full items-center justify-center gap-1 bg-surface-high/40 px-3 py-2.5 text-2xs font-bold text-accent-200 transition-colors hover:bg-surface-high">
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
