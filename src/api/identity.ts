// src/api/identity.ts — PortOne 본인인증 결과를 서버(verify-identity Edge Function)에서 교차검증.
// 클라이언트는 식별자만 전달하고, CI 추출·중복검사·저장은 전부 서버에서 수행.
import { supabase } from '../lib/supabase';

/** PortOne 상점 식별자 — **공개값**이다(번들에 박히는 VITE_*). 서버가 조회 범위를 좁히는 데만 쓴다.
 *  권한은 어디까지나 서버의 API Secret 이 쥐고 있으므로 이 값은 신뢰 경계가 아니다. */
const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID as string | undefined;

export async function verifyIdentity(identityVerificationId: string): Promise<{ name: string | null }> {
  const { data, error } = await supabase.functions.invoke('verify-identity', {
    body: { identityVerificationId, ...(STORE_ID ? { storeId: STORE_ID } : {}) },
  });
  if (error) {
    let msg = '본인인증에 실패했습니다.';
    // FunctionsHttpError: error.context는 Response 객체 — 서버 메시지(409 "이미 가입된 명의입니다." 등) 추출.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const j = await ctx.json(); if (j?.error) msg = j.error; } catch { /* noop */ }
    } else if (error.message) { msg = error.message; }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return { name: data?.name ?? null };
}
