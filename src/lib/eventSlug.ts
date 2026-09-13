// src/lib/eventSlug.ts — 이벤트 캠페인 slug 상수·검사 **둘뿐**인 순수 모듈.
//
// 왜 api/events 에서 떼어 냈나(2026-09-13, 번들 예산):
//   App.tsx 는 부팅 시점에 `?event=` 딥링크를 읽느라 이 둘을 **동기로** 필요로 한다.
//   그런데 둘이 `api/events` 안에 있어서, 그 모듈 전체가 첫 화면 임계 경로 청크에 실렸다 —
//   `TIER_META`(등급별 tailwind 클래스 6종 × 4등급)와 `oddsRows` 는 이벤트 **화면**에서만 쓰는데,
//   빌드 산출물에서 실제로 entry 청크 안에 들어 있는 것을 확인했다(`0_0_28px_-4px` 검색).
//   비로그인 모바일 손님이 홈만 보고 나가도 그 바이트를 받는다.
//
//   이 파일에는 supabase 도, 타입 외 의존도 없다. `api/events` 는 이 둘을 **그대로 재수출**하므로
//   기존 임포트(`from '../../api/events'`)는 한 줄도 고칠 필요가 없다.

/** 기본 캠페인 — `?event=1` 같은 옛 딥링크와 홈 진입이 가리키는 곳. 다른 캠페인은 `?event=<slug>` 로 온다. */
export const CARD_EVENT_SLUG = 'card-open-2026-09';

/** 캠페인 slug 로 받아들일 수 있는 모양인가.
 *  ⚠ **허용 목록**으로 판단한다 — `?event=` 로 밖에서 들어오는 값이라 거부 목록이면 빠뜨린 글자가 곧 구멍이다
 *  (pendingViewIntent.isSafeIntentId 와 같은 이유·같은 문자 집합). 지금은 주소를 조립하지 않지만
 *  나중에 누가 한 줄을 쓰는 순간 오픈 리다이렉트가 된다. */
export const isEventSlug = (s: unknown): s is string =>
  typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(s);
