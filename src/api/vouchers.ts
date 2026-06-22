// src/api/vouchers.ts — 매장이용권(store_vouchers). 모든 변경은 SECURITY DEFINER RPC로만.
import { supabase, IS_MOCK } from '../lib/supabase';

export interface Voucher {
  id: string; venueId: string; venueName: string | null; issuedBy: string;
  holderUserId: string | null; holderName: string | null;
  title: string; status: string;
  usedVenueId: string | null; usedVenueName: string | null; usedAt: string | null; createdAt: string;
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

/** 내가 보유한 이용권 (손님) */
export async function listMyVouchers(): Promise<Voucher[]> {
  if (IS_MOCK) return [];
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return [];
  const { data } = await supabase.from('store_vouchers')
    .select('*, venue:venue_id(name), used_venue:used_venue_id(name)')
    .eq('holder_user_id', uid).order('created_at', { ascending: false });
  return (data ?? []).map(mapRow);
}

export async function issueVoucher(venueId: string, input: { title: string; count?: number; holderName?: string; holderUserId?: string; note?: string }): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('issue_voucher', {
    p_venue_id: venueId, p_title: input.title, p_count: input.count ?? 1,
    p_holder_name: input.holderName ?? null, p_holder_user_id: input.holderUserId ?? null, p_note: input.note ?? null,
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

export async function revokeVoucher(voucherId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('revoke_voucher', { p_voucher_id: voucherId });
  if (error) throw new Error(error.message);
}

export async function deleteVoucher(voucherId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('delete_voucher', { p_voucher_id: voucherId });
  if (error) throw new Error(error.message);
}

// 회수(사용): 발급 매장 QR 스캔 — 그 매장에서만 사용 가능. 매장명 반환.
export async function redeemMyVoucherByQr(voucherId: string, venueId: string): Promise<string> {
  if (IS_MOCK) return '';
  const { data, error } = await supabase.rpc('redeem_my_voucher_by_qr', { p_voucher_id: voucherId, p_venue_id: venueId });
  if (error) throw new Error(error.message);
  return (data as string) ?? '';
}
// 회수(사용): 발급 매장 업주 전화번호로만.
export async function redeemMyVoucherByPhone(voucherId: string, phone: string): Promise<string> {
  if (IS_MOCK) return '';
  const { data, error } = await supabase.rpc('redeem_my_voucher_by_phone', { p_voucher_id: voucherId, p_phone: phone });
  if (error) throw new Error(error.message);
  return (data as string) ?? '';
}
// 회수(사용): '전송' 한 번에 발급 매장으로 바로(보유자 본인). 매장명 반환.
export async function redeemMyVoucher(voucherId: string): Promise<string> {
  if (IS_MOCK) return '';
  const { data, error } = await supabase.rpc('redeem_my_voucher', { p_voucher_id: voucherId });
  if (error) throw new Error(error.message);
  return (data as string) ?? '';
}

// 동일 쿼리 중복 RPC 방지 — in-flight 합치기 + 짧은 TTL LRU 를 입히는 공용 팩토리.
// 발급 자동완성은 prefill+디바운스 동시발화, 백스페이스 후 같은 글자 재입력, 엔터(resolveId)가
// 디바운스와 겹치는 등 같은 q 재호출이 흔하다. 닉네임·전화 경로가 동일 캐싱을 공유(일관성).
const SEARCH_TTL = 20_000; // 20s — 입력 세션 동안 동일 q 흡수(신규 가입자 반영은 최대 20s 지연 허용)
const SEARCH_MAX = 30;     // 최근 N개만 유지(소형 LRU)
function withSearchCache(
  fetcher: (raw: string) => Promise<TransferTarget[]>,
  normalize: (s: string) => string,
): (raw: string) => Promise<TransferTarget[]> {
  const cache = new Map<string, { at: number; data: TransferTarget[] }>();
  const inflight = new Map<string, Promise<TransferTarget[]>>();
  return (raw: string) => {
    const key = normalize(raw);
    if (!key) return Promise.resolve([]);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < SEARCH_TTL) { cache.delete(key); cache.set(key, hit); return Promise.resolve(hit.data); } // LRU 터치
    const live = inflight.get(key);
    if (live) return live; // 동시 동일 q → 한 번만 비행
    const p = fetcher(raw)
      .then((data) => {
        cache.set(key, { at: Date.now(), data });
        if (cache.size > SEARCH_MAX) { const oldest = cache.keys().next().value; if (oldest !== undefined) cache.delete(oldest); }
        return data;
      })
      .finally(() => { inflight.delete(key); });
    inflight.set(key, p);
    return p;
  };
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

// 닉네임/이름 경로 — 키는 trim+소문자
export const findUserForTransfer = withSearchCache(rawFindUserForTransfer, (s) => s.trim().toLowerCase());
// 전화번호 경로 — 키는 숫자만 끝10자리(국가코드 유무 무시, RPC 매칭과 동일 정규화). verified=본인인증(ci) 보유라 미인증 배지·차단 UI가 양 경로 일관.
export const findUserByPhone = withSearchCache(rawFindUserByPhone, (s) => s.replace(/[^0-9]/g, '').slice(-10));

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

/** 잔여 발급 한도 — 쿼터 RPC 미배포(구 DB)면 null(무제한 표시 안 함) */
export async function getVoucherQuota(venueId: string): Promise<number | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('get_voucher_quota', { p_venue_id: venueId });
  if (error) return null;
  return typeof data === 'number' ? data : Number(data ?? 0);
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
