// scripts/gen-legal.mjs — 약관 문서 4종을 정적 HTML(public/legal/*.html)로 발행한다.
//
// 왜 정적 생성인가: 네이버 로그인 등 외부 심사자가 JS 번들이 실패한 상황에서도 약관을 열 수 있어야 하고,
// 법적 문서는 크롤링·아카이빙이 되는 형태여야 한다(나중에 "그때 어떤 내용이었나"를 증명해야 할 수 있다).
//
// 왜 손으로 안 쓰는가: 정적 HTML 을 따로 쓰면 TSX 와 두 벌이 되고, 한쪽만 고치면
// "앱에서 동의한 내용 ≠ 공개된 내용" 이 된다. 그건 법적 사고다. 그래서 앱이 실제로 쓰는 바로 그
// React 컴포넌트를 Vite SSR 로 번들해 renderToStaticMarkup 으로 찍는다 — 텍스트 원본은 언제나 TSX 하나뿐.
//
// 실행: npm run build 체인 · 단독 `npm run legal`
//       `--check` : 파일을 쓰지 않고 커밋된 결과물과 비교, 다르면 exit 1
//                   (src/pages/legal/legalStaticConsistency.test.ts 가 이 모드를 게이트로 쓴다)
//
// gen-sitemap.mjs 와 달리 실패를 삼키지 않는다 — 조용히 실패하면 낡은 약관이 그대로 공개된 채 남기 때문.
// 네트워크를 타지 않는 결정적(deterministic) 생성이므로 실패는 곧 코드 문제다.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, 'public', 'legal');
const TMP_DIR = resolve(ROOT, 'node_modules', '.tmp', 'legal-ssr');
const SITE = 'https://nuriholdem.com';
const CHECK = process.argv.includes('--check');

// 공개 URL ↔ 컴포넌트 ↔ 동의 항목. 제목은 AuthModal 의 동의 체크박스 문구와 같은 뜻으로 맞춘다.
export const DOCS = [
  {
    slug: 'terms', export: 'terms',
    title: '서비스 이용약관',
    consent: '필수 동의',
    desc: 'NURI HOLDEM 서비스 이용약관 — 회원가입 시 필수 동의 항목입니다.',
  },
  {
    slug: 'privacy', export: 'privacy',
    title: '개인정보 수집·이용 동의',
    consent: '필수 동의',
    desc: 'NURI HOLDEM 개인정보처리방침 및 개인정보 수집·이용 동의 — 회원가입 시 필수 동의 항목입니다.',
  },
  {
    slug: 'anti-gambling', export: 'antiGambling',
    title: '불법 환전·사행성 행위 금지 서약',
    consent: '필수 동의',
    desc: 'NURI HOLDEM 사행성 배제 및 건전 이용 공지 — 회원가입 시 필수 동의 항목입니다.',
  },
  {
    slug: 'marketing', export: 'marketing',
    title: '마케팅 정보 수신 동의',
    consent: '선택 동의',
    desc: 'NURI HOLDEM 마케팅 정보 수신 동의 — 선택 항목이며 동의하지 않아도 서비스 이용에 제한이 없습니다.',
  },
];

// ── 1) 앱 컴포넌트를 SSR 번들로 만들어 그대로 렌더 ───────────────────────────
async function renderAll() {
  rmSync(TMP_DIR, { recursive: true, force: true });
  await build({
    configFile: false,
    logLevel: 'error',
    plugins: [react()],
    build: {
      ssr: 'scripts/legal-ssr-entry.tsx',
      outDir: TMP_DIR,
      emptyOutDir: true,
      minify: false,
      rollupOptions: {
        external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      },
    },
  });
  const entry = join(TMP_DIR, 'legal-ssr-entry.js');
  if (!existsSync(entry)) throw new Error('SSR 번들 산출물이 없다: ' + entry);
  const mod = await import(pathToFileURL(entry).href);
  const out = {};
  for (const d of DOCS) {
    const Comp = mod[d.export];
    if (typeof Comp !== 'function') throw new Error(d.slug + ": export '" + d.export + "' 를 찾을 수 없다");
    const html = renderToStaticMarkup(createElement(Comp));
    if (html.length < 500) throw new Error(d.slug + ': 렌더 결과가 비정상적으로 짧다(' + html.length + '자)');
    out[d.slug] = html;
  }
  return out;
}

// ── 2) Tailwind 유틸 클래스 → 정적 페이지용 의미 클래스 ──────────────────────
// 앱 토큰(text-ink-secondary 등)은 정적 페이지에 존재하지 않으므로 그대로 두면 무의미하다.
// 텍스트는 한 글자도 건드리지 않고 class 속성만 결정적으로 치환한다(강조·경고·박스만 남긴다).
function reclass(html) {
  return html.replace(/\sclass="([^"]*)"/g, (_m, cls) => {
    const out = [];
    if (/danger/.test(cls)) out.push('warn');
    if (/accent-/.test(cls)) out.push('hl');
    if (/font-bold|font-semibold/.test(cls)) out.push('b');
    if (/text-ink-muted/.test(cls)) out.push('mute');
    if (/text-center/.test(cls)) out.push('center');
    if (/overflow-x-auto/.test(cls)) out.push('scrollx');
    if (/rounded-input/.test(cls) && /(^|\s)(bg-|border)/.test(cls)) out.push('box');
    const uniq = [...new Set(out)];
    return uniq.length ? ' class="' + uniq.join(' ') + '"' : '';
  });
}

