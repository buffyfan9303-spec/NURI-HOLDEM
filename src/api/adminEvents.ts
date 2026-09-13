// src/api/adminEvents.ts — 관리자 이벤트 운영(§6, 마이그레이션 20260912c). **운영자 전용**이다.
//
// ⚠ 왜 `events.ts` 가 아니라 별도 모듈인가 (번들 — 실측 근거)
//   `src/App.tsx` 가 `events.ts` 를 **정적 import** 한다(`CARD_EVENT_SLUG`·`isEventSlug`).
//   그래서 events.ts 에 관리자 코드를 얹으면 그 코드가 통째로 **첫 화면 청크**에 들어간다
//   (dist 에서 `admin_list_event_campaigns` 문자열이 엔트리 청크에 박힌 것을 확인).
//   유저의 99%는 모바일이고 관리자 화면을 평생 열지 않는다 — 받을 이유가 없다.
//   이 파일은 `AdminTab`(lazy) 아래에서만 import 되므로 lazy 청크에 남는다.
//   ⚠ 그래서 `events.ts` 가 이 모듈을 **재수출하면 안 된다** — 재수출하는 순간 분리가 사라진다.
//
// ⚠ 이 경로의 RPC 는 마이그레이션 `20260912c_admin_event_ops.sql` 이 운영 DB 에 적용돼야 산다.
//   초안 상태(오너 승인 대기)라 **앱이 먼저 배포되는 창**이 실재한다. 그 창에서 PostgREST 는
//   `PGRST202`(Could not find the function)를 준다.
//   그때 **절대 하지 않는 것**: 빈 배열·0건으로 바꿔치기. 그러면 관리자는 '이벤트가 하나도 없다'
//   고 믿고 새로 만들려다 또 실패한다(§12 "오류를 빈 배열·0원·0건으로 바꾸지 않는다").
//   대신 `EventAdminRpcMissingError` 로 **분리해서** 던져 화면이 '미적용'이라고 말하게 한다.
//   (이용권이 바로 이 순서 문제로 전멸할 뻔한 기록: src/api/voucherRpcFallback.test.ts)
// ⚠ 그리고 **폴백을 만들지 않는다.** 캠페인을 테이블 직접 쓰기로 만들 수 있는 경로는 없고,
//   만들어서도 안 된다 — event_campaigns 에는 insert/update 정책이 하나도 없고(20260906b:84-86)
//   그게 등급 유출·임의 공개를 막는 벽이다.
import { supabase, IS_MOCK } from '../lib/supabase';
import { EVENT_MENU_KEY, getAppSetting, parseEventMenuVisible, setAppSetting } from './settings';

// §8-3 의 **공통 판정 함수**는 `src/lib/eventState.ts` 에 있고 여기서 그대로 재수출한다.
// ⚠ 정의를 그 파일에 둔 이유는 번들이다 — 홈·이벤트 상세(손님 화면)가 같은 판정을 써야 하는데,
//   그 화면들이 `adminEvents` 를 import 하면 관리자 RPC 가 첫 화면 청크로 끌려 들어간다.
//   **손님 화면은 `lib/eventState` 를 직접 import 한다.** 관리자 화면은 여기서 받아 쓴다.
export {
  evaluateEvent, EVENT_STATE_LABEL, eventNow, noteServerTime, isServerTimeKnown,
} from '../lib/eventState';
export type { EventState, EventAvailability, EventStateInput, EventViewer } from '../lib/eventState';
import {
  evaluateEvent, EVENT_STATE_LABEL,
  type EventState, type EventCampaignStatus,
} from '../lib/eventState';

/** RPC 가 아직 서버에 없다 = 마이그레이션 미적용. '데이터 0건' 과 구분하기 위한 전용 오류. */
export class EventAdminRpcMissingError extends Error {
  readonly rpcMissing = true;
  /** 어느 RPC 가 없었는지 — 콘솔·Sentry 단서용. 화면 문구에는 넣지 않는다(내부 식별자 노출 금지). */
  readonly fn: string;
  /** 어느 마이그레이션이 필요한지 — 관리자가 바로 찾을 수 있게 화면 문구에 넣는다(비밀이 아니다). */
  readonly migration: string;
  constructor(fn: string, migration = '20260912c') {
    super(`이벤트 관리 기능이 아직 서버(DB)에 적용되지 않았습니다 — 마이그레이션 ${migration} 적용 후 다시 시도해 주세요.`);
    this.name = 'EventAdminRpcMissingError';
    this.fn = fn;
    this.migration = migration;
  }
}
export const isEventRpcMissing = (e: unknown): e is EventAdminRpcMissingError =>
  !!e && typeof e === 'object' && (e as { rpcMissing?: boolean }).rpcMissing === true;

