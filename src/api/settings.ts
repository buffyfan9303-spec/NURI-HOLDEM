// src/api/settings.ts — 전역 앱 설정(app_settings). 읽기는 공개, 쓰기는 운영자(set_app_setting RPC).
import { supabase, IS_MOCK } from '../lib/supabase';

/**
 * 전역 설정 값 조회(공개). **없으면 null, 못 읽으면 throw.**
 *
 * ⚠ 2026-09-11: 예전엔 error 를 통째로 버려 '설정 안 됨' 과 '조회 실패' 가 똑같이 null 이었다.
 *   그 탓에 부스트 문의 연락처 카드가 조회 실패 시 빈 폼으로 서고, 운영자가 한 칸만 채워 저장하면
 *   **이미 저장돼 있던 다른 값이 빈 문자열로 덮였다**(업주의 문의 경로가 통째로 끊긴다).
 *   호출부 12곳은 전부 이미 .catch 를 갖고 있어, 던져도 각자 기본값을 유지한다.
 */
export async function getAppSetting(key: string): Promise<string | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as string) ?? null;
}

/** 전역 설정 저장 — 운영자 전용(set_app_setting RPC). value 빈 문자열이면 해제. */
export async function setAppSetting(key: string, value: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_app_setting', { p_key: key, p_value: value });
  if (error) throw new Error(error.message);
}

export const CLOCK_AD_KEY = 'clock_ad_image';
export const CLOCK_AD_SIZE_KEY = 'clock_ad_size'; // 'sm' | 'md' | 'lg'
// 부스트(포스터 상단 고정) 문의 연락처 — 관리자 설정 → 게시물 관리에서 입력
export const BOOST_CONTACT_EMAIL_KEY = 'boost_contact_email';
export const BOOST_CONTACT_PHONE_KEY = 'boost_contact_phone';
// 게시판 광고 빈도 — '글 N개마다 광고 1줄'(기본 4, 2~10). 관리자 → 노출 관리 → 광고
export const COMMUNITY_ADS_EVERY_KEY = 'community_ads_every';
export const COMMUNITY_ADS_EVERY_DEFAULT = 4;
/** 저장값 → 2~10 정수. 없거나 깨졌으면 기본 4. */
export const parseAdsEvery = (v: string | null | undefined): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 2 && n <= 10 ? n : COMMUNITY_ADS_EVERY_DEFAULT;
};
