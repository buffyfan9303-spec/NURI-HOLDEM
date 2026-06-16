// 동적 sitemap 생성 — 빌드 시 승인된 대회(?s=)·활성 매장(?v=) URL 을 수집해 public/sitemap.xml 에 기록.
// 실행: build 스크립트에서 `node scripts/gen-sitemap.mjs` 로 자동 호출(아래 npm build 체인).
//
// 안전장치(중요): 환경변수 누락·네트워크 오류 등 어떤 실패에도 절대 throw 하지 않고 exit 0 한다.
//   → 기존 public/sitemap.xml 을 보존하고 빌드(tsc/vite)는 그대로 진행. SEO 보조 기능이 빌드를 막지 않게.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SITE = 'https://nuriholdem.com';
const OUT = resolve(process.cwd(), 'public', 'sitemap.xml');

// process.env 우선, 없으면 로컬 .env.local/.env 를 단순 파싱(=Vite 와 동일 변수명 재사용)
function env(name) {
  if (process.env[name]) return process.env[name];
  for (const f of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), f);
    if (!existsSync(p)) continue;
    const line = readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.startsWith(name + '='));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const URL_BASE = env('VITE_SUPABASE_URL');
const ANON = env('VITE_SUPABASE_ANON_KEY');

const today = new Date().toISOString().slice(0, 10);
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function rest(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>\n    <loc>${xmlEsc(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

async function main() {
  if (!URL_BASE || !ANON) {
    console.warn('[sitemap] VITE_SUPABASE_URL/ANON_KEY 없음 — 기존 sitemap 유지, 스킵');
    return;
  }
  // 승인된 대회 + 활성 매장(공개 목록과 동일 필터: approved=true, status=active)
  const [schedules, venues] = await Promise.all([
    rest('schedules?select=id,date&approved=eq.true'),
    rest('venues?select=id,slug&approved=eq.true&status=eq.active'),
  ]);

  const entries = [urlEntry(`${SITE}/`, today, 'daily', '1.0')];
  for (const s of schedules) {
    if (!s.id) continue;
    const lm = /^\d{4}-\d{2}-\d{2}$/.test(s.date || '') ? s.date : today;
    entries.push(urlEntry(`${SITE}/?s=${s.id}`, lm, 'weekly', '0.7'));
  }
  for (const v of venues) {
    if (!v.id) continue;
    const code = v.slug || String(v.id).slice(0, 8);
    entries.push(urlEntry(`${SITE}/?v=${code}`, today, 'weekly', '0.6'));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
  writeFileSync(OUT, xml, 'utf8');
  console.log(`[sitemap] ${entries.length} URL (대회 ${schedules.length} · 매장 ${venues.length}) → public/sitemap.xml`);
}

// 어떤 실패에도 throw 하지 않음(빌드 비차단). process.exit() 는 쓰지 않는다 —
// Windows 에서 undici 소켓이 닫히는 중 process.exit 를 호출하면 libuv assertion 으로 크래시(빌드 깨짐).
// 대신 exitCode 만 0 으로 두고 이벤트 루프가 자연 종료되도록 한다.
process.exitCode = 0;
try {
  await main();
} catch (e) {
  console.warn('[sitemap] 생성 실패 — 기존 sitemap 유지:', e.message);
}