/** Supabase 가 주는 오류의 모양(전부 optional — 어떤 필드가 올지 보장되지 않는다). */
interface RpcErrorish { message?: string; code?: string; details?: string; hint?: string; status?: number }

/**
 * RPC 실패를 **분류 정보를 잃지 않고** 던진다.
 *
 * ⚠ 예전엔 `new Error(error.message)` 로 감쌌다. 그 한 줄이 `code` 를 버려서
 *   `src/lib/dbError.ts` 의 분류가 통째로 무력화됐다 — `msgOf` 는 `code` 로 가르고
 *   `isDenied` 는 `code==='42501' || status===403` 으로 가른다. 실제 DOM 에
 *   `permission denied for function admin_list_event_campaigns` 가 그려졌고(보안 표준 6번 위반),
 *   42501 인데 '열람 권한이 없습니다' 대신 '불러오지 못했습니다' 가 떴다.
 *   그래서 Error 를 유지하되(곳곳의 `instanceof Error`·Sentry 가 기대한다)
 *   `code`·`details`·`hint`·`status` 를 **그대로 실어** 보낸다.
 */
export class EventRpcError extends Error {
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;
  readonly status?: number;
  constructor(e: RpcErrorish) {
    super(e.message ?? '요청을 처리하지 못했습니다');
    this.name = 'EventRpcError';
    this.code = e.code;
    this.details = e.details;
    this.hint = e.hint;
    this.status = e.status;
  }
}

/** PostgREST 오류 하나를 '함수 없음' / 그 밖으로 가른다. 메시지 정규식은 auth.adminWithdrawUser 와 같은 기준. */
function throwRpc(fn: string, error: RpcErrorish, migration?: string): never {
  if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message ?? '')) {
    throw new EventAdminRpcMissingError(fn, migration);
  }
  throw new EventRpcError(error);
}

export type { EventCampaignStatus } from '../lib/eventState';

/** 관리자 목록 한 줄 — **집계만** 온다. 자리별 등급(어느 번호가 당첨인지)은 어떤 필드로도 오지 않는다. */
export interface AdminEventCampaign {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: EventCampaignStatus;
  /**
   * 숨긴 시각(공개 여부). **lifecycle 과 별도 축이다** — 숨겨도 status 는 'live' 그대로라
   * 다시 공개할 때 카드 재편집이 풀리지 않는다.
   * ⚠ `undefined` = 20260912d 미적용이라 서버가 이 값을 안 보낸다. 그때는 '공개' 로 읽는다.
   */
  hiddenAt?: string | null;
  hiddenReason?: string | null;
  createdAt: string;
  startsAt: string | null;
  endsAt: string | null;
  venueId: string;
  venueName: string | null;
  ticketVenueId: string | null;
  ticketVenueName: string | null;
  voucherTitle: string;
  voucherExpiresAt: string | null;
  issuedBy: string | null;
  issuedByName: string | null;
  venueQuota: number;
  venueApproved: boolean;
  totalCards: number;
  openedCards: number;
  remainCards: number;
  prizeCards: number;
  remainPrizeCards: number;
  totalVouchers: number;
  wonVouchers: number;
  ticketsIssued: number;
  ticketsUsed: number;
  vouchersIssued: number;
  vouchersUsed: number;
}

/** 화면에 쓰는 파생 상태 — **판정은 `evaluateEvent` 하나뿐이다.** 이 이름은 기존 호출부 호환용 별칭이다. */
export type EventPhase = EventState;
/**
 * 관리자 한 줄의 파생 상태.
 * ⚠ 두 벌로 두지 않는다 — 홈·상세와 같은 함수를 부른다. 다르면 관리자가 보는 상태와
 *   손님이 보는 상태가 갈리고, 그게 "공개했는데 안 보인다" 의 원인이 된다.
 */
