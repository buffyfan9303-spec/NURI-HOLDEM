// src/api/ai.ts
// Gemini 엣지 함수(gemini) 프록시 클라이언트. API 키는 서버 시크릿(GEMINI_API_KEY)에만 존재 — 클라이언트엔 노출되지 않는다.
import { supabase, IS_MOCK } from '../lib/supabase';

/** AI 텍스트 생성. 로그인 사용자만 호출 가능(엣지 함수 verify_jwt). 미설정/오류 시 throw. */
export async function aiGenerate(prompt: string, system?: string): Promise<string> {
  if (IS_MOCK) throw new Error('데모 모드에서는 AI를 사용할 수 없습니다.');
  const { data, error } = await supabase.functions.invoke('gemini', { body: { prompt, system } });
  if (error) throw new Error(error.message || 'AI 요청에 실패했습니다.');
  if (data?.error) throw new Error(String(data.error));
  const text = (data?.text ?? '').trim();
  if (!text) throw new Error('AI 응답이 비어 있습니다.');
  return text;
}
