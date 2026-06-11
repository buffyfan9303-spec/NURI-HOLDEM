// src/api/settings.ts — 전역 앱 설정(app_settings). 읽기는 공개, 쓰기는 운영자(set_app_setting RPC).
import { supabase, IS_MOCK } from '../lib/supabase';

/** 전역 설정 값 조회(공개). 없으면 null. */
export async function getAppSetting(key: string): Promise<string | null> {
  if (IS_MOCK) return null;
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
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
