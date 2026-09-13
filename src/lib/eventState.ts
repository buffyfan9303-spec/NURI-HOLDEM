// src/lib/eventState.ts — 이벤트 한 판의 **상태와 참여 가능 여부**를 정하는 단 하나의 함수.
//
// 왜 별도 파일인가 (번들 — 실측 근거)
//   지시는 "판정 함수를 `adminEvents.ts` 에 둬라" 였고 `adminEvents.ts` 가 **그대로 재수출**한다.
//   다만 정의 자체는 여기 둔다: `adminEvents.ts` 는 `lib/supabase` 와 관리자 RPC 이름 8개를 끌고 오는데,
//   이 판정은 **홈·이벤트 상세(비로그인 손님 화면)** 도 써야 한다. 손님 화면이 `adminEvents` 를 import 하는 순간
//   관리자 코드가 통째로 첫 화면 청크로 들어간다(그 사고가 실제로 났고, 분리로 254.6 → 253.7KB gz 였다).
//   그래서 **이 파일에는 import 가 하나도 없다** — 순수 함수만 둔다.
//
// 새 상태 엔진이 아니다. 저장 상태는 여전히 3개(`draft|live|ended`)이고 공개 여부는 값 하나(`hiddenAt`)다.
// 여기서 만드는 것은 **화면용 파생 상태**뿐이다.
//
// ⚠ 최종 판정은 서버다. 이 함수는 '버튼을 살릴지' 만 정한다 — 서버 RPC(open_event_card)가
//   공개·기간·재고·참여권을 잠금 안에서 다시 본다. 화면의 canJoin 은 약속이 아니라 **안내**다.

/** 저장 상태 — DB `event_campaigns.status` 그대로. 여기에 '숨김' 은 없다(공개 여부는 별도 축이다). */
export type EventCampaignStatus = 'draft' | 'live' | 'ended';

/**
 * 화면용 파생 상태. 문서 §8-3 이 요구한 7가지를 **구분**한다.
 * `unknown` 은 '로딩 중이거나 날짜가 이상함' — 둘 다 **참여 불가**로 다룬다.
 */
export type EventState =
  | 'unknown' | 'draft' | 'scheduled' | 'live' | 'hidden' | 'expired' | 'soldout' | 'ended';

/** 쉬운 한국어(§9) — '오픈/라이브/퍼블리시' 를 쓰지 않는다. */
export const EVENT_STATE_LABEL: Record<EventState, string> = {
  unknown: '확인 중',
  draft: '준비 중',
  scheduled: '시작 전',
  live: '진행 중',
  hidden: '숨김',
  expired: '기간 종료',
  soldout: '카드 소진',
  // ⚠ '종료' 그대로 둔다 — `e2e/admin-event-ops.spec.ts` 가 이 배지를 `exact: true` 로 잡는다.
  //   관리자 **동작** 이름은 §9 대로 '행사 종료' 이고(버튼), 이건 **상태** 이름이다.
  ended: '종료',
};

export interface EventStateInput {
  status?: EventCampaignStatus | string | null;
  /**
   * 숨긴 시각. `null` = 공개. `undefined` = **서버가 이 값을 아직 모른다**
   * (마이그레이션 20260912d 미적용). 모르는 것을 '숨김' 으로 읽지 않는다 — 공개로 본다.
   */
  hiddenAt?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  /** 아직 열리지 않은 카드 수. `totalCards>0 && remainCards===0` 이면 소진이다. */
  remainCards?: number | null;
  totalCards?: number | null;
}

/** 보는 사람 조건 — 넘기지 않으면 **캠페인 수준만** 판정한다(화면마다 다른 값을 만들지 않기 위해). */
export interface EventViewer {
  signedIn?: boolean;
  /** 남은 참여권 장수 */
  tickets?: number;
  /** 관리자 미리보기인가 — 숨김 판을 볼 수는 있지만 **참여는 여전히 막는다**. */
  isAdmin?: boolean;
}

