#!/usr/bin/env node
// 부하 테스트 — 실제 사용자 흐름(홈 + 공개 API)을 동시 접속으로 재현.
//   실행: node scripts/loadtest.mjs [동시접속수] [지속초]
//   예:   node scripts/loadtest.mjs 50 20
//
// ⚠️ 프로덕션에 실제 트래픽을 보냅니다. Supabase 무료 Egress(5GB/월)를 소모하므로
//    끝나면 소모량 추정치를 출력합니다. 짧게(20~30초) 여러 번이 안전합니다.
import autocannon from 'autocannon';

const SITE = process.env.LOAD_TARGET ?? 'https://nuriholdem.com';
const SUPA = 'https://idsxiqspecrucvfvtgbw.supabase.co';
const ANON = process.env.LOAD_ANON_KEY ?? '';

const connections = Number(process.argv[2] ?? 50);
const duration = Number(process.argv[3] ?? 20);

// 실제 첫 방문자가 받는 것: 홈 문서 + 공개 일정/매장 API
const requests = [
  { method: 'GET', path: '/' },
  ...(ANON ? [
    { method: 'GET', path: '/rest/v1/schedules?select=*&approved=eq.true&order=date.asc&limit=60', origin: SUPA },
    { method: 'GET', path: '/rest/v1/venues?select=*&status=eq.active&limit=50', origin: SUPA },
  ] : []),
];

const fmt = (n) => (n / 1024 / 1024).toFixed(1);

async function run(target, reqs, label) {
  const r = await autocannon({
    url: target,
    connections,
    duration,
    requests: reqs,
    headers: ANON && target === SUPA ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
  });
  console.log(`\n── ${label} ─────────────────────────────`);
  console.log(`  동시접속 ${connections} · ${duration}초`);
  console.log(`  RPS(평균)      : ${r.requests.average.toFixed(0)}`);
  console.log(`  지연 p50/p95/p99: ${r.latency.p50} / ${r.latency.p97_5} / ${r.latency.p99} ms`);
  console.log(`  최대 지연       : ${r.latency.max} ms`);
  console.log(`  총 요청/에러    : ${r.requests.total} / ${r.errors} (timeout ${r.timeouts})`);
  console.log(`  non-2xx        : ${r.non2xx}`);
  console.log(`  전송량          : ${fmt(r.throughput.total)} MB`);
  return r;
}

const site = await run(SITE, [requests[0]], '① 웹(홈 문서) — Vercel CDN');
let api = null;
if (ANON) api = await run(SUPA, requests.slice(1), '② 공개 API — Supabase(Egress 소모)');

console.log('\n════ 요약 ════');
console.log(`  웹 RPS ${site.requests.average.toFixed(0)} · p95 ${site.latency.p97_5}ms · 에러 ${site.errors + site.non2xx}`);
if (api) {
  console.log(`  API RPS ${api.requests.average.toFixed(0)} · p95 ${api.latency.p97_5}ms · 에러 ${api.errors + api.non2xx}`);
  console.log(`  ⚠️ 이번 테스트 Supabase Egress 소모 ≈ ${fmt(api.throughput.total)} MB (무료 5GB 중)`);
}
console.log(`  총 전송량 ≈ ${fmt(site.throughput.total + (api?.throughput.total ?? 0))} MB`);
