// kakao-unlink 판정부 — 탈퇴 회원의 카카오 연결 끊기(unlink). 배선은 ./index.ts, 단위 테스트는 src/api/kakaoUnlink.test.ts(이 파일을 그대로 import).
// 짝 마이그레이션: supabase/migrations/20261007kb_kakao_unlink_queue.sql (kakao_unlink_queue · 삭제 트리거 · kakao_unlink_record · cron_kakao_unlink).
//
// 왜 (critical-211 P2-1): 카카오 정책 — "서비스는 반드시 탈퇴 과정에 연결 해제 요청을 포함해 앱과 사용자의 연결을 끊어야 합니다"
//   (https://developers.kakao.com/docs/latest/ko/kakaologin/common 서비스의 탈퇴 절차). 회원번호도 파기 대상 개인정보다.
//   API: POST https://kapi.kakao.com/v1/user/unlink · Authorization: KakaoAK ${앱 어드민 키} · target_id_type=user_id · target_id=<회원번호>
//   (https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api 연결 끊기 — 2026-10-07 원문 확인).
//
// 두 입구
//   ① 사용자 JWT — 탈퇴 RPC **직전에** 앱이 부른다(src/api/auth.ts withdrawMyAccount · adminWithdrawUser). 탈퇴 RPC 가 auth.identities 를
//      지우면 회원번호를 더는 못 읽으므로 그 전에 끝나야 한다. body.userId 가 없거나 본인이면 본인, 남이면 profiles.role='admin' 만.
//   ② 크론 — x-nuri-cron-secret(Vault push_shared_secret, 타이밍 안전 비교). 큐에서 못 끊은 행을 다시 시도한다(storage-purge 와 같은 방식).
// 실패해도 탈퇴는 막지 않는다(탈퇴 권리가 우선). 못 끊은 회원번호는 큐에 남아 크론이 재시도한다. 앱이 이 함수를 아예 못 불러도
//   탈퇴 RPC 가 identity 를 지우는 순간 DB 트리거가 큐에 넣는다 — 이 함수 호출은 '즉시 끊기' 일 뿐 유일한 경로가 아니다.
// 카카오가 아닌 회원은 아무것도 하지 않는다. 응답·로그에 회원번호·어드민 키·카카오 원문을 싣지 않는다(상태 코드·숫자 오류 코드만).
//
// 카카오 응답 판정(critical-211 재반증 P2-A — 공식 오류 코드 https://developers.kakao.com/docs/ko/rest-api/error-code , 2026-10-07 확인)
//   · 2xx                         → 끊음(done)
//   · 400 + code -101             → "해당 앱에 카카오계정 연결이 완료되지 않은 사용자" = 이미 끊김 → 목적 달성(done). 재시도해도 안 바뀐다.
//   · 401 (code -401 앱키 오류)   → 우리 키 문제다. DB(kakao_unlink_record)가 시도 횟수를 쓰지 않고 관리자에게 알린다.
//                                   크론은 첫 401 에서 이번 회차를 멈춘다(키가 틀리면 나머지 행도 다 401 이다).
//   · 그 밖(-103 휴면/없는 계정 포함) → 실패, 재시도. 끝내 못 끊으면 큐의 보관 기한(30일)에 파기된다.
//
// 탈퇴 사전 조건(재반증 P3-B): 탈퇴 RPC 가 거절할 회원(매장 대표 · 제재 중 본인 · 운영자 대상)이면 끊지 않는다 —
//   계정은 남는데 카카오 연결만 끊기는 것을 막는다. 조건을 읽다 실패해도 끊지 않는다(탈퇴가 실제로 되면 identity 삭제 트리거가 큐에 넣는다).
import { makeLimiter } from '../kakao-oidc-exchange/logic.ts';

export { makeLimiter };
export const UNLINK_URL = 'https://kapi.kakao.com/v1/user/unlink';
export const KAKAO_ID_RE = /^[0-9]{1,20}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 크론 재시도 상한 — 마이그레이션 cron_kakao_unlink 의 `attempts < 10` 과 같은 값 */
export const MAX_ATTEMPTS = 10;
/** 사용자당 분당 상한 — 탈퇴는 한 번이다. 관리자가 여러 명을 연달아 처리해도 넉넉한 값 */
export const PER_MINUTE = 10;
/** 카카오 공통 오류 코드 -101: 앱과 연결되지 않은 사용자(이미 끊김) — HTTP 400 */
export const KAKAO_NOT_LINKED = -101;

export interface Deps {
  /** KAKAO_ADMIN_KEY (Supabase secrets) */
  adminKey: string | undefined;
  /** Vault push_shared_secret — 크론 입구 비교용 */
  cronSecret(): Promise<string>;
  /** 유저 JWT → uid. 무효·anon 키면 null */
  getUserId(token: string): Promise<string | null>;
  getRole(uid: string): Promise<string | null>;
  /** 그 회원의 카카오 회원번호(service role 로 auth identity 를 읽는다). 카카오 회원이 아니면 null */
  getKakaoId(uid: string): Promise<string | null>;
  /** 탈퇴 RPC 가 거절할 회원인가(self = 본인 탈퇴). 읽기 실패는 throw */
  withdrawBlocked(uid: string, self: boolean): Promise<boolean>;
  /** 카카오 연결 끊기 — HTTP 상태와 응답 본문의 숫자 code(없으면 null). 본문 원문은 돌려주지 않는다. 네트워크 실패는 throw */
  unlink(kakaoId: string, adminKey: string): Promise<{ status: number; code: number | null }>;
  /** 결과를 큐에 남긴다(kakao_unlink_record) — 성공은 done 표시, 실패는 재시도 대상 */
  record(kakaoId: string, userId: string | null, ok: boolean, status: number): Promise<void>;
  /** 재시도할 행(done 아님 · attempts < MAX) */
  pending(): Promise<{ provider_id: string; user_id: string | null; attempts: number }[]>;
  /** 분당 상한 — true 면 통과 */
  allow(key: string): boolean;
  log(...a: unknown[]): void;
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });

