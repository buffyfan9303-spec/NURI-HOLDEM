// src/api/venueEvents.ts — 내 매장 **이벤트 개설 신청 · 이벤트 제안**(오너 지시 2026-09-18).
//
// 무엇이 아닌가: 이벤트 자체를 만드는 API 가 아니다. 실제 캠페인(event_campaigns)은 지금도
// 운영자 전용이고 `src/api/adminEvents.ts` 가 다룬다. 여기는 그 **앞에 놓인 신청 대기열**이다.
//   업주가 "이용권 N장 걸고 이런 날짜에 하고 싶다" 또는 "이런 이벤트 어때요" 를 보내고,
//   운영자가 승인/반려한다. 승인은 '하겠다' 표시이고, 개설은 운영자가 기존 화면에서 한다(오너 결정).
//
// ⚠ 권한은 화면이 아니라 서버가 막는다 — 모든 RPC 가 `can_manage_pos`(소유자·승인 공동운영자·운영자)
//   또는 `my_role()='admin'` 을 첫 줄에서 본다. 여기 함수들은 그걸 부르기만 한다.
// ⚠ 마이그레이션: supabase/migrations/20260918e_venue_event_requests.sql
import { supabase, IS_MOCK } from '../lib/supabase';

/** 신청 종류. campaign = 이용권 걸고 개설 신청 / idea = 자유 제안(장수·날짜 없음) */
export type VenueEventKind = 'campaign' | 'idea';
export type VenueEventStatus = 'pending' | 'approved' | 'rejected';

export interface VenueEventRequest {
  id: string;
  kind: VenueEventKind;
  title: string;
  body: string | null;
  voucherCount: number | null;
  desiredStart: string | null;   // 'YYYY-MM-DD'
  desiredEnd: string | null;
  status: VenueEventStatus;
  adminNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface AdminVenueEventRequest extends Omit<VenueEventRequest, 'status' | 'adminNote' | 'decidedAt'> {
  venueId: string;
  venueName: string;
  requester: string;
  /** 그 매장의 잔여 발행 한도 — 운영자가 승인 전에 "한도가 되는가" 를 화면에서 바로 본다. */
  venueQuota: number;
}

/** RPC 가 아직 배포되지 않았는가 — PostgREST 는 없는 함수를 PGRST202 로 돌려준다.
 *  ⚠ 이걸 '실패' 와 같이 취급하면 배포 전 업주 화면에 빨간 오류가 뜬다. 둘은 다른 말이어야 한다. */
const isMissingRpc = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (e.code === 'PGRST202' || /could not find the function|does not exist/i.test(e.message ?? ''));

/* eslint-disable @typescript-eslint/no-explicit-any */
const rowToRequest = (r: any): VenueEventRequest => ({
  id: r.id,
  kind: r.kind,
  title: r.title ?? '',
  body: r.body ?? null,
  voucherCount: r.voucher_count ?? null,
  desiredStart: r.desired_start ?? null,
  desiredEnd: r.desired_end ?? null,
  status: r.status,
  adminNote: r.admin_note ?? null,
  createdAt: r.created_at,
  decidedAt: r.decided_at ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * 업주: 이벤트 개설 신청 또는 제안.
 * @returns 'not-deployed' 면 서버에 RPC 가 아직 없다(오류가 아니라 '준비 중').
 */
export async function requestVenueEvent(venueId: string, input: {
  kind: VenueEventKind;
  title: string;
  body?: string;
  voucherCount?: number;
  desiredStart?: string;
  desiredEnd?: string;
}): Promise<'ok' | 'not-deployed'> {
  if (IS_MOCK) return 'ok';
  const { error } = await supabase.rpc('request_venue_event', {
    p_venue_id: venueId,
    p_kind: input.kind,
    p_title: input.title,
    p_body: input.body ?? null,
    p_voucher_count: input.voucherCount ?? null,
    p_desired_start: input.desiredStart ?? null,
    p_desired_end: input.desiredEnd ?? null,
  });
  if (isMissingRpc(error)) return 'not-deployed';
  if (error) throw new Error(error.message);
  return 'ok';
}

/** 업주: 내 매장의 신청 이력(최근 20건).
 *  ⚠ 실패를 빈 배열로 위장하지 않는다 — '아직 안 보냈다' 와 '못 읽었다' 가 같은 화면이면
 *    업주는 자기 신청이 사라진 줄로 읽는다(HomeBannersCard 가 같은 이유로 같은 규칙을 쓴다). */
export async function myVenueEventRequests(venueId: string): Promise<VenueEventRequest[] | 'not-deployed'> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('my_venue_event_requests', { p_venue_id: venueId });
  if (isMissingRpc(error)) return 'not-deployed';
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToRequest);
}

/** 운영자: 대기 중 신청 전체. */
export async function adminListVenueEventRequests(): Promise<AdminVenueEventRequest[] | 'not-deployed'> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('admin_list_venue_event_requests');
  if (isMissingRpc(error)) return 'not-deployed';
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    venueId: r.venue_id,
    venueName: r.venue_name ?? '(매장)',
    kind: r.kind,
    title: r.title ?? '',
    body: r.body ?? null,
    voucherCount: r.voucher_count ?? null,
    desiredStart: r.desired_start ?? null,
    desiredEnd: r.desired_end ?? null,
    requester: r.requester ?? '',
    venueQuota: Number(r.venue_quota) || 0,
    createdAt: r.created_at,
  }));
}

/**
 * 운영자: 승인 / 반려.
 * @returns 처리 후 그 매장의 잔여 발행 한도(승인이면 차감된 값).
 * ⚠ 한도가 모자라면 서버가 거절한다 — 그 문구를 **그대로** 화면에 보여라.
 *   "잔여 N장 · 필요 M장 — 먼저 한도를 늘려 주세요" 가 다음 행동을 말해 준다.
 */
export async function adminDecideVenueEvent(id: string, approve: boolean, adminNote?: string): Promise<number | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('admin_decide_venue_event', {
    p_id: id, p_approve: approve, p_admin_note: adminNote ?? null,
  });
  if (error) throw new Error(error.message);
  const n = typeof data === 'number' ? data : Number(data);
  return Number.isFinite(n) ? n : null;
}
