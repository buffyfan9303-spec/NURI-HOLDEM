import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { SYSTEM_PROMPT, buildPrompt, checkOutput, spotToText, UUID_RE } from './logic.ts';

// NURI HOLDEM — NURI SPOT 'AI 아쉬운 포인트' (2026-09-23 오너 결정 SPOT-WRITE-UX-AI)
//
// 09-11 "외부 AI 는 TDA 규칙 질의 하나" 결정을 SPOT 코칭까지 넓힌 두 번째(이자 마지막) AI 함수다.
// 뼈대는 tda-assist 와 같다: 로그인 증명 → 입력 검증 → 일일 시도 상한 → 서버 고정 프롬프트 → 모델 폴백.
//
// 클라이언트가 보낼 수 있는 것은 **spotId 하나**다. 스팟 내용은 서버가 spot_reviews 에서 직접 읽는다
// (_spot_ai_begin — 작성자 본인 행만, 아니면 NOT_OWNER). system/model/temperature/prompt 는 서버 고정.
//
// 과금 흐름(20260923c): _spot_ai_begin 이 포인트 30 을 먼저 잡고 pending 행을 만든다 →
//   모델 호출·출력 검사 통과 → _spot_ai_finish. **그 사이 어디서 실패해도 _spot_ai_refund**(멱등).
//   함수가 통째로 죽어 환불을 못 하면 다음 begin 이 5분 지난 pending 을 환불한다.
// 결과는 본인만 읽는 spot_ai_reviews 에만 남는다 — 게시판 공유(share_spot_post)에 실리지 않는다.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// 서버 고정값 — 클라이언트가 바꿀 수 없다.
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const TEMPERATURE = 0.3;
const MAX_OUTPUT_TOKENS = 1024;
const UPSTREAM_TIMEOUT_MS = 20_000;
const ATTEMPT_LIMIT = 6;   // 유저·일 **시도** 상한(consume_ai_quota). 과금 상한 3회는 DB(_spot_ai_begin)가 따로 센다.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Authorization: Bearer <user jwt> → 유저 id. anon 키 JWT·부재·만료는 전부 null(fail-closed). */
async function requireUser(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

const CODE_MSG: Record<string, string> = {
  NOT_OWNER: '내가 저장한 스팟만 AI 코칭을 받을 수 있습니다.',
  SANCTIONED: '이용이 제한된 계정입니다.',
  DAILY_LIMIT: '오늘 AI 코칭 3회를 모두 썼습니다. 내일 다시 이용해 주세요.',
  DISABLED: '지금은 AI 코칭을 이용할 수 없습니다.',
  INSUFFICIENT: '포인트가 부족합니다.',
  PENDING: '이 스팟의 코칭을 만드는 중입니다. 잠시 후 다시 열어 주세요.',
};

async function callGemini(key: string, model: string, prompt: string): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const generationConfig: Record<string, unknown> = { temperature: TEMPERATURE, maxOutputTokens: MAX_OUTPUT_TOKENS };
  // thinkingConfig 는 2.5 계열만 지원 — 2.0 에 보내면 400 (tda-assist 와 같은 교훈)
  if (model.startsWith('gemini-2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig,
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: ac.signal,
    });
  } finally { clearTimeout(timer); }
}

