// @ts-nocheck
// send-push — 지정한 회원들에게 웹 푸시 발송
// secrets 필요: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (SUPABASE_URL / SERVICE_ROLE_KEY는 기본 제공)
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// PUSH-SEC: 유일한 정상 호출자는 DB 트리거(push_on_notification)이며, 트리거는 Vault의
// 공유 시크릿을 x-nuri-push-secret 헤더로 동봉한다. 기대값은 service_role 전용 RPC로
// 콜드스타트당 1회 로드해 캐시. 시크릿 부재·불일치는 전부 401(fail-closed) —
// 시크릿 로테이션 시(vault 갱신) 함수 재배포로 캐시를 비울 것.
let expectedSecret = '';
async function loadExpectedSecret(admin: any): Promise<string> {
  if (expectedSecret) return expectedSecret;
  const { data } = await admin.rpc('get_push_shared_secret');
  if (typeof data === 'string' && data.length > 0) expectedSecret = data;
  return expectedSecret;
}
function timingSafeEq(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const provided = req.headers.get('x-nuri-push-secret') ?? '';
  const expected = await loadExpectedSecret(admin);
  if (!expected || !provided || !timingSafeEq(provided, expected)) {
    return json({ error: 'unauthorized' }, 401);
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return json({ error: 'VAPID 키가 설정되지 않았습니다 (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secret 등록 필요)' }, 503);
  }
  webpush.setVapidDetails('mailto:admin@nuriholdem.com', VAPID_PUBLIC, VAPID_PRIVATE);

  let payloadIn: any = {};
  try { payloadIn = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  // 두 가지 입력 지원:
  //  (a) 직접 호출: { userIds:[], title, body, url, tag }
  //  (b) Supabase Database Webhook(notifications INSERT): { type:'INSERT', record:{...} }
  let userIds: string[]; let title: string; let body: string; let url: string; let tag: string | undefined;
  if (payloadIn?.type === 'INSERT' && payloadIn?.record) {
    const r = payloadIn.record;
    userIds = r.user_id ? [r.user_id] : [];
    title = r.title ?? 'NHoldem';
    body = r.message ?? '';
    url = r.link ?? '/';
    tag = r.type;
  } else {
    userIds = payloadIn.userIds; title = payloadIn.title; body = payloadIn.body; url = payloadIn.url; tag = payloadIn.tag;
  }
  if (!Array.isArray(userIds) || userIds.length === 0) return json({ sent: 0 });

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (error) return json({ error: error.message }, 500);

  const message = JSON.stringify({ title: title ?? 'NHoldem', body: body ?? '', url: url ?? '/', tag });
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
        );
        sent += 1;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }),
  );
  return json({ sent });
});
