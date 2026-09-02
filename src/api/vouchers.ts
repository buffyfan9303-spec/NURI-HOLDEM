// src/api/vouchers.ts — 매장이용권(store_vouchers). 모든 변경은 SECURITY DEFINER RPC로만.
//
// ⚠ 킬스위치(2026-08-29, app_settings.identity_voucher_enabled — src/lib/identityFlag.ts)
//   본인인증과 한 스위치로 묶여 있고 기본값은 **비활성화**다. 화면 진입점은 전부 그 플래그로 숨겼고,
//   여기서는 **상태를 만들거나 소비하는 4개 경로**(발급·사용 3종)만 한 번 더 막는다.
//   왜 읽기는 안 막나: 조회를 막으면 다시 켰을 때 '빈 지갑'이 잠깐 보인다 — 데이터는 늘 사실대로.
//   ⚠ 삭제가 아니라 비활성화다. RPC·트리거·기존 레코드는 전부 그대로 살아 있다.
//
// ⚠ 이용권은 **매장마다 개별**이다(오너 지시 #4, 2026-08-29). 서버의 사용 경로 3개
//   (redeem_my_voucher / _by_qr / _by_phone)가 모두 `used_venue_id := venue_id` 로 고정하므로
//   usedVenueId 는 구조적으로 venueId 와 같다. '어느 매장에서 썼나'는 물음 자체가 성립하지 않는다 —
//   화면은 발급 매장(venueName)만 말한다. 필드 자체는 스키마 보존을 위해 남겨 둔다.
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';
import { makeSearchCache } from '../lib/searchCache';
import { identityEnabled } from '../lib/identityFlag';

/** 킬스위치 OFF 에서 상태를 바꾸려는 시도를 막는다 — 놓친 진입점이 조용히 발급하는 일이 없게. */
function assertVoucherOn(): void {
  if (!identityEnabled()) throw new Error('매장이용권이 현재 비활성화되어 있습니다. 본인인증 준비가 끝나면 다시 열립니다');
}

