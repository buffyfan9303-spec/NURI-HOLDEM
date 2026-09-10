// api/health.js — 운영 상태 확인 엔드포인트 (Vercel 서버리스 함수, Node 런타임)
// ─────────────────────────────────────────────────────────────────────────────
// 왜: 지금까지 /api/health 는 vercel.json 의 SPA 폴백(/(.*) → /index.html)에 걸려
//     **HTML 200** 을 돌려줬다. 외부 모니터가 "정상"으로 읽지만 DB 가 죽어도 200 이었다.
//     이 파일이 생기면 Vercel 파일시스템 라우팅이 rewrite 보다 먼저 잡는다(api/p.js·s.js 와 같은 방식).
//
// 계약:
//  - 200 {status:'ok', version, env, db:{ok:true, ms}, ts}   — DB 읽기 프로브 성공
//  - 503 {status:'degraded', version, env, db:{ok:false, reason}, ts} — 프로브 실패·타임아웃(3초)·환경 미설정
//  - Cache-Control: no-store (모니터가 캐시된 200 을 보면 안 된다)
//  - 비밀·테이블 내용·내부 오류 문자열·PII 는 싣지 않는다. reason 은 고정된 코드 3종뿐.
//  - 프로브는 anon 키로 공개 테이블 1행(venues.id) 을 읽는 값싼 SELECT — 쓰기 없음, 인증 없음.
// ─────────────────────────────────────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 3000;

function version() {
  // Vercel 이 빌드마다 주입한다. 로컬·미설정이면 'dev'.
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || '';
  return sha ? sha.slice(0, 7) : 'dev';
}

async function probeDb(fetchImpl) {
  const SB = process.env.VITE_SUPABASE_URL;
  const KEY = process.env.VITE_SUPABASE_ANON_KEY;
  if (!SB || !KEY) return { ok: false, reason: 'unconfigured' };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const r = await fetchImpl(`${SB}/rest/v1/venues?select=id&limit=1`, {
      headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
      signal: ctl.signal,
    });
    if (!r.ok) return { ok: false, reason: 'upstream' };
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, reason: e && e.name === 'AbortError' ? 'timeout' : 'upstream' };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res, deps) {
  const fetchImpl = (deps && deps.fetch) || globalThis.fetch;
  const db = await probeDb(fetchImpl);
  const body = {
    status: db.ok ? 'ok' : 'degraded',
    version: version(),
    env: process.env.VERCEL_ENV || 'local',
    db,
    ts: new Date().toISOString(),
  };
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.status(db.ok ? 200 : 503).send(JSON.stringify(body));
}
