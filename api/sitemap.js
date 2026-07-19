// api/sitemap.js — sitemap.xml 동적 생성 (Vercel 서버리스 함수)
// 루트 + 모든 매장/그룹 페이지(slug 있으면 /s/<slug>, 없으면 /?v=<id>)를 나열한다.
// 매장이 새로 생겨도 자동 반영(캐시 1시간). 오류 시에도 루트만 담긴 sitemap 반환(500 없음).

const ORIGIN = 'https://nuriholdem.com';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${ORIGIN}/`, changefreq: 'daily', priority: '1.0', lastmod: today },
  ];

  try {
    const SB = process.env.VITE_SUPABASE_URL;
    const KEY = process.env.VITE_SUPABASE_ANON_KEY;
    if (SB && KEY) {
      // 공개 목록·정적 생성기(scripts/gen-sitemap.mjs)와 동일 필터: 승인(approved) + 활성(status=active) 매장만 노출
      const r = await fetch(`${SB}/rest/v1/venues?select=id,slug&approved=eq.true&status=eq.active&limit=2000`, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      });
      if (r.ok) {
        const venues = await r.json();
        for (const v of venues) {
          const loc = v.slug
            ? `${ORIGIN}/s/${encodeURIComponent(v.slug)}`
            : `${ORIGIN}/?v=${encodeURIComponent(String(v.id).slice(0, 8))}`;
          urls.push({ loc, changefreq: 'weekly', priority: '0.7' });
        }
      }
    }
  } catch { /* 폴백: 루트만 */ }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => [
      '  <url>',
      `    <loc>${esc(u.loc)}</loc>`,
      u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : '',
      `    <changefreq>${u.changefreq}</changefreq>`,
      `    <priority>${u.priority}</priority>`,
      '  </url>',
    ].filter(Boolean).join('\n')),
    '</urlset>',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