export interface Voucher {
  id: string; venueId: string; venueName: string | null; issuedBy: string;
  holderUserId: string | null; holderName: string | null;
  title: string; status: string;
  usedVenueId: string | null; usedVenueName: string | null; usedAt: string | null; createdAt: string;
  /** 유효기간(없으면 무기한) — 만료 시 사용 RPC 가 서버에서 거부한다 */
  expiresAt: string | null;
}
export interface VoucherUsage { usedVenueId: string | null; venueName: string | null; usedCount: number }
export interface VisitedVenue { venueId: string; venueName: string | null; visits: number }
export interface PlayHistory { venueId: string; venueName: string | null; moneyinCount: number; totalAmount: number; lastAt: string | null }
export interface TransferTarget { id: string; display: string; verified?: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Voucher {
  return {
    id: r.id, venueId: r.venue_id, venueName: r.venue?.name ?? null, issuedBy: r.issued_by,
    holderUserId: r.holder_user_id ?? null, holderName: r.holder_name ?? null,
    title: r.title, status: r.status ?? 'active',
    usedVenueId: r.used_venue_id ?? null, usedVenueName: r.used_venue?.name ?? null,
    usedAt: r.used_at ?? null, createdAt: r.created_at,
    expiresAt: r.expires_at ?? null,
  };
}

/** 발행 매장 기준 전체 이용권 (업주·인증직원 열람) */
export async function listVenueVouchers(venueId: string): Promise<Voucher[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('store_vouchers')
    .select('*, venue:venue_id(name), used_venue:used_venue_id(name)')
    .eq('venue_id', venueId).order('created_at', { ascending: false });
  return (data ?? []).map(mapRow);
}

/** 발행 매장 이용권 실시간 구독 — 사용/발급/회수 시 즉시 반영(RLS로 권한 자동 게이트). */
export function subscribeVenueVouchers(venueId: string, onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase
    .channel(`store_vouchers_${venueId}_${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_vouchers', filter: `venue_id=eq.${venueId}` }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/** 내가 보유한 이용권의 발급 매장명 — venues 의 RLS(approved 게이트)를 우회해 보유자에게만 이름을 돌려준다.
 *  (20260830i_my_voucher_venues.sql · SECURITY DEFINER) */
export async function myVoucherVenues(): Promise<Map<string, string>> {
  if (IS_MOCK) return new Map();
  const { data, error } = await supabase.rpc('my_voucher_venues');
  if (error) return new Map(); // 구 DB(RPC 미배포) — 임베드로 얻은 이름만 쓴다
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Map((data ?? []).map((r: any) => [r.venue_id as string, (r.venue_name as string) ?? '']));
}

/** 내가 보유한 이용권 (손님) */
export async function listMyVouchers(): Promise<Voucher[]> {
  if (IS_MOCK) return [];
  const uid = (await currentUser())?.id;
  if (!uid) return [];
  const { data } = await supabase.from('store_vouchers')
    .select('*, venue:venue_id(name), used_venue:used_venue_id(name)')
    .eq('holder_user_id', uid).order('created_at', { ascending: false });
  const rows = (data ?? []).map(mapRow);
  // 매장명 보강 — venues_select 는 `approved = true or owner or admin` 이라
  // **미승인 매장이 발급한 이용권**은 위 임베드에서 venue 가 통째로 null 로 온다(2026-08-30 기준 미승인 2곳 실재).
  // '어느 매장이 준 것인가'(오너 지시 #19)가 그 경우에만 조용히 사라지므로, 빈 이름이 있을 때만 한 번 더 묻는다.
  // 왜 조건부인가: 정상 경로(승인 매장)에서는 왕복이 0회 — 지갑 진입 비용을 늘리지 않는다.
  if (rows.some((v) => !v.venueName)) {
    const names = await myVoucherVenues();
    if (names.size > 0) {
      for (const v of rows) {
        if (!v.venueName) v.venueName = names.get(v.venueId) ?? null;
        if (!v.usedVenueName && v.usedVenueId) v.usedVenueName = names.get(v.usedVenueId) ?? null;
      }
    }
  }
  return rows;
}

/** 시상 멱등 키 조회 — note 에 AWARD:{date}:{event}:{nick} 마커가 있는 발급분(중복 발급 차단용) */
export async function listVoucherNotes(venueId: string, noteLike: string): Promise<string[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('store_vouchers')
    .select('note').eq('venue_id', venueId).like('note', `%${noteLike}%`).limit(500);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => (r.note as string) ?? '').filter(Boolean);
}

export async function issueVoucher(venueId: string, input: { title: string; count?: number; holderName?: string; holderUserId?: string; note?: string; expiresAt?: string | null }): Promise<void> {
  if (IS_MOCK) return;
  assertVoucherOn();
  const { error } = await supabase.rpc('issue_voucher', {
    p_venue_id: venueId, p_title: input.title, p_count: input.count ?? 1,
    p_holder_name: input.holderName ?? null, p_holder_user_id: input.holderUserId ?? null, p_note: input.note ?? null,
    p_expires_at: input.expiresAt ?? null,
  });
  if (error) throw new Error(error.message);
}

// 발급 승인(운영자) 여부 / 토글
export async function isVoucherIssueApproved(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data } = await supabase.rpc('voucher_issue_approved', { p_venue_id: venueId });
  return data === true;
}
export async function setVoucherIssueApproval(venueId: string, approved: boolean): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_voucher_issue_approval', { p_venue_id: venueId, p_approved: approved });
  if (error) throw new Error(error.message);
}

// 적립: 장부 바인 시 손님에게 이용권 발급(닉네임>실명>이름 매칭). 발급 수 반환.
export async function accrueVoucher(venueId: string, playerName: string, count: number): Promise<number> {
  if (IS_MOCK) return 0;
  const { data, error } = await supabase.rpc('accrue_voucher', { p_venue_id: venueId, p_player_name: playerName, p_count: count });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export async function redeemVoucher(voucherId: string, usedVenueId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('redeem_voucher', { p_voucher_id: voucherId, p_used_venue_id: usedVenueId });
  if (error) throw new Error(error.message);
}

/** 회수 — 미사용(active) 이용권만. 이미 사용·회수된 건은 서버가 사유를 들고 거절한다
 *  (2026-08-29 이전엔 조용히 0행 UPDATE 라 화면엔 성공으로 보였다). */
export async function revokeVoucher(voucherId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('revoke_voucher', { p_voucher_id: voucherId });
  if (error) throw new Error(error.message);
}

/** 삭제 — 행 자체를 지운다. 사용 완료분은 서버가 거절한다(손님 사용 내역·장부 연동 보존). */
export async function deleteVoucher(voucherId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('delete_voucher', { p_voucher_id: voucherId });
  if (error) throw new Error(error.message);
}

/**
 * 여러 장 일괄 처리 결과 — 성공 수 + 실패 사유(중복 제거).
 *
 * 왜 필요한가: 이용권은 '한 사람에게 N장'이 기본 단위라 회수·삭제도 늘 배치다.
 *   기존 삭제는 `Promise.all(ids.map(id => deleteVoucher(id).catch(() => {})))` 뒤에
 *   무조건 '삭제했습니다'를 띄웠다 — 권한·상태 때문에 한 장도 안 지워져도 성공으로 보였다.
 *   실패를 세고 사유를 그대로 들고 나와야 사장님이 다음 행동을 정할 수 있다.
 * 왜 순차인가: 같은 매장 행을 동시에 건드리면 서버가 잠금 경합을 겪고, 무엇보다
 *   실패 사유가 뒤섞여 순서를 잃는다. 배치 크기가 수십 장이라 순차로 충분하다.
 */
export interface BulkResult { ok: number; failed: number; reasons: string[] }
async function bulk(ids: string[], fn: (id: string) => Promise<void>): Promise<BulkResult> {
  let ok = 0; const reasons: string[] = [];
  for (const id of ids) {
    try { await fn(id); ok += 1; }
    catch (e) {
      const m = e instanceof Error ? e.message : '알 수 없는 오류';
      if (!reasons.includes(m)) reasons.push(m);
    }
  }
  return { ok, failed: ids.length - ok, reasons };
}
/**
 * 일괄 회수 — 서버 RPC 한 번. 손님에게 가는 '회수되었습니다' 알림도 한 통으로 묶인다.
 * (단건 루프로 돌리면 3장 회수에 알림이 3건 갔다 — 2026-08-29 브라우저 관통 실측)
 * RPC 미배포 DB(구버전)에서는 단건 루프로 폴백한다 — saveVenueRankings 와 같은 방식.
 */
export async function revokeVouchers(ids: string[]): Promise<BulkResult> {
  if (IS_MOCK || ids.length === 0) return { ok: 0, failed: 0, reasons: [] };
  const { data, error } = await supabase.rpc('revoke_vouchers', { p_ids: ids });
  if (error) {
    if (error.code === 'PGRST202') return bulk(ids, revokeVoucher); // 구 DB — 단건 폴백
    return { ok: 0, failed: ids.length, reasons: [error.message] };
  }
  const r = (data ?? {}) as { ok?: number; failed?: number; reasons?: string[] };
  return { ok: Number(r.ok) || 0, failed: Number(r.failed) || 0, reasons: r.reasons ?? [] };
}
/** 일괄 삭제 — 삭제는 알림이 없어 단건 루프로 충분하다(부분 성공 사유만 모은다) */
export const deleteVouchers = (ids: string[]) => bulk(ids, deleteVoucher);

// 회수(사용): 발급 매장 QR 스캔 — 그 매장에서만 사용 가능. 매장명 반환.
export async function redeemMyVoucherByQr(voucherId: string, venueId: string): Promise<string> {
  if (IS_MOCK) return '';
  assertVoucherOn();
  const { data, error } = await supabase.rpc('redeem_my_voucher_by_qr', { p_voucher_id: voucherId, p_venue_id: venueId });
  if (error) throw new Error(error.message);
  return (data as string) ?? '';
}
// 회수(사용): 발급 매장 업주 전화번호로만.
export async function redeemMyVoucherByPhone(voucherId: string, phone: string): Promise<string> {
  if (IS_MOCK) return '';
  assertVoucherOn();
  const { data, error } = await supabase.rpc('redeem_my_voucher_by_phone', { p_voucher_id: voucherId, p_phone: phone });
  if (error) throw new Error(error.message);
  return (data as string) ?? '';
}
// 회수(사용): '전송' 한 번에 발급 매장으로 바로(보유자 본인). 매장명 반환.
export async function redeemMyVoucher(voucherId: string): Promise<string> {
  if (IS_MOCK) return '';
  assertVoucherOn();
  const { data, error } = await supabase.rpc('redeem_my_voucher', { p_voucher_id: voucherId });
  if (error) throw new Error(error.message);
  return (data as string) ?? '';
}

async function rawFindUserForTransfer(nickname: string): Promise<TransferTarget[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('find_user_for_transfer', { p_nickname: nickname });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, display: r.display, verified: r.verified ?? undefined }));
}
async function rawFindUserByPhone(phone: string): Promise<TransferTarget[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('find_user_by_phone', { p_phone: phone });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, display: r.display, verified: r.verified ?? undefined }));
}

// 닉네임/이름 경로 — 키는 trim+소문자(ILIKE 검색이라 대소문자·공백 무관)
export const findUserForTransfer = makeSearchCache(rawFindUserForTransfer, (s) => s.trim().toLowerCase());
// 전화번호 경로 — 키는 숫자만 끝10자리(국가코드 유무 무시, RPC 매칭과 동일 정규화). verified=본인인증(ci) 보유라 미인증 배지·차단 UI가 양 경로 일관.
export const findUserByPhone = makeSearchCache(rawFindUserByPhone, (s) => s.replace(/[^0-9]/g, '').slice(-10));

export async function voucherUsageByVenue(venueId: string): Promise<VoucherUsage[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('voucher_usage_by_venue', { p_venue_id: venueId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ usedVenueId: r.used_venue_id ?? null, venueName: r.venue_name ?? null, usedCount: Number(r.used_count) || 0 }));
}

export async function myVisitedVenues(): Promise<VisitedVenue[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('my_visited_venues');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ venueId: r.venue_id, venueName: r.venue_name ?? null, visits: Number(r.visits) || 0 }));
}

// ── 직원 이용권내역 열람 권한(업주 설정) ──
export async function getVoucherAccessUserIds(venueId: string): Promise<string[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('get_voucher_access_user_ids', { p_venue_id: venueId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.user_id as string);
}
export async function grantVoucherAccess(venueId: string, userId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('grant_voucher_access', { p_venue_id: venueId, p_user_id: userId });
  if (error) throw new Error(error.message);
}
export async function revokeVoucherAccess(venueId: string, userId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('revoke_voucher_access', { p_venue_id: venueId, p_user_id: userId });
  if (error) throw new Error(error.message);
}

// ── 보유 회원수/사용 현황 + 사용내역 ──
export interface VoucherHolderStats { holderCount: number; activeCount: number; usedCount: number }
export async function voucherHolderStats(venueId: string): Promise<VoucherHolderStats> {
  if (IS_MOCK) return { holderCount: 0, activeCount: 0, usedCount: 0 };
  const { data } = await supabase.rpc('voucher_holder_stats', { p_venue_id: venueId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = (data ?? [])[0] ?? {};
  return { holderCount: Number(r.holder_count) || 0, activeCount: Number(r.active_count) || 0, usedCount: Number(r.used_count) || 0 };
}

// 보유자 실명+닉네임(해당 매장 권한자만) — 관리 화면에 "실명(닉네임)" 표기용
export interface VoucherHolderProfile { userId: string; realName: string | null; nickname: string | null }
export async function voucherHolderProfiles(venueId: string): Promise<VoucherHolderProfile[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('voucher_holder_profiles', { p_venue_id: venueId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ userId: r.user_id, realName: r.real_name ?? null, nickname: r.nickname ?? null }));
}

export interface VoucherHistoryRow { id: string; title: string; holderName: string | null; realName: string | null; nickname: string | null; usedAt: string | null }
export async function voucherHistory(venueId: string): Promise<VoucherHistoryRow[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('voucher_history', { p_venue_id: venueId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, title: r.title, holderName: r.holder_name ?? null, realName: r.real_name ?? null, nickname: r.nickname ?? null, usedAt: r.used_at ?? null }));
}
/** 이용내역 표시명 — 실명/닉네임(실명 있으면), 없으면 닉네임(또는 발급 당시 이름) */
export function voucherHolderLabel(row: { realName?: string | null; nickname?: string | null; holderName?: string | null }): string {
  const real = (row.realName ?? '').trim();
  const nick = (row.nickname ?? row.holderName ?? '').trim();
  return real && nick ? `${real}/${nick}` : (nick || real || '-');
}

// 현재 사용자가 이 매장 이용권 내역을 볼 수 있는지(업주 또는 권한 부여 직원)
export async function iCanViewVouchers(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data } = await supabase.rpc('can_view_vouchers', { p_venue_id: venueId });
  return data === true;
}

/** 내 매장 이용내역(머니인 횟수·금액) — 장부 바인을 실명/닉네임 일치로 집계. */
export async function myPlayHistory(): Promise<PlayHistory[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('my_play_history');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ venueId: r.venue_id, venueName: r.venue_name ?? null, moneyinCount: Number(r.moneyin_count) || 0, totalAmount: Number(r.total_amount) || 0, lastAt: r.last_at ?? null }));
}

// ── 발급 한도(쿼터) — 운영진 승인 충전 + 충전(구매) 요청 ─────────────────────
export interface VoucherCreditRequest { id: string; amount: number; note: string | null; status: 'pending' | 'approved' | 'rejected'; adminNote: string | null; createdAt: string }
export interface AdminCreditRequest { id: string; venueId: string; venueName: string; amount: number; note: string | null; requester: string; createdAt: string }

/** 잔여 발급 한도 — null = 알 수 없음(쿼터 RPC 미배포 · 열람 권한 없음). 0 과 구분해야 한다.
 *  2026-08-29: 서버가 can_view_vouchers 게이트를 통과 못하면 NULL 을 돌려준다(구버전은 누구에게나 숫자였다).
 *  `Number(null) === 0` 으로 뭉개면 권한 없는 화면이 '한도 소진'으로 보여 발급을 포기하게 된다. */
export async function getVoucherQuota(venueId: string): Promise<number | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('get_voucher_quota', { p_venue_id: venueId });
  if (error || data == null) return null;
  return typeof data === 'number' ? data : Number(data);
}

/** 충전(구매) 요청 — 업주. 대기 중 요청이 있으면 서버가 거부 */
export async function requestVoucherCredit(venueId: string, amount: number, note?: string): Promise<void> {
  const { error } = await supabase.rpc('request_voucher_credit', { p_venue_id: venueId, p_amount: amount, p_note: note ?? null });
  if (error) throw new Error(error.message);
}

export async function myVoucherCreditRequests(venueId: string): Promise<VoucherCreditRequest[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('my_voucher_credit_requests', { p_venue_id: venueId });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, amount: r.amount, note: r.note ?? null, status: r.status, adminNote: r.admin_note ?? null, createdAt: r.created_at }));
}

/** (운영자) 대기 중 충전 요청 */
export async function adminListVoucherCreditRequests(): Promise<AdminCreditRequest[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('admin_list_voucher_credit_requests');
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, venueId: r.venue_id, venueName: r.venue_name ?? '(매장)', amount: r.amount, note: r.note ?? null, requester: r.requester ?? '', createdAt: r.created_at }));
}

/** (운영자) 충전 요청 승인/거절 — 승인 시 매장 한도 자동 충전 */
export async function adminDecideVoucherCredit(requestId: string, approve: boolean, adminNote?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_decide_voucher_credit', { p_request_id: requestId, p_approve: approve, p_admin_note: adminNote ?? null });
  if (error) throw new Error(error.message);
}

/** (운영자) 수동 충전(±) — 반환: 충전 후 잔여 한도 */
export async function adminGrantVoucherQuota(venueId: string, amount: number): Promise<number> {
  const { data, error } = await supabase.rpc('admin_grant_voucher_quota', { p_venue_id: venueId, p_amount: amount });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
