import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// NURI HOLDEM — Gemini 프록시. 키는 서버 시크릿(GEMINI_API_KEY)에서만 읽는다(클라이언트 노출 방지).
// v3: gemini-1.5-flash 폐기 대응 — 현행 모델 + 폴백 체인(2.5-flash → 2.0-flash).
// v4: 2.5-flash thinking 토큰 소모 수정(thinkingBudget 0 + 한도 2048) + 빈 응답 폴백.
// v5: 이미지 입력(inline_data) 지원 — 순위 인증 증빙 AI 검사용(운영자). images: base64/dataURL 배열(최대 2장).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

interface ImgPart { mime: string; data: string }

function parseImages(raw: unknown): ImgPart[] {
  if (!Array.isArray(raw)) return [];
  const out: ImgPart[] = [];
  for (const item of raw.slice(0, 2)) {
    if (typeof item !== 'string' || !item) continue;
    let mime = 'image/webp';
    let data = item;
    const m = item.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
    if (m) { mime = m[1]; data = m[2]; }
    if (data.length > 4_500_000) continue; // ~3MB 원본 초과 스킵
    out.push({ mime, data });
  }
  return out;
}

async function callGemini(key: string, model: string, prompt: string, system: string, images: ImgPart[], temperature: number): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const generationConfig: Record<string, unknown> = { temperature, maxOutputTokens: 2048 };
  // thinkingConfig는 2.5 계열만 지원 — 2.0에 보내면 400
  if (model.startsWith('gemini-2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  // deno-lint-ignore no-explicit-any
  const parts: any[] = [{ text: prompt }];
  for (const img of images) parts.push({ inline_data: { mime_type: img.mime, data: img.data } });
  const payload: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig,
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST만 허용됩니다.' }, 405);
  try {
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'AI 미설정: GEMINI_API_KEY 시크릿을 등록하세요.' }, 503);
    const bodyIn = await req.json().catch(() => ({} as Record<string, unknown>));
    const prompt = typeof bodyIn.prompt === 'string' ? bodyIn.prompt : '';
    const system = typeof bodyIn.system === 'string' ? bodyIn.system : '';
    const images = parseImages(bodyIn.images);
    const temperature = typeof bodyIn.temperature === 'number' ? Math.min(1, Math.max(0, bodyIn.temperature)) : 0.85;
    if (!prompt) return json({ error: 'prompt가 필요합니다.' }, 400);
    // 요청 모델이 있으면 우선 시도하고, 실패 시 현행 모델 체인으로 폴백
    const requested = typeof bodyIn.model === 'string' && bodyIn.model ? [bodyIn.model] : [];
    const chain = [...requested, ...MODELS.filter((m) => !requested.includes(m))];
    let lastErr = '';
    for (const model of chain) {
      const r = await callGemini(key, model, prompt, system, images, temperature);
      if (r.ok) {
        const data = await r.json();
        // deno-lint-ignore no-explicit-any
        const parts = data?.candidates?.[0]?.content?.parts as any[] | undefined;
        const text = (parts ?? []).map((p) => p?.text ?? '').join('').trim();
        if (text) return json({ text, model });
        // 빈 응답(MAX_TOKENS·세이프티 등) — 다음 모델 폴백
        lastErr = `${model}: empty (${data?.candidates?.[0]?.finishReason ?? 'no candidate'})`;
        continue;
      }
      lastErr = `${model}: ${r.status} ${(await r.text()).slice(0, 200)}`;
      // 404(모델 없음)·400은 다음 모델 폴백, 그 외(401 키 오류 등)는 즉시 반환
      if (r.status !== 404 && r.status !== 400) break;
    }
    return json({ error: 'Gemini 오류', detail: lastErr }, 502);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
