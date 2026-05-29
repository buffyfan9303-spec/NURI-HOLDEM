import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * 환경변수가 없으면 Mock 모드로 동작.
 * API 함수들이 IS_MOCK === true 일 때 MOCK_* 데이터를 반환.
 */
export const IS_MOCK = !url || !key;

export const supabase = IS_MOCK
  ? (null as unknown as ReturnType<typeof createClient>)  // mock 모드에선 호출되지 않음
  : createClient(url!, key!);

// ── DB row → 앱 타입 변환 헬퍼 ─────────────────────────────────────────────
// snake_case(DB) ↔ camelCase(앱) 변환을 각 api 파일에서 통일하여 사용

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
