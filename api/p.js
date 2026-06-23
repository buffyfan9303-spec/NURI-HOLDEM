// api/p.js — 대회(포스터) 공유 링크 OG 미리보기 (Vercel 서버리스 함수, Node 런타임)
// ─────────────────────────────────────────────────────────────────────────────
// 목적: 카카오톡/페북 등 JS 미실행 스크래퍼에 대회별 미리보기(제목·포스터·바이인·일시)를
//       보여주려면 서버에서 OG 메타를 렌더해야 한다(SPA 동적 SEO 는 봇에 안 먹힘).
//  - 봇:   대회별 og:title/description/image 가 담긴 HTML 을 받아 카드 표시
//  - 사람: 즉시 /?s=<id> 로 리다이렉트되어 평소처럼 앱(포스터 상세)이 열림
//  - 오류: 어떤 경우에도 500 없이 폴백 메타 + 앱 리다이렉트 (사이트 영향 0)
// 이 경로(/p/...)는 "공유 링크" 전용이라 메인 앱과 완전히 격리되어 안전하다.
// (매장용 api/s.js 와 동일 패턴 — 대회 버전)
// ─────────────────────────────────────────────────────────────────────────────

const ORIGIN = 'https://nuriholdem.com';
const MAN = 10000;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
  let id = '';
  try {
    const u = new URL(req.url, ORIGIN);
    // 스케줄 id 는 uuid — 영숫자/하이픈만 허용
    id = (u.searchParams.get('id') || '').slice(0, 40).replace(/[^a-zA-Z0-9-]/g, '');
  } catch { /* ignore */ }

  const appUrl = id ? `${ORIGIN}/?s=${encodeURIComponent(id)}` : ORIGIN;

  // 폴백(기본) 메타 — 대회를 못 찾거나 오류일 때
  let title = 'NURI HOLDEM | 홀덤 대회 일정';
  let desc = '전국 홀덤 대회 일정 · 홀덤펍 커뮤니티 · 중고장터';
  let image = `${ORIGIN}/icon-512.png`;

  try {
    const SB = process.env.VITE_SUPABASE_URL;
    const KEY = process.env.VITE_SUPABASE_ANON_KEY;
    if (SB && KEY && id) {
      const sel = 'title,pub_name,region,address,date,start_time,format,prize_pool,guaranteed,buy_in,poster_url,description';
      const r = await fetch(`${SB}/rest/v1/schedules?id=eq.${encodeURIComponent(id)}&select=${sel}&limit=1`, {
        headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
      });
      if (r.ok) {
        const rows = await r.json();
        const s = Array.isArray(rows) && rows[0] ? rows[0] : null;
        if (s) {
          const where = s.pub_name || s.region || '';
          const buyMan = s && s.buy_in && typeof s.buy_in.amount === 'number'
            ? Math.round(s.buy_in.amount / MAN) : 0;
          const gtd = s.guaranteed && s.prize_pool
            ? `${Math.round(s.prize_pool / MAN).toLocaleString()}만 GTD` : '';
          const when = `${s.date || ''} ${(s.start_time || '').slice(0, 5)}`.trim();
          title = `${s.title}${where ? ` · ${where}` : ''} | 홀덤 대회`;
          const bits = [where, when, s.format,
            buyMan ? `바이인 ${buyMan.toLocaleString()}만` : '', gtd]
            .filter(Boolean).join(' · ');
          desc = (s.description ? `${bits} — ${String(s.description)}` : bits).slice(0, 150) || desc;
          if (s.poster_url) image = s.poster_url;
        }
      }
    }
  } catch { /* 폴백 메타 유지 */ }

  const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
    + `<title>${esc(title)}</title>`
    + `<meta name="description" content="${esc(desc)}"/>`
    + '<meta property="og:type" content="article"/>'
    + '<meta property="og:site_name" content="NURI HOLDEM"/>'
    + `<meta property="og:title" content="${esc(title)}"/>`
    + `<meta property="og:description" content="${esc(desc)}"/>`
    + `<meta property="og:image" content="${esc(image)}"/>`
    + `<meta property="og:url" content="${esc(appUrl)}"/>`
    + '<meta property="og:locale" content="ko_KR"/>'
    + '<meta name="twitter:card" content="summary_large_image"/>'
    + `<meta name="twitter:title" content="${esc(title)}"/>`
    + `<meta name="twitter:description" content="${esc(desc)}"/>`
    + `<meta name="twitter:image" content="${esc(image)}"/>`
    + `<meta http-equiv="refresh" content="0; url=${esc(appUrl)}"/>`
    + `<script>location.replace(${JSON.stringify(appUrl)})</script>`
    + '</head><body style="background:#0A0C0F;color:#F0F4FF;font-family:sans-serif;text-align:center;padding:40px">'
    + `대회 상세로 이동합니다… <a style="color:#FFD100" href="${esc(appUrl)}">바로가기</a></body></html>`;

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=300, s-maxage=600');
  res.status(200).send(html);
}
