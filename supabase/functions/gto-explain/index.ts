import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// NURI HOLDEM — 폐기된 GTO 해설 프록시 (2026-09-21, 요구 `10-ⓑ` 오너 결정)
//
// 이 함수는 Gemini 로 GTO 스팟을 해설하던 교육용 프록시였다. 저장소에서 소스가 지워진 뒤에도
// **라이브에는 version 9 가 ACTIVE 로 남아 있었다** — 즉 저장소가 라이브를 설명하지 못하는 상태였다.
//
// 닫는 근거(2026-09-21 실측)
//   · 앱 호출부 **0곳**. `src/api/aiSurface.test.ts:74` 는 오히려 이 함수를 **부르지 못하게 막는 가드**다.
//   · 오너 지시(2026-09-11)로 앱의 외부 생성형 AI 는 **TDA 규칙 질의(`tda-assist`) 하나**로 줄었다.
//   · 열린 채 두면 외부 API 과금 통로가 남는다(CLAUDE.md 보안표준 4번).
//
// ⚠ 왜 파일을 지우지 않고 거절 스텁을 남기나 (형제 함수 `gemini` 와 같은 이유)
//   디렉터리를 지워도 **이미 배포된 함수는 Supabase 에 그대로 살아 있다.** 오너가 대시보드에서
//   따로 지워야 사라지는데, 그 사이 옛 번들·외부 스크립트가 계속 호출할 수 있다.
//   이 스텁을 배포하면 그 순간 통로가 닫힌다 — 지우는 것보다 빠르고 확실하다.
//   (완전 제거는 오너 작업: Supabase Dashboard → Edge Functions → gto-explain → Delete)
//
// 🔴 되살리려면 `supabase/functions/_archive/gto-explain-v9-2026-09-21.ts` 에 원본이 보존돼 있다.
//   스텁 배포 전에 떠 둔 것이다(ezbr_sha256 6997c0b5…). 되살리기 전에 GEMINI_API_KEY·
//   consume_ai_quota·모델 체인이 아직 유효한지 먼저 확인하라.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  // 410 Gone — '있었지만 영구히 사라졌다'. 재시도로 되살아나는 상태가 아니라는 뜻이다.
  // 앱은 이 함수를 부르지 않지만, 혹시 옛 번들이 부르더라도 규칙 요약 폴백으로 화면이 깨지지 않는다.
  return new Response(
    JSON.stringify({ error: '폐기된 기능입니다. GTO 해설은 앱 안의 규칙 요약을 사용합니다.' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
