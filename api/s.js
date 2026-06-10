// api/s.js — 매장 공유 링크 OG 미리보기 (Vercel 서버리스 함수, Node 런타임)
// ─────────────────────────────────────────────────────────────────────────────
// 목적: 카카오톡/페북 등 SNS 봇은 JS를 실행하지 않으므로, 공유 링크에 매장별
//       미리보기(이름·사진·소개)를 보여주려면 서버에서 OG 메타를 렌더해야 한다.
//  - 봇:   매장별 og:title/description/image 가 담긴 HTML 을 받아 카드 표시
//  - 사람: 즉시 /?v=<code> 로 리다이렉트되어 평소처럼 앱(매장 페이지)이 열림
//  - 오류: 어떤 경우에도 500 없이 폴백 메타 + 앱 리다이렉트 (사이트 영향 0)
// 이 경로(/s/...)는 "공유 링크" 전용이라 메인 앱과 완전히 격리되어 안전하다.
// ─────────────────────────────────────────────────────────────────────────────

const ORIGIN = 'https://nuriholdem.com';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
  let code = '';
  try {
    const u = new URL(req.url, ORIGIN);
    code = (u.searchParams.get('code') || '').slice(0, 16).replace(/[^a-zA-Z0-9-]/g, '');
  } catch { /* ignore */ }

  const appUrl = code ? `${ORIGIN}/?v=${encodeURIComponent(code)}` : ORIGIN;

  // 폴백(기본) 메타 — 매장을 못 찾거나 오류일 때
  let title = 'NURI HOLDEM | 홀덤펍 커뮤니티';
  let desc = '전국 홀덤 대회 일정 · 홀덤펍 커뮤니티 · 중고장터';
  let image = `${ORIGIN}/icon-512.png`;

  try {
    const SB = process.env.VITE_SUPABASE_URL;
    const KEY = process.env.VITE_SUPABASE_ANON_KEY;
    if (SB && KEY && code) {
      const r = await fetch(`${SB}/rest/v1/venues?select=id,name,region,description,image_url,slug&limit=2000`, {
        headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
      });
      if (r.ok) {
        const rows = await r.json();
        const lc = code.toLowerCase();
        // 커스텀 슬러그 정확 일치 우선 → 구형 8자리 id 프리픽스 폴백
        const v = Array.isArray(rows)
          ? (rows.find((x) => typeof x.slug === 'string' && x.slug.toLowerCase() === lc)
            ?? rows.find((x) => typeof x.id === 'string' && x.id.startsWith(code)))
          : null;
        if (v) {
          title = `${v.name}${v.region ? ` · ${v.region}` : ''} | 홀덤펍`;
          desc = (v.description && String(v.description).slice(0, 120)) || `${v.name} — 일정·예약·순위를 확인하세요`;
          if (v.image_url) image = v.image_url;
        }
      }
    }
  } catch { /* 폴백 메타 유지 */ }

  const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
    + `<title>${esc(title)}</title>`
    + `<meta name="description" content="${esc(desc)}"/>`
    + '<meta property="og:type" content="website"/>'
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
    + `매장 페이지로 이동합니다… <a style="color:#FFD100" href="${esc(appUrl)}">바로가기</a></body></html>`;

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=300, s-maxage=600');
  res.status(200).send(html);
}
