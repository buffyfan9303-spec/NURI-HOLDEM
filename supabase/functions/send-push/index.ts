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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
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