export function eventPhase(c: AdminEventCampaign, now: number = Date.now()): EventPhase {
  return evaluateEvent(c, now).state;
}
export const EVENT_PHASE_LABEL: Record<EventPhase, string> = EVENT_STATE_LABEL;

/** 관리자 목록에서 고를 수 있는 상태 — 'unknown' 은 필터로 쓰지 않는다(데이터가 아니라 판정 실패다). */
export const ADMIN_EVENT_STATES: EventState[] =
  ['draft', 'scheduled', 'live', 'hidden', 'expired', 'soldout', 'ended'];

export async function adminListEventCampaigns(): Promise<AdminEventCampaign[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('admin_list_event_campaigns');
  if (error) throwRpc('admin_list_event_campaigns', error);
  return (data as AdminEventCampaign[] | null) ?? [];
}

export interface EventDraftInput {
  venueId: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  /** null = 모든 매장 출석에 참여권. 서버가 그런 캠페인의 중복 활성화를 거절한다. */
  ticketVenueId?: string | null;
  voucherTitle: string;
  voucherExpiresAt?: string | null;
}

/** 초안 생성. ⚠ **발급 주체를 보내지 않는다** — 서버가 auth.uid() 로 유도한다(§6 초안). */
export async function adminCreateEventCampaign(i: EventDraftInput): Promise<{ id: string; slug: string }> {
  const { data, error } = await supabase.rpc('admin_create_event_campaign', {
    p_venue_id: i.venueId,
    p_slug: i.slug,
    p_title: i.title,
    p_subtitle: i.subtitle ?? null,
    p_starts_at: i.startsAt ?? null,
    p_ends_at: i.endsAt ?? null,
    p_ticket_venue_id: i.ticketVenueId ?? null,
    p_voucher_title: i.voucherTitle,
    p_voucher_expires_at: i.voucherExpiresAt ?? null,
  });
  if (error) throwRpc('admin_create_event_campaign', error);
  return data as { id: string; slug: string };
}

/** 등급 한 줄 — 카드 수와 그 등급이 주는 이용권 장수. **자리 배치는 보내지 않는다.** */
export interface EventTierSpec { tier: 1 | 2 | 3 | 4; cards: number; vouchers: number }

/** 카드판 구성 — 수량만 보내고 **자리 배치(셔플)는 서버가 만든다.**
 *  클라이언트가 배치를 정하면 만든 사람이 당첨 자리를 알게 된다. */
export async function adminComposeEventCards(
  campaignId: string, total: number, tiers: EventTierSpec[],
): Promise<{ totalCards: number; prizeCards: number; totalVouchers: number }> {
  const { data, error } = await supabase.rpc('admin_compose_event_cards', {
    p_campaign_id: campaignId, p_total: total, p_tiers: tiers,
  });
  if (error) throwRpc('admin_compose_event_cards', error);
  return data as { totalCards: number; prizeCards: number; totalVouchers: number };
}

export interface EventProblem { code: string; field: string; message: string }
export interface EventValidation {
  ok: boolean;
  problems: EventProblem[];
  summary: {
    status: EventCampaignStatus; slug: string; title: string;
    totalCards: number; prizeCards: number; totalVouchers: number;
    venueQuota: number; venueApproved: boolean;
  };
}

export async function adminValidateEventCampaign(campaignId: string): Promise<EventValidation> {
  const { data, error } = await supabase.rpc('admin_validate_event_campaign', { p_campaign_id: campaignId });
  if (error) throwRpc('admin_validate_event_campaign', error);
  return data as EventValidation;
}

/** 공개(draft → live). ⚠ 서버가 **잠금 안에서 검증을 다시** 돈다 — 화면의 '검증 통과'는 약속이 아니다. */
export async function adminPublishEventCampaign(campaignId: string): Promise<{ slug: string }> {
  const { data, error } = await supabase.rpc('admin_publish_event_campaign', { p_campaign_id: campaignId });
  if (error) throwRpc('admin_publish_event_campaign', error);
  return data as { slug: string };
}

/** 종료. 카드·참여권·발급 이용권·감사 이력은 그대로 남는다(지우는 경로는 서버에 없다). */
export async function adminEndEventCampaign(campaignId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_end_event_campaign', {
    p_campaign_id: campaignId, p_reason: reason ?? null,
  });
  if (error) throwRpc('admin_end_event_campaign', error);
}

