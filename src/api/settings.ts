// src/api/settings.ts — 전역 앱 설정(app_settings). 읽기는 공개, 쓰기는 운영자(set_app_setting RPC).
import { supabase, IS_MOCK } from '../lib/supabase';

/**
 * 설정 저장소 오류 — **분류 정보를 잃지 않고** 던진다.
 *
 * ⚠ 예전엔 `new Error(error.message)` 로 감쌌다. 그 한 줄이 `code` 를 버려서 `src/lib/dbError.ts` 의
 *   분류가 통째로 꺼졌다: `msgOf` 는 `code` 로 가르고 `isDenied` 는 `code==='42501'||status===403` 으로 가른다.
 *   그래서 관리자 화면에 **`permission denied for function set_app_setting` 원문이 그대로 그려졌다**
 *   (보안 표준 6번 위반 — 브라우저 실캡처로 확인, 2026-09-12). `adminEvents.ts` 의 `EventRpcError` 와 같은 형태로 고친다.
 */
export class SettingsError extends Error {
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;
  readonly status?: number;
  constructor(e: { message?: string; code?: string; details?: string; hint?: string; status?: number }) {
    super(e.message ?? '설정을 처리하지 못했습니다');
    this.name = 'SettingsError';
    this.code = e.code;
    this.details = e.details;
    this.hint = e.hint;
    this.status = e.status;
  }
}

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
  if (error) throw new SettingsError(error);
  return (data?.value as string) ?? null;
}

/** 전역 설정 저장 — 운영자 전용(set_app_setting RPC). value 빈 문자열이면 해제. */
export async function setAppSetting(key: string, value: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_app_setting', { p_key: key, p_value: value });
  if (error) throw new SettingsError(error);
}

export const CLOCK_AD_KEY = 'clock_ad_image';
export const CLOCK_AD_SIZE_KEY = 'clock_ad_size'; // 'sm' | 'md' | 'lg'
// 부스트(포스터 상단 고정) 문의 연락처 — 관리자 설정 → 게시물 관리에서 입력
export const BOOST_CONTACT_EMAIL_KEY = 'boost_contact_email';
export const BOOST_CONTACT_PHONE_KEY = 'boost_contact_phone';
// ── 사이트 이벤트 메뉴 표시 ─────────────────────────────────────────────────
// 세 가지를 헷갈리지 말 것(문서 §8-2):
//   ① 이 스위치 = **진입점(홈·내비의 이벤트 메뉴)을 보여줄지**. 캠페인 참여와 무관하다.
//   ② 개별 캠페인 공개/숨김 = 그 매장의 그 행사만 손님에게 숨긴다(event_campaigns.hidden_at).
//   ③ 행사 종료 = 새 참여를 끝낸다(status='ended').
// 메뉴를 숨겨도 진행 중인 캠페인은 계속 돌아가고, 캠페인을 숨겨도 메뉴는 그대로 있다.
export const EVENT_MENU_KEY = 'event_menu_visible';
/** 저장값 → 표시 여부. **'off' 일 때만 숨긴다** — 없는 값·깨진 값은 표시(기본 켜기). */
export const parseEventMenuVisible = (v: string | null | undefined): boolean => v !== 'off';
/**
 * 이벤트 메뉴를 보여줄지. **조회 실패를 '숨김' 으로 해석하지 않는다**(문서 §8-2) —
 * 진입 경로는 열어 두고 `error` 로 오류 안내만 띄운다.
 */
export async function loadEventMenuVisibility(): Promise<{ visible: boolean; error: unknown }> {
  try {
    return { visible: parseEventMenuVisible(await getAppSetting(EVENT_MENU_KEY)), error: null };
  } catch (e) {
    return { visible: true, error: e };
  }
}

// 게시판 광고 빈도 — '글 N개마다 광고 1줄'(기본 4, 2~10). 관리자 → 노출 관리 → 광고
export const COMMUNITY_ADS_EVERY_KEY = 'community_ads_every';
export const COMMUNITY_ADS_EVERY_DEFAULT = 4;
/** 저장값 → 2~10 정수. 없거나 깨졌으면 기본 4. */
export const parseAdsEvery = (v: string | null | undefined): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 2 && n <= 10 ? n : COMMUNITY_ADS_EVERY_DEFAULT;
};
