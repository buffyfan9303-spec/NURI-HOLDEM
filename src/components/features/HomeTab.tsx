// src/components/features/HomeTab.tsx
// 홈 — §6(2026-09-13) 재구성: "작은 배너 다음에 **실제 콘텐츠**가 바로 이어지는 흐름".
//
// 순서(§6-1):
//   헤더(App) → 짧은 오늘 안내(날짜·실제 수치) → 작은 실제 배너 → 추천 대회(가로 레일)
//   → 지금 등록 가능 → 진행 중인 이벤트 → 오늘·내일 일정 → GTO 도구
//
// 바뀐 것과 이유
//  · **거대한 GTO 히어로를 지웠다.** 24px 헤드라인 + 그라데이션 + 서브카피가 첫 화면의 절반을 먹어
//    추천 콘텐츠를 아래로 밀었다(§6-2: "큰 인사말 때문에 추천 콘텐츠가 화면 아래로 밀리지 않게").
//    그 자리를 **사실**(오늘 날짜 · 오늘 대회 수 · 지금 등록 가능 수)이 대신한다.
//    GTO 진입은 **한 곳으로 합쳤다** — 화면 맨 아래 'GTO 도구' 한 줄(§6-1: 히어로와 대형 카드에
//    같은 GTO 설명을 반복하지 않는다). 목적지(`onTools`)는 그대로라 사라진 길은 없다.
//    같은 이유로 PosterCarousel 의 'GTO 도구' 브랜드 슬라이드도 뺐다.
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import PosterCarousel, { type EventSlide } from './PosterCarousel';
import type { HomeBanner } from '../../api/homeBanners';
import ScheduleCard, { buyInText } from './ScheduleCard';
import { thumbUrl } from '../../lib/imageUrl';
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

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 목록에 실제로 그리는 '지금 등록 가능' 줄 수(§6-1: 3~5개). 스켈레톤 예약도 같은 값을 쓴다. */
const OPEN_NOW_ROWS = 5;
/** 추천 레일 장수 — 모바일은 가로 스크롤, PC 는 4~6장이 한눈에 들어온다(§6-4). */
const RAIL_MAX = 8;

const UPCOMING_SEEN = 'nuri:upcoming-seen';
/** 지난 방문에 '오늘·내일 일정'이 **몇 줄**이었나(1~8). 스켈레톤을 4행 고정으로 그리면 실제가 8행일 때
 *  데이터 도착 순간 4행 × --card-h-list 만큼 아래가 통째로 밀린다(2026-09-10 용량·모션 점검에서
 *  '툭'의 최대 단일 원인으로 지목). 첫 방문 기본값은 종전과 같은 4. openNow 와 같은 조리법이다. */
const upcomingSeenCount = () => {
  try {
    const n = Number(localStorage.getItem(UPCOMING_SEEN));
    return Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 1), 8) : 4;
  } catch { return 4; }
};
const OPENNOW_SEEN = 'nuri:opennow-seen';
/** 지난 방문에 '지금 등록 가능'이 **몇 줄**이었나(0~5). 예전엔 '1'/'0' 만 저장해 한 줄만 예약했고,
 *  실제로 서너 줄이 오면 그 차이만큼 아래가 통째로 밀렸다. 옛 값('1')도 한 줄로 읽어 하위호환. */
const openNowSeenCount = () => {
  try {
    const v = localStorage.getItem(OPENNOW_SEEN);
    if (!v || v === '0') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(n, 1), OPEN_NOW_ROWS) : 1; // '1'(옛 값) → 1줄
  } catch { return 0; }
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

/** 추천 카드·레일의 상태 칩 — ScheduleCard 의 statusBadge 와 **같은 라벨·같은 색 계약**이다.
 *  ⚠ 그쪽은 export 되어 있지 않다(매장 팀 편집 직후라 열지 않았다). 문구가 갈리면 안 되므로
 *     '등록 가능 / 진행 중 / 예정' 세 갈래만 그대로 복제했고, 근거 없는 '마감 임박' 류는 없다.
 *     정본 하나로 합치려면 ScheduleCard 에서 statusBadge·StatusPill 을 export 하면 된다(후속). */
function railBadge(s: Schedule, reg: RegInfo | undefined): { text: string; cls: string } {
  const open = (reg?.msLeft ?? 0) > 0;
  if (open) return { text: '등록 가능', cls: 'bg-emerald-700 text-white' };
  if (scheduleStatus(s.date, s.startTime) === 'live') return { text: '진행 중', cls: 'bg-danger-dark text-white' };
  return { text: '예정', cls: 'bg-surface-high text-ink-secondary' };
}

