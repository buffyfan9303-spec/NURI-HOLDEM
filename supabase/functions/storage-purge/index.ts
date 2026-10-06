// storage-purge — 탈퇴 회원의 프로필 사진(avatars)·순위 인증 신분증/증빙(verifications)을 Storage API 로 **실제** 삭제한다.
// 짝 마이그레이션: supabase/migrations/20261006s2_withdraw_storage_purge.sql (storage_purge_queue · cron_storage_purge).
// 왜: SQL 로 storage.objects 를 지우면 파일이 버킷에 고아로 남는다(Supabase 공식 문서 Delete Objects) — security-1006/tech.md#P2-2.
// 호출: 크론 storage-purge(10분, 큐에 남은 게 있을 때만) — public.cron_storage_purge() 가 Vault 공유 시크릿을 x-nuri-cron-secret 로 동봉.
// 첫 분기 = 그 시크릿을 get_push_shared_secret(service_role 전용 RPC)로 읽어 타이밍 안전 비교. 부재·불일치 전부 401(fail-closed).
//   weekly-email-digest · weekly-report 와 같은 방식. verify_jwt 는 게이트가 아니다(anon 키 JWT 도 통과 — CLAUDE.md 보안 표준 4).
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

let expectedSecret = '';
async function loadExpectedSecret(): Promise<string> {
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
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

const MAX_ATTEMPTS = 10;   // 큐·크론의 `attempts < 10` 과 같은 값
const BATCH = 200;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const provided = req.headers.get('x-nuri-cron-secret') ?? '';
  const expected = await loadExpectedSecret();
  if (!expected || !provided || !timingSafeEq(provided, expected)) return json({ error: 'unauthorized' }, 401);

  const { data: rows, error } = await admin.from('storage_purge_queue')
    .select('id,bucket_id,name,attempts').is('done_at', null).lt('attempts', MAX_ATTEMPTS).order('id').limit(BATCH);
  // DB 오류 원문은 서버 로그에만 — 응답은 고정 문구(보안 표준 §6).
  if (error) { console.error('[storage-purge] queue read', error); return json({ error: 'queue read failed' }, 500); }

  const byBucket = new Map<string, { id: number; name: string; attempts: number }[]>();
  for (const r of rows ?? []) byBucket.set(r.bucket_id, [...(byBucket.get(r.bucket_id) ?? []), r]);

  let done = 0, failed = 0;
  for (const [bucket, items] of byBucket) {
    // remove 는 없는 경로를 오류 없이 넘긴다 → 이미 지워진 파일도 '완료'(재시도 불필요).
    const { error: rmErr } = await admin.storage.from(bucket).remove(items.map((i) => i.name));
    if (!rmErr) {
      const { error: upErr } = await admin.from('storage_purge_queue')
        .update({ done_at: new Date().toISOString(), last_error: null }).in('id', items.map((i) => i.id));
      if (upErr) console.error('[storage-purge] mark done', upErr);   // 다음 회차에 다시 remove → 멱등
      done += items.length;
      continue;
    }
    console.error('[storage-purge] remove', bucket, rmErr);
    for (const it of items) {
      await admin.from('storage_purge_queue')
        .update({ attempts: it.attempts + 1, last_error: String(rmErr.message).slice(0, 200) }).eq('id', it.id);
    }
    failed += items.length;
  }
  return json({ ok: true, done, failed });
});
