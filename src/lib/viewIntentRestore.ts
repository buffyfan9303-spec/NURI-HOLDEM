// src/lib/viewIntentRestore.ts — '지금 보고 있는 화면'을 고르는 규칙과, 돌아왔을 때 무엇을 열지 고르는 규칙.
//
// 왜 App.tsx 밖으로 뺐나 (2026-09-12, §4):
//   이 두 규칙은 **순서가 곧 계약**인데, App 안의 JSX·이펙트에 흩어져 있으면 순서가 깨져도
//   아무 테스트도 실패하지 않는다. 실제로 그렇게 한 번 깨졌다 — 이벤트 페이지의 '로그인하고 참여하기'가
//   `setEventOpen(false)` 를 **먼저** 불러서, 아래 currentViewFor 가 이벤트를 고르기도 전에
//   화면이 `kind:'tab'` 으로 덮였고 로그인 왕복 뒤 홈에 떨어졌다.
//   순수 함수로 내려두면 그 순서를 단위 테스트가 잡는다.
//
// ⚠ 복원은 **'보기'까지다.** 돌려주는 동작에 '고른 카드' 같은 필드를 절대 늘리지 마라 —
//   로그인 직후 카드가 저절로 열리면 그건 사용자가 지시하지 않은 쓰기(참여권 소모)다.
//   그래서 RestoreAction 은 `open` 과 `id` **둘뿐**이고, 그 사실 자체를 테스트가 잠근다.
import type { ViewIntent, ViewKind } from './pendingViewIntent';

/** App 이 들고 있는 '무엇이 떠 있나' 를 그대로 옮긴 값. 화면 순서(위에 있는 것이 이긴다)를 이 타입이 말한다. */
export interface OpenViewState {
  /** 이벤트 별도 페이지(z-60, 가장 위) */
  eventOpen: boolean;
  /** 이벤트 캠페인 slug — 카드 번호가 아니다 */
  eventSlug: string;
  openPostId: string | null;
  openScheduleId: string | null;
  openVenueId: string | null;
  activeTab: string;
}

/**
 * 지금 화면을 한 줄로 요약한다. **위에 떠 있는 것이 이긴다** — 이벤트 페이지가 열려 있으면
 * 그 아래 글·대회가 무엇이든 사용자가 보고 있는 것은 이벤트다.
 */
export function currentViewFor(s: OpenViewState): ViewIntent {
  if (s.eventOpen) return { kind: 'event', id: s.eventSlug };
  if (s.openPostId) return { kind: 'post', id: s.openPostId };
  if (s.openScheduleId) return { kind: 'schedule', id: s.openScheduleId };
  if (s.openVenueId) return { kind: 'venue', id: s.openVenueId };
  return { kind: 'tab', id: s.activeTab };
}

/** 복원할 때 App 이 실제로 할 일. 필드는 둘뿐이다 — 위 ⚠ 참고. */
export interface RestoreAction {
  open: ViewKind;
  id: string;
}

/**
 * 돌아온 뒤 무엇을 열 것인가. 해석할 수 없으면 `null`(아무 일도 하지 않는다).
 * @param isKnownTab 최상위 탭 id 인지 — 없는 탭으로 보내면 빈 화면이 된다.
 */
export function restoreActionFor(intent: ViewIntent | null, isKnownTab: (id: string) => boolean): RestoreAction | null {
  if (!intent) return null;
  if (intent.kind === 'tab' && !isKnownTab(intent.id)) return null;
  return { open: intent.kind, id: intent.id };
}