/** 섹션 제목·'더 보기' 버튼·진입 줄은 홈에서 3~4번 반복된다 — 문자열을 한 벌로 둔다
 *  (읽기에도 좋고, 번들에서 같은 리터럴이 여러 벌 실리지 않는다). §5 역할표: 섹션 제목 18/26(PC 20/28). */
const H3_CLS = 'font-display text-[18px] font-bold leading-[26px] tracking-tight text-ink-primary md:text-[20px] md:leading-[28px]';
const MORE_CLS = 'flex items-center gap-0.5 py-2 -my-2 t-desc font-semibold text-ink-muted hover:text-ink-secondary';
/** 진입 줄의 **크롬 치수는 px 고정**이다(rem 아님).
 *  왜: 200% 글자 확대 · 320~360px 에서 `gap-2.5`·`px-3`·`h-10 w-10` 이 전부 2배로 불어
 *  텍스트 칸이 **57px**(scroll 102)까지 쪼그라들어 'EVENT' 칩 하나도 못 들어갔다(실측).
 *  아이콘 타일·여백은 글자가 아니라 장식이므로 확대를 따라갈 이유가 없다 — 확대되어야 하는 것은
 *  글자다. 글자는 그대로 두고 **틀만 고정**해서 자리를 돌려줬다. */
const ROW_CLS = 'flex w-full items-center gap-[10px] rounded-aura border card-aura px-[12px] py-[10px] text-left transition-colors hover:bg-surface-high/50 active:scale-[0.995]';
const ROW_TILE_CLS = 'flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-input';

const dayLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : `${d.getMonth() + 1}/${d.getDate()}(${DAYS_KO[d.getDay()]})`;
};