export function timingSafeEq(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** 한 명 끊기 + 결과 기록. 기록 실패는 삼킨다 — 앱 쪽 탈퇴를 막지 않고, DB 트리거가 큐 백업을 맡는다. */
async function attempt(deps: Deps, kakaoId: string, userId: string | null): Promise<{ ok: boolean; status: number }> {
  let status = 0, code: number | null = null;
  if (!deps.adminKey) deps.log('[kakao-unlink] KAKAO_ADMIN_KEY 미설정 — 큐에 남긴다');
  else {
    try { ({ status, code } = await deps.unlink(kakaoId, deps.adminKey)); }
    catch { deps.log('[kakao-unlink] unlink fetch 실패'); }
  }
  const notLinked = status === 400 && code === KAKAO_NOT_LINKED;
  const ok = (status >= 200 && status < 300) || notLinked;
  if (notLinked) deps.log('[kakao-unlink] 이미 연결되지 않은 회원(-101) — 끊김으로 기록');
  else if (status === 401) deps.log('[kakao-unlink] 어드민 키 거절(401) — KAKAO_ADMIN_KEY 확인 필요, 시도 횟수는 쓰지 않는다');
  else if (!ok && status) deps.log('[kakao-unlink] 카카오 거절', { status, code });
  try { await deps.record(kakaoId, userId, ok, status); }
  catch { deps.log('[kakao-unlink] 큐 기록 실패'); }
  return { ok, status };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: '허용되지 않은 요청입니다' }, 405);

  try {
    // ② 크론 입구 — 헤더가 있으면 그 길로만 판정한다(사용자 JWT 로 갈아타지 않는다)
    const cron = req.headers.get('x-nuri-cron-secret');
    if (cron !== null) {
      const expected = await deps.cronSecret();
      if (!expected || !cron || !timingSafeEq(cron, expected)) {
        deps.log('[kakao-unlink] unauthorized cron');
        return json({ error: 'unauthorized' }, 401);
      }
      // 키가 없으면 큐를 건드리지 않는다 — 시도 횟수만 올라 키 등록 전에 재시도 상한을 다 써 버린다
      if (!deps.adminKey) { deps.log('[kakao-unlink] KAKAO_ADMIN_KEY 미설정 — 크론 건너뜀'); return json({ error: 'not_configured' }, 503); }
      let done = 0, failed = 0;
      for (const row of await deps.pending()) {
        if (!KAKAO_ID_RE.test(row.provider_id)) continue;
        const r = await attempt(deps, row.provider_id, row.user_id);
        if (r.ok) { done++; continue; }
        failed++;
        if (r.status === 401) return json({ done, failed, keyError: true });   // 키가 틀리면 나머지도 401 — 이번 회차는 멈춘다
        if (row.attempts + 1 >= MAX_ATTEMPTS) deps.log('[kakao-unlink] exhausted — 관리자 확인 필요(보관 기한 30일 뒤 파기)');
      }
      return json({ done, failed });
    }

    // ① 사용자 입구 — 첫 분기에서 호출자를 증명한다(보안 표준 4 — verify_jwt 는 anon 키 JWT 도 통과시킨다)
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다' }, 401);
    const uid = await deps.getUserId(auth.slice(7).trim());
    if (!uid) return json({ error: '로그인이 필요합니다' }, 401);
    if (!deps.allow(uid)) return json({ error: '잠시 후 다시 시도해 주세요', code: 'rate_limited' }, 429);

    const body = await req.json().catch(() => ({})) as { userId?: unknown } | null;
    const asked = body && typeof body === 'object' ? body.userId : undefined;
    let target = uid;
    if (asked !== undefined && asked !== null && asked !== uid) {
      if (typeof asked !== 'string' || !UUID_RE.test(asked)) return json({ error: '잘못된 요청입니다' }, 400);
      if ((await deps.getRole(uid)) !== 'admin') return json({ error: '관리자만 처리할 수 있습니다' }, 403);
      target = asked;
    }

    const kakaoId = await deps.getKakaoId(target);
    if (!kakaoId) return json({ unlinked: false, skipped: 'not_kakao' });
    if (!KAKAO_ID_RE.test(kakaoId)) { deps.log('[kakao-unlink] 회원번호 형식 불일치 — 트리거 큐에 맡긴다'); return json({ unlinked: false, queued: true }); }
    // P3-B — 탈퇴 RPC 가 거절할 회원은 끊지 않는다. 확인이 실패해도 끊지 않는다(탈퇴가 되면 identity 삭제 트리거가 큐에 넣는다)
    let blocked = true;
    try { blocked = await deps.withdrawBlocked(target, target === uid); }
    catch { deps.log('[kakao-unlink] 탈퇴 조건 확인 실패 — 즉시 끊기 생략(트리거 큐가 백업)'); }
    if (blocked) return json({ unlinked: false, skipped: 'withdraw_blocked' });
    const { ok } = await attempt(deps, kakaoId, target);
    return json(ok ? { unlinked: true } : { unlinked: false, queued: true });
  } catch {
    deps.log('[kakao-unlink] 처리 오류');
    return json({ error: '서버 오류' }, 500);
  }
}
