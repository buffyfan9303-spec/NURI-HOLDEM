import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// NURI HOLDEM — 폐기된 범용 Gemini 프록시 (2026-09-11)
//
// 이 함수는 클라이언트가 prompt·system·images·model·temperature 를 **임의로 지정**할 수 있는
// 범용 프록시였다. 로그인·일일 상한은 있었지만, 로그인한 아무 유저나 우리 API 키로 임의의
// 시스템 프롬프트를 걸고 임의의 이미지를 넣어 모델을 부를 수 있다는 뜻이었다.
//
// 오너 지시(2026-09-11)로 앱의 외부 생성형 AI 기능을 **TDA 규칙 질의 하나**로 줄이면서,
// 그 하나는 계약이 좁은 전용 함수(`tda-assist`)로 옮겼다. 이 함수는 더 이상 쓰이지 않는다.
//
// ⚠ 왜 파일을 지우지 않고 거절 스텁을 남기나
//   함수 디렉터리를 지워도 **이미 배포된 함수는 Supabase 에 그대로 살아 있다**. 오너가 대시보드에서
//   따로 지워야 사라지는데, 그 사이에 옛 번들·외부 스크립트가 계속 호출할 수 있다.
//   이 스텁을 배포하면 그 순간 범용 통로가 닫힌다 — 지우는 것보다 빠르고 확실하다.
//   (완전 제거는 오너 작업: Supabase Dashboard → Edge Functions → gemini → Delete)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  // 410 Gone — '있었지만 영구히 사라졌다'. 클라이언트가 재시도로 되살릴 수 있는 상태가 아니다.
  return new Response(
    JSON.stringify({ error: '폐기된 기능입니다. TDA 규칙 질의는 tda-assist 함수를 사용하세요.' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
