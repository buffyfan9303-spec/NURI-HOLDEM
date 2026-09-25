// src/api/locationPrivacy.ts — 위치정보 이용 동의 · 이용사실 확인자료 열람(LOCATION-READY 2026-09-26).
// 서버: 20260926b(location_consents · location_access_log · 본인 RPC 3종). 표는 RLS + 직접 권한 0 — RPC 로만 읽고 쓴다.
// 좌표는 어디에도 저장되지 않는다. 확인자료는 '언제 · 무슨 목적 · 취득경로 · 제공받는 자' 뿐이다(위치정보법 제2조제5호).
import { supabase, IS_MOCK } from '../lib/supabase';

export type LocationConsentValue = 'unset' | 'granted' | 'denied';
export interface LocationConsentState {
  state: LocationConsentValue;
  termsVersion: number | null;
  grantedAt: string | null;
  revokedAt: string | null;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** 서버 jsonb → 화면 값. 모르는 state 는 'unset'(= 다시 묻는다) — 동의로 오인하지 않는다. */
export function parseLocationConsent(data: unknown): LocationConsentState {
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const state: LocationConsentValue = o.state === 'granted' || o.state === 'denied' ? o.state : 'unset';
  const v = Number(o.terms_version);
  return { state, termsVersion: Number.isInteger(v) && v > 0 ? v : null, grantedAt: str(o.granted_at), revokedAt: str(o.revoked_at) };
}

export async function getMyLocationConsent(): Promise<LocationConsentState> {
  if (IS_MOCK) return parseLocationConsent(null);
  const { data, error } = await supabase.rpc('get_my_location_consent');
  if (error) throw new Error(error.message);
  return parseLocationConsent(data);
}

/** 동의(true) / 동의 안 함·철회(false). 철회하면 서버가 내 확인자료를 즉시 지운다(법 제24조④). */
export async function setMyLocationConsent(granted: boolean, termsVersion: number): Promise<LocationConsentState> {
  if (IS_MOCK) return { state: granted ? 'granted' : 'denied', termsVersion, grantedAt: null, revokedAt: null };
  const { data, error } = await supabase.rpc('set_my_location_consent', { p_granted: granted, p_terms_version: termsVersion });
  if (error) throw new Error(error.message);
  return parseLocationConsent(data);
}

export interface LocationUseRow { usedAt: string; purpose: string; acquiredVia: string; recipient: string | null }

/** 내 위치정보 이용 내역(법 제24조③ 열람). 조회 자체도 서버가 '열람' 1행으로 남긴다(고시 제6조①2호). */
export async function getMyLocationUseLog(limit = 100): Promise<LocationUseRow[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('get_my_location_access_log', { p_limit: limit });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    usedAt: String(r.used_at ?? ''), purpose: String(r.purpose ?? ''),
    acquiredVia: String(r.acquired_via ?? ''), recipient: str(r.recipient),
  }));
}
