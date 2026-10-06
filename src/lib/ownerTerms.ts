// src/lib/ownerTerms.ts — 매장 운영자 이용약관(개인정보 처리위탁 포함)의 판·동의 기록(2026-10-06 약관 재검토 P1-5).
//
// 왜 따로 두나: 처리방침은 "매장이 입력한 손님·직원 정보는 매장이 개인정보처리자, 회사는 수탁자"라고 말하는데,
//   그 위탁을 정한 **문서**(개인정보 보호법 제26조①)가 없었다. 그 문서가 src/pages/legal/OwnerTerms.tsx 이고,
//   업주·공동 운영자가 그 판에 동의했다는 기록이 서버 owner_terms_consents(20261006n)다.
// 이 판은 회원 약관 판(legalVersion LEGAL_VERSION · 재동의 게이트)과 **별개**다 — 업주에게만 적용된다.
// 동의를 받는 곳: ① 매장 운영자 가입 화면(AuthModal signup-owner — 세션이 생기면 적는다, 아래 remember/flush)
//   ② 이미 승인된 업주·공동 운영자는 내 매장을 열 때 OwnerTermsGate 가 한 번 묻는다(기존 재동의 게이트와 같은 모양).
import { supabase, IS_MOCK } from './supabase';
import { OWNER_TERMS_VERSION } from './legalDeploy';

export { OWNER_TERMS_VERSION, OWNER_TERMS_EFFECTIVE_DATE } from './legalDeploy';

/** 내가 동의한 가장 높은 판(없으면 0). 본인 행만 묻는다 — RLS 는 관리자에게 남의 행도 보여 주므로 user_id 를 직접 건다(pr188-193-review P3-7). */
export async function getMyOwnerTermsVersion(uid: string): Promise<number> {
  if (IS_MOCK) return OWNER_TERMS_VERSION;
  const { data, error } = await supabase.from('owner_terms_consents')
    .select('terms_version').eq('user_id', uid).order('terms_version', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return Number(data?.[0]?.terms_version ?? 0);
}

/** 동의 기록 — 시각은 서버가 찍는다(분쟁 시 증거라 클라가 쓰지 않는다). */
export async function recordMyOwnerTermsConsent(source: 'signup' | 'gate'): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('record_my_owner_terms_consent', { p_version: OWNER_TERMS_VERSION, p_source: source });
  if (error) throw new Error(error.message);
}

// ── 가입 화면에서 받은 동의 — 세션이 생긴 뒤 적는다(lib/locationConsent 의 가입 위치 동의와 같은 방식) ──────────
// 이메일 가입은 확인 메일 설정에 따라 세션이 바로 없을 수 있어 이 기기에 '적을 동의'만 남기고, 그 계정이 로그인한 순간(App) 적은 뒤 지운다.
// 다른 이메일 계정이 로그인하면 적지 않는다(남의 동의를 대신 적지 않는다). 30일 지나면 버린다 — 그때는 내 매장 게이트가 다시 묻는다.
const PENDING_KEY = 'nuri:signup-owner-terms';
const PENDING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
type Pending = { email: string; v: number; at: number };
const norm = (e: string) => e.trim().toLowerCase();

export function rememberSignupOwnerTerms(email: string): void {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ email: norm(email), v: OWNER_TERMS_VERSION, at: Date.now() } satisfies Pending)); } catch { /* 저장소 차단 — 게이트가 묻는다 */ }
}

/** 남겨 둔 가입 동의가 지금 로그인한 그 계정 것이면 서버에 적는다. 적었으면 true. 실패하면 남겨 두고 다음 로그인 때 다시. */
export async function flushSignupOwnerTerms(email: string | null | undefined): Promise<boolean> {
  let p: Pending | null;
  try { p = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as Pending | null; } catch { return false; }
  if (!p || !email) return false;
  const drop = () => { try { localStorage.removeItem(PENDING_KEY); } catch { /* 무시 */ } };
  if (Date.now() - p.at > PENDING_TTL_MS || p.v !== OWNER_TERMS_VERSION) { drop(); return false; }
  if (p.email !== norm(email)) return false;
  const { data } = await supabase.auth.getSession();
  if (norm(data.session?.user?.email ?? '') !== p.email) return false;
  try { await recordMyOwnerTermsConsent('signup'); drop(); return true; } catch { return false; }
}
