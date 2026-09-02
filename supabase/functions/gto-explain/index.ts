// @ts-nocheck
// gto-explain — GTO 프리플랍 스팟을 Gemini 로 해설 (교육용)
// secret 필요: GEMINI_API_KEY  (Google AI Studio 키 — 서버 시크릿에만 존재, 클라이언트 미노출)
// 2026-09-02 보안: **로그인 유저만** + 유저별 일일 상한(consume_ai_quota). 이전엔 공개 anon 키만으로
//   누구나 호출 가능해 Gemini 과금 남용 통로였다. 앱은 실패 시 규칙 요약으로 폴백하므로 401/429 도 UI 를 깨지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DAILY_LIMIT = 100; // 유저·일 — 학습 도구라 넉넉히, 그러나 무한은 아니다

async function requireUser(req) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const { data, error } = await createClient(SUPABASE_URL, ANON_KEY).auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}
async function consumeQuota(userId, kind, limit) {
  const { data, error } = await createClient(SUPABASE_URL, SERVICE_ROLE)
    .rpc('consume_ai_quota', { p_user_id: userId, p_kind: kind, p_limit: limit });
  if (error || !data) return { ok: false, used: -1 };
  return { ok: !!data.ok, used: Number(data.used ?? 0) };
}

// ⚠ 모델 이름은 만료된다. gemini-1.5-flash 는 은퇴했고(2026-08-29 실측: ListModels 39개 중 부재),
//   이 함수는 그걸 계속 물고 있어서 **키가 멀쩡한데도 404** 로 죽어 있었다.
//   앱은 실패 시 규칙 요약으로 조용히 폴백하므로 아무도 눈치채지 못했다.
//   → 이제 체인으로 시도한다. 마지막의 -latest 별칭은 구글이 항상 살아 있는 모델을 가리키므로,
//     앞의 두 개가 모두 은퇴해도 이 함수는 스스로 살아남는다(같은 사고 재발 방지).
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

function pct(n) { return Math.round((Number(n) || 0) * 100); }

const HEAD = [
  '너는 텍사스 홀덤 GTO 코치다. 한국어로 3~4문장, 마크다운·목록 없이 평문으로만 답하라.',
  '전략 학습용 설명이다 — 실제 베팅 권유가 아니고, 금액·수익·환전 이야기는 절대 하지 마라.',
];

/** 구(舊) 형태: 프리플랍 시나리오 + 콤보 + GTO 빈도 */
function buildPreflopPrompt(b) {
  const f = b.frequency ?? {};
  const villain = b.villain
    ? `상대 ${b.villain.position}의 ${b.villain.sizingBb ?? ''}bb 레이즈에 대한 대응`
    : `${b.heroPosition} 첫 오픈(RFI)`;
  return [
    ...HEAD,
    '',
    `상황: ${b.scenarioLabel} (${villain}, ${b.stackDepthBb}bb)`,
    `핸드: ${b.comboId} (${b.comboKind})`,
    `GTO 빈도 — 레이즈 ${pct(f.raise)}%, 콜 ${pct(f.call)}%, 폴드 ${pct(f.fold)}%`,
    '',
    '왜 이런 빈도가 나오는지(핸드 강도/포지션/상대 레인지 관점)와 실전 팁을 초보자도 이해하게 설명하라.',
  ].join('\n');
}

/**
 * 신(新) 형태: Hero/Villain 카드와 보드가 특정된 심화 스팟(GTO 검색).
 * 화면이 이미 스트릿별 승률과 권장 액션을 규칙으로 보여주므로, AI 는 **그 숫자를 반복하지 말고**
 * '왜 그렇게 되는지' 를 말해야 값이 있다 — 프롬프트로 그 역할을 명시한다.
 */
function buildDeepPrompt(b) {
  const eq = b.equities ?? {};
  const line = (label, v) => (typeof v === 'number' ? `${label} ${pct(v)}%` : `${label} —`);
  const board = Array.isArray(b.board) && b.board.length ? b.board.join(' ') : '(아직 없음)';
  return [
    ...HEAD,
    '',
    `내 핸드: ${(b.heroCards ?? []).join(' ')}`,
    `상대 핸드: ${(b.villainCards ?? []).join(' ')}`,
    `보드: ${board}`,
    `내 승률 — ${[line('프리플랍', eq.pre), line('플랍', eq.flop), line('턴', eq.turn), line('리버', eq.river)].join(' / ')}`,
    '',
    '이미 화면에 승률 숫자와 권장 액션이 표시돼 있다. 숫자를 다시 나열하지 말고,',
    '이 매치업에서 승률이 그렇게 움직이는 이유(핸드 구조·보드 텍스처·아웃츠·블로커)와',
    '상대가 이런 핸드일 때 실전에서 주의할 점을 설명하라.',
  ].join('\n');
}

function buildPrompt(b) {
  return Array.isArray(b.heroCards) && b.heroCards.length >= 2
    ? buildDeepPrompt(b)
    : buildPreflopPrompt(b);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!GEMINI_KEY) return json({ error: 'GEMINI_API_KEY 시크릿이 설정되지 않았습니다' }, 503);

  const userId = await requireUser(req);
  if (!userId) return json({ error: '로그인이 필요합니다' }, 401);
  const quota = await consumeQuota(userId, 'gto', DAILY_LIMIT);
  if (!quota.ok) return json({ error: quota.used < 0 ? 'quota_unavailable' : 'quota_exceeded', limit: DAILY_LIMIT }, 429);

  let b = {};
  try { b = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  // 구 형태는 comboId, 신 형태(심화 스팟)는 heroCards 로 식별한다.
  const isDeep = Array.isArray(b.heroCards) && b.heroCards.length >= 2;
  if (!isDeep && !b.comboId) return json({ error: 'comboId 또는 heroCards 가 필요합니다' }, 400);

  const prompt = buildPrompt(b);
  let lastStatus = 0;
  let lastDetail = '';

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
    const generationConfig = { temperature: 0.4, maxOutputTokens: 320 };
    // thinkingConfig 는 2.5 계열 전용 — 2.0 에 보내면 400. 끄지 않으면 사고 토큰이 출력 한도를
    // 먹어 빈 응답이 온다(gemini 함수 v4 에서 이미 겪은 문제).
    if (model.startsWith('gemini-2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };

    let r;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
      });
    } catch (e) {
      lastStatus = 0; lastDetail = String(e).slice(0, 200);
      continue; // 네트워크 실패도 다음 모델로 — 한 번의 일시 오류로 기능을 죽이지 않는다
    }
    if (!r.ok) {
      lastStatus = r.status; lastDetail = (await r.text()).slice(0, 300);
      continue; // 404(은퇴 모델)·400 모두 다음 후보로
    }
    const data = await r.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p?.text ?? '')
      .join('')
      .trim();
    if (text) return json({ text, model });
    lastStatus = 502; lastDetail = 'empty response';
  }
  return json({ error: 'gemini_error', status: lastStatus, detail: lastDetail }, 502);
});
