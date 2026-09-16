import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// NURI HOLDEM — PortOne 웹훅 수신기.
//
// 등록 주소: https://<project>.supabase.co/functions/v1/portone-webhook
//
// 🔴 이 함수는 **로그인 없이 외부에서 호출된다.** 그래서 호출자 증명이 전부다:
//   · `verify_jwt` 는 게이트가 **아니다** — anon 키 JWT 도 통과한다(CLAUDE.md 보안 표준 4).
//   · 진짜 게이트는 **Standard Webhooks 서명**이다. PortOne 이 보내는
//     `webhook-id` · `webhook-timestamp` · `webhook-signature` 를 공유 시크릿으로 검증한다.
//   · 비교는 **타이밍 안전**하게 한다(보안 표준 4의 '타이밍 안전 비교').
//
// 지금은 **검증 + 기록만** 한다. 결제 업무 로직(이용권 지급 등)은 아직 없으므로 지어내지 않는다.
//   나중에 그 로직이 생기면 `portone_webhook_events` 가 '무엇이 실제로 도착했는가' 의 정본이 된다.
//
// 재전송은 **정상 동작**이다(2xx 를 못 받으면 PortOne 이 다시 보낸다).
//   멱등성은 DB 가 보장한다 — `webhook_id` 가 기본키이고 on conflict 로 조용히 접힌다.
//   엣지 함수 메모리로는 못 막는다(인스턴스가 여럿이고 동시 요청이 있다).

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

/** 타이밍 안전 비교 — 길이가 다르면 곧바로 false, 같으면 전 바이트를 XOR 누적한다. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * 시크릿을 원문 바이트로. PortOne(Standard Webhooks)은 `whsec_` 접두 + base64 다.
 * ⚠ 접두가 없는 형태로 주는 콘솔도 있어 둘 다 받는다. base64 디코딩이 실패하면 **원문 그대로**를 쓴다
 *   — 여기서 조용히 빈 키를 쓰면 모든 요청이 통과하는 fail-open 이 된다. 그래서 실패를 감추지 않는다.
 */
function secretToBytes(secret: string): Uint8Array {
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  try {
    return b64ToBytes(raw);
  } catch {
    return new TextEncoder().encode(raw);
  }
}

Deno.serve(async (req: Request) => {
  // GET 은 등록 확인용으로만 답한다(본문 없음). 그 외 비-POST 는 거절.
  if (req.method === 'GET') return json({ ok: true, service: 'portone-webhook' });
  if (req.method !== 'POST') return json({ error: 'POST만 허용됩니다.' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE) return json({ error: '서버 설정 오류' }, 500);
  const admin = createClient(SUPABASE_URL, SERVICE);

  // 시크릿 — 엣지 함수 env 를 먼저 보고, 없으면 secret_settings(RLS 전면잠금, service_role 전용).
  // 두 곳을 다 보는 이유: 이 저장소는 두 관행이 섞여 있다(PORTONE_V2_API_SECRET=env · RESEND_API_KEY=table).
  let secret = Deno.env.get('PORTONE_WEBHOOK_SECRET') ?? '';
  if (!secret) {
    const { data } = await admin.from('secret_settings').select('value').eq('key', 'PORTONE_WEBHOOK_SECRET').maybeSingle();
    secret = typeof data?.value === 'string' ? data.value : '';
  }
  // 🔴 시크릿이 없으면 **막는다**(fail-closed). 열어 두면 아무나 결제 이벤트를 위조할 수 있다.
  if (!secret) return json({ error: '웹훅 미설정: PORTONE_WEBHOOK_SECRET 이 없습니다.' }, 503);

  const id = req.headers.get('webhook-id') ?? '';
  const ts = req.headers.get('webhook-timestamp') ?? '';
  const sigHeader = req.headers.get('webhook-signature') ?? '';
  if (!id || !ts || !sigHeader) return json({ error: '서명 헤더가 없습니다.' }, 401);

  // 재생 공격 방지 — 서명된 시각이 현재와 5분 이상 벌어지면 거절.
  const tsSec = Number(ts);
  if (!Number.isFinite(tsSec)) return json({ error: '서명 시각이 올바르지 않습니다.' }, 401);
  const skewSec = Math.abs(Date.now() / 1000 - tsSec);
  if (skewSec > 300) return json({ error: '서명 시각이 만료되었습니다.' }, 401);

  const body = await req.text();

  // Standard Webhooks: HMAC-SHA256 over `{id}.{timestamp}.{body}`
  const key = await crypto.subtle.importKey('raw', secretToBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = bytesToB64(mac);

  // 헤더는 `v1,<sig> v1,<sig2>` 처럼 **여러 개**일 수 있다(키 로테이션 중). 하나라도 맞으면 통과.
  const ok = sigHeader.split(' ').some((part) => {
    const sig = part.includes(',') ? part.slice(part.indexOf(',') + 1) : part;
    try {
      return timingSafeEqual(b64ToBytes(sig), b64ToBytes(expected));
    } catch {
      return false;
    }
  });
  if (!ok) return json({ error: '서명이 올바르지 않습니다.' }, 401);

  // ── 여기서부터는 PortOne 이 보낸 것이 증명됐다 ──────────────────────────────
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(body) as Record<string, unknown>; } catch { /* 본문이 JSON 이 아니어도 기록은 남긴다 */ }

  const eventType = typeof payload.type === 'string' ? payload.type : null;
  const dataObj = (payload.data ?? {}) as Record<string, unknown>;
  const paymentId = typeof dataObj.paymentId === 'string' ? dataObj.paymentId
    : typeof dataObj.identityVerificationId === 'string' ? dataObj.identityVerificationId
    : null;

  // 멱등 — 같은 webhook-id 가 다시 오면 조용히 접힌다(재전송은 정상 동작이다).
  const { error } = await admin.from('portone_webhook_events').upsert({
    webhook_id: id,
    event_type: eventType,
    payment_id: paymentId,
    signed_at: new Date(tsSec * 1000).toISOString(),
    payload: payload as unknown,
  }, { onConflict: 'webhook_id', ignoreDuplicates: true });

  // 🔴 기록 실패에 500 을 돌려준다 — 2xx 를 주면 PortOne 이 '전달 완료' 로 보고 재전송을 멈춘다.
  //    그러면 그 이벤트는 **영원히 유실**된다. 실패는 실패라고 말해야 다시 온다.
  if (error) return json({ error: '기록 실패' }, 500);

  return json({ ok: true });
});
