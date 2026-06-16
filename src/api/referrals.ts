// src/api/referrals.ts — 친구 초대 추천
//   추천 코드 = 추천인의 닉네임. 가입 랜딩(?ref=<code>) 시 코드를 기억했다가, 로그인 후 record_referral 호출.
//   보상은 피추천인이 본인인증(ci) 완료 시 양쪽 활동점수(+500/+300) — 서버 트리거가 처리(어뷰즈 방지).
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

/** 내 초대 링크 — 추천 코드(닉네임)로 ?ref=<code>&signup=1 */
export function inviteUrl(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nuriholdem.com';
  return `${origin}/?ref=${encodeURIComponent(code)}&signup=1`;
}