// ── 3) 사업자 정보는 손으로 다시 쓰지 않는다 ────────────────────────────────
// LegalNotice(사행성 공지)가 렌더한 '사업자 정보' 블록에서 값을 뽑아 4개 페이지 푸터에 재사용한다.
// 손으로 옮겨 적으면 그것 자체가 또 하나의 사본이 되어 언젠가 어긋난다. 못 찾으면 즉시 실패시킨다.
function extractBiz(noticeHtml) {
  const pick = (label) => {
    const re = new RegExp('>' + label + '</span><span[^>]*>([^<]+)</span>');
    const m = noticeHtml.match(re);
    if (!m) throw new Error("사업자 정보 '" + label + "' 를 LegalNotice 렌더 결과에서 찾지 못했다 — 마크업이 바뀌었는지 확인하라");
    return m[1].trim();
  };
  return {
    company: pick('상호'),
    ceo: pick('대표자'),
    bizNo: pick('사업자등록번호'),
    addr: pick('사업장 소재지'),
    phone: pick('유선번호'),
    email: pick('고객센터'),
  };
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// ── 4) 페이지 템플릿 (JS 0줄 · 외부 리소스 0개 · 다크/라이트 양쪽) ───────────
const CSS = [
  ":root{color-scheme:light dark;--bg:#FFFFFF;--panel:#F5F4F8;--line:#E2E0EA;--ink:#17151F;--sub:#3D3950;--mute:#6C6684;--accent:#6946C8;--danger:#B02A1E;--gold:#8A6D24}",
  "@media (prefers-color-scheme:dark){:root{--bg:#151221;--panel:#1D192E;--line:#2C2742;--ink:#F4F5F6;--sub:#CFCBDE;--mute:#948EB0;--accent:#A98BEC;--danger:#F1837A;--gold:#D9B25A}}",
  "*{box-sizing:border-box;margin:0}",
  "body{background:var(--bg);color:var(--ink);font-family:'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif;line-height:1.75;-webkit-text-size-adjust:100%}",
  ".wrap{max-width:760px;margin:0 auto;padding:40px 20px 72px}",
  ".brand{display:block;font-size:12px;font-weight:700;letter-spacing:.2em;color:var(--gold);text-decoration:none}",
  "h1{font-size:26px;letter-spacing:-.01em;margin-top:10px}",
  ".badge{display:inline-block;margin-top:10px;padding:3px 10px;border:1px solid var(--line);border-radius:999px;font-size:12px;color:var(--mute)}",
  ".badge.req{color:var(--danger);border-color:var(--danger)}",
  ".doc{margin-top:22px}",
  ".doc section{margin:0 0 26px}",
  ".doc h3{font-size:16px;margin:0 0 8px;color:var(--ink)}",
  ".doc p{color:var(--sub);font-size:15px;margin:0 0 8px}",
  ".doc ol,.doc ul{margin:0 0 8px;padding-left:0;list-style:none}",
  ".doc li{color:var(--sub);font-size:15px;margin:0 0 6px}",
  ".doc li.box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px}",
  // 원본은 flex+gap 으로 번호/불릿과 본문을 띄운다 — 클래스를 걷어냈으므로 간격을 여기서 되살린다.
  ".doc li > span:first-child{margin-right:.45em}",
  ".doc .box p{margin:0 0 3px}",
  ".doc .box p > span:first-child{margin-right:.45em}",
  ".doc > div > div:first-child{border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:20px}",
  ".doc div.box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:8px 0;font-size:14px;color:var(--sub)}",
  ".doc .mute{color:var(--mute)}",
  ".doc .b{font-weight:700;color:var(--ink)}",
  ".doc .hl{color:var(--accent)}",
  ".doc .warn{color:var(--danger)}",
  ".doc .center{text-align:center}",
  ".doc strong{color:var(--ink)}",
  ".doc .scrollx{overflow-x:auto;border:1px solid var(--line);border-radius:12px;margin:10px 0}",
  ".doc div.box.scrollx{padding:0;background:transparent}",
  ".doc table{width:100%;border-collapse:collapse;font-size:13px;min-width:520px}",
  ".doc th,.doc td{padding:9px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}",
  ".doc th{color:var(--ink);font-weight:600;background:var(--panel);white-space:nowrap}",
  ".doc td{color:var(--sub)}",
  ".doc tr:last-child td{border-bottom:0}",
  ".doc svg{vertical-align:-2px;margin-right:5px}",
  "nav.docs{margin-top:36px;border-top:1px solid var(--line);padding-top:18px;display:grid;gap:8px}",
  "nav.docs a{display:block;padding:11px 14px;border:1px solid var(--line);border-radius:12px;color:var(--sub);text-decoration:none;font-size:14px}",
  "nav.docs a[aria-current]{border-color:var(--accent);color:var(--accent)}",
  "nav.docs em{font-style:normal;color:var(--mute);font-size:12px}",
  "footer{margin-top:28px;border-top:1px solid var(--line);padding-top:16px;font-size:12.5px;color:var(--mute);line-height:1.9}",
  "footer b{color:var(--sub);font-weight:500}",
  "a{color:var(--accent)}",
].join('\n');

function page(doc, bodyHtml, biz) {
  const nav = DOCS.map((d) => (
    d.slug === doc.slug
      ? '      <a href="/legal/' + d.slug + '.html" aria-current="page">' + esc(d.title) + ' <em>(' + esc(d.consent) + ' · 현재 문서)</em></a>'
      : '      <a href="/legal/' + d.slug + '.html">' + esc(d.title) + ' <em>(' + esc(d.consent) + ')</em></a>'
  )).join('\n');

  return [
    '<!doctype html>',
    '<html lang="ko">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>' + esc(doc.title) + ' | NURI HOLDEM</title>',
    '  <meta name="description" content="' + esc(doc.desc) + '">',
    '  <meta name="robots" content="index, follow">',
    '  <link rel="canonical" href="' + SITE + '/legal/' + doc.slug + '.html">',
    '  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
    '  <meta property="og:type" content="article">',
    '  <meta property="og:title" content="' + esc(doc.title) + ' | NURI HOLDEM">',
    '  <meta property="og:description" content="' + esc(doc.desc) + '">',
    '  <meta property="og:url" content="' + SITE + '/legal/' + doc.slug + '.html">',
    '  <style>',
    CSS,
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="wrap">',
    '    <header>',
    '      <a class="brand" href="/">NURI HOLDEM</a>',
    '      <h1>' + esc(doc.title) + '</h1>',
    '      <span class="badge' + (doc.consent === '필수 동의' ? ' req' : '') + '">' + esc(doc.consent) + '</span>',
    '    </header>',
    '',
    '    <main class="doc">',
    bodyHtml,
    '    </main>',
    '',
    '    <nav class="docs" aria-label="약관 문서">',
    nav,
    '    </nav>',
    '',
    '    <footer>',
    '      <b>상호</b> ' + esc(biz.company) + ' · <b>대표자</b> ' + esc(biz.ceo) + ' · <b>사업자등록번호</b> ' + esc(biz.bizNo) + '<br>',
    '      <b>사업장 소재지</b> ' + esc(biz.addr) + '<br>',
    '      <b>전화번호</b> ' + esc(biz.phone) + ' · <b>고객센터</b> <a href="mailto:' + esc(biz.email) + '">' + esc(biz.email) + '</a><br>',
    '      만 19세 미만은 이용할 수 없습니다 · 도박문제 상담 1336(24시간·무료)<br>',
    '      © 2026 ' + esc(biz.company) + '. · <a href="/">nuriholdem.com 으로 이동</a>',
    '    </footer>',
    '  </div>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// ── 5) 실행 ─────────────────────────────────────────────────────────────────
const rendered = await renderAll();
const biz = extractBiz(rendered['anti-gambling']);

const files = new Map();
for (const doc of DOCS) {
  const body = reclass(rendered[doc.slug]).split('\n').map((l) => '      ' + l).join('\n');
  files.set(join(OUT_DIR, doc.slug + '.html'), page(doc, body, biz));
}

if (CHECK) {
  // 줄끝은 법적 텍스트가 아니다. core.autocrlf=true 인 Windows 에서 체크아웃하면 CRLF 로 바뀌므로
  // 정규화하고 비교한다 — 안 하면 "내용은 같은데 게이트가 빨간" 가짜 실패가 난다.
  const norm = (t) => t.split('\r\n').join('\n');
  const drift = [];
  for (const [path, want] of files) {
    const got = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (got === null) drift.push(path + ' — 파일 없음(빌드에서 생성되지 않았다)');
    else if (norm(got) !== norm(want)) drift.push(path + ' — 내용 불일치(TSX 원문이 바뀌었는데 재생성되지 않았다)');
  }
  if (drift.length) {
    console.error('[legal] 정적 약관이 TSX 원문과 어긋났다:\n  - ' + drift.join('\n  - '));
    console.error('[legal] 해결: `npm run legal` 로 재생성한 뒤 커밋하라.');
    // process.exit() 는 쓰지 않는다 — Windows 에서 소켓이 닫히는 중 호출하면 libuv assertion 으로
    // 크래시한다(gen-sitemap.mjs 에 같은 사고가 기록돼 있다). exitCode 만 세우고 자연 종료시킨다.
    process.exitCode = 1;
  } else {
    console.log('[legal] --check OK — ' + files.size + '개 문서가 TSX 원문과 일치한다');
  }
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [path, html] of files) writeFileSync(path, html, 'utf8');
  console.log('[legal] ' + files.size + '개 문서 생성 → public/legal/ (' + DOCS.map((d) => d.slug + '.html').join(', ') + ')');
}
rmSync(TMP_DIR, { recursive: true, force: true });
