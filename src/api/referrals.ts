// src/api/referrals.ts — 친구 초대 추천
//   추천 코드 = 추천인의 닉네임. 가입 랜딩(?ref=<code>) 시 코드를 기억했다가, 로그인 후 record_referral 호출.
//   보상은 피추천인이 본인인증(ci) 완료 시 **양쪽에게 이벤트 참여권 1장씩** — 서버 트리거가 처리(어뷰즈 방지).
//
// ── 2026-09-15 오너 지시 #9: 활동점수(+500/+300) → 이벤트 참여권(뽑기권) ──────────
//   진행 중인 이벤트가 없으면 **보류했다가 다음 이벤트에 지급**한다(오너 결정 B).
//   그래서 "확정" 과 "전달" 이 분리된다:
//     · referrals.rewarded_at        = 보상이 **확정**됐다(대기 행을 만들었다)
//     · referral_ticket_grants.granted_at = 실제로 **전달**됐다
//   ⚠ 이 분리 때문에 my_referral_stats().rewarded 의 뜻이 바뀐다 — 서버에서 '전달 완료' 기준으로
//     고쳐 온다(마이그레이션 20260915a §8). 화면이 '보상 완료' 라고 적는데 실제로는 대기 중이면 거짓말이다.
import { supabase, IS_MOCK } from '../lib/supabase';

const REF_KEY = 'nuri:ref-code';

export function rememberRefCode(code: string): void {
  try { if (code && code.trim()) localStorage.setItem(REF_KEY, code.trim()); } catch { /* ignore */ }
}
export function pendingRefCode(): string | null {
  try { return localStorage.getItem(REF_KEY); } catch { return null; }
}
export function clearRefCode(): void {
  try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ }
}

/** 추천 기록 — 로그인된 신규(14일 이내) 유저가 호출. 자기추천/중복/만료 시 false. */
export async function recordReferral(code: string): Promise<boolean> {
  if (IS_MOCK || !code.trim()) return false;
  const { data, error } = await supabase.rpc('record_referral', { p_code: code.trim() });
  if (error) return false;
  return data === true;
}

export interface ReferralStats { invited: number; rewarded: number }
export async function getMyReferralStats(): Promise<ReferralStats> {
  if (IS_MOCK) return { invited: 0, rewarded: 0 };
  const { data, error } = await supabase.rpc('my_referral_stats');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (data as any)?.[0];
  if (error || !row) return { invited: 0, rewarded: 0 };
  return { invited: Number(row.invited) || 0, rewarded: Number(row.rewarded) || 0 };
}

/** 밀린 참여권 지급 결과 — granted=이번에 받은 장수 · pending=아직 못 받고 대기 중인 장수 */
export interface ReferralTicketClaim { granted: number; pending: number }

/**
 * 밀린 친구 초대 참여권을 **본인 것만** 당겨 간다(지급 시점 = "그 사람이 다음에 들어올 때").
 *
 * 왜 화면이 이걸 부르나: 서버는 보상이 확정될 때 대기 행을 만들고 **그 자리에서 한 번** 지급을 시도한다.
 * 그때 진행 중인 이벤트가 없었으면 대기로 남고, 그 뒤로는 **아무도 다시 시도하지 않는다**(크론 없음).
 * 그래서 당사자가 들어올 때 이 함수가 당겨 가야 대기가 풀린다 — 이 호출이 빠지면 대기는 영원히 안 풀린다.
 *
 * ⚠ 마이그레이션(20260915a)이 아직 운영에 없으면 PostgREST 는 **404(PGRST202)** 를 준다.
 *   앱이 먼저 배포되고 DB 가 나중에 적용되는 창이 이 저장소에 실제로 존재한다(ads.ts 와 같은 처방).
 *   그때는 **null** 을 돌려준다 — 0 이 아니다. 0 은 '대기 없음'이라는 **사실 주장**이라 거짓이 된다.
 *   화면은 null 이면 대기 안내를 **아예 그리지 않는다**(모르는 것을 아는 척하지 않는다).
 */
let claimRpcMissing = false;
export async function claimPendingReferralTickets(): Promise<ReferralTicketClaim | null> {
  if (IS_MOCK || claimRpcMissing) return null;
  const { data, error } = await supabase.rpc('claim_my_pending_referral_tickets');
  if (error) {
    if (error.code === 'PGRST202') { claimRpcMissing = true; return null; }
    return null;   // 로그인 만료·일시 장애 — 대기 안내를 감출 뿐, 지급은 다음 진입에서 다시 시도된다
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    granted: Number((row as { granted?: number }).granted) || 0,
    pending: Number((row as { pending?: number }).pending) || 0,
  };
}

/** 내 초대 링크 — 추천 코드(닉네임)로 ?ref=<code>&signup=1 */
export function inviteUrl(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nuriholdem.com';
  return `${origin}/?ref=${encodeURIComponent(code)}&signup=1`;
}