/** 20260912d 가 필요한 경로 — 미적용 창에서 '알 수 없는 실패' 가 아니라 '서버 미적용' 이라고 말하게 한다. */
const VISIBILITY_MIGRATION = '20260912d';

/**
 * 개별 캠페인 **숨기기 / 다시 공개**. lifecycle 은 건드리지 않는다(status 는 'live' 그대로).
 *
 * 숨김의 계약(서버가 지킨다):
 *   · 일반 이용자에게 비공개(event_board 가 null) + **새 참여 일시중지**(카드 열기·참여권 지급 거절)
 *   · 관리자 미리보기 가능 · 이미 받은 이용권·당첨·참여권 이력은 **그대로 보존**
 *
 * ⚠ `live → draft` 로 구현하지 않는다. 그러면 공개했던 판의 카드 배치가 다시 편집 가능해진다.
 */
export async function adminSetEventCampaignHidden(
  campaignId: string, hidden: boolean, reason?: string,
): Promise<{ hidden: boolean; hiddenAt: string | null }> {
  const { data, error } = await supabase.rpc('admin_set_event_campaign_hidden', {
    p_campaign_id: campaignId, p_hidden: hidden, p_reason: reason ?? null,
  });
  if (error) throwRpc('admin_set_event_campaign_hidden', error, VISIBILITY_MIGRATION);
  const r = (data ?? {}) as { hidden?: boolean; hiddenAt?: string | null };
  return { hidden: r.hidden ?? hidden, hiddenAt: r.hiddenAt ?? null };
}

/** 이 목록 응답이 공개 여부를 싣고 있는가 = 20260912d 가 적용됐는가. 모르면 화면이 '확인 불가'라고 말한다. */
export const rowsReportVisibility = (rows: AdminEventCampaign[]): boolean =>
  rows.length === 0 || rows.some((r) => r.hiddenAt !== undefined);

// ── 사이트 이벤트 메뉴 표시(app_settings 재사용) ──────────────────────────────
export { EVENT_MENU_KEY, parseEventMenuVisible, loadEventMenuVisibility } from './settings';

/**
 * 메뉴 표시 저장. **서버가 성공한 뒤 실제 저장값을 다시 읽어 돌려준다.**
 *
 * ⚠ 낙관적으로 true/false 를 돌려주지 않는다 — 그러면 다른 관리자가 방금 바꾼 값이 화면에서
 *   내 값으로 덮인 것처럼 보인다. 저장은 되었는데 화면이 거짓말을 하는 상태가 가장 나쁘다.
 * ⚠ 저장 실패는 **던진다**. 호출부는 성공 표시를 `await` 뒤에만 해야 한다.
 */
export async function saveEventMenuVisible(next: boolean): Promise<boolean> {
  await setAppSetting(EVENT_MENU_KEY, next ? 'on' : 'off');
  return parseEventMenuVisible(await getAppSetting(EVENT_MENU_KEY));
}

/** 초안 삭제 — 개봉·참여권·발급 이용권 이력이 **하나도 없을 때만** 서버가 허용한다. */
export async function adminDeleteEventDraft(campaignId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_event_draft', { p_campaign_id: campaignId });
  if (error) throwRpc('admin_delete_event_draft', error);
}

/** 다음 회차 — **설정만** 복사한다.
 *  ⚠ 카드 배치·당첨자·참여권·이용권·실적은 복사하지 않는다(§6 상태·복사). 그래서 이 함수는
 *    '새 초안을 만드는 입력값' 만 만들어 돌려주고, 실제 생성은 관리자가 확인 후 누른다(자동 공개 없음). */
export function nextRoundDraft(c: AdminEventCampaign, slug: string): EventDraftInput {
  return {
    venueId: c.venueId,
    slug,
    title: c.title,
    subtitle: c.subtitle,
    startsAt: null,
    endsAt: null,
    ticketVenueId: c.ticketVenueId,
    voucherTitle: c.voucherTitle,
    voucherExpiresAt: null,
  };
}

/** 공개 화면 공유 링크 — 캠페인별. `?event=<slug>` 는 §4 가 만든 계약 그대로다. */
export const eventShareUrl = (slug: string): string =>
  `${typeof location !== 'undefined' ? location.origin : ''}/?event=${encodeURIComponent(slug)}`;