export interface EventAvailability {
  state: EventState;
  /** 표시명 — 홈·관리자·상세가 같은 글자를 쓴다. */
  label: string;
  /** 참여 버튼을 살릴지. **false 면 활성 버튼을 그리지 않는다**(눌러 보고 RPC 오류로 설명하지 않는다). */
  canJoin: boolean;
  /** 참여할 수 없는 이유 한 문장. 참여 가능하면 빈 문자열. */
  blockedReason: string;
  /** 일반 이용자에게 보이는가. 숨김·초안은 false. */
  publiclyVisible: boolean;
  /** 관리자만 볼 수 있는 상태인가(숨김·초안). */
  adminPreviewOnly: boolean;
  /** 다음에 상태가 바뀌는 시각(ms). 열린 화면이 이 시각에 스스로 다시 판정하면 된다. 없으면 null. */
  nextBoundaryMs: number | null;
}

/** ISO → ms. 빈 값은 null, **깨진 값은 NaN**(호출부가 '모름' 으로 다루게 구분한다). */
function parseAt(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  return Date.parse(v);
}

const unknownResult = (reason: string): EventAvailability => ({
  state: 'unknown',
  label: EVENT_STATE_LABEL.unknown,
  canJoin: false,
  blockedReason: reason,
  publiclyVisible: false,
  adminPreviewOnly: false,
  nextBoundaryMs: null,
});

/**
 * **단일 판정 함수.** 홈·관리자·이벤트 상세가 전부 이걸 부른다.
 *
 * 경계는 서버(open_event_card)와 맞춘다 — **시작 시각 포함, 종료 시각 미포함**.
 * `nowMs` 는 호출부가 넘긴다(테스트 가능 + 서버 시계 보정을 쓰기 위해 — `eventNow()` 참고).
 */
export function evaluateEvent(
  c: EventStateInput | null | undefined,
  nowMs: number,
  viewer?: EventViewer,
): EventAvailability {
  if (!c) return unknownResult('이벤트 정보를 불러오는 중입니다');
  if (!Number.isFinite(nowMs)) return unknownResult('현재 시각을 확인할 수 없어 참여할 수 없습니다');

  const status = c.status;
  if (status !== 'draft' && status !== 'live' && status !== 'ended') {
    return unknownResult('이벤트 상태를 확인할 수 없어 참여할 수 없습니다');
  }

  const start = parseAt(c.startsAt);
  const end = parseAt(c.endsAt);
  // 잘못된 날짜는 '제한 없음' 이 아니다 — 참여 불가다(그대로 두면 끝난 행사가 영원히 열린다).
  if ((start !== null && Number.isNaN(start)) || (end !== null && Number.isNaN(end))) {
    return unknownResult('이벤트 기간 정보가 올바르지 않아 참여할 수 없습니다');
  }
  if (start !== null && end !== null && start >= end) {
    return unknownResult('이벤트 기간 정보가 올바르지 않아 참여할 수 없습니다');
  }

  // 다음 경계 — 시작 전이면 시작, 진행 중이면 종료.
  const nextBoundaryMs =
    start !== null && nowMs < start ? start : end !== null && nowMs < end ? end : null;

  const make = (
    state: EventState,
    blockedReason: string,
    opts?: { publiclyVisible?: boolean; adminPreviewOnly?: boolean },
  ): EventAvailability => ({
    state,
    label: EVENT_STATE_LABEL[state],
    canJoin: blockedReason === '',
    blockedReason,
    publiclyVisible: opts?.publiclyVisible ?? true,
    adminPreviewOnly: opts?.adminPreviewOnly ?? false,
    nextBoundaryMs,
  });

  if (status === 'draft') {
    return make('draft', '아직 공개되지 않은 이벤트입니다', { publiclyVisible: false, adminPreviewOnly: true });
  }
  if (status === 'ended') {
    return make('ended', '종료된 행사입니다. 받으신 이용권과 사용 이력은 그대로 남아 있습니다');
  }

  // 숨김은 lifecycle 과 **별도 축**이다 — 저장 상태는 'live' 그대로고 공개 여부만 닫혀 있다.
  // `undefined`(서버가 모름 = 마이그레이션 미적용)를 숨김으로 읽지 않는다.
  if (c.hiddenAt != null) {
    return make('hidden', '지금은 참여할 수 없는 이벤트입니다', { publiclyVisible: false, adminPreviewOnly: true });
  }

  if (start !== null && nowMs < start) return make('scheduled', '아직 시작하지 않은 이벤트입니다');
  if (end !== null && nowMs >= end) return make('expired', '이벤트 기간이 끝났습니다');

  const total = c.totalCards ?? null;
  const remain = c.remainCards ?? null;
  if (total != null && total > 0 && remain != null && remain <= 0) {
    return make('soldout', '카드가 모두 소진되었습니다');
  }

  // 여기까지 왔으면 캠페인은 열려 있다. 남은 것은 보는 사람 조건이다.
  if (viewer?.signedIn === false) return make('live', '로그인 후 참여할 수 있습니다');
  if (viewer?.tickets != null && viewer.tickets <= 0) {
    return make('live', '참여권이 없습니다 — 매장 출석 QR을 찍으면 1장 지급됩니다');
  }
  return make('live', '');
}

