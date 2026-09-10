// src/api/tdaAssist.ts — 이 앱에 남은 **유일한** 외부 생성형 AI 통로(2026-09-11 오너 지시).
//
// 종전에는 src/api/ai.ts 의 범용 aiGenerate/aiInspectImages 가 `gemini` 엣지 함수를 통해
// 임의의 prompt·system·images·model·temperature 를 보낼 수 있었고, 그 위에 운영 요약·후기 답글 초안·
// 문의 답변 초안·순위 증빙 이미지 검사·GTO 해설이 얹혀 있었다. 그 전부를 걷어내고
// TDA 규칙 질의 하나만 남긴다. 그래서 이 파일에는 함수가 하나뿐이고, 보낼 수 있는 것도 둘뿐이다:
//   ① 질문(상황 설명)  ② canonical 규칙의 키
// 시스템 프롬프트·모델·온도·이미지는 **서버가 고정**한다(supabase/functions/tda-assist).
// 규칙 원문도 서버가 rules.json 에서 조립한다 — 클라이언트가 본문 텍스트를 실어 보낼 수 없다.
import { supabase, IS_MOCK } from '../lib/supabase';

/** 클라이언트→서버 요청 상한. 서버도 같은 값을 강제한다(여기 값은 UX 용 사전 차단일 뿐이다). */
export const TDA_QUESTION_MAX = 200;
export const TDA_RULES_MAX = 8;

/**
 * TDA 규칙 근거로 상황을 물어본다.
 *
 * 실패하면 throw 한다 — 호출부는 **찾은 규칙 원문을 그대로 보여 준다**(TdaRulesTool 참조).
 * AI 는 요약 보조일 뿐 이 도구의 전제가 아니다.
 */
export async function askTdaAssist(question: string, ruleKeys: string[]): Promise<string> {
  if (IS_MOCK) throw new Error('데모 모드에서는 AI 안내를 사용할 수 없습니다.');
  const q = question.trim();
  if (q.length < 2) throw new Error('질문이 너무 짧습니다.');
  if (q.length > TDA_QUESTION_MAX) throw new Error(`질문은 ${TDA_QUESTION_MAX}자까지 가능합니다.`);
  if (ruleKeys.length === 0) throw new Error('근거 규칙이 없습니다.');

  const { data, error } = await supabase.functions.invoke('tda-assist', {
    body: { question: q, ruleKeys: ruleKeys.slice(0, TDA_RULES_MAX) },
  });
  if (error) throw new Error(error.message || 'AI 안내를 받지 못했습니다.');
  if (data?.error) throw new Error(String(data.error));
  const text = (data?.text ?? '').trim();
  if (!text) throw new Error('AI 응답이 비어 있습니다.');
  return text;
}