/** 모델 폴백 한 바퀴 → 본문 텍스트 또는 null. 상류 오류 본문은 로그에만. */
async function generate(key: string, prompt: string): Promise<{ text: string; model: string } | null> {
  let lastErr = '';
  for (const model of MODELS) {
    let r: Response;
    try { r = await callGemini(key, model, prompt); }
    catch (e) { lastErr = `${model}: ${e instanceof Error ? e.name : 'fetch fail'}`; continue; }
    if (r.ok) {
      const data = await r.json();
      // deno-lint-ignore no-explicit-any
      const parts = data?.candidates?.[0]?.content?.parts as any[] | undefined;
      const text = (parts ?? []).map((p) => p?.text ?? '').join('').trim();
      if (text) return { text, model };
      lastErr = `${model}: empty (${data?.candidates?.[0]?.finishReason ?? 'no candidate'})`;
      continue;
    }
    lastErr = `${model}: ${r.status} ${(await r.text()).slice(0, 200)}`;
    if (r.status !== 404 && r.status !== 400) break;
  }
  console.error('[spot-review] 상류 오류', lastErr);
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST만 허용됩니다.' }, 405);
  // begin 이 성공한 뒤에만 채워진다 — 이 값이 있는 채로 빠져나가면 반드시 환불한다.
  let pendingId: number | null = null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  /** 환불 RPC 가 **true** 를 돌려줬을 때만 환불된 것이다(F3, 2026-09-24 critical-reviewer). */
  const refund = async (): Promise<boolean> => {
    if (pendingId === null) return false;
    const id = pendingId; pendingId = null;
    const { data, error } = await admin.rpc('_spot_ai_refund', { p_id: id });
    if (error || data !== true) console.error('[spot-review] 환불 미확인(5분 뒤 다음 요청의 begin 이 환불한다)', id, error?.message ?? data);
    return !error && data === true;
  };
  const failRefunded = async () => {
    if (await refund()) {
      return json({ error: 'AI 답변을 받지 못했습니다. 포인트를 돌려드렸어요.', code: 'AI_FAILED', refunded: true }, 502);
    }
    // 환불이 확인되지 않았다 — '돌려드렸다' 고 말하지 않는다. 남은 pending 은 5분 크론(_spot_ai_refund_stale)이 환불한다.
    return json({ error: 'AI 답변을 받지 못했습니다. 포인트는 5분 안에 자동으로 돌려드려요. 결과가 저장됐다면 내 스팟에서 확인할 수 있어요.', code: 'REFUND_PENDING', refunded: false }, 502);
  };
  try {
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'AI 미설정: GEMINI_API_KEY 시크릿을 등록하세요.' }, 503);

    const userId = await requireUser(req);
    if (!userId) return json({ error: '로그인이 필요합니다.' }, 401);

    const bodyIn = await req.json().catch(() => ({} as Record<string, unknown>));
    const spotId = typeof bodyIn.spotId === 'string' ? bodyIn.spotId.trim() : '';
    if (!UUID_RE.test(spotId)) return json({ error: '스팟 id 형식이 올바르지 않습니다.' }, 400);

    // 시도 상한 — 과금(3회)과 별개로, 같은 사람이 함수를 두드리는 것 자체를 막는다. RPC 장애는 fail-closed.
    const q = await admin.rpc('consume_ai_quota', { p_user_id: userId, p_kind: 'spot', p_limit: ATTEMPT_LIMIT });
    // deno-lint-ignore no-explicit-any
    const qd = q.data as any;
    if (q.error || !qd) return json({ error: 'AI 사용량 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, 429);
    if (!qd.ok) return json({ error: '오늘 AI 코칭 요청이 너무 많습니다. 내일 다시 이용해 주세요.', code: 'ATTEMPT_LIMIT' }, 429);

    const b = await admin.rpc('_spot_ai_begin', { p_user: userId, p_spot: spotId, p_limit: 3 });
    if (b.error || !b.data) {
      console.error('[spot-review] begin 실패', b.error?.message);
      return json({ error: 'AI 코칭을 시작하지 못했습니다. 포인트는 차감되지 않았습니다.' }, 500);
    }
    // deno-lint-ignore no-explicit-any
    const bd = b.data as any;
    if (!bd.ok) {
      const code = String(bd.code ?? 'DISABLED');
      return json({ error: CODE_MSG[code] ?? '요청을 처리할 수 없습니다.', code, available: bd.available, price: bd.price, used: bd.used }, 409);
    }
    if (bd.cached) {
      if (bd.status === 'done' && typeof bd.body === 'string') return json({ ok: true, cached: true, body: bd.body });
      return json({ error: CODE_MSG.PENDING, code: 'PENDING' }, 409);
    }
    pendingId = Number(bd.id);

    const spot = spotToText(bd.spot);
    if (!spot) { console.error('[spot-review] 스팟 형식 불명', spotId); return await failRefunded(); }
    const prompt = buildPrompt(spot);

    // 출력 검사 실패는 한 번만 다시 묻는다 — 그래도 수치를 지어내면 결과를 버리고 환불한다.
    let passed: { body: string; model: string } | null = null;
    for (let attempt = 0; attempt < 2 && !passed; attempt++) {
      const g = await generate(key, prompt);
      if (!g) break;
      const c = checkOutput(g.text, spot.text);   // 스팟에 나온 숫자만 허용(허용목록)
      if (c.ok) passed = { body: c.body, model: g.model };
      else console.warn('[spot-review] 출력 검사 탈락', c.why);
    }
    if (!passed) return await failRefunded();

    const f = await admin.rpc('_spot_ai_finish', { p_id: pendingId, p_body: passed.body, p_model: passed.model });
    if (f.error || f.data !== true) {
      console.error('[spot-review] finish 실패', f.error?.message);
      return await failRefunded();
    }
    pendingId = null;
    return json({ ok: true, cached: false, body: passed.body, used: bd.used, available: bd.available });
  } catch (e) {
    console.error('[spot-review]', e);
    if (pendingId !== null) return await failRefunded();
    return json({ error: '서버 오류' }, 500);
  }
});
