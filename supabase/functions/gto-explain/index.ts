// @ts-nocheck
// gto-explain — GTO 프리플랍 스팟을 Gemini 로 해설 (교육용)
// secret 필요: GEMINI_API_KEY  (Google AI Studio 키)
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = 'gemini-1.5-flash';

function pct(n) { return Math.round((Number(n) || 0) * 100); }

function buildPrompt(b) {
  const f = b.frequency ?? {};
  const villain = b.villain
    ? `상대 ${b.villain.position}의 ${b.villain.sizingBb ?? ''}bb 레이즈에 대한 대응`
    : `${b.heroPosition} 첫 오픈(RFI)`;
  return [
    '너는 텍사스 홀덤 GTO 코치다. 아래 프리플랍 스팟을 한국어로 2~3문장으로 간결하게 설명하라.',
    '실제 베팅/환전 권유가 아니라 전략 학습용 설명이다. 마크다운/목록 없이 평문으로만 답하라.',
    '',
    `상황: ${b.scenarioLabel} (${villain}, ${b.stackDepthBb}bb)`,
    `핸드: ${b.comboId} (${b.comboKind})`,
    `GTO 빈도 — 레이즈 ${pct(f.raise)}%, 콜 ${pct(f.call)}%, 폴드 ${pct(f.fold)}%`,
    '',
    '왜 이런 빈도가 나오는지(핸드 강도/포지션/상대 레인지 관점)와 실전 팁을 초보자도 이해하게 설명하라.',
  ].join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!GEMINI_KEY) return json({ error: 'GEMINI_API_KEY 시크릿이 설정되지 않았습니다' }, 503);

  let b = {};
  try { b = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  if (!b.comboId) return json({ error: 'comboId required' }, 400);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(b) }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 320 },
      }),
    });
  } catch (e) {
    return json({ error: 'network', detail: String(e).slice(0, 200) }, 502);
  }
  if (!r.ok) {
    const t = await r.text();
    return json({ error: 'gemini_error', status: r.status, detail: t.slice(0, 300) }, 502);
  }
  const data = await r.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p?.text ?? '')
    .join('')
    .trim();
  if (!text) return json({ error: 'empty' }, 502);
  return json({ text });
});