export default function HomeTab({
  schedules, loaded, schedulesError, onRetrySchedules, clocksLoaded, regInfoBySchedule,
  onTools, onSelect, onVenue, onExplore, onLive, onEvent, banners = [], onInternalLink,
}: {
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
  regInfoBySchedule: ReadonlyMap<string, RegInfo>;
  onSelect: (s: Schedule) => void;
  onVenue: (venueId: string) => void;
  onExplore: () => void;
  onLive: () => void;
  /** 이벤트 **별도 페이지**로 (오너 2026-09-06: 게시판 안에 넣지 말 것) */
  onEvent: () => void;
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

  // 오늘 열리는 대회 수 — '오늘 안내'에 적는 **사실**. 끝난 대회는 세지 않는다(위와 같은 규칙).
  const todayCount = useMemo(
    () => schedules.filter((s) => s.approved && s.date === today && scheduleStatus(s.date, s.startTime) !== 'ended').length,
    [schedules, today],
  );

  // 추천 대회 — 오늘 이후의 승인된 대회를 부스트 → 시작 순으로. **0개면 레일 자체를 그리지 않는다**
  // (§6-3: 추천 0개면 레일을 생략하고 다음 실제 콘텐츠를 앞당긴다).
  // 같은 포스터의 연속 회차(기간제 게임)는 첫 회차 1장만 — 레일에 동일 카드 도배 방지.
  const rail = useMemo(() => {
    const seenPoster = new Set<string>();
    return schedules
      .filter((s) => s.approved && s.date >= today && scheduleStatus(s.date, s.startTime) !== 'ended')
      .sort((a, b) => Number(b.isPremium) - Number(a.isPremium) || compareByStartThenBoost(a, b))
      .filter((s) => !s.posterUrl || (!seenPoster.has(s.posterUrl) && (seenPoster.add(s.posterUrl), true)))
      .slice(0, RAIL_MAX);
  }, [schedules, today]);

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
  const eventSlide = useMemo<EventSlide | null>(() => {
    // ⚠ '이벤트 링크가 있으면' 이 아니라 '**같은 캠페인**으로 가면' 이다 — 판정 근거는 bannerCoversEvent 주석.
    if (bannerCoversEvent(banners.map((b) => b.linkUrl), event?.slug, eventShown === 'pending')) return null;
    if (eventShown === 'pending') return { title: '이벤트', sub: '불러오는 중…', alt: '이벤트 — 불러오는 중', testId: 'home-event-menu', live: false, pending: true, onClick: onEvent };
    if (eventShown === 'banner' && event) {
      const sub = event.myTickets > 0 ? `참여권 ${event.myTickets}장 · 남은 카드 ${eventRemain}장` : `매장 출석하면 참여권 1장 · 남은 카드 ${eventRemain}장`;
      return { title: event.title, sub, alt: `이벤트 · ${event.title} · ${sub}`, testId: 'home-event-banner', live: true, onClick: onEvent };
    }
    const sub = eventMenuSubtitle(eventLoaded, eventFailed, event, eventState);
    return { title: '매장 이벤트', sub, alt: `매장 이벤트 · ${sub}`, testId: 'home-event-menu', live: false, onClick: onEvent };
  }, [banners, eventShown, event, eventRemain, eventLoaded, eventFailed, eventState, onEvent]);

  useEffect(() => {
    if (!eventLoaded || !esm) return;
    try { localStorage.setItem(EVENT_SEEN, eventState === 'live' ? '1' : '0'); } catch { /* noop */ }
  }, [eventLoaded, esm, eventState]);

  const fmtLeft = (ms: number) => {
    const m = Math.floor(ms / 60_000);
    return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
  };
  if (clocksLoaded) {
    try { localStorage.setItem(OPENNOW_SEEN, String(Math.min(openAll.length, OPEN_NOW_ROWS))); } catch { /* noop */ }
  }
  // 다음 방문의 스켈레톤 행 수 — 같은 기기는 대개 비슷한 줄 수를 본다.
  if (loaded) {
    try { localStorage.setItem(UPCOMING_SEEN, String(Math.min(Math.max(upcoming.length, 1), 8))); } catch { /* noop */ }
  }

  return (
    <div className="pb-section">
      {/* §6-4: 일반 컨테이너 최대 1200px, 좌우 최소 24px. 안쪽 섹션은 공용 px-page-x(17px)를 쓰므로
          md 이상에서 7px 를 더해 24px 를 만든다(index.css·tailwind.config 는 다른 팀 편집 중이라
          토큰을 새로 만들지 않았다 — 필요해지면 page-x-md 토큰을 쓰도록 보고). */}
      <div className="mx-auto w-full max-w-[1200px] md:px-[7px]">
        {/* ── 상단: 오늘 안내 + 배너 ──────────────────────────────────────────
            PC(lg~)는 5:7 두 칸(§6-4). 768~1023 은 **한 열 그대로** 쌓는다 — 중간 폭에서 성급히
            두 칸으로 쪼개면 가운데 열이 눌린다. 좁아지면 DOM 읽기 순서대로 쌓인다. */}
        <div className="lg:grid lg:grid-cols-12 lg:items-center lg:gap-6 lg:pt-4">
          {/* 오늘 안내 — 기본 48~60px(§6-2). 큰 인사말이 아니라 **사실**이다. */}
          <section data-testid="home-today" className="px-page-x pt-1.5 lg:col-span-5 lg:pt-0">
            <a
              href="https://www.nurimind.co.kr" target="_blank" rel="noopener"
              className="inline-flex items-center gap-1 py-1 -my-1 t-desc text-ink-muted transition-colors hover:text-accent-200"
            >
              {/* 오너 지시(2026-08-29): 인사말은 아무 데도 안 데려간다 — 링크인데 갈 이유를 안 준다.
                  날짜는 맥락으로 남기고, 그 자리를 NURI MIND 로 가고 싶게 만드는 문구로. */}
              {now.getMonth() + 1}/{now.getDate()}({DAYS_KO[now.getDay()]}) · 오늘의 운을 점쳐보세요{' '}
              <span className="font-semibold text-accent-300">· NURI MIND ›</span>
            </a>
            {/* §5 역할표: 홈 짧은 제목 18/26(PC 22/30). 수치는 **도착한 것만** 적는다 —
                일정이 안 왔으면 대회 수를, 클락이 안 왔으면 등록 가능 수를 쓰지 않는다. */}
            <p className="mt-0.5 text-[18px] font-bold leading-[26px] text-ink-primary md:text-[22px] md:leading-[30px]">
              {/* ⚠ 여기서 '오늘 대회 0개' 라고 적으면 그것은 **조회 실패를 사실로 위장**하는 것이다(§11).
                  수치는 '도착한 것만' 적는다는 이 줄의 원래 규칙에, 실패도 '미도착' 이라는 사실을 더한다. */}
              {!loaded
                ? <>오늘의 대회를 불러오는 중</>
                : failed
                  ? <>오늘 대회 정보를 불러오지 못했어요</>
                  : <>오늘 대회 <span className="tabular-nums text-accent-300">{todayCount}</span>개</>}
              {loaded && !failed && clocksLoaded && (
                <> · 지금 등록 가능 <span className="tabular-nums stat-emerald">{openAll.length}</span>개</>
              )}
            </p>
          </section>

          {/* 작은 실제 배너 — 하나의 메시지, 하나의 연결(§6-2) */}
          <div className="lg:col-span-7">
            <PosterCarousel
              banners={banners}
              eventSlide={eventSlide}
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

        {/* ── 추천 대회 ────────────────────────────────────────────────────────
            §6-3. 가로 스크롤은 **레일 안에서만** 일어난다 — 레일은 px-page-x 만큼의 안쪽 여백을
            자기 패딩으로 갖고(문서 좌우 여백과 같은 선에서 시작), 넘치는 것은 레일의 overflow-x 다.
            카드 폭 164px + 간격 10px → 390px 에서 2장 + 다음 카드 일부가 보인다(스크롤 가능성 신호). */}
        {rail.length > 0 && (
          <section className="pt-5" data-testid="home-rail">
            <header className="flex items-baseline justify-between px-page-x pb-2.5">
              <h3 className={H3_CLS}>
                추천 대회 <span className="t-desc font-semibold tabular-nums text-ink-muted">{rail.length}</span>
              </h3>
              <button type="button" onClick={onExplore} className={MORE_CLS}>
                전체 일정 <Icon name="chevron-right" size={13} />
              </button>
            </header>
            <ul data-testid="home-rail-track" className="scrollbar-none flex snap-x gap-2.5 overflow-x-auto px-page-x pb-1">
              {rail.map((s) => {
                const badge = railBadge(s, regInfoBySchedule.get(s.id));
                return (
                  <li key={s.id} className="w-[164px] shrink-0 snap-start lg:w-[184px]">
                    {/* 카드 주 동작 = 그 대회의 공식 상세/포스터. 겹치는 보조 버튼을 두지 않는다(§6-3). */}
                    <button type="button" onClick={() => onSelect(s)}
                      className="flex h-full w-full flex-col overflow-hidden rounded-card border card-aura text-left">
                      {/* 포스터 썸네일 — 정보 영역과 **분리**한다. 이미지 위에 글자를 얹지 않는다. */}
                      <span className="relative block h-[78px] w-full shrink-0 overflow-hidden bg-surface-high">
                        {s.posterUrl ? (
                          <img src={thumbUrl(s.posterUrl, 400) ?? s.posterUrl} alt="" loading="lazy" decoding="async"
                            className="h-full w-full object-cover" />
                        ) : (
                          /* 포스터가 없으면 **실제 매장명·날짜**로 만든 간결한 대체 표면 — 장식 이미지를 만들지 않는다. */
                          <span className="flex h-full w-full items-center justify-center px-2 text-center">
                            <span className="line-clamp-2 break-keep t-desc font-bold text-ink-secondary">{s.pubName}</span>
                          </span>
                        )}
                      </span>
                      {/* 정보 영역 — 상태 → 매장명 → 대회명 → 참가비. 줄간격은 §5 역할표. */}
                      <span className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-2.5">
                        {/* ⚠ 상태칩 + 날짜 + 시각을 한 줄에 다 넣었더니 164px 에서 **줄바꿈이 나** 카드가
                            232.6px 로 커졌다(실측). 시각은 매장명 줄로 내린다 — 값은 하나도 안 버렸고
                            카드는 212.4px 로 돌아온다. */}
                        <span className="flex flex-wrap items-center gap-1">
                          <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-badge px-1.5 py-0.5 t-meta font-bold ${badge.cls}`}>{badge.text}</span>
                          <span className="t-meta tabular-nums text-ink-muted">{dayLabel(s.date)}</span>
                        </span>
                        <span className="truncate t-desc text-ink-muted">
                          {s.startTime ? `${s.startTime} · ` : ''}{s.pubName}
                        </span>
                        {/* 대회명은 자르지 않고 두 줄까지 — 어절 유지(break-keep), 긴 영문 한 덩어리는 비상 줄바꿈 */}
                        <span className="line-clamp-2 break-keep text-[13px] font-bold leading-[19px] text-ink-primary">{s.title}</span>
                        {/* §6-3 이 열거한 것만 둔다(상태 → 매장명 → 대회명/참가비). 상금은 바로 아래
                            '오늘·내일 일정' 카드와 상세가 말한다 — 같은 값을 카드마다 겹쳐 쌓지 않는다.
                            참가비는 **줄이지 않는다**: 6자리도 원 단위 전액 그대로다. */}
                        <span className="mt-auto pt-0.5 text-[13px] font-semibold leading-[19px] tabular-nums text-ink-secondary">
                          참가비 {buyInText(s.buyIn?.amount)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

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
          <section className="px-page-x pt-5">
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

        {/* ── 오늘·내일 일정 ─────────────────────────────────────────────────
            ⚠ '오늘·내일 일정'·'전체 일정' 문구는 e2e 셀렉터가 잡는다(click-paths·smoke·perf). 유지. */}
        <section className="px-page-x pt-5">
          <header className="flex items-baseline justify-between pb-2.5">
            <h3 className={H3_CLS}>오늘·내일 일정</h3>
            <button type="button" onClick={onExplore} className={MORE_CLS}>
              전체 일정 <Icon name="chevron-right" size={13} />
            </button>
          </header>
          {!loaded ? (
            <div className="divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura" aria-busy="true">
              {Array.from({ length: upcomingSeenCount() }).map((_, i) => (
                /* min-h: 실제 카드 행과 같은 높이를 예약한다(--card-h-list — 카드가 바뀌면 그 토큰만 고친다). */
                <div key={i} className="flex min-h-[var(--card-h-list)] items-center gap-3 px-3 py-2.5">
                  <div className="skeleton h-16 w-16 shrink-0 rounded-input" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="skeleton h-3.5 w-1/3" />
                    <div className="skeleton h-[19px] w-3/4" />
                    <div className="skeleton h-3.5 w-1/2" />
                    <div className="skeleton h-3.5 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : failed ? (
            /* 세 번째 갈래(§11) — '없음'이 아니라 '못 불러옴'. 카드·문구·재시도 버튼은 일정 탐색과
               같은 정본(LoadErrorCard)을 쓴다. compact: 홈에서는 이 섹션 하나가 화면을 다 먹으면 안 된다. */
            <LoadErrorCard compact error={schedulesError} what="대회 목록" onRetry={onRetrySchedules} />
          ) : upcoming.length === 0 ? (
            <div className="rounded-aura border card-aura px-3 py-4">
              {/* 빈 상태는 **무엇이 없고 지금 무엇을 할 수 있는지**를 말한다 — '오늘·내일'이라는 창이
                  비었을 뿐 전체 일정에는 있을 수 있다는 것이 사용자가 알아야 할 사실이다. */}
              <p className="t-body text-ink-muted">오늘·내일 예정 대회가 아직 없어요. 다음 날짜에는 열려 있을 수 있어요.</p>
              <button type="button" onClick={onExplore}
                className="mt-2 inline-flex items-center gap-1 rounded-badge bg-surface-high px-3 py-2 t-desc font-bold text-ink-secondary transition-colors hover:bg-surface-float/70">
                전체 일정에서 찾아보기 <Icon name="chevron-right" size={13} />
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura">
              {upcoming.map((s, i) => (
                <ScheduleCard key={s.id} mode="list" schedule={s}
                  regInfo={regInfoBySchedule.get(s.id)}
                  onVenueClick={onVenue}
                  onSelect={onSelect}
                  priority={i < 4} />
              ))}
            </div>
          )}
        </section>

        {/* ── GTO 도구 — 홈의 **유일한** GTO 진입 ────────────────────────────
            §6-1: 같은 GTO 설명을 거대한 히어로와 또 다른 대형 카드에서 반복하지 않는다.
            정체성은 유지하되 한 줄이다(목적지 onTools — 예전 히어로·브랜드 슬라이드와 같은 곳). */}
        <div className="px-page-x pt-5">
          <button type="button" onClick={onTools} data-testid="home-gto-entry"
            className={ROW_CLS}>
            <span className={`${ROW_TILE_CLS} tile-grad`} aria-hidden>
              <Icon name="brain" size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate t-title text-ink-primary">GTO 도구</span>
              <span className="mt-0.5 block truncate t-desc text-ink-muted">차트 · 계산기 · 트레이너 · 누리 스팟</span>
            </span>
            <Icon name="chevron-right" size={15} className="shrink-0 text-ink-muted" />
          </button>
        </div>
      </div>
    </div>
  );
}