// ── 서버 시계 보정 ───────────────────────────────────────────────────────────
// 기기 시계는 틀릴 수 있다(직접 돌려 놓은 기기도 있다). 서버가 준 타임스탬프를 한 번이라도 보면
// 그 차이를 기억해 `eventNow()` 가 **서버 기준 현재 시각**을 돌려준다.
// ⚠ 이것도 보정일 뿐이다 — 발급 권한의 최종 판정은 서버 RPC 다.
let offsetMs = 0;
let offsetKnown = false;

/**
 * 받아들일 수 있는 시계 오차의 절대 상한(±24h).
 *
 * ⚠ '음수 거절' 로 만들면 안 된다 — 기기 시계가 **빠른** 경우(서버가 과거를 말한다)가 정상적인
 *   보정 대상이고, 실제로 그 케이스를 `eventVisibility.test.ts` 가 잠그고 있다(-3h).
 *   여기서 거르려는 것은 부호가 아니라 **'지금' 이 아닌 값**이다:
 *   2026-09-13 실사고 — 관리자 목록(`created_at desc`)의 첫 줄 생성 시각을 '서버의 지금' 으로
 *   먹여 화면의 '지금' 이 캠페인의 나이만큼 뒤로 밀렸다. 그런 값은 보통 하루를 훌쩍 넘는다.
 *   합리적인 기기 시계 오차(시간대 설정 실수·NTP 미동기)는 24시간을 넘지 않는다.
 */
export const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * 서버가 준 **'지금'** 을 기준으로 이 기기의 시계 오차를 기록한다.
 *
 * ⚠ 넣어도 되는 값은 **서버가 현재 시각이라고 말한 것**뿐이다(응답 `Date` 헤더, RPC 가 함께 싣는 `now()`).
 *   행 데이터의 타임스탬프(`created_at`·`starts_at`…)를 넣지 마라 — 그건 '지금' 이 아니라 과거다.
 * 깨진 값과 상한 밖 값은 **무시한다**(직전 보정을 망가뜨리지 않는다).
 */
export function noteServerTime(at: string | number | null | undefined): void {
  const t = typeof at === 'number' ? at : parseAt(at ?? null);
  if (t == null || !Number.isFinite(t)) return;
  const next = t - Date.now();
  if (Math.abs(next) > MAX_CLOCK_SKEW_MS) return;
  offsetMs = next;
  offsetKnown = true;
}

/** 서버 기준 현재 시각(ms). 서버 시각을 아직 못 봤으면 기기 시계 그대로. */
export function eventNow(): number {
  return Date.now() + offsetMs;
}

/** 서버 시각을 한 번이라도 봤는가 — 화면이 '기기 시계 기준' 임을 알려야 할 때 쓴다. */
export function isServerTimeKnown(): boolean {
  return offsetKnown;
}

/** @internal 테스트 전용 — 보정값 초기화. */
export function resetServerTimeOffset(): void {
  offsetMs = 0;
  offsetKnown = false;
}
